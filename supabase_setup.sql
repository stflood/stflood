-- ============================================================
-- St. Flood — v5: admin + profile + avatar
-- Выполни целиком в SQL Editor → Run
-- ============================================================

-- Роли и блокировка
alter table public.profiles add column if not exists role text not null default 'user';
alter table public.profiles add column if not exists blocked boolean not null default false;
alter table public.profiles add column if not exists avatar text not null default '';
alter table public.profiles add column if not exists description text not null default '';

-- Сессии (токен авторизации)
create table if not exists public.sessions (
  token text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz default now()
);
alter table public.sessions enable row level security;
drop policy if exists "sessions_none" on public.sessions;
create policy "sessions_none" on public.sessions for all using (false);

-- ============================================================
-- RPC: регистрация (возвращает токен)
-- ============================================================
create or replace function public.register_user(p_nick text, p_password text)
returns json
security definer set search_path = public, extensions
as $$
declare v_user profiles%rowtype; v_token text;
begin
  if exists (select 1 from profiles where nick = p_nick) then
    return json_build_object('error', 'Этот ник уже занят');
  end if;
  insert into profiles (nick, password_hash)
  values (p_nick, crypt(p_password, gen_salt('bf')))
  returning * into v_user;
  v_token := left(md5(random()::text || clock_timestamp()::text || random()::text), 32);
  insert into sessions (token, user_id) values (v_token, v_user.id);
  return json_build_object('id', v_user.id, 'nick', v_user.nick, 'role', v_user.role, 'avatar', v_user.avatar, 'description', v_user.description, 'token', v_token);
end;
$$ language plpgsql;

-- ============================================================
-- RPC: вход (возвращает токен; блок заблокированных)
-- ============================================================
create or replace function public.login_user(p_nick text, p_password text)
returns json
security definer set search_path = public, extensions
as $$
declare v_user profiles%rowtype; v_token text;
begin
  select * into v_user from profiles
  where nick = p_nick and password_hash = crypt(p_password, password_hash);
  if v_user.id is null then
    return json_build_object('error', 'Неверный ник или пароль');
  end if;
  if v_user.blocked then
    return json_build_object('error', 'Аккаунт заблокирован');
  end if;
  v_token := left(md5(random()::text || clock_timestamp()::text || random()::text), 32);
  insert into sessions (token, user_id) values (v_token, v_user.id);
  update profiles set last_seen = now() where id = v_user.id;
  return json_build_object('id', v_user.id, 'nick', v_user.nick, 'role', v_user.role, 'avatar', v_user.avatar, 'description', v_user.description, 'token', v_token);
end;
$$ language plpgsql;

-- ============================================================
-- RPC: выход / проверка токена / heartbeat
-- ============================================================
create or replace function public.logout_user(p_token text)
returns void
security definer set search_path = public
as $$
begin
  delete from sessions where token = p_token;
end;
$$ language plpgsql;

create or replace function public.validate_token(p_token text)
returns json
security definer set search_path = public
as $$
declare v_json json;
begin
  select json_build_object(
    'id', p.id, 'nick', p.nick, 'role', p.role, 'blocked', p.blocked,
    'avatar', p.avatar, 'description', p.description,
    'created_at', p.created_at, 'last_seen', p.last_seen
  ) into v_json
  from sessions s join profiles p on p.id = s.user_id
  where s.token = p_token;
  if v_json is null then
    return json_build_object('error', 'Сессия недействительна');
  end if;
  return v_json;
end;
$$ language plpgsql;

create or replace function public.heartbeat(p_token text)
returns void
security definer set search_path = public
as $$
begin
  update profiles p set last_seen = now()
  from sessions s
  where s.token = p_token and s.user_id = p.id;
end;
$$ language plpgsql;

-- ============================================================
-- RPC: профиль (сменить ник / пароль / аватар / описание)
-- ============================================================

create or replace function public.update_profile(p_token text, p_avatar text, p_description text)
returns json
security definer set search_path = public
as $$
declare v_id uuid;
begin
  select p.id into v_id
  from sessions s join profiles p on p.id = s.user_id
  where s.token = p_token;
  if v_id is null then return json_build_object('error', 'Не авторизован'); end if;
  update profiles set avatar = p_avatar, description = p_description where id = v_id;
  return json_build_object('ok', 'Профиль обновлён');
