import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { useRouter, type Href } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Image,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { KairosBadge } from "@/components/kairos/badge";
import { KairosButton } from "@/components/kairos/button";
import { KairosCard } from "@/components/kairos/card";
import { PressableScale } from "@/components/kairos/pressable-scale";
import { ScreenHeader } from "@/components/kairos/screen-header";
import { StatePanel } from "@/components/kairos/state-panel";
import { ScreenContainer } from "@/components/screen-container";
import { useAevumConsents, useSaveAevumConsent } from "@/hooks/use-aevum";
import { useColors } from "@/hooks/use-colors";
import { usePartnerConnection } from "@/hooks/use-partner";
import {
  useDeleteRelationshipMedia,
  useRelationshipMediaItems,
  useRelationshipMediaShares,
  useRevokeRelationshipMedia,
  useSaveRelationshipMedia,
  useShareRelationshipMedia,
  type RelationshipMediaShareWithPhoto,
  type RelationshipMediaWithPhoto,
} from "@/hooks/use-relationship-media";
import {
  mediaProviderLabel,
  providerForSongUrl,
  songLinkSchema,
  validateMemoryPhoto,
  type MemoryPhotoInput,
  type RelationshipMediaShare,
} from "@/lib/relationship-media";
import {
  acceptedMediaRecipient,
  createRelationshipMediaReview,
  mediaReviewError,
  sendReviewedRelationshipMedia,
  type MediaReviewContext,
  type RelationshipMediaReview,
} from "@/lib/relationship-media-review";
import { useKairosAuth } from "@/providers/supabase-auth-provider";
import { useKairosUI } from "@/providers/kairos-ui-provider";

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  multiline = false,
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  multiline?: boolean;
  keyboardType?: "url" | "default";
}) {
  const colors = useColors();
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: colors.foreground }]}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        keyboardType={keyboardType}
        autoCapitalize={keyboardType === "url" ? "none" : "sentences"}
        autoCorrect={keyboardType !== "url"}
        multiline={multiline}
        maxLength={multiline ? 500 : 1000}
        style={[
          styles.input,
          multiline && styles.multiline,
          {
            color: colors.foreground,
            borderColor: colors.border,
            backgroundColor: colors.background,
          },
        ]}
      />
    </View>
  );
}

