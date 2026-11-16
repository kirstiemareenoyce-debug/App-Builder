import assert from "node:assert/strict";
import { test } from "node:test";
import { MutationObserver, QueryClient, QueryObserver } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  fetchKairosAIAllowance, kairosAIAllowanceFreshFor, kairosAIAllowanceKey,
  kairosAIAllowanceText, parseKairosAIAllowance, refreshKairosAIAllowance, refreshKairosAIAllowanceAfterAttempt,
} from "./kairos-ai-allowance";
import type { KairosAIDatabase } from "../types/kairos-ai";

const requestedAt = Date.parse("2026-11-16T23:59:50Z");
const row = {
  used: 3, daily_limit: 20, observed_at: "2026-11-16T23:59:50Z",
  resets_at: "2026-11-17T00:00:00Z",
};
function fixture(options: { owner?: string; authError?: boolean; dbError?: boolean; rows?: unknown } = {}) {
  const calls: unknown[][] = [];
  const result = { data: options.rows ?? [row], error: options.dbError ? { message: "private DB details" } : null };
  const builder = {
    setHeader: (...args: unknown[]) => { calls.push(["header", ...args]); return builder; },
    abortSignal: (...args: unknown[]) => { calls.push(["signal", ...args]); return builder; },
    then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve),
  };
  const client = {
    auth: { getSession: async () => ({
      data: { session: { user: { id: options.owner ?? "a" }, access_token: "offline-status-token" } },
      error: options.authError ? new Error("private auth details") : null,
    }) },
    rpc: (...args: unknown[]) => { calls.push(["rpc", ...args]); return builder; },
  } as unknown as SupabaseClient<KairosAIDatabase>;
  return { client, calls };
}

test("status uses only the no-argument read RPC, pins identity and supports cancellation", async () => {
  const { client, calls } = fixture();
  const signal = new AbortController().signal;
  const status = await fetchKairosAIAllowance(client, "a", signal);
  assert.equal(status.owner, "a");
  assert.equal(status.used, 3);
  assert.deepEqual(calls, [
    ["rpc", "kairos_ai_allowance_status", {}, { get: true }],
    ["header", "Authorization", "Bearer offline-status-token"], ["signal", signal],
  ]);
});

test("changed account and failed authentication never read counters", async () => {
  for (const options of [{ owner: "b" }, { authError: true }]) {
    const { client, calls } = fixture(options);
    await assert.rejects(fetchKairosAIAllowance(client, "a"), /account changed/);
    assert.deepEqual(calls, []);
  }
});

test("malformed, missing and unavailable status never invent a full allowance or leak database errors", async () => {
  for (const value of [null, [], [row, row], [{ ...row, used: -1 }], [{ ...row, used: 21 }],
    [{ ...row, daily_limit: 0 }], [{ ...row, used: 2.1 }],
    [{ ...row, resets_at: "invalid" }], [{ ...row, observed_at: "invalid" }],
    [{ ...row, resets_at: row.observed_at }], [{ ...row, resets_at: "2026-11-18T00:00:00Z" }],
    [{ ...row, resets_at: "2026-11-17T00:00:01Z" }]]) {
    assert.throws(() => parseKairosAIAllowance(value, "a", requestedAt), /unavailable/);
  }
  const { client } = fixture({ dbError: true });
  await assert.rejects(fetchKairosAIAllowance(client, "a"), (error: Error) =>
    error.message.includes("unavailable") && !error.message.includes("private DB"));
});

test("zero remaining, fresh account, stale errors, invalidation and account changes are explicit", () => {
  const full = parseKairosAIAllowance([{ ...row, used: 0 }], "a", requestedAt);
  assert.match(kairosAIAllowanceText(full, "a", requestedAt, false), /^20 of 20/);
  const empty = parseKairosAIAllowance([{ ...row, used: 20 }], "a", requestedAt);
  assert.match(kairosAIAllowanceText(empty, "a", requestedAt, false), /^0 of 20/);
  for (const [owner, now, invalid] of [
    ["b", requestedAt, false], ["a", requestedAt, true],
    ["a", requestedAt + 10_000, false], ["a", requestedAt - 100, false],
  ] as const) {
    assert.match(kairosAIAllowanceText(full, owner, now, invalid), /not current/);
  }
  assert.match(kairosAIAllowanceText(undefined, "a", requestedAt, false), /not current/);
});

