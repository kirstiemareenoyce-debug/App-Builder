import { useEffect, useState } from "react";
import { Text, TextInput } from "react-native";
import { useIndividualIntake } from "@/hooks/use-individual-intake";
import { emptySelfDescription } from "@/lib/individual-intake/client-state";
import {
  SELF_DESCRIPTION_FIELDS,
  type SelfDescription,
  type SelfDescriptionField,
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
const labels: Record<SelfDescriptionField, string> = {
  values: "Values",
  emotions: "Emotions",
  coping: "Coping",
  support: "Support",
  boundaries: "Boundaries",
  learningGoals: "Learning goals",
};
export default function ProfileRoute() {
  const intake = useIndividualIntake();
  return <ProfileEditor key={intake.identityKey} />;
}
function ProfileEditor() {
  const intake = useIndividualIntake();
  const capture = useIntakeScreenGuard();
  const profile = intake.state?.profile;
  const [body, setBody] = useState<SelfDescription>(emptySelfDescription);
  const [dirty, setDirty] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    if (!dirty) setBody(profile ? { ...profile.body } : emptySelfDescription());
  }, [profile, dirty]);
  async function save(review: boolean) {
    const isCurrent = capture();
    setConfirm(false);
    const result = await intake.run({
      kind: "profile",
      expectedRevision: profile?.revision ?? 0,
      body: { ...body },
      review,
    });
    if (result && "body" in result && isCurrent()) {
      setDirty(false);
      setMessage(
        review
          ? "Your practical self-description review is saved. Blank optional fields remain blank."
          : "Draft saved. Changes reset the profile review until you deliberately review again.",
      );
    }
  }
  return (
    <IntakeScreen title="My Practical Self-description">
      <Card>
        <Label>Your words, not an inferred profile</Label>
        <Body>
          These six fields are optional strings, up to 1,000 characters each.
          Keep things practical. You may leave every field blank and still
          deliberately review your profile; Kairos does not invent a meaning for
          omitted detail.
        </Body>
        <Body>
          You do not need to disclose trauma, diagnoses, or intimate
          experiences. Nothing here is sent to AI or made accessible to a
          partner. Questionnaire scores do not determine fitness or partner
          permission.
        </Body>
        <Text style={styles.mint}>
          {profile?.reviewed_at &&
          profile.consent_revision === intake.state?.consent?.revision
            ? "Current profile reviewed"
            : "Review not yet complete for current consent"}
        </Text>
      </Card>
      {SELF_DESCRIPTION_FIELDS.map((field) => (
        <Card key={field}>
          <Label>{labels[field]} (optional)</Label>
          <TextInput
            accessibilityLabel={`${labels[field]}, optional`}
            multiline
            maxLength={1000}
            value={body[field]}
            editable={intake.canProcess && !intake.busy}
            onChangeText={(value) => {
              setBody((previous) => ({ ...previous, [field]: value }));
              setDirty(true);
              setMessage(null);
            }}
            placeholder="Leave blank, or describe this in your own words"
            placeholderTextColor={intakeColors.muted}
            style={styles.input}
          />
          <Body>{body[field].length}/1,000 characters</Body>
        </Card>
      ))}
      {!intake.canProcess && (
        <Card>
          <Body>
            New processing is blocked without current adult and both consent
            acknowledgments. Your saved own profile remains available in private
            history for viewing, selected export, or deletion.
          </Body>
        </Card>
      )}
      <Button
        label="Save optional description draft"
        secondary
        disabled={!intake.canProcess || intake.busy}
        onPress={() => {
          void save(false);
        }}
      />
      <Button
        label="Review my self-description"
        disabled={!intake.canProcess || intake.busy}
        onPress={() => setConfirm(true)}
      />
      {message && (
        <Text accessibilityLiveRegion="polite" style={styles.mint}>
          {message}
        </Text>
      )}
      <ConfirmModal
        visible={confirm}
        title="Review your personal description?"
        message="I have reviewed my six optional fields, including any fields I intentionally left blank. These are my own words, not an AI interpretation, a diagnosis, a fitness judgment, or partner permission. Save this version as deliberately reviewed."
        confirmLabel="Save my reviewed self-description"
        busy={intake.busy}
        onCancel={() => setConfirm(false)}
        onConfirm={() => {
          void save(true);
        }}
      />
    </IntakeScreen>
  );
}
