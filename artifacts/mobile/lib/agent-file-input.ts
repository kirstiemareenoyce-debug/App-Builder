const MAX_FILE_BYTES = 200 * 1024;
const MAX_OUTPUT_CHARS = 12_000;

const FILE_TYPES = {
  txt: "text/plain;charset=utf-8",
  md: "text/markdown;charset=utf-8",
  csv: "text/csv;charset=utf-8",
  json: "application/json;charset=utf-8",
  html: "text/html;charset=utf-8",
  htm: "text/html;charset=utf-8",
  xml: "application/xml;charset=utf-8",
  log: "text/plain;charset=utf-8",
} as const;

type SupportedExtension = keyof typeof FILE_TYPES;

export type AgentFileMetadata = {
  filename: string;
  extension: SupportedExtension;
  contentType: (typeof FILE_TYPES)[SupportedExtension];
  byteLength: number;
  truncated: boolean;
};

export type AgentFileInputResult =
  | { ok: true; text: string; metadata: AgentFileMetadata }
  | { ok: false; error: string };

function extensionFor(filename: string): SupportedExtension | undefined {
  const basename = filename.trim().split(/[\\/]/).pop() ?? "";
  const dot = basename.lastIndexOf(".");
  if (dot <= 0 || dot === basename.length - 1) return undefined;
  const extension = basename.slice(dot + 1).toLowerCase() as SupportedExtension;
  return extension in FILE_TYPES ? extension : undefined;
}

function decodeUtf8(bytes: Uint8Array): string | undefined {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\uFEFF/, "");
  } catch {
    return undefined;
  }
}

function hasBinaryControls(text: string): boolean {
  return Array.from(text).some((character) => {
    const code = character.codePointAt(0) ?? 0;
    return (code >= 0 && code <= 8) || code === 11 || code === 12 || (code >= 14 && code <= 31) || code === 127;
  });
}

function decodeEntities(text: string): string {
  const named: Record<string, string> = {
    amp: "&", apos: "'", gt: ">", nbsp: " ", quot: '"', lt: "<",
  };
  return text.replace(/&(#(?:x[\da-f]+|\d+)|[a-z][\da-z]+);/gi, (whole, entity: string) => {
    if (entity.startsWith("#x")) {
      const value = Number.parseInt(entity.slice(2), 16);
      return Number.isFinite(value) ? String.fromCodePoint(Math.min(value, 0x10ffff)) : whole;
    }
    if (entity.startsWith("#")) {
      const value = Number.parseInt(entity.slice(1), 10);
      return Number.isFinite(value) ? String.fromCodePoint(Math.min(value, 0x10ffff)) : whole;
    }
    return named[entity.toLowerCase()] ?? whole;
  });
}

function renderMarkup(source: string): string {
  return decodeEntities(
    source
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/<\s*(script|style)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
      .replace(/<\s*\/?\s*(br|p|div|section|article|header|footer|h[1-6]|li|tr|table|ul|ol)\b[^>]*>/gi, "\n")
      .replace(/<[^>]*>/g, "")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n[ \t]+/g, "\n")
      .replace(/\n{2,}/g, "\n"),
  ).replace(/\r\n?/g, "\n").trim();
}

function parseCsvRow(line: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') { cell += '"'; index += 1; }
      else quoted = !quoted;
    } else if (character === "," && !quoted) {
      cells.push(cell.trim()); cell = "";
    } else cell += character;
  }
  cells.push(cell.trim());
  return cells;
}

function renderCsv(source: string): string {
  return source.split("\n").map((line) => parseCsvRow(line).join(" | ")).join("\n").trim();
}

function renderJson(source: string): string | undefined {
  try {
    return JSON.stringify(JSON.parse(source), null, 2);
  } catch {
    return undefined;
  }
}

function limitOutput(text: string): { text: string; truncated: boolean } {
  const characters = Array.from(text);
  return characters.length > MAX_OUTPUT_CHARS
    ? { text: characters.slice(0, MAX_OUTPUT_CHARS).join(""), truncated: true }
    : { text, truncated: false };
}

/** Extract bounded local UTF-8 text for an agent request; this function never performs I/O or persistence. */
export function extractAgentFileInput(filename: string, bytes: Uint8Array): AgentFileInputResult {
  if (typeof filename !== "string" || !filename.trim()) return { ok: false, error: "A filename is required." };
  if (!(bytes instanceof Uint8Array)) return { ok: false, error: "File bytes are invalid." };
  if (bytes.byteLength > MAX_FILE_BYTES) return { ok: false, error: "This file is too large. Choose a file no larger than 200 KiB." };

  const extension = extensionFor(filename);
  if (!extension) return { ok: false, error: "This file type is not supported. Choose a text, Markdown, CSV, JSON, HTML, XML, or log file." };

  const decoded = decodeUtf8(bytes);
  if (decoded === undefined) return { ok: false, error: "This file is not valid UTF-8 text." };
  if (hasBinaryControls(decoded)) return { ok: false, error: "This file appears to contain binary content." };

  const normalized = decoded.replace(/\r\n?/g, "\n");
  let text = normalized;
  if (extension === "csv") text = renderCsv(normalized);
  else if (extension === "json") {
    const rendered = renderJson(normalized);
    if (rendered === undefined) return { ok: false, error: "This JSON file is not valid." };
    text = rendered;
  } else if (extension === "html" || extension === "htm" || extension === "xml") text = renderMarkup(normalized);
  const limited = limitOutput(text);

  return {
    ok: true,
    text: limited.text,
    metadata: {
      filename: filename.trim().split(/[\\/]/).pop() ?? filename.trim(),
      extension,
      contentType: FILE_TYPES[extension],
      byteLength: bytes.byteLength,
      truncated: limited.truncated,
    },
  };
}

export { MAX_FILE_BYTES, MAX_OUTPUT_CHARS };
