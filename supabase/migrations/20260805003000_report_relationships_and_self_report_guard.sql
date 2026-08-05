-- Reported users remain visible, but direct-message entry points can be hidden
-- by the app using these relationship rows. Also prevent self-reports through
-- message reports. This migration also preserves chat media files on message
-- deletion and fixes the admin reports RPC return types.

create or replace function public.delete_chat_media_object_from_body()
returns trigger
language plpgsql
security definer
set search_path = public, storage
as $$
begin
  return old;
end;
$$;

create or replace function public.list_my_chat_relationships()
returns table (
  relationship_type text,
  user_id bigint,
  hidden_before timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  with me as (
    select public.lfp_current_user_id() as id_user
  )
  select 'hidden'::text, h.other_user_id, h.hidden_before
  from public.direct_chat_user_hides h, me
  where h.user_id = me.id_user
  union all
  select 'blocked'::text, b.blocked_user_id, null::timestamptz
  from public.user_blocks b, me
  where b.blocker_user_id = me.id_user
  union all
  select 'blocked_by'::text, b.blocker_user_id, null::timestamptz
  from public.user_blocks b, me
  where b.blocked_user_id = me.id_user
  union all
  select 'reported'::text, r.reported_user_id, null::timestamptz
  from public.chat_reports r, me
  where r.reporter_user_id = me.id_user
    and r.reported_user_id is not null
    and r.reported_user_id <> me.id_user
    and r.status = 'open'
  union all
  select 'reported_by'::text, r.reporter_user_id, null::timestamptz
  from public.chat_reports r, me
  where r.reported_user_id = me.id_user
    and r.reporter_user_id <> me.id_user
    and r.status = 'open'
$$;

create or replace function public.report_chat_content(
  p_target_type text,
  p_reported_user_id bigint default null,
  p_message_type text default null,
  p_message_id bigint default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  me bigint;
  snapshot_body text;
  resolved_reported_user_id bigint;
  resolved_kind text;
  resolved_media_url text;
  new_report_id bigint;
begin
  me := public.lfp_current_user_id();
  if me is null then
    raise exception 'Unauthorized';
  end if;

  if p_target_type = 'user' then
    if p_reported_user_id is null or p_reported_user_id <= 0 or p_reported_user_id = me then
      raise exception 'Invalid user';
    end if;
    resolved_reported_user_id := p_reported_user_id;
    resolved_kind := 'user';
  elsif p_target_type = 'message' then
    if p_message_type = 'global' then
      select m.id_user, m.body
      into resolved_reported_user_id, snapshot_body
      from public.global_chat_messages m
      where m.id_chat_message = p_message_id;
    elsif p_message_type = 'direct' then
      select m.id_sender, m.body
      into resolved_reported_user_id, snapshot_body
      from public.direct_chat_messages m
      where m.id_direct_message = p_message_id;
    else
      raise exception 'Invalid message type';
    end if;

    if resolved_reported_user_id is null then
      raise exception 'Message not found';
    end if;
    if resolved_reported_user_id = me then
      raise exception 'You cannot report yourself';
    end if;

    resolved_kind := public.lfp_extract_media_kind(snapshot_body);
    resolved_media_url := public.lfp_extract_media_url(snapshot_body);
  else
    raise exception 'Invalid report target';
  end if;

  insert into public.chat_reports (
    reporter_user_id,
    reported_user_id,
    target_type,
    message_type,
    message_id,
    content_kind,
    body,
    media_url
  )
  values (
    me,
    resolved_reported_user_id,
    p_target_type,
    p_message_type,
    p_message_id,
    resolved_kind,
    snapshot_body,
    resolved_media_url
  )
  returning id_chat_report into new_report_id;

  return new_report_id;
end;
$$;

create or replace function public.list_admin_chat_reports(
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id_chat_report bigint,
  reporter_user_id bigint,
  reporter_name text,
  reporter_email text,
  reported_user_id bigint,
  reported_name text,
  reported_email text,
  target_type text,
  message_type text,
  message_id bigint,
  content_kind text,
  body text,
  media_url text,
  status text,
  created_at timestamptz,
  total_count bigint
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.lfp_is_current_user_admin() then
    raise exception 'Admin access required';
  end if;

  return query
  select
    r.id_chat_report::bigint,
    r.reporter_user_id::bigint,
    coalesce(
      nullif(trim(concat_ws(' ', reporter.first_name, reporter.last_name)), ''),
      reporter.email::text,
      'Deleted Account'
    )::text as reporter_name,
    reporter.email::text as reporter_email,
    r.reported_user_id::bigint,
    coalesce(
      nullif(trim(concat_ws(' ', reported.first_name, reported.last_name)), ''),
      reported.email::text,
      'Deleted Account'
    )::text as reported_name,
    reported.email::text as reported_email,
    r.target_type::text,
    r.message_type::text,
    r.message_id::bigint,
    r.content_kind::text,
    r.body::text,
    r.media_url::text,
    r.status::text,
    r.created_at::timestamptz,
    (count(*) over ())::bigint as total_count
  from public.chat_reports r
  left join public.users reporter on reporter.id_user = r.reporter_user_id
  left join public.users reported on reported.id_user = r.reported_user_id
  order by r.created_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 100))
  offset greatest(0, coalesce(p_offset, 0));
end;
$$;
