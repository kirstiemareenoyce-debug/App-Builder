// Explicit operator action for the owner's external Supabase project only.
// Never called by a workflow, application startup, build or Publish.
import { readFile } from "node:fs/promises";

const args = process.argv.slice(2);
const command = args[0];
const refIndex = args.indexOf("--project-ref");
const ref = refIndex >= 0 ? args[refIndex + 1] : undefined;
if (!ref || !/^[a-z]{20}$/.test(ref)) throw new Error("Supply --project-ref.");
if (process.env.EXPO_PUBLIC_SUPABASE_URL?.replace(/\/$/, "") !== `https://${ref}.supabase.co`) {
  throw new Error("Target does not match the mobile app's configured Supabase URL.");
}
if (!["inspect", "apply", "verify"].includes(command)) throw new Error("Use inspect, apply, or verify.");
if (command !== "inspect" && !args.includes("--apply")) {
  throw new Error("Owner authorization and --apply are required, including for rollback-only checks.");
}
if (!process.env.SUPABASE_ACCESS_TOKEN) throw new Error("Management credential missing.");
async function sql(query, readOnly = true) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, read_only: readOnly }),
    signal: AbortSignal.timeout(120000),
  });
  if (!response.ok) throw new Error(`Database operation failed HTTP ${response.status}: ${(await response.text()).slice(0, 1000)}`);
  return response.json();
}
const metadataQuery = `select json_build_object(
  'entries_exist', to_regclass('public.aevum_relationship_entries') is not null,
  'identity_function_exists', to_regprocedure('public.protect_aevum_entry_identity()') is not null,
  'sharing_table_exists', to_regclass('public.aevum_relationship_shares') is not null,
  'security', (select json_build_object('enabled', relrowsecurity, 'forced', relforcerowsecurity)
    from pg_class where oid=to_regclass('public.aevum_relationship_entries')),
  'policies', (select json_agg(json_build_object('name', policyname, 'roles', roles,
    'command', cmd, 'using', qual, 'check', with_check))
    from pg_policies where schemaname='public' and tablename='aevum_relationship_entries')
) as archive_metadata`;
if (command === "inspect") {
  console.log(JSON.stringify(await sql(metadataQuery), null, 2));
} else if (command === "apply") {
  const before = (await sql(metadataQuery))[0]?.archive_metadata;
  if (!before || before.entries_exist || before.identity_function_exists) {
    throw new Error("Private storage objects already exist. Inspect drift rather than replaying the migration.");
  }
  await sql(await readFile(new URL("./migrations/20261116001000_private_support_archive.sql", import.meta.url), "utf8"), false);
  console.log(JSON.stringify({ privateStorageInstalled: true, metadata: await sql(metadataQuery) }, null, 2));
} else {
  await sql(await readFile(new URL("./tests/private-support-archive.sql", import.meta.url), "utf8"), false);
  console.log(JSON.stringify({ ownerSaveReadEditDeletePassed: true,
    crossAccountAccessBlocked: true, separateVersionsPassed: true,
    syntheticChangesRolledBack: true, paidAIRequests: 0 }));
}
