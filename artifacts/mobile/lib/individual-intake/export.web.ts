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
  if (
    typeof document === "undefined" ||
    typeof URL.createObjectURL !== "function"
  )
    throw new Error(
      "Downloads are not available in this browser. No export was dispatched.",
    );
  const url = URL.createObjectURL(
    new Blob([file.content], { type: `${file.mimeType};charset=utf-8` }),
  );
  const link = document.createElement("a");
  try {
    link.href = url;
    link.download = file.filename;
    document.body.appendChild(link);
    assertIntakeCurrent(guard.isCurrent);
    link.click();
  } finally {
    link.remove();
    URL.revokeObjectURL(url);
  }
}
