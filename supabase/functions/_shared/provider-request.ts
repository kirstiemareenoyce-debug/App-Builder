import type { AIProviderName } from "./provider-order.ts";

export const DEFAULT_KIMI_MODEL = "kimi-k3";
export const DEFAULT_OPENAI_MODEL = "gpt-5.4-mini";

/** K3 always reasons; do not send its unsupported thinking/temperature fields.
 * GPT-5.4 mini defaults to no reasoning and uses max_completion_tokens.
 * Limits bound each attempt; a fallback can incur a second provider charge.
 */
export function buildProviderRequest(
  provider: AIProviderName,
  system: string,
  user: string,
  models: { kimi?: string; openai?: string } = {},
) {
  const common = {
    stream: false as const,
    messages: [{ role: "system" as const, content: system }, { role: "user" as const, content: user }],
  };
  return provider === "kimi"
    ? { ...common, model: models.kimi || DEFAULT_KIMI_MODEL, max_tokens: 2048, reasoning_effort: "low" as const }
    : { ...common, model: models.openai || DEFAULT_OPENAI_MODEL, max_completion_tokens: 600 };
}
