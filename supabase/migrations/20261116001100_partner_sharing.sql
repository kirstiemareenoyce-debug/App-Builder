-- Owner-authorized activation of everyday partner connections and sharing.
-- Preserve the existing private-entry table and its owner-only policies.
-- No assessments, couple-map inference, AI calls, emails or automatic shares.
begin;

do $$ begin
  if not exists (select 1 from pg_class
    where oid = to_regclass('public.aevum_relationship_entries')
      and relrowsecurity and relforcerowsecurity) then
    raise exception 'Owner-private entry storage is required';
  end if;
end $$;

create table public.partner_connections (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'rejected', 'disconnected')),
  -- Compatibility with the imported type; no mood/sleep/task access is enabled.
  shared_categories text[] not null default '{}' check (cardinality(shared_categories) = 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (requester_id <> recipient_id)
);
-- Prevent reverse duplicates while allowing a new invitation after termination.
create unique index partner_connections_open_pair_idx
  on public.partner_connections (least(requester_id, recipient_id), greatest(requester_id, recipient_id))
  where status in ('pending', 'accepted');
create index partner_connections_requester_idx on public.partner_connections (requester_id, updated_at desc);
create index partner_connections_recipient_idx on public.partner_connections (recipient_id, updated_at desc);

create table public.aevum_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  scope text not null check (scope in ('assessment', 'individual_profile', 'partner_sharing', 'couple_map', 'coaching')),
  version text not null check (char_length(version) between 1 and 40),
  granted boolean not null default false,
  granted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, scope),
  check (not granted or (granted_at is not null and revoked_at is null))
);

create table public.aevum_relationship_shares (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  connection_id uuid not null references public.partner_connections(id) on delete cascade,
  category text not null check (category in (
    'emotional_weather', 'weekly_reflection', 'unsent_thoughts', 'future_letters',
    'memory_map', 'soundtrack', 'argument_analysis', 'energy_matching', 'love_acts',
    'shared_routines', 'support_archive', 'really_meant', 'shared_memories',
    'relationship_goals', 'date_ideas'
  )),
  title text not null check (char_length(title) between 1 and 120 and char_length(btrim(title)) > 0),
  body text not null check (char_length(body) between 1 and 4000 and char_length(btrim(body)) > 0),
  detail_url text check (detail_url is null or (
    char_length(detail_url) <= 1000 and detail_url ~ '^https://[^[:space:]/?#@]+[^[:space:]]*$'
  )),
  event_date date,
  shared_at timestamptz not null default now(),
  unique (entry_id, connection_id),
  check (owner_id <> recipient_id),
  foreign key (entry_id, owner_id)
    references public.aevum_relationship_entries(id, user_id) on delete cascade
);
create index aevum_relationship_shares_owner_idx on public.aevum_relationship_shares (owner_id, shared_at desc);
create index aevum_relationship_shares_recipient_idx on public.aevum_relationship_shares (recipient_id, shared_at desc);
create index aevum_relationship_shares_connection_idx on public.aevum_relationship_shares (connection_id);

alter table public.partner_connections enable row level security;
alter table public.partner_connections force row level security;
alter table public.aevum_consents enable row level security;
alter table public.aevum_consents force row level security;
alter table public.aevum_relationship_shares enable row level security;
alter table public.aevum_relationship_shares force row level security;
revoke all on public.partner_connections, public.aevum_consents, public.aevum_relationship_shares
  from public, anon, authenticated, service_role;
grant select on public.partner_connections, public.aevum_relationship_shares to authenticated;
grant insert (requester_id, recipient_id) on public.partner_connections to authenticated;
grant select, insert, update, delete on public.aevum_consents to authenticated;

