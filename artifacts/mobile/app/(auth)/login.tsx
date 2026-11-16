import { Fonts } from "@/constants/theme";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { z } from "zod";

import { KairosButton } from "@/components/kairos/button";
import { KairosCard } from "@/components/kairos/card";
import { KairosInput } from "@/components/kairos/input";
import { PressableScale } from "@/components/kairos/pressable-scale";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { getAuthErrorMessage } from "@/lib/auth-errors";
import { useKairosAuth } from "@/providers/supabase-auth-provider";
import { useKairosUI } from "@/providers/kairos-ui-provider";
import { useAppStore } from "@/store/use-app-store";

const emailSchema = z.string().trim().email("Enter a valid email address.");
const passwordSchema = z.string().min(8, "Password must be at least 8 characters.").max(72);

export default function LoginScreen() {
  const colors = useColors();
  const router = useRouter();
  const { showToast } = useKairosUI();
  const {
    signInWithPassword,
    signUpWithPassword,
    signInWithOAuth,
    resetPassword,
    enterPreviewMode,
  } = useKairosAuth();
  const [mode, setMode] = useState<"sign-in" | "register">("sign-in");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const title = mode === "sign-in" ? "Welcome back" : "Create your account";
  const subtitle = mode === "sign-in"
    ? "Continue building a clearer picture of your life."
    : "Start a private, personalised Kairos workspace.";

  const submitLabel = useMemo(() => mode === "sign-in" ? "Sign In" : "Create Account", [mode]);

  const validate = () => {
    const emailResult = emailSchema.safeParse(email);
    if (!emailResult.success) return emailResult.error.issues[0]?.message ?? "Email is invalid.";
    const passwordResult = passwordSchema.safeParse(password);
    if (!passwordResult.success) return passwordResult.error.issues[0]?.message ?? "Password is invalid.";
    if (mode === "register" && fullName.trim().length < 2) return "Enter your full name.";
    return null;
  };

  const submit = async () => {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      if (Platform.OS !== "web") void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      if (mode === "sign-in") await signInWithPassword(email.trim(), password);
      else await signUpWithPassword(email.trim(), password, fullName.trim());
      showToast(mode === "sign-in" ? "Signed in to Kairos." : "Account created. Check your email if confirmation is required.", "success");
      router.replace("/(tabs)/ai");
    } catch (submitError) {
      setError(getAuthErrorMessage(submitError));
    } finally {
      setLoading(false);
    }
  };

  const oauth = async (provider: "google" | "apple") => {
    try {
      setLoading(true);
      setError(null);
      const signedIn = await signInWithOAuth(provider);
      if (signedIn) router.replace("/(tabs)/ai");
    } catch (oauthError) {
      setError(getAuthErrorMessage(oauthError));
    } finally {
      setLoading(false);
    }
  };

  const sendReset = async () => {
    if (loading) return;
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) {
      setError("Enter your email address before requesting a reset.");
      return;
    }
    try {
      setLoading(true);
      setError(null);
      await resetPassword(parsed.data);
      showToast("If this email has an account, a reset link is on its way. Open it on this device and browser.", "success");
    } catch (resetError) {
      setError(getAuthErrorMessage(resetError));
    } finally {
      setLoading(false);
    }
  };

  const preview = () => {
    useAppStore.getState().completeOnboarding();
    setError(null);
    enterPreviewMode();
    router.replace("/(tabs)/ai");
  };

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.hero}>
            <View style={styles.brandRow}>
              <View style={[styles.logo, { borderColor: colors.border, backgroundColor: `${colors.primary}12` }]}>
                <MaterialIcons color={colors.primary} name="explore" size={32} />
              </View>
              <View style={styles.brandCopy}>
                <Text style={[styles.brand, { color: colors.foreground }]}>KAIROS</Text>
                <Text style={[styles.tagline, { color: colors.muted }]}>WELLBEING · IN CONTEXT</Text>
              </View>
            </View>
            <Text style={[styles.eyebrow, { color: colors.primary }]}>YOUR PRIVATE SPACE</Text>
            <Text accessibilityRole="header" style={[styles.title, { color: colors.foreground }]}>{title}</Text>
            <Text style={[styles.subtitle, { color: colors.muted }]}>{subtitle}</Text>
          </View>

          <KairosCard style={styles.previewCard}>
            <Text style={[styles.previewTitle, { color: colors.foreground }]}>Test without signing in</Text>
            <Text style={[styles.previewBody, { color: colors.muted }]}>Explore My Life, My Relationship, My Work and AI without an account. Preview drafts are session-only; cloud saves, live AI, uploads and partner connections require signed-in backend setup.</Text>
            <KairosButton label="Open Preview — Skip Login" tone="secondary" onPress={preview} />
          </KairosCard>

          <KairosCard style={styles.formCard}>
            {mode === "register" ? (
              <KairosInput autoCapitalize="words" label="Full name" onChangeText={setFullName} value={fullName} />
            ) : null}
            <KairosInput
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              label="Email"
              onChangeText={setEmail}
              returnKeyType="next"
              value={email}
            />
            <KairosInput
              autoCapitalize="none"
              autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
              label="Password"
              onChangeText={setPassword}
              onSubmitEditing={submit}
              returnKeyType="done"
              secureTextEntry
              value={password}
            />
            {error ? <Text accessibilityLiveRegion="assertive" style={[styles.error, { color: colors.error }]}>{error}</Text> : null}
            <KairosButton label={submitLabel} loading={loading} onPress={submit} />
            {mode === "sign-in" ? (
              <PressableScale accessibilityLabel="Reset password" accessibilityState={{ disabled: loading }} disabled={loading} haptic="none" onPress={sendReset} style={styles.textAction}>
                <Text style={[styles.textActionLabel, { color: colors.primary }]}>Forgot password?</Text>
              </PressableScale>
            ) : null}
          </KairosCard>

          <View style={styles.dividerRow}>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <Text style={[styles.dividerLabel, { color: colors.muted }]}>or continue with</Text>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
          </View>
          <View style={styles.oauthRow}>
            <KairosButton label="Google" icon="g-translate" tone="secondary" disabled={loading} onPress={() => oauth("google")} style={styles.oauthButton} />
            <KairosButton label="Apple" icon="apple" tone="secondary" disabled={loading} onPress={() => oauth("apple")} style={styles.oauthButton} />
          </View>

          <PressableScale
            accessibilityLabel={mode === "sign-in" ? "Create an account" : "Use an existing account"}
            haptic="none"
            onPress={() => {
              setError(null);
              setMode((current) => current === "sign-in" ? "register" : "sign-in");
            }}
            style={styles.modeAction}
          >
            <Text style={[styles.modeText, { color: colors.muted }]}>
              {mode === "sign-in" ? "New to Kairos? " : "Already have an account? "}
              <Text style={{ color: colors.primary, fontWeight: "700" }}>
                {mode === "sign-in" ? "Create account" : "Sign in"}
              </Text>
            </Text>
          </PressableScale>

        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { flexGrow: 1, width: "100%", maxWidth: 520, alignSelf: "center", justifyContent: "center", gap: 20, paddingHorizontal: 24, paddingVertical: 32 },
  hero: { alignItems: "flex-start", marginBottom: 4, gap: 10 },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 13, marginBottom: 18 },
  brandCopy: { gap: 2 },
  logo: { width: 58, height: 58, borderRadius: 29, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  brand: { fontFamily: Fonts.serif, fontSize: 28, lineHeight: 34, fontWeight: "400", letterSpacing: 0.2 },
  tagline: { fontFamily: "monospace", fontSize: 9, lineHeight: 14, letterSpacing: 1.4 },
  eyebrow: { marginTop: 6, fontSize: 10, lineHeight: 15, fontWeight: "800", letterSpacing: 1.8 },
  title: { marginTop: 1, fontFamily: Fonts.serif, fontSize: 34, lineHeight: 42, fontWeight: "400", textAlign: "left" },
  subtitle: { marginTop: 1, maxWidth: 360, fontSize: 15, lineHeight: 23, textAlign: "left" },
  formCard: { gap: 15 },
  error: { fontSize: 13, lineHeight: 18 },
  textAction: { minHeight: 44, alignItems: "center", justifyContent: "center" },
  textActionLabel: { fontSize: 14, lineHeight: 19, fontWeight: "700" },
  dividerRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  divider: { flex: 1, height: 1 },
  dividerLabel: { fontSize: 12, lineHeight: 17 },
  oauthRow: { flexDirection: "row", gap: 12 },
  oauthButton: { flex: 1 },
  modeAction: { minHeight: 44, justifyContent: "center" },
  modeText: { fontSize: 14, lineHeight: 20, textAlign: "center" },
  previewCard: { gap: 10 },
  previewTitle: { fontSize: 16, lineHeight: 21, fontWeight: "700" },
  previewBody: { fontSize: 13, lineHeight: 19 },
});
