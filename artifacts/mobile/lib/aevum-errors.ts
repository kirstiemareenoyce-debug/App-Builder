export function getAevumErrorMessage(error: unknown): string {
  const e = error && typeof error === "object" ? error as { code?: string; status?: number; message?: string } : {};
  const message = e.message ?? (typeof error === "string" ? error : "");
  if (message.includes("assessment consent")) return "Read and confirm assessment consent before saving your private reflection.";
  if (message.includes("partner sharing consent")) return "Confirm partner-sharing consent before publishing this entry.";
  if (/entry changed since review/i.test(message)) return "This entry changed on another device. Refresh your entries and review the current version before sharing.";
  if (e.code === "42P01" || e.code === "PGRST202" || e.code === "PGRST205" || /schema cache|does not exist/i.test(message)) return "Aevum's database update has not been installed yet. Your text is still on this screen; please leave it here and try again after the backend is updated.";
  if (e.status === 401 || e.code === "PGRST301" || /jwt|expired|not authenticated/i.test(message)) return "Your sign-in has expired. Keep your text on this screen and sign in again before saving.";
  if (/fetch|network|dns|unavailable/i.test(message)) return "Kairos cannot reach Aevum right now. Your text has not been saved to the cloud; keep this screen open and retry when the connection returns.";
  if (e.code === "42501") return "This action is not allowed. Check your consent and accepted partner connection, then retry.";
  // Do not display arbitrary DB errors, identifiers or request details to users.
  if (error instanceof Error && !e.code && message && !/sql|postgres|relation/i.test(message)) return message;
  return "Your changes were not saved. Your text remains here; please try again.";
}
