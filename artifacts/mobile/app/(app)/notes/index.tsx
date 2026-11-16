import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useRouter, type Href } from "expo-router";
import { Alert, FlatList, Platform, StyleSheet, Text, View } from "react-native";
import ReanimatedSwipeable from "react-native-gesture-handler/ReanimatedSwipeable";

import { KairosCard } from "@/components/kairos/card";
import { PressableScale } from "@/components/kairos/pressable-scale";
import { ScreenHeader } from "@/components/kairos/screen-header";
import { StatePanel } from "@/components/kairos/state-panel";
import { ScreenContainer } from "@/components/screen-container";
import { useDeleteNote, useNotes } from "@/hooks/use-notes";
import { useColors } from "@/hooks/use-colors";
import { formatShortDate } from "@/lib/date";
import { useKairosUI } from "@/providers/kairos-ui-provider";
import type { Note } from "@/types/app";

export default function NoteListScreen() {
  const router = useRouter();
  const colors = useColors();
  const { showToast } = useKairosUI();
  const notes = useNotes();
  const deleteNote = useDeleteNote();

  const remove = (note: Note) => {
    const confirmDelete = async () => {
      try {
        await deleteNote.mutateAsync(note.id);
        showToast("Note deleted.", "success");
      } catch (error) {
        showToast(error instanceof Error ? error.message : "Note could not be deleted.", "error");
      }
    };
    if (Platform.OS === "web") {
      if (globalThis.confirm?.(`Delete “${note.title}”?`)) void confirmDelete();
      return;
    }
    Alert.alert("Delete note?", `“${note.title}” will be removed permanently.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => void confirmDelete() },
    ]);
  };

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]}>
      <View style={styles.headerWrap}>
        <ScreenHeader
          showBack
          title="Notes"
          subtitle="Ideas, reflections, and context"
          rightActions={[
            { icon: "search", label: "Search notes", onPress: () => router.push("/notes/search" as Href) },
            { icon: "add", label: "Add note", onPress: () => router.push("/notes/edit") },
          ]}
        />
      </View>
      <FlatList
        data={notes.data ?? []}
        initialNumToRender={12}
        maxToRenderPerBatch={10}
        windowSize={7}
        numColumns={2}
        keyExtractor={(item) => item.id}
        columnWrapperStyle={styles.row}
        contentContainerStyle={(notes.data?.length ?? 0) === 0 ? styles.emptyList : styles.list}
        ListEmptyComponent={<StatePanel loading={notes.isLoading} icon={notes.isError ? "error-outline" : "sticky-note-2"} title={notes.isLoading ? "Loading notes" : notes.isError ? "Notes unavailable" : "No notes yet"} message={notes.isError ? (notes.error instanceof Error ? notes.error.message : "Try again shortly.") : "Capture an idea, reflection, or important detail."} actionLabel={notes.isError ? "Try again" : "Add note"} onAction={notes.isError ? () => void notes.refetch() : () => router.push("/notes/edit")} />}
        renderItem={({ item }) => (
          <ReanimatedSwipeable renderRightActions={() => (
            <PressableScale accessibilityLabel={`Delete ${item.title}`} haptic="medium" onPress={() => remove(item)} style={[styles.deleteAction, { backgroundColor: colors.error }]}>
              <MaterialIcons color="#FFFFFF" name="delete" size={24} />
            </PressableScale>
          )}>
            <PressableScale accessibilityLabel={`Edit note ${item.title}`} haptic="none" onPress={() => router.push({ pathname: "/notes/edit", params: { id: item.id } })} style={styles.cardPressable}>
              <KairosCard style={styles.noteCard}>
                <View style={[styles.noteIcon, { backgroundColor: `${colors.primary}20` }]}>
                  <MaterialIcons color={colors.primary} name="sticky-note-2" size={22} />
                </View>
                <Text numberOfLines={2} style={[styles.noteTitle, { color: colors.foreground }]}>{item.title}</Text>
                <Text numberOfLines={4} style={[styles.preview, { color: colors.muted }]}>{item.content || "No content"}</Text>
                <View style={styles.tags}>
                  {item.tags.slice(0, 2).map((tag) => <Text key={tag} style={[styles.tag, { color: colors.primary }]}>#{tag}</Text>)}
                </View>
                <Text style={[styles.date, { color: colors.tertiary }]}>{formatShortDate(item.updated_at)}</Text>
              </KairosCard>
            </PressableScale>
          </ReanimatedSwipeable>
        )}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  headerWrap: { paddingHorizontal: 20, paddingTop: 10 },
  list: { padding: 16, paddingBottom: 36 },
  emptyList: { flexGrow: 1 },
  row: { gap: 10 },
  cardPressable: { flex: 1, marginBottom: 10 },
  noteCard: { minHeight: 198, flex: 1, gap: 9 },
  noteIcon: { width: 40, height: 40, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  noteTitle: { fontSize: 17, lineHeight: 22, fontWeight: "800" },
  preview: { flex: 1, fontSize: 13, lineHeight: 19 },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  tag: { fontSize: 11, lineHeight: 15, fontWeight: "700" },
  date: { fontSize: 11, lineHeight: 15 },
  deleteAction: { width: 70, marginBottom: 10, alignItems: "center", justifyContent: "center", borderTopRightRadius: 16, borderBottomRightRadius: 16 },
});
