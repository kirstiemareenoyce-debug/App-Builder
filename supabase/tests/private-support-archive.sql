-- Live-safe: uses one account ID internally, never reads its saved content.
-- Only synthetic entries are touched. No account is created. Always rolls back.
begin;
do $test$
declare
  owner_id uuid;
  other_id uuid := gen_random_uuid();
  first_id uuid := gen_random_uuid();
  second_id uuid := gen_random_uuid();
  affected integer;
  before_revision timestamptz;
  after_revision timestamptz;
begin
  select id into owner_id from auth.users order by created_at limit 1;
  if owner_id is null then raise exception 'A signed-in account is required for this check'; end if;
  if has_table_privilege('anon', 'public.aevum_relationship_entries', 'SELECT')
    or has_table_privilege('anon', 'public.aevum_relationship_entries', 'INSERT')
    or has_table_privilege('service_role', 'public.aevum_relationship_entries', 'SELECT')
  then raise exception 'Unexpected non-owner role grant'; end if;
  if not exists (
    select 1 from pg_class
    where oid = 'public.aevum_relationship_entries'::regclass
      and relrowsecurity and relforcerowsecurity
  ) then raise exception 'Row security must be enabled and forced'; end if;

  perform set_config('request.jwt.claim.sub', owner_id::text, true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', owner_id, 'role', 'authenticated')::text, true);
  set local role authenticated;

  insert into public.aevum_relationship_entries (id, user_id, category, title, body)
  values
    (first_id, owner_id, 'support_archive', 'Synthetic privacy test', 'Synthetic text only'),
    (second_id, owner_id, 'support_archive', 'Synthetic separate version', 'Synthetic version two');
  select count(*) into affected from public.aevum_relationship_entries
    where id in (first_id, second_id);
  if affected <> 2 then raise exception 'Owner insert/read or separate versions failed'; end if;
  select updated_at into before_revision from public.aevum_relationship_entries where id = first_id;
  update public.aevum_relationship_entries set body = 'Synthetic edited text' where id = first_id;
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'Owner update failed'; end if;
  select updated_at into after_revision from public.aevum_relationship_entries
    where id = first_id and body = 'Synthetic edited text';
  if after_revision is null or after_revision <= before_revision
    then raise exception 'Edit did not advance revision'; end if;
  begin
    update public.aevum_relationship_entries set user_id = other_id where id = first_id;
    raise exception 'Owner reassignment was allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.aevum_relationship_entries set id = gen_random_uuid() where id = first_id;
    raise exception 'Identity mutation was allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.aevum_relationship_entries (user_id, category, title, body)
    values (owner_id, 'support_archive', '', 'Synthetic invalid title');
    raise exception 'Invalid title was allowed';
  exception when check_violation then null;
  end;

  perform set_config('request.jwt.claim.sub', other_id::text, true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', other_id, 'role', 'authenticated')::text, true);
  select count(*) into affected from public.aevum_relationship_entries where id in (first_id, second_id);
  if affected <> 0 then raise exception 'Another account could read entries'; end if;
  update public.aevum_relationship_entries set body = 'Forbidden edit' where id = first_id;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Another account could edit entries'; end if;
  delete from public.aevum_relationship_entries where id = first_id;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Another account could delete entries'; end if;
  begin
    insert into public.aevum_relationship_entries (user_id, category, title, body)
    values (owner_id, 'support_archive', 'Forbidden owner', 'Synthetic impersonation');
    raise exception 'Another account could insert for the owner';
  exception when insufficient_privilege then null;
  end;

  perform set_config('request.jwt.claim.sub', owner_id::text, true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', owner_id, 'role', 'authenticated')::text, true);
  delete from public.aevum_relationship_entries where id = first_id;
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'Owner delete failed'; end if;
  select count(*) into affected from public.aevum_relationship_entries where id = second_id;
  if affected <> 1 then raise exception 'Deleting one version changed another'; end if;
  delete from public.aevum_relationship_entries where id = second_id;
  reset role;
end
$test$;
rollback;
