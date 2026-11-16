export const INTAKE_POLICY_VERSION = "adult-core-v1";
export const INTAKE_SUITE_VERSION = "adult-core-v1";
export const REQUIRED_INSTRUMENT_IDS = ["gad7", "asrs6", "ipip50"] as const;
export type InstrumentId = typeof REQUIRED_INSTRUMENT_IDS[number];
export type IntakeAnswers = Record<string, number>;

export type InstrumentScoring =
  | { kind: "gad7-sum"; version: string; bands: { min: number; max: number; label: string }[] }
  | { kind: "asrs6-count"; version: string; thresholds: Record<string, number>; positiveCount: number }
  | { kind: "ipip50-keyed"; version: string; scales: { id: string; title: string; positiveItemIds: string[]; negativeItemIds: string[] }[] };

export interface InstrumentDefinition {
  id: InstrumentId;
  version: string;
  title: string;
  shortTitle: string;
  instructions: string;
  timeframe: string;
  items: { id: string; text: string }[];
  options: { value: number; label: string }[];
  scoring: InstrumentScoring;
  attribution: string;
  rightsSummary: string;
  sourceUrls: string[];
  resultNote: string;
}

export interface IntakeScore {
  kind: InstrumentScoring["kind"];
  scoringVersion: string;
  rawScore?: number;
  maximum?: number;
  band?: string;
  thresholdCount?: number;
  screenPositive?: boolean;
  traits?: { id: string; title: string; score: number; minimum: number; maximum: number; mean: number }[];
  explanation: string;
}

export interface IntakeConsent {
  policy_version: string;
  revision: number;
  adult_confirmed: boolean;
  assessment_consent: boolean;
  storage_consent: boolean;
  granted_at: string | null;
  revoked_at: string | null;
}

export interface IntakeAttempt {
  id: string;
  user_id: string;
  instrument_id: InstrumentId;
  instrument_version: string;
  consent_revision: number;
  status: "draft" | "completed";
  revision: number;
  answers: IntakeAnswers;
  result: IntakeScore | null;
  started_at: string;
  updated_at: string;
  completed_at: string | null;
  reviewed_at: string | null;
}

export const SELF_DESCRIPTION_FIELDS = ["values", "emotions", "coping", "support", "boundaries", "learningGoals"] as const;
export type SelfDescriptionField = typeof SELF_DESCRIPTION_FIELDS[number];
export type SelfDescription = Record<SelfDescriptionField, string>;
export interface IntakeSelfProfile {
  user_id: string;
  body: SelfDescription;
  consent_revision: number;
  revision: number;
  updated_at: string;
  reviewed_at: string | null;
}

export interface IndividualIntakeState {
  suite_version: string;
  consent: IntakeConsent | null;
  attempts: IntakeAttempt[];
  profile: IntakeSelfProfile | null;
  required_ids: InstrumentId[];
  completed_ids: InstrumentId[];
  reviewed_ids: InstrumentId[];
  core_reviewed_complete: boolean;
}

/** RPC names are shared with the review-only schema. No partner eligibility is granted here. */
export const INTAKE_RPC = {
  state: "individual_intake_state",
  consent: "set_individual_intake_consent",
  start: "start_individual_intake_attempt",
  save: "save_individual_intake_answers",
  finalize: "finalize_individual_intake_attempt",
  review: "review_individual_intake_result",
  profile: "save_individual_self_description",
  deleteAttempt: "delete_individual_intake_attempt",
  deleteAll: "delete_my_individual_intake_data",
} as const;
