import { strict as assert } from "node:assert";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.57.4";
import { reserveKairosAIRequest } from "./request-budget.ts";
import { HttpError } from "./errors.ts";
import { kairosAIErrorMessage } from "../../../artifacts/mobile/lib/kairos-ai-errors.ts";

const valid = { allowed: true, used: 1, daily_limit: 20, resets_at: "2026-11-17T00:00:00Z" };
Deno.test("missing, malformed, denied, thrown and ambiguous reservation results never allow generation", async () => {
  for (const data of [null, [], [valid, valid], [{}], [{ ...valid, allowed: "true" }],
    [{ ...valid, used: 21 }], [{ ...valid, used: 0 }], [{ ...valid, daily_limit: 0 }],
    [{ ...valid, resets_at: "invalid" }], [{ ...valid, allowed: false }]]) {
    await assert.rejects(() => reserveKairosAIRequest({
      rpc: () => Promise.resolve({ data, error: null }),
    } as unknown as SupabaseClient, "owner"),
    (e: unknown) => e instanceof HttpError && e.status === 503);
  }
  let attempts = 0;
  await assert.rejects(() => reserveKairosAIRequest({
    rpc: () => { attempts++; throw new Error("secret internal detail"); },
  } as unknown as SupabaseClient, "owner"), /could not check/);
  assert.equal(attempts, 1);
});
Deno.test("budget rejection has safe mobile copy, while other safe errors are preserved", () => {
  const message = kairosAIErrorMessage({ code: "DAILY_AI_LIMIT_REACHED", message: "old wording" });
  assert.match(message, /daily Kairos AI limit/);
  assert.match(message, /00:00 UTC/);
  assert.match(message, /draft is still here/);
  assert.match(message, /not sent to an AI provider/);
  assert.equal(kairosAIErrorMessage({ code: "DEPENDENCY_ERROR", message: "Safe setup error" }), "Safe setup error");
});
