import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import * as Linking from "expo-linking";
import { useEffect, useState } from "react";
import { Image, Modal, Platform, View } from "react-native";
import { KairosButton } from "../../../../components/kairos/button";
import { KairosCard } from "../../../../components/kairos/card";
import { useColors } from "../../../../hooks/use-colors";
import {
  useWorkFiles,
  useUploadWorkFile,
  useOpenWorkFile,
  useDeleteWorkFile,
} from "../../../../hooks/use-work-files";
import { useWorkTasks } from "../../../../hooks/use-work-tasks";
import { useWorkSession } from "../../../../lib/work/session";
import {
  WORK_FILE_MIMES,
  validateSelectedWorkFile,
} from "../../../../lib/work/files";
import { readSelectedWorkFile } from "../../../../lib/work/file-input";
import {
  WorkPage,
  WorkText,
  WorkField,
  ConfirmWorkDelete,
  workStyles,
} from "../../../../lib/work/ui";
import { workError } from "../../../../lib/work/validation";
import type { SelectedWorkFile, WorkFileInput } from "../../../../types/work";
const empty = (): WorkFileInput => ({
  title: "",
  job_label: "",
  notes: "",
  task_id: null,
  event_id: null,
});
export default function WorkPhotosScreen() {
  const scope = useWorkSession();
  return <Files key={scope.identity} />;
}
function Files() {
  const colors = useColors(),
    scope = useWorkSession(),
    query = useWorkFiles(),
    tasks = useWorkTasks();
  const upload = useUploadWorkFile(),
    openFile = useOpenWorkFile(),
    remove = useDeleteWorkFile();
  const [selected, setSelected] = useState<SelectedWorkFile | null>(null),
    [form, setForm] = useState(empty),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [viewing, setViewing] = useState<{ uri: string; name: string } | null>(
      null,
    ),
    [choosing, setChoosing] = useState(false);
  const change = <K extends keyof WorkFileInput>(
    key: K,
    value: WorkFileInput[K],
  ) => setForm((f) => ({ ...f, [key]: value }));
  // Never leave a signed image displayed beyond its 60-second lifetime.
  useEffect(() => {
    if (!viewing || scope.user?.isPreview) return;
    const timer = setTimeout(() => setViewing(null), 55000);
    return () => clearTimeout(timer);
  }, [viewing, scope.user?.isPreview]);
  const choose = async (source: "document" | "library" | "camera") => {
    const guard = scope.capture();
    setChoosing(true);
    setError("");
    try {
      let file: SelectedWorkFile;
      if (source === "document") {
        const result = await DocumentPicker.getDocumentAsync({
          type: [...WORK_FILE_MIMES],
          copyToCacheDirectory: true,
          multiple: false,
        });
        guard.assert();
        if (result.canceled) return;
        const asset = result.assets[0];
        file = {
          uri: asset.uri,
          name: asset.name,
          mimeType: asset.mimeType ?? null,
          size: asset.size ?? null,
        };
      } else {
        const permission =
          source === "camera"
            ? await ImagePicker.requestCameraPermissionsAsync()
            : await ImagePicker.requestMediaLibraryPermissionsAsync();
        guard.assert();
        if (!permission.granted)
          throw new Error("Allow device access to select a Work photo.");
        const options = {
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 1,
          allowsEditing: false,
        };
        const result =
          source === "camera"
            ? await ImagePicker.launchCameraAsync(options)
            : await ImagePicker.launchImageLibraryAsync(options);
        guard.assert();
        if (result.canceled) return;
        const asset = result.assets[0];
        const mimeType = asset.mimeType ?? null;
        file = {
          uri: asset.uri,
          name:
            asset.fileName ??
            `work-photo.${mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg"}`,
          mimeType,
          size: asset.fileSize ?? null,
        };
      }
      validateSelectedWorkFile(file);
      const checked = await readSelectedWorkFile(file);
      guard.assert();
      setSelected({ ...file, size: checked.bytes.byteLength });
    } catch (e) {
      if (guard.current()) setError(workError(e));
    } finally {
      if (guard.current()) setChoosing(false);
    }
  };
  const save = async () => {
    const guard = scope.capture();
    setError("");
    try {
      if (!selected) throw new Error("Choose a local photo or PDF first.");
      await upload.mutateAsync({ selected, input: form });
      guard.assert();
      setSelected(null);
      setForm(empty());
      setNotice(
        guard.preview
          ? "File selection saved locally for this session only — not uploaded."
          : "Work file uploaded privately. No relationship sharing or AI indexing.",
      );
    } catch (e) {
      if (guard.current()) setError(workError(e));
    }
  };
  const open = async (id: string) => {
    const guard = scope.capture();
    setError("");
    try {
      const result = await openFile.open(id);
      guard.assert();
      if (result.file.mime_type.startsWith("image/"))
        setViewing({
          uri: result.url,
          name: result.file.title || result.file.original_name,
        });
      else {
        // Web preview blob URLs are opened by an explicit second click so popup blockers do not hide a successful read.
        if (Platform.OS === "web") {
          setNotice(
            "PDF ready. Use Open ready PDF below; private cloud links expire after 60 seconds.",
          );
          setReadyPDF(result.url);
        } else {
          await Linking.openURL(result.url);
          guard.assert();
        }
      }
    } catch (e) {
      if (guard.current()) setError(workError(e));
    }
  };
  const [readyPDF, setReadyPDF] = useState<string | null>(null);
  useEffect(() => {
    if (!readyPDF) return;
    const timer = setTimeout(() => setReadyPDF(null), 55000);
    return () => clearTimeout(timer);
  }, [readyPDF]);
  const deleteFile = async (id: string) => {
    const guard = scope.capture();
    setError("");
    try {
      await remove.mutateAsync(id);
      guard.assert();
      setViewing(null);
      setReadyPDF(null);
      setNotice("Work file removed.");
    } catch (e) {
      if (guard.current()) setError(workError(e));
    }
  };
  return (
    <WorkPage
      title="Photos & drafts"
      subtitle="Work job photos and PDF drawings. Not relationship memories."
    >
      <KairosCard style={workStyles.card}>
        <WorkText title>Add a Work file</WorkText>
        <WorkText>
          JPEG, PNG, WebP or PDF · up to 10 MiB. No HEIC, SVG, DWG/DXF/CAD
          viewer, conversion, OCR or malware scanning. Image location metadata
          is not automatically stripped.
        </WorkText>
        <View style={workStyles.row}>
          <KairosButton
            label="Choose photo / PDF"
            icon="attach-file"
            tone="secondary"
            disabled={
              !scope.user || scope.loading || choosing || upload.isPending
            }
            onPress={() => void choose("document")}
          />
          <KairosButton
            label="Photo library"
            icon="photo-library"
            tone="secondary"
            disabled={
              !scope.user || scope.loading || choosing || upload.isPending
            }
            onPress={() => void choose("library")}
          />
          <KairosButton
            label="Take job photo"
            icon="photo-camera"
            tone="secondary"
            disabled={
              Platform.OS === "web" ||
              !scope.user ||
              scope.loading ||
              choosing ||
              upload.isPending
            }
            onPress={() => void choose("camera")}
          />
        </View>
        {selected ? (
          <View style={{ gap: 8 }}>
            {selected.mimeType?.startsWith("image/") ? (
              <Image
                source={{ uri: selected.uri }}
                style={{ width: "100%", height: 180, borderRadius: 12 }}
                resizeMode="contain"
                accessibilityLabel="Selected local Work photo"
              />
            ) : null}
            <WorkText>
              {selected.name} · {Math.ceil((selected.size ?? 0) / 1024)} KiB ·
              selected locally
            </WorkText>
            <KairosButton
              label="Clear selection"
              tone="ghost"
              disabled={upload.isPending}
              onPress={() => setSelected(null)}
            />
          </View>
        ) : null}
        <WorkField
          label="Title (optional)"
          value={form.title}
          onChange={(v) => change("title", v)}
        />
        <WorkField
          label="Job label (optional)"
          value={form.job_label}
          maxLength={120}
          onChange={(v) => change("job_label", v)}
        />
        <WorkField
          label="Notes (optional)"
          value={form.notes}
          maxLength={2000}
          multiline
          onChange={(v) => change("notes", v)}
        />
        <WorkText>Link to your own Work task (optional)</WorkText>
        <View style={workStyles.row}>
          <KairosButton
            label="No task link"
            compact
            tone={!form.task_id ? "primary" : "secondary"}
            onPress={() => change("task_id", null)}
          />
          {(tasks.data ?? []).map((task) => (
            <KairosButton
              key={task.id}
              label={task.title}
              compact
              tone={form.task_id === task.id ? "primary" : "secondary"}
              onPress={() => change("task_id", task.id)}
            />
          ))}
        </View>
        {error ? <WorkText error>{error}</WorkText> : null}
        <KairosButton
          label={
            scope.user?.isPreview
              ? "Keep selection in preview"
              : "Upload Work file"
          }
          icon="cloud-upload"
          loading={upload.isPending}
          disabled={!selected || choosing || !scope.user || scope.loading}
          onPress={() => void save()}
        />
      </KairosCard>
      {notice ? <WorkText>{notice}</WorkText> : null}
      {readyPDF ? (
        <KairosButton
          label="Open ready PDF"
          tone="secondary"
          onPress={() => {
            if (Platform.OS === "web" && typeof window !== "undefined")
              window.open(readyPDF, "_blank", "noopener,noreferrer");
          }}
        />
      ) : null}
      <WorkText title>Your Work library</WorkText>
      {!scope.user?.isPreview && query.isLoading ? (
        <WorkText>Loading private file metadata…</WorkText>
      ) : null}
      {!scope.user?.isPreview && query.error ? (
        <>
          <WorkText error>{workError(query.error)}</WorkText>
          <KairosButton
            label="Retry loading"
            tone="secondary"
            onPress={() => void query.refetch()}
          />
        </>
      ) : null}
      {(query.data ?? []).map((file) => (
        <KairosCard key={file.id} style={workStyles.card}>
          <View style={workStyles.row}>
            {"preview_uri" in file &&
            typeof file.preview_uri === "string" &&
            file.mime_type.startsWith("image/") ? (
              <Image
                source={{ uri: file.preview_uri }}
                style={{ width: 64, height: 64, borderRadius: 10 }}
                accessibilityLabel={`Local Work photo ${file.title || file.original_name}`}
              />
            ) : (
              <MaterialIcons
                name={
                  file.mime_type === "application/pdf"
                    ? "picture-as-pdf"
                    : "image"
                }
                size={34}
                color={colors.primary}
              />
            )}
            <View style={{ flex: 1 }}>
              <WorkText title>{file.title || file.original_name}</WorkText>
              <WorkText>
                {file.original_name} · {Math.ceil(file.size_bytes / 1024)} KiB
                {file.job_label ? ` · ${file.job_label}` : ""}
              </WorkText>
            </View>
          </View>
          {file.notes ? <WorkText>{file.notes}</WorkText> : null}
          {file.task_id ? (
            <WorkText>Linked to a Work task in this account.</WorkText>
          ) : null}
          <View style={workStyles.row}>
            <KairosButton
              label="Open file"
              icon="open-in-new"
              compact
              tone="secondary"
              disabled={openFile.isPending}
              onPress={() => void open(file.id)}
            />
            <ConfirmWorkDelete
              label="Remove file"
              description="Remove this Work file from private storage and its metadata? This cannot be undone. If cleanup fails, an honest retry message is shown."
              disabled={remove.isPending}
              onConfirm={() => void deleteFile(file.id)}
            />
          </View>
        </KairosCard>
      ))}
      {!query.data?.length && (!query.isLoading || scope.user?.isPreview) ? (
        <WorkText>
          No Work files yet. Only files you choose appear here.
        </WorkText>
      ) : null}
      <WorkText>
        Showing up to 300 most recent cloud files. Signed cloud opens last 60
        seconds. Once opened or copied outside Kairos, a file cannot be remotely
        erased. Do not upload confidential job/customer material without
        permission.
      </WorkText>
      <Modal
        visible={Boolean(viewing)}
        animationType="slide"
        onRequestClose={() => setViewing(null)}
      >
        <View
          style={{
            flex: 1,
            padding: 24,
            paddingTop: 48,
            gap: 16,
            backgroundColor: colors.background,
          }}
        >
          <WorkText title>{viewing?.name}</WorkText>
          {viewing ? (
            <Image
              source={{ uri: viewing.uri }}
              style={{ flex: 1 }}
              resizeMode="contain"
              accessibilityLabel={viewing.name}
            />
          ) : null}
          <KairosButton label="Close file" onPress={() => setViewing(null)} />
        </View>
      </Modal>
    </WorkPage>
  );
}
