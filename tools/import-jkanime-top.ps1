param(
  [string]$OutJson = "data/jkanime-populares.json",
  [string]$OutSql = "data/jkanime-populares.sql",
  [int]$Limit = 50,
  [int]$MinYear = 2006,
  [int]$MaxYear = 2026
)

$ErrorActionPreference = "Stop"
$BaseUrl = "https://jkanime.net"

function Get-Page {
  param([string]$Url)
  $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -Headers @{
    "User-Agent" = "Mozilla/5.0 AnimeJD metadata importer"
  }
  return [string]$response.Content
}

function Decode-Html {
  param($Value)
  if ($null -eq $Value) { return "" }
  return [System.Net.WebUtility]::HtmlDecode([string]$Value).Trim()
}

function Strip-Tags {
  param([string]$Html)
  return (Decode-Html (($Html -replace "<[^>]+>", " ") -replace "\s+", " ")).Trim()
}

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

function Get-SlugFromUrl {
  param([string]$Url)
  return (($Url.TrimEnd("/") -split "/")[-1])
}

function Parse-Top {
  param([string]$Html)
  $items = New-Object System.Collections.Generic.List[object]
  $pattern = '<a href="(?<url>https://jkanime\.net/[^"]+/)"><div class="card-img"><img class="card-img-top" src="(?<image>[^"]+)" alt="(?<title>[^"]+)"></div>\s*<div class="card-badge">.*?</i>\s*(?<votes>\d+)</div>.*?<div data-rank="(?<rank>\d+)"'
  foreach ($m in [regex]::Matches($Html, $pattern, [System.Text.RegularExpressions.RegexOptions]::Singleline)) {
    $items.Add([pscustomobject]@{
      titulo = Decode-Html $m.Groups["title"].Value
      source_url = $m.Groups["url"].Value
      image_url = Decode-Html $m.Groups["image"].Value
      slug = Get-SlugFromUrl $m.Groups["url"].Value
      votes = [int]$m.Groups["votes"].Value
      rank = [int]$m.Groups["rank"].Value
    })
  }
  return @($items | Sort-Object rank | Select-Object -First $Limit)
}

function Parse-Detail {
  param([string]$Html)

  $description = ""
  $descriptionMatch = [regex]::Match($Html, '<p class="scroll">(?<text>.*?)</p>', [System.Text.RegularExpressions.RegexOptions]::Singleline)
  if ($descriptionMatch.Success) {
    $description = Strip-Tags $descriptionMatch.Groups["text"].Value
  } else {
    $metaMatch = [regex]::Match($Html, '<meta name="description" content="(?<text>[^"]*)"', [System.Text.RegularExpressions.RegexOptions]::Singleline)
    if ($metaMatch.Success) { $description = Decode-Html $metaMatch.Groups["text"].Value }
  }

  $genres = @()
  $genresMatch = [regex]::Match($Html, '<li><span>Generos:</span>(?<html>.*?)</li>', [System.Text.RegularExpressions.RegexOptions]::Singleline)
  if ($genresMatch.Success) {
    $genres = @([regex]::Matches($genresMatch.Groups["html"].Value, '>(?<genre>[^<>]+)</a>') | ForEach-Object {
      Decode-Html $_.Groups["genre"].Value
    } | Where-Object { $_ })
  }

  $year = $null
  $yearMatch = [regex]::Match($Html, '(Temporada:|Emitido:).*?(?<year>20\d{2}|19\d{2})', [System.Text.RegularExpressions.RegexOptions]::Singleline)
  if ($yearMatch.Success) { $year = [int]$yearMatch.Groups["year"].Value }

  $state = "En emision"
  if ($Html -match "Concluido") { $state = "Completo" }

  return [pscustomobject]@{
    descripcion = $description
    generos = $genres
    year = $year
    estado = $state
  }
}

function Build-Sql {
  param([object[]]$Animes)

  $rows = foreach ($anime in $Animes) {
    @"
(
  $(Sql-String $anime.titulo),
  $(Sql-String $anime.image_url),
  null,
  $(Sql-RequiredString $anime.descripcion),
  $($anime.year),
  $(Sql-String $anime.estado),
  $(Sql-TextArray $anime.generos),
  $(Sql-String $anime.slug),
  'published',
  array['inicio','populares','directorio']::text[],
  $([Math]::Max(1, 100000 - [int]$anime.rank))
)
"@
  }

  return @"
-- AnimeJD import JkAnime populares
-- Fuente: $BaseUrl/top
-- Rango aplicado: $MinYear-$MaxYear
-- No incluye embeds/videos.

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
upserted as (
  update public.animes target
  set
    titulo = incoming.titulo,
    image_url = incoming.image_url,
    banner_image = coalesce(incoming.banner_image, target.banner_image),
    descripcion = incoming.descripcion,
    year = incoming.year,
    estado = incoming.estado,
    generos = incoming.generos,
    publish_status = incoming.publish_status,
    sections = array(select distinct unnest(coalesce(target.sections, '{}'::text[]) || incoming.sections)),
    sort_order = incoming.sort_order,
    updated_at = now()
  from incoming
  where target.slug = incoming.slug or target.titulo = incoming.titulo
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
  select 1 from public.animes existing
  where existing.slug = incoming.slug or existing.titulo = incoming.titulo
);
"@
}

New-Item -ItemType Directory -Force -Path (Split-Path $OutJson) | Out-Null

$top = Parse-Top (Get-Page "$BaseUrl/top")
$result = New-Object System.Collections.Generic.List[object]

foreach ($item in $top) {
  Start-Sleep -Milliseconds 250
  $detail = Parse-Detail (Get-Page $item.source_url)
  if ($null -eq $detail.year -or $detail.year -lt $MinYear -or $detail.year -gt $MaxYear) { continue }

  $result.Add([pscustomobject]@{
    titulo = $item.titulo
    image_url = $item.image_url
    descripcion = $detail.descripcion
    year = $detail.year
    estado = $detail.estado
    generos = $detail.generos
    slug = $item.slug
    rank = $item.rank
    votes = $item.votes
    source_url = $item.source_url
    sections = @("inicio", "populares", "directorio")
  })
}

$animes = @($result | Sort-Object rank)
$animes | ConvertTo-Json -Depth 8 | Set-Content -Encoding UTF8 $OutJson
Build-Sql $animes | Set-Content -Encoding UTF8 $OutSql

Write-Host "Listo: $($animes.Count) populares en $OutJson y $OutSql"
