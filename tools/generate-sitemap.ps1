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
  if ([string]::IsNullOrWhiteSpace($Value)) { return "" }
  $normalized = $Value.Normalize([Text.NormalizationForm]::FormD)
  $withoutMarks = [regex]::Replace($normalized, "\p{Mn}", "")
  $slug = $withoutMarks.ToLowerInvariant() -replace "[^a-z0-9]+", "-"
  return ($slug -replace "^-+|-+$", "").Substring(0, [Math]::Min(90, ($slug -replace "^-+|-+$", "").Length))
}

function Get-CanonicalSlug {
  param([string]$Title, [string]$StoredSlug)
  $titleSlug = Slugify $Title
  $candidate = Slugify $StoredSlug
  $minimumUsefulLength = [Math]::Min(3, $titleSlug.Length)
  if ($candidate.Length -ge $minimumUsefulLength) { return $candidate }
  return $titleSlug
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
$animes = Get-AllRows "animes" "select=id,titulo,slug,publish_status,updated_at,created_at&publish_status=eq.published&order=created_at.desc,id.asc"
$chapters = Get-AllRows "anime_chapters" "select=id,anime_title,chapter_number,publish_status,updated_at,created_at&publish_status=eq.published&order=created_at.desc,id.asc"
$animeByTitle = @{}
foreach ($anime in $animes) {
  $animeByTitle[$anime.titulo] = $anime
}

$entries = @{}

function Add-SitemapEntry {
  param([string]$Location, [string]$LastModified)
  if (-not $Location) { return }
  if (-not $entries.ContainsKey($Location) -or $LastModified -gt $entries[$Location]) {
    $entries[$Location] = $LastModified
  }
}

Add-SitemapEntry "$SiteUrl/" $today

foreach ($anime in $animes) {
  $slug = Get-CanonicalSlug $anime.titulo $anime.slug
  $lastmod = if ($anime.updated_at) { ([DateTime]$anime.updated_at).ToString("yyyy-MM-dd") } elseif ($anime.created_at) { ([DateTime]$anime.created_at).ToString("yyyy-MM-dd") } else { $today }
  Add-SitemapEntry "$SiteUrl/anime/$slug" $lastmod
}

foreach ($chapter in $chapters) {
  if (-not $animeByTitle.ContainsKey($chapter.anime_title)) { continue }
  $anime = $animeByTitle[$chapter.anime_title]
  $slug = Get-CanonicalSlug $anime.titulo $anime.slug
  $lastmod = if ($chapter.updated_at) { ([DateTime]$chapter.updated_at).ToString("yyyy-MM-dd") } elseif ($chapter.created_at) { ([DateTime]$chapter.created_at).ToString("yyyy-MM-dd") } else { $today }
  Add-SitemapEntry "$SiteUrl/ver/$slug-episodio-$($chapter.chapter_number)" $lastmod
}

$urls = $entries.GetEnumerator() | Sort-Object Name | ForEach-Object {
@"
  <url>
    <loc>$(Escape-Xml $_.Name)</loc>
    <lastmod>$($_.Value)</lastmod>
  </url>
"@
}

$xml = @"
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
$($urls -join "`n")
</urlset>
"@

$xml | Set-Content -Encoding UTF8 $Out
Write-Host "Sitemap generado sin duplicados: $Out ($($urls.Count) URLs)"
