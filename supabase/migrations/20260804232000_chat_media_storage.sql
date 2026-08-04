-- Chat media support for compressed image uploads.
-- This intentionally keeps chat message table columns/RPC signatures unchanged;
-- media messages are stored as compact text envelopes in the existing body column.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chat-media',
  'chat-media',
  true,
  921600,
  array['image/jpeg']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

do $$
begin
  create policy "chat-media public read"
    on storage.objects
    for select
    using (bucket_id = 'chat-media');
exception
  when duplicate_object then null;
end $$;

create or replace function public.delete_chat_media_object_from_body()
returns trigger
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  payload jsonb;
  media_url text;
  object_path text;
begin
  if old.body is null or old.body not like 'lfp-media:v1:%' then
    return old;
  end if;

  begin
    payload := substring(old.body from length('lfp-media:v1:') + 1)::jsonb;
  exception
    when others then
      return old;
  end;

  if payload->>'type' <> 'image' then
    return old;
  end if;

  media_url := payload->>'url';
  if media_url is null or position('/storage/v1/object/public/chat-media/' in media_url) = 0 then
    return old;
  end if;

  object_path := split_part(media_url, '/storage/v1/object/public/chat-media/', 2);
  object_path := split_part(object_path, '?', 1);

  if object_path <> '' then
    delete from storage.objects
    where bucket_id = 'chat-media'
      and name = object_path;
  end if;

  return old;
end;
$$;

drop trigger if exists global_chat_messages_delete_chat_media on public.global_chat_messages;
create trigger global_chat_messages_delete_chat_media
  after delete on public.global_chat_messages
  for each row
  execute function public.delete_chat_media_object_from_body();

drop trigger if exists direct_chat_messages_delete_chat_media on public.direct_chat_messages;
create trigger direct_chat_messages_delete_chat_media
  after delete on public.direct_chat_messages
  for each row
  execute function public.delete_chat_media_object_from_body();

do $$
begin
  create policy "chat-media authenticated uploads own folder"
    on storage.objects
    for insert
    to authenticated
    with check (
      bucket_id = 'chat-media'
      and (storage.foldername(name))[1] = auth.uid()::text
    );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create policy "chat-media authenticated deletes own folder"
    on storage.objects
    for delete
    to authenticated
    using (
      bucket_id = 'chat-media'
      and (storage.foldername(name))[1] = auth.uid()::text
    );
exception
  when duplicate_object then null;
end $$;
