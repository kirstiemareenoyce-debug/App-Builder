import type { KimiQuotaSnapshot, KimiQuotaStateStore } from "./kimi-quota.ts";
import { createServiceClient } from "./supabase.ts";

interface RuntimeStateRow {
  quota_state: KimiQuotaSnapshot["state"];
  reason: KimiQuotaSnapshot["reason"];
  cooldown_until: string | null;
  checked_at: string;
  transient_failures: number;
}
export function createKimiQuotaStateStore(): KimiQuotaStateStore {
  const client = createServiceClient();
  return {
    async load() {
      const { data, error } = await client.from("ai_provider_runtime_state")
        .select("quota_state,reason,cooldown_until,checked_at,transient_failures")
        .eq("provider", "kimi").maybeSingle<RuntimeStateRow>();
      if (error) throw error;
      if (!data) return null;
      return {
        state: data.quota_state, reason: data.reason, checkedAt: Date.parse(data.checked_at),
        cooldownUntil: data.cooldown_until ? Date.parse(data.cooldown_until) : 0,
        transientFailures: data.transient_failures,
      };
    },
    async save(snapshot) {
      const { error } = await client.from("ai_provider_runtime_state").upsert({
        provider: "kimi", quota_state: snapshot.state, reason: snapshot.reason,
        cooldown_until: snapshot.cooldownUntil > 0 ? new Date(snapshot.cooldownUntil).toISOString() : null,
        checked_at: new Date(snapshot.checkedAt).toISOString(), transient_failures: snapshot.transientFailures,
      }, { onConflict: "provider" });
      if (error) throw error;
    },
  };
}
