-- PENDING OWNER APPROVAL. Never run automatically.
-- Requires the per-account budget migration. Owner approved 100 requests/UTC day.
-- Live schema installation and activation still require separate approval.
-- Installs PAUSED; preparing this file does not activate paid AI.
begin;

create table public.kairos_ai_project_policy (
  singleton boolean primary key default true check (singleton),
  daily_limit integer not null check (daily_limit between 0 and 1000000),
  paused boolean not null,
  check (paused or daily_limit > 0)
);
insert into public.kairos_ai_project_policy values (true, 100, true);
alter table public.kairos_ai_project_policy enable row level security;
alter table public.kairos_ai_project_policy force row level security;
revoke all on public.kairos_ai_project_policy from public, anon, authenticated, service_role;
grant select on public.kairos_ai_project_policy to service_role;
-- SELECT FOR UPDATE requires UPDATE privilege on at least one column.
-- Only the immutable singleton key is granted; the service cannot unpause,
-- increase the allowance, insert a replacement row, or remove the policy.
grant update (singleton) on public.kairos_ai_project_policy to service_role;

create table public.kairos_ai_project_daily_usage (
  usage_day date primary key,
  attempts integer not null check (attempts >= 0)
);
alter table public.kairos_ai_project_daily_usage enable row level security;
alter table public.kairos_ai_project_daily_usage force row level security;
revoke all on public.kairos_ai_project_daily_usage from public, anon, authenticated, service_role;
grant select, insert, update on public.kairos_ai_project_daily_usage to service_role;

-- Do not reset today's known usage when upgrading from per-account limits.
-- Project totals intentionally survive subsequent account/history deletion.
insert into public.kairos_ai_project_daily_usage (usage_day, attempts)
  select usage_day, sum(attempts)::integer
  from public.kairos_ai_daily_usage group by usage_day;

-- New result contract deliberately makes older handlers fail closed.
drop function public.reserve_kairos_ai_request(uuid);
create function public.reserve_kairos_ai_request(p_user_id uuid)
returns table (
  allowed boolean, reason text, used integer, daily_limit integer,
  project_used integer, project_daily_limit integer, resets_at timestamptz
)
language plpgsql security invoker set search_path = ''
as $function$
declare
  v_policy public.kairos_ai_project_policy%rowtype;
  v_day date;
  v_used integer;
  v_project_used integer;
begin
  if p_user_id is null then
    raise exception 'User identity is required' using errcode = '22023';
  end if;
  -- This single lock orders all reservations AND owner pause/limit updates.
  -- It is held through both counter updates until the RPC commits.
  select * into strict v_policy from public.kairos_ai_project_policy
    where singleton = true for update;
  -- Read the database clock AFTER any lock wait, including midnight rollover.
  v_day := (clock_timestamp() at time zone 'UTC')::date;
  select attempts into v_used from public.kairos_ai_daily_usage
    where user_id = p_user_id and usage_day = v_day;
  select attempts into v_project_used from public.kairos_ai_project_daily_usage
    where usage_day = v_day;
  v_used := coalesce(v_used, 0);
  v_project_used := coalesce(v_project_used, 0);
  if v_policy.paused then
    reason := 'paused';
  elsif v_project_used >= v_policy.daily_limit then
    reason := 'project_limit';
  elsif v_used >= 20 then
    reason := 'user_limit';
  else
    insert into public.kairos_ai_daily_usage as usage (user_id, usage_day, attempts)
    values (p_user_id, v_day, 1)
    on conflict (user_id, usage_day) do update set attempts = usage.attempts + 1
    returning attempts into v_used;
    insert into public.kairos_ai_project_daily_usage as usage (usage_day, attempts)
    values (v_day, 1)
    on conflict (usage_day) do update set attempts = usage.attempts + 1
    returning attempts into v_project_used;
    reason := 'allowed';
  end if;
  return query select reason = 'allowed', reason, v_used, 20,
    v_project_used, v_policy.daily_limit,
    (v_day + 1)::timestamp at time zone 'UTC';
end
$function$;
revoke all on function public.reserve_kairos_ai_request(uuid) from public, anon, authenticated;
grant execute on function public.reserve_kairos_ai_request(uuid) to service_role;

-- Uncached emergency check, immediately before EACH paid attempt. It does
-- not reserve or refund another slot. Missing policy returns NULL (fail closed).
create function public.kairos_ai_request_enabled()
returns boolean language sql security invoker set search_path = ''
as $function$
  select not paused and daily_limit > 0
    from public.kairos_ai_project_policy where singleton = true
$function$;
revoke all on function public.kairos_ai_request_enabled() from public, anon, authenticated;
grant execute on function public.kairos_ai_request_enabled() to service_role;

notify pgrst, 'reload schema';
commit;
