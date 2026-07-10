-- Profile preview, usernames, gallery images, themed profiles, chat channels,
-- direct messages, chat reports, and lightweight presence.

alter table public.users
  add column if not exists username text,
  add column if not exists profile_gallery_urls jsonb not null default '[]'::jsonb,
  add column if not exists profile_theme text not null default 'violet',
  add column if not exists last_seen_at timestamptz;

update public.users
set username = 'user' || id_user::text
where username is null or username = '';

update public.users
set profile_theme = 'violet'
where profile_theme is null or profile_theme not in ('violet', 'ocean', 'sunset', 'forest');

alter table public.users
  add constraint users_username_format_chk
  check (username is null or username ~ '^[a-z0-9_]{3,16}$') not valid;

alter table public.users
  add constraint users_profile_gallery_array_chk
  check (jsonb_typeof(profile_gallery_urls) = 'array') not valid;

alter table public.users
  add constraint users_profile_theme_chk
  check (profile_theme in ('violet', 'ocean', 'sunset', 'forest')) not valid;

create unique index if not exists users_username_lower_uidx
  on public.users (lower(username))
  where username is not null and is_deleted = false;

create index if not exists users_last_seen_at_idx
  on public.users (last_seen_at desc);

create or replace function public.touch_my_presence()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.users
  set last_seen_at = now()
  where supabase_uid = auth.uid()
    and is_deleted = false
    and is_banned = false;
end;
$$;

