-- Focused private storage from the imported relationship-entry schema.
-- No partner connections, shares, sharing RPCs, assessments or AI access.
-- Fail on existing objects so drift is reviewed rather than overwritten.
begin;

create table public.aevum_relationship_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null check (category in (
    'emotional_weather', 'weekly_reflection', 'unsent_thoughts', 'future_letters',
    'memory_map', 'soundtrack', 'argument_analysis', 'energy_matching', 'love_acts',
    'shared_routines', 'support_archive', 'really_meant', 'shared_memories',
    'relationship_goals', 'date_ideas'
  )),
  title text not null check (
    char_length(title) between 1 and 120 and char_length(btrim(title)) > 0
  ),
  body text not null check (
    char_length(body) between 1 and 4000 and char_length(btrim(body)) > 0
  ),
  detail_url text check (detail_url is null or (
    char_length(detail_url) <= 1000
    and detail_url ~ '^https://[^[:space:]/?#@]+[^[:space:]]*$'
  )),
  event_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create index aevum_relationship_entries_user_updated_idx
  on public.aevum_relationship_entries (user_id, updated_at desc);

create function public.protect_aevum_entry_identity()
returns trigger language plpgsql security invoker set search_path = ''
as $$
begin
  if new.id is distinct from old.id
    or new.user_id is distinct from old.user_id
    or new.created_at is distinct from old.created_at then
    raise exception using errcode = '42501',
      message = 'Relationship entry identity cannot be changed';
  end if;
  new.updated_at := greatest(
    pg_catalog.clock_timestamp(), old.updated_at + interval '1 microsecond'
  );
  return new;
end;
$$;

create trigger aevum_relationship_entries_identity
before update on public.aevum_relationship_entries
for each row execute function public.protect_aevum_entry_identity();

alter table public.aevum_relationship_entries enable row level security;
alter table public.aevum_relationship_entries force row level security;
revoke all on public.aevum_relationship_entries from public, anon, authenticated, service_role;
grant select, insert, update, delete
  on public.aevum_relationship_entries to authenticated;
revoke all on function public.protect_aevum_entry_identity()
  from public, anon, authenticated, service_role;

create policy aevum_relationship_entries_owner
on public.aevum_relationship_entries
for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

notify pgrst, 'reload schema';
commit;
