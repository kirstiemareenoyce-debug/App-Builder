import assert from "node:assert/strict";
import { test } from "node:test";
import { QueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  beginKairosAITurn, buildKairosAIMessages, completeKairosAITurn,
  createKairosAISession, deleteKairosAIHistory, fetchKairosAIHistory,
  kairosAIHistoryKey, removeKairosAIHistoryFromSession,
} from "./kairos-ai-history";
import {
  deleteKairosAIHistoryAndRefresh, isKairosAIBusy,
  runKairosAIOperation, subscribeKairosAIOperations,
} from "./kairos-ai-operations";
import type { KairosAIDatabase, KairosAIInteraction } from "../types/kairos-ai";

const id = "00000000-0000-4000-8000-000000000001";
const secondId = "00000000-0000-4000-8000-000000000002";
const row = (owner = "owner-a", interactionId = id): KairosAIInteraction => ({
  id: interactionId, user_id: owner, query: "Synthetic question", response: "Synthetic reply",
  mode: "learning", provider: "openai", created_at: "2026-11-16T00:00:00Z",
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
function fixture(options: { owner?: string; authError?: boolean; dbError?: boolean; count?: number | null; rows?: KairosAIInteraction[] } = {}) {
  const calls: unknown[][] = [];
  const result = { error: options.dbError ? { message: "private backend detail" } : null,
    count: options.count === undefined ? 1 : options.count, data: options.rows ?? [] };
  const builder = {
    select: (...args: unknown[]) => { calls.push(["select", ...args]); return builder; },
    delete: (...args: unknown[]) => { calls.push(["delete", ...args]); return builder; },
    eq: (...args: unknown[]) => { calls.push(["eq", ...args]); return builder; },
    order: (...args: unknown[]) => { calls.push(["order", ...args]); return builder; },
    limit: (...args: unknown[]) => { calls.push(["limit", ...args]); return builder; },
    setHeader: (...args: unknown[]) => { calls.push(["header", ...args]); return builder; },
    abortSignal: (...args: unknown[]) => { calls.push(["signal", ...args]); return builder; },
    then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve),
  };
  const client = {
    auth: { getSession: async () => ({
      data: { session: { user: { id: options.owner ?? "owner-a" }, access_token: "offline-fixture-token" } },
      error: options.authError ? new Error("fixture auth failure") : null,
    }) },
    from: (table: string) => { calls.push(["from", table]); return builder; },
  } as unknown as SupabaseClient<KairosAIDatabase>;
  return { client, calls };
}

test("pair deletion pins the owner token, table and exact ID without reading messages", async () => {
  const { client, calls } = fixture();
  await deleteKairosAIHistory(client, "owner-a", { kind: "pair", interactionId: id });
  assert.deepEqual(calls, [
    ["from", "kairos_ai_interactions"], ["delete", { count: "exact" }],
    ["eq", "user_id", "owner-a"], ["eq", "id", id],
    ["header", "Authorization", "Bearer offline-fixture-token"],
  ]);
});

test("clear deletes all owner rows, with no latest-50 limit or other tables", async () => {
  const { client, calls } = fixture({ count: 73 });
  await deleteKairosAIHistory(client, "owner-a", { kind: "all" });
  assert.deepEqual(calls.filter(([op]) => op === "eq"), [["eq", "user_id", "owner-a"]]);
  assert.equal(calls.some(([op]) => ["select", "limit"].includes(String(op))), false);
});

test("account switches, expired sessions and invalid targets fail before issuing DELETE", async () => {
  for (const options of [{ owner: "owner-b" }, { authError: true }]) {
    const { client, calls } = fixture(options);
    await assert.rejects(deleteKairosAIHistory(client, "owner-a", { kind: "all" }), /account changed/);
    assert.deepEqual(calls, []);
  }
  const { client, calls } = fixture();
  await assert.rejects(deleteKairosAIHistory(client, "owner-a", { kind: "pair", interactionId: "" }), /saved exchange/);
  await assert.rejects(deleteKairosAIHistory(client, "", { kind: "all" }), /Sign in/);
  assert.deepEqual(calls, []);
});

test("offline/backend failures and ambiguous counts are explicit; already absent is idempotent", async () => {
  for (const options of [{ dbError: true }, { count: null }]) {
    await assert.rejects(deleteKairosAIHistory(fixture(options).client, "owner-a", { kind: "all" }),
      /Deletion could not be confirmed.*draft is unchanged/);
  }
  await deleteKairosAIHistory(fixture({ count: 0 }).client, "owner-a", { kind: "pair", interactionId: id });
});

test("history forwards AbortSignal and filters ownership when rendering pairs", async () => {
  const { client, calls } = fixture({ rows: [row("owner-a", secondId), row()] });
  const signal = new AbortController().signal;
  const rows = await fetchKairosAIHistory(client, "owner-a", signal);
  assert.ok(calls.some(([op, value]) => op === "signal" && value === signal));
  assert.deepEqual(rows.map((item) => item.id), [id, secondId]);
  const messages = buildKairosAIMessages([...rows, row("owner-b"), row()], createKairosAISession("owner-a"), "owner-a");
  assert.equal(messages.length, 4);
  assert.deepEqual(messages.slice(0, 2).map((message) => message.interactionId), [id, id]);
});

test("deleted completed turns never reappear from the local session; pending turns have no deletion control", () => {
  let session = beginKairosAITurn(createKairosAISession("owner-a"), "owner-a", "request", "Synthetic question");
  assert.equal(buildKairosAIMessages([], session, "owner-a")[0].interactionId, undefined);
  session = completeKairosAITurn(session, "owner-a", "request", {
    interaction_id: id, response: "Synthetic reply", mode: "learning", provider: "openai",
  });
  for (const target of [{ kind: "all" } as const, { kind: "pair", interactionId: id } as const]) {
    const removed = removeKairosAIHistoryFromSession(session, "owner-a", target);
    assert.deepEqual(buildKairosAIMessages([], removed, "owner-a"), []);
    assert.equal(removeKairosAIHistoryFromSession(session, "owner-b", target), session);
  }
  assert.equal(removeKairosAIHistoryFromSession(session, "owner-a", { kind: "pair", interactionId: secondId }).turns.length, 1);
  assert.deepEqual(buildKairosAIMessages([row()], session, "owner-b"), []);
});

test("generation/deletion lock survives auth-cache clearing and blocks concurrent work only for its owner", async () => {
  const pending = deferred<void>();
  let notifications = 0;
  const unsubscribe = subscribeKairosAIOperations(() => { notifications++; });
  const generation = runKairosAIOperation("owner-a", () => pending.promise);
  assert.equal(isKairosAIBusy("owner-a"), true);
  const client = new QueryClient();
  client.getMutationCache().clear(); // Simulate A -> B -> A.
  await assert.rejects(runKairosAIOperation("owner-a", async () => assert.fail("must not delete")), /Wait/);
  await runKairosAIOperation("owner-b", async () => undefined);
  assert.equal(isKairosAIBusy("owner-a"), true);
  pending.resolve();
  await generation;
  assert.equal(isKairosAIBusy("owner-a"), false);
  await assert.rejects(runKairosAIOperation("owner-a", async () => { throw new Error("offline"); }), /offline/);
  assert.equal(isKairosAIBusy("owner-a"), false);
  assert.ok(notifications >= 6);
  unsubscribe();
  client.clear();
});

test("successful deletion cancels stale reads before and during DELETE and preserves another account cache", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const key = kairosAIHistoryKey("owner-a");
  client.setQueryData(key, [row(), row("owner-a", secondId)]);
  client.setQueryData(kairosAIHistoryKey("owner-b"), [row("owner-b")]);
  const stale = deferred<KairosAIInteraction[]>();
  const duringDelete = deferred<KairosAIInteraction[]>();
  const oldRead = client.fetchQuery({ queryKey: key, staleTime: 0, queryFn: () => stale.promise }).catch(() => undefined);
  let duringRead: Promise<unknown> | undefined;
  await deleteKairosAIHistoryAndRefresh(client, "owner-a", { kind: "pair", interactionId: id }, async () => {
    duringRead = client.fetchQuery({ queryKey: key, staleTime: 0, queryFn: () => duringDelete.promise }).catch(() => undefined);
  });
  stale.resolve([row()]);
  duringDelete.resolve([row()]);
  await Promise.all([oldRead, duringRead]);
  assert.deepEqual(client.getQueryData<KairosAIInteraction[]>(key)?.map((item) => item.id), [secondId]);
  assert.deepEqual(client.getQueryData(kairosAIHistoryKey("owner-b")), [row("owner-b")]);
  await deleteKairosAIHistoryAndRefresh(client, "owner-a", { kind: "all" }, async () => undefined);
  assert.deepEqual(client.getQueryData(key), []);
  client.clear();
});

test("failed deletion preserves cache and propagates its error; switching accounts cannot recreate an evicted cache", async () => {
  const client = new QueryClient();
  const key = kairosAIHistoryKey("owner-a");
  client.setQueryData(key, [row()]);
  await assert.rejects(deleteKairosAIHistoryAndRefresh(client, "owner-a", { kind: "all" },
    async () => { throw new Error("offline fixture"); }), /offline fixture/);
  assert.deepEqual(client.getQueryData(key), [row()]);
  await deleteKairosAIHistoryAndRefresh(client, "owner-a", { kind: "all" }, async () => {
    client.removeQueries({ queryKey: key });
  });
  assert.equal(client.getQueryState(key), undefined);
  client.clear();
});
