-- Tests only synthetic rows in the newly added table. All changes roll back.
-- No account is created, no existing message is read, and no provider is called.
begin;
do $test$
declare
  owner_id uuid;
  other_id uuid := gen_random_uuid();
  test_id uuid := gen_random_uuid();
  affected integer;
begin
  select id into owner_id from auth.users order by created_at limit 1;
  if owner_id is null then raise exception 'A signed-up account is required for the FK test'; end if;
  if has_table_privilege('anon', 'public.kairos_ai_interactions', 'SELECT')
    or has_table_privilege('authenticated', 'public.kairos_ai_interactions', 'INSERT')
    or has_table_privilege('authenticated', 'public.kairos_ai_interactions', 'UPDATE')
    or has_table_privilege('authenticated', 'public.ai_provider_runtime_state', 'SELECT')
    or has_table_privilege('anon', 'public.ai_provider_runtime_state', 'SELECT')
  then raise exception 'Unexpected table grant'; end if;
  if not has_table_privilege('service_role', 'public.kairos_ai_interactions', 'INSERT')
    or not has_table_privilege('service_role', 'public.ai_provider_runtime_state', 'UPDATE')
  then raise exception 'Required server grants are missing'; end if;

  insert into public.kairos_ai_interactions (
    id, user_id, query, response, mode, provider,
    ai_use_consent_version, storage_consent_version, consented_at
  ) values (
    test_id, owner_id, 'Synthetic rollback-only privacy test',
    'Not an AI response', 'learning', 'openai',
    'kairos-ai-use-v1', 'kairos-private-history-v1', now()
  );
  perform set_config('request.jwt.claim.sub', owner_id::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', owner_id, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into affected from public.kairos_ai_interactions where id = test_id;
  if affected <> 1 then raise exception 'Owner cannot read own synthetic row'; end if;
  begin
    insert into public.kairos_ai_interactions (
      user_id, query, response, mode, provider, ai_use_consent_version, storage_consent_version, consented_at
    ) values (owner_id, 'blocked', 'blocked', 'learning', 'openai',
      'kairos-ai-use-v1', 'kairos-private-history-v1', now());
    raise exception 'Client insert was incorrectly allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    perform provider from public.ai_provider_runtime_state;
    raise exception 'Client could read provider operational state';
  exception when insufficient_privilege then null;
  end;

  perform set_config('request.jwt.claim.sub', other_id::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', other_id, 'role', 'authenticated')::text, true);
  select count(*) into affected from public.kairos_ai_interactions where id = test_id;
  if affected <> 0 then raise exception 'Another owner could read the synthetic row'; end if;
  delete from public.kairos_ai_interactions where id = test_id;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Another owner could delete the synthetic row'; end if;

  perform set_config('request.jwt.claim.sub', owner_id::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', owner_id, 'role', 'authenticated')::text, true);
  delete from public.kairos_ai_interactions where id = test_id;
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'Owner could not delete own synthetic row'; end if;
  reset role;
end
$test$;
rollback;
