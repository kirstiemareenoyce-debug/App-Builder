import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";
import {
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";

import { KairosButton } from "@/components/kairos/button";
import { PressableScale } from "@/components/kairos/pressable-scale";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useKairosAuth } from "@/providers/supabase-auth-provider";
import { useAppStore } from "@/store/use-app-store";

type Slide = {
  key: string;
  eyebrow: string;
  title: string;
  body: string;
  icon: keyof typeof MaterialIcons.glyphMap;
};

const SLIDES: Slide[] = [
  {
    key: "welcome",
    eyebrow: "Your time, understood",
    title: "Meet Kairos",
    body: "A private companion for the moments, plans, and patterns that shape your life.",
    icon: "explore",
  },
  {
    key: "track",
    eyebrow: "Everything in one place",
    title: "Track what matters",
    body: "Log mood and sleep, organise tasks, and capture notes without losing your rhythm.",
    icon: "insights",
  },
  {
    key: "chat",
    eyebrow: "Context that grows with you",
    title: "Choose your AI space",
    body: "Kairos for self-understanding, Aevum for relationship education, and Evergreen for everyday help. You choose the context and what you share.",
    icon: "auto-awesome",
  },
  {
    key: "learn",
    eyebrow: "You stay in control",
    title: "Private first. Share by choice.",
    body: "My Life, My Relationship, My Work and AI keep their purposes distinct. AI is educational support, not diagnosis or licensed therapy.",
    icon: "verified-user",
  },
];

export default function OnboardingScreen() {
  const router = useRouter();
  const colors = useColors();
  const { width } = useWindowDimensions();
  const listRef = useRef<FlatList<Slide>>(null);
  const [index, setIndex] = useState(0);
  const completeOnboarding = useAppStore((state) => state.completeOnboarding);
  const { enterPreviewMode } = useKairosAuth();

  const finish = useCallback(() => {
    completeOnboarding();
    router.replace("/(auth)/login");
  }, [completeOnboarding, router]);

  const next = useCallback(() => {
    if (index === SLIDES.length - 1) {
      finish();
      return;
    }
    listRef.current?.scrollToIndex({ index: index + 1, animated: true });
  }, [finish, index]);

  const handleScrollEnd = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    setIndex(Math.round(event.nativeEvent.contentOffset.x / Math.max(width, 1)));
  }, [width]);

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]}>
      <View style={styles.topBar}>
        <Text style={[styles.brand, { color: colors.foreground }]}>KAIROS</Text>
        <PressableScale accessibilityLabel="Skip onboarding" haptic="none" onPress={finish} style={styles.skipButton}>
          <Text style={[styles.skipText, { color: colors.muted }]}>Skip</Text>
        </PressableScale>
      </View>
      <FlatList
        ref={listRef}
        data={SLIDES}
        horizontal
        pagingEnabled
        bounces={false}
        keyExtractor={(item) => item.key}
        onMomentumScrollEnd={handleScrollEnd}
        showsHorizontalScrollIndicator={false}
        renderItem={({ item }) => (
          <View style={[styles.slide, { width }]}>
            <View style={[styles.orbit, { borderColor: `${colors.primary}55` }]}>
              <View style={[styles.iconCircle, { backgroundColor: `${colors.primary}22`, borderColor: colors.primary }]}>
                <MaterialIcons name={item.icon} size={64} color={colors.primary} />
              </View>
            </View>
            <Text style={[styles.eyebrow, { color: colors.primary }]}>{item.eyebrow}</Text>
            <Text accessibilityRole="header" style={[styles.title, { color: colors.foreground }]}>{item.title}</Text>
            <Text style={[styles.body, { color: colors.muted }]}>{item.body}</Text>
          </View>
        )}
      />
      <View style={styles.footer}>
        <View accessibilityLabel={`Page ${index + 1} of ${SLIDES.length}`} style={styles.dots}>
          {SLIDES.map((slide, slideIndex) => (
            <View
              key={slide.key}
              style={[
                styles.dot,
                { backgroundColor: slideIndex === index ? colors.primary : colors.border },
                slideIndex === index && styles.activeDot,
              ]}
            />
          ))}
        </View>
        <KairosButton
          label={index === SLIDES.length - 1 ? "Get Started" : "Continue"}
          accessibilityHint={index === SLIDES.length - 1 ? "Opens sign in" : "Shows the next introduction"}
          onPress={next}
        />
        <KairosButton
          label="Try Preview — No Login"
          tone="secondary"
          onPress={() => {
            completeOnboarding();
            enterPreviewMode();
            router.replace("/(tabs)/ai");
          }}
        />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  topBar: { height: 56, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20 },
  brand: { fontSize: 15, lineHeight: 20, fontWeight: "900", letterSpacing: 3 },
  skipButton: { minWidth: 44, minHeight: 44, alignItems: "flex-end", justifyContent: "center" },
  skipText: { fontSize: 15, lineHeight: 20, fontWeight: "600" },
  slide: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 28, paddingBottom: 30 },
  orbit: { width: 214, height: 214, borderRadius: 107, borderWidth: 1, alignItems: "center", justifyContent: "center", marginBottom: 38 },
  iconCircle: { width: 154, height: 154, borderRadius: 77, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  eyebrow: { fontSize: 13, lineHeight: 18, fontWeight: "800", letterSpacing: 1.2, textTransform: "uppercase", textAlign: "center" },
  title: { marginTop: 10, fontSize: 32, lineHeight: 39, fontWeight: "900", textAlign: "center" },
  body: { marginTop: 14, maxWidth: 360, fontSize: 17, lineHeight: 26, textAlign: "center" },
  footer: { gap: 22, paddingHorizontal: 20, paddingBottom: 16 },
  dots: { minHeight: 20, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  activeDot: { width: 24 },
});
