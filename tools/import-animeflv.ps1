param(
  [int]$StartPage = 1,
  [int]$EndPage = 0,
  [int]$DelayMs = 1200,
  [string]$Out = "data/animeflv-animes.json",
  [string]$Sql = "data/animeflv-animes.sql"
)

$ErrorActionPreference = "Stop"
$Source = "https://www4.animeflv.net"

function Decode-Entities {
  param([string]$Value)
  if ($null -eq $Value) { return "" }
  return [System.Net.WebUtility]::HtmlDecode($Value)
}

function Strip-Tags {
  param([string]$Value)
  if ($null -eq $Value) { $Value = "" }
  $text = [regex]::Replace($Value, "<[^>]+>", " ")
  $text = Decode-Entities $text
  return [regex]::Replace($text, "\s+", " ").Trim()
}

function Get-AbsoluteUrl {
  param([string]$Value)
  if ([string]::IsNullOrWhiteSpace($Value)) { return "" }
  try {
    return ([Uri]::new([Uri]$Source, $Value)).AbsoluteUri
  } catch {
    return ""
  }
}

function Sql-String {
  param($Value)
  if ($null -eq $Value -or [string]::IsNullOrWhiteSpace([string]$Value)) { return "null" }
  return "'" + ([string]$Value).Replace("'", "''") + "'"
}

function Sql-TextArray {
  param([string[]]$Values)
  $clean = @($Values | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Select-Object -Unique)
  if ($clean.Count -eq 0) { return "array[]::text[]" }
  return "array[$(($clean | ForEach-Object { Sql-String $_ }) -join ',')]::text[]"
}

function Fetch-Text {
  param([string]$Url)
  for ($attempt = 1; $attempt -le 3; $attempt++) {
    try {
      return (Invoke-WebRequest -Uri $Url -UseBasicParsing -Headers @{
        "User-Agent" = "AnimeJD metadata importer (+manual admin import)"
        "Accept" = "text/html,application/xhtml+xml"
      }).Content
    } catch {
      if ($attempt -eq 3) { throw }
      Start-Sleep -Milliseconds ($DelayMs * $attempt * 2)
    }
  }
}

function Get-LastPage {
  param([string]$Html)
  $pages = [regex]::Matches($Html, "/browse\?page=(\d+)") | ForEach-Object { [int]$_.Groups[1].Value }
  if ($pages.Count -eq 0) { return 1 }
  return ($pages | Measure-Object -Maximum).Maximum
}

function Parse-BrowsePage {
  param([string]$Html)
  $items = New-Object System.Collections.Generic.List[object]
  $articles = [regex]::Matches($Html, '<article class="Anime alt B">([\s\S]*?)</article>')

  foreach ($articleMatch in $articles) {
    $article = $articleMatch.Groups[1].Value
    $href = ([regex]::Match($article, '<a href="([^"]*/anime/[^"]+)"')).Groups[1].Value
    $image = ([regex]::Match($article, '<img src="([^"]+)"')).Groups[1].Value
    $title = ([regex]::Match($article, '<h3 class="Title">([\s\S]*?)</h3>')).Groups[1].Value
    $description = ([regex]::Match($article, '<div class="Description">[\s\S]*?<p>[\s\S]*?</p>\s*<p>([\s\S]*?)</p>')).Groups[1].Value
    $type = ([regex]::Match($article, '<span class="Type ([^"]+)"')).Groups[1].Value
    $cleanTitle = Strip-Tags $title
    $path = ([regex]::Replace($href, '^https?://[^/]+', ''))
    $slug = $path.Replace('/anime/', '').Trim('/')

    if ([string]::IsNullOrWhiteSpace($cleanTitle) -or [string]::IsNullOrWhiteSpace($slug)) {
      continue
    }

    $items.Add([pscustomobject]@{
      titulo = $cleanTitle
      image_url = Get-AbsoluteUrl $image
      banner_image = ""
      descripcion = Strip-Tags $description
      year = $null
      estado = $(if ($type -eq "movie") { "Completo" } else { "En emisión" })
      generos = @()
      slug = $slug
      publish_status = "published"
      sections = @("directorio", "sin_inicio")
      sort_order = 0
      source_url = Get-AbsoluteUrl $path
    })
  }

  return $items
}

function Build-Sql {
  param([object[]]$Animes)
  $rows = foreach ($anime in $Animes) {
    @"
(
  $(Sql-String $anime.titulo),
  $(Sql-String $anime.image_url),
  $(Sql-String $anime.banner_image),
  $(Sql-String $anime.descripcion),
  null,
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
-- AnimeJD import generado desde metadata publica de $Source
-- Revisa el JSON antes de ejecutar. No incluye embeds/videos.

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
values
$($rows -join ",`n")
on conflict (titulo) do update set
  image_url = excluded.image_url,
  banner_image = coalesce(nullif(excluded.banner_image, ''), public.animes.banner_image),
  descripcion = coalesce(nullif(excluded.descripcion, ''), public.animes.descripcion),
  year = coalesce(excluded.year, public.animes.year),
  estado = excluded.estado,
  generos = case
    when cardinality(excluded.generos) > 0 then excluded.generos
    else public.animes.generos
  end,
  slug = excluded.slug,
  publish_status = excluded.publish_status,
  sections = array(
    select distinct unnest(coalesce(public.animes.sections, '{}'::text[]) || excluded.sections)
  ),
  sort_order = public.animes.sort_order,
  updated_at = now();
"@
}

New-Item -ItemType Directory -Force -Path (Split-Path $Out), (Split-Path $Sql) | Out-Null

$firstHtml = Fetch-Text "$Source/browse?page=$StartPage"
$FinalPage = if ($EndPage -gt 0) { $EndPage } else { Get-LastPage $firstHtml }
$all = New-Object System.Collections.Generic.List[object]
$seen = @{}

for ($page = $StartPage; $page -le $FinalPage; $page++) {
  try {
    $html = if ($page -eq $StartPage) { $firstHtml } else { Fetch-Text "$Source/browse?page=$page" }
  } catch {
    Write-Warning "Pagina $page omitida por error: $($_.Exception.Message)"
    continue
  }

  $items = @(Parse-BrowsePage $html)

  foreach ($item in $items) {
    $key = if ($item.slug) { $item.slug } else { $item.titulo }
    if ($seen.ContainsKey($key)) { continue }
    $seen[$key] = $true
    $all.Add($item)
  }

  Write-Host "Pagina $page/$FinalPage`: $($items.Count) encontrados, $($all.Count) acumulados"
  if ($page -lt $FinalPage) { Start-Sleep -Milliseconds $DelayMs }
}

$all | ConvertTo-Json -Depth 8 | Set-Content -Encoding UTF8 $Out
Build-Sql $all | Set-Content -Encoding UTF8 $Sql

Write-Host "Listo: $($all.Count) animes"
Write-Host "JSON: $Out"
Write-Host "SQL: $Sql"
Write-Host "Modo seguro: no se escribio en Supabase. Ejecuta el SQL revisado desde Supabase."
