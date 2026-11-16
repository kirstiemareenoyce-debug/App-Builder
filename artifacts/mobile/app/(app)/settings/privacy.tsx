import { Fonts } from "@/constants/theme";
import { ScrollView, StyleSheet, Text } from "react-native";

import { KairosCard } from "@/components/kairos/card";
import { ScreenHeader } from "@/components/kairos/screen-header";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";

const ITEMS = [
  { title: "Private by design", body: "Kairos rows are protected by owner-only database policies. Other signed-in users cannot read your private logs, tasks, notes, or AI conversations." },
  { title: "Explicit partner sharing", body: "A partner connection does not automatically expose personal records. Shared categories remain an explicit choice on the connection." },
  { title: "AI context", body: "Evergreen retrieves only context owned by your account. Feedback helps future responses and remains attached to your account." },
  { title: "Avatar storage", body: "Profile photos are stored in a private bucket under your account ID and displayed through short-lived signed links." },
];

export default function PrivacyScreen() {
  const colors = useColors();
  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <ScreenHeader showBack title="Privacy & data" subtitle="Clear boundaries for personal information" />
        {ITEMS.map((item) => <KairosCard key={item.title} style={styles.card}><Text style={[styles.title, { color: colors.foreground }]}>{item.title}</Text><Text style={[styles.body, { color: colors.muted }]}>{item.body}</Text></KairosCard>)}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { gap: 12, padding: 20, paddingBottom: 36 },
  card: { gap: 7 },
  title: { fontSize: 16, lineHeight: 21, fontFamily: Fonts.serif, fontWeight: "400" },
  body: { fontSize: 14, lineHeight: 21 },
});
