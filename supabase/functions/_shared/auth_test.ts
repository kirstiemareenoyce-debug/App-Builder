import { strict as assert } from "node:assert";
import { authenticateRequest } from "./auth.ts";
import { HttpError } from "./errors.ts";

Deno.env.get = (name) => ({
  SUPABASE_URL: "https://supabase.example",
  SUPABASE_ANON_KEY: "offline-publishable-key",
  SUPABASE_SERVICE_ROLE_KEY: "offline-service-role-key",
})[name];

Deno.test("no bearer token is rejected without network access", async () => {
  await assert.rejects(() => authenticateRequest(new Request("https://kairos.example")),
    (e) => e instanceof HttpError && e.status === 401);
});
Deno.test("verified user comes from Supabase Auth rather than caller-supplied identity", async () => {
  const oldFetch = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    assert.ok(String(input).includes("/auth/v1/user"));
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer offline-user-token");
    return Promise.resolve(new Response(JSON.stringify({
      id: "verified-owner", aud: "authenticated", role: "authenticated",
      app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z",
    }), { headers: { "content-type": "application/json" } }));
  };
  try {
    const result = await authenticateRequest(new Request("https://kairos.example", {
      method: "POST", headers: { authorization: "Bearer offline-user-token" },
      body: JSON.stringify({ user_id: "untrusted-owner" }),
    }));
    assert.equal(result.user.id, "verified-owner");
  } finally { globalThis.fetch = oldFetch; }
});
Deno.test("invalid or expired bearer token cannot authenticate as an API key", async () => {
  const oldFetch = globalThis.fetch;
  globalThis.fetch = () => Promise.resolve(new Response(
    JSON.stringify({ message: "Invalid JWT", code: "bad_jwt" }),
    { status: 401, headers: { "content-type": "application/json" } },
  ));
  try {
    await assert.rejects(() => authenticateRequest(new Request("https://kairos.example", {
      headers: { authorization: "Bearer offline-invalid-token" },
    })), (e) => e instanceof HttpError && e.status === 401);
  } finally { globalThis.fetch = oldFetch; }
});
