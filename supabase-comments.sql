create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  anime_title text not null,
  chapter_number integer not null,
  username text not null,
  content text not null,
  created_at timestamptz not null default now()
);

alter table public.comments
add column if not exists user_id uuid references auth.users(id) on delete set null;

alter table public.comments enable row level security;

drop policy if exists "comments_select_public" on public.comments;
create policy "comments_select_public"
on public.comments
for select
to anon
using (true);

drop policy if exists "comments_insert_public" on public.comments;
drop policy if exists "comments_insert_authenticated" on public.comments;
create policy "comments_insert_authenticated"
on public.comments
for insert
to authenticated
with check (
  user_id = auth.uid()
  and
  length(trim(username)) between 1 and 40
  and length(trim(content)) between 1 and 500
);
