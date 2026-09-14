-- ============================================================
-- v13: ФОРУМ (вместо техподдержки)
-- Темы = таблица requests (title, body, pinned).
-- Ответы = request_messages (теперь любой может ответить в любую тему).
-- Статус (open/solved/closed) и закреп — только staff (admin+…creator).
-- Bucket 'forum' для картинок в сообщениях.
-- ============================================================

-- --- 1. Поля тем ---
alter table public.requests add column if not exists title text not null default '';
alter table public.requests add column if not exists body text not null default '';
alter table public.requests add column if not exists pinned boolean not null default false;

-- Для старых записей — подставить заголовок из первого сообщения
update public.requests r
set title = coalesce((
  select left(m.text, 120) from public.request_messages m
  where m.request_id = r.id order by m.created_at limit 1
), 'Без темы')
where nullif(r.title, '') is null;

-- --- 2. Создание темы ---
create or replace function public.create_topic(p_token text, p_title text, p_body text)
returns json
security definer set search_path = public
as $$
declare v_id uuid; v_blocked boolean; v_mcn boolean; v_topic_id bigint; v_title text;
begin
  select p.id, p.blocked, p.must_change_nick into v_id, v_blocked, v_mcn
  from sessions s join profiles p on p.id = s.user_id
  where s.token = p_token;
  if v_id is null then return json_build_object('error', 'Не авторизован'); end if;
  if v_blocked then return json_build_object('error', 'Аккаунт заблокирован'); end if;
  if v_mcn then return json_build_object('error', 'Сначала смени ник — создавать тему нельзя'); end if;
  v_title := nullif(trim(p_title), '');
  if v_title is null then v_title := 'Без темы'; end if;
  v_title := left(v_title, 120);
  insert into requests (status, creator_id, title, body)
  values ('open', v_id, v_title, coalesce(p_body, ''))
  returning id into v_topic_id;
  return json_build_object('ok', 'created', 'id', v_topic_id);
end;
$$ language plpgsql;

-- --- 3. Ответ: любой может отвечать в любую тему (кроме закрытых) ---
create or replace function public.post_message(p_token text, p_request_id bigint, p_text text)
returns json
security definer set search_path = public
as $$
declare v_id uuid; v_nick text; v_blocked boolean; v_mcn boolean; v_status text;
begin
  select p.id, p.nick, p.blocked, p.must_change_nick into v_id, v_nick, v_blocked, v_mcn
  from sessions s join profiles p on p.id = s.user_id
  where s.token = p_token;
  if v_id is null then return json_build_object('error', 'Не авторизован'); end if;
  if v_blocked then return json_build_object('error', 'Аккаунт заблокирован'); end if;
  if v_mcn then return json_build_object('error', 'Сначала смени ник — писать нельзя'); end if;
  if nullif(trim(p_text), '') is null then return json_build_object('error', 'Пустое сообщение'); end if;
  select status into v_status from requests where id = p_request_id;
  if v_status is null then return json_build_object('error', 'Тема не найдена'); end if;
  if v_status <> 'open' then return json_build_object('error', 'Тема закрыта — отвечать нельзя'); end if;
  insert into request_messages (request_id, user_id, nick, text)
  values (p_request_id, v_id, v_nick, p_text);
  return json_build_object('ok', 'sent');
end;
$$ language plpgsql;

-- --- 4. Статус темы — только staff (admin, co-owner, owner, creator) ---
create or replace function public.set_topic_status(p_token text, p_topic_id bigint, p_status text, p_reason text)
returns json
security definer set search_path = public
as $$
declare v_mod uuid; v_role text;
begin
  select p.id, p.role into v_mod, v_role
  from sessions s join profiles p on p.id = s.user_id
  where s.token = p_token;
  if v_mod is null then return json_build_object('error', 'Не авторизован'); end if;
  if v_role not in ('admin', 'co-owner', 'owner', 'creator') then
    return json_build_object('error', 'Нет доступа');
  end if;
  if p_status not in ('open', 'solved', 'closed') then
    return json_build_object('error', 'Неверный статус');
  end if;
  update requests set
    status = p_status,
    closed_reason = case when p_status <> 'open' then nullif(trim(p_reason), '') else null end,
    closed_at = case when p_status <> 'open' then now() else null end
  where id = p_topic_id;
  return json_build_object('ok', 'set');
end;
$$ language plpgsql;

-- --- 5. Закреп — только staff ---
create or replace function public.toggle_pin(p_token text, p_topic_id bigint, p_pin boolean)
returns json
security definer set search_path = public
as $$
declare v_mod uuid; v_role text;
begin
  select p.id, p.role into v_mod, v_role
  from sessions s join profiles p on p.id = s.user_id
  where s.token = p_token;
  if v_mod is null then return json_build_object('error', 'Не авторизован'); end if;
  if v_role not in ('admin', 'co-owner', 'owner', 'creator') then
    return json_build_object('error', 'Нет доступа');
  end if;
  update requests set pinned = p_pin where id = p_topic_id;
  return json_build_object('ok', 'set');
end;
$$ language plpgsql;

-- --- 6. Bucket для картинок форума ---
insert into storage.buckets (id, name, public)
values ('forum', 'forum', true)
on conflict (id) do nothing;

drop policy if exists "forum_public_read" on storage.objects;
create policy "forum_public_read" on storage.objects
for select using (bucket_id = 'forum');

drop policy if exists "forum_insert_images" on storage.objects;
create policy "forum_insert_images" on storage.objects
for insert with check (
  bucket_id = 'forum'
  and storage.filename(name) ~* '\.(png|jpe?g|gif|webp)$'
);

drop policy if exists "forum_update" on storage.objects;
drop policy if exists "forum_delete" on storage.objects;

-- --- 7. Realtime уже подписан на requests / request_messages (v9) ---