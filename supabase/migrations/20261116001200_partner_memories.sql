-- Focused activation of the imported Partner Hub song/photo memory contract.
-- Keep the existing external Supabase storage architecture; no provider OAuth.
begin;
create table public.relationship_media_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('song', 'photo')),
  provider text not null check (provider in ('spotify','soundcloud','youtube_music','device_gallery','other_link')),
  title text not null check (char_length(title) between 1 and 120 and char_length(btrim(title)) > 0),
  note text not null default '' check (char_length(note) <= 500),
  external_url text check (external_url is null or (
    char_length(external_url) <= 1000 and external_url ~ '^https://[^[:space:]/?#@]+[^[:space:]]*$'
  )),
  object_path text,
  mime_type text,
  byte_size bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  check (
    (kind='song' and provider in ('spotify','soundcloud','youtube_music','other_link')
      and external_url is not null and object_path is null and mime_type is null and byte_size is null)
    or
    (kind='photo' and provider='device_gallery' and external_url is null
      and object_path is not null and object_path like user_id::text || '/%'
      and mime_type is not null and mime_type in ('image/jpeg','image/png','image/webp')
      and byte_size is not null and byte_size between 1 and 10485760)
  )
);
create table public.relationship_media_shares (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  connection_id uuid not null references public.partner_connections(id) on delete cascade,
  kind text not null check (kind in ('song','photo')),
  provider text not null check (provider in ('spotify','soundcloud','youtube_music','device_gallery','other_link')),
  title text not null check (char_length(title) between 1 and 120),
  note text not null default '' check (char_length(note) <= 500),
  external_url text,
  object_path text,
  mime_type text,
  byte_size bigint,
  shared_at timestamptz not null default now(),
  unique (item_id,connection_id),
  check (owner_id <> recipient_id),
  foreign key(item_id,owner_id) references public.relationship_media_items(id,user_id) on delete cascade
);
create index relationship_media_items_owner_updated_idx on public.relationship_media_items(user_id,updated_at desc);
create index relationship_media_shares_owner_idx on public.relationship_media_shares(owner_id,shared_at desc);
create index relationship_media_shares_recipient_idx on public.relationship_media_shares(recipient_id,connection_id,shared_at desc);
create index relationship_media_shares_path_idx on public.relationship_media_shares(object_path) where object_path is not null;
alter table public.relationship_media_items enable row level security;
alter table public.relationship_media_items force row level security;
alter table public.relationship_media_shares enable row level security;
alter table public.relationship_media_shares force row level security;
revoke all on public.relationship_media_items,public.relationship_media_shares from public,anon,authenticated,service_role;
grant select,insert,update,delete on public.relationship_media_items to authenticated;
grant select on public.relationship_media_shares to authenticated;
create policy relationship_media_items_owner on public.relationship_media_items
for all to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);

create function public.protect_relationship_media_identity()
returns trigger language plpgsql security invoker set search_path=''
as $$ begin
  if new.id is distinct from old.id or new.user_id is distinct from old.user_id
    or new.created_at is distinct from old.created_at then
    raise exception using errcode='42501',message='Relationship media identity cannot be changed';
  end if;
  new.updated_at:=greatest(pg_catalog.clock_timestamp(),old.updated_at+interval '1 microsecond');
  return new;
end $$;
create trigger relationship_media_items_identity before update on public.relationship_media_items
for each row execute function public.protect_relationship_media_identity();

