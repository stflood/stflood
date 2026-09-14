-- ============================================================
-- St. Flood — настройка БД для «Тех. Поддержки» (Supabase)
-- Выполни этот скрипт целиком в: Dashboard → SQL Editor → New query
-- ============================================================

-- Профили: ник + время последнего появления (для Online/Offline)
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nick text not null default '',
  last_seen timestamptz default now(),
  created_at timestamptz default now()
);

-- Обращения
create table if not exists public.requests (
  id bigserial primary key,
  created_at timestamptz default now(),
  status text not null default 'open',
  closed_reason text,
  closed_at timestamptz,
  creator_id uuid references auth.users(id) on delete set null
);

-- Сообщения в обращениях
create table if not exists public.request_messages (
  id bigserial primary key,
  request_id bigint references public.requests(id) on delete cascade,
  created_at timestamptz default now(),
  user_id uuid references auth.users(id) on delete cascade,
  nick text default '',
  text text not null default ''
);

-- Индексы для скорости
create index if not exists idx_requests_status on public.requests(status);
create index if not exists idx_messages_request on public.request_messages(request_id, id);

-- ============================================================
-- Row Level Security
-- ============================================================
alter table public.profiles enable row level security;
alter table public.requests enable row level security;
alter table public.request_messages enable row level security;

-- profiles: читать все могут, писать/менять только свой профиль
create policy "profiles_select" on public.profiles for select using (true);
create policy "profiles_insert" on public.profiles for insert with check (auth.uid() = user_id);
create policy "profiles_update" on public.profiles for update using (auth.uid() = user_id);

-- requests: читать все, создавать залогиненные, закрывать тоже залогиненные
create policy "requests_select" on public.requests for select using (true);
create policy "requests_insert" on public.requests for insert with check (auth.role() = 'authenticated');
create policy "requests_update" on public.requests for update using (auth.role() = 'authenticated');

-- request_messages: читать все, писать залогиненные
create policy "messages_select" on public.request_messages for select using (true);
create policy "messages_insert" on public.request_messages for insert with check (auth.role() = 'authenticated');

-- ============================================================
-- Realtime (живые обновления чата и статусов)
-- ============================================================
alter publication supabase_realtime add table public.requests;
alter publication supabase_realtime add table public.request_messages;
alter publication supabase_realtime add table public.profiles;

-- ============================================================
-- ДОПОЛНИТЕЛЬНО (обязательно сделать вручную):
-- Dashboard → Authentication → Providers → Email:
--   поставить Confirm email = OFF (чтобы не требовалось подтверждение почты)
-- ============================================================