import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, Platform, ScrollView, StyleSheet, Text } from "react-native";

import { KairosButton } from "@/components/kairos/button";
import { KairosCard } from "@/components/kairos/card";
import { KairosInput } from "@/components/kairos/input";
import { ScreenHeader } from "@/components/kairos/screen-header";
import { StatePanel } from "@/components/kairos/state-panel";
import { ScreenContainer } from "@/components/screen-container";
import { useCreateNote, useDeleteNote, useNote, useUpdateNote } from "@/hooks/use-notes";
import { useColors } from "@/hooks/use-colors";
import { useKairosUI } from "@/providers/kairos-ui-provider";
import { useKairosAuth } from "@/providers/supabase-auth-provider";
import { noteEntrySchema, parseCommaTags } from "@/lib/frontend-validation";

export default function NoteEditScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { user, loading } = useKairosAuth();
  // Remount the form instead of carrying another note/account's unsaved text.
  const accountKey = user && !user.isPreview ? user.id : "anonymous";
  return <NoteEditor key={`${accountKey}:${id ?? "new"}`} id={id} authLoading={loading} />;
}

function NoteEditor({ id, authLoading }: { id?: string; authLoading: boolean }) {
  const router = useRouter();
  const colors = useColors();
  const { showToast } = useKairosUI();
  const note = useNote(id);
  const createNote = useCreateNote();
  const updateNote = useUpdateNote();
  const deleteNote = useDeleteNote();
  const existing = note.data;
  const [title, setTitle] = useState(existing?.title ?? "");
  const [content, setContent] = useState(existing?.content ?? "");
  const [tagsText, setTagsText] = useState(existing?.tags.join(", ") ?? "");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!existing) return;
    setTitle(existing.title);
    setContent(existing.content ?? "");
    setTagsText(existing.tags.join(", "));
  }, [existing]);

  if (id && (authLoading || note.isLoading)) {
    return <ScreenContainer edges={["top", "bottom", "left", "right"]}><StatePanel loading title="Loading note" message="Preparing the editor…" /></ScreenContainer>;
  }

  if (id && (note.isError || !existing)) {
    return (
      <ScreenContainer edges={["top", "bottom", "left", "right"]}>
        <StatePanel
          icon={note.isError ? "error-outline" : "search-off"}
          title={note.isError ? "Note unavailable" : "Note not found"}
          message={note.isError && note.error instanceof Error ? note.error.message : "This note may have been removed or is no longer accessible."}
          actionLabel="Go back"
          onAction={() => router.back()}
        />
      </ScreenContainer>
    );
  }

  const save = async () => {
    const parsed = noteEntrySchema.safeParse({ title, content, tags: parseCommaTags(tagsText) });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the note fields.");
      return;
    }
    try {
      setError(null);
      const payload = { title: parsed.data.title, content: parsed.data.content || null, tags: parsed.data.tags };
      if (existing) await updateNote.mutateAsync({ id: existing.id, updates: payload });
      else await createNote.mutateAsync(payload);
      showToast(existing ? "Note updated." : "Note saved.", "success");
      router.back();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Note could not be saved.");
    }
  };

  const remove = () => {
    if (!existing) return;
    const confirmDelete = async () => {
      try {
        await deleteNote.mutateAsync(existing.id);
        showToast("Note deleted.", "success");
        router.back();
      } catch (deleteError) {
        setError(deleteError instanceof Error ? deleteError.message : "Note could not be deleted.");
      }
    };
    if (Platform.OS === "web") {
      if (globalThis.confirm?.(`Delete “${existing.title}”?`)) void confirmDelete();
      return;
    }
    Alert.alert("Delete note?", "This note will be removed permanently.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => void confirmDelete() },
    ]);
  };

  const saving = createNote.isPending || updateNote.isPending;
  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ScreenHeader showBack title={existing ? "Edit note" : "New note"} subtitle="Keep the context you want Kairos to remember" />
        <KairosCard style={styles.form}>
          <KairosInput label="Title" maxLength={200} onChangeText={setTitle} value={title} />
          <KairosInput label="Content" multiline maxLength={10000} onChangeText={setContent} placeholder="Write freely…" style={styles.editor} value={content} />
          <KairosInput label="Tags" helperText="Comma-separated, up to 10" maxLength={410} onChangeText={setTagsText} value={tagsText} />
          {error ? <Text accessibilityLiveRegion="assertive" style={[styles.error, { color: colors.error }]}>{error}</Text> : null}
          <KairosButton label="Save Note" loading={saving} onPress={() => void save()} />
          {existing ? <KairosButton label="Delete Note" tone="danger" loading={deleteNote.isPending} onPress={remove} /> : null}
          <KairosButton label="Cancel" tone="ghost" disabled={saving} onPress={() => router.back()} />
        </KairosCard>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { gap: 18, padding: 20, paddingBottom: 36 },
  form: { gap: 16 },
  editor: { minHeight: 260 },
  error: { fontSize: 13, lineHeight: 18 },
});