end;
$$ language plpgsql;

create or replace function public.get_public_profile(p_nick text)
returns json
security definer set search_path = public
as $$
declare v_json json;
begin
  select json_build_object(
    'nick', nick, 'role', role, 'avatar', avatar, 'description', description,
    'created_at', created_at, 'last_seen', last_seen
  )
  into v_json
  from profiles where nick = p_nick;
  if v_json is null then
    return json_build_object('error', 'Пользователь не найден');
  end if;
  return v_json;
end;
$$ language plpgsql;
create or replace function public.update_nick(p_token text, p_new_nick text)
returns json
security definer set search_path = public
as $$
declare v_id uuid;
begin
  select p.id into v_id
  from sessions s join profiles p on p.id = s.user_id
  where s.token = p_token;
  if v_id is null then return json_build_object('error', 'Не авторизован'); end if;
  if exists (select 1 from profiles where nick = p_new_nick and id <> v_id) then
    return json_build_object('error', 'Этот ник уже занят');
  end if;
  update profiles set nick = p_new_nick where id = v_id;
  return json_build_object('ok', 'Ник изменён');
end;
$$ language plpgsql;

create or replace function public.change_password(p_token text, p_old_password text, p_new_password text)
returns json
security definer set search_path = public, extensions
as $$
declare v_id uuid; v_hash text;
begin
  select p.id, p.password_hash into v_id, v_hash
  from sessions s join profiles p on p.id = s.user_id
  where s.token = p_token;
  if v_id is null then return json_build_object('error', 'Не авторизован'); end if;
  if crypt(p_old_password, v_hash) <> v_hash then
    return json_build_object('error', 'Старый пароль неверный');
  end if;
  update profiles set password_hash = crypt(p_new_password, gen_salt('bf')) where id = v_id;
  return json_build_object('ok', 'Пароль изменён');
end;
$$ language plpgsql;

-- ============================================================
-- RPC: чат (через токен, с проверкой блокировки)
-- ============================================================
create or replace function public.create_request(p_token text)
returns json
security definer set search_path = public
as $$
declare v_id uuid; v_blocked boolean; v_request_id bigint;
begin
  select p.id, p.blocked into v_id, v_blocked
  from sessions s join profiles p on p.id = s.user_id
  where s.token = p_token;
  if v_id is null then return json_build_object('error', 'Не авторизован'); end if;
  if v_blocked then return json_build_object('error', 'Аккаунт заблокирован'); end if;
  select id into v_request_id from requests where creator_id = v_id and status = 'open' order by created_at limit 1;
  if v_request_id is not null then
    return json_build_object('id', v_request_id);
  end if;
  insert into requests (status, creator_id) values ('open', v_id)
  returning id into v_request_id;
  return json_build_object('id', v_request_id);
end;
$$ language plpgsql;

create or replace function public.post_message(p_token text, p_request_id bigint, p_text text)
returns json
security definer set search_path = public
as $$
declare v_id uuid; v_nick text; v_blocked boolean; v_role text; v_creator uuid;
begin
  select p.id, p.nick, p.blocked, p.role into v_id, v_nick, v_blocked, v_role
  from sessions s join profiles p on p.id = s.user_id
  where s.token = p_token;
  if v_id is null then return json_build_object('error', 'Не авторизован'); end if;
  if v_blocked then return json_build_object('error', 'Аккаунт заблокирован'); end if;
  if nullif(trim(p_text), '') is null then return json_build_object('error', 'Пустое сообщение'); end if;
  if v_role is distinct from 'admin' then
    select creator_id into v_creator from requests where id = p_request_id;
    if v_creator is distinct from v_id then
      return json_build_object('error', 'Это чужое обращение');
    end if;
  end if;
  insert into request_messages (request_id, user_id, nick, text)
  values (p_request_id, v_id, v_nick, p_text);
  return json_build_object('ok', 'sent');
end;
$$ language plpgsql;