test("status expires at the server UTC boundary even on a badly offset phone clock", () => {
  for (const offset of [-36_000_000, 50_400_000]) {
    const data = parseKairosAIAllowance([row], "a", requestedAt + offset);
    assert.equal(kairosAIAllowanceFreshFor(data, requestedAt + offset), 10_000);
    assert.equal(kairosAIAllowanceFreshFor(data, requestedAt + offset + 10_000), 0);
  }
  const midday = parseKairosAIAllowance([{ ...row, observed_at: "2026-11-16T12:00:00Z" }], "a", requestedAt);
  assert.equal(kairosAIAllowanceFreshFor(midday, requestedAt + 30_000), 0);
});

test("UTC reset copy is independent of local timezone, including equivalent offset timestamps", () => {
  const previous = process.env.TZ;
  try {
    for (const zone of ["Pacific/Honolulu", "Pacific/Kiritimati", "America/Los_Angeles"]) {
      process.env.TZ = zone;
      const data = parseKairosAIAllowance([{ ...row, resets_at: "2026-11-17T14:00:00+14:00" }], "a", requestedAt);
      assert.match(kairosAIAllowanceText(data, "a", requestedAt, false), /Resets 2026-11-17 at 00:00 UTC/);
    }
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});

test("post-attempt refresh cancels an older snapshot and refetches only the initiating owner", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const key = kairosAIAllowanceKey("a");
  let finishOld!: (value: string) => void;
  let reads = 0;
  const observer = new QueryObserver(client, {
    queryKey: key,
    queryFn: () => ++reads === 1 ? new Promise<string>((resolve) => { finishOld = resolve; })
      : Promise.resolve("post-attempt"),
  });
  const unsubscribe = observer.subscribe(() => undefined);
  client.setQueryData(kairosAIAllowanceKey("b"), "other-account");
  try {
    await refreshKairosAIAllowance(client, "a");
    finishOld("stale-before-reservation");
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(client.getQueryData(key), "post-attempt");
    assert.equal(client.getQueryData(kairosAIAllowanceKey("b")), "other-account");
    assert.equal(reads, 2);
  } finally { unsubscribe(); client.clear(); }
});

test("a late completion cannot recreate allowance data cleared by an account change", async () => {
  const client = new QueryClient();
  const key = kairosAIAllowanceKey("a");
  client.setQueryData(key, parseKairosAIAllowance([row], "a", requestedAt));
  client.removeQueries({ queryKey: key });
  await refreshKairosAIAllowance(client, "a");
  assert.equal(client.getQueryState(key), undefined);
  client.clear();
});

test("failed status refresh invalidates cached counts rather than showing them as current", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const key = kairosAIAllowanceKey("a");
  const cached = parseKairosAIAllowance([row], "a", requestedAt);
  client.setQueryData(key, cached);
  const observer = new QueryObserver(client, { queryKey: key,
    queryFn: async () => { throw new Error("offline"); }, staleTime: Infinity });
  const unsubscribe = observer.subscribe(() => undefined);
  try {
    await refreshKairosAIAllowance(client, "a");
    const state = client.getQueryState(key)!;
    assert.equal(state.status, "error");
    assert.equal(state.isInvalidated, true);
    assert.match(kairosAIAllowanceText(state.data as typeof cached, "a", requestedAt, state.isInvalidated), /not current/);
  } finally { unsubscribe(); client.clear(); }
});

test("a stalled post-attempt status read never delays a successful reply or failed send", async () => {
  for (const failed of [false, true]) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const key = kairosAIAllowanceKey("a");
    const cached = parseKairosAIAllowance([row], "a", requestedAt);
    client.setQueryData(key, cached);
    const status = new QueryObserver(client, { queryKey: key, staleTime: Infinity,
      queryFn: () => new Promise<typeof cached>(() => { /* Deliberately never resolves. */ }) });
    const unsubscribe = status.subscribe(() => undefined);
    const sendError = new Error("offline AI fixture failure");
    const send = new MutationObserver(client, {
      retry: false,
      mutationFn: async () => { if (failed) throw sendError; return "generated reply"; },
      // Same non-blocking lifecycle callback used by the mobile send hook.
      onSettled: () => refreshKairosAIAllowanceAfterAttempt(client, "a"),
    });
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = send.mutate().then(
        (reply) => ({ reply, error: null }),
        (error) => ({ reply: null, error }),
      );
      const completed = await Promise.race([result, new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error("Status stalled completion of the send")), 250);
      })]);
      assert.equal(completed.reply, failed ? null : "generated reply");
      assert.equal(completed.error, failed ? sendError : null);
      assert.equal(send.getCurrentResult().isPending, false);
      const state = client.getQueryState(key)!;
      assert.equal(state.isInvalidated, true);
      assert.equal(state.fetchStatus, "fetching");
      assert.match(kairosAIAllowanceText(cached, "a", requestedAt, state.isInvalidated), /not current/);
    } finally {
      if (timer) clearTimeout(timer);
      unsubscribe(); client.clear();
    }
  }
});
