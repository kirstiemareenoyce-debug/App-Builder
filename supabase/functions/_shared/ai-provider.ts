import OpenAI from "npm:openai@5.19.1";
import { HttpError } from "./errors.ts";
import { createKimiQuotaManager, KimiQuotaUnavailableError, type KimiQuotaDecision } from "./kimi-quota.ts";
import { createKimiQuotaStateStore } from "./kimi-quota-store.ts";
import { getProviderOrder, runWithProviderFallback, type AIProviderName } from "./provider-order.ts";
import { buildProviderRequest } from "./provider-request.ts";

export interface EvergreenCompletion {
  text: string;
  logprobs: null;
  provider: AIProviderName;
  fallbackUsed: boolean;
  fallbackReason: string | null;
  kimiQuota: KimiQuotaDecision | null;
}
type QuotaManager = ReturnType<typeof createKimiQuotaManager>;
interface RunnerOptions {
  getEnv?: (name: string) => string | undefined;
  fetcher?: typeof fetch;
  quotaManager?: QuotaManager;
  onFailure?: (metadata: { requestId: string; provider: AIProviderName; code: string }) => void;
}

function safeProviderFailureCode(error: unknown): string {
  if (error instanceof KimiQuotaUnavailableError) return error.decision.reason;
  if (error instanceof OpenAI.APIError) return `http_${error.status ?? "unknown"}`;
  if (error instanceof Error && error.name === "AbortError") return "timeout";
  if (error instanceof HttpError && error.code === "CONFIGURATION_ERROR") return "not_configured";
  return "provider_error";
}

/** Injectable transport and quota store permit fully offline, secret-free tests. */
export function createCompletionRunner(options: RunnerOptions = {}) {
  const getEnv = options.getEnv ?? ((name: string) => Deno.env.get(name));
  const quotaManager = options.quotaManager ?? createKimiQuotaManager({ stateStore: createKimiQuotaStateStore() });
  const onFailure = options.onFailure ?? ((metadata) => console.warn("kairos provider attempt failed", metadata));
  function required(name: string): string {
    const value = getEnv(name)?.trim();
    if (!value) throw new HttpError(500, "CONFIGURATION_ERROR", "A required server configuration is missing.");
    return value;
  }
  async function complete(provider: AIProviderName, system: string, user: string): Promise<string> {
    const client = new OpenAI({
      apiKey: required(provider === "kimi" ? "KIMI_API_KEY" : "OPENAI_API_KEY"),
      ...(provider === "kimi" ? { baseURL: "https://api.moonshot.ai/v1" } : {}),
      ...(options.fetcher ? { fetch: options.fetcher } : {}),
      maxRetries: 0,
      timeout: 20_000,
    });
    const completion = await client.chat.completions.create(buildProviderRequest(provider, system, user, {
      kimi: getEnv("KIMI_MODEL"), openai: getEnv("OPENAI_CHAT_MODEL"),
    }));
    const choice = completion.choices[0];
    const text = choice?.message.content?.trim();
    if (!text || choice.finish_reason !== "stop" || text.length > 20000) {
      throw new Error("Provider returned no complete usable response.");
    }
    return text;
  }
  return async (system: string, user: string, requestId: string): Promise<EvergreenCompletion> => {
    let fallbackReason: string | null = null;
    let kimiQuota: KimiQuotaDecision | null = null;
    try {
      const result = await runWithProviderFallback(getProviderOrder(getEnv("AI_PRIMARY_PROVIDER")),
        async (provider) => {
          if (provider !== "kimi") return complete(provider, system, user);
          kimiQuota = await quotaManager.evaluate(required("KIMI_API_KEY"));
          if (!kimiQuota.shouldAttempt) throw new KimiQuotaUnavailableError(kimiQuota);
          try {
            const text = await complete(provider, system, user);
            kimiQuota = await quotaManager.recordSuccess();
            return text;
          } catch (error) {
            kimiQuota = await quotaManager.recordFailure(error);
            throw error;
          }
        },
        (provider, error) => {
          const code = provider === "kimi" && kimiQuota ? kimiQuota.reason : safeProviderFailureCode(error);
          if (!fallbackReason) fallbackReason = `${provider}_${code}`;
          onFailure({ requestId, provider, code });
        });
      return {
        text: result.value, logprobs: null, provider: result.provider,
        fallbackUsed: result.fallbackUsed,
        fallbackReason: result.fallbackUsed ? fallbackReason : null, kimiQuota,
      };
    } catch {
      throw new HttpError(503, "AI_UNAVAILABLE", "Kairos AI is temporarily unavailable.");
    }
  };
}

// Do not create provider clients, read provider secrets or probe balance during
// module startup, preflight, failed authentication or request validation.
let defaultRunner: ReturnType<typeof createCompletionRunner> | undefined;
export function completeEvergreen(system: string, user: string, requestId: string): Promise<EvergreenCompletion> {
  defaultRunner ??= createCompletionRunner();
  return defaultRunner(system, user, requestId);
}
