-- Pending owner approval: do not apply to the live project automatically.
-- Additive; fail on pre-existing objects so drift is reviewed, never overwritten.
begin;

create table public.kairos_ai_daily_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_day date not null,
  attempts integer not null check (attempts between 1 and 20),
  primary key (user_id, usage_day)
);
alter table public.kairos_ai_daily_usage enable row level security;
alter table public.kairos_ai_daily_usage force row level security;
revoke all on table public.kairos_ai_daily_usage from public, anon, authenticated, service_role;
grant select, insert, update on table public.kairos_ai_daily_usage to service_role;

-- Invoker rights: only the trusted service role can reserve; users cannot
-- supply their own identity, clock, limit, or refunds through the public API.
create function public.reserve_kairos_ai_request(p_user_id uuid)
returns table (allowed boolean, used integer, daily_limit integer, resets_at timestamptz)
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_day date := (clock_timestamp() at time zone 'UTC')::date;
  v_used integer;
begin
  if p_user_id is null then
    raise exception 'User identity is required' using errcode = '22023';
  end if;
  -- Unique-key conflict handling serializes both first-use and existing-row
  -- races across workers. The allowance is consumed in this committed RPC,
  -- before generation, and is never refunded on failure or disconnect.
  insert into public.kairos_ai_daily_usage as usage (user_id, usage_day, attempts)
  values (p_user_id, v_day, 1)
  on conflict (user_id, usage_day) do update
    set attempts = usage.attempts + 1
    where usage.attempts < 20
  returning attempts into v_used;

  return query select v_used is not null, coalesce(v_used, 20), 20,
    (v_day + 1)::timestamp at time zone 'UTC';
end
$function$;
revoke all on function public.reserve_kairos_ai_request(uuid) from public, anon, authenticated;
grant execute on function public.reserve_kairos_ai_request(uuid) to service_role;

notify pgrst, 'reload schema';
commit;
