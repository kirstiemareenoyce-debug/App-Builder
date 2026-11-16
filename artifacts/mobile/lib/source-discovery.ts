import { z } from "zod";

export const SOURCE_DISCOVERY_GOAL_MIN = 3;
export const SOURCE_DISCOVERY_GOAL_MAX = 600;
export const SOURCE_DISCOVERY_MAX_CANDIDATES = 3;

export type DiscoveryScope = "evergreen" | "aevum";
export type ApprovedSourceHost = { host: string; pathPrefix: string; includeSubdomains: true };
export type SourceCandidate = {
  url: string;
  title: string;
  label: "Not read or fact-verified";
};

export const sourceDiscoveryInputSchema = z
  .object({
    goal: z.string().trim().min(SOURCE_DISCOVERY_GOAL_MIN).max(SOURCE_DISCOVERY_GOAL_MAX),
    scope: z.enum(["evergreen", "aevum"]),
  })
  .strict();

export function validateSourceDiscoveryInput(input: unknown) {
  return sourceDiscoveryInputSchema.parse(input);
}

export function sanitizeSourceTitle(value: unknown): string {
  if (typeof value !== "string") return "Untitled source";
  const clean = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return clean.slice(0, 200) || "Untitled source";
}

function pathPrefixMatches(pathname: string, pathPrefix: string): boolean {
  if (!pathPrefix.startsWith("/") || pathPrefix.startsWith("//") || /[?#\\\u0000-\u001f\u007f]/.test(pathPrefix)) return false;
  const prefix = pathPrefix === "/" ? "/" : pathPrefix.replace(/\/+$/, "");
  return prefix === "/" || pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isApprovedSourceUrl(value: unknown, approved: readonly ApprovedSourceHost[]): value is string {
  if (typeof value !== "string" || value.length > 2048) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port) return false;
    const host = url.hostname.toLowerCase().replace(/\.$/, "");
    return approved.some((entry) => {
      const configuredHost = entry.host.toLowerCase().replace(/\.$/, "");
      const hostAllowed = host === configuredHost ||
        (entry.includeSubdomains === true && host.endsWith(`.${configuredHost}`));
      return hostAllowed && pathPrefixMatches(url.pathname, entry.pathPrefix);
    });
  } catch {
    return false;
  }
}

type SearchRegistrySource = { url?: unknown; title?: unknown };
type SearchOutputItem = { type?: unknown; status?: unknown; action?: { sources?: unknown } };

/** Extract only completed search tool source registries; never parse links from assistant prose. */
export function parseCompletedSearchSources(
  response: unknown,
  approved: readonly ApprovedSourceHost[],
): SourceCandidate[] {
  const output = response && typeof response === "object" && "output" in response
    ? (response as { output?: unknown }).output
    : undefined;
  if (!Array.isArray(output)) return [];
  const seen = new Set<string>();
  const candidates: SourceCandidate[] = [];
  for (const item of output as SearchOutputItem[]) {
    if (item?.type !== "web_search_call" || item.status !== "completed") continue;
    const sources = item.action?.sources;
    if (!Array.isArray(sources)) continue;
    for (const source of sources as SearchRegistrySource[]) {
      if (!isApprovedSourceUrl(source?.url, approved)) continue;
      const url = source.url as string;
      if (seen.has(url)) continue;
      seen.add(url);
      candidates.push({ url, title: sanitizeSourceTitle(source.title), label: "Not read or fact-verified" });
      if (candidates.length >= SOURCE_DISCOVERY_MAX_CANDIDATES) return candidates;
    }
  }
  return candidates;
}

export type DiscoveryRequestKey = {
  accountId: string;
  scope: DiscoveryScope;
  requestKey: string;
  goal: string;
};

/** A volatile UI-only guard; the server alone computes the cryptographic goal hash. */
export function isCurrentDiscoveryResult(
  result: DiscoveryRequestKey,
  current: DiscoveryRequestKey,
): boolean {
  return result.requestKey === current.requestKey && result.goal.trim() === current.goal.trim() &&
    result.accountId === current.accountId && result.scope === current.scope;
}
