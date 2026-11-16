export type WorkTaskInput = {
  title: string;
  notes: string;
  job_label: string;
  due_date: string | null;
  status: "todo" | "in_progress" | "done";
};
export type WorkTask = WorkTaskInput & {
  id: string;
  user_id: string;
  created_at: string;
  updated_at: string;
};
export type WorkEventInput = {
  title: string;
  notes: string;
  location: string;
  job_label: string;
  all_day: boolean;
  start_date: string | null;
  end_date: string | null;
  starts_at: string | null;
  ends_at: string | null;
  timezone: string;
  task_id: string | null;
};
/** All-day end_date is EXCLUSIVE, as in calendar APIs; timed values are ISO instants. */
export type WorkEvent = WorkEventInput & {
  id: string;
  user_id: string;
  created_at: string;
  updated_at: string;
};
export type WorkFileInput = {
  title: string;
  job_label: string;
  notes: string;
  task_id: string | null;
  event_id: string | null;
};
export type WorkMime =
  | "image/jpeg"
  | "image/png"
  | "image/webp"
  | "application/pdf";
export type WorkFile = WorkFileInput & {
  id: string;
  user_id: string;
  object_path: string;
  original_name: string;
  mime_type: WorkMime;
  size_bytes: number;
  created_at: string;
};
export type SelectedWorkFile = {
  uri: string;
  name: string;
  mimeType: string | null;
  size: number | null;
};
export type PreviewWorkFile = WorkFile & { preview_uri: string };
export const workKeys = {
  tasks: (owner: string) => ["work-tasks", owner] as const,
  files: (owner: string) => ["work-files", owner] as const,
  events: (owner: string) => ["work-events", owner] as const,
};
