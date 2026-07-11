-- Fix PL/pgSQL output-column ambiguity in daily dice reward updates.

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
    update public.users as target_user
    set free_searches_remaining = coalesce(target_user.free_searches_remaining, 0) + v_reward_amount
    where target_user.id_user = v_user_id;
  elsif v_reward_type = 'pro_month' then
    update public.users as target_user
    set
      subscription_status = 'active',
      dice_pro_expires_at = greatest(coalesce(target_user.dice_pro_expires_at, now()), now()) + interval '1 month'
    where target_user.id_user = v_user_id;
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

grant execute on function public.play_daily_dice_game() to authenticated;

notify pgrst, 'reload schema';
