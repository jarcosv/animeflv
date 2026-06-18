param(
  [string]$In = "data/animeflv-animes.json",
  [string]$OutDir = "data/animeflv-sql-batches",
  [int]$BatchSize = 200
)

$ErrorActionPreference = "Stop"
$EmisionStatus = "En emisi$([char]0x00f3)n"

function Sql-String {
  param($Value)
  if ($null -eq $Value -or [string]::IsNullOrWhiteSpace([string]$Value)) { return "null" }
  return "'" + ([string]$Value).Replace("'", "''") + "'"
}

function Sql-RequiredString {
  param($Value)
  if ($null -eq $Value -or [string]::IsNullOrWhiteSpace([string]$Value)) { return "''" }
  return "'" + ([string]$Value).Replace("'", "''") + "'"
}

function Sql-TextArray {
  param($Values)
  $clean = @($Values | Where-Object { -not [string]::IsNullOrWhiteSpace([string]$_) } | Select-Object -Unique)
  if ($clean.Count -eq 0) { return "array[]::text[]" }
  return "array[$(($clean | ForEach-Object { Sql-String $_ }) -join ',')]::text[]"
}

function Normalize-Anime {
  param($Anime)
  if ($Anime.estado -ne "Completo") {
    $Anime.estado = $EmisionStatus
  }
  if ([string]::IsNullOrWhiteSpace($Anime.publish_status)) {
    $Anime.publish_status = "published"
  }
  if ($null -eq $Anime.sections -or $Anime.sections.Count -eq 0) {
    $Anime.sections = @("directorio", "sin_inicio")
  }
  if ($null -eq $Anime.sort_order) {
    $Anime.sort_order = 0
  }
  return $Anime
}

function Build-Sql {
  param([object[]]$Animes, [int]$BatchNumber, [int]$StartIndex, [int]$EndIndex)

  $rows = foreach ($anime in $Animes) {
    @"
(
  $(Sql-String $anime.titulo),
  $(Sql-String $anime.image_url),
  $(Sql-String $anime.banner_image),
  $(Sql-RequiredString $anime.descripcion),
  null::integer,
  $(Sql-String $anime.estado),
  $(Sql-TextArray $anime.generos),
  $(Sql-String $anime.slug),
  $(Sql-String $anime.publish_status),
  $(Sql-TextArray $anime.sections),
  $($anime.sort_order)
)
"@
  }

  return @"
-- AnimeJD import AnimeFLV metadata
-- Lote $BatchNumber, filas $StartIndex-$EndIndex. No incluye embeds/videos.

with incoming (
  titulo,
  image_url,
  banner_image,
  descripcion,
  year,
  estado,
  generos,
  slug,
  publish_status,
  sections,
  sort_order
) as (
  values
$($rows -join ",`n")
),
updated_by_slug as (
  update public.animes target
  set
    titulo = case
      when not exists (
        select 1
        from public.animes title_check
        where title_check.titulo = incoming.titulo
          and title_check.id <> target.id
      ) then incoming.titulo
      else target.titulo
    end,
    image_url = incoming.image_url,
    banner_image = coalesce(nullif(incoming.banner_image, ''), target.banner_image),
    descripcion = coalesce(nullif(incoming.descripcion, ''), target.descripcion),
    year = coalesce(incoming.year, target.year),
    estado = incoming.estado,
    generos = case
      when cardinality(incoming.generos) > 0 then incoming.generos
      else target.generos
    end,
    publish_status = incoming.publish_status,
    sections = array(
      select distinct unnest(coalesce(target.sections, '{}'::text[]) || incoming.sections)
    ),
    sort_order = target.sort_order,
    updated_at = now()
  from incoming
  where target.slug = incoming.slug
  returning target.id
),
updated_by_title as (
  update public.animes target
  set
    image_url = incoming.image_url,
    banner_image = coalesce(nullif(incoming.banner_image, ''), target.banner_image),
    descripcion = coalesce(nullif(incoming.descripcion, ''), target.descripcion),
    year = coalesce(incoming.year, target.year),
    estado = incoming.estado,
    generos = case
      when cardinality(incoming.generos) > 0 then incoming.generos
      else target.generos
    end,
    slug = incoming.slug,
    publish_status = incoming.publish_status,
    sections = array(
      select distinct unnest(coalesce(target.sections, '{}'::text[]) || incoming.sections)
    ),
    sort_order = target.sort_order,
    updated_at = now()
  from incoming
  where target.titulo = incoming.titulo
    and not exists (
      select 1
      from updated_by_slug slug_update
      where slug_update.id = target.id
    )
    and not exists (
      select 1
      from public.animes slug_check
      where slug_check.slug = incoming.slug
        and slug_check.id <> target.id
    )
  returning target.id
)
insert into public.animes (
  titulo,
  image_url,
  banner_image,
  descripcion,
  year,
  estado,
  generos,
  slug,
  publish_status,
  sections,
  sort_order
)
select
  incoming.titulo,
  incoming.image_url,
  incoming.banner_image,
  incoming.descripcion,
  incoming.year,
  incoming.estado,
  incoming.generos,
  incoming.slug,
  incoming.publish_status,
  incoming.sections,
  incoming.sort_order
from incoming
where not exists (
  select 1
  from public.animes existing
  where existing.slug = incoming.slug
     or existing.titulo = incoming.titulo
);
"@
}

if ($BatchSize -lt 1) {
  throw "BatchSize debe ser mayor que 0."
}

$rawAnimes = Get-Content $In -Raw | ConvertFrom-Json
$animes = foreach ($anime in $rawAnimes) {
  Normalize-Anime $anime
}
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

Get-ChildItem -Path $OutDir -Filter "*.sql" -File | Remove-Item -Force

for ($i = 0; $i -lt $animes.Count; $i += $BatchSize) {
  $end = [Math]::Min($i + $BatchSize - 1, $animes.Count - 1)
  $batch = @($animes[$i..$end])
  $batchNumber = [Math]::Floor($i / $BatchSize) + 1
  $fileName = "animeflv-animes-{0:000}.sql" -f $batchNumber
  $path = Join-Path $OutDir $fileName
  Build-Sql $batch $batchNumber ($i + 1) ($end + 1) | Set-Content -Encoding UTF8 $path
}

Write-Host "Listo: $($animes.Count) animes en $([Math]::Ceiling($animes.Count / $BatchSize)) lotes"
Write-Host "Carpeta: $OutDir"
