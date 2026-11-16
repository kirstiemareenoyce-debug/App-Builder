import { Redirect, Stack } from "expo-router";

import { StatePanel } from "@/components/kairos/state-panel";
import { ScreenContainer } from "@/components/screen-container";
import { useKairosAuth } from "@/providers/supabase-auth-provider";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/use-colors";

export default function ProtectedAppLayout() {
  const { loading, user } = useKairosAuth();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  if (loading) {
    return (
      <ScreenContainer edges={["top", "bottom", "left", "right"]}>
        <StatePanel loading title="Opening Kairos" message="Checking your session…" />
      </ScreenContainer>
    );
  }
  if (!user) return <Redirect href="/(auth)/login" />;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingBottom: Math.max(insets.bottom, 10) + 76 }}>
    <Stack
      screenOptions={{
        headerShown: false,
        gestureEnabled: true,
        fullScreenGestureEnabled: false,
        animation: "slide_from_right",
      }}
    />
    </View>
  );
}
