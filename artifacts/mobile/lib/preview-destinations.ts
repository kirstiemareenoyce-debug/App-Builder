export const PREVIEW_DESTINATIONS = [
  "/hub", "/connection", "/work", "/ai", "/work/calendar", "/work/photos",
  "/assistants/kairos", "/assistants/aevum", "/assistants/evergreen",
  "/assistants/support-profile", "/life/connectors",
  "/individual", "/individual/questionnaire/gad7", "/individual/questionnaire/asrs6",
  "/individual/questionnaire/ipip50", "/individual/results", "/individual/profile",
] as const;

export function previewDestination(value: unknown): typeof PREVIEW_DESTINATIONS[number] {
  return typeof value === "string" && (PREVIEW_DESTINATIONS as readonly string[]).includes(value)
    ? value as typeof PREVIEW_DESTINATIONS[number]
    : "/ai";
}
