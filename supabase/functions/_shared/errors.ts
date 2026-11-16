export type ErrorCode =
  | "AUTH_REQUIRED" | "FORBIDDEN" | "METHOD_NOT_ALLOWED" | "VALIDATION_ERROR"
  | "NOT_FOUND" | "CONFLICT" | "AI_UNAVAILABLE" | "DEPENDENCY_ERROR"
  | "PAYLOAD_TOO_LARGE" | "REQUEST_TIMEOUT" | "CONFIGURATION_ERROR" | "INTERNAL_ERROR";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export function normaliseError(error: unknown): HttpError {
  if (error instanceof HttpError) return error;
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = String((error as { code: unknown }).code);
    if (code === "23505") return new HttpError(409, "CONFLICT", "The resource already exists.");
    if (code === "P0002") return new HttpError(404, "NOT_FOUND", "The resource was not found.");
  }
  return new HttpError(500, "INTERNAL_ERROR", "An unexpected server error occurred.");
}