function errorText(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export default function RelationshipMediaScreen() {
  const router = useRouter();
  const colors = useColors();
  const { user } = useKairosAuth();
  const { showToast } = useKairosUI();
  const itemsQuery = useRelationshipMediaItems();
  const sharesQuery = useRelationshipMediaShares();
  const partnerQuery = usePartnerConnection();
  const consentsQuery = useAevumConsents();
  const saveConsent = useSaveAevumConsent();
  const saveMedia = useSaveRelationshipMedia();
  const deleteMedia = useDeleteRelationshipMedia();
  const shareMedia = useShareRelationshipMedia();
  const revokeMedia = useRevokeRelationshipMedia();
  const [songTitle, setSongTitle] = useState("");
  const [songUrl, setSongUrl] = useState("");
  const [songNote, setSongNote] = useState("");
  const [photo, setPhoto] = useState<MemoryPhotoInput | null>(null);
  const [photoTitle, setPhotoTitle] = useState("");
  const [photoNote, setPhotoNote] = useState("");
  const [pendingShare, setPendingShare] =
    useState<RelationshipMediaReview | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [confirmingShare, setConfirmingShare] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  const items = itemsQuery.data ?? [];
  const shares = sharesQuery.data ?? [];
  const connection = partnerQuery.data;
  const canShare = Boolean(acceptedMediaRecipient(user, connection));
  const currentShareContext = useRef<MediaReviewContext>({
    user,
    connection,
    items,
    partnerSharingConsent: consentsQuery.data?.partner_sharing,
    permissionsReady: consentsQuery.isSuccess && !partnerQuery.isError,
  });
  currentShareContext.current = {
    user,
    connection,
    items,
    partnerSharingConsent: consentsQuery.data?.partner_sharing,
    permissionsReady: consentsQuery.isSuccess && !partnerQuery.isError,
  };
  const reviewState = useRef({ review: pendingShare, acknowledged });
  reviewState.current = { review: pendingShare, acknowledged };
  const confirmationInFlight = useRef(false);
  const resetReview = useCallback((error: string | null = null) => {
    reviewState.current = { review: null, acknowledged: false };
    setPendingShare(null);
    setAcknowledged(false);
    setShareError(error);
  }, []);

  useEffect(() => {
    resetReview();
  }, [user?.id, user?.isPreview, resetReview]);

  useEffect(() => {
    // The account-change effect clears this without carrying a prior account's error.
    if (!pendingShare || pendingShare.ownerId !== user?.id || user?.isPreview)
      return;
    const error = mediaReviewError(pendingShare, currentShareContext.current);
    if (error) resetReview(error);
  }, [
    pendingShare,
    user?.id,
    user?.isPreview,
    connection,
    itemsQuery.data,
    consentsQuery.data,
    consentsQuery.isSuccess,
    partnerQuery.isError,
    resetReview,
  ]);

  const incoming = shares.filter(
    (share) => share.recipient_id === user?.id && share.owner_id !== user?.id,
  );
  const outgoing = shares.filter((share) => share.owner_id === user?.id);

  const choosePhoto = async () => {
    setFormError(null);
    try {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted)
        throw new Error("Allow photo-library access to choose a memory.");
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.82,
        allowsEditing: false,
        exif: false,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      const selected: MemoryPhotoInput = {
        uri: asset.uri,
        mimeType: asset.mimeType,
        fileName: asset.fileName,
        fileSize: asset.fileSize,
      };
      validateMemoryPhoto(selected);
      setPhoto(selected);
      if (!photoTitle.trim())
        setPhotoTitle(
          asset.fileName?.replace(/\.[^.]+$/, "") || "A moment together",
        );
    } catch (error) {
      setFormError(errorText(error, "The photo could not be selected."));
    }
  };

  const chooseFromFiles = async () => {
    setFormError(null);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["image/jpeg", "image/png", "image/webp"],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      const selected: MemoryPhotoInput = {
        uri: asset.uri,
        mimeType: asset.mimeType,
        fileName: asset.name,
        fileSize: asset.size,
      };
      validateMemoryPhoto(selected);
      setPhoto(selected);
      if (!photoTitle.trim())
        setPhotoTitle(
          asset.name.replace(/\.[^.]+$/, "") || "A moment together",
        );
    } catch (error) {
      setFormError(
        errorText(error, "The photo could not be selected from Files."),
      );
    }
  };

  const addSong = async () => {
    setFormError(null);
    const parsed = songLinkSchema.safeParse({
      title: songTitle,
      note: songNote,
      url: songUrl,
    });
    if (!parsed.success) {
      setFormError(
        parsed.error.issues[0]?.message ?? "Check the song details.",
      );
      return;
    }
    try {
      await saveMedia.mutateAsync({
        kind: "song",
        title: parsed.data.title,
        note: parsed.data.note,
        external_url: parsed.data.url,
        provider: providerForSongUrl(parsed.data.url),
      });
      setSongTitle("");
      setSongUrl("");
      setSongNote("");
      showToast(
        user?.isPreview
          ? "Saved for this preview session only."
          : "Song link saved privately. Nothing was shared.",
        "success",
      );
    } catch (error) {
      setFormError(errorText(error, "The song link could not be saved."));
    }
  };

  const addPhoto = async () => {
    setFormError(null);
    if (!photo) {
      setFormError("Choose a photo first.");
      return;
    }
    if (!photoTitle.trim()) {
      setFormError("Add a title for this memory.");
      return;
    }
    try {
      await saveMedia.mutateAsync({
        kind: "photo",
        provider: "device_gallery",
        title: photoTitle.trim(),
        note: photoNote.trim(),
        photo,
      });
      setPhoto(null);
      setPhotoTitle("");
      setPhotoNote("");
      showToast(
        user?.isPreview
          ? "Photo saved in preview memory only."
          : "Photo saved privately. Nothing was shared.",
        "success",
      );
    } catch (error) {
      setFormError(errorText(error, "The photo could not be saved."));
    }
  };

  const beginShare = (item: RelationshipMediaWithPhoto) => {
    if (!canShare) {
      showToast(
        "Connect an accepted partner before sharing inside the app. This memory remains private.",
        "error",
      );
      return;
    }
    if (confirmationInFlight.current) return;
    try {
      const review = createRelationshipMediaReview(
        item,
        currentShareContext.current,
      );
      setShareError(null);
      setAcknowledged(false);
      reviewState.current = { review, acknowledged: false };
      setPendingShare(review);
    } catch (error) {
      resetReview(
        errorText(error, "This item could not be reviewed for sharing."),
      );
    }
  };

  const confirmShare = async () => {
    const review = reviewState.current.review;
    if (
      !review ||
      !reviewState.current.acknowledged ||
      confirmationInFlight.current
    )
      return;
    confirmationInFlight.current = true;
    setConfirmingShare(true);
    setShareError(null);
    try {
      await sendReviewedRelationshipMedia(review, {
        getCurrent: () => currentShareContext.current,
        refreshCurrent: async () => {
          const [partnerResult, consentResult] = await Promise.all([
            partnerQuery.refetch(),
            consentsQuery.refetch(),
          ]);
          return {
            ...currentShareContext.current,
            connection: partnerResult.data,
            partnerSharingConsent: consentResult.data?.partner_sharing,
            permissionsReady:
              partnerResult.isSuccess && consentResult.isSuccess,
          };
        },
        isReviewAcknowledged: () =>
          reviewState.current.review === review &&
          reviewState.current.acknowledged,
        saveConsent: () =>
          saveConsent.mutateAsync({
            scope: "partner_sharing",
            granted: true,
            version: "relationship-media-sharing-v1",
          }),
        shareMedia: (input) => shareMedia.mutateAsync(input),
      });
      if (
        currentShareContext.current.user?.id !== review.ownerId ||
        reviewState.current.review !== review
      )
        return;
      resetReview();
      showToast(
        "Shared this item as a snapshot with the partner account you reviewed.",
        "success",
      );
    } catch (error) {
      if (
        currentShareContext.current.user?.id === review.ownerId &&
        reviewState.current.review === review
      )
        resetReview(
          errorText(
            error,
            "The item was not shared. Review again before retrying.",
          ),
        );
    } finally {
      confirmationInFlight.current = false;
      setConfirmingShare(false);
    }
  };

  const removeItem = (item: RelationshipMediaWithPhoto) => {
    const remove = async () => {
      try {
        await deleteMedia.mutateAsync(item.id);
        showToast(
          "Memory removed. Any in-app share was also revoked.",
          "success",
        );
      } catch (error) {
        showToast(
          errorText(error, "The memory could not be removed."),
          "error",
        );
      }
    };
    if (Platform.OS === "web") {
      if (
        typeof window !== "undefined" &&
        window.confirm(`Remove “${item.title}” and revoke its in-app share?`)
      )
        void remove();
    } else
      Alert.alert(
        "Remove memory?",
        `This deletes “${item.title}” and removes its in-app share.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Remove",
            style: "destructive",
            onPress: () => void remove(),
          },
        ],
      );
  };

  const revoke = (share: RelationshipMediaShare) => {
    const run = async () => {
      try {
        await revokeMedia.mutateAsync(share.item_id);
        showToast("In-app access to this snapshot was revoked.", "success");
      } catch (error) {
        showToast(errorText(error, "The share could not be revoked."), "error");
      }
    };
    if (Platform.OS === "web") {
      if (
        typeof window !== "undefined" &&
        window.confirm(`Revoke “${share.title}” from your partner?`)
      )
        void run();
    } else
      Alert.alert(
        "Revoke share?",
        `This removes your partner’s in-app access to “${share.title}”. Copies outside the app cannot be recalled.`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Revoke", style: "destructive", onPress: () => void run() },
        ],
      );
  };

  const openSong = async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch {
      showToast("This link could not be opened on this device.", "error");
    }
  };

  const renderItem = (
    item: RelationshipMediaWithPhoto | RelationshipMediaShareWithPhoto,
    isShared = false,
  ) => (
    <KairosCard
      key={`${isShared ? "shared" : "own"}-${item.id}`}
      style={styles.itemCard}
    >
      {item.kind === "photo" &&
      (item.photo_url || ("preview_uri" in item && item.preview_uri)) ? (
        <Image
          source={{
            uri:
              item.photo_url ??
              ("preview_uri" in item ? item.preview_uri : null) ??
              undefined,
          }}
          style={styles.memoryImage}
          accessibilityLabel={`${item.title} photo memory`}
        />
      ) : (
        <View
          style={[styles.itemIcon, { backgroundColor: `${colors.primary}20` }]}
        >
          <MaterialIcons
            name={item.kind === "photo" ? "photo" : "music-note"}
            size={25}
            color={colors.primary}
          />
        </View>
      )}
      <View style={styles.itemCopy}>
        <Text style={[styles.itemTitle, { color: colors.foreground }]}>
          {item.title}
        </Text>
        <Text style={[styles.helper, { color: colors.muted }]}>
          {mediaProviderLabel(item.provider)}
          {isShared ? " · shared snapshot" : " · private unless shared"}
        </Text>
        {item.note ? (
          <Text style={[styles.body, { color: colors.muted }]}>
            {item.note}
          </Text>
        ) : null}
        {item.kind === "song" && item.external_url ? (
          <PressableScale
            accessibilityRole="link"
            accessibilityLabel={`Open ${item.title} song link`}
            onPress={() => void openSong(item.external_url!)}
            style={styles.linkRow}
          >
            <MaterialIcons
              name="open-in-new"
              size={16}
              color={colors.primary}
            />
            <Text
              numberOfLines={1}
              style={[styles.link, { color: colors.primary }]}
            >
              Open song link
            </Text>
          </PressableScale>
        ) : null}
      </View>
      {!isShared ? (
        <View style={styles.itemActions}>
          <KairosButton
            compact
            label="Share"
            icon="favorite-border"
            tone="secondary"
            disabled={!canShare || confirmingShare}
            onPress={() => beginShare(item as RelationshipMediaWithPhoto)}
          />
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel={`Remove ${item.title}`}
            onPress={() => removeItem(item as RelationshipMediaWithPhoto)}
            style={styles.deleteButton}
          >
            <MaterialIcons
              name="delete-outline"
              color={colors.error}
              size={21}
            />
          </PressableScale>
        </View>
      ) : null}
    </KairosCard>
  );

  return (
    <ScreenContainer>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <ScreenHeader
          showBack
          title="Songs & memories"
          subtitle="Keep a moment together, then decide if and when to share it."
        />
        <KairosCard style={styles.privacyCard}>
          <MaterialIcons name="lock-outline" size={21} color={colors.primary} />
          <Text style={[styles.body, { color: colors.muted }]}>
            {user?.isPreview
              ? "Preview only: selected photos and links are kept in app memory for this session; there is no real partner or server save."
              : "Private by default. Photos are uploaded to private owner-scoped storage. In-app photo links expire after five minutes. Sharing sends only the item you review, to your accepted partner, and can be revoked in the app."}
          </Text>
        </KairosCard>
        <KairosCard style={styles.sectionCard}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
            Add a song
          </Text>
          <Text style={[styles.body, { color: colors.muted }]}>
            Paste a track link from Spotify, SoundCloud, YouTube Music, or
            another HTTPS page. Kairos stores the link and opens it in that
            service; it does not browse their catalog or play tracks here.
          </Text>
          <Field
            label="Song title"
            value={songTitle}
            onChangeText={setSongTitle}
            placeholder="A song that reminds you of them"
          />
          <Field
            label="Song link"
            value={songUrl}
            onChangeText={setSongUrl}
            placeholder="https://…"
            keyboardType="url"
          />
          <Field
            label="A note for this memory (optional)"
            value={songNote}
            onChangeText={setSongNote}
            placeholder="What does this song bring back?"
            multiline
          />
          <KairosButton
            label="Save song link privately"
            icon="save"
            loading={saveMedia.isPending}
            onPress={() => void addSong()}
          />
        </KairosCard>
        <KairosCard style={styles.sectionCard}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
            Add a photo memory
          </Text>
          <Text style={[styles.body, { color: colors.muted }]}>
            Choose an image from your phone’s photo library or from Files.
            Kairos uploads a private copy only when you save it.
          </Text>
          {photo ? (
            <View style={styles.selectedPhotoRow}>
              <Image
                source={{ uri: photo.uri }}
                style={styles.selectedPhoto}
                accessibilityLabel="Selected private memory photo"
              />
              <Text style={[styles.helper, { color: colors.muted }]}>
                {photo.fileName ?? "Photo selected"} · up to 10 MB
              </Text>
              <PressableScale
                accessibilityRole="button"
                accessibilityLabel="Remove selected photo"
                onPress={() => setPhoto(null)}
              >
                <Text style={{ color: colors.error, fontWeight: "700" }}>
                  Remove
                </Text>
              </PressableScale>
            </View>
          ) : null}
          <KairosButton
            label={
              photo
                ? "Choose a different phone photo"
                : "Choose from phone photos"
            }
            icon="photo-library"
            tone="secondary"
            onPress={() => void choosePhoto()}
          />
          <KairosButton
            label="Choose from Files or cloud apps"
            icon="folder-open"
            tone="secondary"
            onPress={() => void chooseFromFiles()}
          />
          <Field
            label="Memory title"
            value={photoTitle}
            onChangeText={setPhotoTitle}
            placeholder="A moment together"
          />
          <Field
            label="A note for this memory (optional)"
            value={photoNote}
            onChangeText={setPhotoNote}
            placeholder="Where were you? What made it special?"
            multiline
          />
          <KairosButton
            label="Save photo privately"
            icon="save"
            loading={saveMedia.isPending}
            disabled={!photo}
            onPress={() => void addPhoto()}
          />
          <Text style={[styles.helper, { color: colors.muted }]}>
            Google Photos and OneDrive are selectable only if your phone’s photo
            picker or Files app exposes them. There is no direct provider
            login/library connection in this build. If a cloud-only photo is not
            listed, save/download it to the device first. See the setup notes
            for the OAuth/API work still required.
          </Text>
        </KairosCard>
        {formError ? (
          <Text
            accessibilityRole="alert"
            style={[styles.error, { color: colors.error }]}
          >
            {formError}
          </Text>
        ) : null}
        {shareError && !pendingShare ? (
          <Text
            accessibilityRole="alert"
            style={[styles.error, { color: colors.error }]}
          >
            {shareError}
          </Text>
        ) : null}
        {pendingShare ? (
          <KairosCard style={styles.reviewCard}>
            <KairosBadge label="Review before sharing" tone="neutral" />
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
              {pendingShare.title}
            </Text>
            <Text style={[styles.body, { color: colors.muted }]}>
              This sends only this {pendingShare.kind} snapshot to accepted{" "}
              {pendingShare.recipientName} ({pendingShare.recipientId}). Later
              edits are not sent. The link or photo may be retained by the
              recipient outside Kairos.
            </Text>
            <PressableScale
              accessibilityRole="checkbox"
              accessibilityState={{ checked: acknowledged }}
              disabled={confirmingShare}
              onPress={() => {
                const next = !reviewState.current.acknowledged;
                reviewState.current.acknowledged = next;
                setAcknowledged(next);
              }}
              style={styles.ackRow}
            >
              <MaterialIcons
                name={acknowledged ? "check-box" : "check-box-outline-blank"}
                size={22}
                color={colors.primary}
              />
              <Text style={[styles.body, { color: colors.foreground }]}>
                I reviewed this item and recipient, consent to partner sharing,
                and choose to send this snapshot.
              </Text>
            </PressableScale>
            {shareError ? (
              <Text
                accessibilityRole="alert"
                style={[styles.error, { color: colors.error }]}
              >
                {shareError}
              </Text>
            ) : null}
            <KairosButton
              label="Confirm and share this snapshot"
              icon="send"
              loading={
                confirmingShare || saveConsent.isPending || shareMedia.isPending
              }
              disabled={!acknowledged || confirmingShare}
              onPress={() => void confirmShare()}
            />
            <KairosButton
              label="Keep private"
              tone="ghost"
              disabled={
                confirmingShare || saveConsent.isPending || shareMedia.isPending
              }
              onPress={() => resetReview()}
            />
          </KairosCard>
        ) : null}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
            Your private collection
          </Text>
          <KairosBadge
            label={`${items.length} ${items.length === 1 ? "item" : "items"}`}
            tone="neutral"
          />
        </View>
        {itemsQuery.isLoading && !user?.isPreview ? (
          <StatePanel
            loading
            title="Loading private memories"
            message="Checking your saved songs and photos…"
          />
        ) : null}
        {itemsQuery.isError ? (
          <StatePanel
            icon="error-outline"
            title="Memories unavailable"
            message={errorText(
              itemsQuery.error,
              "Your media collection could not be loaded. Apply the relationship media database migration and retry.",
            )}
            actionLabel="Retry"
            onAction={() => void itemsQuery.refetch()}
          />
        ) : null}
        {!itemsQuery.isLoading && !itemsQuery.isError && items.length === 0 ? (
          <StatePanel
            icon="photo-library"
            title="No songs or photos yet"
            message="Add a song link or choose a phone photo above. Both stay private until you review a partner share."
          />
        ) : null}
        {items.map((item) => renderItem(item))}
        <KairosCard style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
              Shared with you
            </Text>
            <KairosBadge label={`${incoming.length}`} tone="success" />
          </View>
          <Text style={[styles.body, { color: colors.muted }]}>
            Only the individual songs and photos your partner explicitly shared
            appear here.
          </Text>
          {sharesQuery.isError ? (
            <StatePanel
              icon="error-outline"
              title="Shared memories unavailable"
              message={errorText(
                sharesQuery.error,
                "Retry after the relationship media migration is deployed.",
              )}
              actionLabel="Retry"
              onAction={() => void sharesQuery.refetch()}
            />
          ) : null}
          {incoming.length === 0 && !sharesQuery.isLoading ? (
            <Text style={[styles.helper, { color: colors.muted }]}>
              {user?.isPreview
                ? "Preview has no real incoming partner memories."
                : "Nothing shared yet. Your partner’s private collection is not visible here."}
            </Text>
          ) : null}
          {incoming.map((share) => renderItem(share, true))}
        </KairosCard>
        <KairosCard style={styles.sectionCard}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
            Shared by you
          </Text>
          <Text style={[styles.body, { color: colors.muted }]}>
            {outgoing.length
              ? `${outgoing.length} active snapshot${outgoing.length === 1 ? "" : "s"}. Revoke any in-app share below.`
              : "No active in-app media shares."}
          </Text>
          {outgoing.map((share) => (
            <View key={share.id} style={styles.outgoingRow}>
              <Text
                numberOfLines={1}
                style={[styles.outgoingTitle, { color: colors.foreground }]}
              >
                {share.title}
              </Text>
              <KairosButton
                compact
                label="Revoke"
                tone="danger"
                onPress={() => revoke(share)}
              />
            </View>
          ))}
          <Text style={[styles.helper, { color: colors.muted }]}>
            Revoking blocks future in-app access; a photo link already issued
            may work until its five-minute expiry. External links, screenshots,
            downloads, and copies already made cannot be recalled.
          </Text>
          <KairosButton
            label="Privacy and consent controls"
            icon="lock"
            tone="ghost"
            onPress={() => router.push("/aevum/privacy" as Href)}
          />
        </KairosCard>
        {!canShare ? (
          <Text
            style={[
              styles.helper,
              { color: colors.muted, textAlign: "center" },
            ]}
          >
            {user?.isPreview
              ? "Preview does not create a real partner connection or in-app share."
              : "Connect and accept a partner invitation before sharing a memory in the app."}
          </Text>
        ) : null}
        {consentsQuery.isError ? (
          <Text style={[styles.helper, { color: colors.warning }]}>
            Partner sharing permission could not be checked. A share will not
            proceed unless current consent is recorded.
          </Text>
        ) : null}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 120, gap: 13 },
  privacyCard: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  sectionCard: { gap: 11, padding: 16 },
  sectionTitle: { fontSize: 18, lineHeight: 24, fontWeight: "800" },
  body: { fontSize: 13, lineHeight: 19 },
  helper: { fontSize: 12, lineHeight: 18 },
  field: { gap: 6 },
  label: { fontSize: 13, lineHeight: 18, fontWeight: "700" },
  input: {
    minHeight: 46,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 13,
    paddingVertical: 10,
    fontSize: 15,
  },
  multiline: { minHeight: 70, textAlignVertical: "top" },
  selectedPhotoRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 10,
  },
  selectedPhoto: { width: 64, height: 64, borderRadius: 12 },
  error: { fontSize: 13, lineHeight: 18 },
  reviewCard: { gap: 12, borderColor: "#D29B55" },
  ackRow: {
    flexDirection: "row",
    gap: 9,
    alignItems: "flex-start",
    minHeight: 44,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  itemCard: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    padding: 12,
  },
  memoryImage: {
    width: 76,
    height: 76,
    borderRadius: 12,
    backgroundColor: "#223",
  },
  itemIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  itemCopy: { flex: 1, gap: 4 },
  itemTitle: { fontSize: 15, lineHeight: 20, fontWeight: "800" },
  linkRow: {
    flexDirection: "row",
    gap: 5,
    alignItems: "center",
    alignSelf: "flex-start",
    paddingVertical: 3,
  },
  link: { fontSize: 12, fontWeight: "700" },
  itemActions: { alignItems: "center", gap: 5 },
  deleteButton: {
    width: 40,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
  },
  outgoingRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  outgoingTitle: { flex: 1, fontSize: 13, lineHeight: 18, fontWeight: "700" },
});
