import { Fonts } from "@/constants/theme";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { KairosBadge } from "@/components/kairos/badge";
import { BottomSheet } from "@/components/kairos/bottom-sheet";
import { KairosButton } from "@/components/kairos/button";
import { KairosCard } from "@/components/kairos/card";
import { KairosInput } from "@/components/kairos/input";
import { PressableScale } from "@/components/kairos/pressable-scale";
import { ScreenHeader } from "@/components/kairos/screen-header";
import { StatePanel } from "@/components/kairos/state-panel";
import { ScreenContainer } from "@/components/screen-container";
import { useSaveAevumConsent } from "@/hooks/use-aevum";
import { useColors } from "@/hooks/use-colors";
import { usePartnerConnection } from "@/hooks/use-partner";
import {
  useDeleteRelationshipEntry,
  useRelationshipEntries,
  useRelationshipShares,
  useRevokeRelationshipEntry,
  useSaveRelationshipEntry,
  useShareRelationshipEntry,
} from "@/hooks/use-relationship-hub";
import {
  RELATIONSHIP_MODULES,
  relationshipEntrySchema,
  type RelationshipEntry,
  type RelationshipShare,
} from "@/lib/relationship-hub";
import {
  copyRelationshipEntry,
  shareRelationshipEntry,
} from "@/lib/relationship-sharing";
import { useKairosAuth } from "@/providers/supabase-auth-provider";
import { useKairosUI } from "@/providers/kairos-ui-provider";

type EntryRow =
  | { kind: "own"; entry: RelationshipEntry }
  | { kind: "incoming"; entry: RelationshipShare };
type Confirmation = {
  kind: "partner" | "share" | "copy" | "delete" | "revoke";
  entry: RelationshipEntry;
  connectionId?: string;
  recipientId?: string;
};

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  )
    return error.message;
  return fallback;
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function sameContent(left: RelationshipEntry, right: RelationshipEntry) {
  return (
    left.title === right.title &&
    left.body === right.body &&
    left.detail_url === right.detail_url &&
    left.event_date === right.event_date &&
    left.category === right.category
  );
}

