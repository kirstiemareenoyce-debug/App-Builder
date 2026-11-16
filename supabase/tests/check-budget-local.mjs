/**
 * Disposable local PostgreSQL only. Does not read environment credentials,
 * connect to Supabase, or leave schema/test rows installed.
 */
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const dir = await mkdtemp(join(tmpdir(), "kairos-budget-"));
const data = join(dir, "pg");
// A private socket directory and no TCP listener prevent accidental remote use.
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
  const migration = await readFile(join(root, "migrations/20261116000200_main_chat_budget.sql"), "utf8");
  const checks = await readFile(join(root, "tests/main-chat-budget.sql"), "utf8");
  // Enclose schema, role fixtures and test assertions in ONE rolled-back
  // transaction. Supabase's real auth schema and grants remain untouched.
  const sql = `begin;
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key);
    grant usage on schema public to anon, authenticated, service_role;
    ${migration.replace(/^begin;$/m, "").replace(/^commit;$/m, "")}
    ${checks.replace(/^begin;$/m, "").replace(/^rollback;$/m, "")}
    rollback;
    do $$ begin
      if to_regclass('public.kairos_ai_daily_usage') is not null
        or to_regprocedure('public.reserve_kairos_ai_request(uuid)') is not null
      then raise exception 'Rollback did not remove budget schema'; end if;
    end $$;`;
  console.log(await run("psql", ["-X", "-h", dir, "-p", "55439", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"], sql));
  console.log("Budget SQL assertions passed; all schema, role fixtures and rows rolled back.");
} finally {
  if (started) await run("pg_ctl", ["-D", data, "-m", "immediate", "-w", "stop"]);
  await rm(dir, { recursive: true, force: true });
}
