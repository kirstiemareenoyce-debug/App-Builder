import { HttpError } from "./errors.ts";

export function getRequestId(request: Request): string {
  const supplied = request.headers.get("x-request-id")?.trim();
  return supplied && supplied.length <= 128 ? supplied : crypto.randomUUID();
}

/** Bounded streaming read, elapsed deadline, strict UTF-8 and JSON validation. */
export async function readJsonBounded(request: Request, maxBytes: number, timeoutMs = 10_000): Promise<unknown> {
  if (!(request.headers.get("content-type") ?? "").toLowerCase().includes("application/json")) {
    throw new HttpError(415, "VALIDATION_ERROR", "Content-Type must be application/json.");
  }
  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null) {
    const length = Number(declaredLength);
    if (!Number.isSafeInteger(length) || length < 0) {
      throw new HttpError(400, "VALIDATION_ERROR", "The content length is invalid.");
    }
    if (length > maxBytes) throw new HttpError(413, "PAYLOAD_TOO_LARGE", "The request body is too large.");
  }
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, "VALIDATION_ERROR", "The request body is empty.");
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  const deadline = Date.now() + timeoutMs;
  try {
    while (true) {
      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) throw new HttpError(408, "REQUEST_TIMEOUT", "The request body took too long to arrive.");
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const next = await Promise.race([
          reader.read(),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new HttpError(
              408, "REQUEST_TIMEOUT", "The request body took too long to arrive.",
            )), remainingMs);
          }),
        ]);
        if (next.done) break;
        totalBytes += next.value.byteLength;
        if (totalBytes > maxBytes) throw new HttpError(413, "PAYLOAD_TOO_LARGE", "The request body is too large.");
        chunks.push(next.value);
      } finally {
        if (timer !== undefined) clearTimeout(timer);
      }
    }
  } catch (error) {
    void reader.cancel().catch(() => undefined);
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, "VALIDATION_ERROR", "The request body could not be read.");
  }
  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
  } catch {
    throw new HttpError(400, "VALIDATION_ERROR", "The request body must contain valid UTF-8 JSON.");
  }
}
