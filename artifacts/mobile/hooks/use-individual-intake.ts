import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useKairosAuth } from "@/providers/supabase-auth-provider";
import { getOptionalSupabaseClient } from "@/lib/supabase";
import {
  createIndividualIntakeClient,
  intakeErrorMessage,
  IntakeClientError,
  type IntakeCommand,
  type IntakeCommandResult,
} from "@/lib/individual-intake/client";
import {
  activeIntakeConsent,
  assertIntakeCurrent,
  bindIndividualIntakeIdentity,
  emptyIntakeState,
  intakeIdentityKey,
  IntakeLifetime,
  type IntakeOperationToken,
} from "@/lib/individual-intake/client-state";
import {
  dispatchIndividualIntakeExport,
  prepareIndividualIntakeExport,
  type IntakeExportFormat,
  type IntakeExportSelection,
} from "@/lib/individual-intake/export";
import { useIndividualIntakePreviewStore } from "@/store/use-individual-intake-preview-store";
import type {
  IndividualIntakeState,
  IntakeAttempt,
} from "@/lib/individual-intake/types";

export const individualIntakeQueryKey = (owner: string, preview: boolean) =>
  ["individual-intake", intakeIdentityKey(owner, preview)] as const;
interface OwnedState {
  identity: string;
  state: IndividualIntakeState;
}
export interface IndividualIntakeMutationVariables {
  readonly expectedOwner: string;
  readonly token: IntakeOperationToken;
  readonly command: IntakeCommand;
}
const EMPTY_PREVIEW_STATE = emptyIntakeState();
export function useIndividualIntakeController() {
  const { user } = useKairosAuth();
  const owner = user?.id ?? "";
  const preview = Boolean(user?.isPreview);
  const key = intakeIdentityKey(owner, preview);
  // Synchronous masking also protects callbacks before previous effect cleanup.
  bindIndividualIntakeIdentity(owner || null, preview);
  const lifetime = useMemo(
    () => new IntakeLifetime(owner, preview),
    [owner, preview],
  );
  const client = useMemo(
    () =>
      createIndividualIntakeClient(
        preview ? null : getOptionalSupabaseClient(),
      ),
    [preview],
  );
  const qc = useQueryClient();
  const previewState = useIndividualIntakePreviewStore((s) => s.state);
  const previewOwner = useIndividualIntakePreviewStore((s) => s.expectedOwner);
  const [visible, setVisible] = useState<OwnedState | null>(null);
  const [errorState, setError] = useState<{
    identity: string;
    message: string;
  } | null>(null);
  const [blockedState, setBlocked] = useState<IntakeLifetime | null>(null);
  const processingBlocked = useRef<IntakeLifetime | null>(null);
  const running = useRef<IntakeOperationToken | null>(null);
  const [working, setWorking] = useState<IntakeOperationToken | null>(null);
  const previewReceipts = useRef(
    new WeakMap<IntakeOperationToken, IndividualIntakeState>(),
  );
  const cloudState = visible?.identity === key ? visible.state : null;
  const state = owner
    ? preview
      ? previewOwner === owner
        ? previewState
        : EMPTY_PREVIEW_STATE
      : cloudState
    : null;
  const stateRef = useRef(state);
  stateRef.current = state;
  const consentBlocked = blockedState === lifetime;
  useLayoutEffect(() => {
    lifetime.activate();
    return () => lifetime.dispose();
  }, [lifetime]);
  useLayoutEffect(() => {
    if (state) lifetime.updateConsent(state.consent?.revision ?? null);
  }, [lifetime, state]);
  const query = useQuery({
    queryKey: individualIntakeQueryKey(owner, preview),
    enabled: Boolean(owner && !preview),
    meta: { sensitive: true, prefix: "individual-intake" },
    retry: false,
    staleTime: 0,
    gcTime: 0,
    queryFn: async () => {
      const token = lifetime.capture();
      const data = await client.getState({
        expectedOwner: token.expectedOwner,
        isCurrent: () => lifetime.isCurrent(token),
      });
      assertIntakeCurrent(() => lifetime.isCurrent(token));
      return { identity: key, state: data, token };
    },
  });
  useEffect(() => {
    if (query.data?.identity === key && lifetime.isCurrent(query.data.token)) {
      lifetime.updateConsent(query.data.state.consent?.revision ?? null);
      setVisible({ identity: key, state: query.data.state });
      processingBlocked.current = null;
      setBlocked(null);
    }
  }, [query.data, key, lifetime]);
  const mutation = useMutation<
    IntakeCommandResult,
    Error,
    IndividualIntakeMutationVariables
  >({
    mutationKey: ["individual-intake", key, "write"],
    meta: { sensitive: true, prefix: "individual-intake" },
    retry: false,
    mutationFn: async (variables) => {
      if (
        variables.expectedOwner !== owner ||
        variables.expectedOwner !== variables.token.expectedOwner
      )
        throw new IntakeClientError(
          "Your account changed. This action was cancelled.",
          "account",
        );
      // MutationObserver can queue work while newer state/options are rendered.
      // The initiating token, never stateRef after an await, owns its generation.
      const context = Object.freeze({
        expectedOwner: variables.expectedOwner,
        expectedConsentRevision: variables.token.consentRevision ?? 0,
        isCurrent: () => lifetime.isCurrent(variables.token),
      });
      assertIntakeCurrent(context.isCurrent);
      const privacyAction =
        variables.command.kind === "consent" ||
        variables.command.kind === "deleteAll" ||
        variables.command.kind === "deleteAttempt";
      if (
        !privacyAction &&
        (processingBlocked.current === lifetime ||
          !activeIntakeConsent(stateRef.current?.consent))
      )
        throw new IntakeClientError(
          "Current adult, assessment, and storage consent is required for new processing.",
          "consent",
        );
      if (!preview) return client.execute(variables.command, context);
      const result = useIndividualIntakePreviewStore
        .getState()
        .execute(variables.command, context);
      if (
        variables.command.kind === "consent" ||
        variables.command.kind === "deleteAll"
      ) {
        // execute publishes synchronously: a mounted layout effect can already
        // have advanced consent. Capture the exact commit before promise settling.
        previewReceipts.current.set(
          variables.token,
          useIndividualIntakePreviewStore.getState().state,
        );
      }
      return result;
    },
  });
  async function run(
    command: IntakeCommand,
  ): Promise<IntakeCommandResult | null> {
    if (!owner) return null;
    const destructive =
      command.kind === "deleteAll" ||
      command.kind === "deleteAttempt" ||
      command.kind === "consent";
    // A newer privacy intent must win, including while an older grant settles.
    if (
      running.current &&
      lifetime.isOriginCurrent(running.current) &&
      !destructive
    )
      return null;
    if (
      !destructive &&
      (processingBlocked.current === lifetime ||
        consentBlocked ||
        !activeIntakeConsent(stateRef.current?.consent))
    ) {
      setError({
        identity: key,
        message:
          "Review your 18+ attestation and both consent acknowledgments before new processing.",
      });
      return null;
    }
    if (
      command.kind === "consent" ||
      command.kind === "deleteAll" ||
      command.kind === "deleteAttempt"
    ) {
      // Cancel older load/completion/export work before the privacy request begins.
      lifetime.invalidate();
      void qc.cancelQueries({
        queryKey: individualIntakeQueryKey(owner, preview),
      });
      if (command.kind !== "deleteAttempt") {
        processingBlocked.current = lifetime;
        setBlocked(lifetime);
      }
    }
    const token = lifetime.capture();
    const context = {
      expectedOwner: token.expectedOwner,
      isCurrent: () => lifetime.isCurrent(token),
    };
    running.current = token;
    setWorking(token);
    setError(null);
    try {
      const result = await mutation.mutateAsync(
        Object.freeze({ expectedOwner: owner, token, command }),
      );
      if (
        preview &&
        (command.kind === "consent" || command.kind === "deleteAll")
      ) {
        const receipt = previewReceipts.current.get(token);
        const confirmed = receipt?.consent;
        const current = useIndividualIntakePreviewStore.getState();
        const expected = token.consentRevision ?? 0;
        const confirmedCommand =
          confirmed &&
          (command.kind === "consent"
            ? result === confirmed &&
              confirmed.revision >= expected &&
              confirmed.revision <= expected + 1 &&
              confirmed.adult_confirmed === command.adult &&
              confirmed.assessment_consent === command.assessment &&
              confirmed.storage_consent === command.storage &&
              activeIntakeConsent(confirmed) ===
                (command.adult && command.assessment && command.storage)
            : confirmed.revision === expected + 1 &&
              !confirmed.adult_confirmed &&
              !confirmed.assessment_consent &&
              !confirmed.storage_consent &&
              confirmed.granted_at === null &&
              Boolean(confirmed.revoked_at) &&
              receipt.attempts.length === 0 &&
              receipt.profile === null);
        // Never accept an arbitrary fresh token: only this exact store commit,
        // under the captured account epoch, mount, and local privacy intent.
        assertIntakeCurrent(
          () =>
            Boolean(confirmedCommand) &&
            current.expectedOwner === token.expectedOwner &&
            current.state === receipt &&
            lifetime.isCurrentAfterConsent(token, confirmed!.revision),
        );
      } else assertIntakeCurrent(context.isCurrent);
      let next = stateRef.current ?? emptyIntakeState();
      if (preview) next = useIndividualIntakePreviewStore.getState().state;
      else if (command.kind === "consent")
        next = {
          ...next,
          consent: result as IndividualIntakeState["consent"],
          completed_ids: [],
          reviewed_ids: [],
          core_reviewed_complete: false,
        };
      else if (command.kind === "deleteAll")
        next = { ...emptyIntakeState(), consent: null };
      else if (command.kind === "deleteAttempt")
        next = {
          ...next,
          attempts: next.attempts.filter((a) => a.id !== command.attemptId),
          core_reviewed_complete: false,
        };
      else if (command.kind === "profile")
        next = {
          ...next,
          profile: result as NonNullable<IndividualIntakeState["profile"]>,
        };
      else {
        const row = result as IntakeAttempt;
        next = {
          ...next,
          attempts: [row, ...next.attempts.filter((a) => a.id !== row.id)],
        };
      }
      setVisible({ identity: key, state: next });
      stateRef.current = next;
      lifetime.updateConsent(next.consent?.revision ?? null);
      if (command.kind !== "deleteAttempt") {
        processingBlocked.current = null;
        setBlocked(null);
      }
      // Load authoritative readiness, rather than inventing eligibility locally.
      if (!preview) {
        const refreshToken = lifetime.capture();
        try {
          const refreshed = await client.getState({
            expectedOwner: owner,
            isCurrent: () => lifetime.isCurrent(refreshToken),
          });
          assertIntakeCurrent(() => lifetime.isCurrent(refreshToken));
          lifetime.updateConsent(refreshed.consent?.revision ?? null);
          setVisible({ identity: key, state: refreshed });
          stateRef.current = refreshed;
        } catch {
          if (lifetime.isCurrent(refreshToken))
            setError({
              identity: key,
              message:
                "The action was confirmed, but current progress could not be refreshed. Reload before continuing.",
            });
          else return null;
        }
      }
      return result;
    } catch (error) {
      if (lifetime.isCurrent(token))
        setError({ identity: key, message: intakeErrorMessage(error) });
      return null;
    } finally {
      previewReceipts.current.delete(token);
      if (running.current === token) {
        running.current = null;
        // Consent can advance on success; account/mount/privacy origin cannot.
        if (lifetime.isOriginCurrent(token)) setWorking(null);
      }
    }
  }
  async function exportSelected(
    selection: IntakeExportSelection,
    format: IntakeExportFormat,
    screenCurrent: () => boolean = () => true,
  ): Promise<boolean> {
    if (
      (running.current && lifetime.isOriginCurrent(running.current)) ||
      !stateRef.current ||
      !owner
    )
      return false;
    const token = lifetime.capture();
    const isCurrent = () => lifetime.isCurrent(token) && screenCurrent();
    const snapshot = stateRef.current;
    running.current = token;
    setWorking(token);
    setError(null);
    try {
      const file = prepareIndividualIntakeExport(
        snapshot,
        owner,
        selection,
        format,
        preview,
      );
      await dispatchIndividualIntakeExport(file, {
        isCurrent,
        verifyCurrent: async () => {
          assertIntakeCurrent(isCurrent);
          if (!preview) {
            await client.assertOwner({ expectedOwner: owner, isCurrent });
            const latest = await client.getState({
              expectedOwner: owner,
              isCurrent,
            });
            if (
              latest.consent?.revision !== snapshot.consent?.revision ||
              JSON.stringify(latest.consent) !==
                JSON.stringify(snapshot.consent)
            )
              throw new IntakeClientError(
                "Your consent changed. Review the current records before exporting.",
                "consent",
              );
            const selectedStillCurrent = selection.attemptIds.every((id) => {
              const old = snapshot.attempts.find((a) => a.id === id);
              const current = latest.attempts.find((a) => a.id === id);
              return old && current && old.revision === current.revision;
            });
            if (
              !selectedStillCurrent ||
              (selection.includeProfile &&
                latest.profile?.revision !== snapshot.profile?.revision)
            )
              throw new IntakeClientError(
                "Your selected data changed. Review your export selection again.",
                "revision",
              );
          }
          assertIntakeCurrent(isCurrent);
        },
      });
      return isCurrent();
    } catch (error) {
      if (isCurrent())
        setError({ identity: key, message: intakeErrorMessage(error) });
      return false;
    } finally {
      if (running.current === token) {
        running.current = null;
        // A screen may blur while its provider remains. Release only its busy
        // metadata, never a newer operation's slot or stale account content.
        if (lifetime.isOriginCurrent(token)) setWorking(null);
      }
    }
  }
  return {
    owner,
    preview,
    identityKey: key,
    state:
      state && consentBlocked
        ? {
            ...state,
            completed_ids: [],
            reviewed_ids: [],
            core_reviewed_complete: false,
          }
        : state,
    loading: Boolean(owner && !preview && !state && query.isPending),
    error:
      errorState?.identity === key
        ? errorState.message
        : query.error
          ? intakeErrorMessage(query.error)
          : null,
    busy: Boolean(working && lifetime.isOriginCurrent(working)),
    canProcess: Boolean(
      owner && state && !consentBlocked && activeIntakeConsent(state.consent),
    ),
    run,
    exportSelected,
    reload: () => {
      setError(null);
      return query.refetch();
    },
    captureGuard: () => {
      const token = lifetime.capture();
      return () => lifetime.isCurrent(token);
    },
  };
}
type IntakeContextValue = ReturnType<typeof useIndividualIntakeController>;
const IntakeContext = createContext<IntakeContextValue | null>(null);
export function IndividualIntakeProvider({
  children,
}: {
  children: ReactNode;
}) {
  return createElement(
    IntakeContext.Provider,
    { value: useIndividualIntakeController() },
    children,
  );
}
export function useIndividualIntake(): IntakeContextValue {
  const value = useContext(IntakeContext);
  if (!value)
    throw new Error(
      "Individual intake routes require IndividualIntakeProvider.",
    );
  return value;
}
