-- Surface subscription status to public/search/chat profile payloads so Pro users
-- can be styled consistently in search results, navbar-opened profiles, and chat.

drop function if exists public.send_global_chat_message(text);
drop function if exists public.send_global_chat_message(text, text);
drop function if exists public.list_global_chat_messages();
drop function if exists public.list_global_chat_messages(text);
drop function if exists public.send_direct_chat_message(integer, text);
drop function if exists public.list_direct_chat_messages(integer);
drop function if exists public.list_my_direct_chats();
drop function if exists public.search_users_by_keywords(integer[]);
drop function if exists public.get_public_user_profile(integer);

create function public.get_public_user_profile(p_user_id integer)
returns table (
  id_user integer,
  supabase_uid text,
  first_name text,
  last_name text,
  date_of_birth date,
  location text,
  phone_number text,
  show_phone_number boolean,
  instagram text,
  show_instagram boolean,
  tiktok text,
  show_tiktok boolean,
  snapchat text,
  show_snapchat boolean,
  discord text,
  show_discord boolean,
  profile_url text,
  subscription_status text,
  last_seen_at timestamptz,
  is_online boolean,
  all_keyword_ids integer[],
  match_count integer
)
language sql
security definer
set search_path = public
as $$
  select
    u.id_user,
    u.supabase_uid,
    u.first_name::text,
    u.last_name::text,
    u.date_of_birth,
    u.location::text,
    u.phone_number::text,
    coalesce(u.show_phone_number, false),
    u.instagram::text,
    coalesce(u.show_instagram, true),
    u.tiktok::text,
    coalesce(u.show_tiktok, true),
    u.snapchat::text,
    coalesce(u.show_snapchat, true),
    u.discord::text,
    coalesce(u.show_discord, true),
    u.profile_url::text,
    coalesce(u.subscription_status, 'free')::text,
    u.last_seen_at,
    coalesce(u.last_seen_at > now() - interval '5 minutes', false) as is_online,
    coalesce(array_agg(distinct uk.id_keyword) filter (where uk.id_keyword is not null), '{}')::integer[],
    0
  from public.users u
  left join public.user_keywords uk on uk.id_user = u.id_user
  where u.id_user = p_user_id
    and coalesce(u.is_deleted, false) = false
    and coalesce(u.is_banned, false) = false
  group by u.id_user;
$$;

create function public.search_users_by_keywords(keyword_ids integer[])
returns table (
  id_user integer,
  supabase_uid text,
  first_name text,
  last_name text,
  date_of_birth date,
  location text,
  phone_number text,
  show_phone_number boolean,
  instagram text,
  show_instagram boolean,
  tiktok text,
  show_tiktok boolean,
  snapchat text,
  show_snapchat boolean,
  discord text,
  show_discord boolean,
  profile_url text,
  subscription_status text,
  last_seen_at timestamptz,
  is_online boolean,
  all_keyword_ids integer[],
  match_count integer
)
language sql
security definer
set search_path = public
as $$
  with requested as (
    select distinct id::integer as id_keyword
    from unnest(keyword_ids) as requested_ids(id)
    where id is not null and id > 0
  ),
  matches as (
    select uk.id_user, count(distinct uk.id_keyword)::integer as match_count
    from public.user_keywords uk
    join requested r on r.id_keyword = uk.id_keyword
    group by uk.id_user
  ),
  all_keywords as (
    select uk.id_user, array_agg(distinct uk.id_keyword order by uk.id_keyword)::integer[] as all_keyword_ids
    from public.user_keywords uk
    group by uk.id_user
  )
  select
    u.id_user,
    u.supabase_uid,
    u.first_name::text,
    u.last_name::text,
    u.date_of_birth,
    u.location::text,
    u.phone_number::text,
    coalesce(u.show_phone_number, false),
    u.instagram::text,
    coalesce(u.show_instagram, true),
    u.tiktok::text,
    coalesce(u.show_tiktok, true),
    u.snapchat::text,
    coalesce(u.show_snapchat, true),
    u.discord::text,
    coalesce(u.show_discord, true),
    u.profile_url::text,
    coalesce(u.subscription_status, 'free')::text,
    u.last_seen_at,
    coalesce(u.last_seen_at > now() - interval '5 minutes', false),
    coalesce(ak.all_keyword_ids, '{}')::integer[],
    m.match_count
  from matches m
  join public.users u on u.id_user = m.id_user
  left join all_keywords ak on ak.id_user = u.id_user
  where coalesce(u.is_deleted, false) = false
    and coalesce(u.is_banned, false) = false
  order by m.match_count desc, u.last_seen_at desc nulls last, u.id_user desc
  limit 100;
