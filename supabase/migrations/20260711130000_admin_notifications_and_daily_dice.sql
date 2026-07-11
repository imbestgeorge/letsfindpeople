-- Admin notification editing plus daily dice rewards.

alter table public.users
  add column if not exists dice_pro_expires_at timestamptz;

create table if not exists public.daily_dice_plays (
  id_daily_dice_play bigserial primary key,
  id_user integer not null references public.users(id_user) on delete cascade,
  play_date date not null default current_date,
  dice_values integer[] not null,
  six_count integer not null check (six_count >= 0 and six_count <= 6),
  reward_type text not null,
  reward_amount integer not null default 0,
  is_final boolean not null default true,
  created_at timestamptz not null default now(),
  check (array_length(dice_values, 1) = 6)
);

create index if not exists daily_dice_plays_user_created_idx
  on public.daily_dice_plays (id_user, created_at desc);

create unique index if not exists daily_dice_plays_one_final_per_day_uidx
  on public.daily_dice_plays (id_user, play_date)
  where is_final;

create table if not exists public.crunchyroll_lifetime_winners (
  id_crunchyroll_lifetime_winner bigserial primary key,
  id_user integer not null references public.users(id_user) on delete cascade,
  id_daily_dice_play bigint references public.daily_dice_plays(id_daily_dice_play) on delete set null,
  won_at timestamptz not null default now(),
  unique (id_user)
);

drop function if exists public.get_my_dice_game_status();
drop function if exists public.play_daily_dice_game();
drop function if exists public.list_my_direct_chats();
drop function if exists public.list_admin_crunchyroll_winners();
drop function if exists public.list_admin_notifications();
drop function if exists public.edit_site_notification(bigint, text, text, text, text);

create or replace function public.dice_reward_label(p_reward_type text, p_reward_amount integer default 0)
returns text
language sql
immutable
as $$
  select case p_reward_type
    when 'play_again' then 'Play again'
    when 'free_searches' then p_reward_amount::text || ' free searches'
    when 'pro_month' then 'Pro Plan for one month'
    when 'crunchyroll_lifetime' then 'Crunchyroll Mega Fan Lifetime'
    else 'No reward'
  end;
$$;

create or replace function public.expire_my_dice_pro_grant()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id integer := public.current_app_user_id();
begin
  if v_user_id is null then
    return;
  end if;

  update public.users
  set
    subscription_status = 'free',
    dice_pro_expires_at = null
  where id_user = v_user_id
    and stripe_subscription_id is null
    and dice_pro_expires_at is not null
    and dice_pro_expires_at <= now()
    and subscription_status = 'active';
end;
$$;

