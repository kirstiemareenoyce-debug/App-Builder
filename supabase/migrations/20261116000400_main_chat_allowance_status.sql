-- PENDING OWNER APPROVAL. Prepare offline; never install at app startup.
-- Requires the per-account allowance migration; does not alter reservations.
begin;

-- No identity, clock or limit arguments: clients can read only their own day.
-- Definer rights permit this narrow SELECT without granting table access.
create function public.kairos_ai_allowance_status()
returns table (used integer, daily_limit integer, resets_at timestamptz, observed_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $function$
declare
  v_owner uuid := auth.uid();
  v_now timestamptz := statement_timestamp();
  v_day date := (v_now at time zone 'UTC')::date;
begin
  if v_owner is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  return query select coalesce((
    select usage.attempts from public.kairos_ai_daily_usage as usage
      where usage.user_id = v_owner and usage.usage_day = v_day
  ), 0), 20, (v_day + 1)::timestamp at time zone 'UTC', v_now;
end
$function$;
revoke all on function public.kairos_ai_allowance_status() from public, anon, authenticated, service_role;
grant execute on function public.kairos_ai_allowance_status() to authenticated;

notify pgrst, 'reload schema';
commit;
