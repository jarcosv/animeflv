const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vanmxvfhagqfbwynpwzt.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'sb_publishable_c4fIwf42U_W18zJH2RkS1w_1UB2PeZO';
const SITE_URL = 'https://animeflv.lat';
const EPISODE_SHARD_SIZE = 50;
let animeCatalogCache = null;

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function slugify(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90);
}

function canonicalSlug(title, storedSlug) {
  const titleSlug = slugify(title);
  const candidate = slugify(storedSlug);
  return candidate.length >= Math.min(3, titleSlug.length) ? candidate : titleSlug;
}

function firstQuery(value) {
  return Array.isArray(value) ? value[0] : value;
}

function validLastModified(...values) {
  const timestamp = values
    .filter(Boolean)
    .map(value => ({ value, time: Date.parse(value) }))
    .filter(item => Number.isFinite(item.time) && item.time <= Date.now())
    .sort((a, b) => b.time - a.time)[0];
  return timestamp ? new Date(timestamp.time).toISOString() : '';
}

async function fetchAllRows(table, sourceParams, pageSize = 1000) {
  const rows = [];
  for (let offset = 0; ; offset += pageSize) {
    const params = new URLSearchParams(sourceParams);
    params.set('limit', String(pageSize));
    params.set('offset', String(offset));
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params.toString()}`, {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`
      }
    });
    if (!response.ok) throw new Error(`Supabase ${table} ${response.status}`);
    const batch = await response.json();
    rows.push(...batch);
    if (batch.length < pageSize) break;
  }
  return rows;
}

function buildInFilter(values) {
  return `(${values.map(value => `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`).join(',')})`;
}

async function getPublishedAnimeCatalog() {
  if (animeCatalogCache && animeCatalogCache.expiresAt > Date.now()) {
    return animeCatalogCache.items;
  }

  const rows = await fetchAllRows('animes', new URLSearchParams({
    select: 'id,titulo,slug,sections,updated_at,created_at',
    publish_status: 'eq.published',
    order: 'titulo.asc,id.asc'
  }));
  const bySlug = new Map();
  rows.forEach(anime => {
    const slug = canonicalSlug(anime.titulo, anime.slug);
    if (!slug) return;
    const current = bySlug.get(slug);
    bySlug.set(slug, {
      ...current,
      ...anime,
      canonicalSlug: slug,
      sections: Array.from(new Set([...(current?.sections || []), ...(anime.sections || [])])),
      updated_at: validLastModified(anime.updated_at, anime.created_at, current?.updated_at, current?.created_at)
    });
  });
  const items = Array.from(bySlug.values()).sort((a, b) => a.titulo.localeCompare(b.titulo, 'es', { numeric: true }));
  animeCatalogCache = { items, expiresAt: Date.now() + 300000 };
  return items;
}

function urlEntry(location, lastModified = '') {
  return `  <url>\n    <loc>${escapeXml(location)}</loc>${lastModified ? `\n    <lastmod>${escapeXml(lastModified)}</lastmod>` : ''}\n  </url>`;
}

function urlSet(entries) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join('\n')}\n</urlset>`;
}

async function sitemapIndex() {
  const animes = await getPublishedAnimeCatalog();
  const episodeShards = Math.max(1, Math.ceil(animes.length / EPISODE_SHARD_SIZE));
  const maps = [
    'sitemap-pages.xml',
    'sitemap-anime.xml',
    ...Array.from({ length: episodeShards }, (_, index) => `sitemap-episodes-${index + 1}.xml`)
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${maps.map(name => `  <sitemap><loc>${SITE_URL}/${name}</loc></sitemap>`).join('\n')}\n</sitemapindex>`;
}

function dedupeByUrl(entries) {
  const byUrl = new Map();
  entries.forEach(entry => {
    const current = byUrl.get(entry.url);
    if (!current || Date.parse(entry.lastModified || 0) > Date.parse(current.lastModified || 0)) {
      byUrl.set(entry.url, entry);
    }
  });
  return Array.from(byUrl.values());
}

async function buildPagesSitemap() {
  const animes = await getPublishedAnimeCatalog();
  const directoryCount = animes.filter(anime => Array.isArray(anime.sections) && anime.sections.includes('directorio')).length || animes.length;
  const totalPages = Math.max(1, Math.ceil(directoryCount / 30));
  const entries = [
    urlEntry(`${SITE_URL}/`),
    urlEntry(`${SITE_URL}/?section=latino`),
    urlEntry(`${SITE_URL}/?section=directorio`)
  ];
  for (let page = 2; page <= totalPages; page += 1) {
    entries.push(urlEntry(`${SITE_URL}/?section=directorio&page=${page}`));
  }
  return urlSet(entries);
}

async function buildAnimeSitemap() {
  const animes = await getPublishedAnimeCatalog();
  const entries = dedupeByUrl(animes.map(anime => {
    const slug = anime.canonicalSlug;
    return {
      url: `${SITE_URL}/anime/${encodeURIComponent(slug)}`,
      lastModified: validLastModified(anime.updated_at, anime.created_at)
    };
  }).filter(entry => !entry.url.endsWith('/anime/')));
  return urlSet(entries.map(entry => urlEntry(entry.url, entry.lastModified)));
}

async function buildEpisodesSitemap(requestedPage) {
  const page = Math.max(1, Math.floor(Number(requestedPage) || 1));
  const catalog = await getPublishedAnimeCatalog();
  const animes = catalog.slice((page - 1) * EPISODE_SHARD_SIZE, page * EPISODE_SHARD_SIZE);
  const titleGroups = [];
  for (let index = 0; index < animes.length; index += 15) {
    titleGroups.push(animes.slice(index, index + 15).map(anime => anime.titulo));
  }
  const chapterBatches = await Promise.all(titleGroups.map(titles => fetchAllRows(
    'anime_chapters',
    new URLSearchParams({
      select: 'id,anime_title,chapter_number,updated_at,created_at',
      anime_title: `in.${buildInFilter(titles)}`,
      publish_status: 'eq.published',
      order: 'anime_title.asc,chapter_number.asc,id.asc'
    })
  )));
  const chapters = chapterBatches.flat();
  const animeByTitle = new Map(animes.map(anime => [anime.titulo, anime]));
  const entries = dedupeByUrl(chapters.map(chapter => {
    const anime = animeByTitle.get(chapter.anime_title);
    if (!anime || chapter.chapter_number === null || chapter.chapter_number === '') return null;
    const slug = anime.canonicalSlug;
    return {
      url: `${SITE_URL}/ver/${encodeURIComponent(slug)}-episodio-${encodeURIComponent(chapter.chapter_number)}`,
      lastModified: validLastModified(chapter.updated_at, chapter.created_at)
    };
  }).filter(Boolean));
  return urlSet(entries.map(entry => urlEntry(entry.url, entry.lastModified)));
}

module.exports = async function handler(req, res) {
  try {
    const type = String(firstQuery(req.query?.type) || 'index');
    let xml;
    if (type === 'pages') xml = await buildPagesSitemap();
    else if (type === 'anime') xml = await buildAnimeSitemap();
    else if (type === 'episodes') xml = await buildEpisodesSitemap(firstQuery(req.query?.page));
    else xml = await sitemapIndex();

    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    res.status(200).send(xml);
  } catch (error) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Retry-After', '300');
    res.status(503).send('Sitemap temporalmente no disponible.');
  }
};
