import { useState, type ReactNode } from "react";
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { KairosButton } from "../../components/kairos/button";
import { KairosCard } from "../../components/kairos/card";
import { ScreenHeader } from "../../components/kairos/screen-header";
import { ScreenContainer } from "../../components/screen-container";
import { useColors } from "../../hooks/use-colors";
import { useKairosAuth } from "../../providers/supabase-auth-provider";
export const workStyles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 130, gap: 14 },
  card: { gap: 10 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" },
  title: { fontSize: 18, fontWeight: "800" },
  body: { fontSize: 13, lineHeight: 20 },
  input: {
    minHeight: 46,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    fontSize: 15,
  },
});
export function WorkPage({
  title,
  subtitle,
  children,
  back = true,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  back?: boolean;
}) {
  const { user } = useKairosAuth(),
    colors = useColors();
  return (
    <ScreenContainer header={<ScreenHeader showBack={back} title={title} subtitle={subtitle} />}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={workStyles.content}
      >
        <KairosCard>
          <Text style={[workStyles.body, { color: colors.muted }]}>
            {user?.isPreview
              ? "Session-only preview: only records you add are shown. Selected files stay local; nothing is uploaded. Cleared on account/preview changes."
              : "Private Work records, separate from personal tasks and relationship media. Cloud persistence requires the separately reviewed Work setup; no partner sharing or AI ingestion."}
          </Text>
        </KairosCard>
        {children}
      </ScrollView>
    </ScreenContainer>
  );
}
export function WorkText({
  children,
  title = false,
  error = false,
}: {
  children: ReactNode;
  title?: boolean;
  error?: boolean;
}) {
  const colors = useColors();
  return (
    <Text
      accessibilityRole={error ? "alert" : undefined}
      style={[
        title ? workStyles.title : workStyles.body,
        {
          color: error
            ? colors.error
            : title
              ? colors.foreground
              : colors.muted,
        },
      ]}
    >
      {children}
    </Text>
  );
}
export function WorkField({
  label,
  value,
  onChange,
  multiline = false,
  maxLength = 200,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  maxLength?: number;
  placeholder?: string;
}) {
  const colors = useColors();
  return (
    <View style={{ gap: 6 }}>
      <Text
        style={{ color: colors.foreground, fontWeight: "700", fontSize: 13 }}
      >
        {label}
      </Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChange}
        multiline={multiline}
        maxLength={maxLength}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        autoCapitalize="none"
        style={[
          workStyles.input,
          {
            color: colors.foreground,
            borderColor: colors.border,
            backgroundColor: colors.background,
          },
          multiline ? { minHeight: 80, textAlignVertical: "top" } : {},
        ]}
      />
    </View>
  );
}
/** Controlled modal works on web as well as native (unlike native Alert on Expo Web). */
export function ConfirmWorkDelete({
  label,
  description,
  onConfirm,
  disabled = false,
}: {
  label: string;
  description: string;
  onConfirm: () => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false),
    colors = useColors();
  return (
    <>
      <KairosButton
        compact
        tone="ghost"
        label={label}
        icon="delete-outline"
        disabled={disabled}
        onPress={() => setOpen(true)}
      />
      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <View
          style={{
            flex: 1,
            justifyContent: "center",
            padding: 24,
            backgroundColor: "#0008",
          }}
        >
          <View
            accessibilityViewIsModal
            style={{
              borderRadius: 18,
              padding: 20,
              gap: 16,
              backgroundColor: colors.surface,
            }}
          >
            <WorkText title>{label}?</WorkText>
            <WorkText>{description}</WorkText>
            <KairosButton
              label="Cancel"
              tone="secondary"
              onPress={() => setOpen(false)}
            />
            <KairosButton
              label="Remove permanently"
              tone="danger"
              onPress={() => {
                setOpen(false);
                onConfirm();
              }}
            />
          </View>
        </View>
      </Modal>
    </>
  );
}
