const ALLOWED_HEADERS = "authorization, x-client-info, apikey, content-type, x-request-id";
const ALLOWED_METHODS = "POST, OPTIONS";

function origins(): string[] {
  return (Deno.env.get("ALLOWED_ORIGINS") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
}

export function corsHeaders(request?: Request): HeadersInit {
  const configured = origins();
  const origin = request?.headers.get("origin");
  const allowed = configured.includes("*") ? "*" : origin && configured.includes(origin) ? origin : null;
  return {
    ...(allowed ? { "Access-Control-Allow-Origin": allowed } : {}),
    "Access-Control-Allow-Headers": ALLOWED_HEADERS,
    "Access-Control-Allow-Methods": ALLOWED_METHODS,
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

/** Browser origins are explicitly allowed; native clients have no Origin. */
export function handlePreflight(request: Request): Response | null {
  const origin = request.headers.get("origin");
  const configured = origins();
  if (origin && !configured.includes("*") && !configured.includes(origin)) {
    return new Response(JSON.stringify({
      success: false, error: { code: "FORBIDDEN", message: "This browser origin is not allowed." },
    }), {
      status: 403,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store", Vary: "Origin" },
    });
  }
  return request.method === "OPTIONS"
    ? new Response(null, { status: 204, headers: corsHeaders(request) })
    : null;
}
