import { strict as assert } from "node:assert";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.57.4";
import { HttpError } from "../_shared/errors.ts";
import { handleKairosQuery, type KairosQueryDependencies } from "./handler.ts";
import { buildKairosUserPrompt, kairosQuerySchema, KAIROS_SYSTEM_PROMPT } from "./prompt.ts";

// No real environment, secrets, network, provider calls or database writes.
Deno.env.get = (name) => name === "ALLOWED_ORIGINS" ? "https://kairos.example" : undefined;
const valid = { query: "What can overwhelm feel like?", mode: "learning", ai_use_consent: true, storage_consent: true };
function request(body: unknown = valid, extra: RequestInit = {}) {
  return new Request("http://localhost/kairos-query", {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer mock-token" },
    body: JSON.stringify(body), ...extra,
  });
}
function fixture(options: { authError?: boolean; dependencyError?: boolean; saveError?: boolean; providerError?: boolean } = {}) {
  const calls: { operation: string; values: unknown[] }[] = [];
  const probe = {
    select: (columns: string) => { calls.push({ operation: "probe-select", values: [columns] }); return probe; },
    eq: (column: string, value: string) => { calls.push({ operation: "probe-eq", values: [column, value] }); return probe; },
    limit: (limit: number) => { calls.push({ operation: "probe-limit", values: [limit] }); return Promise.resolve({ error: options.dependencyError ? new Error("not installed") : null, data: [] }); },
  };
  const save = {
    insert: (row: unknown) => { calls.push({ operation: "insert", values: [row] }); return save; },
    select: () => save,
    single: () => Promise.resolve({
      error: options.saveError ? new Error("storage unavailable") : null,
      data: options.saveError ? null : { id: "11111111-1111-4111-8111-111111111111" },
    }),
  };
  const deps: KairosQueryDependencies = {
    authenticate: () => {
      calls.push({ operation: "authenticate", values: [] });
      if (options.authError) return Promise.reject(new HttpError(401, "AUTH_REQUIRED", "Sign in."));
      return Promise.resolve({
        user: { id: "owner-from-token" },
        userClient: { from: (table: string) => { calls.push({ operation: "probe-table", values: [table] }); return probe; } } as unknown as SupabaseClient,
      });
    },
    complete: (system, message) => {
      calls.push({ operation: "complete", values: [system, message] });
      if (options.providerError) return Promise.reject(new HttpError(503, "AI_UNAVAILABLE", "Unavailable"));
      return Promise.resolve({ text: "Offline test fixture, never a live UI reply.", provider: "openai" });
    },
    serviceClient: () => ({
      from: (table: string) => { calls.push({ operation: "save-table", values: [table] }); return save; },
    }) as unknown as SupabaseClient,
  };
  return { calls, deps };
}
Deno.test("authentication fails before any history lookup or provider call", async () => {
  const { calls, deps } = fixture({ authError: true });
  assert.equal((await handleKairosQuery(request(), deps)).status, 401);
  assert.deepEqual(calls.map((call) => call.operation), ["authenticate"]);
});
Deno.test("separate consents, supported mode and no injected owner or private context", async () => {
  for (const body of [
    { ...valid, ai_use_consent: false }, { ...valid, storage_consent: false },
    { ...valid, user_id: "other-owner" }, { ...valid, partner_id: "partner" },
    { ...valid, context: { assessments: ["private"] } }, { ...valid, mode: "diagnosis" },
    { ...valid, query: " " }, { ...valid, query: "a".repeat(2001) },
  ]) {
    const { calls, deps } = fixture();
    assert.equal((await handleKairosQuery(request(body), deps)).status, 400);
    assert.deepEqual(calls.map((call) => call.operation), ["authenticate"]);
  }
});
Deno.test("missing private-history dependency prevents paid generation", async () => {
  const { calls, deps } = fixture({ dependencyError: true });
  assert.equal((await handleKairosQuery(request(), deps)).status, 503);
  assert.equal(calls.some((call) => call.operation === "complete"), false);
  assert.deepEqual(calls.find((call) => call.operation === "probe-eq")?.values, ["user_id", "owner-from-token"]);
  assert.deepEqual(calls.find((call) => call.operation === "probe-limit")?.values, [1]);
});
Deno.test("success uses current message only and saves token owner plus consent versions", async () => {
  const { calls, deps } = fixture();
  const response = await handleKairosQuery(request(), deps);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(calls.filter((call) => call.operation.endsWith("-table")).map((call) => call.values[0]),
    ["kairos_ai_interactions", "kairos_ai_interactions"]);
  assert.deepEqual(JSON.parse(String(calls.find((call) => call.operation === "complete")?.values[1])),
    { mode: "learning", current_message: valid.query });
  const row = calls.find((call) => call.operation === "insert")?.values[0] as Record<string, unknown>;
  assert.equal(row.user_id, "owner-from-token");
  assert.equal(row.ai_use_consent_version, "kairos-ai-use-v1");
  assert.equal(row.storage_consent_version, "kairos-private-history-v1");
  const body = await response.json();
  assert.equal(body.success, true);
  assert.equal(body.data.interaction_id, "11111111-1111-4111-8111-111111111111");
});
Deno.test("failed providers never insert or simulate a successful reply", async () => {
  const { calls, deps } = fixture({ providerError: true });
  const response = await handleKairosQuery(request(), deps);
  assert.equal(response.status, 503);
  assert.equal(calls.some((call) => call.operation === "insert"), false);
  const body = await response.json();
  assert.equal(body.success, false);
  assert.match(body.error.message, /No simulated response/);
});
Deno.test("storage failure admits generation happened and retry could charge again", async () => {
  const { deps } = fixture({ saveError: true });
  const response = await handleKairosQuery(request(), deps);
  assert.equal(response.status, 502);
  const body = await response.json();
  assert.equal(body.success, false);
  assert.match(body.error.message, /provider processed/);
  assert.match(body.error.message, /retrying sends it again/);
});
Deno.test("browser preflight and disallowed origins never authenticate or generate", async () => {
  for (const method of ["OPTIONS", "POST"]) {
    const { calls, deps } = fixture();
    const response = await handleKairosQuery(new Request("http://localhost/kairos-query", {
      method, headers: { origin: "https://untrusted.example" },
    }), deps);
    assert.equal(response.status, 403);
    assert.equal(response.headers.has("Access-Control-Allow-Origin"), false);
    assert.equal(calls.length, 0);
  }
  const { calls, deps } = fixture();
  const response = await handleKairosQuery(new Request("http://localhost/kairos-query", {
    method: "OPTIONS", headers: { origin: "https://kairos.example" },
  }), deps);
  assert.equal(response.status, 204);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), "https://kairos.example");
  assert.equal(calls.length, 0);
});
Deno.test("unsupported methods and oversized bodies cannot generate", async () => {
  const { calls, deps } = fixture();
  assert.equal((await handleKairosQuery(new Request("http://localhost", { method: "GET" }), deps)).status, 405);
  assert.equal(calls.length, 0);
  const response = await handleKairosQuery(request(valid, {
    headers: { "Content-Type": "application/json", "Content-Length": "12001" },
  }), deps);
  assert.equal(response.status, 413);
  assert.equal(calls.some((call) => call.operation === "complete"), false);
});
Deno.test("non-clinical, consent and individual safety prompt boundaries are preserved", () => {
  for (const text of ["self-reports", "No mind-reading", "changing medication", "exposure therapy, ERP",
    "Never pressure partner disclosure", "coercion", "local emergency",
    "Never administer, invent or score clinical questionnaires", "not a clinician"]) {
    assert.ok(KAIROS_SYSTEM_PROMPT.includes(text));
  }
  assert.equal(JSON.parse(buildKairosUserPrompt(kairosQuerySchema.parse({ ...valid, mode: "reflection" }))).mode, "reflection");
});
