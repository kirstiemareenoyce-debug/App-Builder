import type { SelectedWorkFile, WorkMime } from "../../types/work";
export const WORK_FILE_BUCKET = "work-files";
export const MAX_WORK_FILE_BYTES = 10 * 1024 * 1024;
export const WORK_FILE_MIMES: readonly WorkMime[] = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
];
const extensions: Record<WorkMime, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};
export function validateSelectedWorkFile(file: SelectedWorkFile): WorkMime {
  if (!file.uri) throw new Error("Choose a file first.");
  const mime = file.mimeType?.toLowerCase();
  if (!WORK_FILE_MIMES.includes(mime as WorkMime))
    throw new Error(
      "Choose JPEG, PNG, WebP or PDF; HEIC and CAD formats are not supported.",
    );
  const ext = file.name.split(".").pop()?.toLowerCase();
  const accepted =
    mime === "image/jpeg" ? ["jpg", "jpeg"] : [extensions[mime as WorkMime]];
  if (ext && !accepted.includes(ext))
    throw new Error("File extension and MIME type must agree.");
  if (
    file.size != null &&
    (!Number.isInteger(file.size) ||
      file.size < 1 ||
      file.size > MAX_WORK_FILE_BYTES)
  )
    throw new Error("Work files must be non-empty and 10 MiB or smaller.");
  return mime as WorkMime;
}
/** Magic bytes are checked as well as declared MIME; this is not malware scanning. */
export function validateWorkFileBytes(bytes: Uint8Array, mime: WorkMime): void {
  if (bytes.byteLength < 1 || bytes.byteLength > MAX_WORK_FILE_BYTES)
    throw new Error("Work files must be non-empty and 10 MiB or smaller.");
  const matches = (signature: number[], offset = 0) =>
    signature.every((v, i) => bytes[offset + i] === v);
  const valid =
    mime === "image/jpeg"
      ? matches([255, 216, 255])
      : mime === "image/png"
        ? matches([137, 80, 78, 71, 13, 10, 26, 10])
        : mime === "image/webp"
          ? matches([82, 73, 70, 70]) && matches([87, 69, 66, 80], 8)
          : matches([37, 80, 68, 70, 45]);
  if (!valid)
    throw new Error(
      "The selected file content does not match its supported format.",
    );
}
export function workObjectPath(
  owner: string,
  uuid: string,
  mime: WorkMime,
): string {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      owner,
    ) ||
    !/^[0-9a-f-]{36}$/i.test(uuid)
  )
    throw new Error("Invalid Work owner or object identifier.");
  return `${owner}/${uuid}.${extensions[mime]}`;
}
export function isOwnedWorkPath(path: string, owner: string): boolean {
  return (
    path.startsWith(`${owner}/`) &&
    /^[0-9a-f-]{36}\/(?:[0-9a-f-]{36})\.(jpg|png|webp|pdf)$/i.test(path)
  );
}
