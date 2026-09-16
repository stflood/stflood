-- ============================================================
-- St. Flood — v17: новости — публикация/редактирование/удаление
-- Только роль "creator" может добавлять/менять/удалять новости.
-- Все видят опубликованные новости сразу (realtime).
-- Выполни целиком в SQL Editor → Run
-- ============================================================

-- ⚠️ Если новость уже была создана с полем id: uuid — сначала выполни:
--   drop table if exists public.news;

-- ─── таблица новостей ───
create table if not exists public.news (
  id text primary key default gen_random_uuid()::text,
  title text not null,
  excerpt text not null default '',
  content text not null default '',
  author_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint news_author_fk foreign key (author_id)
    references public.profiles (id) on delete cascade
);

-- RLS
alter table public.news enable row level security;

drop policy if exists "news_public_read" on public.news;
create policy "news_public_read" on public.news
for select using (true);

-- ─── стартовые новости (текущие) ───
insert into public.news (id, title, excerpt, content, author_id, created_at, updated_at)
values
  ('dizajn-obnovlenie', 'Сайт обновился: новый дизайн', 'Обновил дизайн сайта, сделал удобную мобильную версию и починил разные мелочи — смотри что изменилось!',
   'Привет! Обновил дизайн сайта, вот что изменилось:|1. Мобильная версия. Теперь на телефоне сайт выглядит как надо: меню сворачивается в кнопку-бургер, шапка стала компактной, а страницы аккуратно подстраиваются под любой экран.|2. Шапка сайта. Название из нечитаемых символов заменил на аккуратное «St. Flood».|3. Новости. У каждой новости теперь видно автора: аватарка, ник и роль — а дата публикации всегда под рукой.|4. Раздел «Достижения». Теперь можно добавлять картинки к достижению и красиво форматировать текст (жирный, курсив, подчёркнутый).|5. Тех. Поддержка. Отрегулировал ширину окна обращений, чтобы им было удобно пользоваться и на компьютере, и на телефоне.|Спасибо, что вы с нами в флуде St. Flood!',
   'ac21f8f9-b5a2-4a06-9e7a-8bab8ff74b13', '2026-09-15 10:00:00+00', '2026-09-15 10:00:00+00'),
  ('tretij-kult', 'Третий культ', 'На сайте появился третий культ — заходи на главную и изучай!',
   'Привет! На сайте появился <b>3. Третий культ</b>.<|Раньше мы делились на два культа, теперь к нам присоединился ещё один — загляните на главную страницу, чтобы рассмотреть его.|А на этом пока всё. Спасибо, что вы с нами в флуде St. Flood!',
   'ac21f8f9-b5a2-4a06-9e7a-8bab8ff74b13', '2026-09-15 09:00:00+00', '2026-09-15 09:00:00+00'),
  ('obnovlenie-2', 'Уголок достижений, роли и уведомления', 'Новый раздел «Достижения», роли игроков и уведомления для команды — обновление уже на сайте!',
   'Привет! Новое обновление уже на сайте, вот что добавилось:|1. Уголок достижений. Вкладка «Достижения» — там можно похвастаться тем, чем гордишься: победы, рекорды, смешные моменты. Подача проходит проверку, после которой спокойно появляется в общем списке.|2. Роли. У каждого в профиле теперь видна роль: Игрок, Тестер, Админ, Совладелец, Владелец или Создатель сайта.|3. Уведомления. Команде приходят уведомления об обращениях в техподдержке и новых достижениях на проверке — отвечаем быстрее.|Загляни в раздел «Достижения» — может, у тебя уже есть чем гордиться!|Спасибо, что вы с нами в флуде St. Flood!',
   'ac21f8f9-b5a2-4a06-9e7a-8bab8ff74b13', '2026-09-14 12:00:00+00', '2026-09-14 12:00:00+00'),
  ('obnovlenie-1', 'Большое обновление: профили, аватарки, пользователи и техподдержка', 'Регистрация, профиль, аватарки, пользователи и техподдержка — зацени обновление прямо сейчас!',
   'Привет! Я добавил много всякого, и вы можете заценить это прямо сейчас!|1. Регистрация и вход. Теперь, когда вы зарегистрируетесь, о вашем пароле никто не узнает — даже я, — и вы будете в безопасности. А ещё появился профиль: туда можно добавить своё описание и свою аватарку.|2. Пользователи. Добавил вкладку «Пользователи» — там можно посмотреть список всех зарегистрированных пользователей и их статус: в сети они или нет.|3. Тех. Поддержка. Это система обращений, в которой я, владелец, смогу отвечать на ваши вопросы или проблемы.|4. Аватарки. Про это уже говорил.|5. Профили друг друга. Клик по нику игрока — и можно посмотреть чужой профиль.|6. Ник и пароль. В профиле можно спокойно поменять ник или пароль — без всяких там просьб, всё сам.|7. Новости. И, конечно, эта самая вкладка «Новости» — сюда буду писать обо всём новом.|И на этом пока что все. Спасибо, что с нами в флуде St. Flood, и мы рады вас тут видеть!|Ожидайте больше новостей в нашей группе ТГ, или же тут!',
   'ac21f8f9-b5a2-4a06-9e7a-8bab8ff74b13', '2026-09-14 11:00:00+00', '2026-09-14 11:00:00+00')
