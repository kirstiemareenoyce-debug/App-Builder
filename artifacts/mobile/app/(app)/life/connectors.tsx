import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useState } from "react";
import { FlatList, Modal, StyleSheet, Text, View } from "react-native";

import { KairosBadge } from "@/components/kairos/badge";
import { KairosButton } from "@/components/kairos/button";
import { KairosCard } from "@/components/kairos/card";
import { PressableScale } from "@/components/kairos/pressable-scale";
import { ScreenHeader } from "@/components/kairos/screen-header";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { KAIROS_CONNECTORS, type KairosConnector } from "@/lib/connectors";

export default function ConnectorsScreen() {
  const colors = useColors();
  const [selected, setSelected] = useState<KairosConnector | null>(null);
  const [directoryAction, setDirectoryAction] = useState<"add" | "manage" | null>(null);
  const connected = KAIROS_CONNECTORS.filter((item) => item.status === "connected").length;

  return (
    <ScreenContainer>
      <FlatList
        data={KAIROS_CONNECTORS}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View style={styles.headerArea}>
            <ScreenHeader
              showBack
              title="Connectors"
              subtitle="Bring the parts of your life you choose into one private space."
            />
            <KairosCard style={styles.disclosureCard}>
              <View style={[styles.disclosureIcon, { backgroundColor: `${colors.primary}18` }]}>
                <MaterialIcons name="lock-outline" size={21} color={colors.primary} />
              </View>
              <View style={styles.disclosureCopy}>
                <Text style={[styles.disclosureTitle, { color: colors.foreground }]}>Private by default</Text>
                <Text style={[styles.disclosureBody, { color: colors.muted }]}>Kairos only receives what you deliberately connect. This directory is ready for provider setup.</Text>
              </View>
            </KairosCard>
            <View style={styles.actionGroup}>
              <PressableScale
                accessibilityRole="button"
                accessibilityLabel="Add connectors"
                onPress={() => setDirectoryAction("add")}
                style={[styles.actionRow, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
              >
                <View style={[styles.actionIcon, { backgroundColor: `${colors.primary}18` }]}>
                  <MaterialIcons name="add" size={24} color={colors.primary} />
                </View>
                <View style={styles.actionCopy}>
                  <Text style={[styles.actionTitle, { color: colors.foreground }]}>Add connectors</Text>
                  <Text style={[styles.actionBody, { color: colors.muted }]}>Choose a service to set up</Text>
                </View>
                <MaterialIcons name="chevron-right" size={25} color={colors.muted} />
              </PressableScale>
              <PressableScale
                accessibilityRole="button"
                accessibilityLabel="Manage connectors"
                onPress={() => setDirectoryAction("manage")}
                style={[styles.actionRow, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
              >
                <View style={[styles.actionIcon, { backgroundColor: `${colors.primary}18` }]}>
                  <MaterialIcons name="tune" size={23} color={colors.primary} />
                </View>
                <View style={styles.actionCopy}>
                  <Text style={[styles.actionTitle, { color: colors.foreground }]}>Manage connectors</Text>
                  <Text style={[styles.actionBody, { color: colors.muted }]}>{connected} live connections · provider setup required</Text>
                </View>
                <MaterialIcons name="chevron-right" size={25} color={colors.muted} />
              </PressableScale>
            </View>
            <View style={styles.sectionHeading}>
              <Text style={[styles.sectionLabel, { color: colors.primary }]}>AVAILABLE SERVICES</Text>
              <Text style={[styles.sectionHint, { color: colors.muted }]}>Select a service to review its setup requirements.</Text>
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel={`${item.title}. ${item.status === "connected" ? "Connected" : "Set up"}`}
            onPress={() => setSelected(item)}
            style={[styles.providerRow, { borderBottomColor: colors.border }]}
          >
            <View style={[styles.providerIcon, { backgroundColor: `${colors.primary}18` }]}>
              <MaterialIcons name={item.icon} size={24} color={colors.primary} />
            </View>
            <View style={styles.providerCopy}>
              <View style={styles.providerTitleRow}>
                <Text numberOfLines={1} style={[styles.providerTitle, { color: colors.foreground }]}>{item.title}</Text>
                {item.beta ? <KairosBadge label="Beta" tone="neutral" /> : null}
              </View>
              <Text numberOfLines={2} style={[styles.providerDescription, { color: colors.muted }]}>{item.description}</Text>
            </View>
            <Text style={[styles.providerStatus, { color: item.status === "connected" ? colors.success : colors.muted }]}>
              {item.status === "connected" ? "Connected" : "Set up"}
            </Text>
          </PressableScale>
        )}
        ListFooterComponent={
          <Text style={[styles.footerNote, { color: colors.muted }]}>Provider access is optional. You can use Kairos without connecting any external account.</Text>
        }
      />
      <Modal animationType="slide" transparent visible={selected !== null || directoryAction !== null} onRequestClose={() => { setSelected(null); setDirectoryAction(null); }}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
            <View style={styles.modalHandle} />
            {selected ? (
              <>
                <View style={styles.modalTitleRow}>
                  <View style={[styles.modalIcon, { backgroundColor: `${colors.primary}18` }]}>
                    <MaterialIcons name={selected.icon} size={25} color={colors.primary} />
                  </View>
                  <View style={styles.modalCopy}>
                    <Text style={[styles.modalTitle, { color: colors.foreground }]}>{selected.title}</Text>
                    <Text style={[styles.modalSubtitle, { color: colors.muted }]}>{selected.status === "connected" ? "Live connection" : "Not connected · setup requirements"}</Text>
                  </View>
                </View>
                <Text style={[styles.modalBody, { color: colors.muted }]}>{selected.setupNote}</Text>
                <KairosBadge label="Credentials required before live connection" tone="neutral" />
                <KairosButton label="Close" tone="secondary" onPress={() => { setSelected(null); setDirectoryAction(null); }} />
              </>
            ) : (
              <>
                <Text style={[styles.modalTitle, { color: colors.foreground }]}>{directoryAction === "manage" ? "Manage connectors" : "Add a connector"}</Text>
                <Text style={[styles.modalBody, { color: colors.muted }]}>{directoryAction === "manage" ? "No live accounts are connected. Authorization, revocation and token management become available only after the provider backend is configured and verified." : "Close this panel and select a service to review its permissions and setup requirements. No account is connected by opening its setup details."}</Text>
                <KairosButton label="Close" tone="secondary" onPress={() => setDirectoryAction(null)} />
              </>
            )}
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 116 },
  headerArea: { gap: 14, marginBottom: 8 },
  disclosureCard: { flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 15 },
  disclosureIcon: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  disclosureCopy: { flex: 1, gap: 3 },
  disclosureTitle: { fontSize: 15, lineHeight: 20, fontWeight: "800" },
  disclosureBody: { fontSize: 13, lineHeight: 19 },
  actionGroup: { borderRadius: 18, overflow: "hidden", gap: 1 },
  actionRow: { minHeight: 76, borderWidth: 1, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 12 },
  actionIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  actionCopy: { flex: 1, gap: 2 },
  actionTitle: { fontSize: 16, lineHeight: 21, fontWeight: "800" },
  actionBody: { fontSize: 12, lineHeight: 17 },
  sectionHeading: { gap: 3, paddingTop: 8, paddingBottom: 2 },
  sectionLabel: { fontSize: 10, lineHeight: 15, letterSpacing: 1.7, fontWeight: "900" },
  sectionHint: { fontSize: 12, lineHeight: 17 },
  providerRow: { minHeight: 77, paddingVertical: 12, flexDirection: "row", alignItems: "center", gap: 11, borderBottomWidth: 1 },
  providerIcon: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  providerCopy: { flex: 1, gap: 3 },
  providerTitleRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  providerTitle: { flexShrink: 1, fontSize: 15, lineHeight: 20, fontWeight: "700" },
  providerDescription: { fontSize: 11, lineHeight: 15 },
  providerStatus: { minWidth: 62, textAlign: "right", fontSize: 13, lineHeight: 18, fontWeight: "700" },
  footerNote: { textAlign: "center", fontSize: 12, lineHeight: 17, paddingTop: 16 },
  modalBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0, 0, 0, 0.62)" },
  modalCard: { borderTopLeftRadius: 26, borderTopRightRadius: 26, borderWidth: 1, padding: 20, gap: 15 },
  modalHandle: { alignSelf: "center", width: 42, height: 4, borderRadius: 4, backgroundColor: "#64756B" },
  modalTitleRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  modalIcon: { width: 48, height: 48, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  modalCopy: { flex: 1, gap: 2 },
  modalTitle: { fontSize: 23, lineHeight: 29, fontWeight: "700" },
  modalSubtitle: { fontSize: 13, lineHeight: 18 },
  modalBody: { fontSize: 14, lineHeight: 21 },
});
