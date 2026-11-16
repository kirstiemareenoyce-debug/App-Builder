import { z } from "zod";

import type { ConfidenceLevel } from "@/types/evergreen";

export const moodEntrySchema = z.object({
  score: z.number().int().min(1).max(10),
  energy_level: z.number().int().min(1).max(10),
  notes: z.string().trim().max(1000, "Keep notes under 1,000 characters."),
});

export const sleepEntrySchema = z.object({
  duration_minutes: z.number().int().min(0).max(720),
  quality: z.number().int().min(1).max(10),
  bedtime: z.date(),
  wake_time: z.date(),
  notes: z.string().trim().max(1000),
}).refine((value) => value.wake_time > value.bedtime, {
  message: "Wake time must be after bedtime.",
  path: ["wake_time"],
});

export const taskPriorities = ["low", "medium", "high", "urgent"] as const;
export const taskStatuses = ["todo", "in_progress", "done", "cancelled"] as const;

export const taskEntrySchema = z.object({
  title: z.string().trim().min(1, "Title is required.").max(200, "Title must be 200 characters or fewer."),
  description: z.string().trim().max(2000, "Description must be 2,000 characters or fewer."),
  priority: z.enum(taskPriorities),
  status: z.enum(taskStatuses),
  dueDate: z.date().nullable(),
  tags: z.array(z.string().min(1).max(40)).max(10, "Use no more than 10 tags."),
});

export const noteEntrySchema = z.object({
  title: z.string().trim().min(1, "Title is required.").max(200, "Title must be 200 characters or fewer."),
  content: z.string().max(10000, "Content must be 10,000 characters or fewer."),
  tags: z.array(z.string().min(1).max(40)).max(10, "Use no more than 10 tags."),
});

export const partnerIdSchema = z.string().trim().uuid("Enter a valid Kairos account ID.");

export const aevumConsentSchema = z.object({
  scope: z.enum(["assessment", "individual_profile", "partner_sharing", "couple_map", "coaching"]),
  granted: z.boolean(),
  version: z.string().trim().min(1).max(40),
});

export const aevumAnswerSchema = z.object({
  stageKey: z.enum(["personality", "attachment", "trauma_patterns", "neurodivergence", "baseline", "communication", "history_goals"]),
  questionKey: z.string().trim().min(1).max(120),
  answer: z.union([z.string(), z.number().finite(), z.boolean(), z.array(z.string()), z.null()]),
});

export function parseCommaTags(value: string) {
  return [...new Set(value.split(",").map((tag) => tag.trim()).filter(Boolean))];
}

export function getConfidenceLevel(confidence: number): ConfidenceLevel {
  if (confidence >= 0.75) return "high";
  if (confidence >= 0.5) return "medium";
  return "low";
}