create function public.can_read_relationship_media_share(p_share_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$
  select auth.uid() is not null and exists(
    select 1 from public.relationship_media_shares s
    join public.partner_connections pc on pc.id=s.connection_id
    join public.aevum_consents c on c.user_id=s.owner_id and c.scope='partner_sharing'
    where s.id=p_share_id and s.recipient_id=auth.uid() and pc.status='accepted'
      and ((pc.requester_id=s.owner_id and pc.recipient_id=s.recipient_id)
        or (pc.recipient_id=s.owner_id and pc.requester_id=s.recipient_id))
      and c.granted and c.revoked_at is null
  )
$$;
create policy relationship_media_shares_read on public.relationship_media_shares
for select to authenticated
using((select auth.uid())=owner_id or public.can_read_relationship_media_share(id));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('relationship-memories','relationship-memories',false,10485760,
  array['image/jpeg','image/png','image/webp']);
create policy relationship_memory_photo_insert_owner on storage.objects
for insert to authenticated with check(
  bucket_id='relationship-memories' and (storage.foldername(name))[1]=(select auth.uid())::text
  -- A deleted shared photo must not be replaced behind an old reviewed snapshot.
  and not exists(select 1 from public.relationship_media_shares s where s.object_path=name)
);
create policy relationship_memory_photo_select_owner_or_recipient on storage.objects
for select to authenticated using(
  bucket_id='relationship-memories' and (
    (storage.foldername(name))[1]=(select auth.uid())::text
    or exists(select 1 from public.relationship_media_shares s
      where s.object_path=name and s.recipient_id=(select auth.uid())
        and public.can_read_relationship_media_share(s.id))
  )
);
create policy relationship_memory_photo_delete_owner on storage.objects
for delete to authenticated using(
  bucket_id='relationship-memories' and (storage.foldername(name))[1]=(select auth.uid())::text
);

create function public.clear_relationship_media_shares_on_consent_withdrawal()
returns trigger language plpgsql security definer set search_path=''
as $$ begin
  if old.scope='partner_sharing' then
    if tg_op='DELETE' then
      delete from public.relationship_media_shares where owner_id=old.user_id;
    elsif not new.granted or new.revoked_at is not null then
      delete from public.relationship_media_shares where owner_id=old.user_id;
    end if;
  end if;
  return null;
end $$;
create trigger relationship_media_shares_clear_on_consent_withdrawal
after update or delete on public.aevum_consents for each row
execute function public.clear_relationship_media_shares_on_consent_withdrawal();
create function public.clear_relationship_media_shares_on_disconnect()
returns trigger language plpgsql security definer set search_path=''
as $$ begin
  if new.status<>'accepted' then
    delete from public.relationship_media_shares where connection_id=old.id;
  end if;
  return null;
end $$;
create trigger partner_connections_clear_media after update of status on public.partner_connections
for each row execute function public.clear_relationship_media_shares_on_disconnect();

create function public.share_relationship_media(p_item_id uuid,p_connection_id uuid,p_expected_updated_at timestamptz)
returns public.relationship_media_shares
language plpgsql security definer set search_path=''
as $$
declare
  v_owner_id uuid:=auth.uid();
  v_item public.relationship_media_items;
  v_connection public.partner_connections;
  v_recipient_id uuid;
  v_share public.relationship_media_shares;
begin
  if v_owner_id is null then
    raise exception using errcode='42501',message='Authentication required';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('relationship_media:'||v_owner_id::text,0));
  select * into v_item from public.relationship_media_items
    where id=p_item_id and user_id=v_owner_id for update;
  if not found then raise exception using errcode='P0002',message='Relationship media unavailable'; end if;
  if v_item.updated_at is distinct from p_expected_updated_at then
    raise exception using errcode='22023',message='Memory changed since review';
  end if;
  select * into v_connection from public.partner_connections where id=p_connection_id
    and status='accepted' and v_owner_id in(requester_id,recipient_id) for share;
  if not found then raise exception using errcode='42501',message='Accepted participant connection required'; end if;
  v_recipient_id:=case when v_connection.requester_id=v_owner_id
    then v_connection.recipient_id else v_connection.requester_id end;
  perform 1 from public.aevum_consents where user_id=v_owner_id
    and scope='partner_sharing' and granted and revoked_at is null for share;
  if not found then raise exception using errcode='42501',message='Partner sharing consent required'; end if;
  if v_item.kind='photo' and not exists(select 1 from storage.objects
    where bucket_id='relationship-memories' and name=v_item.object_path) then
    raise exception using errcode='P0002',message='Private photo file unavailable';
  end if;
  insert into public.relationship_media_shares as s (
    item_id,owner_id,recipient_id,connection_id,kind,provider,title,note,
    external_url,object_path,mime_type,byte_size,shared_at)
  values(v_item.id,v_owner_id,v_recipient_id,v_connection.id,v_item.kind,v_item.provider,
    v_item.title,v_item.note,v_item.external_url,v_item.object_path,v_item.mime_type,
    v_item.byte_size,pg_catalog.clock_timestamp())
  on conflict(item_id,connection_id) do update set recipient_id=excluded.recipient_id,
    kind=excluded.kind,provider=excluded.provider,title=excluded.title,note=excluded.note,
    external_url=excluded.external_url,object_path=excluded.object_path,
    mime_type=excluded.mime_type,byte_size=excluded.byte_size,shared_at=excluded.shared_at
  where s.owner_id=v_owner_id returning * into v_share;
  if not found then raise exception using errcode='42501',message='Snapshot ownership mismatch'; end if;
  return v_share;
end $$;
create function public.revoke_relationship_media(p_item_id uuid)
returns integer language plpgsql security definer set search_path=''
as $$
declare v_owner_id uuid:=auth.uid(); v_deleted integer;
begin
  if v_owner_id is null then raise exception using errcode='42501',message='Authentication required'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('relationship_media:'||v_owner_id::text,0));
  delete from public.relationship_media_shares where item_id=p_item_id and owner_id=v_owner_id;
  get diagnostics v_deleted=row_count;
  return v_deleted;
end $$;
alter function public.can_read_relationship_media_share(uuid) owner to postgres;
alter function public.clear_relationship_media_shares_on_consent_withdrawal() owner to postgres;
alter function public.clear_relationship_media_shares_on_disconnect() owner to postgres;
alter function public.share_relationship_media(uuid,uuid,timestamptz) owner to postgres;
alter function public.revoke_relationship_media(uuid) owner to postgres;
revoke all on function public.protect_relationship_media_identity(),
  public.can_read_relationship_media_share(uuid),
  public.clear_relationship_media_shares_on_consent_withdrawal(),
  public.clear_relationship_media_shares_on_disconnect(),
  public.share_relationship_media(uuid,uuid,timestamptz),
  public.revoke_relationship_media(uuid) from public,anon,authenticated,service_role;
grant execute on function public.can_read_relationship_media_share(uuid),
  public.share_relationship_media(uuid,uuid,timestamptz),
  public.revoke_relationship_media(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
