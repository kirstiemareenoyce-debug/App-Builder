import { useEffect, useState } from "react";
import { router, useLocalSearchParams, type Href } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { useIndividualIntake } from "@/hooks/use-individual-intake";
import { getInstrumentDefinition } from "@/lib/individual-intake/definitions";
import { currentDraft } from "@/lib/individual-intake/client-state";
import { validateAnswerSnapshot } from "@/lib/individual-intake/client";
import {
  REQUIRED_INSTRUMENT_IDS,
  type InstrumentId,
  type IntakeAnswers,
  type IntakeAttempt,
} from "@/lib/individual-intake/types";
import {
  Body,
  Button,
  Card,
  ConfirmModal,
  IntakeScreen,
  Label,
  intakeColors,
  styles,
  useIntakeScreenGuard,
} from "@/lib/individual-intake/ui";
export default function QuestionnaireRoute() {
  const { instrumentId, attemptId } = useLocalSearchParams<{
    instrumentId?: string;
    attemptId?: string;
  }>();
  const intake = useIndividualIntake();
  if (!REQUIRED_INSTRUMENT_IDS.includes(instrumentId as InstrumentId))
    return (
      <IntakeScreen title="Questionnaire">
        <Body>This instrument is not part of the approved adult core.</Body>
      </IntakeScreen>
    );
  return (
    <Questionnaire
      key={`${intake.identityKey}:${instrumentId}:${attemptId ?? "current"}`}
      id={instrumentId as InstrumentId}
      attemptId={attemptId}
    />
  );
}
function Questionnaire({
  id,
  attemptId,
}: {
  id: InstrumentId;
  attemptId?: string;
}) {
  const intake = useIndividualIntake();
  const capture = useIntakeScreenGuard();
  const definition = getInstrumentDefinition(id);
  const attempt = intake.state
    ? attemptId
      ? intake.state.attempts.find(
          (a) => a.id === attemptId && a.instrument_id === id,
        )
      : currentDraft(intake.state, id)
    : undefined;
  const [answers, setAnswers] = useState<IntakeAnswers>({});
  const [position, setPosition] = useState(0);
  const [initialized, setInitialized] = useState<string | null>(null);
  const [submitConfirm, setSubmitConfirm] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    if (attempt && initialized !== attempt.id) {
      setAnswers({ ...attempt.answers });
      const firstMissing = definition.items.findIndex(
        (item) => attempt.answers[item.id] === undefined,
      );
      setPosition(firstMissing < 0 ? 0 : firstMissing);
      setInitialized(attempt.id);
    }
  }, [attempt, initialized, definition]);
  const item = definition.items[position];
  const answered = definition.items.filter(
    (question) => answers[question.id] !== undefined,
  ).length;
  const complete = answered === definition.items.length;
  const editable = Boolean(
    attempt &&
    attempt.status === "draft" &&
    attempt.consent_revision === intake.state?.consent?.revision &&
    intake.canProcess,
  );
  async function save(snapshot: IntakeAnswers): Promise<IntakeAttempt | null> {
    if (!attempt || !editable) return null;
    const isCurrent = capture();
    const result = await intake.run({
      kind: "save",
      attempt: { ...attempt },
      answers: { ...snapshot },
    });
    if (!isCurrent() || !result || !("answers" in result)) return null;
    setMessage(
      intake.preview
        ? "Saved in session memory only."
        : "Draft saved to your account.",
    );
    return result;
  }
  async function step(next: number, skip: boolean) {
    const isCurrent = capture();
    const snapshot = { ...answers };
    if (skip) {
      delete snapshot[item.id];
      setAnswers(snapshot);
    }
    setMessage(null);
    const saved = await save(snapshot);
    if (saved && isCurrent())
      setPosition(Math.max(0, Math.min(definition.items.length - 1, next)));
  }
  async function submit() {
    const isCurrent = capture();
    setSubmitConfirm(false);
    try {
      validateAnswerSnapshot(id, answers, true);
    } catch {
      setMessage(
        "Answer every item before submitting. Skipped items stay incomplete.",
      );
      return;
    }
    const saved = await save(answers);
    if (!saved || !isCurrent()) return;
    const result = await intake.run({ kind: "finalize", attempt: saved });
    if (result && "id" in result && isCurrent())
      router.replace({
        pathname: "/individual/results",
        params: { attemptId: result.id },
      } as Href);
  }
  return (
    <IntakeScreen title={definition.shortTitle}>
      <Card>
        <Label>{definition.title}</Label>
        <Body>{definition.instructions}</Body>
        <Text style={styles.mint}>{definition.timeframe}</Text>
        <Body>
          Choose your own answer. Skipping leaves this item unanswered; missing
          answers are never scored as zero. No AI interpretation or partner
          access.
        </Body>
      </Card>
      {!attempt ? (
        <Card>
          <Body>
            No saved current draft is open. Starting creates a new draft without
            answers; a sealed result is never edited.
          </Body>
          <Button
            label="Start this questionnaire"
            disabled={!intake.canProcess || intake.busy}
            onPress={() => {
              const isCurrent = capture();
              void intake
                .run({ kind: "start", instrumentId: id })
                .then((result) => {
                  if (result && "id" in result && isCurrent())
                    router.replace({
                      pathname: "/individual/questionnaire/[instrumentId]",
                      params: { instrumentId: id, attemptId: result.id },
                    } as Href);
                });
            }}
          />
        </Card>
      ) : attempt.status === "completed" ? (
        <Card>
          <Label>This attempt is sealed</Label>
          <Body>
            Review its result, or start a new attempt from your core. Sealed
            answers cannot be changed.
          </Body>
          <Button
            label="View sealed result"
            onPress={() =>
              router.push({
                pathname: "/individual/results",
                params: { attemptId: attempt.id },
              } as Href)
            }
          />
        </Card>
      ) : (
        <>
          <Card>
            <Text style={styles.mint}>
              Item {position + 1} of {definition.items.length} · {answered}/
              {definition.items.length} answered
            </Text>
            <View
              accessibilityRole="progressbar"
              accessibilityValue={{
                min: 0,
                max: definition.items.length,
                now: answered,
              }}
              style={{
                height: 5,
                borderRadius: 5,
                backgroundColor: intakeColors.border,
              }}
            >
              <View
                style={{
                  height: 5,
                  width: `${(answered / definition.items.length) * 100}%`,
                  borderRadius: 5,
                  backgroundColor: intakeColors.mint,
                }}
              />
            </View>
            <Label>{item.text}</Label>
            {definition.options.map((option) => (
              <Pressable
                key={option.value}
                accessibilityRole="radio"
                accessibilityState={{
                  checked: answers[item.id] === option.value,
                  disabled: !editable || intake.busy,
                }}
                disabled={!editable || intake.busy}
                onPress={() => {
                  setAnswers((previous) => ({
                    ...previous,
                    [item.id]: option.value,
                  }));
                  setMessage(null);
                }}
                style={[
                  styles.button,
                  styles.secondary,
                  answers[item.id] === option.value && {
                    borderColor: intakeColors.mint,
                    backgroundColor: "#132A20",
                  },
                ]}
              >
                <Text
                  style={{
                    color:
                      answers[item.id] === option.value
                        ? intakeColors.mint
                        : intakeColors.ivory,
                    fontSize: 15,
                  }}
                >
                  {option.label}
                </Text>
              </Pressable>
            ))}
            {!editable && (
              <Body>
                Consent has changed or been withdrawn. This saved draft is
                read-only; review consent and start a new attempt to continue
                processing.
              </Body>
            )}
            <Button
              label="Previous"
              secondary
              disabled={!editable || intake.busy || position === 0}
              onPress={() => {
                void step(position - 1, false);
              }}
            />
            <Button
              label={
                position === definition.items.length - 1
                  ? "Save this item"
                  : "Save and next"
              }
              disabled={!editable || intake.busy}
              onPress={() => {
                void step(position + 1, false);
              }}
            />
            <Button
              label="Skip — leave unanswered"
              secondary
              disabled={!editable || intake.busy}
              onPress={() => {
                void step(position + 1, true);
              }}
            />
            <Button
              label="Save and pause"
              secondary
              disabled={!editable || intake.busy}
              onPress={() => {
                const isCurrent = capture();
                void save(answers).then((saved) => {
                  if (saved && isCurrent())
                    router.replace("/individual" as Href);
                });
              }}
            />
          </Card>
          <Card>
            <Label>
              {complete ? "All items answered" : "Still incomplete"}
            </Label>
            <Body>
              {complete
                ? "Submission validates every answer, computes the deterministic result, and seals this attempt. Review the result separately afterward."
                : `${definition.items.length - answered} item(s) remain unanswered. You can pause, but cannot submit an incomplete questionnaire.`}
            </Body>
            <Button
              label="Submit complete questionnaire"
              disabled={!complete || !editable || intake.busy}
              onPress={() => setSubmitConfirm(true)}
            />
          </Card>
        </>
      )}
      {message && (
        <Text accessibilityLiveRegion="polite" style={styles.mint}>
          {message}
        </Text>
      )}
      <Card>
        <Body>{definition.attribution}</Body>
        <Body>{definition.rightsSummary}</Body>
      </Card>
      <ConfirmModal
        visible={submitConfirm}
        title="Submit and seal this attempt?"
        message="Every item must be answered. A deterministic score will be saved; this is not a diagnosis or a fitness/partner decision. This attempt becomes read-only. You can later delete it or start a new attempt."
        confirmLabel="Submit my complete answers"
        busy={intake.busy}
        onCancel={() => setSubmitConfirm(false)}
        onConfirm={() => {
          void submit();
        }}
      />
    </IntakeScreen>
  );
}