create or replace function public.get_my_dice_game_status()
returns table (
  can_play boolean,
  already_played boolean,
  play_date date,
  dice_values integer[],
  six_count integer,
  reward_type text,
  reward_amount integer,
  reward_label text,
  free_searches_remaining integer,
  dice_pro_expires_at timestamptz,
  has_crunchyroll_lifetime boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id integer := public.current_app_user_id();
begin
  if v_user_id is null then
    raise exception 'Sign in to play.';
  end if;

  perform public.expire_my_dice_pro_grant();

  return query
  with final_play as (
    select p.*
    from public.daily_dice_plays p
    where p.id_user = v_user_id
      and p.play_date = current_date
      and p.is_final = true
    order by p.created_at desc
    limit 1
  )
  select
    not exists (select 1 from final_play) as can_play,
    exists (select 1 from final_play) as already_played,
    current_date as play_date,
    fp.dice_values,
    fp.six_count,
    coalesce(fp.reward_type, '')::text,
    coalesce(fp.reward_amount, 0)::integer,
    case
      when fp.reward_type is null then ''
      else public.dice_reward_label(fp.reward_type, fp.reward_amount)
    end,
    coalesce(u.free_searches_remaining, 0)::integer,
    u.dice_pro_expires_at,
    exists (
      select 1
      from public.crunchyroll_lifetime_winners w
      where w.id_user = v_user_id
    ) as has_crunchyroll_lifetime
  from public.users u
  left join final_play fp on true
  where u.id_user = v_user_id;
end;
$$;

create or replace function public.play_daily_dice_game()
returns table (
  can_play boolean,
  already_played boolean,
  can_play_again boolean,
  play_date date,
  dice_values integer[],
  six_count integer,
  reward_type text,
  reward_amount integer,
  reward_label text,
  free_searches_remaining integer,
  dice_pro_expires_at timestamptz,
  has_crunchyroll_lifetime boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id integer := public.current_app_user_id();
  v_existing public.daily_dice_plays%rowtype;
  v_play_id bigint;
  v_dice integer[];
  v_six_count integer;
  v_reward_type text := 'no_reward';
  v_reward_amount integer := 0;
  v_is_final boolean := true;
begin
  if v_user_id is null then
    raise exception 'Sign in to play.';
  end if;

  perform public.expire_my_dice_pro_grant();
  perform 1 from public.users where id_user = v_user_id for update;

  select p.* into v_existing
  from public.daily_dice_plays p
  where p.id_user = v_user_id
    and p.play_date = current_date
    and p.is_final = true
  order by p.created_at desc
  limit 1;

  if v_existing.id_daily_dice_play is not null then
    return query
    select
      false,
      true,
      false,
      current_date,
      v_existing.dice_values,
      v_existing.six_count,
      v_existing.reward_type,
      v_existing.reward_amount,
      public.dice_reward_label(v_existing.reward_type, v_existing.reward_amount),
      coalesce(u.free_searches_remaining, 0)::integer,
      u.dice_pro_expires_at,
      exists (select 1 from public.crunchyroll_lifetime_winners w where w.id_user = v_user_id)
    from public.users u
    where u.id_user = v_user_id;
    return;
  end if;

  select array_agg((floor(random() * 6)::integer + 1))
  into v_dice
  from generate_series(1, 6);

  select count(*)::integer
  into v_six_count
  from unnest(v_dice) as dice(value)
  where dice.value = 6;

  if v_six_count = 1 then
    v_reward_type := 'play_again';
    v_is_final := false;
  elsif v_six_count = 2 then
    v_reward_type := 'free_searches';
    v_reward_amount := 2;
  elsif v_six_count = 3 then
    v_reward_type := 'free_searches';
    v_reward_amount := 4;
  elsif v_six_count = 4 then
    v_reward_type := 'free_searches';
    v_reward_amount := 16;
  elsif v_six_count = 5 then
    v_reward_type := 'pro_month';
  elsif v_six_count = 6 then
    v_reward_type := 'crunchyroll_lifetime';
  end if;

  insert into public.daily_dice_plays (
    id_user,
    play_date,
    dice_values,
    six_count,
    reward_type,
    reward_amount,
    is_final
  )
  values (
    v_user_id,
    current_date,
    v_dice,
    v_six_count,
    v_reward_type,
    v_reward_amount,
    v_is_final
  )
  returning id_daily_dice_play into v_play_id;

  if v_reward_type = 'free_searches' then
    update public.users
    set free_searches_remaining = coalesce(free_searches_remaining, 0) + v_reward_amount
    where id_user = v_user_id;
  elsif v_reward_type = 'pro_month' then
    update public.users
    set
      subscription_status = 'active',
      dice_pro_expires_at = greatest(coalesce(dice_pro_expires_at, now()), now()) + interval '1 month'
    where id_user = v_user_id;
  elsif v_reward_type = 'crunchyroll_lifetime' then
    insert into public.crunchyroll_lifetime_winners (id_user, id_daily_dice_play)
    values (v_user_id, v_play_id)
    on conflict (id_user) do nothing;
  end if;

  return query
  select
    not v_is_final,
    false,
    not v_is_final,
    current_date,
    v_dice,
    v_six_count,
    v_reward_type,
    v_reward_amount,
    public.dice_reward_label(v_reward_type, v_reward_amount),
    coalesce(u.free_searches_remaining, 0)::integer,
    u.dice_pro_expires_at,
    exists (select 1 from public.crunchyroll_lifetime_winners w where w.id_user = v_user_id)
  from public.users u
  where u.id_user = v_user_id;
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

create function public.list_admin_crunchyroll_winners()
returns table (
  id_user integer,
  first_name text,
  last_name text,
  email text,
  won_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    u.id_user,
    u.first_name::text,
    u.last_name::text,
    u.email::text,
    w.won_at
  from public.crunchyroll_lifetime_winners w
  join public.users u on u.id_user = w.id_user
  where public.is_current_app_admin()
  order by w.won_at desc;
$$;

create function public.list_admin_notifications()
returns table (
  id_notification bigint,
  draw_event_id bigint,
  title text,
  body text,
  cover_url text,
  notification_type text,
  delivery_scope text,
  created_at timestamptz,
  is_disabled boolean,
  disabled_at timestamptz,
  email_sent_at timestamptz,
  email_recipient_count integer
)
language sql
security definer
set search_path = public
as $$
  select
    n.id_notification,
    n.draw_event_id,
    coalesce(d.title, n.title)::text,
    coalesce(d.body, n.body)::text,
    n.cover_url::text,
    n.notification_type::text,
    n.delivery_scope::text,
    n.created_at,
    coalesce(d.is_disabled, false),
    d.disabled_at,
    d.email_sent_at,
    coalesce(d.email_recipient_count, 0)::integer
  from public.site_notifications n
  left join public.draw_events d on d.id_draw_event = n.draw_event_id
  where public.is_current_app_admin()
    and coalesce(n.notification_type, 'general') <> 'direct'
  order by n.created_at desc;
$$;

create function public.edit_site_notification(
  p_notification_id bigint,
  p_title text,
  p_body text,
  p_cover_url text default null,
  p_delivery_scope text default 'current_users'
)
returns table (
  id_notification bigint,
  draw_event_id bigint,
  title text,
  body text,
  cover_url text,
  notification_type text,
  delivery_scope text,
  created_at timestamptz,
  is_disabled boolean,
  disabled_at timestamptz,
  email_sent_at timestamptz,
  email_recipient_count integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_notification public.site_notifications%rowtype;
  v_title text := nullif(trim(p_title), '');
  v_body text := nullif(trim(p_body), '');
  v_cover_url text := nullif(trim(coalesce(p_cover_url, '')), '');
  v_delivery_scope text := coalesce(nullif(trim(p_delivery_scope), ''), 'current_users');
begin
  if not public.is_current_app_admin() then
    raise exception 'Admin access required.';
  end if;
  if v_title is null then
    raise exception 'Title is required.';
  end if;
  if v_body is null then
    raise exception 'Description is required.';
  end if;
  if char_length(v_title) > 120 then
    raise exception 'Title must be 120 characters or fewer.';
  end if;
  if char_length(v_body) > 2000 then
    raise exception 'Description must be 2000 characters or fewer.';
  end if;
  if v_delivery_scope not in ('current_users', 'current_and_future_users') then
    raise exception 'Invalid delivery scope.';
  end if;

  select *
  into v_notification
  from public.site_notifications
  where id_notification = p_notification_id;

  if v_notification.id_notification is null then
    raise exception 'Notification not found.';
  end if;

  update public.site_notifications
  set
    title = v_title,
    body = v_body,
    cover_url = v_cover_url,
    delivery_scope = v_delivery_scope
  where id_notification = p_notification_id;

  if v_notification.draw_event_id is not null then
    update public.draw_events
    set
      title = v_title,
      body = v_body
    where id_draw_event = v_notification.draw_event_id;
  end if;

  return query
  select *
  from public.list_admin_notifications() item
  where item.id_notification = p_notification_id;
end;
$$;

grant execute on function public.expire_my_dice_pro_grant() to authenticated;
grant execute on function public.get_my_dice_game_status() to authenticated;
grant execute on function public.play_daily_dice_game() to authenticated;
grant execute on function public.list_my_direct_chats() to authenticated;
grant execute on function public.list_admin_crunchyroll_winners() to authenticated;
grant execute on function public.list_admin_notifications() to authenticated;
grant execute on function public.edit_site_notification(bigint, text, text, text, text) to authenticated;

notify pgrst, 'reload schema';
