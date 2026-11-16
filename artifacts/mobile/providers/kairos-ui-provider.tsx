import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/use-colors";

type ToastTone = "success" | "error" | "info";
type ToastState = { message: string; tone: ToastTone } | null;
type KairosUIContextValue = {
  showToast: (message: string, tone?: ToastTone) => void;
};

const KairosUIContext = createContext<KairosUIContextValue | null>(null);

export function KairosUIProvider({ children }: { children: ReactNode }) {
  const colors = useColors();
  const [toast, setToast] = useState<ToastState>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string, tone: ToastTone = "info") => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setToast({ message, tone });
    timerRef.current = setTimeout(() => setToast(null), 3200);
  }, []);

  const value = useMemo(() => ({ showToast }), [showToast]);
  const toastBackground = toast?.tone === "success"
    ? colors.success
    : toast?.tone === "error"
      ? colors.error
      : colors.surfaceElevated;

  return (
    <KairosUIContext.Provider value={value}>
      {children}
      {toast ? (
        <View
          pointerEvents="none"
          accessibilityLiveRegion={toast.tone === "error" ? "assertive" : "polite"}
          style={[styles.toast, { backgroundColor: toastBackground }]}
        >
          <Text style={styles.toastText}>{toast.message}</Text>
        </View>
      ) : null}
    </KairosUIContext.Provider>
  );
}

export function useKairosUI(): KairosUIContextValue {
  const context = useContext(KairosUIContext);
  if (!context) throw new Error("useKairosUI must be used within KairosUIProvider");
  return context;
}

const styles = StyleSheet.create({
  toast: {
    position: "absolute",
    left: 20,
    right: 20,
    bottom: 28,
    minHeight: 48,
    borderRadius: 14,
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    shadowColor: "#000000",
    shadowOpacity: 0.24,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
    zIndex: 100,
  },
  toastText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 20,
    textAlign: "center",
  },
});
