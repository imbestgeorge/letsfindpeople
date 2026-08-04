-- Rollback for 20260804232000_chat_media_storage.sql.
-- This removes uploaded chat images from the chat-media bucket.

drop trigger if exists direct_chat_messages_delete_chat_media on public.direct_chat_messages;
drop trigger if exists global_chat_messages_delete_chat_media on public.global_chat_messages;
drop function if exists public.delete_chat_media_object_from_body();

drop policy if exists "chat-media authenticated deletes own folder" on storage.objects;
drop policy if exists "chat-media authenticated uploads own folder" on storage.objects;
drop policy if exists "chat-media public read" on storage.objects;

delete from storage.objects
where bucket_id = 'chat-media';

delete from storage.buckets
where id = 'chat-media';
