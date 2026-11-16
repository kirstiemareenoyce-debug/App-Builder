import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { ConfidenceBadge } from "@/components/ai/confidence-badge";
import { PressableScale } from "@/components/kairos/pressable-scale";
import { useColors } from "@/hooks/use-colors";
import type { ConfidenceLevel } from "@/types/evergreen";

export type ChatMessageModel = {
  id: string;
  role: "user" | "assistant";
  content: string;
  interactionId?: string;
  confidence?: number;
  confidenceLevel?: ConfidenceLevel;
};

export const ChatMessage = memo(function ChatMessage({
  message,
  onFeedback,
}: {
  message: ChatMessageModel;
  onFeedback: (message: ChatMessageModel) => void;
}) {
  const colors = useColors();
  const isUser = message.role === "user";
  return (
    <View style={[styles.row, isUser ? styles.userRow : styles.assistantRow]}>
      <View style={[
        styles.bubble,
        isUser ? styles.userBubble : styles.assistantBubble,
        { backgroundColor: isUser ? colors.primary : colors.surface, borderColor: isUser ? colors.primary : colors.border },
      ]}>
        <Text
          accessibilityLiveRegion={isUser ? "none" : "polite"}
          style={[styles.content, { color: colors.foreground }]}
        >
          {message.content}
        </Text>
      </View>
      {!isUser && message.confidenceLevel && message.confidence !== undefined ? (
        <View style={styles.metaRow}>
          <ConfidenceBadge confidence={message.confidence} level={message.confidenceLevel} />
          <PressableScale
            accessibilityLabel="Give feedback on this response"
            haptic="light"
            onPress={() => onFeedback(message)}
            style={styles.feedbackButton}
          >
            <MaterialIcons color={colors.muted} name="rate-review" size={19} />
          </PressableScale>
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  row: { width: "100%", marginBottom: 14 },
  userRow: { alignItems: "flex-end" },
  assistantRow: { alignItems: "flex-start" },
  bubble: { maxWidth: "86%", borderRadius: 18, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 11 },
  userBubble: { borderBottomRightRadius: 5 },
  assistantBubble: { borderBottomLeftRadius: 5 },
  content: { fontSize: 16, lineHeight: 24 },
  metaRow: { marginTop: 7, flexDirection: "row", alignItems: "center", gap: 8 },
  feedbackButton: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
});
