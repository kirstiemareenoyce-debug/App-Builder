import { Asset } from "expo-asset";
import { decodeFromBase64 } from "pdf-lib";
import { createSummaryExport, type SafeSummary, type SummaryExportFile, type SummaryExportFormat } from "./aevum-summary";

async function loadExportFont(): Promise<Uint8Array> {
  const asset = Asset.fromModule(require("../assets/fonts/DejaVuSans.ttf"));
  const response = await fetch(asset.uri);
  if (!response.ok) throw new Error("The PDF font could not be loaded. Please try again or export as text.");
  return new Uint8Array(await response.arrayBuffer());
}

export function downloadSummaryFile(file: SummaryExportFile): void {
  const bytes = file.encoding === "base64" ? decodeFromBase64(file.content) : file.content;
  const blob = new Blob([typeof bytes === "string" ? bytes : new Uint8Array(bytes).buffer], { type: file.mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.filename;
  try {
    document.body.appendChild(link);
    link.click();
  } finally {
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}

export async function exportSafeSummary(input: SafeSummary, format: SummaryExportFormat): Promise<void> {
  if (typeof document === "undefined") throw new Error("Exports are available after Kairos opens in your browser.");
  downloadSummaryFile(await createSummaryExport(input, format, loadExportFont));
}
