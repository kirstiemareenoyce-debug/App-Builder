// No live credentials, network listeners, provider calls or real account data.
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = await mkdtemp(join(tmpdir(), "kairos-partner-"));
const env = { PATH: process.env.PATH, HOME: dir, LC_ALL: "C", LANG: "C" };
function run(command, args, input = "") {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env, stdio: ["pipe", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", chunk => { output += chunk; });
    child.stderr.on("data", chunk => { output += chunk; });
    child.on("error", reject);
    child.on("close", code => code === 0 ? resolve(output) : reject(new Error(output)));
    child.stdin.end(input);
  });
}
const root = new URL("../", import.meta.url);
const unwrap = sql => sql.replace(/^begin;$/m, "").replace(/^(commit|rollback);$/m, "");
let started = false;
try {
  await run("initdb", ["-D", join(dir, "pg"), "-U", "postgres", "--auth=trust", "--no-locale"]);
  await run("pg_ctl", ["-D", join(dir, "pg"), "-l", join(dir, "server.log"), "-o", `-k ${dir} -h '' -p 55443`, "-w", "start"]);
  started = true;
  const privateSchema = unwrap(await readFile(new URL("migrations/20261116001000_private_support_archive.sql", root), "utf8"));
  const partnerSchema = unwrap(await readFile(new URL("migrations/20261116001100_partner_sharing.sql", root), "utf8"));
  const tests = unwrap(await readFile(new URL("tests/partner-sharing.sql", root), "utf8"));
  const mediaSchema = unwrap(await readFile(new URL("migrations/20261116001200_partner_memories.sql", root), "utf8"));
  const mediaTests = await readFile(new URL("tests/partner-memories.sql", root), "utf8");
  console.log(await run("psql", ["-X", "-h", dir, "-p", "55443", "-U", "postgres",
    "-d", "postgres", "-v", "ON_ERROR_STOP=1"], `begin;
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key, created_at timestamptz default now());
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema public, auth to anon, authenticated, service_role;
    create schema storage;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),
      bucket_id text references storage.buckets(id),name text,unique(bucket_id,name));
    create function storage.foldername(name text) returns text[] language sql immutable
      as $$ select string_to_array(name,'/') $$;
    alter table storage.objects enable row level security;
    grant usage on schema storage to authenticated;
    grant select,insert,delete on storage.objects to authenticated;
    ${privateSchema}
    ${partnerSchema}
    ${mediaSchema}
    ${tests}
    ${mediaTests}
    rollback;`));
  console.log("Partner entry/song/photo sharing, file access, consent, revocation, disconnection and account-isolation checks passed; all fixtures rolled back.");
} finally {
  if (started) await run("pg_ctl", ["-D", join(dir, "pg"), "-m", "immediate", "-w", "stop"]);
  await rm(dir, { recursive: true, force: true });
}
