import { getInstrumentDefinition } from "./definitions";
import type { InstrumentDefinition, IntakeAnswers, IntakeScore } from "./types";

/** Accept only the approved, immutable version; do not score altered client keys. */
function approvedDefinition(
  definition: InstrumentDefinition,
): InstrumentDefinition {
  if (!definition || typeof definition !== "object") {
    throw new Error("An approved intake instrument definition is required");
  }
  const approved = getInstrumentDefinition(definition.id);
  if (
    definition !== approved &&
    JSON.stringify(definition) !== JSON.stringify(approved)
  ) {
    throw new Error(
      "Instrument definition does not match the approved version",
    );
  }
  return approved;
}

/**
 * Parse a JSON-like answer snapshot without coercing values or filling omissions.
 * Omitted items are valid ONLY in drafts. Explicit null/undefined is never missing.
 */
export function validateIntakeAnswers(
  definition: InstrumentDefinition,
  answers: unknown,
  requireComplete = false,
): IntakeAnswers {
  const approved = approvedDefinition(definition);
  if (
    answers === null ||
    typeof answers !== "object" ||
    Array.isArray(answers)
  ) {
    throw new Error(
      "Answers must be an object of item IDs and integer response values",
    );
  }
  const prototype: unknown = Object.getPrototypeOf(answers);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error("Answers must be a plain object");
  }

  const itemIds = new Set(approved.items.map((item) => item.id));
  const optionValues = new Set(approved.options.map((option) => option.value));
  const parsed: IntakeAnswers = {};
  for (const key of Reflect.ownKeys(answers)) {
    if (typeof key !== "string" || !itemIds.has(key)) {
      throw new Error(`Unknown answer item: ${String(key)}`);
    }
    const descriptor = Object.getOwnPropertyDescriptor(answers, key);
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
      throw new Error(`Answer ${key} must be an enumerable data value`);
    }
    const value: unknown = descriptor.value;
    if (
      typeof value !== "number" ||
      !Number.isInteger(value) ||
      !optionValues.has(value)
    ) {
      throw new Error(
        `Invalid response for ${key}: expected an allowed integer response value`,
      );
    }
    parsed[key] = value;
  }
  if (requireComplete) {
    const missing = approved.items.filter(
      (item) => !Object.hasOwn(parsed, item.id),
    );
    if (missing.length > 0) {
      throw new Error(
        `Missing required answers: ${missing.map((item) => item.id).join(", ")}`,
      );
    }
  }
  return parsed;
}

export function getAnswerProgress(
  definition: InstrumentDefinition,
  answers: unknown,
): { answered: number; total: number; complete: boolean } {
  const approved = approvedDefinition(definition);
  const parsed = validateIntakeAnswers(approved, answers);
  const answered = Object.keys(parsed).length;
  const total = approved.items.length;
  return { answered, total, complete: answered === total };
}

/** Source-keyed scoring only. Completion is not diagnosis, fitness or consent. */
export function scoreIntake(
  definition: InstrumentDefinition,
  answers: unknown,
): IntakeScore {
  const approved = approvedDefinition(definition);
  const parsed = validateIntakeAnswers(approved, answers, true);
  const scoring = approved.scoring;

  switch (scoring.kind) {
    case "gad7-sum": {
      const rawScore = approved.items.reduce(
        (sum, item) => sum + parsed[item.id],
        0,
      );
      const band = scoring.bands.find(
        (candidate) => rawScore >= candidate.min && rawScore <= candidate.max,
      );
      if (!band)
        throw new Error("GAD-7 score is outside the approved scoring bands");
      return {
        kind: scoring.kind,
        scoringVersion: scoring.version,
        rawScore,
        maximum: 21,
        band: band.label,
        explanation: approved.resultNote,
      };
    }
    case "asrs6-count": {
      const thresholdCount = approved.items.filter(
        (item) => parsed[item.id] >= scoring.thresholds[item.id],
      ).length;
      return {
        kind: scoring.kind,
        scoringVersion: scoring.version,
        thresholdCount,
        screenPositive: thresholdCount >= scoring.positiveCount,
        explanation: approved.resultNote,
      };
    }
    case "ipip50-keyed": {
      const traits = scoring.scales.map((scale) => {
        const positive = scale.positiveItemIds.reduce(
          (sum, id) => sum + parsed[id],
          0,
        );
        const negative = scale.negativeItemIds.reduce(
          (sum, id) => sum + (6 - parsed[id]),
          0,
        );
        const score = positive + negative;
        return {
          id: scale.id,
          title: scale.title,
          score,
          minimum: 10,
          maximum: 50,
          mean: score / 10,
        };
      });
      return {
        kind: scoring.kind,
        scoringVersion: scoring.version,
        traits,
        explanation: approved.resultNote,
      };
    }
    default:
      throw new Error("Unsupported intake scoring algorithm");
  }
}
