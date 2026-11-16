export const MAIN_DESTINATIONS = [
  { label: "AI", href: "/ai", icon: "auto-awesome" },
  { label: "My Life", href: "/hub", icon: "grid-view" },
  { label: "My Relationship", href: "/connection", icon: "favorite-border" },
  { label: "My Work", href: "/work", icon: "work-outline" },
] as const;

export type MainDestination = typeof MAIN_DESTINATIONS[number]["href"];

function belongsTo(path: string, base: string) {
  return path === base || path.startsWith(`${base}/`);
}

export function destinationForPath(rawPath: string): MainDestination {
  const path = rawPath.split(/[?#]/, 1)[0];
  if (belongsTo(path, "/work") || belongsTo(path, "/receipts") || belongsTo(path, "/life/work")) return "/work";
  if (belongsTo(path, "/connection") || belongsTo(path, "/aevum") || belongsTo(path, "/us") || belongsTo(path, "/relationship")) return "/connection";
  if (["/ai", "/assistants", "/agent", "/metrics", "/life/connectors"].some((base) => belongsTo(path, base))) return "/ai";
  return "/hub";
}
