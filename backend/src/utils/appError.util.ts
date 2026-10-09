export class AppError extends Error {
  public readonly code: string;
  public readonly status: number;
  public readonly details?: unknown;

  constructor(message: string, status: number = 500, code: string = "INTERNAL_ERROR", details?: unknown) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
