import { AppError } from "./appError.util.js";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "../config/constants.config.js";

export type SortParam = { field: string; direction: "asc" | "desc" };

export type Paginated<T> = Omit<T, "sort"> & { sort?: SortParam };

/**
 * Extracts pagination/sort from an already-validated query object.
 *
 * The query MUST have been pre-validated by `validateQuery()` middleware
 * before reaching the controller — that is where type coercion (string → number)
 * and range checks happen. This function only parses the `sort` string into a
 * typed `SortParam` and passes all other fields through unchanged.
 */
export function parseQueryPagination<T extends Record<string, unknown>>(rawQuery: T, allowedSort: readonly string[]): Paginated<T> {
  const { sort: rawSort, page: rawPage, pageSize: rawPageSize, ...rest } = rawQuery;

  const parsedPage = Number(rawPage);
  const page = !isNaN(parsedPage) && parsedPage > 0 ? parsedPage : 1;

  const parsedPageSize = Number(rawPageSize);
  const pageSize = !isNaN(parsedPageSize) && parsedPageSize > 0 ? Math.min(parsedPageSize, MAX_PAGE_SIZE) : DEFAULT_PAGE_SIZE;

  let sort: SortParam | undefined;
  if (typeof rawSort === "string" && rawSort !== "") {
    const colonIdx = rawSort.indexOf(":");
    const field = colonIdx === -1 ? rawSort : rawSort.slice(0, colonIdx);
    const dir = colonIdx === -1 ? "asc" : rawSort.slice(colonIdx + 1);

    if (!allowedSort.includes(field)) {
      throw new AppError(`Invalid sort field "${field}". Allowed: ${allowedSort.join(", ")}`, 400, "VALIDATION_ERROR");
    }

    sort = { field, direction: dir === "desc" ? "desc" : "asc" };
    return { ...rest, page, pageSize, sort } as unknown as Paginated<T>;
  }

  return { ...rest, page, pageSize } as unknown as Paginated<T>;
}

/** Converts page + pageSize into Prisma-compatible skip/take. */
export function toSkipTake(page: number, pageSize: number) {
  return {
    skip: (page - 1) * pageSize,
    take: pageSize,
  };
}