create policy partner_connections_select_participant on public.partner_connections
for select to authenticated using ((select auth.uid()) in (requester_id, recipient_id));
create policy partner_connections_insert_requester on public.partner_connections
for insert to authenticated with check (
  (select auth.uid()) = requester_id and requester_id <> recipient_id and status = 'pending'
);
create policy aevum_consents_owner on public.aevum_consents
for all to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create function public.protect_aevum_consent_identity()
returns trigger language plpgsql security invoker set search_path = ''
as $$ begin
  if new.id is distinct from old.id or new.user_id is distinct from old.user_id
    or new.scope is distinct from old.scope or new.created_at is distinct from old.created_at then
    raise exception using errcode = '42501', message = 'Consent identity cannot be changed';
  end if;
  new.updated_at := pg_catalog.clock_timestamp();
  return new;
end $$;
create trigger aevum_consents_protect_identity before update on public.aevum_consents
for each row execute function public.protect_aevum_consent_identity();

-- Definer access is narrowly scoped; partners never read private entries/consents.
create function public.can_read_aevum_relationship_share(p_share_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1 from public.aevum_relationship_shares s
    join public.partner_connections pc on pc.id = s.connection_id
    join public.aevum_consents c on c.user_id = s.owner_id and c.scope = 'partner_sharing'
    where s.id = p_share_id and s.recipient_id = auth.uid() and pc.status = 'accepted'
      and ((pc.requester_id = s.owner_id and pc.recipient_id = s.recipient_id)
        or (pc.recipient_id = s.owner_id and pc.requester_id = s.recipient_id))
      and c.granted and c.revoked_at is null
  )
$$;
create policy aevum_relationship_shares_read on public.aevum_relationship_shares
for select to authenticated
using ((select auth.uid()) = owner_id or public.can_read_aevum_relationship_share(id));

create function public.clear_aevum_shares_on_consent_withdrawal()
returns trigger language plpgsql security definer set search_path = ''
as $$ begin
  if old.scope = 'partner_sharing' then
    if tg_op = 'DELETE' then
      delete from public.aevum_relationship_shares where owner_id = old.user_id;
    elsif not new.granted or new.revoked_at is not null then
      delete from public.aevum_relationship_shares where owner_id = old.user_id;
    end if;
  end if;
  return null;
end $$;
create trigger aevum_consents_clear_relationship_shares after update or delete on public.aevum_consents
for each row execute function public.clear_aevum_shares_on_consent_withdrawal();

create function public.clear_aevum_shares_on_disconnect()
returns trigger language plpgsql security definer set search_path = ''
as $$ begin
  if new.status <> 'accepted' then
    delete from public.aevum_relationship_shares where connection_id = old.id;
  end if;
  return null;
end $$;
create trigger partner_connections_clear_shares after update of status on public.partner_connections
for each row execute function public.clear_aevum_shares_on_disconnect();

create function public.set_aevum_partner_connection(p_connection_id uuid, p_status text)
returns public.partner_connections
language plpgsql security definer set search_path = ''
as $$
declare v_user_id uuid := auth.uid(); v_connection public.partner_connections;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  if p_status is null or p_status not in ('accepted', 'rejected', 'disconnected') then
    raise exception using errcode = '22023', message = 'Invalid partner connection status';
  end if;
  select * into v_connection from public.partner_connections
    where id = p_connection_id and v_user_id in (requester_id, recipient_id) for update;
  if not found then
    raise exception using errcode = '42501', message = 'Participant connection required';
  end if;
  if p_status in ('accepted', 'rejected') and (
    v_connection.status <> 'pending' or v_connection.recipient_id <> v_user_id
  ) then
    raise exception using errcode = '42501', message = 'Only the pending invitation recipient can respond';
  end if;
  if p_status = 'disconnected' and v_connection.status not in ('pending', 'accepted', 'disconnected') then
    raise exception using errcode = '42501', message = 'Connection has already ended';
  end if;
  update public.partner_connections set status = p_status, updated_at = pg_catalog.clock_timestamp()
    where id = v_connection.id returning * into v_connection;
  return v_connection;
end $$;

