export function getAuthErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  const normalised = raw.toLowerCase();

  if (
    normalised.includes("failed to fetch") ||
    normalised.includes("network request failed") ||
    normalised.includes("dns") ||
    normalised.includes("enotfound") ||
    normalised.includes("fetch failed")
  ) {
    return "Kairos cannot reach its secure sign-in service right now. The Supabase project may be paused or temporarily unavailable. Restore the project or try again shortly.";
  }

  if (normalised.includes("invalid login credentials")) {
    return "Those sign-in details were not recognised. Check your email and password, or use Forgot password?.";
  }

  if (normalised.includes("email not confirmed")) {
    return "Please confirm your email address before signing in, then try again.";
  }

  return raw || "Authentication failed. Please try again.";
}
