/**
 * No credentials or TCP connections. Installs the unchanged history migration
 * in a disposable PostgreSQL cluster and rolls back all fixtures and schema.
 */
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const dir = await mkdtemp(join(tmpdir(), "kairos-history-"));
const data = join(dir, "pg");
const env = { PATH: process.env.PATH, HOME: dir, LC_ALL: "C", LANG: "C" };
function run(command, args, input = "") {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env, stdio: ["pipe", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { output += chunk; });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve(output) : reject(new Error(`${command}: ${output}`)));
    child.stdin.end(input);
  });
}
let started = false;
try {
  await run("initdb", ["-D", data, "-U", "postgres", "--auth=trust", "--no-locale"]);
  await run("pg_ctl", ["-D", data, "-l", join(dir, "server.log"), "-o", `-k ${dir} -h '' -p 55439`, "-w", "start"]);
  started = true;
  const migration = await readFile(join(root, "migrations/20261116000100_main_chat.sql"), "utf8");
  const checks = await readFile(join(root, "tests/main-chat-delete.sql"), "utf8");
  const rlsChecks = await readFile(join(root, "tests/main-chat-rls.sql"), "utf8");
  const unwrap = (sql) => sql.replace(/^begin;$/m, "").replace(/^(commit|rollback);$/m, "");
  console.log(await run("psql", ["-X", "-h", dir, "-p", "55439", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"], `begin;
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key, created_at timestamptz default now());
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create function public.set_updated_at() returns trigger language plpgsql as
      $$ begin new.updated_at = now(); return new; end $$;
    grant usage on schema public, auth to anon, authenticated, service_role;
    ${unwrap(migration)}
    ${unwrap(checks)}
    ${unwrap(rlsChecks)}
    rollback;
    do $$ begin
      if to_regclass('public.kairos_ai_interactions') is not null
        or to_regclass('auth.users') is not null
      then raise exception 'Rollback did not remove fixture schema'; end if;
    end $$;`));
  console.log("History deletion and RLS checks passed; all synthetic rows and schema rolled back.");
} finally {
  if (started) await run("pg_ctl", ["-D", data, "-m", "immediate", "-w", "stop"]);
  await rm(dir, { recursive: true, force: true });
}
