import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useRouter, type Href } from "expo-router";
import { FlatList, StyleSheet, Text, View } from "react-native";

import { KairosCard } from "@/components/kairos/card";
import { PressableScale } from "@/components/kairos/pressable-scale";
import { ScreenHeader } from "@/components/kairos/screen-header";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { AI_ASSISTANTS } from "@/lib/ai-assistants";
import { AI_TOOLS } from "@/lib/ai-tools";
import { useKairosAuth } from "@/providers/supabase-auth-provider";

export default function AIHubScreen() {
  const colors = useColors();
  const router = useRouter();
  const { user } = useKairosAuth();

  return (
    <ScreenContainer header={<ScreenHeader title="AI" subtitle="Choose the kind of help you need." />}>
      <FlatList
        data={AI_ASSISTANTS}
        keyExtractor={(item) => item.id}
        initialNumToRender={3}
        maxToRenderPerBatch={3}
        windowSize={3}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View style={styles.header}>
            <KairosCard style={styles.privacyCard}>
              <MaterialIcons name="lock-outline" size={23} color={colors.primary} />
              <Text style={[styles.body, { color: colors.muted }]}>Your individual, relationship and everyday spaces have distinct purposes. You choose what crosses between them.</Text>
            </KairosCard>
            <Text accessibilityRole="header" style={[styles.workspaceTitle, { color: colors.primary }]}>AI workspace</Text>
            {AI_TOOLS.map((tool) => (
              <PressableScale key={tool.key} accessibilityRole="button" accessibilityLabel={`Open ${tool.title}. ${tool.subtitle}`} onPress={() => router.push(tool.href as Href)}>
                <KairosCard style={styles.toolCard}>
                  <MaterialIcons name={tool.icon} size={23} color={colors.primary} />
                  <View style={styles.copy}>
                    <Text style={[styles.toolTitle, { color: colors.foreground }]}>{tool.title}</Text>
                    <Text style={[styles.toolSubtitle, { color: colors.muted }]}>{tool.subtitle}</Text>
                  </View>
                  <MaterialIcons name="chevron-right" size={23} color={colors.primary} />
                </KairosCard>
              </PressableScale>
            ))}
            <Text accessibilityRole="header" style={[styles.workspaceTitle, { color: colors.primary }]}>Choose an assistant</Text>
          </View>
        }
        renderItem={({ item }) => (
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel={`Open ${item.name}. ${item.description}`}
            onPress={() => router.push(item.href as Href)}
            style={styles.pressable}
          >
            <KairosCard style={styles.assistantCard}>
              <View style={styles.row}>
                <View style={[styles.iconCircle, { backgroundColor: `${colors.primary}20` }]}>
                  <MaterialIcons name={item.icon} size={28} color={colors.primary} />
                </View>
                <View style={styles.copy}>
                  <Text style={[styles.name, { color: colors.foreground }]}>{item.name}</Text>
                  <Text style={[styles.tagline, { color: colors.primary }]}>{item.tagline}</Text>
                </View>
                <MaterialIcons name="arrow-forward" size={22} color={colors.primary} />
              </View>
              <Text style={[styles.body, { color: colors.muted }]}>{item.description}</Text>
            </KairosCard>
          </PressableScale>
        )}
        ListFooterComponent={
          <View style={styles.footer}>
            <Text style={[styles.notice, { color: colors.muted }]}>AI offers educational and practical support, not diagnosis, licensed therapy or emergency care.</Text>
            {user?.isPreview ? <Text style={[styles.notice, { color: colors.warning }]}>Preview mode makes no live AI calls. Signed-in use requires the relevant backend functions, schema and provider configuration.</Text> : null}
          </View>
        }
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 116 },
  header: { gap: 16, marginBottom: 20 },
  privacyCard: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  pressable: { marginBottom: 14 },
  assistantCard: { gap: 14, padding: 20 },
  row: { flexDirection: "row", alignItems: "center", gap: 14 },
  iconCircle: { width: 54, height: 54, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  copy: { flex: 1, gap: 4 },
  name: { fontSize: 22, lineHeight: 29, fontWeight: "800" },
  tagline: { fontSize: 12, lineHeight: 17, fontWeight: "700" },
  body: { flexShrink: 1, fontSize: 14, lineHeight: 21 },
  footer: { gap: 10, marginTop: 6 },
  notice: { fontSize: 12, lineHeight: 18 },
  workspaceTitle: { fontSize: 13, lineHeight: 19, fontWeight: "800", letterSpacing: 1 },
  toolCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14 },
  toolTitle: { fontSize: 16, lineHeight: 22, fontWeight: "700" },
  toolSubtitle: { fontSize: 12, lineHeight: 17 },
});
