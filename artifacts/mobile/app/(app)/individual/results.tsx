import { useState } from "react";
import { useLocalSearchParams } from "expo-router";
import { Text } from "react-native";
import { useIndividualIntake } from "@/hooks/use-individual-intake";
import { getInstrumentDefinition } from "@/lib/individual-intake/definitions";
import { currentResult } from "@/lib/individual-intake/client-state";
import {
  INTAKE_EXPORT_PRIVACY,
  type IntakeExportFormat,
} from "@/lib/individual-intake/export";
import {
  SELF_DESCRIPTION_FIELDS,
  type IntakeAttempt,
  type IntakeScore,
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
export default function ResultsRoute() {
  const intake = useIndividualIntake();
  return <Results key={intake.identityKey} />;
}
function Score({ score }: { score: IntakeScore }) {
  return (
    <>
      {score.kind === "gad7-sum" && (
        <Label>
          GAD-7 total: {score.rawScore}/{score.maximum} · {score.band}
        </Label>
      )}
      {score.kind === "asrs6-count" && (
        <Label>
          ASRS Part A: {score.thresholdCount} shaded-threshold responses ·{" "}
          {score.screenPositive
            ? "Screen threshold reached"
            : "Screen threshold not reached"}
        </Label>
      )}
      {score.kind === "ipip50-keyed" &&
        score.traits?.map((trait) => (
          <Body key={trait.id}>
            {trait.title}: {trait.score} ({trait.minimum}–{trait.maximum}) ·
            item mean {trait.mean.toFixed(2)}
          </Body>
        ))}
      <Body>{score.explanation}</Body>
    </>
  );
}
function Results() {
  const intake = useIndividualIntake();
  const capture = useIntakeScreenGuard();
  const { attemptId } = useLocalSearchParams<{ attemptId?: string }>();
  const [selected, setSelected] = useState<string[]>([]);
  const [includeAnswers, setIncludeAnswers] = useState(false);
  const [includeProfile, setIncludeProfile] = useState(false);
  const [confirmation, setConfirmation] = useState<
    | { kind: "review" | "delete"; attempt: IntakeAttempt }
    | { kind: "export"; format: IntakeExportFormat }
    | null
  >(null);
  const [message, setMessage] = useState<string | null>(null);
  const state = intake.state;
  const attempts = state?.attempts ?? [];
  const ordered = [...attempts].sort((a, b) =>
    a.id === attemptId
      ? -1
      : b.id === attemptId
        ? 1
        : b.started_at.localeCompare(a.started_at),
  );
  async function confirm() {
    const choice = confirmation;
    setConfirmation(null);
    if (!choice) return;
    const isCurrent = capture();
    if (choice.kind === "export") {
      const done = await intake.exportSelected(
        { attemptIds: [...selected], includeAnswers, includeProfile },
        choice.format,
        isCurrent,
      );
      if (done && isCurrent())
        setMessage(
          "Your selected export was dispatched. Copies are outside Kairos privacy controls.",
        );
    } else {
      const result = await intake.run(
        choice.kind === "review"
          ? { kind: "review", attempt: { ...choice.attempt } }
          : { kind: "deleteAttempt", attemptId: choice.attempt.id },
      );
      if (result && isCurrent()) {
        setMessage(
          choice.kind === "review"
            ? "Result deliberately reviewed. This grants no partner permission."
            : "This intake attempt was deleted. Previously exported copies were not removed.",
        );
        if (choice.kind === "delete")
          setSelected((previous) =>
            previous.filter((id) => id !== choice.attempt.id),
          );
      }
    }
  }
  return (
    <IntakeScreen title="My Private Results">
      <Card>
        <Label>Your results belong to you</Label>
        <Body>
          Self-report screening and personality descriptions are not diagnoses,
          treatment, fitness judgments, or permission to connect. No AI
          interpretation or partner access. Review each current sealed result
          deliberately; reruns create new attempts rather than editing sealed
          records.
        </Body>
        <Body>
          With withdrawn consent you can still view your own history, select an
          export, or delete. New scoring, saving, and review processing remain
          blocked until new active consent.
        </Body>
      </Card>
      {attemptId && !attempts.some((a) => a.id === attemptId) && (
        <Body>
          This selected attempt is unavailable for the current account.
        </Body>
      )}
      {!attempts.length && (
        <Card>
          <Body>
            No saved results or drafts yet. Start from your adult core; preview
            has no prefilled scores.
          </Body>
        </Card>
      )}
      {ordered.map((attempt) => {
        const definition = getInstrumentDefinition(attempt.instrument_id);
        const current =
          state &&
          currentResult(state, attempt.instrument_id)?.id === attempt.id &&
          attempt.consent_revision === state.consent?.revision;
        const currentGeneration =
          attempt.consent_revision === state?.consent?.revision &&
          attempt.instrument_version === definition.version;
        return (
          <Card key={attempt.id}>
            <Label>{definition.title}</Label>
            <Body>
              {attempt.instrument_version} · revision {attempt.revision} ·
              started {new Date(attempt.started_at).toLocaleDateString()}
            </Body>
            <Text style={styles.mint}>
              {attempt.status === "draft"
                ? "Incomplete saved draft"
                : current
                  ? "Current sealed result"
                  : "Earlier sealed result"}
              {attempt.reviewed_at ? " · Reviewed" : " · Not reviewed"}
            </Text>
            {attempt.result ? (
              <>
                <Score score={attempt.result} />
                <Body>{definition.resultNote}</Body>
                <Button
                  label={
                    attempt.reviewed_at
                      ? "Result already reviewed"
                      : "Review this result"
                  }
                  disabled={
                    !intake.canProcess ||
                    !currentGeneration ||
                    Boolean(attempt.reviewed_at) ||
                    intake.busy
                  }
                  onPress={() => setConfirmation({ kind: "review", attempt })}
                />
              </>
            ) : (
              <Body>
                {Object.keys(attempt.answers).length}/{definition.items.length}{" "}
                items answered. No score exists until every item is answered and
                submitted.
              </Body>
            )}
            <Check
              label="Include this attempt in my deliberate export"
              checked={selected.includes(attempt.id)}
              disabled={intake.busy}
              onChange={(checked) =>
                setSelected((previous) =>
                  checked
                    ? [
                        ...previous.filter((id) => id !== attempt.id),
                        attempt.id,
                      ]
                    : previous.filter((id) => id !== attempt.id),
                )
              }
            />
            <Button
              label="Delete this attempt"
              secondary
              disabled={intake.busy}
              onPress={() => setConfirmation({ kind: "delete", attempt })}
            />
          </Card>
        );
      })}
      {state?.profile && (
        <Card>
          <Label>Saved practical self-description</Label>
          <Body>
            {state.profile.reviewed_at
              ? "Deliberately reviewed"
              : "Not reviewed"}{" "}
            · revision {state.profile.revision}
          </Body>
          {SELF_DESCRIPTION_FIELDS.map((field) => (
            <Body key={field}>
              {field}: {state.profile!.body[field] || "Not provided (optional)"}
            </Body>
          ))}
        </Card>
      )}
      <Card>
        <Label>Export only what you choose</Label>
        <Body>{INTAKE_EXPORT_PRIVACY}</Body>
        <Check
          label="Include raw answers for selected attempts (off by default)"
          checked={includeAnswers}
          disabled={intake.busy}
          onChange={setIncludeAnswers}
        />
        <Check
          label="Include my saved practical self-description"
          checked={includeProfile}
          disabled={intake.busy || !state?.profile}
          onChange={setIncludeProfile}
        />
        <Body>
          {selected.length} attempt(s) selected. No account/session identifiers
          or authentication secrets are included.
        </Body>
        <Button
          label="Export selected data as JSON"
          secondary
          disabled={
            intake.busy ||
            (!selected.length && !(includeProfile && state?.profile))
          }
          onPress={() => setConfirmation({ kind: "export", format: "json" })}
        />
        <Button
          label="Export selected data as text"
          secondary
          disabled={
            intake.busy ||
            (!selected.length && !(includeProfile && state?.profile))
          }
          onPress={() => setConfirmation({ kind: "export", format: "text" })}
        />
      </Card>
      {message && (
        <Text accessibilityLiveRegion="polite" style={styles.mint}>
          {message}
        </Text>
      )}
      <ConfirmModal
        visible={confirmation !== null}
        title={
          confirmation?.kind === "review"
            ? "Review this sealed result?"
            : confirmation?.kind === "delete"
              ? "Delete this attempt?"
              : "Export your selected personal data?"
        }
        message={
          confirmation?.kind === "review"
            ? "I have read this sealed result and its limitations. It is a self-report screen or description, not a diagnosis, treatment, fitness judgment, or partner permission. Record my deliberate review for this current attempt."
            : confirmation?.kind === "delete"
              ? "This permanently removes only this own intake attempt, including its answers and result. Current core progress may become incomplete. It does not delete other app records, partner links, or previous exported copies."
              : INTAKE_EXPORT_PRIVACY
        }
        confirmLabel={
          confirmation?.kind === "review"
            ? "I have reviewed this result"
            : confirmation?.kind === "delete"
              ? "Delete this own attempt"
              : "Export my selected data"
        }
        busy={intake.busy}
        onCancel={() => setConfirmation(null)}
        onConfirm={() => {
          void confirm();
        }}
      />
    </IntakeScreen>
  );
}
