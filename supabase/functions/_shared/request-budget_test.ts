import { strict as assert } from "node:assert";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.57.4";
import { assertKairosAIEnabled, reserveKairosAIRequest } from "./request-budget.ts";
import { HttpError } from "./errors.ts";
import { kairosAIErrorMessage } from "../../../artifacts/mobile/lib/kairos-ai-errors.ts";

const valid = { allowed: true, reason: "allowed", used: 1, daily_limit: 20,
  project_used: 1, project_daily_limit: 100, resets_at: "2026-11-17T00:00:00Z" };
Deno.test("missing, malformed, denied, thrown and ambiguous reservation results never allow generation", async () => {
  for (const data of [null, [], [valid, valid], [{}], [{ ...valid, allowed: "true" }],
    [{ ...valid, used: 21 }], [{ ...valid, used: 0 }], [{ ...valid, daily_limit: 0 }],
    [{ ...valid, resets_at: "invalid" }], [{ ...valid, allowed: false }],
    [{ ...valid, reason: "unknown" }], [{ ...valid, project_used: 101 }],
    [{ ...valid, project_used: -1 }], [{ ...valid, project_daily_limit: undefined }],
    [{ ...valid, reason: "user_limit", allowed: false, used: 1 }],
    [{ ...valid, reason: "project_limit", allowed: false }]]) {
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
Deno.test("new reservations require the global contract; emergency check fails closed without retries", async () => {
  for (const data of [null, [], "true", 1, {}, undefined]) {
    await assert.rejects(() => assertKairosAIEnabled({
      rpc: () => Promise.resolve({ data, error: null }),
    } as unknown as SupabaseClient), (e) => e instanceof HttpError && e.code === "DEPENDENCY_ERROR");
  }
  let attempts = 0;
  await assert.rejects(() => assertKairosAIEnabled({
    rpc: () => { attempts++; throw new Error("private database detail"); },
  } as unknown as SupabaseClient), (e) => {
    assert.ok(e instanceof HttpError);
    assert.match(e.message, /earlier provider attempt/);
    assert.doesNotMatch(e.message, /private database detail|has not been sent/);
    return true;
  });
  assert.equal(attempts, 1);
  for (const [data, code] of [[false, "PROJECT_AI_PAUSED"], [true, null]] as const) {
    const call = () => assertKairosAIEnabled({
      rpc: () => Promise.resolve({ data, error: null }),
    } as unknown as SupabaseClient);
    if (code) await assert.rejects(call, (e) => e instanceof HttpError && e.code === code);
    else await call();
  }
});
Deno.test("global pause and exhaustion have distinct safe messages and no aggregate counts", async () => {
  for (const [reason, code] of [["paused", "PROJECT_AI_PAUSED"], ["project_limit", "PROJECT_AI_LIMIT_REACHED"]] as const) {
    await assert.rejects(() => reserveKairosAIRequest({
      rpc: () => Promise.resolve({ data: [{ ...valid, allowed: false, reason, used: 0,
        project_used: 100 }], error: null }),
    } as unknown as SupabaseClient, "owner"), (e) => {
      assert.ok(e instanceof HttpError);
      assert.equal(e.code, code);
      assert.match(e.message, /draft is still here/);
      assert.doesNotMatch(JSON.stringify(e.details ?? {}), /project_used|project_daily_limit/);
      return true;
    });
  }
});
Deno.test("budget rejection has safe mobile copy, while other safe errors are preserved", () => {
  const message = kairosAIErrorMessage({ code: "DAILY_AI_LIMIT_REACHED", message: "old wording" });
  assert.match(message, /daily Kairos AI limit/);
  assert.match(message, /00:00 UTC/);
  assert.match(message, /draft is still here/);
  assert.match(message, /not sent to an AI provider/);
  assert.equal(kairosAIErrorMessage({ code: "DEPENDENCY_ERROR", message: "Safe setup error" }), "Safe setup error");
});
