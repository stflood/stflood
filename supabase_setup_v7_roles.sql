-- ============================================================
-- РОЛИ: user (Игрок) / tester (Тестер) / admin (Админ) /
--       co-owner (Совладелец) / owner (Владелец) / creator (Создатель сайта)
-- Права персонала: admin, co-owner, owner, creator
-- ============================================================

-- Владельцу — роль "Создатель сайта"
update profiles set role = 'creator' where id = 'ac21f8f9-b5a2-4a06-9e7a-8bab8ff74b13';

-- post_message: персонал может писать в любое обращение
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
  if v_role in ('admin', 'owner', 'creator', 'co-owner') then
    v_mcn := false;
  end if;
  if v_mcn then return json_build_object('error', 'Сначала смени ник — писать нельзя'); end if;
  if nullif(trim(p_text), '') is null then return json_build_object('error', 'Пустое сообщение'); end if;
  if v_role not in ('admin', 'owner', 'creator', 'co-owner') then
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

-- close_request: персонал может закрыть чужое обращение
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
  if v_role not in ('admin', 'owner', 'creator', 'co-owner') then
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

-- Список пользователей доступен персоналу
create or replace function public.admin_list_users(p_token text)
returns json
security definer set search_path = public
as $$
declare v_role text;
begin
  select p.role into v_role
  from sessions s join profiles p on p.id = s.user_id
  where s.token = p_token;
  if v_role not in ('admin', 'owner', 'creator', 'co-owner') then
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

create or replace function public.admin_delete_user(p_token text, p_user_id uuid)
returns json
security definer set search_path = public
as $$
declare v_id uuid; v_role text;
begin
  select p.id, p.role into v_id, v_role
  from sessions s join profiles p on p.id = s.user_id
  where s.token = p_token;
  if v_role not in ('admin', 'owner', 'creator', 'co-owner') then
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
  if v_role not in ('admin', 'owner', 'creator', 'co-owner') then
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

-- Смена роли с защитой роли "Создатель сайта"
create or replace function public.admin_set_role(p_token text, p_user_id uuid, p_role text)
returns json
security definer set search_path = public
as $$
declare v_id uuid; v_role text; v_old_role text;
begin
  select p.id, p.role into v_id, v_role
  from sessions s join profiles p on p.id = s.user_id
  where s.token = p_token;
  if v_role not in ('admin', 'owner', 'creator', 'co-owner') then
    return json_build_object('error', 'Нет доступа');
  end if;
  if p_user_id = v_id then
    return json_build_object('error', 'Нельзя менять роль самому себе');
  end if;
  if p_role not in ('user', 'tester', 'admin', 'co-owner', 'owner', 'creator') then
    return json_build_object('error', 'Неверная роль');
  end if;
  select role into v_old_role from profiles where id = p_user_id;
  -- менять роль "Создателя сайта" может только Создатель сайта
  if v_old_role = 'creator' and v_role <> 'creator' then
    return json_build_object('error', 'Роль Создателя сайта менять может только он сам');
  end if;
  -- назначать роль "Создатель сайта" может только Создатель сайта
  if p_role = 'creator' and v_role <> 'creator' then
    return json_build_object('error', 'Назначать Создателя сайта может только сам Создатель сайта');
  end if;
  update profiles set role = p_role where id = p_user_id;
  return json_build_object('ok', 'set');
end;
$$ language plpgsql;

-- Принудительная смена ника — персоналу
create or replace function public.admin_force_nick(p_token text, p_user_id uuid, p_force boolean)
returns json
security definer set search_path = public as $$
declare v_id uuid; v_role text;
begin
  select p.id, p.role into v_id, v_role from sessions s join profiles p on p.id = s.user_id where s.token = p_token;
  if v_role not in ('admin', 'owner', 'creator', 'co-owner') then
    return json_build_object('error', 'Нет доступа');
  end if;
  if p_user_id = v_id then return json_build_object('error', 'Нельзя применить к себе'); end if;
  update profiles set must_change_nick = p_force where id = p_user_id;
  if p_force then delete from sessions where user_id = p_user_id; end if;
  return json_build_object('ok', 'set');
end; $$ language plpgsql;