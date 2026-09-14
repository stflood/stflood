-- ============================================================
-- v12: Исправление submit_achievement
-- Ошибка: returning id (bigint) писался в v_id (uuid) → DB-ошибка
-- при реальной подаче достижения. Теперь отдельная bigint-переменная.
-- ============================================================

create or replace function public.submit_achievement(p_token text, p_text text)
returns json
security definer set search_path = public
as $$
declare v_id uuid; v_nick text; v_blocked boolean; v_mcn boolean; v_ach_id bigint;
begin
  select p.id, p.nick, p.blocked, p.must_change_nick into v_id, v_nick, v_blocked, v_mcn
  from sessions s join profiles p on p.id = s.user_id
  where s.token = p_token;
  if v_id is null then return json_build_object('error', 'Не авторизован'); end if;
  if v_blocked then return json_build_object('error', 'Аккаунт заблокирован'); end if;
  if v_mcn then return json_build_object('error', 'Сначала смени ник — подавать нельзя'); end if;
  if nullif(trim(p_text), '') is null then return json_build_object('error', 'Пустое достижение'); end if;
  insert into achievements (user_id, text, status)
  values (v_id, trim(p_text), 'pending')
  returning id into v_ach_id;
  return json_build_object('ok', 'submitted', 'id', v_ach_id, 'status', 'pending');
end;
$$ language plpgsql;