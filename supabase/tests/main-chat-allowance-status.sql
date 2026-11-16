-- Disposable local fixtures only. Never run against the owner's live project.
begin;
do $test$
declare
  owner_id uuid := gen_random_uuid();
  other_id uuid := gen_random_uuid();
  fresh_id uuid := gen_random_uuid();
  today date := (statement_timestamp() at time zone 'UTC')::date;
  r record;
  before_usage jsonb;
  before_project jsonb;
  zone text;
  i integer;
begin
  insert into auth.users values (owner_id), (other_id), (fresh_id);
  insert into public.kairos_ai_daily_usage values
    (owner_id, today, 3), (other_id, today, 19), (fresh_id, today - 1, 20);
  select jsonb_agg(to_jsonb(u) order by user_id, usage_day) into before_usage
    from public.kairos_ai_daily_usage u;
  select jsonb_agg(to_jsonb(u) order by usage_day) into before_project
    from public.kairos_ai_project_daily_usage u;
  if not has_function_privilege('authenticated', 'public.kairos_ai_allowance_status()', 'EXECUTE')
    or has_function_privilege('anon', 'public.kairos_ai_allowance_status()', 'EXECUTE')
    or has_function_privilege('service_role', 'public.kairos_ai_allowance_status()', 'EXECUTE')
    or exists (select 1 from pg_proc where oid = 'public.kairos_ai_allowance_status()'::regprocedure
      and (pronargs <> 0 or not prosecdef or provolatile <> 's' or proconfig <> array['search_path=""'])) then
    raise exception 'Status function security contract changed';
  end if;
  perform set_config('request.jwt.claim.sub', owner_id::text, true);
  set local role authenticated;
  foreach zone in array array['Pacific/Honolulu', 'Pacific/Kiritimati', 'UTC'] loop
    perform set_config('TimeZone', zone, true);
    for i in 1..3 loop
      select * into strict r from public.kairos_ai_allowance_status();
      if r.used <> 3 or r.daily_limit <> 20
        or r.resets_at <> ((today + 1)::timestamp at time zone 'UTC')
        or r.observed_at <> statement_timestamp()
        or (select count(*) from jsonb_object_keys(to_jsonb(r))) <> 4 then
        raise exception 'Wrong owner, reset, count, or exposed aggregate data';
      end if;
    end loop;
  end loop;
  -- There is no identity-taking overload, even if a malicious client supplies one.
  begin
    execute 'select * from public.kairos_ai_allowance_status($1)' using other_id;
    raise exception 'Status accepted another identity';
  exception when undefined_function then null;
  end;
  begin
    perform public.reserve_kairos_ai_request(owner_id);
    raise exception 'Status access granted reservation rights';
  exception when insufficient_privilege then null;
  end;
  begin
    perform * from public.kairos_ai_daily_usage;
    raise exception 'Status access granted raw counter access';
  exception when insufficient_privilege then null;
  end;
  reset role;
  perform set_config('request.jwt.claim.sub', other_id::text, true);
  set local role authenticated;
  select * into strict r from public.kairos_ai_allowance_status();
  if r.used <> 19 then raise exception 'Account switch exposed wrong count'; end if;
  reset role;
  perform set_config('request.jwt.claim.sub', fresh_id::text, true);
  set local role authenticated;
  select * into strict r from public.kairos_ai_allowance_status();
  if r.used <> 0 then raise exception 'Yesterday leaked into new UTC day'; end if;
  reset role;
  update public.kairos_ai_daily_usage set attempts = 20 where user_id = owner_id;
  perform set_config('request.jwt.claim.sub', owner_id::text, true);
  set local role authenticated;
  select * into strict r from public.kairos_ai_allowance_status();
  if r.used <> 20 then raise exception 'Exhaustion was not readable'; end if;
  reset role;
  update public.kairos_ai_daily_usage set attempts = 3 where user_id = owner_id;
  perform set_config('request.jwt.claim.sub', '', true);
  set local role authenticated;
  begin
    perform * from public.kairos_ai_allowance_status();
    raise exception 'Missing identity returned status';
  exception when invalid_authorization_specification then null;
  end;
  reset role;
  set local role anon;
  begin
    perform * from public.kairos_ai_allowance_status();
    raise exception 'Anonymous status read was allowed';
  exception when insufficient_privilege then null;
  end;
  reset role;
  if before_usage is distinct from (select jsonb_agg(to_jsonb(u) order by user_id, usage_day)
      from public.kairos_ai_daily_usage u)
    or before_project is distinct from (select jsonb_agg(to_jsonb(u) order by usage_day)
      from public.kairos_ai_project_daily_usage u) then
    raise exception 'Reading status changed counters';
  end if;
end
$test$;
rollback;
