-- Chat reports, direct-chat removal state, and user blocks.
-- Additive migration: existing chat table columns and existing chat RPC
-- signatures are intentionally left unchanged.

create table if not exists public.chat_reports (
  id_chat_report bigserial primary key,
  reporter_user_id bigint not null references public.users(id_user) on delete cascade,
  reported_user_id bigint references public.users(id_user) on delete set null,
  target_type text not null check (target_type in ('message', 'user')),
  message_type text check (message_type in ('global', 'direct')),
  message_id bigint,
  content_kind text not null check (content_kind in ('text', 'image', 'gif', 'user')),
  body text,
  media_url text,
  status text not null default 'open' check (status in ('open', 'reviewed', 'dismissed')),
  created_at timestamptz not null default now()
);

create index if not exists chat_reports_created_at_idx
  on public.chat_reports (created_at desc);

create index if not exists chat_reports_reported_user_id_idx
  on public.chat_reports (reported_user_id);

create table if not exists public.direct_chat_user_hides (
  user_id bigint not null references public.users(id_user) on delete cascade,
  other_user_id bigint not null references public.users(id_user) on delete cascade,
  hidden_before timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, other_user_id),
  check (user_id <> other_user_id)
);

create table if not exists public.user_blocks (
  blocker_user_id bigint not null references public.users(id_user) on delete cascade,
  blocked_user_id bigint not null references public.users(id_user) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_user_id, blocked_user_id),
  check (blocker_user_id <> blocked_user_id)
);

create index if not exists user_blocks_blocked_user_id_idx
  on public.user_blocks (blocked_user_id);

alter table public.chat_reports enable row level security;
alter table public.direct_chat_user_hides enable row level security;
alter table public.user_blocks enable row level security;

create or replace function public.delete_chat_media_object_from_body()
returns trigger
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  payload jsonb;
  v_media_url text;
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

  v_media_url := payload->>'url';
  if v_media_url is null or position('/storage/v1/object/public/chat-media/' in v_media_url) = 0 then
    return old;
  end if;

  if exists (
    select 1
    from public.chat_reports r
    where r.media_url = v_media_url
  ) then
    return old;
  end if;

  object_path := split_part(v_media_url, '/storage/v1/object/public/chat-media/', 2);
  object_path := split_part(object_path, '?', 1);

  if object_path <> '' then
    delete from storage.objects
    where bucket_id = 'chat-media'
      and name = object_path;
  end if;

  return old;
end;
$$;

create or replace function public.lfp_current_user_id()
returns bigint
language sql
security definer
set search_path = public
stable
as $$
  select u.id_user
  from public.users u
  where u.supabase_uid = auth.uid()::text
    and coalesce(u.is_deleted, false) = false
    and coalesce(u.is_banned, false) = false
    and (u.suspended_until is null or u.suspended_until <= now())
  limit 1
$$;

create or replace function public.lfp_is_current_user_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.users u
    where u.supabase_uid = auth.uid()::text
      and u.id_type = 2
      and coalesce(u.is_deleted, false) = false
      and coalesce(u.is_banned, false) = false
      and (u.suspended_until is null or u.suspended_until <= now())
  )
$$;

do $$
begin
  create policy "chat_reports admin read"
    on public.chat_reports
    for select
    using (public.lfp_is_current_user_admin());
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create policy "direct_chat_hides own rows"
    on public.direct_chat_user_hides
    for select
    using (user_id = public.lfp_current_user_id());
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create policy "user_blocks related rows"
    on public.user_blocks
    for select
    using (
      blocker_user_id = public.lfp_current_user_id()
      or blocked_user_id = public.lfp_current_user_id()
    );
exception
  when duplicate_object then null;
end $$;

create or replace function public.lfp_extract_media_kind(p_body text)
returns text
language plpgsql
immutable
as $$
declare
  payload jsonb;
  media_type text;
begin
  if p_body is null or p_body not like 'lfp-media:v1:%' then
    return 'text';
  end if;

  begin
    payload := substring(p_body from length('lfp-media:v1:') + 1)::jsonb;
  exception
    when others then
      return 'text';
  end;

  media_type := payload->>'type';
  if media_type in ('image', 'gif') then
    return media_type;
  end if;

  return 'text';
