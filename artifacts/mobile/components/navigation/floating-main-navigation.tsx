import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { usePathname, useRouter, type Href } from "expo-router";
import { useEffect, useState } from "react";
import { Keyboard, Platform, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PressableScale } from "@/components/kairos/pressable-scale";
import { useColors } from "@/hooks/use-colors";
import { useKairosAuth } from "@/providers/supabase-auth-provider";
import { MAIN_DESTINATIONS, destinationForPath } from "@/lib/main-navigation";

export { MAIN_DESTINATIONS } from "@/lib/main-navigation";

export function FloatingMainNavigation() {
  const colors = useColors();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useKairosAuth();
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  useEffect(() => {
    if (Platform.OS === "web") return;
    const show = Keyboard.addListener("keyboardDidShow", () => setKeyboardVisible(true));
    const hide = Keyboard.addListener("keyboardDidHide", () => setKeyboardVisible(false));
    return () => { show.remove(); hide.remove(); };
  }, []);
  if (!user || keyboardVisible || /\/(login|onboarding|callback)(\/|$)/.test(pathname)) return null;
  const active = destinationForPath(pathname);
  return (
    <View accessibilityLabel="Main navigation" style={[styles.shell, { width: Math.min(width - 24, 560), bottom: Math.max(insets.bottom, 10), backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
      {MAIN_DESTINATIONS.map((item) => {
        const selected = active === item.href;
        const tint = selected ? colors.primary : colors.muted;
        return (
          <PressableScale key={item.label} accessibilityRole="tab" accessibilityLabel={`${item.label} tab`} accessibilityState={{ selected }} onPress={() => { if (pathname !== item.href) router.navigate(item.href as Href); }} style={[styles.tab, selected && { backgroundColor: `${colors.primary}12` }]}>
            <MaterialIcons name={item.icon} size={21} color={tint} />
            <Text numberOfLines={2} style={[styles.label, { color: tint }]}>{item.label}</Text>
          </PressableScale>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { position: "absolute", alignSelf: "center", height: 66, padding: 5, borderWidth: 1, borderRadius: 25, flexDirection: "row", alignItems: "center", shadowColor: "#000000", shadowOpacity: 0.28, shadowRadius: 18, shadowOffset: { width: 0, height: 7 }, elevation: 12, zIndex: 100 },
  tab: { flex: 1, height: 54, borderRadius: 19, alignItems: "center", justifyContent: "center", gap: 3 },
  label: { fontSize: 9, lineHeight: 11, fontWeight: "700", letterSpacing: 0.1, textAlign: "center", paddingHorizontal: 2 },
});
