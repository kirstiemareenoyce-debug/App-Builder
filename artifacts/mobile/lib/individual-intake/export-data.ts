import { parseIntakeState } from "./client";
import { INTAKE_SUITE_VERSION, type IndividualIntakeState } from "./types";
import { getInstrumentDefinition } from "./definitions";

export type IntakeExportFormat = "json" | "text";
export interface IntakeExportSelection {
  attemptIds: string[];
  includeAnswers: boolean;
  includeProfile: boolean;
}
export interface IntakeExportFile {
  filename: string;
  mimeType: string;
  content: string;
}
export interface IntakeExportGuard {
  isCurrent: () => boolean;
  verifyCurrent: () => Promise<void>;
}
export const INTAKE_EXPORT_DISCLAIMER =
  "Personal self-report and reflection only; not a diagnosis, treatment, fitness judgment, or permission to connect with a partner. No AI interpretation or partner access is included.";
export const INTAKE_EXPORT_PRIVACY =
  "Export only what you choose. Downloaded or shared copies leave Kairos controls; withdrawal and deletion cannot erase those copies. There is no automatic clipboard, AI, or partner sharing.";
export function prepareIndividualIntakeExport(
  state: IndividualIntakeState,
  expectedOwner: string,
  selection: IntakeExportSelection,
  format: IntakeExportFormat,
  preview: boolean,
  date = new Date(),
): IntakeExportFile {
  const owned = parseIntakeState(state, expectedOwner);
  if (
    (format !== "json" && format !== "text") ||
    !Number.isFinite(date.getTime()) ||
    !Array.isArray(selection.attemptIds) ||
    typeof selection.includeAnswers !== "boolean" ||
    typeof selection.includeProfile !== "boolean"
  )
    throw new Error("Choose JSON or text and the records you want to export.");
  if (
    selection.attemptIds.some(
      (id) => !owned.attempts.some((a) => a.id === id),
    ) ||
    new Set(selection.attemptIds).size !== selection.attemptIds.length
  )
    throw new Error(
      "Your selected records changed. Review the selection again.",
    );
  if (
    !selection.attemptIds.length &&
    !(selection.includeProfile && owned.profile)
  )
    throw new Error(
      "Select a result, draft, or saved personal profile before exporting.",
    );
  const data = {
    version: INTAKE_SUITE_VERSION,
    exported_at: date.toISOString(),
    session_only_preview: preview,
    disclaimer: INTAKE_EXPORT_DISCLAIMER,
    attempts: owned.attempts
      .filter((a) => selection.attemptIds.includes(a.id))
      .map((a) => {
        const definition = getInstrumentDefinition(a.instrument_id);
        return {
          instrument_id: a.instrument_id,
          instrument_version: a.instrument_version,
          instrument_title: definition.title,
          timeframe: definition.timeframe,
          instructions: definition.instructions,
          attribution: definition.attribution,
          source_urls: [...definition.sourceUrls],
          status: a.status,
          revision: a.revision,
          started_at: a.started_at,
          completed_at: a.completed_at,
          reviewed_at: a.reviewed_at,
          ...(selection.includeAnswers
            ? {
                answers: { ...a.answers },
                response_options: definition.options.map((option) => ({
                  ...option,
                })),
                answered_items: definition.items
                  .filter((item) => a.answers[item.id] !== undefined)
                  .map((item) => ({
                    item_id: item.id,
                    question: item.text,
                    response_value: a.answers[item.id],
                    response_label: definition.options.find(
                      (option) => option.value === a.answers[item.id],
                    )!.label,
                  })),
              }
            : {}),
          result: a.result,
        };
      }),
    ...(selection.includeProfile && owned.profile
      ? {
          self_description: {
            body: { ...owned.profile.body },
            updated_at: owned.profile.updated_at,
            reviewed_at: owned.profile.reviewed_at,
          },
        }
      : {}),
  };
  const json = JSON.stringify(data, null, 2);
  return {
    filename: `kairos-personal-intake-${date.toISOString().replace(/[:.]/g, "-")}.${format === "json" ? "json" : "txt"}`,
    mimeType: format === "json" ? "application/json" : "text/plain",
    content:
      format === "json"
        ? `${json}\n`
        : `KAIROS / PERSONAL INTAKE\n${preview ? "Session-only preview — manually chosen responses\n" : ""}Exported: ${data.exported_at}\n${INTAKE_EXPORT_DISCLAIMER}\n\n${json}\n\n${INTAKE_EXPORT_PRIVACY}\n`,
  };
}
