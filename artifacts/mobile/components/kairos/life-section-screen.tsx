import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import type { Href } from "expo-router";
import { useRouter } from "expo-router";
import { FlatList, StyleSheet, Text, View } from "react-native";

import { KairosCard } from "@/components/kairos/card";
import { PressableScale } from "@/components/kairos/pressable-scale";
import { ScreenHeader } from "@/components/kairos/screen-header";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";

export type LifeSectionItem = {
  key: string;
  title: string;
  subtitle: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  href: Href;
};

type LifeSectionScreenProps = {
  title: string;
  subtitle: string;
  privacyNote: string;
  items: LifeSectionItem[];
};

export function LifeSectionScreen({ title, subtitle, privacyNote, items }: LifeSectionScreenProps) {
  const colors = useColors();
  const router = useRouter();

  return (
    <ScreenContainer>
      <FlatList
        data={items}
        numColumns={2}
        keyExtractor={(item) => item.key}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View style={styles.header}>
            <ScreenHeader showBack title={title} subtitle={subtitle} />
            <KairosCard style={styles.privacyCard}>
              <MaterialIcons name="lock-outline" size={21} color={colors.primary} />
              <Text style={[styles.privacyText, { color: colors.muted }]}>{privacyNote}</Text>
            </KairosCard>
          </View>
        }
        renderItem={({ item }) => (
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel={`${item.title}. ${item.subtitle}`}
            onPress={() => router.push(item.href)}
            style={styles.tilePressable}
          >
            <KairosCard style={styles.tile}>
              <View style={[styles.iconCircle, { backgroundColor: `${colors.primary}20` }]}>
                <MaterialIcons name={item.icon} size={25} color={colors.primary} />
              </View>
              <Text style={[styles.title, { color: colors.foreground }]}>{item.title}</Text>
              <Text style={[styles.body, { color: colors.muted }]}>{item.subtitle}</Text>
            </KairosCard>
          </PressableScale>
        )}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 116 },
  header: { gap: 14, marginBottom: 14 },
  privacyCard: { flexDirection: "row", alignItems: "center", gap: 12 },
  privacyText: { flex: 1, fontSize: 13, lineHeight: 19 },
  row: { gap: 12, marginBottom: 12, alignItems: "stretch" },
  tilePressable: { flex: 1, maxWidth: "50%" },
  tile: { minHeight: 174, gap: 10, flex: 1 },
  iconCircle: { width: 44, height: 44, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 17, lineHeight: 22, fontWeight: "800" },
  body: { fontSize: 12, lineHeight: 17, flex: 1 },
});
