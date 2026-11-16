import type { Json } from "@/types/database";

export type NotificationSettings = {
  mood_reminder: boolean;
  task_due: boolean;
  ai_update: boolean;
};

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  mood_reminder: false,
  task_due: true,
  ai_update: true,
};

export function parseNotificationSettings(value: Json): NotificationSettings {
  if (!value || Array.isArray(value) || typeof value !== "object") return DEFAULT_NOTIFICATION_SETTINGS;
  return {
    mood_reminder: value.mood_reminder === true,
    task_due: value.task_due !== false,
    ai_update: value.ai_update !== false,
  };
}
