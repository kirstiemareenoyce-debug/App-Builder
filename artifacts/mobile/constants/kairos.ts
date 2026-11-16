export const KAIROS_COLOURS = {
  backgroundPrimary: "#0B0F19",
  backgroundSecondary: "#111827",
  surface: "#1F2937",
  surfaceElevated: "#374151",
  textPrimary: "#FFFFFF",
  textSecondary: "#9CA3AF",
  textTertiary: "#6B7280",
  accentPrimary: "#10B981",
  accentSecondary: "#14B8A6",
  success: "#34D399",
  warning: "#FBBF24",
  error: "#EF4444",
  border: "#374151",
  borderFocus: "#10B981",
  overlay: "rgba(0, 0, 0, 0.7)",
  relationshipBackground: "#000000",
} as const;

export const KAIROS_MOTION = {
  pressScale: 0.97,
  quick: 80,
  standard: 250,
  transition: 300,
} as const;

export const KAIROS_LIMITS = {
  query: 2000,
  feedbackCorrection: 4000,
  taskTitle: 200,
  taskDescription: 2000,
  noteTitle: 200,
  noteContent: 10000,
  notes: 1000,
  tags: 10,
} as const;
