import { useRouter } from "expo-router";
import { FlatList, StyleSheet, Text, View } from "react-native";

import { KairosCard } from "@/components/kairos/card";
import { KairosInput } from "@/components/kairos/input";
import { PressableScale } from "@/components/kairos/pressable-scale";
import { ScreenHeader } from "@/components/kairos/screen-header";
import { StatePanel } from "@/components/kairos/state-panel";
import { ScreenContainer } from "@/components/screen-container";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useNoteSearch } from "@/hooks/use-notes";
import { useColors } from "@/hooks/use-colors";
import { useState } from "react";

function HighlightedText({ text, query, color, highlight }: { text: string; query: string; color: string; highlight: string }) {
  const normalized = query.trim();
  if (!normalized) return <Text style={[styles.resultTitle, { color }]}>{text}</Text>;
  const index = text.toLocaleLowerCase().indexOf(normalized.toLocaleLowerCase());
  if (index < 0) return <Text style={[styles.resultTitle, { color }]}>{text}</Text>;
  return (
    <Text style={[styles.resultTitle, { color }]}>
      {text.slice(0, index)}
      <Text style={{ color: highlight }}>{text.slice(index, index + normalized.length)}</Text>
      {text.slice(index + normalized.length)}
    </Text>
  );
}

export default function NoteSearchScreen() {
  const router = useRouter();
  const colors = useColors();
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 250);
  const results = useNoteSearch(debouncedQuery);

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]}>
      <View style={styles.headerWrap}>
        <ScreenHeader showBack title="Search notes" subtitle="Ranked by relevance" />
        <KairosInput autoFocus label="Search" onChangeText={setQuery} placeholder="Search title or content…" returnKeyType="search" value={query} />
      </View>
      <FlatList
        data={results.data ?? []}
        initialNumToRender={12}
        maxToRenderPerBatch={10}
        windowSize={7}
        keyExtractor={(item) => item.id}
        contentContainerStyle={(results.data?.length ?? 0) === 0 ? styles.emptyList : styles.list}
        ListEmptyComponent={<StatePanel loading={results.isFetching} icon={results.isError ? "error-outline" : "search"} title={!debouncedQuery.trim() ? "Start typing to search" : results.isError ? "Search unavailable" : "No matching notes"} message={!debouncedQuery.trim() ? "Results update after a short pause." : results.isError ? (results.error instanceof Error ? results.error.message : "Try again shortly.") : "Try a different word or phrase."} actionLabel={results.isError ? "Try again" : undefined} onAction={results.isError ? () => void results.refetch() : undefined} />}
        renderItem={({ item }) => (
          <PressableScale accessibilityLabel={`Open note ${item.title}`} haptic="none" onPress={() => router.push({ pathname: "/notes/edit", params: { id: item.id } })}>
            <KairosCard style={styles.resultCard}>
              <HighlightedText text={item.title} query={debouncedQuery} color={colors.foreground} highlight={colors.primary} />
              <Text numberOfLines={3} style={[styles.snippet, { color: colors.muted }]}>{item.content || "No content"}</Text>
              <View style={styles.tags}>{item.tags.slice(0, 4).map((tag) => <Text key={tag} style={[styles.tag, { color: colors.primary }]}>#{tag}</Text>)}</View>
              <Text style={[styles.rank, { color: colors.tertiary }]}>Relevance {Math.max(0, item.rank).toFixed(3)}</Text>
            </KairosCard>
          </PressableScale>
        )}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  headerWrap: { gap: 14, paddingHorizontal: 20, paddingTop: 10 },
  list: { gap: 10, padding: 20, paddingBottom: 36 },
  emptyList: { flexGrow: 1 },
  resultCard: { gap: 8 },
  resultTitle: { fontSize: 17, lineHeight: 22, fontWeight: "800" },
  snippet: { fontSize: 13, lineHeight: 19 },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  tag: { fontSize: 11, lineHeight: 15, fontWeight: "700" },
  rank: { fontSize: 10, lineHeight: 14 },
});
