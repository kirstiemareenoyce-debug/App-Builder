-- Additive setup approved for the existing external Supabase project.
-- Intentionally fails rather than replacing an existing table.
-- No other archive migrations are applied.
begin;

create table public.kairos_ai_interactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  query text not null check (char_length(btrim(query)) between 1 and 2000),
  response text not null check (char_length(btrim(response)) between 1 and 20000),
  mode text not null check (mode in ('learning', 'reflection')),
  provider text not null check (provider in ('openai', 'kimi')),
  ai_use_consent_version text not null check (ai_use_consent_version = 'kairos-ai-use-v1'),
  storage_consent_version text not null check (storage_consent_version = 'kairos-private-history-v1'),
  consented_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index kairos_ai_interactions_owner_latest_idx
  on public.kairos_ai_interactions(user_id, created_at desc, id desc);
alter table public.kairos_ai_interactions enable row level security;
alter table public.kairos_ai_interactions force row level security;
revoke all on table public.kairos_ai_interactions from public, anon, authenticated, service_role;
grant select, delete on table public.kairos_ai_interactions to authenticated;
grant select, insert on table public.kairos_ai_interactions to service_role;
create policy kairos_ai_interactions_owner_select
  on public.kairos_ai_interactions for select to authenticated
  using ((select auth.uid()) = user_id);
create policy kairos_ai_interactions_owner_delete
  on public.kairos_ai_interactions for delete to authenticated
  using ((select auth.uid()) = user_id);

create table public.ai_provider_runtime_state (
  provider text primary key check (provider in ('kimi')),
  quota_state text not null default 'unknown'
    check (quota_state in ('available', 'exhausted', 'unknown')),
  reason text not null default 'balance_unavailable'
    check (reason in (
      'balance_available', 'balance_exhausted', 'balance_unavailable',
      'completion_quota_exhausted', 'rate_limited', 'authentication_failed',
      'provider_unavailable', 'completion_succeeded'
    )),
  cooldown_until timestamptz,
  checked_at timestamptz not null default now(),
  transient_failures integer not null default 0 check (transient_failures between 0 and 20),
  updated_at timestamptz not null default now()
);
insert into public.ai_provider_runtime_state (provider) values ('kimi');
create trigger ai_provider_runtime_state_set_updated_at
  before update on public.ai_provider_runtime_state
  for each row execute function public.set_updated_at();
alter table public.ai_provider_runtime_state enable row level security;
alter table public.ai_provider_runtime_state force row level security;
revoke all on table public.ai_provider_runtime_state from public, anon, authenticated, service_role;
grant select, insert, update on table public.ai_provider_runtime_state to service_role;

-- Chat history has no automatic expiry. No old history is copied.
notify pgrst, 'reload schema';
commit;
