import { useEffect, useState } from "react";
import { router } from "expo-router";
import { Text } from "react-native";
import { useIndividualIntake } from "@/hooks/use-individual-intake";
import { getInstrumentDefinition } from "@/lib/individual-intake/definitions";
import {
  currentDraft,
  currentResult,
} from "@/lib/individual-intake/client-state";
import {
  REQUIRED_INSTRUMENT_IDS,
  type InstrumentId,
} from "@/lib/individual-intake/types";
import {
  Body,
  Button,
  Card,
  Check,
  ConfirmModal,
  IntakeScreen,
  Label,
  styles,
  useIntakeScreenGuard,
} from "@/lib/individual-intake/ui";
export default function IndividualCore() {
  const intake = useIndividualIntake();
  const capture = useIntakeScreenGuard();
  const [adult, setAdult] = useState(false);
  const [assessment, setAssessment] = useState(false);
  const [storage, setStorage] = useState(false);
  const [confirmation, setConfirmation] = useState<
    "withdraw" | "delete" | null
  >(null);
  const state = intake.state;
  useEffect(() => {
    setAdult(false);
    setAssessment(false);
    setStorage(false);
  }, [state?.consent?.revision]);
  async function openInstrument(id: InstrumentId) {
    const isCurrent = capture();
    const attempt = await intake.run({ kind: "start", instrumentId: id });
    if (attempt && "id" in attempt && isCurrent())
      router.push({
        pathname: "/individual/questionnaire/[instrumentId]",
        params: { instrumentId: id, attemptId: attempt.id },
      });
  }
  return (
    <IntakeScreen title="My Individual Core">
      <Card>
        <Label>A clearer description of you</Label>
        <Body>
          Three self-report questionnaires and a practical personal profile, for
          adults 18 and over. They support self-reflection; they do not diagnose
          a condition, determine fitness, or grant partner permission.
        </Body>
        <Body>
          GAD-7 and ASRS use their own recall periods; personality items
          describe your general tendencies. Exact instructions and timeframes
          appear before each questionnaire. Work one item at a time and pause
          whenever you need.
        </Body>
        <Body>
          No AI interpretation, upload to AI, or partner access is part of this
          core. Trauma is optional and outside this required first core; you do
          not need to disclose trauma or intimate detail.
        </Body>
      </Card>
      {!intake.canProcess && (
        <Card>
          <Label>Your choice, separately acknowledged</Label>
          <Body>
            Account answers, results, and optional personal strings are private
            to your account and retained until you delete them. Withdrawal stops
            new processing; your own history, export, and deletion remain
            available. Previously exported copies cannot be recalled.
          </Body>
          <Check
            checked={adult}
            onChange={setAdult}
            disabled={intake.busy}
            label="I confirm I am 18 years or older."
          />
          <Check
            checked={assessment}
            onChange={setAssessment}
            disabled={intake.busy}
            label="I agree to these self-report assessments and deterministic scoring for my own reflection. I understand they are not a diagnosis."
          />
          <Check
            checked={storage}
            onChange={setStorage}
            disabled={intake.busy}
            label={
              intake.preview
                ? "I agree to keeping my chosen responses in this preview session's memory only; nothing is sent or persisted."
                : "I agree to storing my answers, results, and optional personal description privately in my account. No AI or partner access is included."
            }
          />
          <Button
            label={
              intake.preview
                ? "Begin session-only core"
                : "Save consent and begin"
            }
            disabled={
              !adult || !assessment || !storage || intake.busy || !state
            }
            onPress={() => {
              void intake.run({ kind: "consent", adult, assessment, storage });
            }}
          />
        </Card>
      )}
      <Card>
        <Label>
          {state?.core_reviewed_complete
            ? "Core reviewed"
            : "Your core progress"}
        </Label>
        <Text style={styles.mint}>
          {state?.reviewed_ids.length ?? 0} of 3 current results reviewed ·{" "}
          {state?.profile?.reviewed_at &&
          state.profile.consent_revision === state.consent?.revision
            ? "Personal profile reviewed"
            : "Personal profile review still needed"}
        </Text>
        <Body>
          “Core reviewed” means you deliberately reviewed this self-core. It is
          not live eligibility and is not a gate or permission to connect.
          Partner stages come later.
        </Body>
      </Card>
      {REQUIRED_INSTRUMENT_IDS.map((id) => {
        const definition = getInstrumentDefinition(id);
        const draft = state ? currentDraft(state, id) : undefined;
        const result = state ? currentResult(state, id) : undefined;
        return (
          <Card key={id}>
            <Label>{definition.title}</Label>
            <Body>
              {definition.items.length} items · {definition.timeframe}
            </Body>
            <Text style={styles.mint}>
              {draft
                ? `Saved draft · ${Object.keys(draft.answers).length}/${definition.items.length} answered`
                : result?.reviewed_at
                  ? "Current result reviewed"
                  : result
                    ? "Result ready for review"
                    : "Not started"}
            </Text>
            <Button
              label={
                draft
                  ? "Resume saved draft"
                  : result
                    ? "Start a new attempt"
                    : "Start questionnaire"
              }
              disabled={!intake.canProcess || intake.busy}
              onPress={() => {
                void openInstrument(id);
              }}
            />
            {result && (
              <Button
                label="View private result"
                secondary
                disabled={intake.busy}
                onPress={() =>
                  router.push({
                    pathname: "/individual/results",
                    params: { attemptId: result.id },
                  })
                }
              />
            )}
          </Card>
        );
      })}
      <Button
        label="My practical self-description"
        secondary
        onPress={() => router.push("/individual/profile")}
        disabled={intake.busy}
      />
      <Button
        label="Private history and selected export"
        secondary
        onPress={() => router.push("/individual/results")}
        disabled={intake.busy}
      />
      <Card>
        <Label>Privacy controls</Label>
        <Body>
          Withdrawal does not delete your existing records. Delete removes only
          your individual intake answers, results, and self-profile, not other
          app records or partner links. A limited consent tombstone/revision may
          remain so old completions cannot revive after regrant.
        </Body>
        <Button
          label="Withdraw assessment and storage consent"
          secondary
          disabled={intake.busy || !state?.consent}
          onPress={() => setConfirmation("withdraw")}
        />
        <Button
          label={
            intake.preview
              ? "Delete this session's intake data"
              : "Delete my individual intake data"
          }
          secondary
          disabled={intake.busy || !state}
          onPress={() => setConfirmation("delete")}
        />
      </Card>
      <ConfirmModal
        visible={confirmation !== null}
        title={
          confirmation === "withdraw"
            ? "Withdraw consent?"
            : "Delete individual intake data?"
        }
        message={
          confirmation === "withdraw"
            ? "New assessment processing stops. Your existing own history remains available to view, deliberately export, or delete. Regrant starts a new consent generation; earlier results do not regain current readiness. No partner links are changed."
            : "This removes your own individual intake answers, results, and personal profile and deactivates intake consent. It does not delete other Kairos records, partner links, or copies you already exported. A limited consent revision/tombstone may remain. This cannot be undone."
        }
        confirmLabel={
          confirmation === "withdraw"
            ? "Withdraw consent"
            : "Delete my intake data"
        }
        busy={intake.busy}
        onCancel={() => setConfirmation(null)}
        onConfirm={() => {
          const action = confirmation;
          setConfirmation(null);
          setAdult(false);
          setAssessment(false);
          setStorage(false);
          void intake.run(
            action === "withdraw"
              ? {
                  kind: "consent",
                  adult: false,
                  assessment: false,
                  storage: false,
                }
              : { kind: "deleteAll" },
          );
        }}
      />
    </IntakeScreen>
  );
}
