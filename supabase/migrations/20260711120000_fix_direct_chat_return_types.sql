-- Direct chat RPCs must return exactly the column types declared in RETURNS TABLE.
-- users.first_name/last_name/email/profile_url are varchar in the current schema,
-- so cast them to text before returning from PL/pgSQL functions.

create or replace function public.list_my_direct_chats()
returns table (
  id_direct_conversation bigint,
  other_user_id integer,
  first_name text,
  last_name text,
  email text,
  profile_url text,
  last_seen_at timestamptz,
  is_online boolean,
  last_body text,
  last_message_at timestamptz,
  unread_count integer,
  total_messages integer,
  has_connection_streak boolean
)
language sql
security definer
set search_path = public
as $$
  with me as (
    select public.current_app_user_id() as id_user
  ),
  conversations as (
    select
      c.*,
      case when c.user_one_id = me.id_user then c.user_two_id else c.user_one_id end as other_id
    from public.direct_conversations c
    cross join me
    where me.id_user is not null
      and me.id_user in (c.user_one_id, c.user_two_id)
  ),
  message_stats as (
    select
      c.id_direct_conversation,
      count(m.*)::integer as total_messages,
      count(distinct m.id_sender)::integer as distinct_senders,
      max(m.created_at) as last_message_at,
      (array_agg(m.body order by m.created_at desc))[1] as last_body,
      count(m.*) filter (
        where m.id_sender <> (select id_user from me)
          and m.created_at > coalesce(r.last_read_at, 'epoch'::timestamptz)
      )::integer as unread_count
    from conversations c
    left join public.direct_chat_messages m
      on m.id_direct_conversation = c.id_direct_conversation
      and coalesce(m.is_deleted, false) = false
    left join public.direct_chat_reads r
      on r.id_direct_conversation = c.id_direct_conversation
      and r.id_user = (select id_user from me)
    group by c.id_direct_conversation, r.last_read_at
  )
  select
    c.id_direct_conversation,
    u.id_user,
    u.first_name::text,
    u.last_name::text,
    u.email::text,
    u.profile_url::text,
    u.last_seen_at,
    coalesce(u.last_seen_at > now() - interval '5 minutes', false),
    ms.last_body::text,
    ms.last_message_at,
    coalesce(ms.unread_count, 0),
    coalesce(ms.total_messages, 0),
    coalesce(ms.total_messages, 0) >= 14 and coalesce(ms.distinct_senders, 0) >= 2
  from conversations c
  join public.users u on u.id_user = c.other_id
  left join message_stats ms on ms.id_direct_conversation = c.id_direct_conversation
  where coalesce(u.is_deleted, false) = false
    and coalesce(u.is_banned, false) = false
  order by ms.last_message_at desc nulls last, c.updated_at desc;
$$;

create or replace function public.list_direct_chat_messages(p_other_user_id integer)
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
  last_seen_at timestamptz,
  is_online boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conversation_id bigint := public.ensure_direct_conversation(p_other_user_id);
begin
  return query
  select
    m.id_direct_message,
    m.id_direct_conversation,
    m.id_sender,
    m.body,
    m.created_at,
    u.first_name::text,
    u.last_name::text,
    u.email::text,
    u.profile_url::text,
    u.last_seen_at,
    coalesce(u.last_seen_at > now() - interval '5 minutes', false)
  from public.direct_chat_messages m
  join public.users u on u.id_user = m.id_sender
  where m.id_direct_conversation = v_conversation_id
    and coalesce(m.is_deleted, false) = false
  order by m.created_at asc
  limit 200;
end;
$$;

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
  on conflict (id_direct_conversation, id_user)
  do update set last_read_at = excluded.last_read_at;

  perform public.touch_my_presence();

  return query
  select msg.*
  from public.list_direct_chat_messages(p_other_user_id) as msg
  where msg.id_direct_message = v_message_id;
end;
$$;

grant execute on function public.list_my_direct_chats() to authenticated;
grant execute on function public.list_direct_chat_messages(integer) to authenticated;
grant execute on function public.send_direct_chat_message(integer, text) to authenticated;

notify pgrst, 'reload schema';
