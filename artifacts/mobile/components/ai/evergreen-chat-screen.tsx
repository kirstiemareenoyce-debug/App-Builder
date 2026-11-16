import { Fonts } from "@/constants/theme";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { z } from "zod";

import { ChatMessage, type ChatMessageModel } from "@/components/ai/chat-message";
import { TypingIndicator } from "@/components/ai/typing-indicator";
import { BottomSheet } from "@/components/kairos/bottom-sheet";
import { KairosButton } from "@/components/kairos/button";
import { KairosChip } from "@/components/kairos/chip";
import { KairosInput } from "@/components/kairos/input";
import { PressableScale } from "@/components/kairos/pressable-scale";
import { ScreenContainer } from "@/components/screen-container";
import { useEvergreenFeedbackMutation, useEvergreenInteractions, useEvergreenQueryMutation } from "@/hooks/use-evergreen-ai";
import { useColors } from "@/hooks/use-colors";
import { useKairosAuth } from "@/providers/supabase-auth-provider";
import { useKairosUI } from "@/providers/kairos-ui-provider";
import { useAppStore } from "@/store/use-app-store";
import { beginChatTurn, buildChatMessages, completeChatTurn, createChatSession, failChatTurn } from "@/lib/chat-history";
import type { FeedbackCategory, FeedbackRating } from "@/types/evergreen";

const querySchema = z.string().trim().min(1, "Write a message first.").max(2000, "Keep messages under 2,000 characters.");

