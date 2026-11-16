/**
 * Explicit operator commands for the existing external Supabase project.
 * Never used by application startup, build, Replit Publish or a workflow.
 * Secrets stay in process memory and are never placed in argv, files or logs.
 */
import { readFile, readdir } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const command = process.argv[2];
const args = process.argv.slice(3);
function option(name) {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}
function required(value, label) {
  if (!value) throw new Error(`${label} is required.`);
  return value;
}
const mutations = new Set(["schema", "secrets", "deploy", "verify-rls"]);

async function main() {
  if (!["inspect", "bundle", "schema", "secrets", "deploy", "verify", "verify-rls"].includes(command)) {
    console.log("Usage: node supabase/manage.mjs <inspect|bundle|schema|secrets|deploy|verify|verify-rls> --project-ref REF [--apply] [--origin HTTPS_ORIGIN]");
    process.exitCode = 1;
    return;
  }
  const ref = required(option("--project-ref"), "--project-ref");
  if (!/^[a-z]{20}$/.test(ref)) throw new Error("Invalid project reference.");
  const publicUrl = `https://${ref}.supabase.co`;
  if (process.env.EXPO_PUBLIC_SUPABASE_URL?.replace(/\/$/, "") !== publicUrl) {
    throw new Error("Target does not match the mobile app's configured Supabase URL.");
  }
  if (mutations.has(command) && !args.includes("--apply")) {
    throw new Error("This command changes remote state. Review it and pass --apply only with owner approval.");
  }
  const token = required(process.env.SUPABASE_ACCESS_TOKEN, "Management credential");
  const api = `https://api.supabase.com/v1/projects/${ref}`;
  async function management(path, { method = "GET", json, form } = {}) {
    const response = await fetch(api + path, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(json !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: form ?? (json !== undefined ? JSON.stringify(json) : undefined),
      signal: AbortSignal.timeout(120000),
    });
    if (!response.ok) {
      // Secrets endpoints could echo sensitive request information on failure.
      // Deployment and SQL requests contain no credentials in their bodies.
      const detail = path.startsWith("/functions/deploy") || path === "/database/query"
        ? (await response.text()).slice(0, 3000) : "";
      throw new Error(`Management request failed: HTTP ${response.status}${detail ? `: ${detail}` : ""}`);
    }
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }
  async function sql(query, readOnly = true) {
    return management("/database/query", { method: "POST", json: { query, read_only: readOnly } });
  }
  async function schemaMetadata() {
    return sql(`select json_build_object(
      'chat_table', to_regclass('public.kairos_ai_interactions') is not null,
      'provider_table', to_regclass('public.ai_provider_runtime_state') is not null,
      'timestamp_trigger_dependency', to_regprocedure('public.set_updated_at()') is not null,
      'public_table_count', (select count(*) from pg_tables where schemaname='public'),
      'policies', (select json_agg(json_build_object('table', tablename, 'policy', policyname, 'role', roles, 'command', cmd, 'predicate', qual))
        from pg_policies where schemaname='public' and tablename in ('kairos_ai_interactions','ai_provider_runtime_state')),
      'row_security', (select json_agg(json_build_object('table', c.relname, 'enabled', c.relrowsecurity, 'forced', c.relforcerowsecurity))
        from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('kairos_ai_interactions','ai_provider_runtime_state'))
      ) as setup_metadata`);
  }
  if (command === "inspect") {
    const [functions, secrets, schema] = await Promise.all([
      management("/functions"), management("/secrets"), schemaMetadata(),
    ]);
    console.log(JSON.stringify({
      project: ref,
      functions: functions.map(({ slug, status, verify_jwt }) => ({ slug, status, verify_jwt })),
      secretNames: secrets.map(({ name }) => name),
      schema,
    }, null, 2));
  } else if (command === "schema") {
    const rows = await schemaMetadata();
    const before = rows[0]?.setup_metadata;
    if (!before || before.chat_table || before.provider_table || !before.timestamp_trigger_dependency) {
      throw new Error("Schema prerequisites changed. Review existing objects instead of replaying this migration.");
    }
    await sql(await readFile(join(root, "migrations/20261116000100_main_chat.sql"), "utf8"), false);
    console.log(JSON.stringify({ schemaApplied: true, metadata: await schemaMetadata() }, null, 2));
  } else if (command === "secrets") {
    const origin = required(option("--origin"), "--origin");
    const parsed = new URL(origin);
    if (parsed.protocol !== "https:" || parsed.origin !== origin) throw new Error("Use an exact HTTPS origin without a path.");
    const values = {
      KIMI_API_KEY: required(process.env.KIMI_API_KEY?.trim(), "Kimi credential"),
      OPENAI_API_KEY: required(process.env.OPENAI_API_KEY?.trim(), "OpenAI credential"),
      AI_PRIMARY_PROVIDER: "kimi",
      KIMI_MODEL: "kimi-k3",
      OPENAI_CHAT_MODEL: "gpt-5.4-mini",
      ALLOWED_ORIGINS: origin,
    };
    await management("/secrets", {
      method: "POST", json: Object.entries(values).map(([name, value]) => ({ name, value })),
    });
    console.log(JSON.stringify({ configuredSecretNames: Object.keys(values), allowedOrigin: origin }));
  } else if (command === "bundle" || command === "deploy") {
    const functionsRoot = join(root, "functions");
    async function files(dir) {
      const result = [];
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) result.push(...await files(path));
        else if (entry.name.endsWith(".ts") && !entry.name.endsWith("_test.ts")) result.push(path);
      }
      return result;
    }
    const sources = await files(functionsRoot);
    const form = new FormData();
    form.append("metadata", JSON.stringify({
      name: "kairos-query", entrypoint_path: "kairos-query/index.ts", verify_jwt: true,
    }));
    for (const path of sources) {
      form.append("file", new Blob([await readFile(path)], { type: "application/typescript" }),
        relative(functionsRoot, path).replaceAll("\\", "/"));
    }
    const metadata = await management(
      `/functions/deploy?slug=kairos-query${command === "bundle" ? "&bundleOnly=1" : ""}`,
      { method: "POST", form },
    );
    console.log(JSON.stringify({
      action: command, slug: metadata?.slug, status: metadata?.status,
      verify_jwt: metadata?.verify_jwt, version: metadata?.version, sourceFiles: sources.length,
    }));
  } else if (command === "verify-rls") {
    await sql(await readFile(join(root, "tests/main-chat-rls.sql"), "utf8"), false);
    console.log(JSON.stringify({ privacyChecksPassed: true, syntheticChangesRolledBack: true }));
  } else if (command === "verify") {
    const publicKey = required(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY, "Public Supabase key");
    const origin = required(option("--origin"), "--origin");
    const endpoint = `${publicUrl}/functions/v1/kairos-query`;
    const invalidBody = JSON.stringify({ query: "", mode: "learning", ai_use_consent: false, storage_consent: false });
    const cases = [
      { name: "Allowed browser preflight", method: "OPTIONS", headers: { Origin: origin, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "authorization, apikey, content-type" }, expected: 204 },
      { name: "Missing authentication rejected", method: "POST", headers: { "Content-Type": "application/json" }, body: invalidBody, expected: 401 },
      { name: "Public key is not a user session", method: "POST", headers: { apikey: publicKey, Authorization: `Bearer ${publicKey}`, "Content-Type": "application/json", Origin: origin }, body: invalidBody, expected: 401 },
      { name: "Disallowed browser origin rejected", method: "POST", headers: { apikey: publicKey, Authorization: `Bearer ${publicKey}`, "Content-Type": "application/json", Origin: "https://untrusted.invalid" }, body: invalidBody, expected: 403 },
      { name: "Unsupported method rejected", method: "GET", headers: { apikey: publicKey, Authorization: `Bearer ${publicKey}` }, expected: 405 },
    ];
    let allPassed = true;
    for (const c of cases) {
      const response = await fetch(endpoint, {
        method: c.method, headers: c.headers, body: c.body, signal: AbortSignal.timeout(30000),
      });
      const body = await response.text();
      const cors = c.name !== "Allowed browser preflight" || response.headers.get("Access-Control-Allow-Origin") === origin;
      const passed = response.status === c.expected && cors;
      allPassed &&= passed;
      // Print only a known safe error code, never arbitrary response contents.
      let errorCode;
      try { const value = JSON.parse(body)?.error?.code; if (typeof value === "string" && /^[A-Z_]+$/.test(value)) errorCode = value; } catch {}
      console.log(JSON.stringify({ check: c.name, passed, status: response.status, errorCode }));
    }
    if (!allPassed) throw new Error("A non-billable verification check failed.");
  }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
