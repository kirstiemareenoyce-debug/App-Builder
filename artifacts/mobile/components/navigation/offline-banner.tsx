import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Network from "expo-network";
import { onlineManager } from "@tanstack/react-query";
import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export function OfflineBanner() {
  const insets = useSafeAreaInsets();
  const state = Network.useNetworkState();
  const offline = state.isInternetReachable === false || state.isConnected === false;

  useEffect(() => {
    if (state.isInternetReachable !== null && state.isInternetReachable !== undefined) {
      onlineManager.setOnline(state.isInternetReachable);
    } else if (state.isConnected !== null && state.isConnected !== undefined) {
      onlineManager.setOnline(state.isConnected);
    }
  }, [state.isConnected, state.isInternetReachable]);

  if (!offline) return null;
  return (
    <View accessibilityLiveRegion="polite" style={[styles.banner, { paddingTop: Math.max(insets.top, 8) + 6 }]}>
      <MaterialIcons color="#FFFFFF" name="cloud-off" size={18} />
      <Text style={styles.label}>Offline. Cached information remains available; changes will need a connection.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { position: "absolute", top: 0, left: 0, right: 0, zIndex: 1000, minHeight: 44, paddingHorizontal: 14, paddingBottom: 8, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#991B1B" },
  label: { flexShrink: 1, color: "#FFFFFF", fontSize: 12, lineHeight: 17, fontWeight: "700", textAlign: "center" },
});
