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
import { useAevumProfile } from "@/hooks/use-aevum";
import { useMoods } from "@/hooks/use-moods";
import { useColors } from "@/hooks/use-colors";
import { AEVUM_STAGES } from "@/lib/aevum";
import { summarizeAevumBaseline } from "@/lib/aevum-baseline";
import { useKairosAuth } from "@/providers/supabase-auth-provider";

const STAGE_REFLECTIONS = {
  personality:
    "Reflect on your social energy, decisions and response to stress.",
  attachment:
    "Reflect on closeness, consistency and space in your relationships.",
  trauma_patterns:
    "Reflect on difficult emotional patterns at your own pace. You may pause or skip.",
  neurodivergence:
    "Reflect on attention, sensory needs and communication preferences. This is not screening or a diagnosis.",
  baseline:
    "Reflect on your mood and energy after 14 days of recorded check-ins. This is not a clinical measure.",
  communication:
    "Reflect on conflict, repair and what helps you feel understood.",
  history_goals:
    "Reflect on boundaries, recurring themes and what you want to build next.",
} as const;

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  )
    return error.message;
  return "Your private reflection progress could not be loaded.";
}

export default function AevumTabScreen() {
  const colors = useColors();
  const router = useRouter();
  const { user } = useKairosAuth();
  const profileQuery = useAevumProfile();
  const moodsQuery = useMoods();
  const profile = profileQuery.data;
  const baseline = useMemo(() => summarizeAevumBaseline(moodsQuery.data ?? []), [moodsQuery.data]);
  const progress = profile?.completion_progress ?? 0;
  const completed = useMemo(
    () =>
      new Set(
        Object.entries(profile?.stage_status ?? {})
          .filter(([, status]) => status === "completed")
          .map(([key]) => key),
      ),
    [profile?.stage_status],
  );

  return (
    <ScreenContainer header={<ScreenHeader title="My Relationship" subtitle="Understand yourselves. Support one another." />}>
        <FlatList
          data={AEVUM_STAGES}
          keyExtractor={(item) => item.key}
          contentContainerStyle={styles.content}
          ListHeaderComponent={
            <View style={styles.headerArea}>
              <KairosCard style={styles.hero}>
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>From self-understanding to shared support</Text>
                <Text style={[styles.body, { color: colors.muted }]}>Use Kairos privately to explore your reactions and needs. Review what you want a partner to know, then choose how Aevum can help you communicate and support each other.</Text>
                <KairosButton label="Open Aevum AI" icon="favorite-border" onPress={() => router.push("/assistants/aevum" as Href)} />
                <KairosButton label="How to support me" icon="volunteer-activism" tone="secondary" onPress={() => router.push("/assistants/support-profile" as Href)} />
                <KairosButton label="Connections · connect a partner" icon="handshake" tone="secondary" onPress={() => router.push("/aevum/partner" as Href)} />
                <Text style={[styles.boundary, { color: colors.muted }]}>Each person chooses what to share. Private answers and chat are not automatically visible to a partner.</Text>
              </KairosCard>
              <KairosCard style={styles.hero}>
                <View style={styles.heroTitleRow}>
                  <View
                    style={[
                      styles.iconCircle,
                      { backgroundColor: `${colors.primary}20` },
                    ]}
                  >
                    <MaterialIcons
                      name="favorite"
                      size={28}
                      color={colors.primary}
                    />
                  </View>
                  <View style={styles.copy}>
                    <Text style={[styles.title, { color: colors.foreground }]}>
                      Everyday relationship space
                    </Text>
                    <Text style={[styles.body, { color: colors.muted }]}>
                      15 ways to reflect, keep memories and make real-life plans
                      together.
                    </Text>
                  </View>
                </View>
                <KairosButton
                  label="Explore relationship space"
                  icon="handshake"
                  accessibilityHint="Open all 15 relationship options; assessments are not required"
                  onPress={() => router.push("/aevum/life" as Href)}
                />
                <KairosBadge
                  label="Private by default · share only by choice"
                  tone="neutral"
                />
                <Text style={[styles.body, { color: colors.muted }]}>
                  Write privately or deliberately share an individual entry with
                  your partner. No assessment completion is needed for the hub
                  or a partner invitation.
                </Text>
                {user?.isPreview ? (
                  <Text style={[styles.boundary, { color: colors.warning }]}>
                    Preview journal entries are session-only drafts. There is no
                    real partner connection or server save in preview.
                  </Text>
                ) : null}
              </KairosCard>
              <KairosCard style={styles.hero}>
                <Text
                  style={[styles.sectionTitle, { color: colors.foreground }]}
                >
                  Optional relationship reflections
                </Text>
                <Text style={[styles.body, { color: colors.muted }]}>
                  The seven stages below currently offer one guided reflection
                  each, not multi-question clinical assessments or validated
                  screening. Completing a stage records that reflection, not a
                  diagnosis.
                </Text>
                <View style={styles.progressRow}>
                  <Text style={[styles.progressLabel, { color: colors.muted }]}>
                    Reflection progress
                  </Text>
                  <Text
                    style={[styles.progressValue, { color: colors.foreground }]}
                  >
                    {Math.round(progress * 100)}%
                  </Text>
                </View>
                <View
                  style={[
                    styles.progressTrack,
                    { backgroundColor: colors.border },
                  ]}
                >
                  <View
                    style={[
                      styles.progressFill,
                      {
                        width: `${Math.round(progress * 100)}%`,
                        backgroundColor: colors.primary,
                      },
                    ]}
                  />
                </View>
                <Text style={[styles.boundary, { color: colors.muted }]}>
                  Your answers remain private. Guided reflections do not
                  diagnose conditions, predict outcomes or replace professional
                  support.
                </Text>
                {profileQuery.isLoading ? (
                  <StatePanel
                    loading
                    title="Loading your private progress"
                    message="Checking saved reflections…"
                  />
                ) : null}
                {profileQuery.isError ? (
                  <StatePanel
                    icon="error-outline"
                    title="Reflections unavailable"
                    message={errorMessage(profileQuery.error)}
                    actionLabel="Try again"
                    onAction={() => void profileQuery.refetch()}
                  />
                ) : null}
                {!profile &&
                !profileQuery.isLoading &&
                !profileQuery.isError ? (
                  <KairosButton
                    label="Read consent before reflecting"
                    tone="secondary"
                    onPress={() => router.push("/aevum/consent" as Href)}
                  />
                ) : null}
                {user?.isPreview ? (
                  <Text style={[styles.boundary, { color: colors.warning }]}>
                    Optional reflections are session-only drafts in preview.
                    They are not saved to a server and clear when you leave this
                    preview account or session.
                  </Text>
                ) : null}
              </KairosCard>
              <KairosCard style={styles.hero}>
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>14-day mood & energy baseline</Text>
                <Text style={[styles.body, { color: colors.muted }]}>
                  {moodsQuery.isLoading
                    ? "Loading your recorded check-ins…"
                    : moodsQuery.isError
                      ? "Your private check-ins are unavailable right now. Retry before relying on this summary."
                      : `${baseline.daysTracked} of 14 recent days have both a mood and energy check-in.`}
                </Text>
                {baseline.moodAverage !== null || baseline.energyAverage !== null ? (
                  <Text style={[styles.body, { color: colors.foreground }]}>
                    {baseline.moodAverage !== null ? `Mood ${baseline.moodAverage}/10` : "Mood average unavailable"}
                    {" · "}
                    {baseline.energyAverage !== null ? `Energy ${baseline.energyAverage}/10` : "Energy average unavailable"}
                  </Text>
                ) : null}
                <Text style={[styles.boundary, { color: colors.muted }]}>
                  These are summaries of your own saved check-ins, not clinical measures or a diagnosis. Missing days are not estimated.
                </Text>
                {moodsQuery.isError ? (
                  <KairosButton label="Retry baseline data" tone="secondary" onPress={() => void moodsQuery.refetch()} />
                ) : (
                  <KairosButton
                    label={baseline.isComplete ? "Review daily check-ins" : "Log today's mood & energy"}
                    tone="secondary"
                    onPress={() => router.push(baseline.isComplete ? "/mood/history" : "/mood/log")}
                  />
                )}
              </KairosCard>
              <Text
                accessibilityRole="header"
                style={[styles.sectionTitle, { color: colors.foreground }]}
              >
                Seven-stage reflections
              </Text>
            </View>
          }
          renderItem={({ item, index }) => {
            const isComplete = completed.has(item.key);
            return (
              <PressableScale
                accessibilityLabel={`${item.title}. ${item.key === "baseline" ? `${baseline.daysTracked} of 14 recent mood and energy days.` : "One guided reflection."} ${isComplete ? "Recorded" : "Not started"}`}
                accessibilityRole="button"
                onPress={() =>
                  router.push({
                    pathname: "/aevum/assessment",
                    params: { stage: item.key },
                  } as Href)
                }
                style={styles.stagePressable}
              >
                <KairosCard style={styles.stageCard}>
                  <View
                    style={[
                      styles.stageNumber,
                      {
                        backgroundColor: isComplete
                          ? `${colors.success}20`
                          : `${colors.primary}20`,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.stageNumberText,
                        { color: isComplete ? colors.success : colors.primary },
                      ]}
                    >
                      {index + 1}
                    </Text>
                  </View>
                  <View style={styles.stageCopy}>
                    <Text
                      style={[styles.stageTitle, { color: colors.foreground }]}
                    >
                      {item.key === "neurodivergence"
                        ? "Neurodivergence Reflection"
                        : item.key === "baseline"
                          ? "Mood & Energy Reflection"
                          : item.title}
                    </Text>
                    <Text style={[styles.stageBody, { color: colors.muted }]}>
                      {STAGE_REFLECTIONS[item.key]}
                    </Text>
                    <Text style={[styles.duration, { color: colors.muted }]}>
                      {item.key === "baseline" ? `${baseline.daysTracked}/14 mood & energy days · private` : "1 guided reflection · private"}
                    </Text>
                  </View>
                  <KairosBadge
                    label={isComplete ? "Recorded" : "Start"}
                    tone={isComplete ? "success" : "neutral"}
                  />
                </KairosCard>
              </PressableScale>
            );
          }}
          ListFooterComponent={
            <View style={styles.footer}>
              <KairosButton
                label="View individual reflections"
                tone="secondary"
                disabled={progress < 1}
                onPress={() => router.push("/aevum/results" as Href)}
              />
              <KairosButton
                label="Open Aevum Coach"
                tone="secondary"
                onPress={() => router.push("/assistants/aevum" as Href)}
              />
              <KairosButton
                label="Connect a partner"
                icon="handshake"
                onPress={() => router.push("/aevum/partner" as Href)}
              />
              <KairosButton
                label="Aevum privacy and consent"
                icon="lock"
                tone="ghost"
                onPress={() => router.push("/aevum/privacy" as Href)}
              />
              <Text style={[styles.footerNote, { color: colors.muted }]}>
                Invitations and everyday journaling are independent of these
                reflections. A connection never automatically shares your
                entries or assessment answers.
              </Text>
            </View>
          }
        />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 116 },
  headerArea: { gap: 14, marginBottom: 8 },
  hero: { gap: 16, padding: 18 },
  heroTitleRow: { flexDirection: "row", gap: 12 },
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  copy: { flex: 1, gap: 4 },
  title: { fontFamily: Fonts.serif, fontSize: 22, lineHeight: 29, fontWeight: "400" },
  body: { fontSize: 14, lineHeight: 20 },
  progressRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  progressLabel: { fontSize: 13, fontWeight: "700" },
  progressValue: { fontSize: 16, fontWeight: "900" },
  progressTrack: { height: 8, borderRadius: 8, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 8 },
  boundary: { fontSize: 12, lineHeight: 17 },
  sectionTitle: {
    fontSize: 18,
    lineHeight: 24,
    fontFamily: Fonts.serif, fontWeight: "400",
    marginTop: 4,
  },
  stagePressable: { marginBottom: 10 },
  stageCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 102,
  },
  stageNumber: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  stageNumberText: { fontSize: 16, fontWeight: "900" },
  stageCopy: { flex: 1, gap: 3 },
  stageTitle: { fontSize: 16, lineHeight: 21, fontWeight: "800" },
  stageBody: { fontSize: 12, lineHeight: 17 },
  duration: { fontSize: 11, lineHeight: 15, fontWeight: "700" },
  footer: { gap: 10, paddingTop: 8 },
  footerNote: { textAlign: "center", fontSize: 12, lineHeight: 17 },
});
