import type { SupabaseClient } from "@supabase/supabase-js";
import { getOptionalSupabaseClient } from "../supabase";
import type {
  WorkEvent,
  WorkEventInput,
  WorkFile,
  WorkFileInput,
  WorkTask,
  WorkTaskInput,
} from "../../types/work";
type Table<Row, Insert, Update> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};
type WorkDatabase = {
  public: {
    Tables: {
      work_tasks: Table<
        WorkTask,
        WorkTaskInput & { user_id: string },
        Partial<WorkTaskInput>
      >;
      work_events: Table<
        WorkEvent,
        WorkEventInput & { user_id: string },
        Partial<WorkEventInput>
      >;
      work_files: Table<
        WorkFile,
        WorkFileInput &
          Pick<
            WorkFile,
            | "user_id"
            | "object_path"
            | "original_name"
            | "mime_type"
            | "size_bytes"
          >,
        Partial<WorkFileInput>
      >;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
/** Reuse the one existing authenticated client; never create another auth/storage lifecycle. */
export function getWorkClient(): SupabaseClient<WorkDatabase> {
  const client = getOptionalSupabaseClient();
  if (!client)
    throw new Error(
      "Supabase configuration is unavailable. Work cloud setup has not been verified.",
    );
  return client as unknown as SupabaseClient<WorkDatabase>;
}
export const TASK_COLUMNS =
  "id,user_id,title,notes,job_label,due_date,status,created_at,updated_at";
export const EVENT_COLUMNS =
  "id,user_id,title,notes,location,job_label,all_day,start_date,end_date,starts_at,ends_at,timezone,task_id,created_at,updated_at";
export const FILE_COLUMNS =
  "id,user_id,title,job_label,notes,task_id,event_id,object_path,original_name,mime_type,size_bytes,created_at";
