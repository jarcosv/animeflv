create extension if not exists pgcrypto;

create table if not exists public.anime_chapters (
  id uuid primary key default gen_random_uuid(),
  anime_title text not null,
  chapter_number integer not null,
  embed_url text not null,
  cover_image text,
  server_name text not null default 'Principal',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (anime_title, chapter_number, server_name)
);

create table if not exists public.animes (
  id uuid primary key default gen_random_uuid(),
  titulo text not null unique,
  image_url text not null,
  descripcion text not null default '',
  year integer,
  estado text not null default 'En emisión',
  generos text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.anime_chapters enable row level security;
alter table public.animes enable row level security;
alter table public.admin_users enable row level security;

alter table public.anime_chapters
add column if not exists cover_image text;

alter table public.anime_chapters
add column if not exists publish_status text not null default 'published';

alter table public.anime_chapters
add column if not exists sections text[] not null default '{}';

alter table public.anime_chapters
add column if not exists downloads jsonb not null default '[]'::jsonb;

do $$
declare
  constraint_name text;
begin
  select con.conname into constraint_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'anime_chapters'
    and con.contype = 'u'
    and (
      select array_agg(att.attname::text order by cols.ordinality)
      from unnest(con.conkey) with ordinality as cols(attnum, ordinality)
      join pg_attribute att on att.attrelid = rel.oid and att.attnum = cols.attnum
    ) = array['anime_title', 'chapter_number']::text[];

  if constraint_name is not null then
    execute format('alter table public.anime_chapters drop constraint %I', constraint_name);
  end if;
end $$;

create unique index if not exists anime_chapters_anime_episode_server_unique
on public.anime_chapters (anime_title, chapter_number, server_name);

alter table public.animes
add column if not exists slug text;

alter table public.animes
add column if not exists publish_status text not null default 'published';

alter table public.animes
add column if not exists sections text[] not null default '{}';

alter table public.animes
add column if not exists sort_order integer not null default 0;

alter table public.animes
add column if not exists banner_image text;

create table if not exists public.site_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.social_links (
  id uuid primary key default gen_random_uuid(),
  title text not null default '',
  url text not null,
  sort_order integer not null default 0,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists animes_slug_unique
on public.animes (slug)
where slug is not null and slug <> '';

alter table public.site_settings enable row level security;
alter table public.social_links enable row level security;

drop policy if exists "anime_chapters_select_public" on public.anime_chapters;
create policy "anime_chapters_select_public"
on public.anime_chapters
for select
to anon, authenticated
using (
  publish_status = 'published'
  or exists (select 1 from public.admin_users where user_id = auth.uid())
);

drop policy if exists "anime_chapters_insert_public" on public.anime_chapters;
drop policy if exists "anime_chapters_update_public" on public.anime_chapters;
drop policy if exists "anime_chapters_delete_public" on public.anime_chapters;
drop policy if exists "anime_chapters_insert_admin" on public.anime_chapters;
create policy "anime_chapters_insert_admin"
on public.anime_chapters
for insert
to authenticated
with check (
  exists (select 1 from public.admin_users where user_id = auth.uid())
  and
  length(trim(anime_title)) between 1 and 200
  and chapter_number between 0 and 5000
  and embed_url like 'https://%'
  and (cover_image is null or cover_image = '' or cover_image like 'images/%' or cover_image like 'https://%')
  and jsonb_typeof(downloads) = 'array'
  and publish_status in ('published', 'draft', 'hidden')
  and sections <@ array['inicio', 'estrenos', 'completos', 'populares', 'destacados']::text[]
  and length(trim(server_name)) between 1 and 80
);

drop policy if exists "anime_chapters_update_admin" on public.anime_chapters;
create policy "anime_chapters_update_admin"
on public.anime_chapters
for update
to authenticated
using (exists (select 1 from public.admin_users where user_id = auth.uid()))
with check (
  exists (select 1 from public.admin_users where user_id = auth.uid())
  and
  length(trim(anime_title)) between 1 and 200
  and chapter_number between 0 and 5000
  and embed_url like 'https://%'
  and (cover_image is null or cover_image = '' or cover_image like 'images/%' or cover_image like 'https://%')
  and jsonb_typeof(downloads) = 'array'
  and publish_status in ('published', 'draft', 'hidden')
  and sections <@ array['inicio', 'estrenos', 'completos', 'populares', 'destacados']::text[]
  and length(trim(server_name)) between 1 and 80
);

drop policy if exists "anime_chapters_delete_admin" on public.anime_chapters;
create policy "anime_chapters_delete_admin"
on public.anime_chapters
for delete
to authenticated
using (exists (select 1 from public.admin_users where user_id = auth.uid()));

drop policy if exists "animes_select_public" on public.animes;
create policy "animes_select_public"
on public.animes
for select
to anon, authenticated
using (
  publish_status = 'published'
  or exists (select 1 from public.admin_users where user_id = auth.uid())
);

drop policy if exists "animes_insert_public" on public.animes;
drop policy if exists "animes_update_public" on public.animes;
drop policy if exists "animes_delete_public" on public.animes;
drop policy if exists "animes_insert_admin" on public.animes;
create policy "animes_insert_admin"
on public.animes
for insert
to authenticated
with check (
  exists (select 1 from public.admin_users where user_id = auth.uid())
  and
  length(trim(titulo)) between 1 and 200
  and (image_url like 'images/%' or image_url like 'https://%')
  and length(trim(estado)) between 1 and 40
  and (slug is null or slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
  and publish_status in ('published', 'draft', 'hidden')
  and sections <@ array['inicio', 'sin_inicio', 'estrenos', 'completos', 'populares', 'destacados', 'directorio', 'latino']::text[]
  and sort_order between 0 and 100000
  and (year is null or year between 1900 and 2100)
  and (banner_image is null or banner_image = '' or banner_image like 'images/%' or banner_image like '/images/%' or banner_image like 'https://%')
);

drop policy if exists "animes_update_admin" on public.animes;
create policy "animes_update_admin"
on public.animes
for update
to authenticated
using (exists (select 1 from public.admin_users where user_id = auth.uid()))
with check (
  exists (select 1 from public.admin_users where user_id = auth.uid())
  and
  length(trim(titulo)) between 1 and 200
  and (image_url like 'images/%' or image_url like 'https://%')
  and length(trim(estado)) between 1 and 40
  and (slug is null or slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
  and publish_status in ('published', 'draft', 'hidden')
  and sections <@ array['inicio', 'sin_inicio', 'estrenos', 'completos', 'populares', 'destacados', 'directorio', 'latino']::text[]
  and sort_order between 0 and 100000
  and (year is null or year between 1900 and 2100)
  and (banner_image is null or banner_image = '' or banner_image like 'images/%' or banner_image like '/images/%' or banner_image like 'https://%')
);

drop policy if exists "animes_delete_admin" on public.animes;
create policy "animes_delete_admin"
on public.animes
for delete
to authenticated
using (exists (select 1 from public.admin_users where user_id = auth.uid()));

drop policy if exists "admin_users_select_own" on public.admin_users;
create policy "admin_users_select_own"
on public.admin_users
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "site_settings_select_public" on public.site_settings;
create policy "site_settings_select_public"
on public.site_settings
for select
to anon, authenticated
using (true);

drop policy if exists "site_settings_insert_admin" on public.site_settings;
create policy "site_settings_insert_admin"
on public.site_settings
for insert
to authenticated
with check (
  exists (select 1 from public.admin_users where user_id = auth.uid())
  and key in ('social_intro', 'carousel_settings')
  and jsonb_typeof(value) = 'object'
);

drop policy if exists "site_settings_update_admin" on public.site_settings;
create policy "site_settings_update_admin"
on public.site_settings
for update
to authenticated
using (exists (select 1 from public.admin_users where user_id = auth.uid()))
with check (
  exists (select 1 from public.admin_users where user_id = auth.uid())
  and key in ('social_intro', 'carousel_settings')
  and jsonb_typeof(value) = 'object'
);

drop policy if exists "social_links_select_public" on public.social_links;
create policy "social_links_select_public"
on public.social_links
for select
to anon, authenticated
using (enabled = true or exists (select 1 from public.admin_users where user_id = auth.uid()));

drop policy if exists "social_links_insert_admin" on public.social_links;
create policy "social_links_insert_admin"
on public.social_links
for insert
to authenticated
with check (
  exists (select 1 from public.admin_users where user_id = auth.uid())
  and length(trim(coalesce(title, ''))) <= 40
  and url like 'https://%'
  and sort_order between 0 and 100000
);

drop policy if exists "social_links_update_admin" on public.social_links;
create policy "social_links_update_admin"
on public.social_links
for update
to authenticated
using (exists (select 1 from public.admin_users where user_id = auth.uid()))
with check (
  exists (select 1 from public.admin_users where user_id = auth.uid())
  and length(trim(coalesce(title, ''))) <= 40
  and url like 'https://%'
  and sort_order between 0 and 100000
);

drop policy if exists "social_links_delete_admin" on public.social_links;
create policy "social_links_delete_admin"
on public.social_links
for delete
to authenticated
using (exists (select 1 from public.admin_users where user_id = auth.uid()));

create table if not exists public.episode_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  reporter_username text,
  anime_title text not null,
  anime_slug text,
  chapter_number integer,
  server_name text,
  embed_url text,
  page_url text,
  reason text,
  status text not null default 'open',
  created_at timestamptz not null default now()
);

alter table public.episode_reports
  add column if not exists user_id uuid;

alter table public.episode_reports
  add column if not exists reporter_username text;

alter table public.episode_reports enable row level security;

create index if not exists episode_reports_status_created_idx
on public.episode_reports (status, created_at desc);

create index if not exists episode_reports_user_id_idx
on public.episode_reports (user_id);

create index if not exists episode_reports_reporter_username_idx
on public.episode_reports (reporter_username);

drop policy if exists "episode_reports_insert_public" on public.episode_reports;
create policy "episode_reports_insert_public"
on public.episode_reports
for insert
to anon, authenticated
with check (
  status = 'open'
  and length(anime_title) between 1 and 220
  and coalesce(length(reason), 0) <= 500
  and coalesce(length(reporter_username), 0) between 1 and 80
  and (
    auth.uid() is null
    or user_id = auth.uid()
  )
  and (
    auth.uid() is not null
    or user_id is null
  )
);

drop policy if exists "episode_reports_select_admin" on public.episode_reports;
create policy "episode_reports_select_admin"
on public.episode_reports
for select
to authenticated
using (exists (select 1 from public.admin_users where user_id = auth.uid()));

drop policy if exists "episode_reports_update_admin" on public.episode_reports;
create policy "episode_reports_update_admin"
on public.episode_reports
for update
to authenticated
using (exists (select 1 from public.admin_users where user_id = auth.uid()))
with check (exists (select 1 from public.admin_users where user_id = auth.uid()));
