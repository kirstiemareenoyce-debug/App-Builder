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
  // Commit ONLY in this disposable cluster so independent psql processes can
  // exercise real lock contention. Nothing connects to the external project.
  const projectMigration = await readFile(join(root, "migrations/20261116000300_project_chat_budget.sql"), "utf8");
  const projectChecks = await readFile(join(root, "tests/project-chat-budget.sql"), "utf8");
  const psql = ["-X", "-q", "-A", "-t", "-h", dir, "-p", "55439", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"];
  await run("psql", psql, `create role anon; create role authenticated;
    create role service_role bypassrls; create schema auth;
    create table auth.users (id uuid primary key);
    grant usage on schema public to anon, authenticated, service_role;
    ${migration}
    insert into auth.users values ('00000000-0000-4000-8000-000000000001');
    insert into public.kairos_ai_daily_usage values
      ('00000000-0000-4000-8000-000000000001', (clock_timestamp() at time zone 'UTC')::date, 2);
    ${projectMigration}
    do $$ begin
      if (select attempts from public.kairos_ai_project_daily_usage
        where usage_day = (clock_timestamp() at time zone 'UTC')::date) <> 2
      then raise exception 'Migration reset existing usage'; end if;
    end $$;
    truncate public.kairos_ai_daily_usage, public.kairos_ai_project_daily_usage;`);
  await run("psql", psql, projectChecks);
  // Separate users model aggregate growth. Multiple independent transactions
  // contend on the first-use row and subsequently on an existing day.
  const ids = Array.from({ length: 40 }, (_, i) => `00000000-0000-4000-8000-${String(i + 10).padStart(12, "0")}`);
  await run("psql", psql, `insert into auth.users values ${ids.map((id) => `('${id}')`).join(",")};
    update public.kairos_ai_project_policy set daily_limit = 7, paused = false;`);
  async function burst() {
    const results = await Promise.all(ids.map((id) => run("psql", psql,
      `set role service_role; select reason from public.reserve_kairos_ai_request('${id}');`)));
    return results.map((result) => result.trim());
  }
  const first = await burst();
  if (first.filter((r) => r === "allowed").length !== 7 ||
      first.filter((r) => r === "project_limit").length !== 33) {
    throw new Error("Concurrent first-use exhaustion exceeded or missed the project allowance.");
  }
  await run("psql", psql, "update public.kairos_ai_project_policy set daily_limit = 10;");
  const second = await burst();
  if (second.filter((r) => r === "allowed").length !== 3) {
    throw new Error("Concurrent existing-row exhaustion did not preserve the allowance.");
  }
  await run("psql", psql, `do $$ begin
    if (select sum(attempts) from public.kairos_ai_daily_usage) <> 10
      or (select sum(attempts) from public.kairos_ai_project_daily_usage) <> 10
    then raise exception 'Atomic user/project counters diverged'; end if;
    end $$;
    update public.kairos_ai_project_policy set paused = true;`);
  if ((await burst()).some((r) => r !== "paused")) throw new Error("Paused burst admitted a request.");
  console.log("Project SQL checks and 120 concurrent reservations passed; no provider calls or live changes.");
  const statusMigration = await readFile(join(root, "migrations/20261116000400_main_chat_allowance_status.sql"), "utf8");
  const statusChecks = await readFile(join(root, "tests/main-chat-allowance-status.sql"), "utf8");
  // Minimal JWT identity shim, only inside the disposable cluster.
  await run("psql", psql, `create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated;
    ${statusMigration}`);
  await run("psql", psql, statusChecks);
  await run("psql", psql, `begin read only;
    set local role authenticated;
    set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000001';
    select * from public.kairos_ai_allowance_status();
    rollback;`);
  console.log("Owner-private allowance status passed isolation, no-write, UTC timezone and read-only-transaction checks.");
} finally {
  if (started) await run("pg_ctl", ["-D", data, "-m", "immediate", "-w", "stop"]);
  await rm(dir, { recursive: true, force: true });
}