create function public.share_aevum_entry(p_entry_id uuid, p_connection_id uuid, p_expected_updated_at timestamptz)
returns public.aevum_relationship_shares
language plpgsql security definer set search_path = ''
as $$
declare
  v_owner_id uuid := auth.uid();
  v_entry public.aevum_relationship_entries;
  v_connection public.partner_connections;
  v_recipient_id uuid;
  v_share public.aevum_relationship_shares;
begin
  if v_owner_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('aevum_relationship:' || v_owner_id::text, 0));
  select * into v_entry from public.aevum_relationship_entries
    where id = p_entry_id and user_id = v_owner_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Relationship entry unavailable';
  end if;
  if v_entry.updated_at is distinct from p_expected_updated_at then
    raise exception using errcode = '22023', message = 'Entry changed since review';
  end if;
  select * into v_connection from public.partner_connections
    where id = p_connection_id and status = 'accepted'
      and v_owner_id in (requester_id, recipient_id) for share;
  if not found then
    raise exception using errcode = '42501', message = 'Accepted participant connection required';
  end if;
  v_recipient_id := case when v_connection.requester_id = v_owner_id
    then v_connection.recipient_id else v_connection.requester_id end;
  perform 1 from public.aevum_consents where user_id = v_owner_id
    and scope = 'partner_sharing' and granted and revoked_at is null for share;
  if not found then
    raise exception using errcode = '42501', message = 'Partner sharing consent required';
  end if;
  insert into public.aevum_relationship_shares as s
    (entry_id, owner_id, recipient_id, connection_id, category, title, body, detail_url, event_date, shared_at)
  values (v_entry.id, v_owner_id, v_recipient_id, v_connection.id,
    v_entry.category, v_entry.title, v_entry.body, v_entry.detail_url, v_entry.event_date, pg_catalog.clock_timestamp())
  on conflict (entry_id, connection_id) do update set
    recipient_id = excluded.recipient_id, category = excluded.category,
    title = excluded.title, body = excluded.body, detail_url = excluded.detail_url,
    event_date = excluded.event_date, shared_at = excluded.shared_at
  where s.owner_id = v_owner_id returning s.* into v_share;
  if not found then
    raise exception using errcode = '42501', message = 'Snapshot ownership mismatch';
  end if;
  return v_share;
end $$;

create function public.revoke_aevum_entry(p_entry_id uuid)
returns integer language plpgsql security definer set search_path = ''
as $$
declare v_owner_id uuid := auth.uid(); v_deleted integer;
begin
  if v_owner_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('aevum_relationship:' || v_owner_id::text, 0));
  delete from public.aevum_relationship_shares where entry_id = p_entry_id and owner_id = v_owner_id;
  get diagnostics v_deleted = row_count;
  return v_deleted;
end $$;

-- Explicit owners matter: these narrow functions must bypass forced RLS to
-- read consent/connection state, never caller-controlled identities or SQL.
alter function public.can_read_aevum_relationship_share(uuid) owner to postgres;
alter function public.clear_aevum_shares_on_consent_withdrawal() owner to postgres;
alter function public.clear_aevum_shares_on_disconnect() owner to postgres;
alter function public.set_aevum_partner_connection(uuid, text) owner to postgres;
alter function public.share_aevum_entry(uuid, uuid, timestamptz) owner to postgres;
alter function public.revoke_aevum_entry(uuid) owner to postgres;
revoke all on function public.protect_aevum_consent_identity(),
  public.can_read_aevum_relationship_share(uuid),
  public.clear_aevum_shares_on_consent_withdrawal(),
  public.clear_aevum_shares_on_disconnect(),
  public.set_aevum_partner_connection(uuid, text),
  public.share_aevum_entry(uuid, uuid, timestamptz),
  public.revoke_aevum_entry(uuid)
from public, anon, authenticated, service_role;
grant execute on function public.can_read_aevum_relationship_share(uuid),
  public.set_aevum_partner_connection(uuid, text),
  public.share_aevum_entry(uuid, uuid, timestamptz),
  public.revoke_aevum_entry(uuid) to authenticated;
notify pgrst, 'reload schema';
commit;
