import { useCallback, useLayoutEffect, useRef, type ReactNode } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useIndividualIntake } from "@/hooks/use-individual-intake";
export const intakeColors = {
  forest: "#07130D",
  surface: "#0D2017",
  mint: "#39D4A4",
  ivory: "#F3F7F3",
  muted: "#A1ADA5",
  border: "#244536",
  warning: "#F1C875",
};
export function IntakeScreen({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const intake = useIndividualIntake();
  return (
    <ScreenContainer
      header={
        <View style={styles.heading}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            onPress={() =>
              router.canGoBack() ? router.back() : router.replace("/life/me")
            }
            style={styles.back}
          >
            <Text style={styles.mint}>‹ Back</Text>
          </Pressable>
          <Text accessibilityRole="header" style={styles.title}>
            {title}
          </Text>
          <Text style={styles.caption}>MY LIFE · PRIVATE SELF-REFLECTION</Text>
        </View>
      }
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {intake.preview && (
          <Card>
            <Text style={styles.mint}>Session-only preview</Text>
            <Body>
              No network or persistent answers. This starts empty; only your
              manually chosen responses are used. Leaving preview or signing out
              clears this session.
            </Body>
          </Card>
        )}
        {intake.error && (
          <Card>
            <Text accessibilityRole="alert" style={styles.warning}>
              {intake.error}
            </Text>
            <Button
              label="Reload saved state"
              disabled={intake.busy || intake.preview}
              onPress={() => {
                void intake.reload();
              }}
            />
          </Card>
        )}
        {intake.loading ? (
          <ActivityIndicator
            color={intakeColors.mint}
            accessibilityLabel="Loading private intake"
          />
        ) : !intake.owner ? (
          <Body>
            Sign in, or explicitly enter preview mode, to use your private
            intake.
          </Body>
        ) : (
          children
        )}
      </ScrollView>
    </ScreenContainer>
  );
}
export function Card({ children }: { children: ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}
export function Body({ children }: { children: ReactNode }) {
  return <Text style={styles.body}>{children}</Text>;
}
export function Label({ children }: { children: ReactNode }) {
  return (
    <Text accessibilityRole="header" style={styles.label}>
      {children}
    </Text>
  );
}
export function Button({
  label,
  onPress,
  disabled = false,
  secondary = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.button,
        secondary && styles.secondary,
        disabled && { opacity: 0.45 },
      ]}
    >
      <Text
        style={[styles.buttonText, secondary && { color: intakeColors.ivory }]}
      >
        {label}
      </Text>
    </Pressable>
  );
}
export function Check({
  label,
  checked,
  onChange,
  disabled = false,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked, disabled }}
      aria-checked={checked}
      aria-disabled={disabled}
      disabled={disabled}
      onPress={() => onChange(!checked)}
      style={styles.check}
    >
      <View
        style={[styles.box, checked && { backgroundColor: intakeColors.mint }]}
      >
        <Text style={{ color: intakeColors.forest }}>{checked ? "✓" : ""}</Text>
      </View>
      <Text style={styles.checkText}>{label}</Text>
    </Pressable>
  );
}
export function ConfirmModal({
  visible,
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
  busy = false,
}: {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
}) {
  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={busy ? undefined : onCancel}
    >
      <View style={styles.overlay}>
        <View accessibilityViewIsModal style={styles.dialog}>
          <Label>{title}</Label>
          <Body>{message}</Body>
          <Button label={confirmLabel} disabled={busy} onPress={onConfirm} />
          <Button label="Cancel" secondary disabled={busy} onPress={onCancel} />
        </View>
      </View>
    </Modal>
  );
}
/** Retained stack screens lose action/export authority on blur, not only unmount. */
export function useIntakeScreenGuard() {
  const { captureGuard } = useIndividualIntake();
  const mount = useRef<object | null>(null);
  const focus = useRef<object | null>(null);
  useLayoutEffect(() => {
    const token = {};
    mount.current = token;
    return () => {
      if (mount.current === token) mount.current = null;
    };
  }, []);
  useFocusEffect(
    useCallback(() => {
      const token = {};
      focus.current = token;
      // Do not clear drafts/selection on blur. Only this focus generation expires.
      return () => {
        if (focus.current === token) focus.current = null;
      };
    }, []),
  );
  return () => {
    const token = mount.current;
    const focusToken = focus.current;
    const current = captureGuard();
    return () =>
      Boolean(
        token &&
        mount.current === token &&
        focusToken &&
        focus.current === focusToken &&
        current(),
      );
  };
}
export const styles = StyleSheet.create({
  heading: { gap: 6 },
  back: { alignSelf: "flex-start", paddingVertical: 8, paddingRight: 20 },
  title: { color: intakeColors.ivory, fontSize: 25, fontWeight: "700" },
  caption: { color: intakeColors.muted, fontSize: 10, letterSpacing: 1.6 },
  mint: { color: intakeColors.mint, fontSize: 14, fontWeight: "600" },
  warning: { color: intakeColors.warning, fontSize: 14, lineHeight: 21 },
  content: {
    padding: 20,
    paddingBottom: 130,
    gap: 16,
    maxWidth: 720,
    width: "100%",
    alignSelf: "center",
  },
  card: {
    padding: 18,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: intakeColors.border,
    backgroundColor: intakeColors.surface,
    gap: 12,
  },
  body: { color: intakeColors.muted, fontSize: 14, lineHeight: 22 },
  label: {
    color: intakeColors.ivory,
    fontSize: 18,
    lineHeight: 26,
    fontWeight: "600",
  },
  button: {
    backgroundColor: intakeColors.mint,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  secondary: {
    backgroundColor: intakeColors.surface,
    borderWidth: 1,
    borderColor: intakeColors.border,
  },
  buttonText: {
    color: intakeColors.forest,
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
  },
  check: { flexDirection: "row", gap: 12, alignItems: "center", minHeight: 48 },
  box: {
    borderWidth: 1,
    borderColor: intakeColors.mint,
    width: 24,
    height: 24,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  checkText: {
    color: intakeColors.ivory,
    fontSize: 14,
    lineHeight: 21,
    flex: 1,
  },
  overlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    backgroundColor: "rgba(0,0,0,0.75)",
  },
  dialog: {
    backgroundColor: intakeColors.surface,
    borderWidth: 1,
    borderColor: intakeColors.border,
    borderRadius: 20,
    padding: 24,
    gap: 16,
    maxWidth: 520,
    width: "100%",
  },
  input: {
    borderWidth: 1,
    borderColor: intakeColors.border,
    borderRadius: 12,
    backgroundColor: intakeColors.forest,
    color: intakeColors.ivory,
    padding: 14,
    minHeight: 100,
    fontSize: 15,
    textAlignVertical: "top",
  },
});
