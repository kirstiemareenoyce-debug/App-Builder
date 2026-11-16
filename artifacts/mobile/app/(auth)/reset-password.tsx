import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";

import { KairosButton } from "@/components/kairos/button";
import { KairosCard } from "@/components/kairos/card";
import { KairosInput } from "@/components/kairos/input";
import { ScreenContainer } from "@/components/screen-container";
import { Fonts } from "@/constants/theme";
import { useColors } from "@/hooks/use-colors";
import { RECOVERY_RETRY_MESSAGE, validateRecoveryPassword } from "@/lib/password-recovery";
import { useKairosAuth } from "@/providers/supabase-auth-provider";

export default function ResetPasswordScreen() {
  const colors = useColors();
  const router = useRouter();
  const { recovery, ensureRecoverySession, updateRecoveryPassword, cancelPasswordRecovery } = useKairosAuth();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => { ensureRecoverySession(); }, [ensureRecoverySession]);
  useEffect(() => {
    if (recovery.status === "expired" || recovery.status === "error") {
      setPassword("");
      setConfirmation("");
      setError(null);
    }
  }, [recovery.status]);

  const submit = async () => {
    if (saving || recovery.status !== "ready") return;
    const validation = validateRecoveryPassword(password, confirmation);
    if (validation) { setError(validation); return; }
    setSaving(true);
    setError(null);
    try {
      await updateRecoveryPassword(password, confirmation);
      setPassword("");
      setConfirmation("");
      setSuccess(true);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Password could not be updated. Please try again.");
    } finally { setSaving(false); }
  };

  const retry = async () => {
    setLeaving(true);
    setError(null);
    try {
      await cancelPasswordRecovery();
      setPassword("");
      setConfirmation("");
      router.replace("/login");
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : "Could not close the reset session. Please try again.");
    } finally { setLeaving(false); }
  };

  const usable = recovery.status === "ready" || recovery.status === "submitting";
  const verifying = recovery.status === "verifying";
  const message = error ?? recovery.error;

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={[styles.icon, { backgroundColor: `${colors.primary}12`, borderColor: colors.border }]}>
            <MaterialIcons name={success ? "check-circle-outline" : "lock-outline"} color={colors.primary} size={32} />
          </View>
          <Text accessibilityRole="header" style={[styles.title, { color: colors.foreground }]}>
            {success ? "Password updated" : "Choose a new password"}
          </Text>
          <Text style={[styles.subtitle, { color: colors.muted }]}>
            {success ? "Your new password is saved. You can now continue securely to Kairos." : "Use at least 8 characters. Confirm your new password before saving it."}
          </Text>
          <KairosCard style={styles.form}>
            {success ? (
              <KairosButton label="Continue to Kairos" onPress={() => router.replace("/ai")} />
            ) : usable ? (
              <>
                <KairosInput label="New password" autoCapitalize="none" autoCorrect={false} autoComplete="new-password" secureTextEntry value={password} onChangeText={setPassword} editable={!saving} returnKeyType="next" />
                <KairosInput label="Confirm new password" autoCapitalize="none" autoCorrect={false} autoComplete="new-password" secureTextEntry value={confirmation} onChangeText={setConfirmation} editable={!saving} returnKeyType="done" onSubmitEditing={submit} />
                {message ? <Text accessibilityLiveRegion="assertive" style={[styles.error, { color: colors.error }]}>{message}</Text> : null}
                <KairosButton label="Save new password" loading={saving || recovery.status === "submitting"} disabled={leaving} onPress={submit} />
                <KairosButton label="Cancel and return to sign in" tone="ghost" loading={leaving} disabled={saving} onPress={retry} />
              </>
            ) : (
              <>
                <Text accessibilityLiveRegion="polite" style={[styles.subtitle, { color: verifying ? colors.muted : colors.error }]}>
                  {verifying ? "Verifying your reset link…" : message ?? RECOVERY_RETRY_MESSAGE}
                </Text>
                {!verifying ? <KairosButton label="Request a new reset link" loading={leaving} onPress={retry} /> : null}
              </>
            )}
          </KairosCard>
          {!success ? <Text style={[styles.hint, { color: colors.muted }]}>Open the reset email on the same device and browser where you requested it. Reloading this screen requires a new link.</Text> : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { flexGrow: 1, width: "100%", maxWidth: 520, alignSelf: "center", justifyContent: "center", gap: 20, paddingHorizontal: 24, paddingVertical: 32 },
  icon: { width: 58, height: 58, borderRadius: 29, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  title: { fontFamily: Fonts.serif, fontSize: 34, lineHeight: 42, fontWeight: "400" },
  subtitle: { fontSize: 15, lineHeight: 23 },
  form: { gap: 15 },
  error: { fontSize: 13, lineHeight: 18 },
  hint: { fontSize: 13, lineHeight: 20 },
});