export default function EvergreenChatScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const tabBarClearance = Math.max(insets.bottom, 10) + 82;
  const router = useRouter();
  const listRef = useRef<FlatList<ChatMessageModel>>(null);
  const { user } = useKairosAuth();
  const accountId = user?.id ?? null;
  const isPreview = Boolean(user?.isPreview);
  const draftOwner = accountId ? `${accountId}:${isPreview ? "preview" : "cloud"}` : null;
  const accountScope = useRef({ accountId, isPreview });
  // A new scope also distinguishes sign-out/back-in to the same account.
  if (accountScope.current.accountId !== accountId || accountScope.current.isPreview !== isPreview) accountScope.current = { accountId, isPreview };
  const mountedLifetime = useRef<object | null>(null);
  const activeRequest = useRef<{ scope: typeof accountScope.current; requestId: string } | null>(null);
  const requestSequence = useRef(0);
  // Hide a mismatched/legacy draft during render, before any account effect.
  const draft = useAppStore((state) => draftOwner && state.chatDraftOwnerConfirmed &&
    state.chatDraftActiveOwner === draftOwner && state.chatDraftOwner === draftOwner ? state.chatDraft : "");
  const writeDraft = useAppStore((state) => state.setChatDraft);
  const setDraft = useCallback((value: string) => {
    if (!mountedLifetime.current || accountScope.current.accountId !== accountId || accountScope.current.isPreview !== isPreview) return;
    writeDraft(value, draftOwner);
  }, [accountId, draftOwner, isPreview, writeDraft]);
  const interactions = useEvergreenInteractions();
  const queryMutation = useEvergreenQueryMutation();
  const [chatSession, setChatSession] = useState(() => createChatSession(accountId));
  const [feedbackInteractionId, setFeedbackInteractionId] = useState<string | null>(null);
  const [feedbackVisible, setFeedbackVisible] = useState(false);
  const [composerError, setComposerError] = useState<string | null>(null);
  const sessionMatchesAccount = chatSession.accountId === accountId;
  const isSending = sessionMatchesAccount && chatSession.turns.some((turn) => !turn.result);

  const messages = useMemo<ChatMessageModel[]>(() =>
    isPreview ? [] : buildChatMessages(interactions.data ?? [], chatSession, accountId),
  [interactions.data, chatSession, accountId, isPreview]);

  useLayoutEffect(() => {
    // Logout redirects can unmount this screen without a user:null render.
    // Retire requests at the unmount commit, not just on account re-renders.
    // Each setup gets a new token so Strict Effects cannot revive an old send.
    const lifetime = {};
    mountedLifetime.current = lifetime;
    return () => {
      if (mountedLifetime.current === lifetime) {
        mountedLifetime.current = null;
        activeRequest.current = null;
      }
    };
  }, []);

  useEffect(() => {
    setChatSession(createChatSession(accountId));
    setFeedbackInteractionId(null);
    setFeedbackVisible(false);
    setComposerError(null);
  }, [accountId, isPreview]);

  const openFeedback = useCallback((message: ChatMessageModel) => {
    if (!mountedLifetime.current || accountScope.current.accountId !== accountId || accountScope.current.isPreview !== isPreview || isPreview || !message.interactionId) return;
    setFeedbackInteractionId(message.interactionId);
    setFeedbackVisible(true);
  }, [accountId, isPreview]);

  const send = useCallback(async () => {
    const scope = accountScope.current;
    const lifetime = mountedLifetime.current;
    if (!lifetime || scope.accountId !== accountId || scope.isPreview !== isPreview) return;
    const isCurrentRequest = () => mountedLifetime.current === lifetime &&
      accountScope.current === scope && scope.accountId === accountId &&
      useAppStore.getState().chatDraftActiveOwner === draftOwner;
    if (!isCurrentRequest()) return;
    // The ref closes the gap before React renders the disabled button.
    if (activeRequest.current?.scope === scope) return;
    const parsed = querySchema.safeParse(draft);
    if (!parsed.success) {
      setComposerError(parsed.error.issues[0]?.message ?? "Message is invalid.");
      return;
    }
    if (!accountId || isPreview) {
      setComposerError("Sign in to talk with Evergreen AI.");
      return;
    }
    const request = { scope, requestId: `pending-${++requestSequence.current}` };
    activeRequest.current = request;
    setComposerError(null);
    setChatSession((session) => isCurrentRequest()
      ? beginChatTurn(session, accountId, request.requestId, parsed.data) : session);
    try {
      const result = await queryMutation.mutateAsync({ query: parsed.data, expectedOwner: accountId });
      if (!isCurrentRequest()) return;
      // React may evaluate a queued state updater after the lifetime changed.
      setChatSession((session) => isCurrentRequest()
        ? completeChatTurn(session, accountId, request.requestId, result) : session);
      // Do not erase a next question composed while this request was running.
      if (isCurrentRequest() && useAppStore.getState().chatDraftOwner === draftOwner && useAppStore.getState().chatDraft === draft) setDraft("");
      if (isCurrentRequest() && result.confidence_level === "low") {
        setFeedbackInteractionId(result.interaction_id);
        if (isCurrentRequest()) setFeedbackVisible(true);
      }
    } catch (requestError) {
      if (!isCurrentRequest()) return;
      setChatSession((session) => isCurrentRequest()
        ? failChatTurn(session, accountId, request.requestId) : session);
      if (isCurrentRequest()) {
        setComposerError(requestError instanceof Error ? requestError.message : "Evergreen AI could not respond.");
      }
    } finally {
      if (isCurrentRequest() && activeRequest.current === request) activeRequest.current = null;
    }
  }, [accountId, draft, draftOwner, isPreview, queryMutation, setDraft]);

  useEffect(() => {
    const lifetime = mountedLifetime.current;
    const scope = accountScope.current;
    if (lifetime && (messages.length > 0 || isSending)) {
      requestAnimationFrame(() => {
        if (mountedLifetime.current === lifetime && accountScope.current === scope && scope.accountId === accountId) {
          listRef.current?.scrollToEnd({ animated: true });
        }
      });
    }
  }, [messages.length, isSending, accountId]);

  return (
    <ScreenContainer edges={["top", "left", "right"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={8} style={styles.flex}>
        <View style={styles.header}>
          <View>
            <Text style={[styles.eyebrow, { color: colors.primary }]}>EVERGREEN · EVERYDAY HELP</Text>
            <Text accessibilityRole="header" style={[styles.title, { color: colors.foreground }]}>Evergreen AI</Text>
          </View>
          <PressableScale
            accessibilityLabel="Open learning metrics"
            onPress={() => router.push("/metrics")}
            style={[styles.metricButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <MaterialIcons color={colors.primary} name="insights" size={24} />
          </PressableScale>
        </View>

        <FlatList
          ref={listRef}
          data={messages}
          initialNumToRender={12}
          maxToRenderPerBatch={10}
          windowSize={9}
          keyExtractor={(item) => item.id}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={messages.length === 0 ? styles.emptyContent : styles.listContent}
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={[styles.sparkle, { backgroundColor: `${colors.primary}22` }]}>
                <MaterialIcons color={colors.primary} name="auto-awesome" size={38} />
              </View>
              <Text style={[styles.emptyEyebrow, { color: colors.primary }]}>EVERYDAY QUESTIONS, PRACTICAL HELP</Text>
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Make room for life.</Text>
              <Text style={[styles.emptyAccent, { color: colors.secondary }]}>One question at a time.</Text>
              <Text style={[styles.emptyBody, { color: colors.muted }]}>
                {user?.isPreview
                  ? "Preview the conversation interface. Sign in and configure the AI backend for live requests."
                  : "Ask a question, organise an everyday plan, or get help thinking through your next step. Kairos learning and Aevum coaching have separate spaces."}
              </Text>
            </View>
          }
          ListFooterComponent={isSending ? <TypingIndicator /> : undefined}
          renderItem={({ item }) => <ChatMessage message={item} onFeedback={openFeedback} />}
        />

        {interactions.isError ? (
          <Text accessibilityLiveRegion="polite" style={[styles.inlineError, { color: colors.error }]}>
            Previous messages could not be loaded. Pulling a new response is still available.
          </Text>
        ) : null}
        {sessionMatchesAccount && composerError ? (
          <Text accessibilityLiveRegion="assertive" style={[styles.inlineError, { color: colors.error }]}>{composerError}</Text>
        ) : null}

        <View style={[styles.composer, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border, marginBottom: tabBarClearance }]}>
          <TextInput
            accessibilityLabel="Message Evergreen AI"
            maxLength={2000}
            multiline
            onChangeText={setDraft}
            placeholder="Ask Evergreen AI…"
            placeholderTextColor={colors.tertiary}
            selectionColor={colors.primary}
            style={[styles.input, { color: colors.foreground }]}
            value={draft}
          />
          <PressableScale
            accessibilityLabel="Send message"
            accessibilityState={{ disabled: isSending || draft.trim().length === 0 }}
            disabled={isSending || draft.trim().length === 0}
            onPress={() => void send()}
            style={[styles.sendButton, { backgroundColor: colors.primary }]}
          >
            <MaterialIcons color={colors.background} name="arrow-upward" size={23} />
          </PressableScale>
        </View>
      </KeyboardAvoidingView>
      <FeedbackModal
        key={`${draftOwner}:${feedbackInteractionId}`}
        expectedOwner={accountId}
        interactionId={sessionMatchesAccount ? feedbackInteractionId : null}
        visible={!isPreview && sessionMatchesAccount && feedbackVisible}
        onClose={() => setFeedbackVisible(false)}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { minHeight: 72, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 14, paddingHorizontal: 20 },
  eyebrow: { fontSize: 10, lineHeight: 15, fontWeight: "800", letterSpacing: 1.8 },
  title: { marginTop: 2, fontFamily: Fonts.serif, fontSize: 31, lineHeight: 38, fontWeight: "400" },
  metricButton: { width: 46, height: 46, borderRadius: 23, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  listContent: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10 },
  emptyContent: { flexGrow: 1, justifyContent: "center", paddingHorizontal: 28 },
  empty: { alignItems: "flex-start", gap: 12, width: "100%", maxWidth: 620, alignSelf: "center" },
  sparkle: { width: 64, height: 64, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  emptyEyebrow: { fontSize: 10, lineHeight: 16, letterSpacing: 1.7, fontWeight: "700" },
  emptyTitle: { fontFamily: Fonts.serif, fontSize: 34, lineHeight: 41, fontWeight: "400", textAlign: "left" },
  emptyAccent: { fontFamily: Fonts.serif, fontSize: 32, lineHeight: 39, fontStyle: "italic", fontWeight: "400", textAlign: "left", marginTop: -8 },
  emptyBody: { maxWidth: 440, fontSize: 15, lineHeight: 23, textAlign: "left" },
  inlineError: { paddingHorizontal: 20, paddingVertical: 6, fontSize: 12, lineHeight: 17 },
  composer: { minHeight: 58, maxHeight: 150, borderTopWidth: 1, flexDirection: "row", alignItems: "flex-end", gap: 10, paddingHorizontal: 12, paddingTop: 9, paddingBottom: 10 },
  input: { flex: 1, minHeight: 40, maxHeight: 120, paddingHorizontal: 10, paddingVertical: 8, fontSize: 16, lineHeight: 22, textAlignVertical: "top" },
  sendButton: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
});

const FEEDBACK_CATEGORIES: { value: FeedbackCategory; label: string }[] = [
  { value: "general", label: "General" },
  { value: "emotional_support", label: "Emotional Support" },
  { value: "practical_advice", label: "Practical Advice" },
  { value: "information", label: "Information" },
  { value: "personalisation", label: "Personalisation" },
];
const feedbackSchema = z.object({
  rating: z.union([z.literal(-1), z.literal(1)]),
  category: z.enum(["general", "emotional_support", "practical_advice", "information", "personalisation"]),
  correction: z.string().trim().max(2000).optional(),
}).refine((value) => value.rating === 1 || Boolean(value.correction?.trim()), {
  message: "Add a correction so Evergreen can learn what should change.", path: ["correction"],
});

// The compatibility feedback-modal module re-exports this owner-guarded
// implementation; every consumer must supply the initiating identity.
export function FeedbackModal({ interactionId, expectedOwner, visible, onClose }: {
  interactionId: string | null; expectedOwner: string | null; visible: boolean; onClose: () => void;
}) {
  const colors = useColors();
  const { showToast } = useKairosUI();
  const { user } = useKairosAuth();
  const feedbackMutation = useEvergreenFeedbackMutation();
  const scope = useRef({ interactionId, expectedOwner, visible, userId: user?.id, isPreview: user?.isPreview });
  if (scope.current.interactionId !== interactionId || scope.current.expectedOwner !== expectedOwner ||
    scope.current.visible !== visible || scope.current.userId !== user?.id || scope.current.isPreview !== user?.isPreview) {
    scope.current = { interactionId, expectedOwner, visible, userId: user?.id, isPreview: user?.isPreview };
  }
  const mountedLifetime = useRef<object | null>(null);
  const activeSubmit = useRef<object | null>(null);
  const [rating, setRating] = useState<FeedbackRating | null>(null);
  const [category, setCategory] = useState<FeedbackCategory>("general");
  const [correction, setCorrection] = useState("");
  const [error, setError] = useState<string | null>(null);
  const ownerMatches = Boolean(expectedOwner && user?.id === expectedOwner && !user.isPreview);
  useLayoutEffect(() => {
    const lifetime = {};
    mountedLifetime.current = lifetime;
    return () => {
      if (mountedLifetime.current === lifetime) {
        mountedLifetime.current = null;
        activeSubmit.current = null;
      }
    };
  }, []);
  useEffect(() => {
    setRating(null); setCategory("general"); setCorrection(""); setError(null);
  }, [visible, expectedOwner, interactionId]);

  const submit = async () => {
    const lifetime = mountedLifetime.current;
    const initiatingScope = scope.current;
    const isCurrent = () => Boolean(lifetime && expectedOwner && interactionId && visible && ownerMatches) &&
      mountedLifetime.current === lifetime && scope.current === initiatingScope &&
      useAppStore.getState().chatDraftActiveOwner === `${expectedOwner}:cloud`;
    if (!isCurrent() || activeSubmit.current) return;
    const parsed = feedbackSchema.safeParse({ rating, category, correction });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Complete the required feedback fields.");
      if (Platform.OS !== "web") void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    const request = {};
    activeSubmit.current = request;
    try {
      setError(null);
      await feedbackMutation.mutateAsync({
        interaction_id: interactionId!,
        rating: parsed.data.rating,
        category: parsed.data.category,
        correction: parsed.data.correction?.trim() || null,
        expectedOwner: expectedOwner!,
      });
      if (!isCurrent()) return;
      if (Platform.OS !== "web") void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (isCurrent()) showToast("Feedback saved. Evergreen will use it in future retrieval.", "success");
      if (isCurrent()) onClose();
    } catch (submitError) {
      if (isCurrent()) setError(submitError instanceof Error ? submitError.message : "Feedback could not be saved.");
    } finally {
      if (activeSubmit.current === request) activeSubmit.current = null;
    }
  };

  return (
    <BottomSheet onClose={onClose} title="Help Evergreen learn" visible={visible && ownerMatches}>
      <ScrollView contentContainerStyle={feedbackStyles.content} keyboardShouldPersistTaps="handled">
        <Text style={[feedbackStyles.prompt, { color: colors.muted }]}>Was this response useful?</Text>
        <View style={feedbackStyles.ratingRow}>
          <KairosButton label="Helpful" icon="thumb-up" tone={rating === 1 ? "primary" : "secondary"} onPress={() => setRating(1)} style={feedbackStyles.ratingButton} />
          <KairosButton label="Needs work" icon="thumb-down" tone={rating === -1 ? "danger" : "secondary"} onPress={() => setRating(-1)} style={feedbackStyles.ratingButton} />
        </View>
        <Text style={[feedbackStyles.sectionLabel, { color: colors.foreground }]}>Category</Text>
        <View style={feedbackStyles.chips}>
          {FEEDBACK_CATEGORIES.map((item) => (
            <KairosChip key={item.value} label={item.label} selected={category === item.value} onPress={() => setCategory(item.value)} />
          ))}
        </View>
        {rating === -1 ? (
          <KairosInput label="What should Kairos have said?" multiline maxLength={2000} onChangeText={setCorrection} placeholder="Add a clear correction…" value={correction} />
        ) : null}
        {error ? <Text accessibilityLiveRegion="assertive" style={[feedbackStyles.error, { color: colors.error }]}>{error}</Text> : null}
        <View style={feedbackStyles.actions}>
          <KairosButton label="Skip" tone="ghost" onPress={onClose} style={feedbackStyles.actionButton} />
          <KairosButton label="Submit" loading={feedbackMutation.isPending} onPress={submit} style={feedbackStyles.actionButton} />
        </View>
      </ScrollView>
    </BottomSheet>
  );
}

const feedbackStyles = StyleSheet.create({
  content: { gap: 15 }, prompt: { fontSize: 15, lineHeight: 21 },
  ratingRow: { flexDirection: "row", gap: 10 }, ratingButton: { flex: 1 },
  sectionLabel: { fontSize: 14, lineHeight: 19, fontWeight: "700" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  error: { fontSize: 13, lineHeight: 18 }, actions: { flexDirection: "row", gap: 10, paddingTop: 4 }, actionButton: { flex: 1 },
});
