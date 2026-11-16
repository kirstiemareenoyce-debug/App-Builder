-- Disposable local fixtures only. Never use this file against a live project.
begin;
do $test$
declare
  owner_id uuid := gen_random_uuid();
  other_id uuid := gen_random_uuid();
  r record;
  i integer;
  today date := (clock_timestamp() at time zone 'UTC')::date;
begin
  insert into auth.users values (owner_id), (other_id);
  -- The approved allowance must not implicitly enable paid AI.
  if (select daily_limit from public.kairos_ai_project_policy) <> 100 then
    raise exception 'Owner-approved allowance was not preserved';
  end if;
  set local role service_role;
  select * into r from public.reserve_kairos_ai_request(owner_id);
  if r.allowed or r.reason <> 'paused' or public.kairos_ai_request_enabled() then
    raise exception 'New installation must be paused';
  end if;
  -- The service can lock the policy but cannot change its controls.
  begin
    update public.kairos_ai_project_policy set paused = false, daily_limit = 100;
    raise exception 'Service role could enable or increase AI';
  exception when insufficient_privilege then null;
  end;
  reset role;
  update public.kairos_ai_project_policy set paused = false, daily_limit = 25;
  insert into public.kairos_ai_project_daily_usage values (today - 1, 25);
  set local timezone = 'Pacific/Honolulu';
  set local role service_role;
  for i in 1..20 loop
    select * into r from public.reserve_kairos_ai_request(owner_id);
    if not r.allowed or r.used <> i or r.project_used <> i
      or r.resets_at <> ((today + 1)::timestamp at time zone 'UTC') then
      raise exception 'Counters or UTC rollover incorrect';
    end if;
  end loop;
  select * into r from public.reserve_kairos_ai_request(owner_id);
  if r.allowed or r.reason <> 'user_limit' or r.project_used <> 20 then
    raise exception 'User denial consumed global allowance';
  end if;
  for i in 1..5 loop
    select * into r from public.reserve_kairos_ai_request(other_id);
    if not r.allowed or r.project_used <> 20 + i then raise exception 'Global count incorrect'; end if;
  end loop;
  select * into r from public.reserve_kairos_ai_request(other_id);
  if r.allowed or r.reason <> 'project_limit' or r.used <> 5 then
    raise exception 'Global denial consumed personal allowance';
  end if;
  reset role;
  -- Lowering a limit below already-consumed usage must block, not refund.
  update public.kairos_ai_project_policy set daily_limit = 1;
  set local role service_role;
  select * into r from public.reserve_kairos_ai_request(other_id);
  if r.allowed or r.project_used <> 25 then raise exception 'Limit decrease refunded usage'; end if;
  reset role;
  update public.kairos_ai_project_policy set paused = true;
  set local role service_role;
  if public.kairos_ai_request_enabled() then raise exception 'Pause check ignored owner pause'; end if;
  reset role;
  delete from auth.users where id = owner_id;
  if (select attempts from public.kairos_ai_project_daily_usage where usage_day = today) <> 25 then
    raise exception 'Account deletion refunded aggregate usage';
  end if;

  for i in 1..2 loop
    if i = 1 then set local role anon; else set local role authenticated; end if;
    if has_function_privilege(current_user, 'public.reserve_kairos_ai_request(uuid)', 'EXECUTE')
      or has_function_privilege(current_user, 'public.kairos_ai_request_enabled()', 'EXECUTE') then
      raise exception 'Client can invoke budget functions';
    end if;
    if has_table_privilege(current_user, 'public.kairos_ai_project_policy', 'SELECT')
      or has_table_privilege(current_user, 'public.kairos_ai_project_policy', 'UPDATE')
      or has_table_privilege(current_user, 'public.kairos_ai_project_daily_usage', 'SELECT')
      or has_table_privilege(current_user, 'public.kairos_ai_project_daily_usage', 'INSERT')
      or has_table_privilege(current_user, 'public.kairos_ai_project_daily_usage', 'UPDATE')
      or has_table_privilege(current_user, 'public.kairos_ai_project_daily_usage', 'DELETE') then
      raise exception 'Client can inspect or change project budget';
    end if;
    reset role;
  end loop;
  -- Both tables must fail closed even if a client receives table grants later.
  if exists (select 1 from pg_class where oid in (
      'public.kairos_ai_project_policy'::regclass,
      'public.kairos_ai_project_daily_usage'::regclass)
    and not (relrowsecurity and relforcerowsecurity)) then
    raise exception 'Project budget RLS not forced';
  end if;
  delete from public.kairos_ai_project_policy;
  set local role service_role;
  if public.kairos_ai_request_enabled() is not null then raise exception 'Missing policy enabled AI'; end if;
  begin
    perform public.reserve_kairos_ai_request(other_id);
    raise exception 'Missing policy allowed reservation';
  exception when no_data_found then null;
  end;
end
$test$;
rollback;
