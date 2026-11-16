import gad7 from "./definitions/gad7.json";
import asrs6 from "./definitions/asrs6.json";
import ipip50 from "./definitions/ipip50.json";
import type { InstrumentDefinition } from "./types";

/** Freeze every nested item, option and scoring key so versioned math cannot drift. */
function freezeDefinition<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const nested of Object.values(value)) freezeDefinition(nested);
    Object.freeze(value);
  }
  return value;
}

// JSON imports widen literal discriminants; the golden-source tests verify the
// complete inventory, versions, option values and keys independently of scoring.
export const INSTRUMENT_DEFINITIONS: readonly InstrumentDefinition[] =
  Object.freeze([
    freezeDefinition(gad7 as InstrumentDefinition),
    freezeDefinition(asrs6 as InstrumentDefinition),
    freezeDefinition(ipip50 as InstrumentDefinition),
  ]);

export function getInstrumentDefinition(id: string): InstrumentDefinition {
  const definition = INSTRUMENT_DEFINITIONS.find(
    (candidate) => candidate.id === id,
  );
  if (!definition) throw new Error(`Unknown intake instrument: ${String(id)}`);
  return definition;
}