create or replace function public.close_request(p_token text, p_request_id bigint, p_reason text)
returns json
security definer set search_path = public
as $$
declare v_id uuid; v_blocked boolean; v_role text; v_creator uuid;
begin
  select p.id, p.blocked, p.role into v_id, v_blocked, v_role
  from sessions s join profiles p on p.id = s.user_id
  where s.token = p_token;
  if v_id is null then return json_build_object('error', 'Не авторизован'); end if;
  if v_blocked then return json_build_object('error', 'Аккаунт заблокирован'); end if;
  if nullif(trim(p_reason), '') is null then return json_build_object('error', 'Пустая причина'); end if;
  if v_role is distinct from 'admin' then
    select creator_id into v_creator from requests where id = p_request_id;
    if v_creator is distinct from v_id then
      return json_build_object('error', 'Это чужое обращение');
    end if;
  end if;
  update requests set status = 'closed', closed_reason = p_reason, closed_at = now()
  where id = p_request_id;
  return json_build_object('ok', 'closed');
end;
$$ language plpgsql;

-- ============================================================
-- RPC: АДМИНКА
-- ============================================================
create or replace function public.admin_list_users(p_token text)
returns json
security definer set search_path = public
as $$
declare v_role text;
begin
  select p.role into v_role
  from sessions s join profiles p on p.id = s.user_id
  where s.token = p_token;
  if v_role is distinct from 'admin' then
    return json_build_object('error', 'Нет доступа');
  end if;
  return coalesce((
    select json_agg(
      json_build_object(
        'id', id, 'nick', nick, 'role', role, 'blocked', blocked,
        'last_seen', last_seen, 'created_at', created_at
      ) order by created_at
    ) from profiles
  ), '[]'::json);
end;
$$ language plpgsql;

create or replace function public.admin_delete_user(p_token text, p_user_id uuid)
returns json
security definer set search_path = public
as $$
declare v_id uuid; v_role text;
begin
  select p.id, p.role into v_id, v_role
  from sessions s join profiles p on p.id = s.user_id
  where s.token = p_token;
  if v_role is distinct from 'admin' then
    return json_build_object('error', 'Нет доступа');
  end if;
  if p_user_id = v_id then
    return json_build_object('error', 'Нельзя удалить сам себя');
  end if;
  delete from profiles where id = p_user_id;
  return json_build_object('ok', 'deleted');
end;
$$ language plpgsql;

create or replace function public.admin_set_status(p_token text, p_user_id uuid, p_block boolean)
returns json
security definer set search_path = public
as $$
declare v_id uuid; v_role text;
begin
  select p.id, p.role into v_id, v_role
  from sessions s join profiles p on p.id = s.user_id
  where s.token = p_token;
  if v_role is distinct from 'admin' then
    return json_build_object('error', 'Нет доступа');
  end if;
  if p_user_id = v_id then
    return json_build_object('error', 'Нельзя изменить статус самому себе');
  end if;
  update profiles set blocked = p_block where id = p_user_id;
  if p_block then
    delete from sessions where user_id = p_user_id;
  end if;
  return json_build_object('ok', 'set');
end;
$$ language plpgsql;

create or replace function public.admin_set_role(p_token text, p_user_id uuid, p_role text)
returns json
security definer set search_path = public
as $$
declare v_id uuid; v_role text;
begin
  select p.id, p.role into v_id, v_role
  from sessions s join profiles p on p.id = s.user_id
  where s.token = p_token;
  if v_role is distinct from 'admin' then
    return json_build_object('error', 'Нет доступа');
  end if;
  if p_role not in ('admin', 'user') then
    return json_build_object('error', 'Неверная роль');
  end if;
  if p_user_id = v_id then
    return json_build_object('error', 'Нельзя менять роль самому себе');
  end if;
  update profiles set role = p_role where id = p_user_id;
  return json_build_object('ok', 'set');
end;
$$ language plpgsql;

-- ============================================================
-- Назначить владельца админом (ник "adrenalff (TSC)")
-- ============================================================
update public.profiles set role = 'admin' where nick = 'adrenalff (TSC)';