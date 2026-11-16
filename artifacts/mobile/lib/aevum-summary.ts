import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";

export type SafeSummary = {
  summary: string;
  generatedAt: string;
  isSample?: boolean;
};
export type SummaryExportFormat = "pdf" | "text";
export type SummaryExportFile = {
  filename: string;
  mimeType: string;
  encoding: "utf8" | "base64";
  content: string;
};

export const SUMMARY_EXPORT_PRIVACY = "This file may contain personal information. Exported copies are outside Kairos privacy controls and cannot be revoked by disconnecting a partner or deleting your account. Share only with someone you trust.";
export const SUMMARY_EXPORT_BOUNDARY = "Relationship education and reflection only. Not a diagnosis, therapy, or emergency care.";

/** Pick only allowed fields, even if a caller supplies a full API/session object. */
export function prepareSafeSummary(input: SafeSummary): SafeSummary {
  const summary = typeof input.summary === "string" ? input.summary.replace(/\r\n?/g, "\n").trim() : "";
  if (!summary) throw new Error("Generate a coaching summary before exporting.");
  if (summary.length > 50_000) throw new Error("This summary is too large to export. Try a shorter coaching response.");
  const date = new Date(input.generatedAt);
  if (!Number.isFinite(date.getTime())) throw new Error("The summary date is invalid. Generate a new response.");
  return { summary, generatedAt: date.toISOString(), isSample: input.isSample === true };
}

export function buildSummaryClipboardText(input: SafeSummary, copiedAt: Date = new Date()): string {
  const data = prepareSafeSummary(input);
  if (!Number.isFinite(copiedAt.getTime())) throw new Error("The copy date is invalid. Try copying the summary again.");
  const utcTimestamp = `${copiedAt.toISOString()} UTC`;
  let timestamp = utcTimestamp;
  try {
    const localTimestamp = new Intl.DateTimeFormat(undefined, {
      year: "numeric", month: "long", day: "numeric",
      hour: "numeric", minute: "2-digit", second: "2-digit", timeZoneName: "short",
    }).format(copiedAt);
    timestamp = `${localTimestamp} (${utcTimestamp})`;
  } catch {
    // Keep copy usable and unambiguous if local date/time formatting is unavailable.
  }
  const summary = data.isSample
    ? `PREVIEW SAMPLE — Not personalised advice or a real coaching session.\n\n${data.summary}`
    : data.summary;
  return `Copied: ${timestamp}\n\n${summary}`;
}

export function buildSafeSummaryText(input: SafeSummary): string {
  const data = prepareSafeSummary(input);
  return [
    "KAIROS / AEVUM", "COACHING SAFE SUMMARY", "",
    ...(data.isSample ? ["PREVIEW SAMPLE — Not personalised advice or a real coaching session.", ""] : []),
    `Generated: ${data.generatedAt} (UTC)`, "", data.summary, "",
    SUMMARY_EXPORT_BOUNDARY, "", "Privacy notice", SUMMARY_EXPORT_PRIVACY, "",
    "Includes only the displayed coaching summary. Original prompts, raw assessment answers, structured context, and account/session identifiers are not included.", "",
  ].join("\n");
}

export function summaryFilename(input: SafeSummary, format: SummaryExportFormat) {
  const data = prepareSafeSummary(input);
  return `aevum-${data.isSample ? "sample-" : ""}safe-summary-${data.generatedAt.replace(/[:.]/g, "-")}.${format === "pdf" ? "pdf" : "txt"}`;
}

/** Measure and split long tokens as well as normal paragraphs without losing text. */
export function wrapSummaryText(text: string, measure: (value: string) => number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    if (!paragraph.trim()) { lines.push(""); continue; }
    let line = "";
    for (const word of paragraph.trim().split(/\s+/)) {
      const candidate = line ? `${line} ${word}` : word;
      if (measure(candidate) <= maxWidth) { line = candidate; continue; }
      if (line) { lines.push(line); line = ""; }
      for (const character of word) {
        if (line && measure(line + character) > maxWidth) { lines.push(line); line = ""; }
        line += character;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

export async function buildSafeSummaryPdf(input: SafeSummary, fontBytes: Uint8Array): Promise<string> {
  const data = prepareSafeSummary(input);
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(fontBytes, { subset: true });
  const content = buildSafeSummaryText(data);
  const supported = new Set(font.getCharacterSet());
  if (Array.from(content).some((character) => character !== "\n" && character !== "\t" && !supported.has(character.codePointAt(0)!))) {
    throw new Error("This summary contains characters the PDF font cannot display. Export as text to keep every character.");
  }
  doc.setTitle("Aevum coaching safe summary");
  doc.setAuthor("Kairos");
  doc.setCreator("Kairos local export (pdf-lib)");
  doc.setCreationDate(new Date(data.generatedAt));
  doc.setModificationDate(new Date(data.generatedAt));
  const width = 595.28, height = 841.89, margin = 48, size = 11, lineHeight = 17;
  const measurements = new Map<string, number>();
  const measure = (value: string) => {
    let measured = measurements.get(value);
    if (measured === undefined) {
      measured = font.widthOfTextAtSize(value, size);
      measurements.set(value, measured);
    }
    return measured;
  };
  const lines = wrapSummaryText(content, measure, width - margin * 2);
  const linesPerPage = Math.floor((height - 150) / lineHeight);
  const pageCount = Math.ceil(lines.length / linesPerPage);
  for (let offset = 0; offset < lines.length; offset += linesPerPage) {
    const page = doc.addPage([width, height]);
    page.drawText("AEVUM / COACHING SAFE SUMMARY", { x: margin, y: height - 36, size: 10, font, color: rgb(0.08, 0.35, 0.3) });
    page.drawLine({ start: { x: margin, y: height - 48 }, end: { x: width - margin, y: height - 48 }, thickness: 1, color: rgb(0.8, 0.85, 0.83) });
    lines.slice(offset, offset + linesPerPage).forEach((line, index) => {
      if (line) page.drawText(line, { x: margin, y: height - 74 - index * lineHeight, size, font, color: rgb(0.12, 0.14, 0.16) });
    });
    page.drawText(`Private export | ${offset / linesPerPage + 1} / ${pageCount}`, { x: margin, y: 32, size: 9, font, color: rgb(0.4, 0.43, 0.44) });
  }
  return doc.saveAsBase64();
}

export async function createSummaryExport(input: SafeSummary, format: SummaryExportFormat, loadFont: () => Promise<Uint8Array>): Promise<SummaryExportFile> {
  const data = prepareSafeSummary(input);
  if (format === "text") return { filename: summaryFilename(data, format), mimeType: "text/plain;charset=utf-8", encoding: "utf8", content: buildSafeSummaryText(data) };
  if (format !== "pdf") throw new Error("Choose PDF or text for the export.");
  return { filename: summaryFilename(data, format), mimeType: "application/pdf", encoding: "base64", content: await buildSafeSummaryPdf(data, await loadFont()) };
}