export default function AevumEntryScreen() {
  const params = useLocalSearchParams<{ category?: string | string[] }>();
  const categoryParam = Array.isArray(params.category)
    ? params.category[0]
    : params.category;
  const module = RELATIONSHIP_MODULES.find(
    (item) => item.key === categoryParam,
  );
  const colors = useColors();
  const router = useRouter();
  const { user } = useKairosAuth();
  const { showToast } = useKairosUI();
  const entriesQuery = useRelationshipEntries(module?.key);
  const sharesQuery = useRelationshipShares();
  const partnerQuery = usePartnerConnection();
  const saveEntry = useSaveRelationshipEntry();
  const deleteEntry = useDeleteRelationshipEntry();
  const shareEntry = useShareRelationshipEntry();
  const revokeEntry = useRevokeRelationshipEntry();
  const saveConsent = useSaveAevumConsent();
  const listRef = useRef<FlatList<EntryRow>>(null);
  const actionLock = useRef(false);
  const accountScope = useRef({ accountId: user?.id ?? null, isPreview: user?.isPreview ?? false, category: module?.key });
  if (accountScope.current.accountId !== (user?.id ?? null) || accountScope.current.isPreview !== (user?.isPreview ?? false) || accountScope.current.category !== module?.key) {
    accountScope.current = { accountId: user?.id ?? null, isPreview: user?.isPreview ?? false, category: module?.key };
  }
  const scope = accountScope.current;
  const composerScope = useRef(scope);
  const isFormCurrent = composerScope.current === scope;
  const mountedLifetime = useRef<object | null>(null);
  const activeSave = useRef<{ scope: typeof scope } | null>(null);
  const draftRevision = useRef(0);
  useLayoutEffect(() => {
    const lifetime = {};
    mountedLifetime.current = lifetime;
    return () => {
      if (mountedLifetime.current === lifetime) {
        mountedLifetime.current = null;
        if (activeSave.current) { activeSave.current = null; actionLock.current = false; }
      }
    };
  }, []);
  const [editingId, setEditingId] = useState<string | undefined>();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [detailUrl, setDetailUrl] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ownEntries = useMemo(
    () =>
      (entriesQuery.data ?? []).filter(
        (entry) => entry.category === module?.key && entry.user_id === user?.id,
      ),
    [entriesQuery.data, module?.key, user?.id],
  );
  const shares = sharesQuery.data ?? [];
  const incoming = useMemo(
    () =>
      (sharesQuery.data ?? []).filter(
        (share) =>
          share.category === module?.key &&
          share.recipient_id === user?.id &&
          share.owner_id !== user?.id,
      ),
    [sharesQuery.data, module?.key, user?.id],
  );
  const rows = useMemo<EntryRow[]>(
    () => [
      ...ownEntries.map((entry): EntryRow => ({ kind: "own", entry })),
      ...incoming.map((entry): EntryRow => ({ kind: "incoming", entry })),
    ],
    [ownEntries, incoming],
  );
  const connection = partnerQuery.data;
  const partnerId =
    connection &&
    user &&
    (connection.requester_id === user.id || connection.recipient_id === user.id)
      ? connection.requester_id === user.id
        ? connection.recipient_id
        : connection.requester_id
      : null;
  const canShareInApp = Boolean(
    user && !user.isPreview && connection?.status === "accepted" && partnerId,
  );
  const editingHasSnapshot = shares.some(
    (share) => share.entry_id === editingId && share.owner_id === user?.id,
  );

  const updateComposer = (update: () => void) => {
    if (!mountedLifetime.current || accountScope.current !== scope || composerScope.current !== scope) return;
    draftRevision.current += 1;
    update();
  };
  const clearComposer = () => {
    if (!mountedLifetime.current || accountScope.current !== scope) return;
    draftRevision.current += 1;
    setEditingId(undefined);
    setTitle("");
    setBody("");
    setDetailUrl("");
    setEventDate("");
    setFormError(null);
  };

  useEffect(() => {
    composerScope.current = scope;
    draftRevision.current += 1;
    if (activeSave.current && activeSave.current.scope !== scope) { activeSave.current = null; actionLock.current = false; }
    setEditingId(undefined);
    setTitle("");
    setBody("");
    setDetailUrl("");
    setEventDate("");
    setFormError(null);
    setNotice(null);
    setConfirmation(null);
    setAcknowledged(false);
    setActionError(null);
  }, [scope]);

  const savePrivate = async () => {
    const lifetime = mountedLifetime.current;
    if (!lifetime || accountScope.current !== scope || composerScope.current !== scope || !module || actionLock.current || saveEntry.isPending) return;
    const isCurrent = () => mountedLifetime.current === lifetime && accountScope.current === scope;
    const expectedOwner = scope.accountId;
    if (!expectedOwner) { setFormError("Sign in before saving, or open preview for a session-only draft."); return; }
    let parsed;
    try {
      parsed = relationshipEntrySchema.safeParse({
        category: module.key,
        title,
        body,
        detail_url: detailUrl,
        event_date: eventDate,
      });
    } catch (error) {
      setFormError(
        errorMessage(
          error,
          "Check your title, reflection, HTTPS link and date.",
        ),
      );
      return;
    }
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? "Check your entry.");
      return;
    }
    actionLock.current = true;
    const request = { scope };
    activeSave.current = request;
    const revision = draftRevision.current;
    setFormError(null);
    try {
      await saveEntry.mutateAsync({
        expectedOwner,
        id: editingId,
        category: module.key,
        title: parsed.data.title,
        body: parsed.data.body,
        detail_url: parsed.data.detail_url ?? "",
        event_date: parsed.data.event_date ?? "",
      });
      if (!isCurrent()) return;
      if (draftRevision.current === revision) clearComposer();
      const message = user?.isPreview
        ? "Saved privately for this preview session only. Nothing was sent or saved to a server."
        : "Saved privately. Nothing was shared; existing shared snapshots are unchanged.";
      setNotice(message);
      showToast(
        user?.isPreview
          ? "Private preview entry saved for this session."
          : "Private entry saved. Nothing sent.",
        "success",
      );
    } catch (error) {
      if (!isCurrent()) return;
      setFormError(
        errorMessage(
          error,
          "Your private entry could not be saved. Please try again.",
        ),
      );
    } finally {
      if (isCurrent() && activeSave.current === request) { activeSave.current = null; actionLock.current = false; }
    }
  };

  const edit = (entry: RelationshipEntry) => {
    if (!mountedLifetime.current || accountScope.current !== scope || entry.user_id !== scope.accountId) return;
    draftRevision.current += 1;
    setEditingId(entry.id);
    setTitle(entry.title);
    setBody(entry.body);
    setDetailUrl(entry.detail_url ?? "");
    setEventDate(entry.event_date ?? "");
    setFormError(null);
    setNotice(null);
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  };

  const openConfirmation = (
    kind: Confirmation["kind"],
    entry: RelationshipEntry,
  ) => {
    if (busy || actionLock.current) return;
    setAcknowledged(false);
    setActionError(null);
    if (kind === "partner" && (!canShareInApp || !connection || !partnerId)) {
      setNotice(
        "Accept a partner connection first. This entry is still private.",
      );
      return;
    }
    setConfirmation({
      kind,
      entry: { ...entry },
      connectionId: kind === "partner" ? connection?.id : undefined,
      recipientId: kind === "partner" ? (partnerId ?? undefined) : undefined,
    });
  };

  const closeConfirmation = () => {
    if (actionLock.current) return;
    setConfirmation(null);
    setAcknowledged(false);
    setActionError(null);
  };

  const confirmAction = async () => {
    if (!confirmation || actionLock.current || !acknowledged) return;
    const selected = confirmation;
    const latest = ownEntries.find((entry) => entry.id === selected.entry.id);
    if (!latest) {
      setActionError(
        "This entry is no longer available. Close this review and refresh your entries.",
      );
      return;
    }
    if (
      (selected.kind === "partner" ||
        selected.kind === "share" ||
        selected.kind === "copy") &&
      !sameContent(latest, selected.entry)
    ) {
      setActionError(
        "This entry changed since you opened the review. Close it and review the current version before sharing.",
      );
      setAcknowledged(false);
      return;
    }
    if (
      selected.kind === "partner" &&
      (!canShareInApp ||
        connection?.id !== selected.connectionId ||
        partnerId !== selected.recipientId)
    ) {
      setActionError(
        "Your partner connection changed. Close this review and check the current recipient before sharing.",
      );
      setAcknowledged(false);
      return;
    }
    actionLock.current = true;
    setBusy(true);
    setActionError(null);
    try {
      let message: string;
      if (selected.kind === "partner") {
        if (!selected.connectionId)
          throw new Error("An accepted partner connection is required.");
        await saveConsent.mutateAsync({
          scope: "partner_sharing",
          granted: true,
          version: "aevum-entry-sharing-v1",
        });
        await shareEntry.mutateAsync({
          entryId: selected.entry.id,
          connectionId: selected.connectionId,
          updatedAt: selected.entry.updated_at,
        });
        message =
          "This entry was shared as a snapshot with the account you confirmed. Later edits remain private.";
      } else if (selected.kind === "copy") {
        await copyRelationshipEntry(selected.entry);
        message =
          "Entry copied for external sharing. Anyone you paste it to may retain a copy; Kairos cannot recall it.";
      } else if (selected.kind === "share") {
        const result = await shareRelationshipEntry(selected.entry);
        message =
          result === "cancelled"
            ? "External sharing cancelled. No in-app partner share was created."
            : result === "copied"
              ? "Your browser copied the entry instead. Paste it only where you choose; external copies cannot be recalled."
              : "External share sheet completed. No in-app partner share was created; external copies cannot be recalled.";
      } else if (selected.kind === "delete") {
        await deleteEntry.mutateAsync(selected.entry.id);
        if (editingId === selected.entry.id) clearComposer();
        message = user?.isPreview
          ? "Entry removed from this preview session."
          : "Private entry deleted. Copies already taken outside Kairos cannot be recalled.";
      } else {
        await revokeEntry.mutateAsync(selected.entry.id);
        message =
          "In-app shared snapshots revoked. Your private entry remains. Copies outside Kairos cannot be recalled.";
      }
      setConfirmation(null);
      setAcknowledged(false);
      setNotice(message);
      showToast(message, "success");
    } catch (error) {
      setActionError(
        errorMessage(
          error,
          "This action could not be completed. Please try again.",
        ),
      );
    } finally {
      actionLock.current = false;
      setBusy(false);
    }
  };

  if (!module) {
    return (
      <ScreenContainer>
        <View style={styles.content}>
          <ScreenHeader showBack title="Relationship entry" />
          <StatePanel
            icon="error-outline"
            title="Choose a relationship option"
            message="This category is not available. Return to the hub to choose one of the 15 options."
          />
          <KairosButton
            label="Open Partner Hub"
            onPress={() => router.replace("/aevum/life" as Href)}
          />
        </View>
      </ScreenContainer>
    );
  }

  const confirmationTitle =
    confirmation?.kind === "partner"
      ? "Review partner share"
      : confirmation?.kind === "delete"
        ? "Delete private entry?"
        : confirmation?.kind === "revoke"
          ? "Revoke in-app snapshots?"
          : confirmation?.kind === "copy"
            ? "Review external copy"
            : "Review external share";
  const confirmLabel =
    confirmation?.kind === "partner"
      ? "Confirm consent and share this snapshot"
      : confirmation?.kind === "delete"
        ? "Confirm delete"
        : confirmation?.kind === "revoke"
          ? "Revoke shared snapshots"
          : confirmation?.kind === "copy"
            ? "Confirm and copy entry"
            : "Confirm and open external share";
  const destructive =
    confirmation?.kind === "delete" || confirmation?.kind === "revoke";

  return (
    <ScreenContainer>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <FlatList<EntryRow>
          ref={listRef}
          data={rows}
          keyExtractor={(item) => `${item.kind}:${item.entry.id}`}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            <View style={styles.header}>
              <ScreenHeader
                showBack
                title={module.title}
                subtitle={module.subtitle}
              />
              <KairosCard style={styles.composer}>
                <KairosBadge
                  label={
                    user?.isPreview
                      ? "Private · session-only draft"
                      : "Private composer"
                  }
                  tone="neutral"
                />
                <Text style={[styles.prompt, { color: colors.foreground }]}>
                  {module.prompt}
                </Text>
                <Text style={[styles.note, { color: colors.muted }]}>
                  A guided reflection, not automatic analysis or a prediction.
                  Nothing is sent when you save.
                </Text>
                {module.key === "future_letters" ? (
                  <Text style={[styles.notice, { color: colors.warning }]}>
                    A future date is a note for you only. There is no scheduled
                    or automatic delivery.
                  </Text>
                ) : null}
                {module.key === "unsent_thoughts" ? (
                  <Text style={[styles.notice, { color: colors.warning }]}>
                    Unsent means unsent. Sharing is optional and only happens
                    after a separate review and confirmation.
                  </Text>
                ) : null}
                {user?.isPreview ? (
                  <Text style={[styles.notice, { color: colors.warning }]}>
                    Preview entries are session-only drafts, not server saves.
                    You can copy or share externally; in-app partner sharing is
                    unavailable.
                  </Text>
                ) : null}
                <Text
                  accessibilityRole="header"
                  style={[styles.section, { color: colors.foreground }]}
                >
                  {editingId ? "Edit your private entry" : "New private entry"}
                </Text>
                {editingHasSnapshot ? (
                  <Text style={[styles.notice, { color: colors.warning }]}>
                    This entry has a shared snapshot. Your edits will NOT change
                    it. Revoke it below if you want to remove in-app access.
                  </Text>
                ) : null}
                <KairosInput
                  label="Title"
                  value={isFormCurrent ? title : ""}
                  onChangeText={(value) => updateComposer(() => setTitle(value))}
                  maxLength={120}
                  editable={!saveEntry.isPending && !busy}
                  placeholder="Give this moment a name"
                />
                <KairosInput
                  label="Your reflection"
                  value={isFormCurrent ? body : ""}
                  onChangeText={(value) => updateComposer(() => setBody(value))}
                  multiline
                  maxLength={4000}
                  editable={!saveEntry.isPending && !busy}
                  placeholder="Write in your own words…"
                  helperText={`${isFormCurrent ? body.length : 0}/4000 characters · private until you explicitly share`}
                />
                <KairosInput
                  label="HTTPS link (optional)"
                  value={isFormCurrent ? detailUrl : ""}
                  onChangeText={(value) => updateComposer(() => setDetailUrl(value))}
                  maxLength={1000}
                  editable={!saveEntry.isPending && !busy}
                  keyboardType="url"
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder="https://…"
                  helperText="A song, map, memory or plan. Do not include passwords or private access tokens."
                />
                <KairosInput
                  label="Date (optional · YYYY-MM-DD)"
                  value={isFormCurrent ? eventDate : ""}
                  onChangeText={(value) => updateComposer(() => setEventDate(value))}
                  maxLength={10}
                  editable={!saveEntry.isPending && !busy}
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder="YYYY-MM-DD"
                  helperText="For your reference only — never an automatic send date."
                />
                {isFormCurrent && formError ? (
                  <Text
                    accessibilityLiveRegion="assertive"
                    style={[styles.notice, { color: colors.error }]}
                  >
                    {formError}
                  </Text>
                ) : null}
                <KairosButton
                  label={editingId ? "Update privately" : "Save privately"}
                  icon="lock"
                  loading={saveEntry.isPending}
                  disabled={busy}
                  onPress={() => void savePrivate()}
                />
                {editingId ? (
                  <KairosButton
                    label="Cancel editing"
                    tone="ghost"
                    disabled={saveEntry.isPending || busy}
                    onPress={clearComposer}
                  />
                ) : null}
              </KairosCard>
              {isFormCurrent && notice ? (
                <KairosCard>
                  <Text
                    accessibilityLiveRegion="polite"
                    style={[styles.body, { color: colors.foreground }]}
                  >
                    {notice}
                  </Text>
                </KairosCard>
              ) : null}
              {partnerQuery.isLoading && !user?.isPreview ? (
                <StatePanel
                  loading
                  title="Checking partner"
                  message="Confirming your latest connection…"
                />
              ) : null}
              {partnerQuery.isError ? (
                <StatePanel
                  icon="error-outline"
                  title="Partner status unavailable"
                  message={errorMessage(
                    partnerQuery.error,
                    "Could not load the current partner connection.",
                  )}
                  actionLabel="Retry connection"
                  onAction={() => void partnerQuery.refetch()}
                />
              ) : null}
              {!canShareInApp ? (
                <KairosCard style={styles.composer}>
                  <Text style={[styles.note, { color: colors.muted }]}>
                    {user?.isPreview
                      ? "Preview offers external share and copy only. No real partner is connected."
                      : "An accepted partner connection is needed for in-app sharing. Everyday entries do not require assessment completion."}
                  </Text>
                  <KairosButton
                    label="Open partner connection"
                    tone="secondary"
                    icon="handshake"
                    onPress={() => router.push("/aevum/partner" as Href)}
                  />
                </KairosCard>
              ) : null}
              <Text
                accessibilityRole="header"
                style={[styles.section, { color: colors.foreground }]}
              >
                Your entries · {ownEntries.length}
              </Text>
              {entriesQuery.isLoading ? (
                <StatePanel
                  loading
                  title="Loading entries"
                  message="Fetching your own entries for this option…"
                />
              ) : null}
              {entriesQuery.isError ? (
                <StatePanel
                  icon="error-outline"
                  title="Entries unavailable"
                  message={errorMessage(
                    entriesQuery.error,
                    "Could not load your entries.",
                  )}
                  actionLabel="Retry entries"
                  onAction={() => void entriesQuery.refetch()}
                />
              ) : null}
              {!entriesQuery.isLoading &&
              !entriesQuery.isError &&
              ownEntries.length === 0 ? (
                <StatePanel
                  icon={module.icon}
                  title="Your first entry starts here"
                  message="Use the prompt above. Save privately, then decide whether you want to share."
                />
              ) : null}
            </View>
          }
          renderItem={({ item, index }) => {
            if (item.kind === "incoming") {
              const snapshot = item.entry;
              return (
                <View style={styles.row}>
                  {index === ownEntries.length ? (
                    <View style={styles.incomingHeader}>
                      <Text
                        accessibilityRole="header"
                        style={[styles.section, { color: colors.foreground }]}
                      >
                        From partner · {incoming.length}
                      </Text>
                      <Text style={[styles.note, { color: colors.muted }]}>
                        Read-only snapshots shared by choice. They do not expose
                        the partner's private journal.
                      </Text>
                    </View>
                  ) : null}
                  <KairosCard style={styles.entry}>
                    <KairosBadge
                      label="From partner · shared snapshot"
                      tone="success"
                    />
                    <Text
                      selectable
                      style={[styles.entryTitle, { color: colors.foreground }]}
                    >
                      {snapshot.title}
                    </Text>
                    <Text
                      selectable
                      style={[styles.body, { color: colors.foreground }]}
                    >
                      {snapshot.body}
                    </Text>
                    {snapshot.event_date ? (
                      <Text
                        selectable
                        style={[styles.note, { color: colors.muted }]}
                      >
                        Date: {snapshot.event_date}
                      </Text>
                    ) : null}
                    {snapshot.detail_url ? (
                      <Text
                        selectable
                        style={[styles.link, { color: colors.primary }]}
                      >
                        {snapshot.detail_url}
                      </Text>
                    ) : null}
                    <Text
                      selectable
                      style={[styles.note, { color: colors.muted }]}
                    >
                      From account: {snapshot.owner_id}
                    </Text>
                    <Text style={[styles.note, { color: colors.muted }]}>
                      Shared: {formatDate(snapshot.shared_at)}
                    </Text>
                  </KairosCard>
                </View>
              );
            }
            const entry = item.entry;
            const snapshots = shares.filter(
              (share) =>
                share.entry_id === entry.id && share.owner_id === user?.id,
            );
            return (
              <KairosCard style={[styles.entry, styles.row]}>
                <KairosBadge
                  label={
                    user?.isPreview
                      ? "Your entry · session-only draft"
                      : "Your private entry"
                  }
                  tone="neutral"
                />
                <Text
                  selectable
                  style={[styles.entryTitle, { color: colors.foreground }]}
                >
                  {entry.title}
                </Text>
                <Text
                  selectable
                  style={[styles.body, { color: colors.foreground }]}
                >
                  {entry.body}
                </Text>
                {entry.event_date ? (
                  <Text
                    selectable
                    style={[styles.note, { color: colors.muted }]}
                  >
                    Date: {entry.event_date} · no automatic delivery
                  </Text>
                ) : null}
                {entry.detail_url ? (
                  <Text
                    selectable
                    style={[styles.link, { color: colors.primary }]}
                  >
                    {entry.detail_url}
                  </Text>
                ) : null}
                <Text style={[styles.note, { color: colors.muted }]}>
                  Updated: {formatDate(entry.updated_at)}
                </Text>
                <View style={styles.actions}>
                  <KairosButton
                    compact
                    label="Edit"
                    icon="edit"
                    tone="secondary"
                    disabled={busy || saveEntry.isPending}
                    onPress={() => edit(entry)}
                    style={styles.action}
                  />
                  <KairosButton
                    compact
                    label="Delete"
                    icon="delete-outline"
                    tone="ghost"
                    disabled={busy || saveEntry.isPending}
                    onPress={() => openConfirmation("delete", entry)}
                    style={styles.action}
                  />
                </View>
                {!user?.isPreview ? (
                  <KairosButton
                    label={
                      snapshots.length
                        ? "Review and share current version"
                        : "Share with partner"
                    }
                    accessibilityLabel="Share with partner: review this entry and confirm the recipient"
                    icon="handshake"
                    disabled={
                      !canShareInApp ||
                      partnerQuery.isError ||
                      sharesQuery.isError ||
                      busy ||
                      saveEntry.isPending
                    }
                    onPress={() => openConfirmation("partner", entry)}
                  />
                ) : null}
                <View style={styles.actions}>
                  <KairosButton
                    compact
                    label={
                      user?.isPreview
                        ? "Share externally (preview)"
                        : "Share externally"
                    }
                    icon="share"
                    tone="secondary"
                    disabled={busy || saveEntry.isPending}
                    onPress={() => openConfirmation("share", entry)}
                    style={styles.action}
                  />
                  <KairosButton
                    compact
                    label={
                      user?.isPreview ? "Copy (preview)" : "Copy externally"
                    }
                    icon="content-copy"
                    tone="ghost"
                    disabled={busy || saveEntry.isPending}
                    onPress={() => openConfirmation("copy", entry)}
                    style={styles.action}
                  />
                </View>
                {snapshots.length ? (
                  <View style={styles.sharedArea}>
                    <Text style={[styles.notice, { color: colors.warning }]}>
                      Shared snapshots are separate from this private entry.
                      Edits never update them automatically.
                    </Text>
                    <FlatList
                      data={snapshots}
                      scrollEnabled={false}
                      keyExtractor={(snapshot) => snapshot.id}
                      renderItem={({ item: snapshot }) => (
                        <View
                          style={[
                            styles.snapshot,
                            { borderColor: colors.border },
                          ]}
                        >
                          <Text style={[styles.note, { color: colors.muted }]}>
                            Snapshot shared {formatDate(snapshot.shared_at)}
                          </Text>
                          <Text
                            selectable
                            style={[styles.note, { color: colors.muted }]}
                          >
                            To account: {snapshot.recipient_id}
                          </Text>
                          <Text
                            selectable
                            style={[
                              styles.entryTitle,
                              { color: colors.foreground },
                            ]}
                          >
                            {snapshot.title}
                          </Text>
                          <Text
                            selectable
                            style={[styles.body, { color: colors.muted }]}
                          >
                            {snapshot.body}
                          </Text>
                          {snapshot.event_date ? (
                            <Text
                              selectable
                              style={[styles.note, { color: colors.muted }]}
                            >
                              Date: {snapshot.event_date}
                            </Text>
                          ) : null}
                          {snapshot.detail_url ? (
                            <Text
                              selectable
                              style={[styles.link, { color: colors.primary }]}
                            >
                              {snapshot.detail_url}
                            </Text>
                          ) : null}
                        </View>
                      )}
                    />
                    <KairosButton
                      label="Revoke in-app shared snapshots"
                      icon="lock"
                      tone="danger"
                      disabled={busy || saveEntry.isPending}
                      onPress={() => openConfirmation("revoke", entry)}
                    />
                  </View>
                ) : null}
              </KairosCard>
            );
          }}
          ListFooterComponent={
            <View style={styles.footer}>
              {sharesQuery.isLoading ? (
                <StatePanel
                  loading
                  title="Loading shared snapshots"
                  message="Checking your own shares and incoming messages…"
                />
              ) : null}
              {sharesQuery.isError ? (
                <StatePanel
                  icon="error-outline"
                  title="Shared snapshots unavailable"
                  message={errorMessage(
                    sharesQuery.error,
                    "Could not load shared messages. Your private entries are separate.",
                  )}
                  actionLabel="Retry shared snapshots"
                  onAction={() => void sharesQuery.refetch()}
                />
              ) : null}
              {!sharesQuery.isLoading &&
              !sharesQuery.isError &&
              incoming.length === 0 ? (
                <StatePanel
                  icon="mail-outline"
                  title="No messages from partner here yet"
                  message={
                    user?.isPreview
                      ? "There are no real incoming messages in preview mode."
                      : "Only explicitly shared snapshots in this option appear here."
                  }
                />
              ) : null}
              <Text style={[styles.note, { color: colors.muted }]}>
                Every save is private. A shared snapshot stays as it was until
                you explicitly share again or revoke it. Revocation cannot
                recall screenshots, clipboard text or copies outside Kairos.
              </Text>
            </View>
          }
        />
      </KeyboardAvoidingView>
      <BottomSheet
        visible={Boolean(confirmation)}
        title={confirmationTitle}
        onClose={closeConfirmation}
      >
        {confirmation ? (
          <>
            <Text style={[styles.notice, { color: colors.warning }]}>
              {confirmation.kind === "partner"
                ? "You are granting partner_sharing consent for this deliberate action. Only this entry's title, body, date and link are shared as a snapshot; no assessment answers or other entries. Future edits are not sent."
                : confirmation.kind === "delete"
                  ? "Delete this private entry? This cannot be undone. Copies already taken outside Kairos cannot be recalled."
                  : confirmation.kind === "revoke"
                    ? "Remove in-app partner access to all shared snapshots of this entry. Keep the private original. This cannot recall copies taken outside Kairos."
                    : "This sends or copies personal text outside Kairos. Other apps, recipients and your clipboard may retain it. Kairos cannot revoke those copies. A browser may copy instead of opening a share sheet."}
            </Text>
            {confirmation.kind === "partner" ? (
              <View style={styles.recipient}>
                <Text style={[styles.note, { color: colors.muted }]}>
                  Current selected recipient account ID
                </Text>
                <Text
                  selectable
                  style={[styles.accountId, { color: colors.foreground }]}
                >
                  {confirmation.recipientId}
                </Text>
              </View>
            ) : null}
            {user?.isPreview ? (
              <Text style={[styles.notice, { color: colors.warning }]}>
                Session-only draft in preview. External payloads are labelled as
                preview by the sharing helper.
              </Text>
            ) : null}
            <FlatList
              style={styles.reviewList}
              data={[confirmation.entry]}
              keyExtractor={(entry) => entry.id}
              renderItem={({ item }) => (
                <View style={styles.review}>
                  <Text
                    selectable
                    style={[styles.entryTitle, { color: colors.foreground }]}
                  >
                    {item.title}
                  </Text>
                  <Text
                    selectable
                    style={[styles.body, { color: colors.foreground }]}
                  >
                    {item.body}
                  </Text>
                  {item.event_date ? (
                    <Text
                      selectable
                      style={[styles.note, { color: colors.muted }]}
                    >
                      Date: {item.event_date} · no automatic delivery
                    </Text>
                  ) : null}
                  {item.detail_url ? (
                    <Text
                      selectable
                      style={[styles.link, { color: colors.primary }]}
                    >
                      {item.detail_url}
                    </Text>
                  ) : null}
                </View>
              )}
            />
            <PressableScale
              accessibilityRole="checkbox"
              accessibilityLabel={
                destructive
                  ? "I understand this action and want to proceed"
                  : "I have reviewed this exact entry and recipient and agree to share or copy it"
              }
              accessibilityState={{ checked: acknowledged, disabled: busy }}
              disabled={busy}
              onPress={() => setAcknowledged((value) => !value)}
              style={[
                styles.acknowledgement,
                {
                  borderColor: acknowledged ? colors.primary : colors.border,
                  backgroundColor: colors.surface,
                },
              ]}
            >
              <Text style={[styles.ackText, { color: colors.foreground }]}>
                {acknowledged ? "Acknowledged · " : "Tap to acknowledge · "}
                {destructive
                  ? "I understand and want to proceed."
                  : confirmation.kind === "partner"
                    ? "I reviewed this entry and recipient, consent to partner sharing, and choose to send this snapshot."
                    : "I reviewed this entry and understand external copies cannot be recalled."}
              </Text>
            </PressableScale>
            {actionError ? (
              <Text
                accessibilityLiveRegion="assertive"
                style={[styles.notice, { color: colors.error }]}
              >
                {actionError}
              </Text>
            ) : null}
            <KairosButton
              label={confirmLabel}
              tone={destructive ? "danger" : "primary"}
              loading={busy}
              disabled={
                !acknowledged ||
                (confirmation.kind === "partner" &&
                  (!canShareInApp || partnerQuery.isError))
              }
              onPress={() => void confirmAction()}
            />
            <KairosButton
              label="Cancel — keep private"
              tone="ghost"
              disabled={busy}
              onPress={closeConfirmation}
            />
          </>
        ) : null}
      </BottomSheet>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  header: { gap: 16, marginBottom: 14 },
  composer: { padding: 18, gap: 14 },
  prompt: { fontSize: 16, lineHeight: 24, fontWeight: "700" },
  section: { fontSize: 18, lineHeight: 24, fontFamily: Fonts.serif, fontWeight: "400" },
  entry: { gap: 12 },
  row: { marginBottom: 14 },
  entryTitle: { fontSize: 18, lineHeight: 25, fontWeight: "800" },
  body: { fontSize: 15, lineHeight: 23 },
  note: { fontSize: 12, lineHeight: 18 },
  notice: { fontSize: 13, lineHeight: 20 },
  link: { fontSize: 13, lineHeight: 20 },
  accountId: { fontSize: 13, lineHeight: 20, fontWeight: "700" },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  action: { flex: 1, minWidth: 125 },
  sharedArea: { gap: 12 },
  snapshot: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 8,
    marginBottom: 8,
  },
  incomingHeader: { gap: 6, marginTop: 8, marginBottom: 14 },
  footer: { gap: 12, paddingTop: 8 },
  recipient: { gap: 5 },
  reviewList: { flexGrow: 0, flexShrink: 1, maxHeight: 260 },
  review: { gap: 10, paddingVertical: 4 },
  acknowledgement: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    minHeight: 48,
  },
  ackText: { fontSize: 13, lineHeight: 20, fontWeight: "700" },
});
