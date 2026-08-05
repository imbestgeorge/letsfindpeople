-- Rollback for 20260805001000_chat_reports_blocks.sql.

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

drop function if exists public.list_admin_chat_reports(integer, integer);
drop function if exists public.report_chat_content(text, bigint, text, bigint);
drop function if exists public.delete_my_chat_message(text, bigint);
drop function if exists public.block_user_from_chat(bigint);
drop function if exists public.unhide_direct_conversation_for_me(bigint);
drop function if exists public.hide_direct_conversation_from_me(bigint);
drop function if exists public.list_my_chat_relationships();
drop function if exists public.lfp_extract_media_url(text);
drop function if exists public.lfp_extract_media_kind(text);

drop policy if exists "user_blocks related rows" on public.user_blocks;
drop policy if exists "direct_chat_hides own rows" on public.direct_chat_user_hides;
drop policy if exists "chat_reports admin read" on public.chat_reports;

drop table if exists public.user_blocks;
drop table if exists public.direct_chat_user_hides;
drop table if exists public.chat_reports;

drop function if exists public.lfp_is_current_user_admin();
drop function if exists public.lfp_current_user_id();
