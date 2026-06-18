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
