import { z } from "zod";
import {
  validWorkDate,
  validWorkTimezone,
  validateWorkInstant,
} from "./calendar";
import type { WorkEventInput } from "../../types/work";
const text = (max: number) => z.string().trim().max(max);
const reference = z.string().uuid().nullable();
export const workTaskSchema = z.object({
  title: text(200).min(1, "Enter a task title."),
  notes: text(2000),
  job_label: text(120),
  due_date: z
    .string()
    .refine(validWorkDate, "Use a real due date in YYYY-MM-DD format.")
    .nullable(),
  status: z.enum(["todo", "in_progress", "done"]),
});
export const workFileSchema = z.object({
  title: text(200),
  job_label: text(120),
  notes: text(2000),
  task_id: reference,
  event_id: reference,
});
const eventShape = z.object({
  title: text(200).min(1, "Enter an event title."),
  notes: text(2000),
  location: text(300),
  job_label: text(120),
  all_day: z.boolean(),
  start_date: z.string().nullable(),
  end_date: z.string().nullable(),
  starts_at: z.string().nullable(),
  ends_at: z.string().nullable(),
  timezone: text(100).refine(
    validWorkTimezone,
    "Choose a valid IANA timezone.",
  ),
  task_id: reference,
});
export function validateWorkEvent(value: unknown): WorkEventInput {
  const input = eventShape.parse(value);
  if (input.all_day) {
    if (
      !validWorkDate(input.start_date) ||
      !validWorkDate(input.end_date) ||
      input.end_date <= input.start_date
    ) {
      throw new Error(
        "All-day dates must be real YYYY-MM-DD days; the exclusive end must be after the start.",
      );
    }
    if (input.starts_at !== null || input.ends_at !== null)
      throw new Error("All-day events use dates, not timestamps.");
  } else {
    if (
      input.start_date !== null ||
      input.end_date !== null ||
      !input.starts_at ||
      !input.ends_at
    )
      throw new Error(
        "Timed events require start/end instants, not all-day dates.",
      );
    input.starts_at = validateWorkInstant(input.starts_at, input.timezone);
    input.ends_at = validateWorkInstant(input.ends_at, input.timezone);
    if (Date.parse(input.ends_at) <= Date.parse(input.starts_at))
      throw new Error("Event end must be after its start.");
  }
  return input;
}
export function workError(error: unknown): string {
  if (error instanceof z.ZodError)
    return error.issues[0]?.message ?? "Check the details.";
  if (error instanceof Error) return error.message;
  return "Work records could not be updated. Check the separately reviewed Work setup and try again.";
}
