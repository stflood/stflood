-- ============================================================
-- v9: Realtime — чтобы уведомления работали
-- ============================================================

-- Replica identity для полного payload'а
alter table public.requests replica identity full;
alter table public.request_messages replica identity full;

-- Добавляем таблицы в публикацию realtime (если ещё не добавлены)
do $$ begin
  alter publication supabase_realtime add table public.requests;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.request_messages;
exception when duplicate_object then null; end $$;
