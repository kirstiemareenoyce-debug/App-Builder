import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter, type Href } from "expo-router";
import { FlatList, KeyboardAvoidingView, Platform, StyleSheet, Switch, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Fonts } from "@/constants/theme";
import { KairosButton } from "@/components/kairos/button";
import { KairosInput } from "@/components/kairos/input";
import { ScreenHeader } from "@/components/kairos/screen-header";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useKairosAIInteractions, useKairosAIQueryMutation } from "@/hooks/use-kairos-ai";
import { useKairosAuth } from "@/providers/supabase-auth-provider";
import { kairosAIInputSchema } from "@/lib/kairos-ai-api";
import {
  beginKairosAITurn, buildKairosAIMessages, completeKairosAITurn,
  createKairosAISession, failKairosAITurn, type KairosAIMessage,
} from "@/lib/kairos-ai-history";
import type { KairosAIMode } from "@/types/kairos-ai";

type AccountScope = { accountId: string | null; isPreview: boolean };
function initialState(scope: AccountScope) {
  return { scope, draft: "", mode: "learning" as KairosAIMode, aiConsent: false, storageConsent: false,
    error: null as string | null, session: createKairosAISession(scope.accountId) };
}

export default function KairosAIScreen() {
  const { user } = useKairosAuth();
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const accountId = user?.id ?? null;
  const isPreview = user?.isPreview ?? false;
  const accountScope = useRef<AccountScope>({ accountId, isPreview });
  if (accountScope.current.accountId !== accountId || accountScope.current.isPreview !== isPreview) {
    accountScope.current = { accountId, isPreview };
  }
  const scope = accountScope.current;
  const mountedLifetime = useRef<object | null>(null);
  const activeRequest = useRef<{ scope: AccountScope; requestId: string } | null>(null);
  const sequence = useRef(0);
  const listRef = useRef<FlatList<KairosAIMessage>>(null);
  const history = useKairosAIInteractions();
  const mutation = useKairosAIQueryMutation();
  const [state, setState] = useState(() => initialState(scope));
  // Hide the previous account's form on the render BEFORE effect cleanup.
  const visible = state.scope === scope ? state : initialState(scope);
  const isSending = visible.session.turns.some((turn) => !turn.result);
  const messages = useMemo(() => buildKairosAIMessages(history.data ?? [], visible.session, accountId), [history.data, visible.session, accountId]);

  useLayoutEffect(() => {
    const lifetime = {};
    mountedLifetime.current = lifetime;
    return () => {
      if (mountedLifetime.current === lifetime) {
        mountedLifetime.current = null;
        activeRequest.current = null;
      }
    };
  }, []);
  useEffect(() => { setState(initialState(scope)); }, [scope]);

  const update = (patch: Partial<ReturnType<typeof initialState>>) => {
    if (!mountedLifetime.current || accountScope.current !== scope) return;
    setState((previous) => accountScope.current === scope ? { ...(previous.scope === scope ? previous : initialState(scope)), ...patch } : previous);
  };

  const send = async () => {
    const lifetime = mountedLifetime.current;
    if (!lifetime || accountScope.current !== scope || activeRequest.current?.scope === scope) return;
    const isCurrent = () => mountedLifetime.current === lifetime && accountScope.current === scope;
    const parsed = kairosAIInputSchema.safeParse({ query: visible.draft, mode: visible.mode,
      ai_use_consent: visible.aiConsent, storage_consent: visible.storageConsent });
    if (!parsed.success) { update({ error: parsed.error.issues[0]?.message ?? "Check your message and choices." }); return; }
    if (!accountId || isPreview) { update({ error: isPreview ? "Live Kairos AI is unavailable in preview. No simulated reply is generated." : "Sign in to use Kairos AI." }); return; }
    const request = { scope, requestId: `kairos-pending-${++sequence.current}` };
    activeRequest.current = request;
    setState((previous) => isCurrent() && previous.scope === scope
      ? { ...previous, error: null, session: beginKairosAITurn(previous.session, accountId, request.requestId, parsed.data.query) } : previous);
    try {
      const result = await mutation.mutateAsync({ input: parsed.data, expectedOwner: accountId });
      if (!isCurrent()) return;
      setState((previous) => isCurrent() && previous.scope === scope ? {
        ...previous, session: completeKairosAITurn(previous.session, accountId, request.requestId, result),
        // Preserve a new draft composed while this turn was running.
        draft: previous.draft === visible.draft ? "" : previous.draft,
      } : previous);
    } catch (error) {
      if (!isCurrent()) return;
      setState((previous) => isCurrent() && previous.scope === scope ? {
        ...previous, session: failKairosAITurn(previous.session, accountId, request.requestId),
        error: error instanceof Error ? error.message : "Kairos AI could not respond. Your draft is still here.",
      } : previous);
    } finally {
      if (isCurrent() && activeRequest.current === request) activeRequest.current = null;
    }
  };

  useEffect(() => {
    const lifetime = mountedLifetime.current;
    if (!lifetime || !messages.length) return;
    requestAnimationFrame(() => {
      if (mountedLifetime.current === lifetime && accountScope.current === scope) listRef.current?.scrollToEnd({ animated: true });
    });
  }, [messages.length, scope]);

  return (
    <ScreenContainer edges={["top", "left", "right"]}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.header}>
          <ScreenHeader showBack title="Kairos AI" subtitle="Learning & self-understanding · not diagnosis or therapy" />
          <Text style={[styles.note, { color: colors.muted }]}>Only the message you send is used. No journals, Work files, partner records or other assistants' chats are retrieved. AI can make mistakes.</Text>
          <View style={styles.modes}>
            {(["learning", "reflection"] as const).map((mode) => (
              <KairosButton key={mode} compact label={mode === "learning" ? "Learn" : "Optional reflection"} tone={visible.mode === mode ? "primary" : "secondary"}
                disabled={isSending} onPress={() => update({ mode })} style={styles.mode} />
            ))}
          </View>
          <KairosButton compact label="My individual questionnaires" tone="secondary" icon="fact-check"
            onPress={() => router.push("/individual" as Href)} />
          <KairosButton compact label="Write my support profile" tone="ghost" icon="edit-note"
            onPress={() => router.push("/assistants/support-profile" as Href)} />
        </View>
        <FlatList ref={listRef} data={messages} keyExtractor={(item) => item.id}
          initialNumToRender={12} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.history}
          ListEmptyComponent={<View style={styles.empty}>
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Curiosity, not a verdict.</Text>
            <Text style={[styles.body, { color: colors.muted }]}>Learn about feelings, overwhelm, attention and helpful routines. Reflect only if you want to; skip or pause at any time. Questionnaires use a separate private flow; chat does not administer or score them.</Text>
            {isPreview ? <Text style={[styles.note, { color: colors.muted }]}>Preview lets you explore the form only. Live requests require reviewed backend setup and sign-in.</Text> : null}
          </View>}
          ListFooterComponent={isSending ? <Text accessibilityLiveRegion="polite" style={[styles.note, { color: colors.primary }]}>Kairos is responding…</Text> : undefined}
          renderItem={({ item }) => <View style={[styles.message, { backgroundColor: item.role === "user" ? colors.surface : colors.backgroundSecondary, borderColor: colors.border }]}>
            <Text style={[styles.messageLabel, { color: colors.primary }]}>{item.role === "user" ? "You" : "Kairos AI · educational"}</Text>
            <Text selectable style={[styles.body, { color: colors.foreground }]}>{item.content}</Text>
          </View>} />
        <View style={[styles.composer, { borderColor: colors.border, marginBottom: Math.max(insets.bottom, 10) + 82 }]}>
          {history.isError ? <Text accessibilityLiveRegion="polite" style={[styles.note, { color: colors.error }]}>Previous Kairos messages are unavailable. Backend setup may need review; nothing has been replaced with sample history.</Text> : null}
          <View style={styles.consent}>
            <Text style={[styles.consentText, { color: colors.muted }]}>I choose AI processing of the message I send.</Text>
            <Switch accessibilityLabel="Allow AI processing of this message" value={visible.aiConsent} onValueChange={(aiConsent) => update({ aiConsent })} disabled={isSending} trackColor={{ true: colors.primary, false: colors.border }} />
          </View>
          <View style={styles.consent}>
            <Text style={[styles.consentText, { color: colors.muted }]}>I choose to save that message and reply in my private Kairos history. This does not consent to sharing.</Text>
            <Switch accessibilityLabel="Allow owner-private Kairos history storage" value={visible.storageConsent} onValueChange={(storageConsent) => update({ storageConsent })} disabled={isSending} trackColor={{ true: colors.primary, false: colors.border }} />
          </View>
          <Text style={[styles.note, { color: colors.muted }]}>Both choices are required for this saved-chat flow. You can use learning without revealing personal details. Not an emergency service; if you cannot stay safe, contact local emergency or crisis support.</Text>
          <KairosInput label={visible.mode === "learning" ? "What would you like to learn?" : "Reflect only on what you choose"}
            value={visible.draft} onChangeText={(draft) => update({ draft })} multiline maxLength={2000}
            placeholder={visible.mode === "learning" ? "For example: What can overwhelm feel like?" : "A feeling or response I want to understand…"} />
          {visible.error ? <Text accessibilityLiveRegion="assertive" style={[styles.note, { color: colors.error }]}>{visible.error}</Text> : null}
          <KairosButton label="Send to Kairos AI" loading={isSending} disabled={!visible.draft.trim() || !visible.aiConsent || !visible.storageConsent} onPress={() => void send()} />
        </View>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 }, header: { paddingHorizontal: 20, paddingTop: 12, gap: 10 },
  note: { fontSize: 11, lineHeight: 16 }, body: { fontSize: 15, lineHeight: 23 },
  modes: { flexDirection: "row", gap: 8 }, mode: { flex: 1 },
  history: { padding: 20, gap: 12, flexGrow: 1 }, empty: { gap: 12, paddingVertical: 12 },
  emptyTitle: { fontFamily: Fonts.serif, fontSize: 29, lineHeight: 35 },
  message: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 7 }, messageLabel: { fontSize: 11, fontWeight: "700" },
  composer: { paddingHorizontal: 20, paddingTop: 10, gap: 8, borderTopWidth: 1 },
  consent: { flexDirection: "row", alignItems: "center", gap: 12 }, consentText: { flex: 1, fontSize: 11, lineHeight: 16 },
});
