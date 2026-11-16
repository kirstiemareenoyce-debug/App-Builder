import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../types/database";
import { getPinnedUserRequest } from "../pinned-user-client";
import { getInstrumentDefinition } from "./definitions";
import { scoreIntake, validateIntakeAnswers } from "./scoring";
import {
  assertIntakeCurrent,
  activeIntakeConsent,
  deriveIntakeProgress,
} from "./client-state";
import {
  INTAKE_POLICY_VERSION,
  INTAKE_RPC,
  INTAKE_SUITE_VERSION,
  REQUIRED_INSTRUMENT_IDS,
  SELF_DESCRIPTION_FIELDS,
  type IntakeAnswers,
  type IntakeAttempt,
  type IntakeConsent,
  type IntakeScore,
  type IntakeSelfProfile,
  type IndividualIntakeState,
  type InstrumentId,
  type SelfDescription,
} from "./types";

const revision = z.number().int().min(1);
const date = z.string().datetime({ offset: true });
const nullableDate = date.nullable();
const instrument = z.enum(REQUIRED_INSTRUMENT_IDS);
const consentSchema = z
  .object({
    policy_version: z.literal(INTAKE_POLICY_VERSION),
    revision,
    adult_confirmed: z.boolean(),
    assessment_consent: z.boolean(),
    storage_consent: z.boolean(),
    granted_at: nullableDate,
    revoked_at: nullableDate,
  })
  .strict();
const scoreSchema = z
  .object({
    kind: z.enum(["gad7-sum", "asrs6-count", "ipip50-keyed"]),
    scoringVersion: z.string().min(1),
    rawScore: z.number().finite().optional(),
    maximum: z.number().finite().optional(),
    band: z.string().optional(),
    thresholdCount: z.number().int().optional(),
    screenPositive: z.boolean().optional(),
    traits: z
      .array(
        z
          .object({
            id: z.string(),
            title: z.string(),
            score: z.number().finite(),
            minimum: z.number().finite(),
            maximum: z.number().finite(),
            mean: z.number().finite(),
          })
          .strict(),
      )
      .optional(),
    explanation: z.string().min(1),
  })
  .strict();
const answersSchema = z.record(z.string(), z.number().int());
const attemptSchema = z
  .object({
    id: z.string().uuid(),
    user_id: z.string().min(1),
    instrument_id: instrument,
    instrument_version: z.string().min(1),
    consent_revision: revision,
    status: z.enum(["draft", "completed"]),
    revision,
    answers: answersSchema,
    result: scoreSchema.nullable(),
    started_at: date,
    updated_at: date,
    completed_at: nullableDate,
    reviewed_at: nullableDate,
  })
  .strict();
const profileBodySchema = z
  .object(
    Object.fromEntries(
      SELF_DESCRIPTION_FIELDS.map((field) => [field, z.string().max(1000)]),
    ) as Record<(typeof SELF_DESCRIPTION_FIELDS)[number], z.ZodString>,
  )
  .strict();
const profileSchema = z
  .object({
    user_id: z.string().min(1),
    body: profileBodySchema,
    consent_revision: revision,
    revision,
    updated_at: date,
    reviewed_at: nullableDate,
  })
  .strict();
const stateSchema = z
  .object({
    suite_version: z.literal(INTAKE_SUITE_VERSION),
    consent: consentSchema.nullable(),
    attempts: z.array(attemptSchema),
    profile: profileSchema.nullable(),
    required_ids: z.array(instrument),
    completed_ids: z.array(instrument),
    reviewed_ids: z.array(instrument),
    core_reviewed_complete: z.boolean(),
  })
  .strict();
