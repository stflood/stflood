-- ============================================================
-- v11: ЗАЩИТА ОТ ОБХОДА — проверка v_id is null перед ролью.
-- Никакие данные участников НЕ изменяются. Только дыра закрывается:
-- раньше с несуществующей токен-строкой v_role = NULL проходила проверку
-- "v_role not in (...)", и admin-функции могли сработать без авторизации.
-- ============================================================

-- Допустимый персонал, которому разрешено управление
-- (owner, co-owner, creator) — см. v8. Здесь только +проверка авторизации.

create or replace function public.admin_list_users(p_token text)
returns json
security definer set search_path = public
as $$
declare v_id uuid; v_role text;
begin
  select p.id, p.role into v_id, v_role
  from sessions s join profiles p on p.id = s.user_id
  where s.token = p_token;
  if v_id is null then return json_build_object('error', 'Не авторизован'); end if;
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
  if v_id is null then return json_build_object('error', 'Не авторизован'); end if;
  if v_role not in ('owner', 'co-owner', 'creator') then
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
  if v_id is null then return json_build_object('error', 'Не авторизован'); end if;
  if v_role not in ('owner', 'co-owner', 'creator') then
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
declare v_id uuid; v_role text; v_old_role text;
begin
  select p.id, p.role into v_id, v_role
  from sessions s join profiles p on p.id = s.user_id
  where s.token = p_token;
  if v_id is null then return json_build_object('error', 'Не авторизован'); end if;
  if v_role not in ('owner', 'co-owner', 'creator') then
    return json_build_object('error', 'Нет доступа');
  end if;
  if p_user_id = v_id then
    return json_build_object('error', 'Нельзя менять роль самому себе');
  end if;
  if p_role not in ('user', 'tester', 'admin', 'co-owner', 'owner', 'creator') then
    return json_build_object('error', 'Неверная роль');
  end if;
  select role into v_old_role from profiles where id = p_user_id;
  if v_old_role = 'creator' and v_role <> 'creator' then
    return json_build_object('error', 'Роль Создателя сайта менять может только он сам');
  end if;
  if p_role = 'creator' and v_role <> 'creator' then
    return json_build_object('error', 'Назначать Создателя сайта может только сам Создатель сайта');
  end if;
  update profiles set role = p_role where id = p_user_id;
  return json_build_object('ok', 'set');
end;
$$ language plpgsql;

create or replace function public.admin_force_nick(p_token text, p_user_id uuid, p_force boolean)
returns json
security definer set search_path = public
as $$
declare v_id uuid; v_role text;
begin
  select p.id, p.role into v_id, v_role
  from sessions s join profiles p on p.id = s.user_id
  where s.token = p_token;
  if v_id is null then return json_build_object('error', 'Не авторизован'); end if;
  if v_role not in ('owner', 'co-owner', 'creator') then
    return json_build_object('error', 'Нет доступа');
  end if;
  if p_user_id = v_id then
    return json_build_object('error', 'Нельзя применить к себе');
  end if;
  update profiles set must_change_nick = p_force where id = p_user_id;
  if p_force then delete from sessions where user_id = p_user_id; end if;
  return json_build_object('ok', 'set');
end;
$$ language plpgsql;

create or replace function public.review_achievement(p_token text, p_ach_id bigint, p_publish boolean)
returns json
security definer set search_path = public
as $$
declare v_mod uuid; v_role text;
begin
  select p.id, p.role into v_mod, v_role
  from sessions s join profiles p on p.id = s.user_id
  where s.token = p_token;
  if v_mod is null then return json_build_object('error', 'Не авторизован'); end if;
  if v_role not in ('owner', 'co-owner', 'creator') then
    return json_build_object('error', 'Нет доступа');
  end if;
  if p_publish then
    update achievements set status = 'published', reviewed_by = v_mod, reviewed_at = now()
    where id = p_ach_id;
    return json_build_object('ok', 'published');
  else
    delete from achievements where id = p_ach_id;
    return json_build_object('ok', 'deleted');
  end if;
end;
$$ language plpgsql;

create or replace function public.pending_achievements_count(p_token text)
returns json
security definer set search_path = public
as $$
declare v_id uuid; v_role text; v_n integer;
begin
  select p.id, p.role into v_id, v_role
  from sessions s join profiles p on p.id = s.user_id
  where s.token = p_token;
  if v_id is null then return json_build_object('error', 'Не авторизован'); end if;
  if v_role not in ('admin', 'owner', 'co-owner', 'creator') then
    return json_build_object('error', 'Нет доступа');
  end if;
  select count(*) into v_n from achievements where status = 'pending';
  return json_build_object('count', v_n);
end;
$$ language plpgsql;