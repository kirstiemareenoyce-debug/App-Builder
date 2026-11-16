// Restored from the supplied backend: no balance values are persisted or exposed.
export type KimiQuotaState = "available" | "exhausted" | "unknown" | "cooldown";
export type KimiQuotaSource = "live" | "cache" | "cooldown" | "shared";
export type KimiQuotaReason =
  | "balance_available" | "balance_exhausted" | "balance_unavailable"
  | "completion_quota_exhausted" | "rate_limited" | "authentication_failed"
  | "provider_unavailable" | "cooldown_active" | "completion_succeeded";

export interface KimiQuotaDecision {
  shouldAttempt: boolean;
  state: KimiQuotaState;
  source: KimiQuotaSource;
  reason: KimiQuotaReason;
  cached: boolean;
  cooldownRemainingSeconds: number;
}
export interface KimiQuotaSnapshot {
  state: Exclude<KimiQuotaState, "cooldown">;
  reason: KimiQuotaReason;
  checkedAt: number;
  cooldownUntil: number;
  transientFailures: number;
}
export interface KimiQuotaStateStore {
  load(): Promise<KimiQuotaSnapshot | null>;
  save(snapshot: KimiQuotaSnapshot): Promise<void>;
}
export interface KimiQuotaManagerOptions {
  fetcher?: typeof fetch;
  stateStore?: KimiQuotaStateStore;
  stateStoreTimeoutMs?: number;
  balanceTimeoutMs?: number;
  cacheTtlMs?: number;
  quotaCooldownMs?: number;
  transientCooldownBaseMs?: number;
  transientCooldownMaxMs?: number;
}
interface KimiErrorLike {
  status?: number;
  code?: string;
  type?: string;
  message?: string;
  error?: { code?: string; type?: string; message?: string };
}

const BALANCE_URL = "https://api.moonshot.ai/v1/users/me/balance";
function bounded(value: number | undefined, fallback: number, minimum: number, maximum: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(minimum, Math.min(value as number, maximum));
}
function remainingSeconds(cooldownUntil: number, now: number) {
  return Math.max(0, Math.ceil((cooldownUntil - now) / 1_000));
}
export function classifyKimiFailure(error: unknown): KimiQuotaReason {
  const candidate: KimiErrorLike = error && typeof error === "object"
    ? error as KimiErrorLike : { message: String(error ?? "") };
  const text = [
    candidate.code, candidate.type, candidate.message,
    candidate.error?.code, candidate.error?.type, candidate.error?.message,
  ].filter(Boolean).join(" ").toLowerCase();
  if (candidate.status === 401 || candidate.status === 403 || text.includes("authentication")) {
    return "authentication_failed";
  }
  if (text.includes("exceeded_current_quota") || text.includes("insufficient quota") || text.includes("insufficient balance")) {
    return "completion_quota_exhausted";
  }
  if (candidate.status === 429 || text.includes("rate_limit") || text.includes("rate limit") || text.includes("engine_overloaded")) {
    return "rate_limited";
  }
  return "provider_unavailable";
}
export class KimiQuotaUnavailableError extends Error {
  constructor(readonly decision: KimiQuotaDecision) {
    super("Kimi is unavailable under the current quota policy.");
    this.name = "KimiQuotaUnavailableError";
  }
}

