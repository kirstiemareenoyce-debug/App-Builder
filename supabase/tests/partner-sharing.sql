-- Disposable local database ONLY. Synthetic users and every change roll back.
begin;
do $test$
declare
  a uuid := gen_random_uuid();
  b uuid := gen_random_uuid();
  outsider uuid := gen_random_uuid();
  connection_id uuid;
  replacement_id uuid;
  v_entry_id uuid := gen_random_uuid();
  share_id uuid;
  revision timestamptz;
  old_revision timestamptz;
  affected integer;
  shared_body text;
begin
  insert into auth.users(id) values (a), (b), (outsider);
  perform set_config('request.jwt.claim.sub', a::text, true);
  set local role authenticated;
  insert into public.aevum_relationship_entries(id,user_id,category,title,body)
  values(v_entry_id,a,'support_archive','Synthetic support preferences','Original reviewed version');
  select updated_at into revision from public.aevum_relationship_entries where id=v_entry_id;
  insert into public.partner_connections(requester_id,recipient_id)
  values(a,b) returning id into connection_id;
  begin
    insert into public.partner_connections(requester_id,recipient_id) values(a,a);
    raise exception 'Self invitation allowed';
  exception when check_violation or insufficient_privilege then null;
  end;
  begin
    insert into public.partner_connections(requester_id,recipient_id,status) values(a,outsider,'accepted');
    raise exception 'Accepted invitation injection allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.partner_connections set status='accepted' where id=connection_id;
    raise exception 'Direct status bypass allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.set_aevum_partner_connection(connection_id,'accepted');
    raise exception 'Requester accepted their own invitation';
  exception when insufficient_privilege then null;
  end;
  insert into public.aevum_consents(user_id,scope,version,granted,granted_at)
  values(a,'partner_sharing','aevum-entry-sharing-v1',true,now());
  begin
    perform public.share_aevum_entry(v_entry_id,connection_id,revision);
    raise exception 'Pending connection could share';
  exception when insufficient_privilege then null;
  end;
  perform set_config('request.jwt.claim.sub', outsider::text, true);
  select count(*) into affected from public.partner_connections where id=connection_id;
  if affected<>0 then raise exception 'Outsider read connection'; end if;
  begin
    perform public.set_aevum_partner_connection(connection_id,'accepted');
    raise exception 'Outsider accepted invitation';
  exception when insufficient_privilege then null;
  end;
  perform set_config('request.jwt.claim.sub', b::text, true);
  begin
    insert into public.partner_connections(requester_id,recipient_id) values(b,a);
    raise exception 'Reverse duplicate invitation allowed';
  exception when unique_violation then null;
  end;
  begin
    insert into public.partner_connections(requester_id,recipient_id) values(a,outsider);
    raise exception 'Requester impersonation allowed';
  exception when insufficient_privilege then null;
  end;
  perform public.set_aevum_partner_connection(connection_id,'accepted');
  select count(*) into affected from public.aevum_relationship_shares;
  if affected<>0 then raise exception 'Accepting auto-shared content'; end if;
  select count(*) into affected from public.aevum_relationship_entries where id=v_entry_id;
  if affected<>0 then raise exception 'Partner read private draft'; end if;
  select count(*) into affected from public.aevum_consents where user_id=a;
  if affected<>0 then raise exception 'Partner read private consent'; end if;

  perform set_config('request.jwt.claim.sub', a::text, true);
  select id into share_id from public.share_aevum_entry(v_entry_id,connection_id,revision);
  -- Edits must remain private until this exact revision is reviewed again.
  old_revision:=revision;
  update public.aevum_relationship_entries set body='Private later edit' where id=v_entry_id;
  select updated_at into revision from public.aevum_relationship_entries where id=v_entry_id;
  begin
    perform public.share_aevum_entry(v_entry_id,connection_id,old_revision);
    raise exception 'Stale review was shared';
  exception when invalid_parameter_value then null;
  end;
  perform set_config('request.jwt.claim.sub', b::text, true);
  select body into shared_body from public.aevum_relationship_shares where id=share_id;
  if shared_body is distinct from 'Original reviewed version' then raise exception 'Snapshot changed with draft'; end if;
  begin
    update public.aevum_relationship_shares set body='Recipient tampering' where id=share_id;
    raise exception 'Recipient edited snapshot';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.share_aevum_entry(v_entry_id,connection_id,revision);
    raise exception 'Partner reshared another owner draft';
  exception when no_data_found then null;
  end;
  if public.revoke_aevum_entry(v_entry_id)<>0 then raise exception 'Partner revoked owner share'; end if;
  perform set_config('request.jwt.claim.sub', outsider::text, true);
  select count(*) into affected from public.aevum_relationship_shares where id=share_id;
  if affected<>0 or public.can_read_aevum_relationship_share(share_id)
    then raise exception 'Outsider read snapshot'; end if;

  perform set_config('request.jwt.claim.sub', a::text, true);
  perform public.share_aevum_entry(v_entry_id,connection_id,revision);
  if public.revoke_aevum_entry(v_entry_id)<>1 then raise exception 'Owner revoke failed'; end if;
  perform set_config('request.jwt.claim.sub', b::text, true);
  select count(*) into affected from public.aevum_relationship_shares where id=share_id;
  if affected<>0 then raise exception 'Revoke left recipient access'; end if;

  perform set_config('request.jwt.claim.sub', a::text, true);
  perform public.share_aevum_entry(v_entry_id,connection_id,revision);
  update public.aevum_consents set granted=false,revoked_at=now()
  where user_id=a and scope='partner_sharing';
  begin
    perform public.share_aevum_entry(v_entry_id,connection_id,revision);
    raise exception 'Withdrawn consent allowed sharing';
  exception when insufficient_privilege then null;
  end;
  -- Match the app's consent upsert; regrant must not revive old snapshots.
  insert into public.aevum_consents(user_id,scope,version,granted,granted_at,revoked_at)
  values(a,'partner_sharing','aevum-entry-sharing-v1',true,now(),null)
  on conflict(user_id,scope) do update set user_id=excluded.user_id,scope=excluded.scope,
    version=excluded.version,granted=excluded.granted,
    granted_at=excluded.granted_at,revoked_at=excluded.revoked_at;
  if exists(select 1 from public.aevum_relationship_shares where entry_id=v_entry_id)
    then raise exception 'Consent regrant revived old snapshot'; end if;
  perform public.share_aevum_entry(v_entry_id,connection_id,revision);
  delete from public.aevum_consents where user_id=a and scope='partner_sharing';
  if exists(select 1 from public.aevum_relationship_shares s where s.entry_id=v_entry_id)
    then raise exception 'Consent deletion retained snapshot'; end if;
  insert into public.aevum_consents(user_id,scope,version,granted,granted_at)
  values(a,'partner_sharing','aevum-entry-sharing-v1',true,now());
  perform public.share_aevum_entry(v_entry_id,connection_id,revision);
  perform set_config('request.jwt.claim.sub', b::text, true);
  perform public.set_aevum_partner_connection(connection_id,'disconnected');
  if exists(select 1 from public.aevum_relationship_shares where id=share_id)
    then raise exception 'Disconnect retained snapshot'; end if;
  begin
    perform public.set_aevum_partner_connection(connection_id,'accepted');
    raise exception 'Old disconnected invitation was reactivated';
  exception when insufficient_privilege then null;
  end;
  perform set_config('request.jwt.claim.sub', a::text, true);
  if not exists(select 1 from public.aevum_relationship_entries e where e.id=v_entry_id)
    then raise exception 'Disconnect removed private entry'; end if;
  if exists(select 1 from public.aevum_relationship_shares s where s.entry_id=v_entry_id)
    then raise exception 'Disconnect retained owner snapshot'; end if;
  insert into public.partner_connections(requester_id,recipient_id)
  values(a,b) returning id into replacement_id;
  perform set_config('request.jwt.claim.sub', b::text, true);
  perform public.set_aevum_partner_connection(replacement_id,'rejected');
  perform set_config('request.jwt.claim.sub', a::text, true);
  insert into public.partner_connections(requester_id,recipient_id)
  values(a,b) returning id into replacement_id;
  perform public.set_aevum_partner_connection(replacement_id,'disconnected');
  insert into public.partner_connections(requester_id,recipient_id)
  values(a,b) returning id into replacement_id;
  perform set_config('request.jwt.claim.sub', b::text, true);
  perform public.set_aevum_partner_connection(replacement_id,'accepted');
  perform set_config('request.jwt.claim.sub', a::text, true);
  perform public.share_aevum_entry(v_entry_id,replacement_id,revision);
  delete from public.aevum_relationship_entries e where e.id=v_entry_id;
  if exists(select 1 from public.aevum_relationship_shares s where s.entry_id=v_entry_id)
    then raise exception 'Entry deletion retained shared snapshot'; end if;
  reset role;
  if exists(select 1 from public.aevum_relationship_shares s where s.owner_id=a)
    then raise exception 'Snapshot cleanup failed'; end if;
  if has_table_privilege('anon','public.partner_connections','SELECT')
    or has_function_privilege('anon','public.share_aevum_entry(uuid,uuid,timestamp with time zone)','EXECUTE')
    or has_table_privilege('authenticated','public.aevum_relationship_shares','INSERT')
    or has_table_privilege('authenticated','public.partner_connections','UPDATE')
    or has_table_privilege('service_role','public.aevum_relationship_entries','SELECT')
    then raise exception 'Unexpected direct access grant'; end if;
end $test$;
rollback;
