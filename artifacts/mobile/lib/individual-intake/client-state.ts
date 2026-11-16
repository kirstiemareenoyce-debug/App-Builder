import { getInstrumentDefinition } from "./definitions";
import {
  INTAKE_POLICY_VERSION,
  INTAKE_SUITE_VERSION,
  REQUIRED_INSTRUMENT_IDS,
  SELF_DESCRIPTION_FIELDS,
  type IntakeAttempt,
  type IntakeConsent,
  type IndividualIntakeState,
  type InstrumentId,
  type SelfDescription,
} from "./types";

let identity: string | null = null;
let identityGeneration = 0;
export const intakeIdentityKey = (owner: string, preview: boolean) =>
  `${owner}:${preview ? "preview" : "account"}`;
/** Call synchronously on auth identity/mode transitions, before rendering descendants. */
export function bindIndividualIntakeIdentity(
  owner: string | null,
  preview: boolean,
) {
  const next = owner ? intakeIdentityKey(owner, preview) : null;
  if (identity !== next) {
    identity = next;
    identityGeneration++;
  }
}
/** Parent auth cleanup may call this together with resetIndividualIntakePreview. */
export function resetIndividualIntakeIdentity() {
  identity = null;
  identityGeneration++;
}
export function invalidateIndividualIntakeOperations() {
  identityGeneration++;
}
export function activeIntakeConsent(
  consent: IntakeConsent | null | undefined,
): boolean {
  return Boolean(
    consent &&
    consent.policy_version === INTAKE_POLICY_VERSION &&
    consent.adult_confirmed &&
    consent.assessment_consent &&
    consent.storage_consent &&
    consent.granted_at &&
    !consent.revoked_at,
  );
}
export function emptySelfDescription(): SelfDescription {
  return Object.fromEntries(
    SELF_DESCRIPTION_FIELDS.map((key) => [key, ""]),
  ) as SelfDescription;
}
export function emptyIntakeState(): IndividualIntakeState {
  return {
    suite_version: INTAKE_SUITE_VERSION,
    consent: null,
    attempts: [],
    profile: null,
    required_ids: [...REQUIRED_INSTRUMENT_IDS],
    completed_ids: [],
    reviewed_ids: [],
    core_reviewed_complete: false,
  };
}
export function currentResult(
  state: IndividualIntakeState,
  id: InstrumentId,
): IntakeAttempt | undefined {
  const definition = getInstrumentDefinition(id);
  return state.attempts
    .filter(
      (a) =>
        a.instrument_id === id &&
        a.instrument_version === definition.version &&
        a.consent_revision === state.consent?.revision &&
        a.status === "completed",
    )
    .sort((a, b) => b.started_at.localeCompare(a.started_at))[0];
}
export function currentDraft(
  state: IndividualIntakeState,
  id: InstrumentId,
): IntakeAttempt | undefined {
  return state.attempts.find(
    (a) =>
      a.instrument_id === id &&
      a.instrument_version === getInstrumentDefinition(id).version &&
      a.consent_revision === state.consent?.revision &&
      a.status === "draft",
  );
}
/** Readiness is a self-core review only. Never a partner eligibility calculation. */
export function deriveIntakeProgress(
  state: IndividualIntakeState,
): IndividualIntakeState {
  const active = activeIntakeConsent(state.consent);
  const completed = active
    ? REQUIRED_INSTRUMENT_IDS.filter((id) => Boolean(currentResult(state, id)))
    : [];
  const reviewed = active
    ? REQUIRED_INSTRUMENT_IDS.filter((id) => {
        const results = state.attempts.filter(
          (a) =>
            a.instrument_id === id &&
            a.instrument_version === getInstrumentDefinition(id).version &&
            a.consent_revision === state.consent?.revision &&
            a.status === "completed",
        );
        return (
          results.length > 0 && results.every((a) => Boolean(a.reviewed_at))
        );
      })
    : [];
  return {
    ...state,
    completed_ids: [...completed],
    reviewed_ids: [...reviewed],
    core_reviewed_complete:
      reviewed.length === 3 &&
      Boolean(
        state.profile?.reviewed_at &&
        state.profile.consent_revision === state.consent?.revision,
      ),
  };
}
export interface IntakeOperationToken {
  readonly expectedOwner: string;
  readonly identityKey: string;
  readonly identityGeneration: number;
  readonly generation: number;
  readonly originGeneration: number;
  readonly consentRevision: number | null;
}
/** Guards survive pending promises, but never an account switch, withdrawal, or unmount. */
export class IntakeLifetime {
  private alive = true;
  private generation = 0;
  private originGeneration = 0;
  private consentRevision: number | null = null;
  constructor(
    readonly expectedOwner: string,
    readonly preview: boolean,
  ) {}
  capture(): IntakeOperationToken {
    return Object.freeze({
      expectedOwner: this.expectedOwner,
      identityKey: intakeIdentityKey(this.expectedOwner, this.preview),
      identityGeneration,
      generation: this.generation,
      originGeneration: this.originGeneration,
      consentRevision: this.consentRevision,
    });
  }
  isCurrent(token: IntakeOperationToken): boolean {
    return (
      this.isOriginCurrent(token) &&
      token.generation === this.generation &&
      token.consentRevision === this.consentRevision
    );
  }
  /** Same mounted account/global epoch and initiating local privacy intent. */
  isOriginCurrent(token: IntakeOperationToken): boolean {
    return (
      this.alive &&
      token.expectedOwner === this.expectedOwner &&
      token.identityKey === identity &&
      token.identityGeneration === identityGeneration &&
      token.originGeneration === this.originGeneration
    );
  }
  /** Settlement only: caller must prove the exact consent committed by this operation. */
  isCurrentAfterConsent(
    token: IntakeOperationToken,
    confirmedRevision: number,
  ): boolean {
    return (
      this.isCurrent(token) ||
      (this.isOriginCurrent(token) &&
        this.generation === token.generation + 1 &&
        this.consentRevision === confirmedRevision &&
        confirmedRevision !== token.consentRevision)
    );
  }
  updateConsent(revision: number | null) {
    if (revision !== this.consentRevision) {
      this.consentRevision = revision;
      this.generation++;
    }
  }
  activate() {
    this.alive = true;
    this.generation++;
    this.originGeneration++;
  }
  invalidate() {
    this.generation++;
    this.originGeneration++;
  }
  dispose() {
    this.alive = false;
    this.generation++;
    this.originGeneration++;
  }
}
export const INTAKE_STALE_MESSAGE =
  "Your account, consent, or screen changed. This action was cancelled; no content was transferred to another account.";
export function assertIntakeCurrent(isCurrent: () => boolean) {
  if (!isCurrent()) throw new Error(INTAKE_STALE_MESSAGE);
}
