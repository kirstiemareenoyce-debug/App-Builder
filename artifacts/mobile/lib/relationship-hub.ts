import { z } from "zod";

export const RELATIONSHIP_MODULES = [
  { key: "emotional_weather", title: "Emotional Weather", subtitle: "How is the air between you?", icon: "wb-sunny", prompt: "Describe how things feel between you today and one thing that would help." },
  { key: "weekly_reflection", title: "Weekly Reflection", subtitle: "Check in with your connection", icon: "edit-note", prompt: "What helped us connect this week? What could we try differently next week?" },
  { key: "unsent_thoughts", title: "Unsent Thoughts", subtitle: "Things you are not ready to say", icon: "cloud", prompt: "Write what you are not ready to say. Nothing is sent automatically." },
  { key: "future_letters", title: "Future Letters", subtitle: "Messages for later", icon: "mail-outline", prompt: "Write a letter for a future moment. A date is a reminder for you, not a scheduled send." },
  { key: "memory_map", title: "Memory Map", subtitle: "Places that hold meaning", icon: "place", prompt: "Name a meaningful place and describe why it matters to you. Add a map link if you like." },
  { key: "soundtrack", title: "Our Soundtrack", subtitle: "Songs that are ours", icon: "music-note", prompt: "Name a song and what it brings back. Optionally add its streaming link." },
  { key: "argument_analysis", title: "Argument Analysis", subtitle: "Understand what happened", icon: "local-fire-department", prompt: "Describe the facts, your feelings, and what you need next. Avoid assigning motives or diagnoses. If you feel unsafe, seek support rather than sharing this entry." },
  { key: "energy_matching", title: "Energy Matching", subtitle: "Where are you both at?", icon: "bolt", prompt: "How is your energy and social battery right now? What can you offer and what do you need? Your partner can add their own check-in." },
  { key: "love_acts", title: "Love Acts", subtitle: "Small things that matter", icon: "favorite", prompt: "What small act of care meant something to you, or would you like to offer?" },
  { key: "shared_routines", title: "Shared Routines", subtitle: "Things you do together", icon: "repeat", prompt: "Describe a routine to try together, including when and what each person agrees to." },
  { key: "support_archive", title: "Support Archive", subtitle: "How they have shown up", icon: "handshake", prompt: "Recall a time you felt supported and explain what made it meaningful." },
  { key: "really_meant", title: "What I Really Meant", subtitle: "Repair what came out wrong", icon: "record-voice-over", prompt: "What did you say? What did you mean? Write a kinder version and what you want to take responsibility for." },
  { key: "shared_memories", title: "Shared Memories", subtitle: "Moments worth keeping", icon: "photo-camera", prompt: "Describe a moment worth keeping, with a date or link if helpful." },
  { key: "relationship_goals", title: "Relationship Goals", subtitle: "What you are building toward", icon: "flag", prompt: "Name one shared goal, why it matters, and a small next step to discuss together." },
  { key: "date_ideas", title: "Date Ideas", subtitle: "Things to do together", icon: "star-outline", prompt: "Suggest a date idea, with a budget, timing and energy level that works for both of you." },
] as const;
export type RelationshipCategory = typeof RELATIONSHIP_MODULES[number]["key"];
export type RelationshipEntry = {
  id: string; user_id: string; category: RelationshipCategory; title: string; body: string;
  detail_url: string | null; event_date: string | null; created_at: string; updated_at: string;
};
export type RelationshipShare = Omit<RelationshipEntry, "user_id" | "created_at" | "updated_at"> & {
  entry_id: string; owner_id: string; recipient_id: string; connection_id: string; shared_at: string;
};
export const relationshipEntrySchema = z.object({
  category: z.enum(RELATIONSHIP_MODULES.map((item) => item.key) as [RelationshipCategory, ...RelationshipCategory[]]),
  title: z.string().trim().min(1, "Add a title.").max(120),
  body: z.string().trim().min(1, "Write something before saving.").max(4000),
  detail_url: z.string().trim().max(1000).refine((value) => { if (!value) return true; try { const u = new URL(value); return u.protocol === "https:" && !u.username && !u.password; } catch { return false; } }, "Use a valid HTTPS link without credentials.").transform((value) => value || null),
  event_date: z.string().trim().refine((value) => { if (!value) return true; try { return /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(value).toISOString().slice(0, 10) === value; } catch { return false; } }, "Use a real date in YYYY-MM-DD format.").transform((value) => value || null),
});
export type RelationshipEntryInput = z.input<typeof relationshipEntrySchema>;

/** Manual sharing payload deliberately excludes private IDs, profile data and assessment answers. */
export function relationshipShareText(entry: Pick<RelationshipEntry, "category" | "title" | "body" | "detail_url" | "event_date">, now = new Date()): string {
  const module = RELATIONSHIP_MODULES.find((item) => item.key === entry.category);
  if (!module) throw new Error("Choose a relationship option.");
  return ["KAIROS / AEVUM", module.title, `Shared: ${now.toISOString()} (UTC)`, "", entry.title, "", entry.body,
    ...(entry.event_date ? ["", `Date: ${entry.event_date}`] : []), ...(entry.detail_url ? ["", entry.detail_url] : []),
    "", "Shared by choice. Please keep this personal message private."].join("\n");
}
