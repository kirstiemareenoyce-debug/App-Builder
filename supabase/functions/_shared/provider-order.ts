export type AIProviderName = "openai" | "kimi";

export function getProviderOrder(primary: string | undefined | null): [AIProviderName, AIProviderName] {
  return primary?.trim().toLowerCase() === "kimi" ? ["kimi", "openai"] : ["openai", "kimi"];
}

export interface ProviderAttempt<T> {
  provider: AIProviderName;
  value: T;
  fallbackUsed: boolean;
}

export async function runWithProviderFallback<T>(
  order: [AIProviderName, AIProviderName],
  run: (provider: AIProviderName) => Promise<T>,
  onFailure?: (provider: AIProviderName, error: unknown) => void,
): Promise<ProviderAttempt<T>> {
  let firstError: unknown;
  try {
    return { provider: order[0], value: await run(order[0]), fallbackUsed: false };
  } catch (error) {
    firstError = error;
    onFailure?.(order[0], error);
  }
  try {
    return { provider: order[1], value: await run(order[1]), fallbackUsed: true };
  } catch (error) {
    onFailure?.(order[1], error);
    throw new AggregateError([firstError, error], "All configured AI providers failed.");
  }
}
