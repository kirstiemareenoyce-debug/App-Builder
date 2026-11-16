// Explicit opt-in live HTTP check. Creates only disposable identities and
// synthetic text, then deletes them. Never sends email or calls any AI service.
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";

const args = process.argv.slice(2);
const index = args.indexOf("--project-ref");
const ref = index >= 0 ? args[index + 1] : "";
if (!args.includes("--apply") || !/^[a-z]{20}$/.test(ref)) {
  throw new Error("Owner authorization, --project-ref and --apply required.");
}
const base = `https://${ref}.supabase.co`;
if (process.env.EXPO_PUBLIC_SUPABASE_URL?.replace(/\/$/, "") !== base) {
  throw new Error("Project does not match the mobile Supabase URL.");
}
const publicKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const managementKey = process.env.SUPABASE_ACCESS_TOKEN;
if (!publicKey || !managementKey) throw new Error("Required operator credentials unavailable.");
const keysResponse = await fetch(`https://api.supabase.com/v1/projects/${ref}/api-keys`, {
  headers: { Authorization: `Bearer ${managementKey}` }, signal: AbortSignal.timeout(20000),
});
if (!keysResponse.ok) throw new Error(`Server credential lookup HTTP ${keysResponse.status}`);
const serverKey = (await keysResponse.json()).find(key => key.name === "service_role")?.api_key;
if (!serverKey) throw new Error("Server credential unavailable.");
const adminHeaders = { apikey: serverKey, Authorization: `Bearer ${serverKey}`, "Content-Type": "application/json" };
const users = [];
const sessions = [];
const checks = [];
let testError;

