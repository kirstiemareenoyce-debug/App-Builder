import { Platform, Share } from "react-native";
import * as Clipboard from "expo-clipboard";
import { relationshipShareText, type RelationshipEntry } from "./relationship-hub";

function selectedText(entry: RelationshipEntry) {
  return `${entry.id.startsWith("preview-") ? "PREVIEW DRAFT — session-only, not a live shared entry.\n\n" : ""}${relationshipShareText(entry)}`;
}
export async function copyRelationshipEntry(entry: RelationshipEntry): Promise<void> {
  const text = selectedText(entry);
  try {
    if (Platform.OS === "web") {
      if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(text);
    } else if (!await Clipboard.setStringAsync(text, { inputFormat: Clipboard.StringFormat.PLAIN_TEXT })) throw new Error("Copy failed");
  } catch { throw new Error("Could not copy. Open Kairos directly in a secure browser tab or select the entry text to copy manually."); }
}
export async function shareRelationshipEntry(entry: RelationshipEntry): Promise<"shared" | "cancelled" | "copied"> {
  const text = selectedText(entry);
  if (Platform.OS === "web") {
    const browser = typeof navigator !== "undefined" ? navigator as Navigator & { share?: (data: { title: string; text: string }) => Promise<void> } : null;
    if (!browser?.share) { await copyRelationshipEntry(entry); return "copied"; }
    try { await browser.share({ title: entry.title, text }); return "shared"; }
    catch (error) { if ((error as { name?: string }).name === "AbortError") return "cancelled"; throw new Error("Sharing could not open. Try copying the entry instead."); }
  }
  try {
    const r = await Share.share({ title: entry.title, message: text });
    return r.action === Share.dismissedAction ? "cancelled" : "shared";
  } catch { throw new Error("Sharing could not open. Try copying the entry instead."); }
}
