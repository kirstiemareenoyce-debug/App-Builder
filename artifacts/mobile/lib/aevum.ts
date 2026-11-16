import type { AevumAnswerValue, AevumStageKey, AevumStageResult } from "@/types/app";

export const AEVUM_STAGES = [
  { key: "personality", title: "Core Personality", durationMinutes: 10, questionCount: 60, description: "Map information processing, social energy, decision style, and stress response." },
  { key: "attachment", title: "Attachment Style", durationMinutes: 8, questionCount: 24, description: "Explore closeness, consistency, autonomy, and attachment-system activation patterns." },
  { key: "trauma_patterns", title: "Trauma & Emotional Patterns", durationMinutes: 12, questionCount: 30, description: "Identify relationship patterns and regulation responses. This is screening, not diagnosis." },
  { key: "neurodivergence", title: "Neurodivergence Screening", durationMinutes: 10, questionCount: 40, description: "Screen for attention, sensory, communication, mood-cycling, and compulsive patterns without diagnosing." },
  { key: "baseline", title: "Mood & Energy Baseline", durationMinutes: 5, questionCount: 14, description: "Complete one private daily check-in for 14 days to establish your personal baseline." },
  { key: "communication", title: "Communication Style", durationMinutes: 6, questionCount: 20, description: "Map conflict style, repair recognition, love-language preferences, and processing speed." },
  { key: "history_goals", title: "Relationship History & Goals", durationMinutes: 8, questionCount: 15, description: "Reflect on recurring themes, boundaries, relationship goals, and growth areas." },
] as const satisfies readonly { key: AevumStageKey; title: string; durationMinutes: number; questionCount: number; description: string }[];

export const AEVUM_STAGE_KEYS = AEVUM_STAGES.map((stage) => stage.key);
export const AEVUM_COMPLETION_GATE = 0.8;
export const AEVUM_BASELINE_DAYS = 14;

export const AEVUM_SAFE_BOUNDARIES = {
  screening: "Aevum identifies patterns for reflection; it does not diagnose conditions or replace professional care.",
  privacy: "Your answers and inferred profile are private by default. Partner access requires a separate, revocable choice.",
  safety: "If answers suggest significant distress, Aevum recommends qualified professional support and does not provide emergency care.",
} as const;

export function stageProgress(completedStageKeys: readonly AevumStageKey[], baselineDaysLogged = 0) {
  const completed = new Set(completedStageKeys);
  const stageProgressValue = AEVUM_STAGES.reduce((sum, stage) => sum + (completed.has(stage.key) ? 1 : 0), 0);
  const baselineProgress = Math.min(baselineDaysLogged / AEVUM_BASELINE_DAYS, 1);
  const weighted = (stageProgressValue + baselineProgress) / AEVUM_STAGES.length;
  return Math.min(1, Number(weighted.toFixed(4)));
}

export function canInvitePartner(progress: number) {
  return progress >= AEVUM_COMPLETION_GATE;
}

export function scoreLikert(values: readonly number[], maximum = 5) {
  if (values.length === 0) return null;
  const valid = values.filter((value) => Number.isFinite(value) && value >= 1 && value <= maximum);
  if (valid.length !== values.length) return null;
  return Number((valid.reduce((sum, value) => sum + value, 0) / valid.length).toFixed(2));
}

export function classifyScreeningPattern(score: number | null, thresholds = { elevated: 0.6, high: 0.8 }) {
  if (score === null) return "not_available" as const;
  if (score >= thresholds.high) return "higher_pattern_signal" as const;
  if (score >= thresholds.elevated) return "elevated_pattern_signal" as const;
  return "lower_pattern_signal" as const;
}

export function buildStageResult(stageKey: AevumStageKey, answers: readonly AevumAnswerValue[]): AevumStageResult {
  const numeric = answers.flatMap((answer) => typeof answer === "number" ? [answer] : []);
  const score = scoreLikert(numeric);
  return {
    stageKey,
    score,
    classification: classifyScreeningPattern(score),
    language: score === null ? "Not enough information yet." : "This reflects a pattern signal for reflection, not a diagnosis or fixed identity.",
  };
}

export function sanitizeCoachingContext(input: Record<string, unknown>) {
  const allowed = ["stageSummaries", "consentedTriggers", "communicationPreferences", "baselineSummary", "sharedGoals"];
  return Object.fromEntries(allowed.filter((key) => input[key] !== undefined).map((key) => [key, input[key]]));
}