export function createKimiQuotaManager(options: KimiQuotaManagerOptions = {}) {
  const fetcher = options.fetcher ?? fetch;
  const stateStore = options.stateStore;
  const stateStoreTimeoutMs = bounded(options.stateStoreTimeoutMs, 750, 100, 2_000);
  const balanceTimeoutMs = bounded(options.balanceTimeoutMs, 1_500, 250, 5_000);
  const cacheTtlMs = bounded(options.cacheTtlMs, 60_000, 1_000, 15 * 60_000);
  const quotaCooldownMs = bounded(options.quotaCooldownMs, 15 * 60_000, 60_000, 24 * 60 * 60_000);
  const transientCooldownBaseMs = bounded(options.transientCooldownBaseMs, 30_000, 1_000, 60_000);
  const transientCooldownMaxMs = bounded(options.transientCooldownMaxMs, 5 * 60_000, transientCooldownBaseMs, 15 * 60_000);
  let cached: KimiQuotaSnapshot | null = null;

  async function boundedStoreOperation<T>(operation: Promise<T>): Promise<T> {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        operation,
        new Promise<T>((_, reject) => {
          timeout = setTimeout(() => reject(new Error("Kimi quota state store timed out.")), stateStoreTimeoutMs);
        }),
      ]);
    } finally {
      if (timeout !== undefined) clearTimeout(timeout);
    }
  }
  async function persistCachedState() {
    if (!stateStore || !cached) return;
    try {
      await boundedStoreOperation(stateStore.save({ ...cached }));
    } catch {
      // Shared state is an optimisation; its failure must not disable fallback.
    }
  }
  function decisionFromCache(now: number): KimiQuotaDecision | null {
    if (!cached) return null;
    if (cached.cooldownUntil > now) {
      return {
        shouldAttempt: false, state: "cooldown", source: "cooldown",
        reason: cached.reason === "balance_available" ? "cooldown_active" : cached.reason,
        cached: true, cooldownRemainingSeconds: remainingSeconds(cached.cooldownUntil, now),
      };
    }
    if (now - cached.checkedAt >= cacheTtlMs) return null;
    return {
      shouldAttempt: cached.state !== "exhausted", state: cached.state, source: "cache",
      reason: cached.reason, cached: true, cooldownRemainingSeconds: 0,
    };
  }
  async function evaluate(apiKey: string, now = Date.now()): Promise<KimiQuotaDecision> {
    const cachedDecision = decisionFromCache(now);
    if (cachedDecision) return cachedDecision;
    if (stateStore) {
      try {
        const shared = await boundedStoreOperation(stateStore.load());
        if (shared) {
          cached = shared;
          const sharedDecision = decisionFromCache(now);
          if (sharedDecision) return { ...sharedDecision, source: "shared", cached: true };
        }
      } catch {
        // Query the advisory balance endpoint if shared state cannot be read.
      }
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), balanceTimeoutMs);
    try {
      const response = await fetcher(BALANCE_URL, {
        method: "GET", headers: { Authorization: `Bearer ${apiKey}` }, signal: controller.signal,
      });
      const payload = await response.json().catch(() => null) as {
        code?: number; status?: boolean; data?: { available_balance?: number };
      } | null;
      const availableBalance = payload?.data?.available_balance;
      if (response.ok && payload?.code === 0 && payload.status === true && Number.isFinite(availableBalance)) {
        const exhausted = (availableBalance as number) <= 0;
        cached = {
          state: exhausted ? "exhausted" : "available",
          reason: exhausted ? "balance_exhausted" : "balance_available",
          checkedAt: now, cooldownUntil: exhausted ? now + quotaCooldownMs : 0, transientFailures: 0,
        };
        await persistCachedState();
        return {
          shouldAttempt: !exhausted, state: cached.state, source: "live", reason: cached.reason,
          cached: false, cooldownRemainingSeconds: remainingSeconds(cached.cooldownUntil, now),
        };
      }
      if (response.status === 401 || response.status === 403 || response.status === 429) {
        const authFailure = response.status !== 429;
        const failures = authFailure ? 0 : Math.min(20, (cached?.transientFailures ?? 0) + 1);
        const cooldownMs = authFailure ? quotaCooldownMs : Math.min(
          transientCooldownBaseMs * (2 ** Math.max(0, failures - 1)), transientCooldownMaxMs,
        );
        cached = {
          state: "unknown", reason: authFailure ? "authentication_failed" : "rate_limited",
          checkedAt: now, cooldownUntil: now + cooldownMs, transientFailures: failures,
        };
        await persistCachedState();
        return {
          shouldAttempt: false, state: "cooldown", source: "live", reason: cached.reason,
          cached: false, cooldownRemainingSeconds: remainingSeconds(cached.cooldownUntil, now),
        };
      }
    } catch {
      // An unknown balance does not prove exhaustion; try a bounded completion.
    } finally {
      clearTimeout(timeout);
    }
    cached = {
      state: "unknown", reason: "balance_unavailable", checkedAt: now,
      cooldownUntil: 0, transientFailures: cached?.transientFailures ?? 0,
    };
    await persistCachedState();
    return {
      shouldAttempt: true, state: "unknown", source: "live",
      reason: "balance_unavailable", cached: false, cooldownRemainingSeconds: 0,
    };
  }
  async function recordFailure(error: unknown, now = Date.now()): Promise<KimiQuotaDecision> {
    const reason = classifyKimiFailure(error);
    if (reason === "completion_quota_exhausted") {
      cached = {
        state: "exhausted", reason, checkedAt: now, cooldownUntil: now + quotaCooldownMs, transientFailures: 0,
      };
    } else {
      const failures = Math.min(20, (cached?.transientFailures ?? 0) + 1);
      const cooldownMs = reason === "authentication_failed" ? quotaCooldownMs : Math.min(
        transientCooldownBaseMs * (2 ** Math.max(0, failures - 1)), transientCooldownMaxMs,
      );
      cached = { state: "unknown", reason, checkedAt: now, cooldownUntil: now + cooldownMs, transientFailures: failures };
    }
    await persistCachedState();
    return {
      shouldAttempt: false, state: cached.state === "exhausted" ? "exhausted" : "cooldown",
      source: "cooldown", reason, cached: false, cooldownRemainingSeconds: remainingSeconds(cached.cooldownUntil, now),
    };
  }
  async function recordSuccess(now = Date.now()): Promise<KimiQuotaDecision> {
    cached = {
      state: "available", reason: "completion_succeeded", checkedAt: now, cooldownUntil: 0, transientFailures: 0,
    };
    await persistCachedState();
    return {
      shouldAttempt: true, state: "available", source: "cache", reason: "completion_succeeded",
      cached: true, cooldownRemainingSeconds: 0,
    };
  }
  return { evaluate, recordFailure, recordSuccess };
}
