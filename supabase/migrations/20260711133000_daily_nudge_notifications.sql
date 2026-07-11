-- Daily nudge email candidates and send tracking.

alter table public.user_keywords
  add column if not exists created_at timestamptz;

update public.user_keywords
set created_at = coalesce(created_at, now() - interval '30 days')
where created_at is null;

alter table public.user_keywords
  alter column created_at set default now(),
  alter column created_at set not null;

create index if not exists user_keywords_keyword_created_idx
  on public.user_keywords (id_keyword, created_at desc, id_user);

create table if not exists public.user_search_events (
  id_user_search_event bigserial primary key,
  id_searcher_user integer not null references public.users(id_user) on delete cascade,
  keyword_ids integer[] not null default '{}'::integer[],
  created_at timestamptz not null default now()
);

create table if not exists public.user_search_result_events (
  id_user_search_result_event bigserial primary key,
  id_user_search_event bigint not null references public.user_search_events(id_user_search_event) on delete cascade,
  id_searched_user integer not null references public.users(id_user) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.user_profile_view_events (
  id_user_profile_view_event bigserial primary key,
  id_viewer_user integer not null references public.users(id_user) on delete cascade,
  id_viewed_user integer not null references public.users(id_user) on delete cascade,
  id_user_search_event bigint references public.user_search_events(id_user_search_event) on delete set null,
  keyword_ids integer[] not null default '{}'::integer[],
  created_at timestamptz not null default now()
);

create index if not exists user_search_events_created_idx
  on public.user_search_events (created_at desc, id_searcher_user);

create index if not exists user_search_result_events_target_created_idx
  on public.user_search_result_events (id_searched_user, created_at desc);

create index if not exists user_profile_view_events_viewed_created_idx
  on public.user_profile_view_events (id_viewed_user, created_at desc);

create table if not exists public.daily_nudge_email_sends (
  id_daily_nudge_email_send bigserial primary key,
  id_user integer not null references public.users(id_user) on delete cascade,
  digest_date date not null,
  nudge_type text not null,
  keyword_id integer references public.keywords(id_keyword) on delete set null,
  subject text not null,
  body text not null,
  metadata jsonb not null default '{}'::jsonb,
  sent_at timestamptz not null default now(),
  unique (id_user, digest_date)
);

create index if not exists daily_nudge_email_sends_sent_idx
  on public.daily_nudge_email_sends (sent_at desc);

drop function if exists public.update_my_profile(jsonb, integer[]);
create function public.update_my_profile(p_profile jsonb, p_keyword_ids integer[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id integer;
  v_keyword_ids integer[];
begin
  select id_user into v_user_id
  from public.users
  where supabase_uid = auth.uid()::text
    and is_deleted = false
    and is_banned = false;

  if v_user_id is null then
    raise exception 'User not found.';
  end if;

  update public.users
  set
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
    select coalesce(array_agg(distinct keyword_id), '{}'::integer[])
    into v_keyword_ids
    from unnest(p_keyword_ids) as ids(keyword_id)
    where keyword_id is not null and keyword_id > 0;

    delete from public.user_keywords
    where id_user = v_user_id
      and not (id_keyword = any(v_keyword_ids));

    insert into public.user_keywords (id_user, id_keyword)
    select v_user_id, keyword_id
    from unnest(v_keyword_ids) as ids(keyword_id)
    on conflict (id_user, id_keyword) do nothing;
  end if;
end;
$$;

drop function if exists public.record_search_analytics(integer[], integer[]);
create function public.record_search_analytics(p_keyword_ids integer[], p_result_user_ids integer[])
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id integer := public.current_app_user_id();
  v_event_id bigint;
  v_keyword_ids integer[];
begin
  if v_user_id is null then
    return null;
  end if;

  select coalesce(array_agg(distinct keyword_id), '{}'::integer[])
  into v_keyword_ids
  from unnest(coalesce(p_keyword_ids, '{}'::integer[])) as ids(keyword_id)
  where keyword_id is not null and keyword_id > 0;

  if array_length(v_keyword_ids, 1) is null then
    return null;
  end if;

  insert into public.user_search_events (id_searcher_user, keyword_ids)
  values (v_user_id, v_keyword_ids)
  returning id_user_search_event into v_event_id;

  insert into public.user_search_result_events (id_user_search_event, id_searched_user)
  select v_event_id, result_user_id
  from (
    select distinct result_user_id
    from unnest(coalesce(p_result_user_ids, '{}'::integer[])) as result_ids(result_user_id)
    where result_user_id is not null
      and result_user_id > 0
      and result_user_id <> v_user_id
  ) results;

  return v_event_id;
end;
$$;

drop function if exists public.record_profile_view(integer, integer[]);
create function public.record_profile_view(p_viewed_user_id integer, p_keyword_ids integer[] default '{}'::integer[])
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_viewer_user_id integer := public.current_app_user_id();
  v_latest_search_event_id bigint;
  v_keyword_ids integer[];
begin
  if v_viewer_user_id is null or p_viewed_user_id is null or p_viewed_user_id = v_viewer_user_id then
    return false;
  end if;

  if not exists (
    select 1
    from public.users u
    where u.id_user = p_viewed_user_id
      and coalesce(u.is_deleted, false) = false
      and coalesce(u.is_banned, false) = false
  ) then
    return false;
  end if;

  if exists (
    select 1
    from public.user_profile_view_events existing
    where existing.id_viewer_user = v_viewer_user_id
      and existing.id_viewed_user = p_viewed_user_id
      and existing.created_at > now() - interval '15 minutes'
  ) then
    return false;
  end if;

  select coalesce(array_agg(distinct keyword_id), '{}'::integer[])
  into v_keyword_ids
  from unnest(coalesce(p_keyword_ids, '{}'::integer[])) as ids(keyword_id)
  where keyword_id is not null and keyword_id > 0;

  select se.id_user_search_event
  into v_latest_search_event_id
  from public.user_search_events se
  where se.id_searcher_user = v_viewer_user_id
    and se.created_at > now() - interval '45 minutes'
  order by se.created_at desc
  limit 1;

  insert into public.user_profile_view_events (
    id_viewer_user,
    id_viewed_user,
    id_user_search_event,
    keyword_ids
  )
  values (
    v_viewer_user_id,
    p_viewed_user_id,
    v_latest_search_event_id,
    v_keyword_ids
  );

  return true;
end;
$$;

drop function if exists public.list_daily_nudge_email_candidates(date, integer);
create function public.list_daily_nudge_email_candidates(
  p_digest_date date default current_date,
  p_limit integer default 500
)
returns table (
  id_user integer,
  email text,
  first_name text,
  last_name text,
  nudge_type text,
  keyword_id integer,
  keyword_name text,
  actor_count integer,
  location text,
  sample_user_id integer,
  digest_date date
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_digest_date date := coalesce(p_digest_date, current_date);
  v_start timestamptz := coalesce(p_digest_date, current_date)::timestamptz;
  v_end timestamptz := (coalesce(p_digest_date, current_date) + 1)::timestamptz;
  v_limit integer := greatest(1, least(coalesce(p_limit, 500), 5000));
begin
  return query
  with eligible as (
    select u.*
    from public.users u
    where u.email is not null
      and nullif(trim(u.email), '') is not null
      and coalesce(u.id_type, 1) <> 2
      and coalesce(u.is_deleted, false) = false
      and coalesce(u.is_banned, false) = false
      and (u.suspended_until is null or u.suspended_until <= now())
      and (u.last_seen_at is null or u.last_seen_at < now() - interval '30 minutes')
      and not exists (
        select 1
        from public.daily_nudge_email_sends sent
        where sent.id_user = u.id_user
          and sent.digest_date = v_digest_date
      )
  ),
  target_keywords as (
    select e.id_user, uk.id_keyword
    from eligible e
    join public.user_keywords uk on uk.id_user = e.id_user
  ),
  search_hits as (
    select
      e.id_user,
      e.email::text,
      e.first_name::text,
      e.last_name::text,
      'search_interest'::text as nudge_type,
      k.id_keyword::integer as keyword_id,
      k.name::text as keyword_name,
      count(distinct se.id_searcher_user)::integer as actor_count,
      min(nullif(trim(split_part(coalesce(searcher.location::text, ''), ',', 1)), ''))::text as location,
      min(se.id_searcher_user)::integer as sample_user_id,
      (300 + count(distinct se.id_searcher_user))::integer as score
    from eligible e
    join public.user_search_result_events sre
      on sre.id_searched_user = e.id_user
      and sre.created_at >= v_start
      and sre.created_at < v_end
    join public.user_search_events se
      on se.id_user_search_event = sre.id_user_search_event
      and se.created_at >= v_start
      and se.created_at < v_end
    join public.users searcher
      on searcher.id_user = se.id_searcher_user
      and searcher.id_user <> e.id_user
      and coalesce(searcher.is_deleted, false) = false
      and coalesce(searcher.is_banned, false) = false
    join lateral unnest(coalesce(se.keyword_ids, '{}'::integer[])) as searched(id_keyword) on true
    join target_keywords tk
      on tk.id_user = e.id_user
      and tk.id_keyword = searched.id_keyword
    join public.keywords k on k.id_keyword = searched.id_keyword
    group by e.id_user, e.email, e.first_name, e.last_name, k.id_keyword, k.name
  ),
  profile_view_hits as (
    select
      e.id_user,
      e.email::text,
      e.first_name::text,
      e.last_name::text,
      'profile_view'::text as nudge_type,
      k.id_keyword::integer as keyword_id,
      k.name::text as keyword_name,
      count(distinct pve.id_viewer_user)::integer as actor_count,
      min(nullif(trim(split_part(coalesce(viewer.location::text, ''), ',', 1)), ''))::text as location,
      min(pve.id_viewer_user)::integer as sample_user_id,
      (200 + count(distinct pve.id_viewer_user))::integer as score
    from eligible e
    join public.user_profile_view_events pve
      on pve.id_viewed_user = e.id_user
      and pve.created_at >= v_start
      and pve.created_at < v_end
    join public.users viewer
      on viewer.id_user = pve.id_viewer_user
      and viewer.id_user <> e.id_user
      and coalesce(viewer.is_deleted, false) = false
      and coalesce(viewer.is_banned, false) = false
    join lateral unnest(coalesce(pve.keyword_ids, '{}'::integer[])) as viewed(id_keyword) on true
    join target_keywords tk
      on tk.id_user = e.id_user
      and tk.id_keyword = viewed.id_keyword
    join public.keywords k on k.id_keyword = viewed.id_keyword
    group by e.id_user, e.email, e.first_name, e.last_name, k.id_keyword, k.name
  ),
  new_people_hits as (
    select
      e.id_user,
      e.email::text,
      e.first_name::text,
      e.last_name::text,
      'new_keyword_people'::text as nudge_type,
      k.id_keyword::integer as keyword_id,
      k.name::text as keyword_name,
      count(distinct other_uk.id_user)::integer as actor_count,
      min(nullif(trim(split_part(coalesce(other_user.location::text, ''), ',', 1)), ''))::text as location,
      min(other_uk.id_user)::integer as sample_user_id,
      (100 + count(distinct other_uk.id_user))::integer as score
    from eligible e
    join target_keywords tk on tk.id_user = e.id_user
    join public.user_keywords other_uk
      on other_uk.id_keyword = tk.id_keyword
      and other_uk.id_user <> e.id_user
      and other_uk.created_at >= v_start
      and other_uk.created_at < v_end
    join public.users other_user
      on other_user.id_user = other_uk.id_user
      and coalesce(other_user.is_deleted, false) = false
      and coalesce(other_user.is_banned, false) = false
    join public.keywords k on k.id_keyword = tk.id_keyword
    group by e.id_user, e.email, e.first_name, e.last_name, k.id_keyword, k.name
  ),
  candidates as (
    select * from search_hits
    union all
    select * from profile_view_hits
    union all
    select * from new_people_hits
  ),
  ranked as (
    select
      candidates.*,
      row_number() over (
        partition by candidates.id_user
        order by candidates.score desc, candidates.actor_count desc, candidates.keyword_name asc
      ) as rn
    from candidates
    where candidates.actor_count > 0
  )
  select
    ranked.id_user,
    ranked.email,
    ranked.first_name,
    ranked.last_name,
    ranked.nudge_type,
    ranked.keyword_id,
    ranked.keyword_name,
    ranked.actor_count,
    ranked.location,
    ranked.sample_user_id,
    v_digest_date
  from ranked
  where ranked.rn = 1
  order by ranked.score desc, ranked.actor_count desc, ranked.id_user
  limit v_limit;
end;
$$;

drop function if exists public.record_daily_nudge_email_sent(integer, date, text, integer, text, text, jsonb);
create function public.record_daily_nudge_email_sent(
  p_user_id integer,
  p_digest_date date,
  p_nudge_type text,
  p_keyword_id integer,
  p_subject text,
  p_body text,
  p_metadata jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted integer;
begin
  insert into public.daily_nudge_email_sends (
    id_user,
    digest_date,
    nudge_type,
    keyword_id,
    subject,
    body,
    metadata
  )
  values (
    p_user_id,
    p_digest_date,
    p_nudge_type,
    p_keyword_id,
    p_subject,
    p_body,
    coalesce(p_metadata, '{}'::jsonb)
  )
  on conflict (id_user, digest_date) do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted > 0;
end;
$$;

grant execute on function public.update_my_profile(jsonb, integer[]) to authenticated;
grant execute on function public.record_search_analytics(integer[], integer[]) to authenticated;
grant execute on function public.record_profile_view(integer, integer[]) to authenticated;
grant execute on function public.list_daily_nudge_email_candidates(date, integer) to service_role;
grant execute on function public.record_daily_nudge_email_sent(integer, date, text, integer, text, text, jsonb) to service_role;

notify pgrst, 'reload schema';
