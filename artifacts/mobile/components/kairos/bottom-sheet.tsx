import type { ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/use-colors";

type BottomSheetProps = {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
};

export function BottomSheet({ visible, title, onClose, children }: BottomSheetProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.root}
      >
        <Pressable accessibilityLabel="Close modal" onPress={onClose} style={styles.backdrop} />
        <View
          accessibilityViewIsModal
          style={[
            styles.sheet,
            { backgroundColor: colors.backgroundSecondary, borderColor: colors.border, paddingBottom: Math.max(insets.bottom, 20) },
          ]}
        >
          <View style={[styles.grabber, { backgroundColor: colors.border }]} />
          <Text accessibilityRole="header" style={[styles.title, { color: colors.foreground }]}>{title}</Text>
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(0,0,0,0.7)" },
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, paddingHorizontal: 20, paddingTop: 10, gap: 16, maxHeight: "88%" },
  grabber: { width: 42, height: 5, borderRadius: 3, alignSelf: "center", marginBottom: 4 },
  title: { fontSize: 22, lineHeight: 28, fontWeight: "800" },
});
