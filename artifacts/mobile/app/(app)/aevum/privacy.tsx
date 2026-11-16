import { Fonts } from "@/constants/theme";
import { useState } from "react";
import { FlatList, StyleSheet, Switch, Text, View } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { ScreenHeader } from "@/components/kairos/screen-header";
import { KairosCard } from "@/components/kairos/card";
import { KairosButton } from "@/components/kairos/button";
import { StatePanel } from "@/components/kairos/state-panel";
import {
  useAevumConsents,
  useSaveAevumConsent,
  useDeleteAevumReflections,
} from "@/hooks/use-aevum";
import { useColors } from "@/hooks/use-colors";
import { useKairosAuth } from "@/providers/supabase-auth-provider";
import { useKairosUI } from "@/providers/kairos-ui-provider";
import { getAevumErrorMessage } from "@/lib/aevum-errors";
import type { AevumConsentScope } from "@/types/app";
const SCOPES: { key: AevumConsentScope; label: string; note: string }[] = [
  {
    key: "assessment",
    label: "Private reflections",
    note: "Allow private reflection saves. Turn off to stop new saves; existing answers remain private until deleted.",
  },
  {
    key: "individual_profile",
    label: "Individual profile",
    note: "Permission for your individual profile. This does not authorise a partner to read raw answers.",
  },
  {
    key: "partner_sharing",
    label: "Partner sharing",
    note: "Turn off to remove all your in-app shared snapshots, including selected relationship entries, songs, and photos, and stop partner access. Turning it back on does not restore old snapshots; you must share each item again.",
  },
  {
    key: "couple_map",
    label: "Couple map",
    note: "Optional permission for couple-map use. This is not a clinically validated map release.",
  },
  {
    key: "coaching",
    label: "AI coaching",
    note: "Turn off to block new AI coaching requests. Previously exported or copied advice cannot be recalled.",
  },
];
export default function AevumPrivacyScreen() {
  const colors = useColors();
  const { user } = useKairosAuth();
  const { showToast } = useKairosUI();
  const consent = useAevumConsents();
  const save = useSaveAevumConsent();
  const remove = useDeleteAevumReflections();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const toggle = async (scope: AevumConsentScope, granted: boolean) => {
    try {
      await save.mutateAsync({ scope, granted, version: "aevum-2026-09-23" });
      showToast(
        granted ? "Permission enabled." : "Permission revoked.",
        "success",
      );
    } catch (e) {
      showToast(getAevumErrorMessage(e), "error");
    }
  };
  const deleteReflections = async () => {
    try {
      await remove.mutateAsync();
      setConfirmDelete(false);
      showToast(
        "Private reflections and their progress deleted. Partner Hub entries are unchanged.",
        "success",
      );
    } catch (e) {
      showToast(getAevumErrorMessage(e), "error");
    }
  };
  return (
    <ScreenContainer>
      <FlatList
        data={SCOPES}
        keyExtractor={(item) => item.key}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <>
            <ScreenHeader
              showBack
              title="Aevum privacy"
              subtitle="You decide what leaves your private space"
            />
            <Text style={[styles.body, { color: colors.muted }]}>
              Private answers and drafts never become partner-visible
              automatically. In-app sharing creates only the selected entry,
              song, or photo snapshot. External files, links, clipboard
              messages, and screenshots are outside Kairos access controls.
            </Text>
            {user?.isPreview ? (
              <Text style={[styles.body, { color: colors.warning }]}>
                Preview permissions and reflections are session-only. Refresh or
                exit clears them; no cloud records are changed.
              </Text>
            ) : null}
            {consent.isError ? (
              <StatePanel
                title="Permissions unavailable"
                message={getAevumErrorMessage(consent.error)}
                actionLabel="Retry"
                onAction={() => void consent.refetch()}
              />
            ) : null}
          </>
        }
        renderItem={({ item }) => (
          <KairosCard style={styles.card}>
            <View style={styles.row}>
              <Text style={[styles.heading, { color: colors.foreground }]}>
                {item.label}
              </Text>
              <Switch
                accessibilityLabel={`${item.label} consent`}
                value={Boolean(consent.data?.[item.key])}
                disabled={
                  consent.isLoading || consent.isError || save.isPending
                }
                onValueChange={(value) => void toggle(item.key, value)}
              />
            </View>
            <Text style={[styles.body, { color: colors.muted }]}>
              {item.note}
            </Text>
          </KairosCard>
        )}
        ListFooterComponent={
          <KairosCard style={styles.card}>
            <Text style={[styles.heading, { color: colors.foreground }]}>
              Delete private reflections
            </Text>
            <Text style={[styles.body, { color: colors.muted }]}>
              Removes all saved reflection answers and profile progress. Does
              not delete Partner Hub entries or external copies. This cannot be
              undone.
            </Text>
            {confirmDelete ? (
              <>
                <KairosButton
                  label="Confirm permanent deletion"
                  tone="danger"
                  onPress={() => void deleteReflections()}
                  loading={remove.isPending}
                />
                <KairosButton
                  label="Keep my reflections"
                  tone="secondary"
                  onPress={() => setConfirmDelete(false)}
                  disabled={remove.isPending}
                />
              </>
            ) : (
              <KairosButton
                label="Delete private reflection data"
                tone="secondary"
                onPress={() => setConfirmDelete(true)}
              />
            )}
          </KairosCard>
        }
      />
    </ScreenContainer>
  );
}
const styles = StyleSheet.create({
  content: { padding: 16, gap: 16, paddingBottom: 32 },
  card: { gap: 12, marginTop: 16 },
  body: { fontSize: 14, lineHeight: 21 },
  heading: {
    fontSize: 16,
    lineHeight: 23,
    fontFamily: Fonts.serif,
    fontWeight: "400",
    flex: 1,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 14 },
});
