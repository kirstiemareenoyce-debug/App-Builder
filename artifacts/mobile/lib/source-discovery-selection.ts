import type { SourceCandidate } from "@/lib/source-discovery";

export type SelectedDiscoverySource = SourceCandidate & { origin: "candidate" | "manual" };
export const MAX_SELECTED_SOURCES = 3;

export function isSafeManualHttpsUrl(raw: string): boolean {
  if (raw.length < 10 || raw.length > 2048 || raw.trim() !== raw) return false;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && !url.username && !url.password && !url.port;
  } catch {
    return false;
  }
}

export function addSelectedSource(current: readonly SelectedDiscoverySource[], source: SelectedDiscoverySource): SelectedDiscoverySource[] {
  if (current.some((item) => item.url === source.url)) return [...current];
  if (current.length >= MAX_SELECTED_SOURCES) return [...current];
  return [...current, source];
}

export function removeSelectedSource(current: readonly SelectedDiscoverySource[], url: string): SelectedDiscoverySource[] {
  return current.filter((item) => item.url !== url);
}
