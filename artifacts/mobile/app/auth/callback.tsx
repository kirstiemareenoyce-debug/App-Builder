import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Linking from "expo-linking";
import { useRouter, type Href } from "expo-router";
import { useEffect, useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";

import { KairosButton } from "@/components/kairos/button";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { parseOAuthCallback } from "@/lib/oauth-callback";
import { AuthCallbackError, isRecoveryCallback } from "@/lib/password-recovery";
import { useKairosAuth } from "@/providers/supabase-auth-provider";

type CallbackOutcome =
  | "received_code" | "provider_error" | "token_redirect_rejected"
  | "missing_code" | "exchange_failed" | "exchange_succeeded" | "recovery_unverified";

function recordCallbackOutcome(outcome: CallbackOutcome) {
  if (Platform.OS !== "web" || typeof window === "undefined") return;
  try {
    window.localStorage.setItem("kairos:last-oauth-callback", JSON.stringify({
      outcome, recordedAt: new Date().toISOString(),
    }));
  } catch { /* Diagnostics must not prevent authentication. */ }
}

function clearWebCallbackUrl() {
  if (Platform.OS !== "web" || typeof window === "undefined") return;
  // Remove codes, errors and any rejected raw tokens from the browser's visible URL.
  window.history.replaceState(null, document.title, window.location.pathname);
}

export default function SupabaseAuthCallbackScreen() {
  const router = useRouter();
  const colors = useColors();
  const callbackUrl = Linking.useURL();
  // Keep the original callback stable after removing sensitive URL parameters.
  // A rerender must never replace the pending code with the cleaned URL.
  const [initialWebUrl] = useState(() =>
    Platform.OS === "web" && typeof window !== "undefined" ? window.location.href : null,
  );
  const effectiveUrl = initialWebUrl ?? callbackUrl;
  const { completeAuthCallback, cancelPasswordRecovery } = useKairosAuth();
  const [error, setError] = useState<string | null>(null);
  const [recoveryLink, setRecoveryLink] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    let active = true;
    const complete = async () => {
      if (!effectiveUrl) return;
      if (active) setRecoveryLink(isRecoveryCallback(effectiveUrl));
      try {
        const callback = parseOAuthCallback(effectiveUrl);
        if (callback.hasTokenFragment) {
          recordCallbackOutcome("token_redirect_rejected");
          clearWebCallbackUrl();
        } else if (callback.error) recordCallbackOutcome("provider_error");
        else if (!callback.code) recordCallbackOutcome("missing_code");
        else recordCallbackOutcome("received_code");
        // exchangeCodeForSession and recovery verification share a one-time-code
        // operation with native Linking, preventing concurrent duplicate exchanges.
        const result = await completeAuthCallback(effectiveUrl);
        recordCallbackOutcome("exchange_succeeded");
        clearWebCallbackUrl();
        if (active) router.replace(result.route as Href);
      } catch (callbackError) {
        const known = callbackError instanceof AuthCallbackError;
        if (!known || callbackError.outcome === "exchange_failed") recordCallbackOutcome("exchange_failed");
        else recordCallbackOutcome(callbackError.outcome);
        clearWebCallbackUrl();
        if (active) {
          if (known && callbackError.recovery) setRecoveryLink(true);
          setError(known ? callbackError.message : "Authentication could not finish. Please try again.");
        }
      }
    };
    void complete();
    return () => { active = false; };
  }, [effectiveUrl, completeAuthCallback, router]);

  const retry = async () => {
    setLeaving(true);
    try {
      await cancelPasswordRecovery();
      router.replace("/login");
    } catch {
      setError("Could not close the reset session. Please try again.");
    } finally { setLeaving(false); }
  };

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]}>
      <View style={styles.container}>
        <View style={[styles.icon, { backgroundColor: `${error ? colors.error : colors.primary}22` }]}>
          <MaterialIcons color={error ? colors.error : colors.primary} name={error ? "error-outline" : "verified-user"} size={42} />
        </View>
        <Text accessibilityRole="header" style={[styles.title, { color: colors.foreground }]}>
          {error ? (recoveryLink ? "Reset link could not finish" : "Sign-in could not finish") : (recoveryLink ? "Verifying reset link" : "Finishing sign-in")}
        </Text>
        <Text accessibilityLiveRegion="polite" style={[styles.message, { color: colors.muted }]}>
          {error ?? (recoveryLink ? "Kairos is verifying your secure reset session…" : "Kairos is securely restoring your session…")}
        </Text>
        {error ? <KairosButton label={recoveryLink ? "Request a new reset link" : "Return to sign in"} loading={leaving} onPress={retry} /> : null}
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14, padding: 28 },
  icon: { width: 76, height: 76, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 24, lineHeight: 30, fontWeight: "800", textAlign: "center" },
  message: { maxWidth: 340, fontSize: 15, lineHeight: 22, textAlign: "center" },
});
