-- ============================================================
-- v10: Уголок достижений (модерация)
-- status: pending → published (или удаляется при отклонении)
-- Модерация: owner, co-owner, creator
-- ============================================================

create table if not exists public.achievements (
  id bigserial primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  text text not null,
  status text not null default 'pending',
  created_at timestamptz default now(),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz
);

create index if not exists achievements_status_idx on public.achievements(status);

-- Подать достижение (только автор + не заблокирован + не на принудительной смене ника)
create or replace function public.submit_achievement(p_token text, p_text text)
returns json
security definer set search_path = public
as $$
declare v_id uuid; v_nick text; v_blocked boolean; v_mcn boolean;
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
  returning id into v_id;
  return json_build_object('ok', 'submitted', 'id', v_id, 'status', 'pending');
end;
$$ language plpgsql;

-- Модерация: опубликовать или удалить
create or replace function public.review_achievement(p_token text, p_ach_id bigint, p_publish boolean)
returns json
security definer set search_path = public
as $$
declare v_mod uuid; v_role text;
begin
  select p.id, p.role into v_mod, v_role
  from sessions s join profiles p on p.id = s.user_id
  where s.token = p_token;
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

-- Счётчик на проверку (модераторы)
create or replace function public.pending_achievements_count(p_token text)
returns json
security definer set search_path = public
as $$
declare v_role text; v_n integer;
begin
  select p.role into v_role
  from sessions s join profiles p on p.id = s.user_id
  where s.token = p_token;
  if v_role not in ('admin', 'owner', 'co-owner', 'creator') then
    return json_build_object('error', 'Нет доступа');
  end if;
  select count(*) into v_n from achievements where status = 'pending';
  return json_build_object('count', v_n);
end;
$$ language plpgsql;

-- Доступность таблицы: read для всех (published+свои видим), чтобы фронт показывал
alter table public.achievements enable row level security;
drop policy if exists "ach_public_read" on public.achievements;
create policy "ach_public_read" on public.achievements for select using (true);
-- запись только через RPC (submit_achievement / review_achievement работают как security definer)
drop policy if exists "ach_no_write" on public.achievements;
create policy "ach_no_write" on public.achievements for all using (false) with check (false);

-- Realtime для бейджа уведомлений
alter table public.achievements replica identity full;
do $$ begin
  alter publication supabase_realtime add table public.achievements;
exception when duplicate_object then null; end $$;