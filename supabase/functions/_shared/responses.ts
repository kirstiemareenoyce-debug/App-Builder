import { corsHeaders } from "./cors.ts";
import { HttpError, normaliseError } from "./errors.ts";

function responseHeaders(request?: Request): Headers {
  const headers = new Headers(corsHeaders(request));
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  return headers;
}

export function successResponse<T>(request: Request, data: T): Response {
  return new Response(JSON.stringify({ success: true, data }), {
    status: 200, headers: responseHeaders(request),
  });
}

export function errorResponse(request: Request, error: unknown, requestId: string): Response {
  const normalised = normaliseError(error);
  return new Response(JSON.stringify({
    success: false,
    error: {
      code: normalised.code,
      message: normalised.message,
      ...(normalised.status < 500 && normalised.details !== undefined ? { details: normalised.details } : {}),
      request_id: requestId,
    },
  }), { status: normalised.status, headers: responseHeaders(request) });
}

export function methodNotAllowed(request: Request, allowed: string[], requestId: string): Response {
  return errorResponse(request, new HttpError(
    405, "METHOD_NOT_ALLOWED", `Use ${allowed.join(" or ")} for this endpoint.`,
  ), requestId);
}
