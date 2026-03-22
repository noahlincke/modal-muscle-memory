create table if not exists public.user_progress (
  user_id uuid primary key references auth.users (id) on delete cascade,
  progress_json jsonb not null,
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.user_progress enable row level security;

drop policy if exists "user_progress_select_own" on public.user_progress;
create policy "user_progress_select_own"
  on public.user_progress
  for select
  using (auth.uid() = user_id);

drop policy if exists "user_progress_insert_own" on public.user_progress;
create policy "user_progress_insert_own"
  on public.user_progress
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "user_progress_update_own" on public.user_progress;
create policy "user_progress_update_own"
  on public.user_progress
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
