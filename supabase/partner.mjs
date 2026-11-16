// Explicit owner-authorized operator actions; not an app/build/Publish hook.
import { readFile } from "node:fs/promises";

const args = process.argv.slice(2);
const command = args[0];
const i = args.indexOf("--project-ref");
const ref = i >= 0 ? args[i + 1] : "";
if (!/^[a-z]{20}$/.test(ref) ||
    process.env.EXPO_PUBLIC_SUPABASE_URL?.replace(/\/$/, "") !== `https://${ref}.supabase.co`) {
  throw new Error("Supply the project reference matching the mobile app's Supabase URL.");
}
if (!["inspect", "apply", "media-inspect", "media-apply"].includes(command)) {
  throw new Error("Use inspect, apply, media-inspect or media-apply.");
}
if (command.endsWith("apply") && !args.includes("--apply")) throw new Error("Owner approval and --apply required.");
if (!process.env.SUPABASE_ACCESS_TOKEN) throw new Error("Management credential missing.");
async function sql(query, readOnly = true) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST", headers: {
      Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`, "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, read_only: readOnly }), signal: AbortSignal.timeout(120000),
  });
  if (!response.ok) throw new Error(`Partner database operation HTTP ${response.status}: ${(await response.text()).slice(0, 1000)}`);
  return response.json();
}
const query = `select json_build_object(
  'private_entries_ready', exists(select 1 from pg_class
    where oid=to_regclass('public.aevum_relationship_entries') and relrowsecurity and relforcerowsecurity),
  'tables', (select json_agg(json_build_object('name', c.relname,
    'rls', c.relrowsecurity, 'forced', c.relforcerowsecurity))
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname in
      ('partner_connections','aevum_consents','aevum_relationship_shares')),
  'functions', (select json_agg(p.proname) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in
      ('protect_aevum_consent_identity','can_read_aevum_relationship_share',
       'clear_aevum_shares_on_consent_withdrawal','clear_aevum_shares_on_disconnect',
       'set_aevum_partner_connection','share_aevum_entry','revoke_aevum_entry'))
) as partner_metadata`;
const mediaQuery = `select json_build_object(
  'partner_ready', to_regprocedure('public.share_aevum_entry(uuid,uuid,timestamp with time zone)') is not null,
  'items_exist', to_regclass('public.relationship_media_items') is not null,
  'shares_exist', to_regclass('public.relationship_media_shares') is not null,
  'bucket_exists', exists(select 1 from storage.buckets where id='relationship-memories'),
  'bucket_private', (select not public from storage.buckets where id='relationship-memories'),
  'storage_policy_count', (select count(*) from pg_policies where schemaname='storage' and tablename='objects')
) as media_metadata`;
const before = await sql(command.startsWith("media-") ? mediaQuery : query);
if (command === "media-apply") {
  const metadata = before[0]?.media_metadata;
  if (!metadata?.partner_ready || metadata.items_exist || metadata.shares_exist ||
      metadata.bucket_exists || Number(metadata.storage_policy_count) !== 0) {
    throw new Error("Storage prerequisites changed; review existing media objects and storage policies.");
  }
  await sql(await readFile(new URL("./migrations/20261116001200_partner_memories.sql", import.meta.url), "utf8"), false);
  console.log(JSON.stringify({ partnerMemoriesInstalled: true, metadata: await sql(mediaQuery) }, null, 2));
} else if (command === "apply") {
  const metadata = before[0]?.partner_metadata;
  if (!metadata?.private_entries_ready || metadata.tables || metadata.functions) {
    throw new Error("Partner prerequisites changed; inspect drift rather than overwrite existing objects.");
  }
  await sql(await readFile(new URL("./migrations/20261116001100_partner_sharing.sql", import.meta.url), "utf8"), false);
  console.log(JSON.stringify({ partnerFeaturesInstalled: true, existingPrivateEntriesUnchanged: true,
    automaticSharesCreated: 0, metadata: await sql(query) }, null, 2));
} else {
  console.log(JSON.stringify(before, null, 2));
}
