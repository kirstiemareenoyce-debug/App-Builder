const OAUTH_TOKEN_PARAMS = [
  "access_token",
  "refresh_token",
  "provider_token",
  "provider_refresh_token",
] as const;

export type OAuthCallbackResult = {
  code: string | null;
  error: string | null;
  errorDescription: string | null;
  hasTokenFragment: boolean;
};

export function parseOAuthCallback(url: string): OAuthCallbackResult {
  const parsed = new URL(url);
  const query = new URLSearchParams(parsed.search);
  const fragment = new URLSearchParams(parsed.hash.replace(/^#/, ""));
  const get = (name: string) => query.get(name) ?? fragment.get(name);

  return {
    code: get("code"),
    error: get("error"),
    errorDescription: get("error_description"),
    hasTokenFragment: OAUTH_TOKEN_PARAMS.some(
      (name) => query.has(name) || fragment.has(name),
    ),
  };
}

export function requirePkceCode(url: string): string {
  const result = parseOAuthCallback(url);
  if (result.error) {
    throw new Error(result.errorDescription ?? result.error);
  }
  if (result.hasTokenFragment) {
    throw new Error(
      "The sign-in provider returned tokens directly. Restart sign-in to use the secure PKCE flow.",
    );
  }
  if (!result.code) {
    throw new Error("The sign-in redirect did not include a PKCE authorization code.");
  }
  return result.code;
}