const deletedSchema = z.object({ deleted: z.literal(true) }).strict();
export class IntakeClientError extends Error {
  constructor(
    message: string,
    readonly code: string = "intake",
  ) {
    super(message);
    this.name = "IntakeClientError";
  }
}
function parse<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success)
    throw new IntakeClientError(
      "The intake service returned an unsupported response. Nothing was accepted. Please try again after the backend is updated.",
      "response",
    );
  return result.data;
}
export function validateAnswerSnapshot(
  id: InstrumentId,
  value: unknown,
  complete = false,
): IntakeAnswers {
  const definition = getInstrumentDefinition(id);
  let answers: IntakeAnswers;
  try {
    answers = validateIntakeAnswers(definition, value, false);
  } catch {
    throw new IntakeClientError(
      "Choose an available answer for each item. Unknown or invalid answers cannot be saved.",
      "answers",
    );
  }
  if (
    complete &&
    definition.items.some((item) => answers[item.id] === undefined)
  )
    throw new IntakeClientError(
      "This questionnaire is incomplete. Answer every item before submitting; skipped answers are never scored as zero.",
      "incomplete",
    );
  return answers;
}
export function validateSelfDescription(body: unknown): SelfDescription {
  return parse(profileBodySchema, body);
}
function validateScore(
  id: InstrumentId,
  score: IntakeScore,
  answers: IntakeAnswers,
) {
  const expected = scoreIntake(getInstrumentDefinition(id), answers);
  // Compare the deterministic shape, never a client-invented interpretation.
  if (JSON.stringify(score) !== JSON.stringify(parse(scoreSchema, expected)))
    throw new IntakeClientError(
      "This result does not match the approved scoring definition. Nothing was accepted.",
      "response",
    );
}
export function parseIntakeAttempt(
  value: unknown,
  expectedOwner: string,
): IntakeAttempt {
  const row = parse(attemptSchema, value);
  if (
    row.user_id !== expectedOwner ||
    row.instrument_version !==
      getInstrumentDefinition(row.instrument_id).version
  )
    throw new IntakeClientError(
      "This record does not belong to the current account or supported instrument version.",
      "response",
    );
  validateAnswerSnapshot(
    row.instrument_id,
    row.answers,
    row.status === "completed",
  );
  if (
    (row.status === "draft" &&
      (row.result !== null ||
        row.completed_at !== null ||
        row.reviewed_at !== null)) ||
    (row.status === "completed" && (!row.result || !row.completed_at))
  )
    throw new IntakeClientError(
      "This record has an unsupported completion state.",
      "response",
    );
  if (row.result) validateScore(row.instrument_id, row.result, row.answers);
  return row;
}
export function parseIntakeState(
  value: unknown,
  expectedOwner: string,
): IndividualIntakeState {
  const state = parse(stateSchema, value);
  if (
    state.required_ids.length !== 3 ||
    new Set(state.required_ids).size !== 3 ||
    REQUIRED_INSTRUMENT_IDS.some((id) => !state.required_ids.includes(id)) ||
    new Set(state.attempts.map((a) => a.id)).size !== state.attempts.length ||
    new Set(state.completed_ids).size !== state.completed_ids.length ||
    new Set(state.reviewed_ids).size !== state.reviewed_ids.length
  )
    throw new IntakeClientError(
      "This intake suite is not supported by this app.",
      "response",
    );
  state.attempts.forEach((row) => parseIntakeAttempt(row, expectedOwner));
  if (
    state.profile?.user_id !== undefined &&
    state.profile.user_id !== expectedOwner
  )
    throw new IntakeClientError(
      "This profile does not belong to the current account.",
      "response",
    );
  if (
    !activeIntakeConsent(state.consent) &&
    (state.core_reviewed_complete ||
      state.reviewed_ids.length ||
      state.completed_ids.length)
  )
    throw new IntakeClientError(
      "The intake service returned an inconsistent consent state.",
      "response",
    );
  const expected = deriveIntakeProgress(state);
  if (
    expected.core_reviewed_complete !== state.core_reviewed_complete ||
    expected.completed_ids.length !== state.completed_ids.length ||
    expected.reviewed_ids.length !== state.reviewed_ids.length ||
    expected.completed_ids.some((id) => !state.completed_ids.includes(id)) ||
    expected.reviewed_ids.some((id) => !state.reviewed_ids.includes(id))
  )
    throw new IntakeClientError(
      "The intake service returned inconsistent review progress.",
      "response",
    );
  return state;
}
export function intakeErrorMessage(error: unknown): string {
  if (error instanceof IntakeClientError) return error.message;
  if (
    error instanceof Error &&
    (error.message.startsWith("Your account") ||
      error.message.startsWith("This action"))
  )
    return error.message;
  return "Your private intake action could not be completed. Nothing has been confirmed as saved. Please try again.";
}
function rpcError(error: { code?: string } | null) {
  if (!error) return;
  if (["PGRST202", "42883", "PGRST204", "55000"].includes(error.code ?? ""))
    throw new IntakeClientError(
      "The adult intake backend is not installed or available yet. This app cannot save or submit account records until it is reviewed and installed. Preview stays session-only.",
      "backend-missing",
    );
  if (["40001", "409", "P0002"].includes(error.code ?? ""))
    throw new IntakeClientError(
      "This draft changed elsewhere. Reload the saved record before making another change; your unsaved answers have not replaced it.",
      "revision",
    );
  if (["42501", "PGRST301"].includes(error.code ?? ""))
    throw new IntakeClientError(
      "Your session or consent does not permit this action. Review consent or sign in again.",
      "permission",
    );
  throw new IntakeClientError(
    "The private intake service could not complete this action. No successful save has been confirmed.",
    "backend",
  );
}
export interface IntakeRequestContext {
  readonly expectedOwner: string;
  readonly expectedConsentRevision?: number | null;
  readonly isCurrent: () => boolean;
}
export type IntakeCommand =
  | { kind: "consent"; adult: boolean; assessment: boolean; storage: boolean }
  | { kind: "start"; instrumentId: InstrumentId }
  | { kind: "save"; attempt: IntakeAttempt; answers: IntakeAnswers }
  | { kind: "finalize" | "review"; attempt: IntakeAttempt }
  | {
      kind: "profile";
      expectedRevision: number;
      body: SelfDescription;
      review: boolean;
    }
  | { kind: "deleteAttempt"; attemptId: string }
  | { kind: "deleteAll" };
