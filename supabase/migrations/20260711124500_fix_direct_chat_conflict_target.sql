-- Avoid PL/pgSQL ambiguity with RETURNS TABLE output columns by naming the
-- direct_chat_reads primary-key constraint in the conflict target.

create or replace function public.send_direct_chat_message(p_other_user_id integer, p_body text)
returns table (
  id_direct_message bigint,
  id_direct_conversation bigint,
  id_sender integer,
  body text,
  created_at timestamptz,
  first_name text,
  last_name text,
  email text,
  profile_url text,
  subscription_status text,
  last_seen_at timestamptz,
  is_online boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id integer := public.current_app_user_id();
  v_conversation_id bigint := public.ensure_direct_conversation(p_other_user_id);
  v_message_id bigint;
  v_body text := nullif(trim(p_body), '');
begin
  if v_body is null then
    raise exception 'Message cannot be empty.';
  end if;
  if length(v_body) > 500 then
    raise exception 'Message must be 500 characters or fewer.';
  end if;

  insert into public.direct_chat_messages (id_direct_conversation, id_sender, body)
  values (v_conversation_id, v_user_id, v_body)
  returning direct_chat_messages.id_direct_message into v_message_id;

  update public.direct_conversations
  set updated_at = now()
  where direct_conversations.id_direct_conversation = v_conversation_id;

  insert into public.direct_chat_reads (id_direct_conversation, id_user, last_read_at)
  values (v_conversation_id, v_user_id, now())
  on conflict on constraint direct_chat_reads_pkey
  do update set last_read_at = excluded.last_read_at;

  perform public.touch_my_presence();

  return query
  select msg.*
  from public.list_direct_chat_messages(p_other_user_id) as msg
  where msg.id_direct_message = v_message_id;
end;
$$;

grant execute on function public.send_direct_chat_message(integer, text) to authenticated;

notify pgrst, 'reload schema';
