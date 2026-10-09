import { z } from "zod";

const BASE = "/api/v1";

type JsonEnvelope = {
  data?: unknown;
  meta?: unknown;
  error?: { message?: string };
};

export const PaginatedMetaSchema = z.object({
  requestId: z.string(),
  timestamp: z.string(),
  page: z.number(),
  pageSize: z.number(),
  total: z.number(),
  pageCount: z.number(),
});

export type PaginatedMeta = z.infer<typeof PaginatedMetaSchema>;

async function fetchApiJson(endpoint: string, options: RequestInit = {}): Promise<JsonEnvelope> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  // Ensure body is handled correctly if it's FormData
  if (options.body && options.body instanceof FormData) {
    delete headers["Content-Type"];
  }

  const fetchOptions: RequestInit = {
    ...options,
    headers,
    credentials: "include",
  };

  const url = `${BASE}${endpoint}`;

  const response = await fetch(url, fetchOptions);

  // Session expired or signed out: bounce to login instead of failing silently.
  // Skip the redirect for auth endpoints themselves (login attempts) and when
  // already on the login page to avoid redirect loops.
  if (
    response.status === 401 &&
    !endpoint.startsWith("/auth/") &&
    typeof window !== "undefined" &&
    !window.location.pathname.startsWith("/login")
  ) {
    window.location.href = "/login";
    throw new Error("Session expired. Redirecting to login...");
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    const text = await response.text().catch(() => "");
    throw new Error(text || `Server returned ${response.status} ${response.statusText}`);
  }

  const json = (await response.json()) as JsonEnvelope;

  if (!response.ok) {
    throw new Error(json.error?.message || (json as any).error || response.statusText || `Request failed (${response.status})`);
  }

  // If the backend wraps the response in { data, meta }
  if (json && typeof json === 'object' && 'data' in json && 'meta' in json) {
    return json;
  }

  // Legacy format (fallback) where backend just returns the data directly
  return { data: json };
}

function validateOrThrow<T>(schema: z.ZodSchema<T>, data: unknown, context: string): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    console.warn(`[API] Response validation failed for ${context}:`, issues);
    throw new Error(`Invalid response from server (${context}): ${issues}`);
  }
  return result.data;
}

export async function apiRequest<T>(endpoint: string, options: RequestInit = {}, schema?: z.ZodSchema<T>): Promise<T> {
  const json = await fetchApiJson(endpoint, options);
  if (json.data === undefined) {
    throw new Error("Malformed response: missing data");
  }
  if (schema) {
    return validateOrThrow(schema, json.data, endpoint);
  }
  return json.data as T;
}

/** GET endpoints that return `{ data: T[], meta: { page, pageSize, total, ... } }`. */
export async function apiGetPaginated<T>(path: string, itemSchema?: z.ZodSchema<T>): Promise<{ items: T[]; meta: PaginatedMeta }> {
  const json = await fetchApiJson(path, { method: "GET" });
  if (!Array.isArray(json.data)) {
    throw new Error("Malformed response: expected array data");
  }
  if (json.meta == null || typeof json.meta !== "object") {
    throw new Error("Malformed response: missing pagination meta");
  }

  const meta = validateOrThrow(PaginatedMetaSchema, json.meta, `${path}/meta`);

  let items: T[];
  if (itemSchema) {
    const arrSchema = z.array(itemSchema);
    items = validateOrThrow(arrSchema, json.data, `${path}/items`);
  } else {
    items = json.data as T[];
  }

  return { items, meta };
}

const MAX_PAGE_SIZE = 100;

export async function fetchAllPages<T>(basePath: string, extraParams?: Record<string, string>): Promise<T[]> {
  const allItems: T[] = [];
  let page = 1;
  let pageCount = 1;

  while (page <= pageCount) {
    const params = new URLSearchParams(extraParams);
    params.set("page", String(page));
    params.set("pageSize", String(MAX_PAGE_SIZE));
    const { items, meta } = await apiGetPaginated<T>(`${basePath}?${params.toString()}`);
    allItems.push(...items);
    pageCount = meta.pageCount;
    page++;
  }

  return allItems;
}

export async function apiGet<T = unknown>(path: string, schema?: z.ZodSchema<T>) {
  return apiRequest<T>(path, { method: "GET" }, schema);
}

export async function apiPut<T = unknown, B = unknown>(path: string, body: B, schema?: z.ZodSchema<T>) {
  return apiRequest<T>(path, { method: "PUT", body: body instanceof FormData ? body : JSON.stringify(body) }, schema);
}

export async function apiPost<T = unknown, B = unknown>(path: string, body: B, schema?: z.ZodSchema<T>) {
  return apiRequest<T>(path, { method: "POST", body: body instanceof FormData ? body : JSON.stringify(body) }, schema);
}

export async function apiPatch<T = unknown, B = unknown>(path: string, body: B, schema?: z.ZodSchema<T>) {
  return apiRequest<T>(path, { method: "PATCH", body: body instanceof FormData ? body : JSON.stringify(body) }, schema);
}

export async function apiDelete<T = void>(path: string, schema?: z.ZodSchema<T>) {
  return apiRequest<T>(path, { method: "DELETE" }, schema);
}

