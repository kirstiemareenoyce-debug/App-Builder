import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";

function safeFilePart(value: string) {
  return value.replace(/[^a-zA-Z0-9-]/g, "").slice(0, 24) || "brief";
}

export async function exportSourceBrief(markdown: string, taskId: string, format: "markdown" | "text" = "markdown"): Promise<void> {
  if (!markdown.trim()) throw new Error("There is no completed brief to export.");
  if (!Sharing.isAvailableAsync || !FileSystem.cacheDirectory) throw new Error("File sharing is unavailable on this device.");
  if (!await Sharing.isAvailableAsync()) throw new Error("File sharing is unavailable on this device. Open the app in a browser to download the Markdown file.");
  const uri = `${FileSystem.cacheDirectory}kairos-source-brief-${safeFilePart(taskId)}.${format === "markdown" ? "md" : "txt"}`;
  try {
    await FileSystem.writeAsStringAsync(uri, markdown, { encoding: FileSystem.EncodingType.UTF8 });
    await Sharing.shareAsync(uri, { mimeType: format === "markdown" ? "text/markdown" : "text/plain", UTI: format === "markdown" ? "net.daringfireball.markdown" : "public.plain-text", dialogTitle: "Save or share your private source brief" });
  } finally {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  }
}
