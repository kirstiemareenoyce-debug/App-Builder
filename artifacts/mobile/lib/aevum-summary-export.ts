import { Asset } from "expo-asset";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { decodeFromBase64 } from "pdf-lib";
import { createSummaryExport, type SafeSummary, type SummaryExportFormat } from "./aevum-summary";

async function loadExportFont(): Promise<Uint8Array> {
  const asset = Asset.fromModule(require("../assets/fonts/DejaVuSans.ttf"));
  await asset.downloadAsync();
  if (!asset.localUri) throw new Error("The PDF font could not be loaded. Please export as text.");
  return decodeFromBase64(await FileSystem.readAsStringAsync(asset.localUri, { encoding: FileSystem.EncodingType.Base64 }));
}

export async function exportSafeSummary(input: SafeSummary, format: SummaryExportFormat): Promise<void> {
  if (!await Sharing.isAvailableAsync()) throw new Error("File sharing is unavailable on this device. Try Kairos in your browser to download the summary.");
  if (!FileSystem.cacheDirectory) throw new Error("The export folder is unavailable on this device.");
  const file = await createSummaryExport(input, format, loadExportFont);
  const uri = `${FileSystem.cacheDirectory}${file.filename}`;
  try {
    await FileSystem.writeAsStringAsync(uri, file.content, {
      encoding: file.encoding === "base64" ? FileSystem.EncodingType.Base64 : FileSystem.EncodingType.UTF8,
    });
    await Sharing.shareAsync(uri, {
      mimeType: format === "pdf" ? "application/pdf" : "text/plain",
      UTI: format === "pdf" ? "com.adobe.pdf" : "public.plain-text",
      dialogTitle: "Save or share your Aevum safe summary",
    });
  } finally {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  }
}
