import { create } from "zustand";
import { getInstrumentDefinition } from "../lib/individual-intake/definitions";
import { scoreIntake } from "../lib/individual-intake/scoring";
import {
  activeIntakeConsent,
  assertIntakeCurrent,
  deriveIntakeProgress,
  emptyIntakeState,
  invalidateIndividualIntakeOperations,
} from "../lib/individual-intake/client-state";
import {
  validateAnswerSnapshot,
  validateIntakeCommand,
  validateSelfDescription,
  type IntakeCommand,
  type IntakeCommandResult,
  type IntakeRequestContext,
} from "../lib/individual-intake/client";
import {
  INTAKE_POLICY_VERSION,
  type IndividualIntakeState,
  type IntakeAttempt,
} from "../lib/individual-intake/types";

// No persist middleware, AsyncStorage, seeded responses, or transport dependency.
const uuid = () =>
  "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const n = Math.floor(Math.random() * 16);
    return (c === "x" ? n : (n & 3) | 8).toString(16);
  });
interface PreviewStore {
  identity: string | null;
  expectedOwner: string | null;
  state: IndividualIntakeState;
  execute: (
    command: IntakeCommand,
    context: IntakeRequestContext,
  ) => IntakeCommandResult;
  reset: () => void;
}
export const useIndividualIntakePreviewStore = create<PreviewStore>(
  (set, get) => ({
    identity: null,
    expectedOwner: null,
    state: emptyIntakeState(),
    reset: () => set({ expectedOwner: null, state: emptyIntakeState() }),
    execute(command, context) {
      assertIntakeCurrent(context.isCurrent);
      command = validateIntakeCommand(command);
      const previous =
        get().expectedOwner === context.expectedOwner
          ? get().state
          : emptyIntakeState();
      const now = new Date().toISOString();
      let next = { ...previous };
      let result: IntakeCommandResult;
      if (command.kind === "consent") {
        // Pin active grants before the idempotence shortcut, exactly as the
        // server does. Privacy withdrawals remain available at any revision.
        if (
          command.adult &&
          command.assessment &&
          command.storage &&
          (context.expectedConsentRevision ?? 0) !==
            (previous.consent?.revision ?? 0)
        )
          throw new Error(
            "Your consent changed. Review it before granting again.",
          );
        if (
          previous.consent &&
          previous.consent.adult_confirmed === command.adult &&
          previous.consent.assessment_consent === command.assessment &&
          previous.consent.storage_consent === command.storage
        )
          return previous.consent;
        next.consent = {
          policy_version: INTAKE_POLICY_VERSION,
          revision: (previous.consent?.revision ?? 0) + 1,
          adult_confirmed: command.adult,
          assessment_consent: command.assessment,
          storage_consent: command.storage,
          granted_at:
            command.adult && command.assessment && command.storage ? now : null,
          revoked_at:
            command.adult && command.assessment && command.storage ? null : now,
        };
        result = next.consent;
      } else if (command.kind === "deleteAll") {
        next = {
          ...emptyIntakeState(),
          consent: {
            policy_version: INTAKE_POLICY_VERSION,
            revision: (previous.consent?.revision ?? 0) + 1,
            adult_confirmed: false,
            assessment_consent: false,
            storage_consent: false,
            granted_at: null,
            revoked_at: now,
          },
        };
        result = { deleted: true };
      } else if (command.kind === "deleteAttempt") {
        if (
          !previous.attempts.some(
            (a) =>
              a.id === command.attemptId && a.user_id === context.expectedOwner,
          )
        )
          throw new Error(
            "This record is no longer available in your preview session.",
          );
        next.attempts = previous.attempts.filter(
          (a) => a.id !== command.attemptId,
        );
        result = { deleted: true };
      } else {
        if (!activeIntakeConsent(previous.consent))
          throw new Error(
            "Review all three adult consent acknowledgments before starting new processing.",
          );
        if (
          (command.kind === "start" || command.kind === "profile") &&
          (typeof context.expectedConsentRevision !== "number" ||
            !Number.isInteger(context.expectedConsentRevision) ||
            context.expectedConsentRevision <= 0 ||
            context.expectedConsentRevision !== previous.consent!.revision)
        )
          throw new Error(
            "Your consent changed. Review it before new processing.",
          );
        if (command.kind === "start") {
          const definition = getInstrumentDefinition(command.instrumentId);
          const existing = previous.attempts.find(
            (a) =>
              a.instrument_id === command.instrumentId &&
              a.instrument_version === definition.version &&
              a.status === "draft" &&
              a.consent_revision === previous.consent!.revision,
          );
          const attempt: IntakeAttempt = existing ?? {
            id: uuid(),
            user_id: context.expectedOwner,
            instrument_id: command.instrumentId,
            instrument_version: definition.version,
            consent_revision: previous.consent!.revision,
            status: "draft",
            revision: 1,
            answers: {},
            result: null,
            started_at: now,
            updated_at: now,
            completed_at: null,
            reviewed_at: null,
          };
          next.attempts = existing
            ? previous.attempts
            : [attempt, ...previous.attempts];
          result = attempt;
        } else if (command.kind === "profile") {
          if ((previous.profile?.revision ?? 0) !== command.expectedRevision)
            throw new Error("This profile changed. Reload before continuing.");
          next.profile = {
            user_id: context.expectedOwner,
            body: validateSelfDescription(command.body),
            revision: command.expectedRevision + 1,
            consent_revision: previous.consent!.revision,
            updated_at: now,
            reviewed_at: command.review ? now : null,
          };
          result = next.profile;
        } else {
          const attempt = previous.attempts.find(
            (a) =>
              a.id === command.attempt.id &&
              a.user_id === context.expectedOwner,
          );
          if (!attempt || attempt.revision !== command.attempt.revision)
            throw new Error("This draft changed. Reload before continuing.");
          if (attempt.consent_revision !== previous.consent!.revision)
            throw new Error(
              "This attempt belongs to earlier consent. Start a new attempt.",
            );
          if (
            command.kind === "review"
              ? attempt.status !== "completed"
              : attempt.status !== "draft"
          )
            throw new Error(
              "Sealed results cannot be edited. Start a new attempt instead.",
            );
          if (command.kind === "review" && attempt.reviewed_at) return attempt;
          const updated = {
            ...attempt,
            revision: attempt.revision + 1,
            updated_at: now,
          };
          if (command.kind === "save")
            updated.answers = validateAnswerSnapshot(
              attempt.instrument_id,
              command.answers,
            );
          if (command.kind === "finalize") {
            validateAnswerSnapshot(
              attempt.instrument_id,
              attempt.answers,
              true,
            );
            updated.result = scoreIntake(
              getInstrumentDefinition(attempt.instrument_id),
              attempt.answers,
            );
            updated.status = "completed";
            updated.completed_at = now;
          }
          if (command.kind === "review") updated.reviewed_at = now;
          next.attempts = previous.attempts.map((a) =>
            a.id === attempt.id ? updated : a,
          );
          result = updated;
        }
      }
      assertIntakeCurrent(context.isCurrent);
      set({
        expectedOwner: context.expectedOwner,
        state: deriveIntakeProgress(next),
      });
      return result;
    },
  }),
);
/** Reset answers while preserving the existing binding; auth transitions invalidate pending work. */
export function resetIndividualIntakePreview() {
  invalidateIndividualIntakeOperations();
  useIndividualIntakePreviewStore.getState().reset();
}
/** Global auth should bind a stable identity+mode key; null represents signed out. */
export function bindIndividualIntakePreviewIdentity(identity: string | null) {
  const store = useIndividualIntakePreviewStore.getState();
  if (store.identity === identity) return;
  invalidateIndividualIntakeOperations();
  useIndividualIntakePreviewStore.setState({
    identity,
    expectedOwner: null,
    state: emptyIntakeState(),
  });
}
