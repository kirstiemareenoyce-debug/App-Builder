/** Keep quota errors actionable even if the server's wording changes. */
export function kairosAIErrorMessage(error: { code: string; message: string }): string {
  if (error.code === "DAILY_AI_LIMIT_REACHED") {
    return "You've reached your daily Kairos AI limit. Try again after 00:00 UTC. Your draft is still here; this message was not sent to an AI provider.";
  }
  return error.message;
}
