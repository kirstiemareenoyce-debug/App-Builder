import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter, type Href } from "expo-router";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { ScreenHeader } from "@/components/kairos/screen-header";
import { KairosCard } from "@/components/kairos/card";
import { KairosInput } from "@/components/kairos/input";
import { KairosButton } from "@/components/kairos/button";
import { useColors } from "@/hooks/use-colors";
import { useSaveRelationshipEntry } from "@/hooks/use-relationship-hub";
import { useKairosAuth } from "@/providers/supabase-auth-provider";
import { emptySupportProfile, SUPPORT_PROFILE_FIELDS, supportProfileToArchive, SUPPORT_ARCHIVE_REVIEW_HREF } from "@/lib/kairos-ai-support-profile";

type AccountScope = { accountId: string | null; isPreview: boolean };
function initialState(scope: AccountScope) {
  return { scope, profile: emptySupportProfile(), title: "My support preferences", storageConsent: false,
    busy: false, error: null as string | null, savedTitle: null as string | null };
}

export default function SupportProfileScreen() {
  const { user } = useKairosAuth();
  const colors = useColors();
  const router = useRouter();
  const saveEntry = useSaveRelationshipEntry();
  const accountId = user?.id ?? null;
  const isPreview = user?.isPreview ?? false;
  const accountScope = useRef<AccountScope>({ accountId, isPreview });
  if (accountScope.current.accountId !== accountId || accountScope.current.isPreview !== isPreview) accountScope.current = { accountId, isPreview };
  const scope = accountScope.current;
  const mountedLifetime = useRef<object | null>(null);
  const activeSave = useRef<{ scope: AccountScope } | null>(null);
  const [state, setState] = useState(() => initialState(scope));
  const visible = state.scope === scope ? state : initialState(scope);
  useLayoutEffect(() => {
    const lifetime = {};
    mountedLifetime.current = lifetime;
    return () => {
      if (mountedLifetime.current === lifetime) { mountedLifetime.current = null; activeSave.current = null; }
    };
  }, []);
  useEffect(() => { setState(initialState(scope)); }, [scope]);
  const update = (patch: Partial<ReturnType<typeof initialState>>) => {
    if (!mountedLifetime.current || accountScope.current !== scope) return;
    setState((previous) => accountScope.current === scope ? { ...(previous.scope === scope ? previous : initialState(scope)), ...patch } : previous);
  };
  const savePrivate = async () => {
    const lifetime = mountedLifetime.current;
    if (!lifetime || accountScope.current !== scope || activeSave.current?.scope === scope) return;
    const isCurrent = () => mountedLifetime.current === lifetime && accountScope.current === scope;
    if (!accountId) { update({ error: "Sign in before saving. Your form remains on this screen." }); return; }
    if (!visible.storageConsent) { update({ error: "Choose private storage before saving. Nothing was saved or shared." }); return; }
    let entry;
    try { entry = supportProfileToArchive(visible.profile, visible.title); }
    catch (error) { update({ error: error instanceof Error ? error.message : "Check the sections you want to save." }); return; }
    const request = { scope };
    activeSave.current = request;
    update({ busy: true, error: null });
    try {
      // New private entry only. No share RPC, AI call, chat or assessment input.
      const saved = await saveEntry.mutateAsync({ ...entry, expectedOwner: accountId });
      if (!isCurrent()) return;
      setState((previous) => isCurrent() && previous.scope === scope ? { ...previous, savedTitle: saved.title } : previous);
    } catch (error) {
      if (!isCurrent()) return;
      update({ error: error instanceof Error ? error.message : "Private saving is unavailable. Your form has been preserved; nothing was shared." });
    } finally {
      if (isCurrent() && activeSave.current === request) {
        activeSave.current = null;
        update({ busy: false });
      }
    }
  };

  return <ScreenContainer>
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ScreenHeader showBack title="My support profile" subtitle="Your words. Your boundaries. Your choice." />
        <KairosCard style={styles.card}>
          <Text style={[styles.body, { color: colors.foreground }]}>Write what you notice and what helps you. These are your current descriptions, not a diagnosis, score or explanation of someone else's mind. Every section is optional.</Text>
          <Text style={[styles.note, { color: colors.muted }]}>The unsaved form lives only in this screen's memory and clears when you leave or change accounts. It does not read or transfer Kairos chats, assessment answers or journals. No AI is used here.</Text>
          <Text style={[styles.note, { color: colors.muted }]}>You do not have to share a profile to use the app or maintain a connection. If sharing vulnerabilities could be unsafe or pressured, keep them private and seek confidential individual support.</Text>
          <KairosInput label="Private entry title" value={visible.title} onChangeText={(title) => update({ title, savedTitle: null })} maxLength={120} editable={!visible.busy} />
          {SUPPORT_PROFILE_FIELDS.map((field) => <KairosInput key={field.key} label={field.label} placeholder={field.placeholder} multiline maxLength={650}
            value={visible.profile[field.key]} editable={!visible.busy}
            onChangeText={(value) => update({ profile: { ...visible.profile, [field.key]: value }, savedTitle: null })} />)}
          <View style={styles.consent}>
            <Text style={[styles.consentText, { color: colors.foreground }]}>{isPreview
              ? "I choose to prepare a private Support Archive entry for this preview session only."
              : "I choose to save exactly these written sections as a new owner-private Support Archive entry. This is storage consent, not AI-use or sharing consent."}</Text>
            <Switch accessibilityLabel="Consent to saving this self-written profile privately" value={visible.storageConsent} onValueChange={(storageConsent) => update({ storageConsent })}
              disabled={visible.busy} trackColor={{ true: colors.primary, false: colors.border }} />
          </View>
          {visible.error ? <Text accessibilityLiveRegion="assertive" style={[styles.note, { color: colors.error }]}>{visible.error}</Text> : null}
          <KairosButton label={isPreview ? "Prepare private preview entry" : "Save new private Support Archive entry"} icon="lock" loading={visible.busy}
            disabled={!visible.storageConsent} onPress={() => void savePrivate()} />
          <Text style={[styles.note, { color: colors.muted }]}>Nothing is shared when you save. Saving again creates a separate private version; it does not update any shared snapshot. Private saved entries can be edited or deleted in Support Archive.</Text>
        </KairosCard>
        {visible.savedTitle ? <KairosCard style={styles.card}>
          <Text accessibilityLiveRegion="polite" style={[styles.body, { color: colors.foreground }]}>{isPreview ? "Prepared for this preview session only, not stored on a server." : "Saved privately."} Nothing was shared. Entry: {visible.savedTitle}</Text>
          <Text style={[styles.note, { color: colors.muted }]}>Open Support Archive, locate this entry, and choose “Share with partner” only if you want to. The existing review shows the exact text and recipient account, then requires separate approval of that revision. No share happens by opening the archive. Updates remain private until you review and share again; revoke/disconnect cannot recall outside copies.</Text>
          <KairosButton label="Open Support Archive for separate review" tone="secondary" onPress={() => {
            if (mountedLifetime.current && accountScope.current === scope) router.push(SUPPORT_ARCHIVE_REVIEW_HREF as Href);
          }} />
          {isPreview ? <Text style={[styles.note, { color: colors.muted }]}>In-app partner sharing is unavailable in preview. The archive clearly labels any optional external copy as preview.</Text> : null}
        </KairosCard> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  </ScreenContainer>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 }, content: { padding: 20, paddingBottom: 130, gap: 18 }, card: { gap: 14 },
  body: { fontSize: 15, lineHeight: 23 }, note: { fontSize: 12, lineHeight: 18 },
  consent: { flexDirection: "row", gap: 14, alignItems: "center" }, consentText: { flex: 1, fontSize: 13, lineHeight: 20 },
});
