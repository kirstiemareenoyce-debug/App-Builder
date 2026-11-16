import { create } from "zustand";
import type { PreviewWorkFile, WorkEvent, WorkTask } from "../types/work";
let epoch = 0;
let identity: string | null = null;
const empty = () => ({
  tasks: [] as WorkTask[],
  events: [] as WorkEvent[],
  files: [] as PreviewWorkFile[],
});
/** No persistence middleware: no invented jobs, events, uploads or cross-domain records. */
export const useWorkPreviewStore = create<
  ReturnType<typeof empty> & {
    saveTask: (task: WorkTask) => void;
    deleteTask: (id: string) => void;
    saveEvent: (event: WorkEvent) => void;
    deleteEvent: (id: string) => void;
    saveFile: (file: PreviewWorkFile) => void;
    deleteFile: (id: string) => void;
  }
>((set) => ({
  ...empty(),
  saveTask: (task) =>
    set((s) => ({ tasks: [task, ...s.tasks.filter((r) => r.id !== task.id)] })),
  deleteTask: (id) =>
    set((s) => ({
      tasks: s.tasks.filter((r) => r.id !== id),
      events: s.events.map((e) =>
        e.task_id === id ? { ...e, task_id: null } : e,
      ),
      files: s.files.map((f) =>
        f.task_id === id ? { ...f, task_id: null } : f,
      ),
    })),
  saveEvent: (event) =>
    set((s) => ({
      events: [event, ...s.events.filter((r) => r.id !== event.id)],
    })),
  deleteEvent: (id) =>
    set((s) => ({
      events: s.events.filter((r) => r.id !== id),
      files: s.files.map((f) =>
        f.event_id === id ? { ...f, event_id: null } : f,
      ),
    })),
  saveFile: (file) =>
    set((s) => ({ files: [file, ...s.files.filter((r) => r.id !== file.id)] })),
  deleteFile: (id) =>
    set((s) => ({ files: s.files.filter((r) => r.id !== id) })),
}));
/** Parent auth provider must call on sign-out/identity/preview transitions, even outside Work. */
export function resetWorkPreview(): void {
  epoch++;
  // Preserve the binding: a parent passive-effect reset can run after Work's
  // layout-effect bind. Clearing it would erase drafts again on the next route.
  useWorkPreviewStore.setState(empty());
}
export function bindWorkIdentity(next: string): void {
  if (identity !== next) {
    resetWorkPreview();
    identity = next;
  }
}
export function workIdentityEpoch(): number {
  return epoch;
}
