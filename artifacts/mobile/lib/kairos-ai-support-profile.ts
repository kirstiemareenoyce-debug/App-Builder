import { z } from "zod";
import type { RelationshipEntryInput } from "./relationship-hub";

export const SUPPORT_PROFILE_FIELDS = [
  { key: "feelings", label: "Feelings and reactions I notice", placeholder: "In my own words, this is how overwhelm can feel…" },
  { key: "triggers", label: "Triggers I identify for myself (optional)", placeholder: "Things I have noticed, not proven causes or someone else's diagnosis…" },
  { key: "support", label: "Support that helps / does not help", placeholder: "What feels supportive to me, and what I would prefer to avoid…" },
  { key: "boundaries", label: "My boundaries", placeholder: "What I am comfortable discussing and what I want to keep private…" },
  { key: "reconnect", label: "Pause and reconnect", placeholder: "How I might ask for a pause and suggest reconnecting, if safe…" },
] as const;
export type SupportProfileField = typeof SUPPORT_PROFILE_FIELDS[number]["key"];
export type SupportProfileDraft = Record<SupportProfileField, string>;
export const emptySupportProfile = (): SupportProfileDraft => ({ feelings: "", triggers: "", support: "", boundaries: "", reconnect: "" });
const field = z.string().trim().max(650, "Keep each section under 650 characters.");
export const supportProfileSchema = z.object({ feelings: field, triggers: field, support: field, boundaries: field, reconnect: field })
  .strict().refine((value) => Object.values(value).some(Boolean), "Write at least one section. You can leave any others blank.");

/** Deliberate self-written conversion only; no private answers or chat state inputs. */
export function supportProfileToArchive(draft: SupportProfileDraft, title: string): RelationshipEntryInput {
  const profile = supportProfileSchema.parse(draft);
  const cleanTitle = z.string().trim().min(1, "Add a title for the private entry.").max(120).parse(title);
  const body = ["My self-written support profile — self-report, not a diagnosis. Sharing is optional.", "",
    ...SUPPORT_PROFILE_FIELDS.flatMap((item) => profile[item.key] ? [item.label, profile[item.key], ""] : []),
    "This describes my current preferences; it is not permission to ignore boundaries or excuse harmful behaviour.",
  ].join("\n");
  return { category: "support_archive", title: cleanTitle, body, detail_url: "", event_date: "" };
}
export const SUPPORT_ARCHIVE_REVIEW_HREF = { pathname: "/aevum/entry", params: { category: "support_archive" } } as const;
