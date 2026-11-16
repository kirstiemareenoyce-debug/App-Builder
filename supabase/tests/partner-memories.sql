-- Disposable-local fixture only, including simulated Storage row policies.
do $test$
declare
  a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); outsider uuid:=gen_random_uuid();
  conn uuid; song uuid:=gen_random_uuid(); photo uuid:=gen_random_uuid();
  revision timestamptz; old_revision timestamptz; shared uuid; affected integer;
  path text:=a::text||'/synthetic.png';
begin
  insert into auth.users(id) values(a),(b),(outsider);
  perform set_config('request.jwt.claim.sub',a::text,true);
  set local role authenticated;
  insert into public.partner_connections(requester_id,recipient_id) values(a,b) returning id into conn;
  insert into public.aevum_consents(user_id,scope,version,granted,granted_at)
    values(a,'partner_sharing','aevum-entry-sharing-v1',true,now());
  insert into public.relationship_media_items(id,user_id,kind,provider,title,external_url)
    values(song,a,'song','spotify','Synthetic song','https://open.spotify.com/track/synthetic');
  select updated_at into revision from public.relationship_media_items where id=song;
  begin
    perform public.share_relationship_media(song,conn,revision);
    raise exception 'Pending media share allowed';
  exception when insufficient_privilege then null;
  end;
  perform set_config('request.jwt.claim.sub',b::text,true);
  perform public.set_aevum_partner_connection(conn,'accepted');
  select count(*) into affected from public.relationship_media_items where id=song;
  if affected<>0 then raise exception 'Partner read private song'; end if;
  perform set_config('request.jwt.claim.sub',a::text,true);
  select id into shared from public.share_relationship_media(song,conn,revision);
  old_revision:=revision;
  update public.relationship_media_items set note='Private later note' where id=song;
  begin
    perform public.share_relationship_media(song,conn,old_revision);
    raise exception 'Stale media review allowed';
  exception when invalid_parameter_value then null;
  end;
  perform set_config('request.jwt.claim.sub',b::text,true);
  if not exists(select 1 from public.relationship_media_shares where id=shared and note='')
    then raise exception 'Song snapshot changed with private note'; end if;
  perform set_config('request.jwt.claim.sub',outsider::text,true);
  if exists(select 1 from public.relationship_media_shares where id=shared)
    then raise exception 'Outsider read song'; end if;
  perform set_config('request.jwt.claim.sub',a::text,true);
  perform public.revoke_relationship_media(song);

  insert into storage.objects(bucket_id,name) values('relationship-memories',path);
  begin
    insert into storage.objects(bucket_id,name) values('relationship-memories',b::text||'/forbidden.png');
    raise exception 'Owner uploaded to another folder';
  exception when insufficient_privilege then null;
  end;
  insert into public.relationship_media_items(id,user_id,kind,provider,title,object_path,mime_type,byte_size)
    values(photo,a,'photo','device_gallery','Synthetic photo',path,'image/png',68);
  select updated_at into revision from public.relationship_media_items where id=photo;
  perform set_config('request.jwt.claim.sub',b::text,true);
  if exists(select 1 from storage.objects where name=path)
    then raise exception 'Partner read unshared photo object'; end if;
  perform set_config('request.jwt.claim.sub',a::text,true);
  select id into shared from public.share_relationship_media(photo,conn,revision);
  perform set_config('request.jwt.claim.sub',b::text,true);
  if not exists(select 1 from storage.objects where name=path)
    then raise exception 'Recipient could not read reviewed photo'; end if;
  delete from storage.objects where name=path;
  get diagnostics affected=row_count;
  if affected<>0 then raise exception 'Recipient deleted owner photo'; end if;
  perform set_config('request.jwt.claim.sub',outsider::text,true);
  if exists(select 1 from storage.objects where name=path)
    then raise exception 'Outsider read photo object'; end if;
  perform set_config('request.jwt.claim.sub',a::text,true);
  -- Never permit a replacement behind a still-live snapshot at the same path.
  delete from storage.objects where name=path;
  begin
    insert into storage.objects(bucket_id,name) values('relationship-memories',path);
    raise exception 'Shared photo replacement bypass allowed';
  exception when insufficient_privilege then null;
  end;
  perform public.revoke_relationship_media(photo);
  insert into storage.objects(bucket_id,name) values('relationship-memories',path);
  perform public.share_relationship_media(photo,conn,revision);
  update public.aevum_consents set granted=false,revoked_at=now()
    where user_id=a and scope='partner_sharing';
  perform set_config('request.jwt.claim.sub',b::text,true);
  if exists(select 1 from storage.objects where name=path)
    then raise exception 'Consent withdrawal retained photo access'; end if;
  perform set_config('request.jwt.claim.sub',a::text,true);
  update public.aevum_consents set granted=true,granted_at=now(),revoked_at=null
    where user_id=a and scope='partner_sharing';
  if exists(select 1 from public.relationship_media_shares where item_id=photo)
    then raise exception 'Consent regrant revived photo'; end if;
  perform public.share_relationship_media(photo,conn,revision);
  perform public.set_aevum_partner_connection(conn,'disconnected');
  if exists(select 1 from public.relationship_media_shares where item_id=photo)
    then raise exception 'Disconnect retained photo snapshot'; end if;
  perform set_config('request.jwt.claim.sub',b::text,true);
  if exists(select 1 from storage.objects where name=path)
    then raise exception 'Disconnected partner retained file access'; end if;
  perform set_config('request.jwt.claim.sub',a::text,true);
  delete from public.relationship_media_items where id=photo;
  delete from storage.objects where name=path;
  reset role;
  if exists(select 1 from storage.objects where name=path)
    then raise exception 'Owner file deletion failed'; end if;
  if (select public from storage.buckets where id='relationship-memories')
    then raise exception 'Memory bucket must not be public'; end if;
end $test$;
