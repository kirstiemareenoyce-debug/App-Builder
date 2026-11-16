import type { User } from "@supabase/supabase-js";

import type { Tables } from "@/types/database";

export type ThemePreference = "light" | "dark" | "system";
export type TaskFilter = "todo" | "in_progress" | "done" | "all";
export type NotificationPreference = "mood_reminder" | "task_due" | "ai_update";

export const AEVUM_STAGE_KEYS = ["personality", "attachment", "trauma_patterns", "neurodivergence", "baseline", "communication", "history_goals"] as const;
export type AevumStageKey = (typeof AEVUM_STAGE_KEYS)[number];
export type AevumAnswerValue = string | number | boolean | string[] | null;
export type AevumStageResult = {
  stageKey: AevumStageKey;
  score: number | null;
  classification: "not_available" | "lower_pattern_signal" | "elevated_pattern_signal" | "higher_pattern_signal";
  language: string;
};
export type AevumConsentScope = "assessment" | "individual_profile" | "partner_sharing" | "couple_map" | "coaching";
export type AevumSharingCategory = "attachment_triggers" | "conflict_patterns" | "communication_preferences" | "baseline_signals" | "goals";
export type AevumAssessmentStatus = "not_started" | "in_progress" | "completed" | "needs_review";
export type AevumProfile = {
  id: string;
  user_id: string;
  completion_progress: number;
  profile_status: "incomplete" | "ready" | "paused";
  stage_status: Partial<Record<AevumStageKey, AevumAssessmentStatus>>;
  safety_flags: string[];
  result_summary: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type Profile = Tables<"profiles">;
export type Interaction = Tables<"interactions">;
export type Mood = Tables<"moods">;
export type SleepLog = Tables<"sleep_logs">;
export type Task = Tables<"tasks">;
export type Note = Tables<"notes">;
export type PartnerConnection = Tables<"partner_connections">;
export type AppSettings = Tables<"app_settings">;

export type KairosUser = {
  id: string;
  email: string | null;
  fullName: string | null;
  isPreview: boolean;
  raw: User | null;
};

export type RouteParams = {
  taskEdit: { id?: string };
  noteEdit: { id?: string };
  moodHistory: undefined;
  sleepHistory: undefined;
  profile: undefined;
  aevum: undefined;
  aevumAssessment: { stage?: AevumStageKey };
  aevumResults: undefined;
  aevumPartner: undefined;
  aevumCoaching: undefined;
};

export const queryKeys = {
  profile: (userId: string) => ["profile", userId] as const,
  interactions: (userId: string) => ["interactions", userId] as const,
  metrics: (userId: string) => ["evergreen-metrics", userId] as const,
  moods: (userId: string) => ["moods", userId] as const,
  sleep: (userId: string) => ["sleep", userId] as const,
  tasks: (userId: string) => ["tasks", userId] as const,
  notes: (userId: string) => ["notes", userId] as const,
  noteSearch: (userId: string, query: string) => ["notes", userId, "search", query] as const,
  partner: (userId: string) => ["partner", userId] as const,
  settings: (userId: string) => ["settings", userId] as const,
  aevumProfile: (userId: string) => ["aevum", userId, "profile"] as const,
  aevumConsents: (userId: string) => ["aevum", userId, "consents"] as const,
  aevumSharing: (userId: string) => ["aevum", userId, "sharing"] as const,
};
