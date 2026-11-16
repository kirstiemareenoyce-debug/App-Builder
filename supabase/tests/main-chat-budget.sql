-- Rollback-only checks. No real account, message, provider, or financial data.
-- May be run after owner-approved installation; local runner needs no access.
begin;
do $test$
declare
  owner_id uuid := gen_random_uuid();
  other_id uuid := gen_random_uuid();
  reservation record;
  i integer;
  affected integer;
  today date := (clock_timestamp() at time zone 'UTC')::date;
begin
  -- Minimal synthetic auth fixtures; always rolled back along with counters.
  insert into auth.users (id) values (owner_id), (other_id);
  if has_function_privilege('anon', 'public.reserve_kairos_ai_request(uuid)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.reserve_kairos_ai_request(uuid)', 'EXECUTE')
    or not has_function_privilege('service_role', 'public.reserve_kairos_ai_request(uuid)', 'EXECUTE')
  then raise exception 'Unexpected budget function grants'; end if;
  if not exists (
    select 1 from pg_class where oid = 'public.kairos_ai_daily_usage'::regclass
      and relrowsecurity and relforcerowsecurity
  ) then raise exception 'Budget row security is not forced'; end if;

  -- Yesterday's exhausted allowance must not consume today's allowance.
  insert into public.kairos_ai_daily_usage values (owner_id, today - 1, 20);
  set local timezone = 'Pacific/Honolulu';
  set local role service_role;
  for i in 1..20 loop
    select * into reservation from public.reserve_kairos_ai_request(owner_id);
    if reservation.allowed is distinct from true or reservation.used <> i
      or reservation.daily_limit <> 20
      or reservation.resets_at <> ((today + 1)::timestamp at time zone 'UTC')
    then raise exception 'Reservation or UTC reset mismatch'; end if;
  end loop;
  for i in 1..5 loop
    select * into reservation from public.reserve_kairos_ai_request(owner_id);
    if reservation.allowed is distinct from false or reservation.used <> 20
    then raise exception 'Exhausted allowance was bypassed'; end if;
  end loop;
  select * into reservation from public.reserve_kairos_ai_request(other_id);
  if not reservation.allowed or reservation.used <> 1 then
    raise exception 'Other users must have independent allowances';
  end if;
  begin
    perform public.reserve_kairos_ai_request(null);
    raise exception 'Null owner was accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.reserve_kairos_ai_request(gen_random_uuid());
    raise exception 'Nonexistent owner was accepted';
  exception when foreign_key_violation then null;
  end;
  reset role;

  -- Client identities cannot read, forge, reset, or reserve anyone's budget.
  perform set_config('request.jwt.claim.sub', owner_id::text, true);
  for i in 1..2 loop
    if i = 1 then set local role anon; else set local role authenticated; end if;
    begin
      perform * from public.reserve_kairos_ai_request(owner_id);
      raise exception 'Client could reserve allowance';
    exception when insufficient_privilege then null;
    end;
    begin
      perform * from public.kairos_ai_daily_usage;
      raise exception 'Client could read usage';
    exception when insufficient_privilege then null;
    end;
    begin
      insert into public.kairos_ai_daily_usage values (other_id, today + 1, 1);
      raise exception 'Client could insert usage';
    exception when insufficient_privilege then null;
    end;
    begin
      update public.kairos_ai_daily_usage set attempts = 1 where user_id = owner_id;
      raise exception 'Client could refund usage';
    exception when insufficient_privilege then null;
    end;
    begin
      delete from public.kairos_ai_daily_usage where user_id = owner_id;
      raise exception 'Client could delete usage';
    exception when insufficient_privilege then null;
    end;
    reset role;
  end loop;
  -- Deleting history cannot refund a slot: usage has no history FK.
  delete from auth.users where id = owner_id;
  select count(*) into affected from public.kairos_ai_daily_usage where user_id = owner_id;
  if affected <> 0 then raise exception 'Account deletion did not cascade'; end if;
end
$test$;
rollback;