end;
$$;

create or replace function public.lfp_extract_media_url(p_body text)
returns text
language plpgsql
immutable
as $$
declare
  payload jsonb;
begin
  if p_body is null or p_body not like 'lfp-media:v1:%' then
    return null;
  end if;

  begin
    payload := substring(p_body from length('lfp-media:v1:') + 1)::jsonb;
  exception
    when others then
      return null;
  end;

  return payload->>'url';
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
$$;

create or replace function public.hide_direct_conversation_from_me(p_other_user_id bigint)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  me bigint;
begin
  me := public.lfp_current_user_id();
  if me is null then
    raise exception 'Unauthorized';
  end if;
  if p_other_user_id is null or p_other_user_id <= 0 or p_other_user_id = me then
    raise exception 'Invalid user';
  end if;

  insert into public.direct_chat_user_hides (user_id, other_user_id, hidden_before, updated_at)
  values (me, p_other_user_id, now(), now())
  on conflict (user_id, other_user_id) do update
  set hidden_before = excluded.hidden_before,
      updated_at = excluded.updated_at;

  return true;
end;
$$;

create or replace function public.unhide_direct_conversation_for_me(p_other_user_id bigint)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  me bigint;
begin
  me := public.lfp_current_user_id();
  if me is null then
    raise exception 'Unauthorized';
  end if;
  if p_other_user_id is null or p_other_user_id <= 0 or p_other_user_id = me then
    raise exception 'Invalid user';
  end if;

  delete from public.direct_chat_user_hides
  where user_id = me
    and other_user_id = p_other_user_id;

  return true;
end;
$$;

create or replace function public.block_user_from_chat(p_blocked_user_id bigint)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  me bigint;
begin
  me := public.lfp_current_user_id();
  if me is null then
    raise exception 'Unauthorized';
  end if;
  if p_blocked_user_id is null or p_blocked_user_id <= 0 or p_blocked_user_id = me then
    raise exception 'Invalid user';
  end if;

  insert into public.user_blocks (blocker_user_id, blocked_user_id)
  values (me, p_blocked_user_id)
  on conflict do nothing;

  insert into public.direct_chat_user_hides (user_id, other_user_id, hidden_before, updated_at)
  values
    (me, p_blocked_user_id, now(), now()),
    (p_blocked_user_id, me, now(), now())
  on conflict (user_id, other_user_id) do update
  set hidden_before = excluded.hidden_before,
      updated_at = excluded.updated_at;

  return true;
end;
$$;

create or replace function public.delete_my_chat_message(
  p_message_type text,
  p_message_id bigint
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  me bigint;
begin
  me := public.lfp_current_user_id();
  if me is null then
    raise exception 'Unauthorized';
  end if;

  if p_message_type = 'global' then
    delete from public.global_chat_messages
    where id_chat_message = p_message_id
      and id_user = me;
  elsif p_message_type = 'direct' then
    delete from public.direct_chat_messages
    where id_direct_message = p_message_id
      and id_sender = me;
  else
    raise exception 'Invalid message type';
  end if;

  return found;
end;
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
    r.id_chat_report,
    r.reporter_user_id,
    coalesce(nullif(trim(concat_ws(' ', reporter.first_name, reporter.last_name)), ''), reporter.email, 'Deleted Account') as reporter_name,
    reporter.email as reporter_email,
    r.reported_user_id,
    coalesce(nullif(trim(concat_ws(' ', reported.first_name, reported.last_name)), ''), reported.email, 'Deleted Account') as reported_name,
    reported.email as reported_email,
    r.target_type,
    r.message_type,
    r.message_id,
    r.content_kind,
    r.body,
    r.media_url,
    r.status,
    r.created_at,
    count(*) over () as total_count
  from public.chat_reports r
  left join public.users reporter on reporter.id_user = r.reporter_user_id
  left join public.users reported on reported.id_user = r.reported_user_id
  order by r.created_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 100))
  offset greatest(0, coalesce(p_offset, 0));
end;
$$;
