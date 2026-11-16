import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";

import { KairosCard } from "@/components/kairos/card";
import { ScreenHeader } from "@/components/kairos/screen-header";
import { StatePanel } from "@/components/kairos/state-panel";
import { ScreenContainer } from "@/components/screen-container";
import { useEvergreenMetrics } from "@/hooks/use-evergreen-ai";
import { useColors } from "@/hooks/use-colors";
import { useKairosAuth } from "@/providers/supabase-auth-provider";

type MetricCardProps = {
  title: string;
  value: number;
  delta: number;
  lowerIsBetter?: boolean;
};

function MetricCard({ title, value, delta, lowerIsBetter = false }: MetricCardProps) {
  const colors = useColors();
  const improved = lowerIsBetter ? delta <= 0 : delta >= 0;
  const colour = delta === 0 ? colors.muted : improved ? colors.success : colors.error;
  const arrow = delta === 0 ? "remove" : delta > 0 ? "arrow-upward" : "arrow-downward";
  return (
    <KairosCard style={styles.metricCard}>
      <Text style={[styles.metricTitle, { color: colors.muted }]}>{title}</Text>
      <Text style={[styles.metricValue, { color: colors.foreground }]}>{Math.round(value)}%</Text>
      <View accessibilityLabel={`${Math.abs(delta).toFixed(1)} point weekly change`} style={styles.deltaRow}>
        <MaterialIcons color={colour} name={arrow} size={16} />
        <Text style={[styles.deltaText, { color: colour }]}>{Math.abs(delta).toFixed(1)} pts</Text>
      </View>
    </KairosCard>
  );
}

export default function MetricsDashboardScreen() {
  const colors = useColors();
  const { user } = useKairosAuth();
  const metrics = useEvergreenMetrics();

  if (user?.isPreview) {
    return (
      <ScreenContainer className="p-5" edges={["top", "bottom", "left", "right"]}>
        <ScreenHeader showBack title="Learning progress" subtitle="Evergreen metrics" />
        <StatePanel icon="cloud-off" title="Live metrics need Supabase" message="Preview mode never fabricates learning scores. Connect the configured backend to view real weekly values." />
      </ScreenContainer>
    );
  }

  if (metrics.isLoading) {
    return (
      <ScreenContainer className="p-5" edges={["top", "bottom", "left", "right"]}>
        <ScreenHeader showBack title="Learning progress" subtitle="Evergreen metrics" />
        <StatePanel loading title="Loading metrics" message="Retrieving the latest weekly snapshot…" />
      </ScreenContainer>
    );
  }

  if (metrics.isError || !metrics.data) {
    return (
      <ScreenContainer className="p-5" edges={["top", "bottom", "left", "right"]}>
        <ScreenHeader showBack title="Learning progress" subtitle="Evergreen metrics" />
        <StatePanel icon="error-outline" title="Metrics unavailable" message={metrics.error instanceof Error ? metrics.error.message : "The dashboard could not be loaded."} actionLabel="Try again" onAction={() => void metrics.refetch()} />
      </ScreenContainer>
    );
  }

  const { current, trend, next_update: nextUpdate } = metrics.data;
  return (
    <ScreenContainer className="p-5" edges={["top", "bottom", "left", "right"]}>
      <ScreenHeader showBack title="Learning progress" subtitle="Evergreen metrics" />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={metrics.isRefetching} onRefresh={() => void metrics.refetch()} tintColor={colors.primary} />}
      >
        <View style={[styles.banner, { backgroundColor: colors.primary }]}>
          <MaterialIcons color={colors.foreground} name="schedule" size={24} />
          <View style={styles.bannerCopy}>
            <Text style={[styles.bannerTitle, { color: colors.foreground }]}>Next AI update</Text>
            <Text style={[styles.bannerText, { color: colors.foreground }]}>{new Date(nextUpdate).toLocaleString()}</Text>
          </View>
        </View>
        <View style={styles.grid}>
          <MetricCard title="Accuracy" value={current.accuracy} delta={trend.accuracy_delta} />
          <MetricCard title="Personalisation" value={current.personalisation} delta={trend.personalisation_delta} />
          <MetricCard title="Hallucination rate" value={current.hallucination_rate} delta={trend.hallucination_rate_delta} lowerIsBetter />
          <MetricCard title="Satisfaction" value={current.satisfaction} delta={trend.satisfaction_delta} />
        </View>
        <KairosCard style={styles.activityCard}>
          <Text style={[styles.activityTitle, { color: colors.foreground }]}>This week</Text>
          <View style={styles.activityRow}>
            <View style={styles.activityItem}>
              <MaterialIcons color={colors.primary} name="chat-bubble-outline" size={22} />
              <Text style={[styles.activityValue, { color: colors.foreground }]}>{current.interaction_count}</Text>
              <Text style={[styles.activityLabel, { color: colors.muted }]}>Chats</Text>
            </View>
            <View style={[styles.activityDivider, { backgroundColor: colors.border }]} />
            <View style={styles.activityItem}>
              <MaterialIcons color={colors.primary} name="rate-review" size={22} />
              <Text style={[styles.activityValue, { color: colors.foreground }]}>{current.feedback_count}</Text>
              <Text style={[styles.activityLabel, { color: colors.muted }]}>Feedback</Text>
            </View>
          </View>
        </KairosCard>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { gap: 14, paddingTop: 14, paddingBottom: 30 },
  banner: { minHeight: 78, borderRadius: 16, padding: 16, flexDirection: "row", alignItems: "center", gap: 12 },
  bannerCopy: { flex: 1 },
  bannerTitle: { fontSize: 15, lineHeight: 20, fontWeight: "800" },
  bannerText: { marginTop: 2, fontSize: 13, lineHeight: 18, opacity: 0.9 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  metricCard: { width: "48%", minHeight: 132, justifyContent: "space-between" },
  metricTitle: { fontSize: 13, lineHeight: 18, fontWeight: "600" },
  metricValue: { fontSize: 30, lineHeight: 36, fontWeight: "900" },
  deltaRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  deltaText: { fontSize: 12, lineHeight: 16, fontWeight: "700" },
  activityCard: { gap: 14 },
  activityTitle: { fontSize: 17, lineHeight: 22, fontWeight: "800" },
  activityRow: { flexDirection: "row", alignItems: "stretch" },
  activityItem: { flex: 1, alignItems: "center", gap: 4 },
  activityDivider: { width: 1 },
  activityValue: { fontSize: 24, lineHeight: 29, fontWeight: "900" },
  activityLabel: { fontSize: 12, lineHeight: 16 },
});
