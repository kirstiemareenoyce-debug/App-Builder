import { strict as assert } from "node:assert";
import { createCompletionRunner } from "./ai-provider.ts";
import { buildProviderRequest } from "./provider-request.ts";
import { createKimiQuotaManager, classifyKimiFailure, type KimiQuotaSnapshot } from "./kimi-quota.ts";
import { HttpError } from "./errors.ts";
import { getProviderOrder, runWithProviderFallback } from "./provider-order.ts";

// The SDK also checks optional environment settings internally. Keep those
// lookups offline and secret-free, just like the injected provider config.
Deno.env.get = () => undefined;

function balance(value: number) {
  return new Response(JSON.stringify({ code: 0, status: true, data: { available_balance: value } }));
}
function reply(text = "Offline transport fixture", finishReason = "stop") {
  return new Response(JSON.stringify({
    id: "test", object: "chat.completion", created: 0, model: "test-model",
    choices: [{ index: 0, message: { role: "assistant", content: text }, finish_reason: finishReason }],
  }), { headers: { "content-type": "application/json" } });
}
function env(name: string) {
  return name === "AI_PRIMARY_PROVIDER" ? "kimi"
    : name === "KIMI_API_KEY" || name === "OPENAI_API_KEY" ? "offline-test-key" : undefined;
}

