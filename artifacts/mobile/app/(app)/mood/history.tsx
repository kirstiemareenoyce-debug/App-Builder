import { FlatList, StyleSheet, Text, View } from "react-native";

import { KairosCard } from "@/components/kairos/card";
import { ScreenHeader } from "@/components/kairos/screen-header";
import { StatePanel } from "@/components/kairos/state-panel";
import { ScreenContainer } from "@/components/screen-container";
import { useMoods } from "@/hooks/use-moods";
import { useColors } from "@/hooks/use-colors";
import { average, formatShortDate } from "@/lib/date";

export default function MoodHistoryScreen() {
  const colors = useColors();
  const moods = useMoods();
  const scoreAverage = average((moods.data ?? []).map((item) => item.score));

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]}>
      <View style={styles.headerWrap}>
        <ScreenHeader showBack title="Mood history" subtitle="Your recent check-ins" />
        <KairosCard style={styles.averageCard}>
          <Text style={[styles.averageLabel, { color: colors.muted }]}>Average mood</Text>
          <Text style={[styles.averageValue, { color: colors.primary }]}>{scoreAverage === null ? "—" : scoreAverage.toFixed(1)}</Text>
          <Text style={[styles.averageUnit, { color: colors.muted }]}>out of 10</Text>
        </KairosCard>
      </View>
      <FlatList
        data={moods.data ?? []}
        initialNumToRender={12}
        maxToRenderPerBatch={10}
        windowSize={7}
        keyExtractor={(item) => item.id}
        contentContainerStyle={(moods.data?.length ?? 0) === 0 ? styles.emptyList : styles.list}
        ListEmptyComponent={<StatePanel loading={moods.isLoading} icon={moods.isError ? "error-outline" : "sentiment-neutral"} title={moods.isLoading ? "Loading check-ins" : moods.isError ? "Mood history unavailable" : "No mood entries yet"} message={moods.isError ? (moods.error instanceof Error ? moods.error.message : "Try again shortly.") : "Your check-ins will appear here after you log your first mood."} actionLabel={moods.isError ? "Try again" : undefined} onAction={moods.isError ? () => void moods.refetch() : undefined} />}
        renderItem={({ item }) => {
          const scoreColor = item.score >= 8 ? colors.success : item.score >= 5 ? colors.warning : colors.error;
          return (
            <KairosCard style={styles.row}>
              <View style={[styles.score, { backgroundColor: `${scoreColor}22`, borderColor: scoreColor }]}>
                <Text style={[styles.scoreText, { color: scoreColor }]}>{item.score}</Text>
              </View>
              <View style={styles.rowCopy}>
                <View style={styles.rowTitleLine}>
                  <Text style={[styles.date, { color: colors.foreground }]}>{formatShortDate(item.logged_at)}</Text>
                  <Text style={[styles.energy, { color: colors.muted }]}>Energy {item.energy_level ?? "—"}/10</Text>
                </View>
                {item.notes ? <Text numberOfLines={2} style={[styles.notes, { color: colors.muted }]}>{item.notes}</Text> : null}
              </View>
            </KairosCard>
          );
        }}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  headerWrap: { gap: 14, paddingHorizontal: 20, paddingTop: 10 },
  averageCard: { flexDirection: "row", alignItems: "baseline", gap: 8 },
  averageLabel: { flex: 1, fontSize: 14, lineHeight: 19, fontWeight: "600" },
  averageValue: { fontSize: 30, lineHeight: 36, fontWeight: "900" },
  averageUnit: { fontSize: 12, lineHeight: 17 },
  list: { gap: 10, padding: 20, paddingBottom: 36 },
  emptyList: { flexGrow: 1 },
  row: { flexDirection: "row", alignItems: "center", gap: 13 },
  score: { width: 52, height: 52, borderRadius: 26, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  scoreText: { fontSize: 20, lineHeight: 25, fontWeight: "900" },
  rowCopy: { flex: 1, gap: 5 },
  rowTitleLine: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  date: { fontSize: 15, lineHeight: 20, fontWeight: "700" },
  energy: { fontSize: 12, lineHeight: 17 },
  notes: { fontSize: 13, lineHeight: 18 },
});