create or replace function public.update_my_profile(p_profile jsonb, p_keyword_ids integer[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id integer;
  v_username text;
  v_theme text;
  v_gallery jsonb;
begin
  select id_user into v_user_id
  from public.users
  where supabase_uid = auth.uid()
    and is_deleted = false
    and is_banned = false;

  if v_user_id is null then
    raise exception 'User not found.';
  end if;

  v_username := lower(nullif(trim(p_profile->>'username'), ''));
  if v_username is null or v_username !~ '^[a-z0-9_]{3,16}$' then
    raise exception 'Username must be 3 to 16 characters and use only lowercase letters, numbers, and underscores.';
  end if;

  if exists (
    select 1
    from public.users
    where lower(username) = v_username
      and id_user <> v_user_id
      and is_deleted = false
  ) then
    raise exception 'Username is already taken.';
  end if;

  v_theme := coalesce(nullif(p_profile->>'profile_theme', ''), 'violet');
  if v_theme not in ('violet', 'ocean', 'sunset', 'forest') then
    v_theme := 'violet';
  end if;

  v_gallery := case
    when jsonb_typeof(p_profile->'profile_gallery_urls') = 'array'
      then (select coalesce(jsonb_agg(value), '[]'::jsonb)
            from (
              select value
              from jsonb_array_elements(p_profile->'profile_gallery_urls') with ordinality as items(value, ordinality)
              where jsonb_typeof(value) = 'string'
              order by ordinality
              limit 3
            ) as limited_gallery)
    else '[]'::jsonb
  end;

  update public.users
  set
    username = v_username,
    first_name = nullif(p_profile->>'first_name', ''),
    last_name = nullif(p_profile->>'last_name', ''),
    date_of_birth = nullif(p_profile->>'date_of_birth', '')::date,
    location = nullif(p_profile->>'location', ''),
    phone_number = nullif(p_profile->>'phone_number', ''),
    show_phone_number = coalesce((p_profile->>'show_phone_number')::boolean, false),
    instagram = nullif(p_profile->>'instagram', ''),
    show_instagram = coalesce((p_profile->>'show_instagram')::boolean, true),
    tiktok = nullif(p_profile->>'tiktok', ''),
    show_tiktok = coalesce((p_profile->>'show_tiktok')::boolean, true),
    snapchat = nullif(p_profile->>'snapchat', ''),
    show_snapchat = coalesce((p_profile->>'show_snapchat')::boolean, true),
    discord = nullif(p_profile->>'discord', ''),
    show_discord = coalesce((p_profile->>'show_discord')::boolean, true),
    profile_url = nullif(p_profile->>'profile_url', ''),
    profile_gallery_urls = v_gallery,
    profile_theme = v_theme,
    last_seen_at = now(),
    q_visual_art = case when p_profile ? 'q_visual_art' then (p_profile->>'q_visual_art')::boolean else q_visual_art end,
    q_digital_art = case when p_profile ? 'q_digital_art' then (p_profile->>'q_digital_art')::boolean else q_digital_art end,
    q_listen_music = case when p_profile ? 'q_listen_music' then (p_profile->>'q_listen_music')::boolean else q_listen_music end,
    q_produce_music = case when p_profile ? 'q_produce_music' then (p_profile->>'q_produce_music')::boolean else q_produce_music end,
    q_play_instruments = case when p_profile ? 'q_play_instruments' then (p_profile->>'q_play_instruments')::boolean else q_play_instruments end,
    q_like_performing = case when p_profile ? 'q_like_performing' then (p_profile->>'q_like_performing')::boolean else q_like_performing end,
    q_like_writing = case when p_profile ? 'q_like_writing' then (p_profile->>'q_like_writing')::boolean else q_like_writing end,
    q_like_anime = case when p_profile ? 'q_like_anime' then (p_profile->>'q_like_anime')::boolean else q_like_anime end,
    q_like_games = case when p_profile ? 'q_like_games' then (p_profile->>'q_like_games')::boolean else q_like_games end,
    q_like_memes = case when p_profile ? 'q_like_memes' then (p_profile->>'q_like_memes')::boolean else q_like_memes end,
    q_like_tech = case when p_profile ? 'q_like_tech' then (p_profile->>'q_like_tech')::boolean else q_like_tech end,
    q_like_programming = case when p_profile ? 'q_like_programming' then (p_profile->>'q_like_programming')::boolean else q_like_programming end,
    q_like_ai = case when p_profile ? 'q_like_ai' then (p_profile->>'q_like_ai')::boolean else q_like_ai end,
    q_attend_education = case when p_profile ? 'q_attend_education' then (p_profile->>'q_attend_education')::boolean else q_attend_education end,
    q_go_gym = case when p_profile ? 'q_go_gym' then (p_profile->>'q_go_gym')::boolean else q_go_gym end,
    q_practice_sports = case when p_profile ? 'q_practice_sports' then (p_profile->>'q_practice_sports')::boolean else q_practice_sports end,
    q_like_outdoor = case when p_profile ? 'q_like_outdoor' then (p_profile->>'q_like_outdoor')::boolean else q_like_outdoor end,
    q_like_cars = case when p_profile ? 'q_like_cars' then (p_profile->>'q_like_cars')::boolean else q_like_cars end,
    skip_movies = coalesce((p_profile->>'skip_movies')::boolean, false),
    skip_tv_shows = coalesce((p_profile->>'skip_tv_shows')::boolean, false),
    skip_apps = coalesce((p_profile->>'skip_apps')::boolean, false),
    skip_careers = coalesce((p_profile->>'skip_careers')::boolean, false),
    skip_personality = coalesce((p_profile->>'skip_personality')::boolean, false),
    skip_hobbies = coalesce((p_profile->>'skip_hobbies')::boolean, false),
    skip_sexuality = coalesce((p_profile->>'skip_sexuality')::boolean, false),
    skip_food = coalesce((p_profile->>'skip_food')::boolean, false),
    skip_places = coalesce((p_profile->>'skip_places')::boolean, false),
    skip_animals = coalesce((p_profile->>'skip_animals')::boolean, false),
    skip_role_models = coalesce((p_profile->>'skip_role_models')::boolean, false),
    skip_other = coalesce((p_profile->>'skip_other')::boolean, false)
  where id_user = v_user_id;

  if p_keyword_ids is not null then
    delete from public.user_keywords where id_user = v_user_id;

    insert into public.user_keywords (id_user, id_keyword)
    select v_user_id, distinct_keyword_id
    from (
      select distinct id_keyword as distinct_keyword_id
      from unnest(p_keyword_ids) as keyword_ids(id_keyword)
      where id_keyword is not null and id_keyword > 0
    ) as keyword_ids;
  end if;
end;
$$;

drop function if exists public.get_public_user_profile(integer);
create function public.get_public_user_profile(p_user_id integer)
returns table (
  id_user integer,
  supabase_uid uuid,
  username text,
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
  profile_gallery_urls jsonb,
  profile_theme text,
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
    u.username,
    u.first_name,
    u.last_name,
    u.date_of_birth,
    u.location,
    u.phone_number,
    coalesce(u.show_phone_number, false),
    u.instagram,
    coalesce(u.show_instagram, true),
    u.tiktok,
    coalesce(u.show_tiktok, true),
    u.snapchat,
    coalesce(u.show_snapchat, true),
    u.discord,
    coalesce(u.show_discord, true),
    u.profile_url,
    coalesce(u.profile_gallery_urls, '[]'::jsonb),
    coalesce(u.profile_theme, 'violet'),
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

drop function if exists public.get_public_user_profile_by_username(text);
create function public.get_public_user_profile_by_username(p_username text)
returns table (
  id_user integer,
  supabase_uid uuid,
  username text,
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
  profile_gallery_urls jsonb,
  profile_theme text,
  last_seen_at timestamptz,
  is_online boolean,
  all_keyword_ids integer[],
  match_count integer
)
language sql
security definer
set search_path = public
as $$
  select *
  from public.get_public_user_profile((
    select id_user
    from public.users
    where lower(username) = lower(trim(p_username))
      and coalesce(is_deleted, false) = false
      and coalesce(is_banned, false) = false
    limit 1
  ));
$$;

drop function if exists public.search_users_by_keywords(integer[]);
create function public.search_users_by_keywords(keyword_ids integer[])
returns table (
  id_user integer,
  supabase_uid uuid,
  username text,
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
  profile_gallery_urls jsonb,
  profile_theme text,
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
    u.username,
    u.first_name,
    u.last_name,
    u.date_of_birth,
    u.location,
    u.phone_number,
    coalesce(u.show_phone_number, false),
    u.instagram,
    coalesce(u.show_instagram, true),
    u.tiktok,
    coalesce(u.show_tiktok, true),
    u.snapchat,
    coalesce(u.show_snapchat, true),
    u.discord,
    coalesce(u.show_discord, true),
    u.profile_url,
    coalesce(u.profile_gallery_urls, '[]'::jsonb),
    coalesce(u.profile_theme, 'violet'),
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

create table if not exists public.global_chat_messages (
  id_chat_message bigserial primary key,
  id_user integer not null references public.users(id_user) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

alter table public.global_chat_messages
  add column if not exists channel_key text not null default 'international';

create index if not exists global_chat_messages_channel_created_idx
  on public.global_chat_messages (channel_key, created_at desc);

create table if not exists public.global_chat_channel_reads (
  id_user integer not null references public.users(id_user) on delete cascade,
  channel_key text not null,
  last_read_at timestamptz not null default now(),
  primary key (id_user, channel_key)
);

create table if not exists public.direct_conversations (
  id_direct_conversation bigserial primary key,
  user_one_id integer not null references public.users(id_user) on delete cascade,
  user_two_id integer not null references public.users(id_user) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (user_one_id <> user_two_id)
);

create unique index if not exists direct_conversations_pair_uidx
  on public.direct_conversations (least(user_one_id, user_two_id), greatest(user_one_id, user_two_id));

create table if not exists public.direct_chat_messages (
  id_direct_message bigserial primary key,
  id_direct_conversation bigint not null references public.direct_conversations(id_direct_conversation) on delete cascade,
  id_sender integer not null references public.users(id_user) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  is_deleted boolean not null default false
);

create index if not exists direct_chat_messages_conversation_created_idx
  on public.direct_chat_messages (id_direct_conversation, created_at desc);

create table if not exists public.direct_chat_reads (
  id_direct_conversation bigint not null references public.direct_conversations(id_direct_conversation) on delete cascade,
  id_user integer not null references public.users(id_user) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (id_direct_conversation, id_user)
);

create table if not exists public.chat_reports (
  id_chat_report bigserial primary key,
  report_type text not null check (report_type in ('message', 'chat')),
  chat_kind text not null check (chat_kind in ('global', 'direct')),
  id_reporter integer not null references public.users(id_user) on delete cascade,
  id_reported_user integer references public.users(id_user) on delete set null,
  id_global_chat_message bigint references public.global_chat_messages(id_chat_message) on delete set null,
  id_direct_chat_message bigint references public.direct_chat_messages(id_direct_message) on delete set null,
  id_direct_conversation bigint references public.direct_conversations(id_direct_conversation) on delete set null,
  global_channel_key text,
  reason text,
  status text not null default 'open' check (status in ('open', 'reviewed', 'dismissed')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by integer references public.users(id_user) on delete set null
);

create index if not exists chat_reports_status_created_idx
  on public.chat_reports (status, created_at desc);

create or replace function public.current_app_user_id()
returns integer
language sql
security definer
set search_path = public
as $$
  select id_user
  from public.users
  where supabase_uid = auth.uid()
    and coalesce(is_deleted, false) = false
    and coalesce(is_banned, false) = false
  limit 1;
$$;

create or replace function public.is_current_app_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users
    where supabase_uid = auth.uid()
      and id_type = 2
      and coalesce(is_deleted, false) = false
      and coalesce(is_banned, false) = false
  );
$$;

drop function if exists public.list_global_chat_messages();
drop function if exists public.list_global_chat_messages(text);
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
  username text,
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
    u.first_name,
    u.last_name,
    u.email,
    u.profile_url,
    u.username,
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

drop function if exists public.send_global_chat_message(text);
drop function if exists public.send_global_chat_message(text, text);
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
  username text,
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

drop function if exists public.mark_global_chat_messages_read();
drop function if exists public.mark_global_chat_messages_read(text);
create function public.mark_global_chat_messages_read(p_channel_key text default 'international')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id integer := public.current_app_user_id();
  v_channel_key text := coalesce(nullif(trim(p_channel_key), ''), 'international');
begin
  if v_user_id is null then
    return;
  end if;

  insert into public.global_chat_channel_reads (id_user, channel_key, last_read_at)
  values (v_user_id, v_channel_key, now())
  on conflict (id_user, channel_key)
  do update set last_read_at = excluded.last_read_at;
end;
$$;

drop function if exists public.get_unread_global_chat_message_count();
drop function if exists public.get_unread_global_chat_message_count(text);
create function public.get_unread_global_chat_message_count(p_channel_key text default null)
returns integer
language sql
security definer
set search_path = public
as $$
  with current_user_row as (
    select public.current_app_user_id() as id_user
  )
  select coalesce(count(*), 0)::integer
  from public.global_chat_messages m
  cross join current_user_row cu
  where cu.id_user is not null
    and m.id_user <> cu.id_user
    and (p_channel_key is null or m.channel_key = p_channel_key)
    and m.created_at > coalesce((
      select r.last_read_at
      from public.global_chat_channel_reads r
      where r.id_user = cu.id_user
        and r.channel_key = m.channel_key
    ), 'epoch'::timestamptz);
$$;

create or replace function public.ensure_direct_conversation(p_other_user_id integer)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id integer := public.current_app_user_id();
  v_one integer;
  v_two integer;
  v_conversation_id bigint;
begin
  if v_user_id is null then
    raise exception 'Sign in to message people.';
  end if;
  if p_other_user_id is null or p_other_user_id = v_user_id then
    raise exception 'Choose another user to message.';
  end if;

  select least(v_user_id, p_other_user_id), greatest(v_user_id, p_other_user_id)
  into v_one, v_two;

  insert into public.direct_conversations (user_one_id, user_two_id)
  values (v_one, v_two)
  on conflict do nothing;

  select id_direct_conversation into v_conversation_id
  from public.direct_conversations
  where user_one_id = v_one and user_two_id = v_two;

  return v_conversation_id;
end;
$$;

create or replace function public.list_my_direct_chats()
returns table (
  id_direct_conversation bigint,
  other_user_id integer,
  username text,
  first_name text,
  last_name text,
  email text,
  profile_url text,
  profile_theme text,
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
    u.username,
    u.first_name,
    u.last_name,
    u.email,
    u.profile_url,
    coalesce(u.profile_theme, 'violet'),
    u.last_seen_at,
    coalesce(u.last_seen_at > now() - interval '5 minutes', false),
    ms.last_body,
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
  username text,
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
    u.first_name,
    u.last_name,
    u.email,
    u.profile_url,
    u.username,
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
  username text,
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
  where id_direct_conversation = v_conversation_id;

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

create or replace function public.mark_direct_chat_messages_read(p_other_user_id integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id integer := public.current_app_user_id();
  v_conversation_id bigint := public.ensure_direct_conversation(p_other_user_id);
begin
  if v_user_id is null then
    return;
  end if;

  insert into public.direct_chat_reads (id_direct_conversation, id_user, last_read_at)
  values (v_conversation_id, v_user_id, now())
  on conflict (id_direct_conversation, id_user)
  do update set last_read_at = excluded.last_read_at;
end;
$$;

create or replace function public.get_unread_direct_message_count()
returns integer
language sql
security definer
set search_path = public
as $$
  with me as (
    select public.current_app_user_id() as id_user
  ),
  my_conversations as (
    select c.id_direct_conversation
    from public.direct_conversations c
    cross join me
    where me.id_user is not null
      and me.id_user in (c.user_one_id, c.user_two_id)
  )
  select count(m.*)::integer
  from my_conversations c
  join public.direct_chat_messages m on m.id_direct_conversation = c.id_direct_conversation
  cross join me
  left join public.direct_chat_reads r
    on r.id_direct_conversation = c.id_direct_conversation
    and r.id_user = me.id_user
  where m.id_sender <> me.id_user
    and coalesce(m.is_deleted, false) = false
    and m.created_at > coalesce(r.last_read_at, 'epoch'::timestamptz);
$$;

create or replace function public.create_chat_report(
  p_report_type text,
  p_chat_kind text,
  p_reason text default null,
  p_global_message_id bigint default null,
  p_direct_message_id bigint default null,
  p_direct_conversation_id bigint default null,
  p_global_channel_key text default null,
  p_reported_user_id integer default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reporter_id integer := public.current_app_user_id();
  v_report_id bigint;
  v_reported_user_id integer := p_reported_user_id;
  v_direct_conversation_id bigint := p_direct_conversation_id;
begin
  if v_reporter_id is null then
    raise exception 'Sign in to report chat.';
  end if;
  if p_report_type not in ('message', 'chat') or p_chat_kind not in ('global', 'direct') then
    raise exception 'Invalid report type.';
  end if;

  if p_global_message_id is not null and v_reported_user_id is null then
    select id_user into v_reported_user_id
    from public.global_chat_messages
    where id_chat_message = p_global_message_id;
  end if;

  if p_direct_message_id is not null then
    select id_sender, id_direct_conversation
    into v_reported_user_id, v_direct_conversation_id
    from public.direct_chat_messages
    where id_direct_message = p_direct_message_id;
  end if;

  if p_chat_kind = 'direct' and v_direct_conversation_id is null and v_reported_user_id is not null then
    v_direct_conversation_id := public.ensure_direct_conversation(v_reported_user_id);
  end if;

  insert into public.chat_reports (
    report_type,
    chat_kind,
    id_reporter,
    id_reported_user,
    id_global_chat_message,
    id_direct_chat_message,
    id_direct_conversation,
    global_channel_key,
    reason
  )
  values (
    p_report_type,
    p_chat_kind,
    v_reporter_id,
    nullif(v_reported_user_id, v_reporter_id),
    p_global_message_id,
    p_direct_message_id,
    v_direct_conversation_id,
    nullif(trim(p_global_channel_key), ''),
    nullif(trim(p_reason), '')
  )
  returning id_chat_report into v_report_id;

  return v_report_id;
end;
$$;

create or replace function public.list_admin_chat_reports(p_limit integer default 50, p_offset integer default 0)
returns table (
  id_chat_report bigint,
  report_type text,
  chat_kind text,
  status text,
  reason text,
  created_at timestamptz,
  reporter_email text,
  reported_email text,
  message_body text,
  global_channel_key text,
  id_direct_conversation bigint
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_current_app_admin() then
    raise exception 'Admin access required.';
  end if;

  return query
  select
    r.id_chat_report,
    r.report_type,
    r.chat_kind,
    r.status,
    r.reason,
    r.created_at,
    reporter.email as reporter_email,
    reported.email as reported_email,
    coalesce(gm.body, dm.body) as message_body,
    r.global_channel_key,
    r.id_direct_conversation
  from public.chat_reports r
  join public.users reporter on reporter.id_user = r.id_reporter
  left join public.users reported on reported.id_user = r.id_reported_user
  left join public.global_chat_messages gm on gm.id_chat_message = r.id_global_chat_message
  left join public.direct_chat_messages dm on dm.id_direct_message = r.id_direct_chat_message
  order by r.created_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 100))
  offset greatest(0, coalesce(p_offset, 0));
end;
$$;

create or replace function public.resolve_chat_report(p_report_id bigint, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reviewer_id integer := public.current_app_user_id();
begin
  if not public.is_current_app_admin() then
    raise exception 'Admin access required.';
  end if;
  if p_status not in ('reviewed', 'dismissed') then
    raise exception 'Invalid report status.';
  end if;

  update public.chat_reports
  set status = p_status,
      reviewed_at = now(),
      reviewed_by = v_reviewer_id
  where id_chat_report = p_report_id;
end;
$$;
