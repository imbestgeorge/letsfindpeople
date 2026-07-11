-- Hide admins from console search and temporarily allow unlimited dice throws.

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
    coalesce(u.last_seen_at > now() - interval '5 minutes', false),
    coalesce(array_agg(distinct uk.id_keyword) filter (where uk.id_keyword is not null), '{}')::integer[],
    0
  from public.users u
  left join public.user_keywords uk on uk.id_user = u.id_user
  where u.id_user = p_user_id
    and coalesce(u.id_type, 1) <> 2
    and coalesce(u.is_deleted, false) = false
    and coalesce(u.is_banned, false) = false
  group by u.id_user;
$$;

drop function if exists public.search_users_by_keywords(integer[]);
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
  where coalesce(u.id_type, 1) <> 2
    and coalesce(u.is_deleted, false) = false
    and coalesce(u.is_banned, false) = false
  order by m.match_count desc, u.last_seen_at desc nulls last, u.id_user desc
  limit 100;
$$;

drop index if exists public.daily_dice_plays_one_final_per_day_uidx;

drop function if exists public.get_my_dice_game_status();
create function public.get_my_dice_game_status()
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
  with latest_play as (
    select p.*
    from public.daily_dice_plays p
    where p.id_user = v_user_id
      and p.play_date = current_date
    order by p.created_at desc
    limit 1
  )
  select
    true,
    false,
    current_date,
    lp.dice_values,
    lp.six_count,
    coalesce(lp.reward_type, '')::text,
    coalesce(lp.reward_amount, 0)::integer,
    case
      when lp.reward_type is null then ''
      else public.dice_reward_label(lp.reward_type, lp.reward_amount)
    end,
    coalesce(u.free_searches_remaining, 0)::integer,
    u.dice_pro_expires_at,
    exists (
      select 1
      from public.crunchyroll_lifetime_winners w
      where w.id_user = v_user_id
    ) as has_crunchyroll_lifetime
  from public.users u
  left join latest_play lp on true
  where u.id_user = v_user_id;
end;
$$;

drop function if exists public.play_daily_dice_game();
create function public.play_daily_dice_game()
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
    true,
    false,
    v_reward_type = 'play_again',
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

grant execute on function public.get_public_user_profile(integer) to anon, authenticated;
grant execute on function public.search_users_by_keywords(integer[]) to authenticated;
grant execute on function public.get_my_dice_game_status() to authenticated;
grant execute on function public.play_daily_dice_game() to authenticated;

notify pgrst, 'reload schema';