export type IntakeCommandResult =
  | IntakeConsent
  | IntakeAttempt
  | IntakeSelfProfile
  | { deleted: true };
const commandSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("consent"),
      adult: z.boolean(),
      assessment: z.boolean(),
      storage: z.boolean(),
    })
    .strict(),
  z.object({ kind: z.literal("start"), instrumentId: instrument }).strict(),
  z
    .object({
      kind: z.literal("save"),
      attempt: attemptSchema,
      answers: answersSchema,
    })
    .strict(),
  z
    .object({ kind: z.enum(["finalize", "review"]), attempt: attemptSchema })
    .strict(),
  z
    .object({
      kind: z.literal("profile"),
      expectedRevision: z.number().int().min(0),
      body: profileBodySchema,
      review: z.boolean(),
    })
    .strict(),
  z
    .object({ kind: z.literal("deleteAttempt"), attemptId: z.string().uuid() })
    .strict(),
  z.object({ kind: z.literal("deleteAll") }).strict(),
]);
export function validateIntakeCommand(command: unknown): IntakeCommand {
  return parse(commandSchema, command);
}
/** Source-only boundary: this constructor never reads or calls the hosted backend. */
export function createIndividualIntakeClient(
  sdk: SupabaseClient<Database> | null,
) {
  async function rpc(
    name: string,
    args: Record<string, unknown>,
    context: IntakeRequestContext,
  ): Promise<unknown> {
    assertIntakeCurrent(context.isCurrent);
    if (!sdk)
      throw new IntakeClientError(
        "The adult intake backend is not configured. No account record was saved.",
        "backend-missing",
      );
    let pin: Awaited<ReturnType<typeof getPinnedUserRequest>>;
    try {
      pin = await getPinnedUserRequest(sdk, context.expectedOwner);
    } catch {
      throw new IntakeClientError(
        "Your account changed or your session expired. Sign in before saving.",
        "account",
      );
    }
    assertIntakeCurrent(context.isCurrent);
    // Review-only RPCs are not in the existing generated Database type yet.
    const boundary = sdk as unknown as SupabaseClient;
    const response = await pin(boundary.rpc(name, args));
    assertIntakeCurrent(context.isCurrent);
    rpcError(response.error);
    return response.data;
  }
  return {
    async getState(
      context: IntakeRequestContext,
    ): Promise<IndividualIntakeState> {
      return parseIntakeState(
        await rpc(INTAKE_RPC.state, {}, context),
        context.expectedOwner,
      );
    },
    async assertOwner(context: IntakeRequestContext): Promise<void> {
      assertIntakeCurrent(context.isCurrent);
      if (!sdk)
        throw new IntakeClientError(
          "The intake backend is unavailable.",
          "backend-missing",
        );
      try {
        await getPinnedUserRequest(sdk, context.expectedOwner);
      } catch {
        throw new IntakeClientError(
          "Your account changed or your session expired. Export was cancelled.",
          "account",
        );
      }
      assertIntakeCurrent(context.isCurrent);
    },
    async execute(
      command: IntakeCommand,
      context: IntakeRequestContext,
    ): Promise<IntakeCommandResult> {
      assertIntakeCurrent(context.isCurrent);
      command = validateIntakeCommand(command);
      // Snapshot before auth/transport awaits; a caller's latest state must never
      // rebind a queued grant, start, or profile write to a newer consent lifetime.
      context = Object.freeze({ ...context });
      const expectedConsentRevision = parse(
        z.number().int().min(0),
        context.expectedConsentRevision ?? 0,
      );
      if (
        (command.kind === "start" || command.kind === "profile") &&
        expectedConsentRevision === 0
      )
        throw new IntakeClientError(
          "Current adult, assessment, and storage consent is required for new processing.",
          "consent",
        );
      let args: Record<string, unknown>;
      let name: string;
      if (command.kind === "consent") {
        const input = parse(
          z
            .object({
              adult: z.boolean(),
              assessment: z.boolean(),
              storage: z.boolean(),
            })
            .strict(),
          {
            adult: command.adult,
            assessment: command.assessment,
            storage: command.storage,
          },
        );
        name = INTAKE_RPC.consent;
        args = {
          p_policy_version: INTAKE_POLICY_VERSION,
          p_adult_confirmed: input.adult,
          p_assessment_consent: input.assessment,
          p_storage_consent: input.storage,
          p_expected_consent_revision: expectedConsentRevision,
        };
      } else if (command.kind === "start") {
        const id = parse(instrument, command.instrumentId);
        name = INTAKE_RPC.start;
        args = {
          p_instrument_id: id,
          p_instrument_version: getInstrumentDefinition(id).version,
          p_expected_consent_revision: expectedConsentRevision,
        };
      } else if (
        command.kind === "save" ||
        command.kind === "finalize" ||
        command.kind === "review"
      ) {
        const row = parseIntakeAttempt(command.attempt, context.expectedOwner);
        if (
          command.kind === "review"
            ? row.status !== "completed"
            : row.status !== "draft"
        )
          throw new IntakeClientError(
            "Sealed results cannot be edited. Start a new attempt instead.",
            "sealed",
          );
        if (command.kind === "finalize")
          validateAnswerSnapshot(row.instrument_id, row.answers, true);
        name = INTAKE_RPC[command.kind];
        args = { p_attempt_id: row.id, p_expected_revision: row.revision };
        if (command.kind === "save")
          args.p_answers = validateAnswerSnapshot(
            row.instrument_id,
            command.answers,
          );
      } else if (command.kind === "profile") {
        name = INTAKE_RPC.profile;
        args = {
          p_expected_revision: parse(
            z.number().int().min(0),
            command.expectedRevision,
          ),
          p_body: validateSelfDescription(command.body),
          p_review_acknowledged: parse(z.boolean(), command.review),
          p_expected_consent_revision: expectedConsentRevision,
        };
      } else if (command.kind === "deleteAttempt") {
        name = INTAKE_RPC.deleteAttempt;
        args = { p_attempt_id: parse(z.string().uuid(), command.attemptId) };
      } else {
        name = INTAKE_RPC.deleteAll;
        args = {};
      }
      const data = await rpc(name, args, context);
      if (command.kind === "consent") {
        const consent = parse(consentSchema, data);
        const grant = command.adult && command.assessment && command.storage;
        if (
          consent.adult_confirmed !== command.adult ||
          consent.assessment_consent !== command.assessment ||
          consent.storage_consent !== command.storage ||
          activeIntakeConsent(consent) !== grant ||
          consent.revision < expectedConsentRevision ||
          // Current grants are idempotent or advance exactly once. Only privacy
          // withdrawals may confirm a higher actual revision after another device.
          (grant && consent.revision > expectedConsentRevision + 1)
        )
          throw new IntakeClientError(
            "The requested consent change was not confirmed.",
            "response",
          );
        return consent;
      }
      if (command.kind === "deleteAttempt" || command.kind === "deleteAll")
        return parse(deletedSchema, data);
      if (command.kind === "profile") {
        const row = parse(profileSchema, data);
        if (
          row.user_id !== context.expectedOwner ||
          row.revision !== command.expectedRevision + 1 ||
          JSON.stringify(row.body) !==
            JSON.stringify(validateSelfDescription(command.body)) ||
          Boolean(row.reviewed_at) !== command.review ||
          row.consent_revision !== expectedConsentRevision
        )
          throw new IntakeClientError(
            "The saved profile revision could not be validated.",
            "response",
          );
        return row;
      }
      const row = parseIntakeAttempt(data, context.expectedOwner);
      if (
        command.kind === "start" &&
        (row.instrument_id !== command.instrumentId ||
          row.status !== "draft" ||
          row.consent_revision !== expectedConsentRevision)
      )
        throw new IntakeClientError(
          "The new draft could not be validated.",
          "response",
        );
      if (
        (command.kind === "save" ||
          command.kind === "finalize" ||
          command.kind === "review") &&
        (row.id !== command.attempt.id ||
          row.consent_revision !== command.attempt.consent_revision ||
          row.instrument_id !== command.attempt.instrument_id ||
          row.revision !==
            command.attempt.revision +
              (command.kind === "review" && command.attempt.reviewed_at
                ? 0
                : 1) ||
          row.status !== (command.kind === "save" ? "draft" : "completed"))
      )
        throw new IntakeClientError(
          "The returned draft/result revision could not be validated. Reload before continuing.",
          "response",
        );
      if (command.kind === "review" && !row.reviewed_at)
        throw new IntakeClientError(
          "Result review was not confirmed.",
          "response",
        );
      if (
        context.expectedConsentRevision !== undefined &&
        row.consent_revision !== context.expectedConsentRevision
      )
        throw new IntakeClientError(
          "This response belongs to earlier consent. Reload before continuing.",
          "response",
        );
      if (
        command.kind === "save" ||
        command.kind === "finalize" ||
        command.kind === "review"
      ) {
        const expectedAnswers =
          command.kind === "save" ? command.answers : command.attempt.answers;
        if (
          Object.keys(expectedAnswers).length !==
            Object.keys(row.answers).length ||
          Object.entries(expectedAnswers).some(
            ([id, value]) => row.answers[id] !== value,
          )
        )
          throw new IntakeClientError(
            "The saved answer snapshot could not be confirmed. Reload before continuing.",
            "response",
          );
      }
      return row;
    },
  };
}
