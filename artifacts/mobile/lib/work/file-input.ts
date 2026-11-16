import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";
import {
  MAX_WORK_FILE_BYTES,
  validateSelectedWorkFile,
  validateWorkFileBytes,
} from "./files";
import type { SelectedWorkFile } from "../../types/work";
function decodeBase64(value: string): Uint8Array {
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const clean = value.replace(/=+$/, "");
  const output = new Uint8Array(Math.floor((clean.length * 6) / 8));
  let buffer = 0,
    bits = 0,
    index = 0;
  for (const char of clean) {
    const digit = alphabet.indexOf(char);
    if (digit < 0) continue;
    buffer = (buffer << 6) | digit;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      output[index++] = (buffer >> bits) & 255;
    }
  }
  return output;
}
export async function readSelectedWorkFile(file: SelectedWorkFile) {
  const mime = validateSelectedWorkFile(file);
  if (!/^(blob:|data:|file:|content:)/.test(file.uri))
    throw new Error("Choose a local file from the device picker.");
  let bytes: Uint8Array;
  if (Platform.OS === "web") {
    const response = await fetch(file.uri);
    if (!response.ok)
      throw new Error("The selected local file could not be read.");
    const blob = await response.blob();
    if (blob.size > MAX_WORK_FILE_BYTES)
      throw new Error("Work files must be 10 MiB or smaller.");
    bytes = new Uint8Array(await blob.arrayBuffer());
  } else {
    const info = await FileSystem.getInfoAsync(file.uri);
    if (
      !info.exists ||
      info.isDirectory ||
      info.size < 1 ||
      info.size > MAX_WORK_FILE_BYTES
    )
      throw new Error(
        "Work files must be readable, non-empty and 10 MiB or smaller.",
      );
    bytes = decodeBase64(
      await FileSystem.readAsStringAsync(file.uri, {
        encoding: FileSystem.EncodingType.Base64,
      }),
    );
  }
  validateWorkFileBytes(bytes, mime);
  return { bytes, mime };
}
