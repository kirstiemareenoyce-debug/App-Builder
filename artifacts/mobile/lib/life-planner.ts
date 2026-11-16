import { taskEntrySchema } from "./frontend-validation";
import type { TablesInsert } from "../types/database";

export const LIFE_PLAN_AREAS = ["work", "relationship", "personal"] as const;
export type LifePlanArea = (typeof LIFE_PLAN_AREAS)[number];

export type LifePlanDraft = {
  title: string;
  description: string;
  area: LifePlanArea;
  dueDate: Date | null;
};

function localDateString(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Validate and turn one user-authored next step into an ordinary private task. */
export function buildLifePlanTask(draft: LifePlanDraft): Omit<TablesInsert<"tasks">, "user_id"> {
  if (!LIFE_PLAN_AREAS.includes(draft.area)) throw new Error("Choose work, relationship, or personal.");
  const parsed = taskEntrySchema.safeParse({
    title: draft.title,
    description: draft.description,
    priority: "medium",
    status: "todo",
    dueDate: draft.dueDate,
    tags: ["life-plan", draft.area],
  });
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Check the next-step fields.");

  return {
    title: parsed.data.title,
    description: parsed.data.description || null,
    priority: parsed.data.priority,
    status: parsed.data.status,
    due_date: parsed.data.dueDate ? localDateString(parsed.data.dueDate) : null,
    tags: parsed.data.tags,
    completed_at: null,
  };
}
