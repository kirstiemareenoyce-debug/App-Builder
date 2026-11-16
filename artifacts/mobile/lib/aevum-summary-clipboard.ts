import * as Clipboard from "expo-clipboard";
import { buildSummaryClipboardText, type SafeSummary } from "./aevum-summary";

export async function copySafeSummary(input: SafeSummary): Promise<void> {
  const text = buildSummaryClipboardText(input);
  try {
    const copied = await Clipboard.setStringAsync(text, { inputFormat: Clipboard.StringFormat.PLAIN_TEXT });
    if (!copied) throw new Error("Clipboard write failed.");
  } catch {
    throw new Error("Could not copy the summary. Try again, select the summary text to copy manually, or export it as a text file.");
  }
}