async function request(actor, path, { method = "GET", body, expected, prefer } = {}) {
  const response = await fetch(`${base}/rest/v1/${path}`, {
    method, headers: {
      apikey: publicKey,
      ...(actor === null ? {} : { Authorization: `Bearer ${sessions[actor]}` }),
      "Content-Type": "application/json",
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  const allowed = expected ? expected.includes(response.status) : response.ok;
  if (!allowed) throw new Error(`HTTP verification ${method} ${path.split("?")[0]} failed: ${response.status}, code ${data?.code ?? "unknown"}`);
  return data;
}
const share = (actor, entry, connection) => request(actor, "rpc/share_aevum_entry", {
  method: "POST", body: {
    p_entry_id: entry.id, p_connection_id: connection.id, p_expected_updated_at: entry.updated_at,
  },
});
const transition = (actor, connection, status, expected) =>
  request(actor, "rpc/set_aevum_partner_connection", {
    method: "POST", expected, body: { p_connection_id: connection.id, p_status: status },
  });
const consent = (granted) => request(0, "aevum_consents?on_conflict=user_id,scope", {
  method: "POST", prefer: "resolution=merge-duplicates,return=representation",
  body: { user_id: users[0], scope: "partner_sharing", version: "aevum-entry-sharing-v1",
    granted, granted_at: granted ? new Date().toISOString() : null,
    revoked_at: granted ? null : new Date().toISOString() },
});
try {
  for (let i = 0; i < 3; i++) {
    const email = `kairos-partner-${randomUUID()}@example.invalid`;
    const password = randomBytes(36).toString("base64url");
    const created = await fetch(`${base}/auth/v1/admin/users`, {
      method: "POST", headers: adminHeaders,
      body: JSON.stringify({ email, password, email_confirm: true,
        user_metadata: { purpose: "disposable-partner-verification" } }),
      signal: AbortSignal.timeout(20000),
    });
    if (!created.ok) throw new Error(`Disposable account setup HTTP ${created.status}`);
    const user = await created.json();
    if (!user.id) throw new Error("Disposable account identity missing.");
    users.push(user.id);
    const signedIn = await fetch(`${base}/auth/v1/token?grant_type=password`, {
      method: "POST", headers: { apikey: publicKey, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }), signal: AbortSignal.timeout(20000),
    });
    if (!signedIn.ok) throw new Error(`Disposable sign-in HTTP ${signedIn.status}`);
    const session = await signedIn.json();
    if (!session.access_token) throw new Error("Disposable session missing.");
    sessions.push(session.access_token);
  }
  await request(null, "partner_connections?select=id&limit=0", { expected: [401, 403] });
  const [entry] = await request(0, "aevum_relationship_entries", {
    method: "POST", prefer: "return=representation",
    body: { user_id: users[0], category: "support_archive",
      title: "Synthetic support archive verification", body: "Reviewed synthetic snapshot" },
  });
  const [connection] = await request(0, "partner_connections", {
    method: "POST", prefer: "return=representation",
    body: { requester_id: users[0], recipient_id: users[1] },
  });
  assert.equal(connection.status, "pending");
  await transition(0, connection, "accepted", [403]);
  await transition(2, connection, "accepted", [403]);
  await request(0, `partner_connections?id=eq.${connection.id}`, {
    method: "PATCH", body: { status: "accepted" }, expected: [403],
  });
  assert.deepEqual(await request(2, `partner_connections?id=eq.${connection.id}`), []);
  await transition(1, connection, "accepted");
  assert.deepEqual(await request(1, `aevum_relationship_shares?connection_id=eq.${connection.id}`), []);
  assert.deepEqual(await request(1, `aevum_relationship_entries?id=eq.${entry.id}`), []);
  checks.push("recipient-only acceptance; no automatic sharing; private draft hidden");

  await request(0, "rpc/share_aevum_entry", { method: "POST", expected: [403],
    body: { p_entry_id: entry.id, p_connection_id: connection.id, p_expected_updated_at: entry.updated_at } });
  await consent(true);
  const snapshot = await share(0, entry, connection);
  assert.equal(snapshot.recipient_id, users[1]);
  assert.equal(snapshot.body, "Reviewed synthetic snapshot");
  const [edited] = await request(0, `aevum_relationship_entries?id=eq.${entry.id}&user_id=eq.${users[0]}`, {
    method: "PATCH", prefer: "return=representation", body: { body: "Unshared private edit" },
  });
  await request(0, "rpc/share_aevum_entry", { method: "POST", expected: [400],
    body: { p_entry_id: entry.id, p_connection_id: connection.id, p_expected_updated_at: entry.updated_at } });
  const received = await request(1, `aevum_relationship_shares?id=eq.${snapshot.id}`);
  assert.equal(received.length, 1);
  assert.equal(received[0].body, "Reviewed synthetic snapshot");
  assert.deepEqual(await request(2, `aevum_relationship_shares?id=eq.${snapshot.id}`), []);
  assert.deepEqual(await request(1, `aevum_consents?user_id=eq.${users[0]}`), []);
  await request(1, `aevum_relationship_shares?id=eq.${snapshot.id}`, {
    method: "PATCH", body: { body: "Forbidden recipient edit" }, expected: [403],
  });
  checks.push("explicit consent; exact reviewed snapshot; stale review rejected; outsider isolated");

  assert.equal(await request(0, "rpc/revoke_aevum_entry", {
    method: "POST", body: { p_entry_id: entry.id },
  }), 1);
  assert.deepEqual(await request(1, `aevum_relationship_shares?entry_id=eq.${entry.id}`), []);
  await share(0, edited, connection);
  await consent(false);
  assert.deepEqual(await request(1, `aevum_relationship_shares?entry_id=eq.${entry.id}`), []);
  await consent(true);
  assert.deepEqual(await request(1, `aevum_relationship_shares?entry_id=eq.${entry.id}`), []);
  checks.push("revocation and consent withdrawal removed access; regrant did not revive snapshots");

  await share(0, edited, connection);
  await transition(1, connection, "disconnected");
  assert.deepEqual(await request(1, `aevum_relationship_shares?entry_id=eq.${entry.id}`), []);
  const stillPrivate = await request(0, `aevum_relationship_entries?id=eq.${entry.id}`);
  assert.equal(stillPrivate[0].body, "Unshared private edit");
  await transition(1, connection, "accepted", [403]);
  const [newInvitation] = await request(0, "partner_connections", {
    method: "POST", prefer: "return=representation",
    body: { requester_id: users[0], recipient_id: users[1] },
  });
  await transition(1, newInvitation, "rejected");
  const [cancelled] = await request(0, "partner_connections", {
    method: "POST", prefer: "return=representation",
    body: { requester_id: users[0], recipient_id: users[1] },
  });
  await transition(0, cancelled, "disconnected");
  checks.push("disconnect removed snapshots but preserved private draft; reinvitation, decline and cancel worked");
} catch (error) {
  testError = error.message;
  process.exitCode = 1;
} finally {
  let removed = 0;
  for (const id of users) {
    const response = await fetch(`${base}/auth/v1/admin/users/${id}`, {
      method: "DELETE", headers: adminHeaders, signal: AbortSignal.timeout(20000),
    });
    if (response.ok) removed++;
    else process.exitCode = 1;
  }
  console.log(JSON.stringify({ passed: !testError && removed === users.length,
    checks, ...(testError ? { testError } : {}),
    disposableAccountsCreated: users.length, disposableAccountsRemoved: removed,
    realAccountDataAccessed: false, paidAIRequests: 0 }, null, 2));
}
