export type RecoveryPasswordTarget = Readonly<{ userId: string; accessToken: string }>;
export type RecoveryPasswordResult = {
  data: { user: { id: string } | null };
  error: { code?: string; status?: number } | null;
};
export type RecoveryPasswordWriter = (
  target: RecoveryPasswordTarget,
  attributes: { password: string },
) => Promise<RecoveryPasswordResult>;

const SAFE_ERROR_CODES = new Set([
  "weak_password", "same_password", "session_not_found", "refresh_token_not_found",
  "refresh_token_already_used",
]);

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function failure(code?: string, status?: number): RecoveryPasswordResult {
  return { data: { user: null }, error: { code, status } };
}

/**
 * Supabase Auth's public PUT /auth/v1/user route, independent of auth storage,
 * SDK locks, refreshes, and global Authorization defaults. Configuration is the
 * same public project URL/anonymous key used to create the application's client.
 * Never pass the SDK's session-aware fetch wrapper as the fetch implementation.
 */
export function createRecoveryPasswordTransport(
  config: { url: string; anonKey: string | undefined },
  fetcher: typeof fetch = (...args) => fetch(...args),
): RecoveryPasswordWriter {
  const { url, anonKey } = config;
  const base = new URL(url.endsWith("/") ? url : `${url}/`);
  if (!anonKey?.trim() || !["https:", "http:"].includes(base.protocol) ||
      base.username || base.password || base.search || base.hash) {
    throw new Error("Supabase configuration is unavailable.");
  }
  const endpoint = new URL("auth/v1/user", base).toString();

  return async (target, attributes) => {
    // Copy before any await: even a caller's later mutation cannot retarget this PUT.
    const { userId, accessToken } = target;
    if (!userId || !accessToken || /\s/.test(accessToken)) return failure("recovery_user_mismatch");
    try {
      const response = await fetcher(endpoint, {
        method: "PUT",
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json;charset=UTF-8",
          "X-Supabase-Api-Version": "2024-01-01",
        },
        body: JSON.stringify({ password: attributes.password }),
        // Do not send cookies, cache password responses, or follow credential-bearing redirects.
        credentials: "omit",
        cache: "no-store",
        redirect: "error",
      });
      // A redirect must never be mistaken for a successful password update.
      if (response.redirected) return failure("recovery_user_mismatch");
      let payload: unknown;
      try { payload = await response.json(); }
      catch {
        return response.ok ? failure("recovery_user_mismatch") : failure(undefined, response.status);
      }
      if (!response.ok) {
        const code = record(payload) ? payload.code ?? payload.error_code : undefined;
        // Raw server messages, bodies, tokens and weak-password details never escape.
        return failure(typeof code === "string" && SAFE_ERROR_CODES.has(code) ? code : undefined, response.status);
      }
      const responseUser = record(payload) && "user" in payload ? payload.user : payload;
      if (!record(responseUser) || responseUser.id !== userId) return failure("recovery_user_mismatch");
      return { data: { user: { id: userId } }, error: null };
    } catch {
      // Network errors are retryable, but must not expose request/credential details.
      return failure();
    }
  };
}
