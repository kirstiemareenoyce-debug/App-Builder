import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { assertIntakeCurrent } from "./client-state";
import type { IntakeExportFile, IntakeExportGuard } from "./export-data";
export * from "./export-data";
export async function dispatchIndividualIntakeExport(
  file: IntakeExportFile,
  guard: IntakeExportGuard,
): Promise<void> {
  assertIntakeCurrent(guard.isCurrent);
  await guard.verifyCurrent();
  assertIntakeCurrent(guard.isCurrent);
  if (!(await Sharing.isAvailableAsync()) || !FileSystem.cacheDirectory)
    throw new Error(
      "Sharing is unavailable on this device. No file was shared.",
    );
  assertIntakeCurrent(guard.isCurrent);
  const uri = `${FileSystem.cacheDirectory}${file.filename}`;
  try {
    await FileSystem.writeAsStringAsync(uri, file.content, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    await guard.verifyCurrent();
    assertIntakeCurrent(guard.isCurrent);
    await Sharing.shareAsync(uri, {
      mimeType: file.mimeType,
      dialogTitle: "Export my selected personal intake data",
    });
  } finally {
    await FileSystem.deleteAsync(uri, { idempotent: true }).catch(
      () => undefined,
    );
  }
}
