import { Fonts } from "@/constants/theme";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useRouter, type Href } from "expo-router";
import { useMemo } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";

import { KairosBadge } from "@/components/kairos/badge";
import { KairosButton } from "@/components/kairos/button";
import { KairosCard } from "@/components/kairos/card";
import { PressableScale } from "@/components/kairos/pressable-scale";
import { ScreenHeader } from "@/components/kairos/screen-header";
import { StatePanel } from "@/components/kairos/state-panel";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { usePartnerConnection } from "@/hooks/use-partner";
import {
  useRelationshipEntries,
  useRelationshipShares,
} from "@/hooks/use-relationship-hub";
import {
  RELATIONSHIP_MODULES,
  type RelationshipCategory,
} from "@/lib/relationship-hub";
import { useKairosAuth } from "@/providers/supabase-auth-provider";

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

export default function AevumLifeScreen() {
  const colors = useColors();
  const router = useRouter();
  const { user } = useKairosAuth();
  const entriesQuery = useRelationshipEntries();
  const sharesQuery = useRelationshipShares();
  const partnerQuery = usePartnerConnection();
  const entries = useMemo(() => entriesQuery.data ?? [], [entriesQuery.data]);
  const connection = partnerQuery.data;
  const accepted = !user?.isPreview && connection?.status === "accepted";
  const partnerId =
    connection &&
    user &&
    (connection.requester_id === user.id || connection.recipient_id === user.id)
      ? connection.requester_id === user.id
        ? connection.recipient_id
        : connection.requester_id
      : null;
  const incoming = useMemo(
    () =>
      (sharesQuery.data ?? []).filter(
        (share) =>
          share.recipient_id === user?.id && share.owner_id !== user?.id,
      ),
    [sharesQuery.data, user?.id],
  );
  const outgoing = useMemo(
    () =>
      (sharesQuery.data ?? []).filter((share) => share.owner_id === user?.id),
    [sharesQuery.data, user?.id],
  );
  const counts = useMemo(
    () =>
      entries.reduce<Partial<Record<RelationshipCategory, number>>>(
        (result, entry) => {
          result[entry.category] = (result[entry.category] ?? 0) + 1;
          return result;
        },
        {},
      ),
    [entries],
  );
  const openCategory = (category: RelationshipCategory) =>
    router.push(`/aevum/entry?category=${category}` as Href);

  return (
    <ScreenContainer>
      <FlatList
        data={RELATIONSHIP_MODULES}
        numColumns={2}
        keyExtractor={(item) => item.key}
        columnWrapperStyle={styles.gridRow}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View style={styles.header}>
            <ScreenHeader
              showBack
              title="Partner Hub"
              subtitle="Connection · Your everyday relationship space"
            />
            <KairosCard style={styles.hero}>
              <View style={styles.headingRow}>
                <View
                  style={[
                    styles.heart,
                    { backgroundColor: `${colors.primary}20` },
                  ]}
                >
                  <MaterialIcons
                    name="favorite"
                    size={26}
                    color={colors.primary}
                  />
                </View>
                <View style={styles.flex}>
                  <Text style={[styles.title, { color: colors.foreground }]}>
                    Small moments. Real connection.
                  </Text>
                  <Text style={[styles.body, { color: colors.muted }]}>
                    15 guided ways to reflect, remember and make plans. Start
                    now — no assessment required.
                  </Text>
                </View>
              </View>
              <KairosBadge
                label={
                  user?.isPreview
                    ? "Private · session-only draft"
                    : "Private by default"
                }
                tone="neutral"
              />
              <Text style={[styles.body, { color: colors.muted }]}>
                Saving never sends an entry. You choose each message and
                recipient. These are reflection prompts, not AI analysis or
                predictions.
              </Text>
              <KairosButton
                label="Share a song or photo memory"
                icon="photo-library"
                tone="secondary"
                onPress={() => router.push("/aevum/media" as Href)}
              />
              <Text style={[styles.count, { color: colors.foreground }]}>
                {entriesQuery.isLoading
                  ? "Loading your entries…"
                  : entriesQuery.isError
                    ? "Entry count unavailable"
                    : `${entries.length} ${entries.length === 1 ? "entry" : "entries"} of your own`}
              </Text>
              {user?.isPreview ? (
                <Text style={[styles.note, { color: colors.warning }]}>
                  Preview entries are session-only drafts, not server saves.
                  There is no actual partner connection in preview. External
                  sharing is available by your choice.
                </Text>
              ) : null}
            </KairosCard>
            <KairosCard style={styles.partner}>
              <View style={styles.statusRow}>
                <Text style={[styles.section, { color: colors.foreground }]}>
                  Your partner
                </Text>
                <KairosBadge
                  label={
                    user?.isPreview
                      ? "Preview · not connected"
                      : accepted
                        ? "Connected"
                        : connection?.status === "pending"
                          ? "Invitation pending"
                          : "Not connected"
                  }
                  tone={accepted ? "success" : "neutral"}
                />
              </View>
              {accepted && partnerId ? (
                <>
                  <Text style={[styles.note, { color: colors.muted }]}>
                    Connected account ID
                  </Text>
                  <Text
                    selectable
                    style={[styles.accountId, { color: colors.foreground }]}
                  >
                    {partnerId}
                  </Text>
                  <Text style={[styles.note, { color: colors.muted }]}>
                    A connection does not grant access to private entries or
                    assessments.
                  </Text>
                </>
              ) : (
                <Text style={[styles.body, { color: colors.muted }]}>
                  {connection?.status === "pending" && !user?.isPreview
                    ? "Open connection controls to review your invitation. Nothing is shared while it is pending."
                    : "Connect using the account ID your partner gives you. Every in-app share still needs your confirmation."}
                </Text>
              )}
              {partnerQuery.isLoading && !user?.isPreview ? (
                <StatePanel
                  loading
                  title="Checking connection"
                  message="Loading your latest partner status…"
                />
              ) : null}
              {partnerQuery.isError ? (
                <StatePanel
                  icon="error-outline"
                  title="Connection unavailable"
                  message={errorMessage(
                    partnerQuery.error,
                    "Could not load your partner status.",
                  )}
                  actionLabel="Retry connection"
                  onAction={() => void partnerQuery.refetch()}
                />
              ) : null}
              <KairosButton
                label={
                  accepted
                    ? "Manage partner connection"
                    : "Connect with partner"
                }
                icon="handshake"
                tone="secondary"
                onPress={() => router.push("/aevum/partner" as Href)}
              />
              {user && !user.isPreview ? (
                <>
                  <Text style={[styles.note, { color: colors.muted }]}>
                    Your account ID · select and copy to exchange invitations
                  </Text>
                  <Text
                    selectable
                    style={[styles.accountId, { color: colors.foreground }]}
                  >
                    {user.id}
                  </Text>
                </>
              ) : null}
            </KairosCard>
            {entriesQuery.isLoading ? (
              <StatePanel
                loading
                title="Loading your journal"
                message="Fetching your private entries…"
              />
            ) : null}
            {entriesQuery.isError ? (
              <StatePanel
                icon="error-outline"
                title="Journal unavailable"
                message={errorMessage(
                  entriesQuery.error,
                  "Your entries could not be loaded.",
                )}
                actionLabel="Retry journal"
                onAction={() => void entriesQuery.refetch()}
              />
            ) : null}
            <Text
              accessibilityRole="header"
              style={[styles.section, { color: colors.foreground }]}
            >
              Choose a relationship option
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel={`${item.title}. ${item.subtitle}. ${counts[item.key] ?? 0} of your own entries.`}
            onPress={() => openCategory(item.key)}
            style={styles.tilePressable}
          >
            <KairosCard style={styles.tile}>
              <View
                style={[
                  styles.moduleIcon,
                  { backgroundColor: `${colors.primary}18` },
                ]}
              >
                <MaterialIcons
                  name={item.icon}
                  size={27}
                  color={colors.primary}
                />
              </View>
              <Text style={[styles.tileTitle, { color: colors.foreground }]}>
                {item.title}
              </Text>
              <Text style={[styles.tileBody, { color: colors.muted }]}>
                {item.subtitle}
              </Text>
              <Text style={[styles.tileCount, { color: colors.muted }]}>
                {entriesQuery.isError
                  ? "Open journal"
                  : `${counts[item.key] ?? 0} entries`}{" "}
                <MaterialIcons
                  name="arrow-forward"
                  size={12}
                  color={colors.primary}
                />
              </Text>
            </KairosCard>
          </PressableScale>
        )}
        ListFooterComponent={
          <View style={styles.footer}>
            <Text
              accessibilityRole="header"
              style={[styles.section, { color: colors.foreground }]}
            >
              From partner
            </Text>
            <Text style={[styles.body, { color: colors.muted }]}>
              Only messages your partner explicitly shared appear here. These
              are saved snapshots, not a live view of their journal.
            </Text>
            {sharesQuery.isLoading ? (
              <StatePanel
                loading
                title="Loading shared messages"
                message="Checking messages shared with you…"
              />
            ) : null}
            {sharesQuery.isError ? (
              <StatePanel
                icon="error-outline"
                title="Shared messages unavailable"
                message={errorMessage(
                  sharesQuery.error,
                  "Could not load shared snapshots.",
                )}
                actionLabel="Retry shared messages"
                onAction={() => void sharesQuery.refetch()}
              />
            ) : null}
            {!sharesQuery.isLoading &&
            !sharesQuery.isError &&
            incoming.length === 0 ? (
              <StatePanel
                icon="mail-outline"
                title="No shared messages yet"
                message={
                  user?.isPreview
                    ? "Preview has no real incoming partner messages."
                    : "Your partner's private entries stay private until they choose to share."
                }
              />
            ) : null}
            <FlatList
              data={incoming}
              scrollEnabled={false}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <KairosCard style={styles.snapshot}>
                  <KairosBadge label="From partner · snapshot" tone="success" />
                  <Text
                    style={[styles.tileTitle, { color: colors.foreground }]}
                  >
                    {item.title}
                  </Text>
                  <Text
                    numberOfLines={3}
                    style={[styles.body, { color: colors.muted }]}
                  >
                    {item.body}
                  </Text>
                  <Text
                    selectable
                    style={[styles.accountId, { color: colors.muted }]}
                  >
                    From: {item.owner_id}
                  </Text>
                  <KairosButton
                    compact
                    label="Read shared message"
                    tone="ghost"
                    onPress={() => openCategory(item.category)}
                  />
                </KairosCard>
              )}
            />
            <KairosCard style={styles.partner}>
              <Text style={[styles.section, { color: colors.foreground }]}>
                Shared by you
              </Text>
              <Text style={[styles.body, { color: colors.muted }]}>
                {sharesQuery.isError
                  ? "Shared snapshot count unavailable."
                  : sharesQuery.isLoading
                    ? "Loading active shared snapshots…"
                    : `${outgoing.length} active in-app ${outgoing.length === 1 ? "snapshot" : "snapshots"}. Open an option to review or revoke its shared entries.`}
              </Text>
              <Text style={[styles.note, { color: colors.muted }]}>
                Editing a private entry does not update a shared snapshot.
                Revoking removes in-app access; copies outside Kairos cannot be
                recalled.
              </Text>
            </KairosCard>
            <Text style={[styles.note, { color: colors.muted }]}>
              Unsent thoughts stay unsent. Future letter dates never schedule
              delivery. You decide when, whether and where to share.
            </Text>
            <KairosButton
              label="Explore private reflections"
              tone="ghost"
              onPress={() => router.push("/connection" as Href)}
            />
            <KairosButton
              label="Privacy and consent controls"
              icon="lock"
              tone="ghost"
              onPress={() => router.push("/aevum/privacy" as Href)}
            />
          </View>
        }
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 116 },
  header: { gap: 16, marginBottom: 14 },
  hero: { padding: 18, gap: 13 },
  headingRow: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  heart: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  flex: { flex: 1, gap: 5 },
  title: {
    fontFamily: Fonts.serif,
    fontSize: 22,
    lineHeight: 29,
    fontWeight: "400",
  },
  body: { fontSize: 14, lineHeight: 21 },
  note: { fontSize: 12, lineHeight: 18 },
  count: { fontSize: 15, fontWeight: "800" },
  section: {
    fontSize: 18,
    lineHeight: 24,
    fontFamily: Fonts.serif,
    fontWeight: "400",
  },
  partner: { gap: 12 },
  statusRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  accountId: { fontSize: 12, lineHeight: 19 },
  gridRow: { gap: 12, marginBottom: 12, alignItems: "stretch" },
  tilePressable: { flex: 1, maxWidth: "50%" },
  tile: { flex: 1, minHeight: 190, gap: 9, padding: 14 },
  moduleIcon: {
    width: 43,
    height: 43,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
  },
  tileTitle: { fontSize: 16, lineHeight: 22, fontWeight: "800" },
  tileBody: { fontSize: 12, lineHeight: 18, flex: 1 },
  tileCount: { fontSize: 11, lineHeight: 17, fontWeight: "700" },
  footer: { gap: 12, marginTop: 8 },
  snapshot: { gap: 10, marginBottom: 10 },
});
