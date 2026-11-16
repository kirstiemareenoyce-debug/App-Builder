-- Disposable-local fixture only. Never reads or deletes real user messages.
-- The runner supplies an empty auth.users table and rolls everything back.
begin;
do $test$
declare
  owner_id uuid := gen_random_uuid();
  other_id uuid := gen_random_uuid();
  pair_id uuid := gen_random_uuid();
  foreign_id uuid := gen_random_uuid();
  affected integer;
begin
  insert into auth.users (id) values (owner_id), (other_id);
  insert into public.kairos_ai_interactions (
    id, user_id, query, response, mode, provider,
    ai_use_consent_version, storage_consent_version, consented_at
  )
  select gen_random_uuid(), owner_id, 'Synthetic rollback-only question',
    'Synthetic fixture reply', 'learning', 'openai',
    'kairos-ai-use-v1', 'kairos-private-history-v1', now()
  from generate_series(1, 60);
  insert into public.kairos_ai_interactions (
    id, user_id, query, response, mode, provider,
    ai_use_consent_version, storage_consent_version, consented_at
  ) values
    (pair_id, owner_id, 'Synthetic pair', 'Synthetic reply', 'reflection', 'kimi',
      'kairos-ai-use-v1', 'kairos-private-history-v1', now()),
    (foreign_id, other_id, 'Synthetic other owner', 'Synthetic reply', 'learning', 'openai',
      'kairos-ai-use-v1', 'kairos-private-history-v1', now());

  perform set_config('request.jwt.claim.sub', owner_id::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', owner_id, 'role', 'authenticated')::text, true);
  set local role authenticated;
  -- Even a guessed foreign ID and an unrestricted DELETE are constrained by RLS.
  delete from public.kairos_ai_interactions where id = foreign_id;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Could delete another account pair'; end if;
  delete from public.kairos_ai_interactions where user_id = other_id;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Could clear another account history'; end if;
  delete from public.kairos_ai_interactions where user_id = owner_id and id = pair_id;
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'Owner pair delete failed'; end if;
  select count(*) into affected from public.kairos_ai_interactions where user_id = owner_id;
  if affected <> 60 then raise exception 'Pair delete changed other exchanges'; end if;
  delete from public.kairos_ai_interactions where user_id = owner_id;
  get diagnostics affected = row_count;
  if affected <> 60 then raise exception 'Clear did not delete beyond the latest 50'; end if;
  delete from public.kairos_ai_interactions where user_id = owner_id;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Empty clear was not idempotent'; end if;
  reset role;
  select count(*) into affected from public.kairos_ai_interactions where id = foreign_id;
  if affected <> 1 then raise exception 'Clear changed another owner history'; end if;
end
$test$;
rollback;
