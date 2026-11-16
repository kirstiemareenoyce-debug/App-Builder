import assert from "node:assert/strict";
import { test } from "node:test";

import { startOAuthSession } from "./oauth-session";
import { requirePkceCode } from "./oauth-callback";
import { PasswordRecoveryController } from "./password-recovery";

test("web redirects in the same tab without opening a popup or exchanging a code", async () => {
  const redirects: string[] = [];
  const result = await startOAuthSession("https://login.example/authorize", "https://app.example/auth/callback", {
    redirectInSameTab: (url) => { redirects.push(url); },
    openAuthSession: async () => { throw new Error("Web must not open a popup"); },
    completeCallback: async () => { throw new Error("Only the callback page may exchange the code"); },
  });
  assert.deepEqual(redirects, ["https://login.example/authorize"]);
  assert.equal(result, false);
});

test("native passes the original callback to the shared exchange handler", async () => {
  const callbacks: string[] = [];
  const callback = "kairos://auth/callback?code=one-use-test-code";
  const result = await startOAuthSession("https://login.example/authorize", "kairos://auth/callback", {
    openAuthSession: async (_url, redirectTo) => {
      assert.equal(redirectTo, "kairos://auth/callback");
      return { type: "success", url: callback };
    },
    completeCallback: async (url) => { callbacks.push(url); },
  });
  assert.equal(result, true);
  assert.deepEqual(callbacks, [callback]);
});

test("cancelled sign-in never exchanges a callback or claims success", async () => {
  const result = await startOAuthSession("https://login.example/authorize", "kairos://auth/callback", {
    openAuthSession: async () => ({ type: "cancel" }),
    completeCallback: async () => { throw new Error("Cancelled login must not exchange a code"); },
  });
  assert.equal(result, false);
});

test("a successful browser session without a URL fails explicitly", async () => {
  await assert.rejects(startOAuthSession("https://login.example/authorize", "kairos://auth/callback", {
    openAuthSession: async () => ({ type: "success" }),
    completeCallback: async () => { throw new Error("Missing callback must not be exchanged"); },
  }), /without a callback URL/);
});

test("callback exchange failures remain visible to the caller", async () => {
  await assert.rejects(startOAuthSession("https://login.example/authorize", "kairos://auth/callback", {
    openAuthSession: async () => ({ type: "success", url: "kairos://auth/callback?code=test" }),
    completeCallback: async () => { throw new Error("Session exchange failed"); },
  }), /Session exchange failed/);
});

test("missing codes, provider errors and token-bearing callbacks are still rejected", () => {
  assert.throws(() => requirePkceCode("https://app.example/auth/callback"), /authorization code/);
  assert.throws(() => requirePkceCode("https://app.example/auth/callback?error=access_denied"), /access_denied/);
  assert.throws(() => requirePkceCode("https://app.example/auth/callback#access_token=test"), /tokens directly/);
});

test("Linking and native browser completion exchange the same code only once", async () => {
  let exchanges = 0;
  const session = { user: { id: "test-owner" }, access_token: "test-token", expires_at: 4102444800 };
  const controller = new PasswordRecoveryController(
    () => ({
      exchangeCodeForSession: async () => {
        exchanges += 1;
        return { data: { session }, error: null };
      },
    }) as never,
    async () => { throw new Error("OAuth must not write a password"); },
  );
  const url = "kairos://auth/callback?code=shared-one-use-code";
  const results = await Promise.all([controller.completeCallback(url), controller.completeCallback(url)]);
  assert.equal(exchanges, 1);
  assert.deepEqual(results, [{ kind: "oauth", route: "/ai" }, { kind: "oauth", route: "/ai" }]);
});
