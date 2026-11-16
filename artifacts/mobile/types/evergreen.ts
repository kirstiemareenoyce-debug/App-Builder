export type ConfidenceLevel = "low" | "medium" | "high";
export type FeedbackRating = -1 | 0 | 1;
export type FeedbackCategory =
  | "general"
  | "emotional_support"
  | "practical_advice"
  | "information"
  | "personalisation";

export interface ApiSuccess<T> {
  success: true;
  data: T;
}

export interface ApiFailure {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
    request_id: string;
  };
}

export type ApiEnvelope<T> = ApiSuccess<T> | ApiFailure;

export interface EvergreenQueryInput {
  query: string;
}

export interface RetrievedContextPreview {
  source_type: string;
  content: string;
  similarity: number;
  date: unknown;
}

export interface EvergreenQueryData {
  response: string;
  confidence: number;
  confidence_level: ConfidenceLevel;
  context_retrieved: RetrievedContextPreview[];
  interaction_id: string;
  flagged_for_review: boolean;
}

export interface EvergreenFeedbackInput {
  interaction_id: string;
  rating: FeedbackRating;
  correction?: string | null;
  category?: FeedbackCategory | null;
}

export interface EvergreenFeedbackData {
  feedback_id: string;
  learning_impact: "medium" | "high";
}

export interface EvergreenMetricsData {
  current: {
    accuracy: number;
    personalisation: number;
    hallucination_rate: number;
    satisfaction: number;
    interaction_count: number;
    feedback_count: number;
  };
  trend: {
    accuracy_delta: number;
    personalisation_delta: number;
    hallucination_rate_delta: number;
    satisfaction_delta: number;
  };
  next_update: string;
}