$$;

create function public.list_global_chat_messages(p_channel_key text default 'international')
returns table (
  id_chat_message bigint,
  id_user integer,
  body text,
  channel_key text,
  created_at timestamptz,
  first_name text,
  last_name text,
  email text,
  profile_url text,
  subscription_status text,
  last_seen_at timestamptz,
  is_online boolean
)
language sql
security definer
set search_path = public
as $$
  select
    m.id_chat_message,
    m.id_user,
    m.body,
    m.channel_key,
    m.created_at,
    u.first_name::text,
    u.last_name::text,
    u.email::text,
    u.profile_url::text,
    coalesce(u.subscription_status, 'free')::text,
    u.last_seen_at,
    coalesce(u.last_seen_at > now() - interval '5 minutes', false)
  from public.global_chat_messages m
  join public.users u on u.id_user = m.id_user
  where m.channel_key = coalesce(nullif(trim(p_channel_key), ''), 'international')
    and m.created_at >= now() - interval '7 days'
    and coalesce(u.is_deleted, false) = false
    and coalesce(u.is_banned, false) = false
  order by m.created_at asc
  limit 160;
$$;

create function public.send_global_chat_message(p_body text, p_channel_key text default 'international')
returns table (
  id_chat_message bigint,
  id_user integer,
  body text,
  channel_key text,
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
  v_message_id bigint;
  v_channel_key text := coalesce(nullif(trim(p_channel_key), ''), 'international');
  v_body text := nullif(trim(p_body), '');
begin
  if v_user_id is null then
    raise exception 'Sign in to send messages.';
  end if;
  if v_body is null then
    raise exception 'Message cannot be empty.';
  end if;
  if length(v_body) > 500 then
    raise exception 'Message must be 500 characters or fewer.';
  end if;

  insert into public.global_chat_messages (id_user, body, channel_key)
  values (v_user_id, v_body, v_channel_key)
  returning global_chat_messages.id_chat_message into v_message_id;

  perform public.touch_my_presence();

  return query
  select msg.*
  from public.list_global_chat_messages(v_channel_key) as msg
  where msg.id_chat_message = v_message_id;
end;
$$;

create function public.list_my_direct_chats()
returns table (
  id_direct_conversation bigint,
  other_user_id integer,
  first_name text,
  last_name text,
  email text,
  profile_url text,
  subscription_status text,
  last_seen_at timestamptz,
  is_online boolean,
  last_body text,
  last_message_at timestamptz,
  unread_count integer,
  total_messages integer
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
    coalesce(u.subscription_status, 'free')::text,
    u.last_seen_at,
    coalesce(u.last_seen_at > now() - interval '5 minutes', false),
    ms.last_body::text,
    ms.last_message_at,
    coalesce(ms.unread_count, 0),
    coalesce(ms.total_messages, 0)
  from conversations c
  join public.users u on u.id_user = c.other_id
  left join message_stats ms on ms.id_direct_conversation = c.id_direct_conversation
  where coalesce(u.is_deleted, false) = false
    and coalesce(u.is_banned, false) = false
  order by ms.last_message_at desc nulls last, c.updated_at desc;
$$;

create function public.list_direct_chat_messages(p_other_user_id integer)
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
    coalesce(u.subscription_status, 'free')::text,
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

create function public.send_direct_chat_message(p_other_user_id integer, p_body text)
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

grant execute on function public.get_public_user_profile(integer) to anon, authenticated;
grant execute on function public.search_users_by_keywords(integer[]) to authenticated;
grant execute on function public.list_global_chat_messages(text) to authenticated;
grant execute on function public.send_global_chat_message(text, text) to authenticated;
grant execute on function public.list_my_direct_chats() to authenticated;
grant execute on function public.list_direct_chat_messages(integer) to authenticated;
grant execute on function public.send_direct_chat_message(integer, text) to authenticated;

notify pgrst, 'reload schema';
