-- ============================================================
-- St. Flood — v16: достижения — картинки + форматирование
-- Выполни целиком в SQL Editor → Run
-- ============================================================

-- Картинка в достижении
alter table public.achievements add column if not exists image text;

-- Storage: бакет для картинок достижений (публичный)
insert into storage.buckets (id, name, public)
values ('achievements', 'achievements', true)
on conflict (id) do nothing;

drop policy if exists "achievements_public_read" on storage.objects;
create policy "achievements_public_read" on storage.objects
for select using (bucket_id = 'achievements');

drop policy if exists "achievements_public_insert" on storage.objects;
create policy "achievements_public_insert" on storage.objects
for insert with check (
  bucket_id = 'achievements' and
  (storage.filename(name) ~* '\.(png|jpe?g|gif|webp)$')
);

drop policy if exists "achievements_public_update" on storage.objects;
drop policy if exists "achievements_public_delete" on storage.objects;

-- submit_achievement теперь принимает и картинку
create or replace function public.submit_achievement(p_token text, p_text text, p_image text default null)
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
  if nullif(trim(p_text), '') is null and p_image is null then return json_build_object('error', 'Пустое достижение'); end if;
  if p_image is not null and nullif(trim(p_image), '') is null then p_image := null; end if;
  insert into achievements (user_id, text, status, image)
  values (v_id, coalesce(trim(p_text), ''), 'pending', p_image)
  returning id into v_ach_id;
  return json_build_object('ok', 'submitted', 'id', v_ach_id, 'status', 'pending');
end;
$$ language plpgsql;