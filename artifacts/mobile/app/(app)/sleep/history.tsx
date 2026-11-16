import { FlatList, StyleSheet, Text, View } from "react-native";

import { KairosCard } from "@/components/kairos/card";
import { ScreenHeader } from "@/components/kairos/screen-header";
import { StatePanel } from "@/components/kairos/state-panel";
import { ScreenContainer } from "@/components/screen-container";
import { useSleepLogs } from "@/hooks/use-sleep";
import { useColors } from "@/hooks/use-colors";
import { average, formatDuration, formatShortDate } from "@/lib/date";

export default function SleepHistoryScreen() {
  const colors = useColors();
  const sleep = useSleepLogs();
  const durationAverage = average((sleep.data ?? []).map((item) => item.duration_minutes));
  const qualityAverage = average((sleep.data ?? []).map((item) => item.quality));

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]}>
      <View style={styles.headerWrap}>
        <ScreenHeader showBack title="Sleep history" subtitle="Your recent rest" />
        <View style={styles.summaryRow}>
          <KairosCard style={styles.summaryCard}>
            <Text style={[styles.summaryLabel, { color: colors.muted }]}>Average duration</Text>
            <Text style={[styles.summaryValue, { color: colors.primary }]}>{durationAverage === null ? "—" : formatDuration(Math.round(durationAverage))}</Text>
          </KairosCard>
          <KairosCard style={styles.summaryCard}>
            <Text style={[styles.summaryLabel, { color: colors.muted }]}>Average quality</Text>
            <Text style={[styles.summaryValue, { color: colors.primary }]}>{qualityAverage === null ? "—" : qualityAverage.toFixed(1)}</Text>
          </KairosCard>
        </View>
      </View>
      <FlatList
        data={sleep.data ?? []}
        initialNumToRender={12}
        maxToRenderPerBatch={10}
        windowSize={7}
        keyExtractor={(item) => item.id}
        contentContainerStyle={(sleep.data?.length ?? 0) === 0 ? styles.emptyList : styles.list}
        ListEmptyComponent={<StatePanel loading={sleep.isLoading} icon={sleep.isError ? "error-outline" : "bedtime"} title={sleep.isLoading ? "Loading sleep logs" : sleep.isError ? "Sleep history unavailable" : "No sleep logs yet"} message={sleep.isError ? (sleep.error instanceof Error ? sleep.error.message : "Try again shortly.") : "Your sleep patterns will appear after your first log."} actionLabel={sleep.isError ? "Try again" : undefined} onAction={sleep.isError ? () => void sleep.refetch() : undefined} />}
        renderItem={({ item }) => {
          const width = `${Math.min(100, (item.duration_minutes / 720) * 100)}%` as `${number}%`;
          return (
            <KairosCard style={styles.row}>
              <View style={styles.rowTitleLine}>
                <Text style={[styles.date, { color: colors.foreground }]}>{formatShortDate(item.logged_at)}</Text>
                <Text style={[styles.quality, { color: colors.primary }]}>Quality {item.quality}/10</Text>
              </View>
              <View style={[styles.track, { backgroundColor: colors.border }]}>
                <View style={[styles.bar, { backgroundColor: colors.primary, width }]} />
              </View>
              <Text style={[styles.duration, { color: colors.muted }]}>{formatDuration(item.duration_minutes)}</Text>
            </KairosCard>
          );
        }}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  headerWrap: { gap: 14, paddingHorizontal: 20, paddingTop: 10 },
  summaryRow: { flexDirection: "row", gap: 12 },
  summaryCard: { flex: 1, minHeight: 90, justifyContent: "space-between" },
  summaryLabel: { fontSize: 12, lineHeight: 17, fontWeight: "600" },
  summaryValue: { fontSize: 21, lineHeight: 27, fontWeight: "900" },
  list: { gap: 10, padding: 20, paddingBottom: 36 },
  emptyList: { flexGrow: 1 },
  row: { gap: 10 },
  rowTitleLine: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  date: { fontSize: 15, lineHeight: 20, fontWeight: "700" },
  quality: { fontSize: 12, lineHeight: 17, fontWeight: "700" },
  track: { height: 8, borderRadius: 4, overflow: "hidden" },
  bar: { height: 8, borderRadius: 4 },
  duration: { fontSize: 13, lineHeight: 18 },
});
