type AuthSessionResult = { type: string; url?: string };

type OAuthSessionHandlers = {
  redirectInSameTab?: (url: string) => void;
  openAuthSession: (url: string, redirectTo: string) => Promise<AuthSessionResult>;
  completeCallback: (url: string) => Promise<unknown>;
};

/**
 * Web uses a full-page redirect: only the callback page exchanges the PKCE code.
 * Native keeps the system browser and shares the deduplicated callback handler
 * with Linking. Never let a popup opener and callback independently exchange it.
 */
export async function startOAuthSession(
  authorizationUrl: string,
  redirectTo: string,
  handlers: OAuthSessionHandlers,
): Promise<boolean> {
  if (handlers.redirectInSameTab) {
    handlers.redirectInSameTab(authorizationUrl);
    return false; // Navigation, not an authenticated session, has started.
  }

  const result = await handlers.openAuthSession(authorizationUrl, redirectTo);
  if (result.type !== "success") return false;
  if (!result.url) throw new Error("Sign-in returned without a callback URL. Please try again.");
  await handlers.completeCallback(result.url);
  return true;
}