on conflict (id) do nothing;

-- Realtime
alter table public.news replica identity full;
do $$ begin
  alter publication supabase_realtime add table public.news;
exception when duplicate_object then null; end $$;

-- ─── публикация новости (только creator) ───
create or replace function public.publish_news(p_token text, p_title text, p_excerpt text, p_content text)
returns json
security definer set search_path = public
as $$
declare v_id uuid; v_nick text; v_role text; v_blocked boolean;
begin
  select p.id, p.role, p.blocked into v_id, v_role, v_blocked
  from sessions s join profiles p on p.id = s.user_id
  where s.token = p_token;
  if v_id is null then return json_build_object('error', 'Не авторизован'); end if;
  if v_blocked then return json_build_object('error', 'Аккаунт заблокирован'); end if;
  if v_role <> 'creator' then return json_build_object('error', 'Нет доступа — новости может публиковать только Создатель сайта'); end if;
  if nullif(trim(p_title), '') is null then return json_build_object('error', 'Заголовок не может быть пустым'); end if;
  if nullif(trim(p_content), '') is null then return json_build_object('error', 'Текст новости не может быть пустым'); end if;
  insert into news (title, excerpt, content, author_id)
  values (trim(p_title), nullif(trim(p_excerpt), ''), trim(p_content), v_id)
  returning id into v_id;
  return json_build_object('ok', 'published', 'id', v_id);
end;
$$ language plpgsql;

-- ─── редактирование новости (только creator) ───
create or replace function public.update_news(p_token text, p_news_id text, p_title text, p_excerpt text, p_content text)
returns json
security definer set search_path = public
as $$
declare v_id uuid; v_role text; v_blocked boolean; v_news text;
begin
  select p.id, p.role, p.blocked into v_id, v_role, v_blocked
  from sessions s join profiles p on p.id = s.user_id
  where s.token = p_token;
  if v_id is null then return json_build_object('error', 'Не авторизован'); end if;
  if v_blocked then return json_build_object('error', 'Аккаунт заблокирован'); end if;
  if v_role <> 'creator' then return json_build_object('error', 'Нет доступа — новости может редактировать только Создатель сайта'); end if;
  select id into v_news from news where id = p_news_id;
  if v_news is null then return json_build_object('error', 'Новость не найдена'); end if;
  if nullif(trim(p_title), '') is null then return json_build_object('error', 'Заголовок не может быть пустым'); end if;
  if nullif(trim(p_content), '') is null then return json_build_object('error', 'Текст новости не может быть пустым'); end if;
  update news set
    title = trim(p_title),
    excerpt = nullif(trim(p_excerpt), ''),
    content = trim(p_content),
    updated_at = now()
  where id = p_news_id;
  return json_build_object('ok', 'updated', 'id', p_news_id);
end;
$$ language plpgsql;

-- ─── удаление новости (только creator) ───
create or replace function public.delete_news(p_token text, p_news_id text)
returns json
security definer set search_path = public
as $$
declare v_id uuid; v_role text; v_blocked boolean; v_news text;
begin
  select p.id, p.role, p.blocked into v_id, v_role, v_blocked
  from sessions s join profiles p on p.id = s.user_id
  where s.token = p_token;
  if v_id is null then return json_build_object('error', 'Не авторизован'); end if;
  if v_blocked then return json_build_object('error', 'Аккаунт заблокирован'); end if;
  if v_role <> 'creator' then return json_build_object('error', 'Нет доступа — новости может удалять только Создатель сайта'); end if;
  select id into v_news from news where id = p_news_id;
  if v_news is null then return json_build_object('error', 'Новость не найдена'); end if;
  delete from news where id = p_news_id;
  return json_build_object('ok', 'deleted', 'id', p_news_id);
end;
$$ language plpgsql;