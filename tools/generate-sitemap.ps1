param(
  [string]$Out = "sitemap.xml",
  [string]$SiteUrl = "https://animeflv.lat"
)

$ErrorActionPreference = "Stop"
$SupabaseUrl = "https://vanmxvfhagqfbwynpwzt.supabase.co"
$SupabaseKey = "sb_publishable_c4fIwf42U_W18zJH2RkS1w_1UB2PeZO"
$Headers = @{
  apikey = $SupabaseKey
  Authorization = "Bearer $SupabaseKey"
}

function Escape-Xml {
  param([string]$Value)
  return [System.Security.SecurityElement]::Escape($Value)
}

function Slugify {
  param([string]$Value)
  $normalized = $Value.Normalize([Text.NormalizationForm]::FormD)
  $withoutMarks = [regex]::Replace($normalized, "\p{Mn}", "")
  $slug = $withoutMarks.ToLowerInvariant() -replace "[^a-z0-9]+", "-"
  return ($slug -replace "^-+|-+$", "").Substring(0, [Math]::Min(90, ($slug -replace "^-+|-+$", "").Length))
}

function Get-AllRows {
  param([string]$Path, [string]$Query)
  $rows = @()
  for ($offset = 0; ; $offset += 1000) {
    $url = "$SupabaseUrl/rest/v1/$Path`?$Query&limit=1000&offset=$offset"
    $batch = Invoke-RestMethod -Uri $url -Headers $Headers
    if (-not $batch -or $batch.Count -eq 0) { break }
    $rows += $batch
    if ($batch.Count -lt 1000) { break }
  }
  return $rows
}

$today = (Get-Date).ToString("yyyy-MM-dd")
$animes = Get-AllRows "animes" "select=titulo,slug,publish_status,updated_at,created_at&publish_status=eq.published&order=created_at.desc"
$chapters = Get-AllRows "anime_chapters" "select=anime_title,chapter_number,publish_status,updated_at,created_at&publish_status=eq.published&order=created_at.desc"
$animeByTitle = @{}
foreach ($anime in $animes) {
  $animeByTitle[$anime.titulo] = $anime
}

$urls = New-Object System.Collections.Generic.List[string]
$urls.Add(@"
  <url>
    <loc>$(Escape-Xml $SiteUrl)/</loc>
    <lastmod>$today</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
"@)

foreach ($anime in $animes) {
  $slug = if ($anime.slug) { $anime.slug } else { Slugify $anime.titulo }
  $lastmod = if ($anime.updated_at) { ([DateTime]$anime.updated_at).ToString("yyyy-MM-dd") } elseif ($anime.created_at) { ([DateTime]$anime.created_at).ToString("yyyy-MM-dd") } else { $today }
  $urls.Add(@"
  <url>
    <loc>$(Escape-Xml "$SiteUrl/anime/$slug")</loc>
    <lastmod>$lastmod</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
"@)
}

foreach ($chapter in $chapters) {
  if (-not $animeByTitle.ContainsKey($chapter.anime_title)) { continue }
  $anime = $animeByTitle[$chapter.anime_title]
  $slug = if ($anime.slug) { $anime.slug } else { Slugify $anime.titulo }
  $lastmod = if ($chapter.updated_at) { ([DateTime]$chapter.updated_at).ToString("yyyy-MM-dd") } elseif ($chapter.created_at) { ([DateTime]$chapter.created_at).ToString("yyyy-MM-dd") } else { $today }
  $urls.Add(@"
  <url>
    <loc>$(Escape-Xml "$SiteUrl/ver/$slug-episodio-$($chapter.chapter_number)")</loc>
    <lastmod>$lastmod</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>
"@)
}

$xml = @"
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
$($urls -join "`n")
</urlset>
"@

$xml | Set-Content -Encoding UTF8 $Out
Write-Host "Sitemap generado: $Out ($($urls.Count) URLs)"
