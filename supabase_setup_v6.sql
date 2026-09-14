-- ============================================================
-- St. Flood — v6: принудительная смена ника + аватарки (Storage)
-- Выполни целиком в SQL Editor → Run
-- ============================================================

-- Принудительная смена ника
alter table public.profiles add column if not exists must_change_nick boolean not null default false;

-- ============================================================
-- Storage: бакет для аватарок (публичный)
-- ============================================================
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "avatars_public_read" on storage.objects;
create policy "avatars_public_read" on storage.objects
for select using (bucket_id = 'avatars');

-- писать можно только новые файлы-картинки; удалять/перезаписывать чужие — нельзя
drop policy if exists "avatars_public_insert" on storage.objects;
create policy "avatars_public_insert" on storage.objects
for insert with check (
  bucket_id = 'avatars' and
  (storage.filename(name) ~* '\.(png|jpe?g|gif|webp)$')
);

drop policy if exists "avatars_public_update" on storage.objects;
drop policy if exists "avatars_public_delete" on storage.objects;

-- ============================================================
-- RPC: админ ставит/снимает принудительную смену ника
-- ============================================================
create or replace function public.admin_force_nick(p_token text, p_user_id uuid, p_force boolean)
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
    return json_build_object('error', 'Нельзя применить к себе');
  end if;
  update profiles set must_change_nick = p_force where id = p_user_id;
  if p_force then
    delete from sessions where user_id = p_user_id;
  end if;
  return json_build_object('ok', 'set');
end;
$$ language plpgsql;

-- ============================================================
-- Смена ника снимает флаг принудительной смены
-- ============================================================
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
  update profiles set nick = p_new_nick, must_change_nick = false where id = v_id;
  return json_build_object('ok', 'Ник изменён');
end;
$$ language plpgsql;

-- ============================================================
-- Пока не сменил ник — чат заблокирован
-- ============================================================
create or replace function public.create_request(p_token text)
returns json
security definer set search_path = public
as $$
declare v_id uuid; v_blocked boolean; v_mcn boolean; v_request_id bigint;
begin
  select p.id, p.blocked, p.must_change_nick into v_id, v_blocked, v_mcn
  from sessions s join profiles p on p.id = s.user_id
  where s.token = p_token;
  if v_id is null then return json_build_object('error', 'Не авторизован'); end if;
  if v_blocked then return json_build_object('error', 'Аккаунт заблокирован'); end if;
  if v_mcn then return json_build_object('error', 'Сначала смени ник — напиши в поддержку нельзя'); end if;
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
declare v_id uuid; v_nick text; v_blocked boolean; v_role text; v_creator uuid; v_mcn boolean;
begin
  select p.id, p.nick, p.blocked, p.role, p.must_change_nick into v_id, v_nick, v_blocked, v_role, v_mcn
  from sessions s join profiles p on p.id = s.user_id
  where s.token = p_token;
  if v_id is null then return json_build_object('error', 'Не авторизован'); end if;
  if v_blocked then return json_build_object('error', 'Аккаунт заблокирован'); end if;
  if v_mcn and v_role is distinct from 'admin' then
    return json_build_object('error', 'Сначала смени ник — писать нельзя');
  end if;
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

-- ============================================================
-- validate_token / login_user возвращают флаг must_change_nick
-- ============================================================
create or replace function public.validate_token(p_token text)
returns json
security definer set search_path = public
as $$
declare v_json json;
begin
  select json_build_object('id', p.id, 'nick', p.nick, 'role', p.role, 'blocked', p.blocked,
    'avatar', p.avatar, 'description', p.description, 'must_change_nick', p.must_change_nick,
    'created_at', p.created_at, 'last_seen', p.last_seen)
  into v_json
  from sessions s join profiles p on p.id = s.user_id
  where s.token = p_token;
  if v_json is null then
    return json_build_object('error', 'Сессия недействительна');
  end if;
  return v_json;
end;
$$ language plpgsql;

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
  return json_build_object('id', v_user.id, 'nick', v_user.nick, 'role', v_user.role,
    'avatar', v_user.avatar, 'description', v_user.description, 'must_change_nick', v_user.must_change_nick,
    'token', v_token);
end;
$$ language plpgsql;

-- ============================================================
-- admin_list_users возвращает флаг must_change_nick
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
        'id', id, 'nick', nick, 'role', role, 'blocked', blocked, 'must_change_nick', must_change_nick,
        'avatar', avatar, 'description', description,
        'last_seen', last_seen, 'created_at', created_at
      ) order by created_at
    ) from profiles
  ), '[]'::json);
end;
$$ language plpgsql;

-- ============================================================
-- list_users — публичный список зарегистрированных
-- ============================================================
create or replace function public.list_users()
returns json
security definer set search_path = public
as $$
  select coalesce((
    select json_agg(
      json_build_object(
        'id', id, 'nick', nick, 'role', role, 'blocked', blocked, 'avatar', avatar,
        'last_seen', last_seen, 'created_at', created_at
      ) order by created_at
    ) from profiles
  ), '[]'::json);
$$ language sql;