Deno.test("Kimi and OpenAI requests use documented model-specific parameters", () => {
  const kimi = buildProviderRequest("kimi", "system", "message");
  const openai = buildProviderRequest("openai", "system", "message");
  assert.equal(kimi.model, "kimi-k3");
  assert.ok("reasoning_effort" in kimi && kimi.reasoning_effort === "low");
  assert.ok("max_tokens" in kimi && kimi.max_tokens === 2048);
  assert.equal("thinking" in kimi, false);
  assert.equal("temperature" in kimi, false);
  assert.equal(openai.model, "gpt-5.4-mini");
  assert.ok("max_completion_tokens" in openai && openai.max_completion_tokens === 600);
  assert.equal("max_tokens" in openai, false);
  assert.equal(buildProviderRequest("openai", "s", "u", { openai: "configured-model" }).model, "configured-model");
});
Deno.test("provider order and fallback attempt each provider at most once", async () => {
  assert.deepEqual(getProviderOrder(" kimi "), ["kimi", "openai"]);
  const attempts: string[] = [];
  const result = await runWithProviderFallback(["kimi", "openai"], (p) => {
    attempts.push(p);
    return p === "kimi" ? Promise.reject(new Error("failure")) : Promise.resolve("fallback");
  });
  assert.equal(result.fallbackUsed, true);
  assert.deepEqual(attempts, ["kimi", "openai"]);
  await assert.rejects(() => runWithProviderFallback(["kimi", "openai"],
    () => Promise.reject(new Error("unavailable"))), AggregateError);
});
Deno.test("positive balance is cached; balances and credentials are not exposed", async () => {
  let reads = 0;
  const manager = createKimiQuotaManager({ fetcher: () => { reads++; return Promise.resolve(balance(12)); } });
  const decision = await manager.evaluate("offline-test-key", 1000);
  assert.equal(decision.shouldAttempt, true);
  assert.equal((await manager.evaluate("offline-test-key", 2000)).cached, true);
  assert.equal(reads, 1);
  assert.equal(JSON.stringify(decision).includes("offline-test-key"), false);
  assert.equal("available_balance" in decision, false);
});
Deno.test("zero balance creates shared cooldown that survives a new manager", async () => {
  let stored: KimiQuotaSnapshot | null = null;
  let reads = 0;
  const stateStore = {
    load: () => Promise.resolve(stored),
    save: (s: KimiQuotaSnapshot) => { stored = s; return Promise.resolve(); },
  };
  const fetcher: typeof fetch = () => { reads++; return Promise.resolve(balance(0)); };
  const first = createKimiQuotaManager({ fetcher, stateStore });
  assert.equal((await first.evaluate("offline-test-key", 1000)).shouldAttempt, false);
  const second = createKimiQuotaManager({ fetcher, stateStore });
  const decision = await second.evaluate("offline-test-key", 2000);
  assert.equal(decision.shouldAttempt, false);
  assert.equal(decision.source, "shared");
  assert.equal(reads, 1);
  assert.equal((await second.evaluate("offline-test-key", 902000)).source, "live");
});
Deno.test("unknown balance does not falsely disable Kimi", async () => {
  const manager = createKimiQuotaManager({ fetcher: () => Promise.reject(new Error("unreachable")) });
  const result = await manager.evaluate("offline-test-key", 1000);
  assert.equal(result.shouldAttempt, true);
  assert.equal(result.reason, "balance_unavailable");
});
Deno.test("Kimi failure classification and bounded backoff clear after success", async () => {
  assert.equal(classifyKimiFailure({ status: 429, message: "rate limit" }), "rate_limited");
  assert.equal(classifyKimiFailure({ status: 429, message: "insufficient quota" }), "completion_quota_exhausted");
  assert.equal(classifyKimiFailure({ status: 401 }), "authentication_failed");
  const manager = createKimiQuotaManager({ fetcher: () => Promise.resolve(balance(10)) });
  const first = await manager.recordFailure({ status: 429 }, 1000);
  const second = await manager.recordFailure({ status: 429 }, 2000);
  assert.ok(second.cooldownRemainingSeconds > first.cooldownRemainingSeconds);
  for (let i = 0; i < 25; i++) await manager.recordFailure({ status: 503 }, 3000);
  assert.equal((await manager.recordFailure({ status: 503 }, 3000)).cooldownRemainingSeconds, 300);
  await manager.recordSuccess(4000);
  assert.equal((await manager.evaluate("offline-test-key", 5000)).shouldAttempt, true);
});
Deno.test("zero-credit Kimi is skipped and SDK sends exactly one OpenAI request", async () => {
  const requests: { url: string; body: Record<string, unknown> }[] = [];
  const runner = createCompletionRunner({
    getEnv: env, onFailure: () => {},
    quotaManager: createKimiQuotaManager({ fetcher: () => Promise.resolve(balance(0)) }),
    fetcher: async (input, init) => {
      requests.push({ url: String(input), body: JSON.parse(String(init?.body)) });
      return reply();
    },
  });
  const result = await runner("private system", "private message", "request-test");
  assert.equal(result.provider, "openai");
  assert.equal(result.fallbackUsed, true);
  assert.equal(result.fallbackReason, "kimi_balance_exhausted");
  assert.equal(requests.length, 1);
  assert.ok(requests[0].url.startsWith("https://api.openai.com/"));
  assert.equal(requests[0].body.max_completion_tokens, 600);
});
Deno.test("successful Kimi never contacts OpenAI and only returns final answer", async () => {
  const urls: string[] = [];
  const runner = createCompletionRunner({
    getEnv: env, onFailure: () => {},
    quotaManager: createKimiQuotaManager({ fetcher: () => Promise.resolve(balance(10)) }),
    fetcher: (input) => { urls.push(String(input)); return Promise.resolve(reply()); },
  });
  const result = await runner("system", "message", "request-test");
  assert.equal(result.provider, "kimi");
  assert.equal(result.fallbackUsed, false);
  assert.equal(urls.length, 1);
  assert.ok(urls[0].startsWith("https://api.moonshot.ai/"));
});
Deno.test("truncated Kimi response triggers just one fallback", async () => {
  let attempts = 0;
  const runner = createCompletionRunner({
    getEnv: env, onFailure: () => {},
    quotaManager: createKimiQuotaManager({ fetcher: () => Promise.resolve(balance(10)) }),
    fetcher: () => { attempts++; return Promise.resolve(attempts === 1 ? reply("partial", "length") : reply()); },
  });
  assert.equal((await runner("system", "message", "request-test")).provider, "openai");
  assert.equal(attempts, 2);
});
Deno.test("provider failures have no SDK retries and never expose provider error text", async () => {
  let attempts = 0;
  const logs: unknown[] = [];
  const runner = createCompletionRunner({
    getEnv: env, onFailure: (m) => logs.push(m),
    quotaManager: createKimiQuotaManager({ fetcher: () => Promise.resolve(balance(10)) }),
    fetcher: () => {
      attempts++;
      return Promise.resolve(new Response(JSON.stringify({ error: { message: "private-provider-detail" } }), {
        status: 500, headers: { "content-type": "application/json" },
      }));
    },
  });
  await assert.rejects(() => runner("system", "message", "request-test"),
    (error) => error instanceof HttpError && error.code === "AI_UNAVAILABLE" && !error.message.includes("private-provider-detail"));
  assert.equal(attempts, 2);
  assert.equal(JSON.stringify(logs).includes("private-provider-detail"), false);
  assert.equal(JSON.stringify(logs).includes("offline-test-key"), false);
});
