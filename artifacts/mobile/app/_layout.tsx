import "@/global.css";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { Redirect, Stack, usePathname, type Href } from "expo-router";
import { useMemo, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import "react-native-reanimated";
import { Platform } from "react-native";
import "@/lib/_core/nativewind-pressable";
import { ThemeProvider } from "@/lib/theme-provider";
import {
  SafeAreaFrameContext,
  SafeAreaInsetsContext,
  SafeAreaProvider,
  initialWindowMetrics,
} from "react-native-safe-area-context";
import type { EdgeInsets, Rect } from "react-native-safe-area-context";

import { createKairosQueryClient, kairosQueryPersister, shouldPersistKairosQuery } from "@/lib/query-client";
import { SupabaseAuthProvider, useKairosAuth } from "@/providers/supabase-auth-provider";
import { KairosUIProvider } from "@/providers/kairos-ui-provider";
import { OfflineBanner } from "@/components/navigation/offline-banner";
import { ThemedStatusBar } from "@/components/navigation/themed-status-bar";
import { PreviewBanner } from "@/components/navigation/preview-banner";
import { FloatingMainNavigation } from "@/components/navigation/floating-main-navigation";

const DEFAULT_WEB_INSETS: EdgeInsets = { top: 0, right: 0, bottom: 0, left: 0 };
const DEFAULT_WEB_FRAME: Rect = { x: 0, y: 0, width: 0, height: 0 };

export const unstable_settings = {
  anchor: "index",
};

function AuthenticatedNavigation() {
  const { recovery } = useKairosAuth();
  const pathname = usePathname();
  const callbackRoute = pathname === "/auth/callback";
  const resetRoute = pathname === "/reset-password";
  const recoveryLocked = recovery.status !== "idle";
  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="(app)" />
        <Stack.Screen name="auth/callback" />
      </Stack>
      {recoveryLocked && !callbackRoute && !resetRoute ? (
        <Redirect href={"/reset-password" as Href} />
      ) : null}
      {!recoveryLocked && !resetRoute && !callbackRoute ? <FloatingMainNavigation /> : null}
    </>
  );
}

export default function RootLayout() {
  const initialInsets = initialWindowMetrics?.insets ?? DEFAULT_WEB_INSETS;
  const initialFrame = initialWindowMetrics?.frame ?? DEFAULT_WEB_FRAME;

  const insets = useMemo<EdgeInsets>(
    () =>
      Platform.OS === "web"
        ? {
            ...initialInsets,
            top: Math.max(initialInsets.top, 67),
            bottom: Math.max(initialInsets.bottom, 34),
          }
        : initialInsets,
    [initialInsets],
  );

  // Create clients once and reuse them
  const [queryClient] = useState(() => createKairosQueryClient());

  const providerInitialMetrics = useMemo(() => {
    const metrics = initialWindowMetrics ?? { insets: initialInsets, frame: initialFrame };
    return {
      ...metrics,
      insets,
    };
  }, [initialInsets, initialFrame, insets]);

  const content = (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardProvider>
        <PersistQueryClientProvider
          client={queryClient}
          persistOptions={{ persister: kairosQueryPersister, maxAge: 1000 * 60 * 60 * 24, dehydrateOptions: { shouldDehydrateQuery: shouldPersistKairosQuery, shouldDehydrateMutation: () => false } }}
        >
          <SupabaseAuthProvider>
            <KairosUIProvider>
              <PreviewBanner />
              <AuthenticatedNavigation />
              <OfflineBanner />
              <ThemedStatusBar />
            </KairosUIProvider>
          </SupabaseAuthProvider>
        </PersistQueryClientProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );

  const shouldOverrideSafeArea = Platform.OS === "web";

  if (shouldOverrideSafeArea) {
    return (
      <ThemeProvider>
        <SafeAreaProvider initialMetrics={providerInitialMetrics}>
            <SafeAreaFrameContext.Provider value={initialFrame}>
            <SafeAreaInsetsContext.Provider value={insets}>
              {content}
            </SafeAreaInsetsContext.Provider>
          </SafeAreaFrameContext.Provider>
        </SafeAreaProvider>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <SafeAreaProvider initialMetrics={providerInitialMetrics}>{content}</SafeAreaProvider>
    </ThemeProvider>
  );
}
