-- ============================================================
-- v15: ВОЗВРАТ ПОДДЕРЖКИ (откат форумных RPC)
-- Восстанавливает поведение create_request / post_message /
-- close_request как было до форума.
-- Колонки title/body/pinned остаются в таблице (не мешают).
-- ============================================================

-- --- 1. create_request как в поддержке ---
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

-- --- 2. post_message: только автор обращения и админ ---
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

-- --- 3. close_request: автор или админ ---
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