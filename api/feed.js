const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vanmxvfhagqfbwynpwzt.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'sb_publishable_c4fIwf42U_W18zJH2RkS1w_1UB2PeZO';
const SITE_URL = 'https://animeflv.lat';

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

async function supabaseRows(table, params) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params.toString()}`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`
    }
  });
  if (!response.ok) throw new Error(`Supabase ${table} ${response.status}`);
  return response.json();
}

function buildInFilter(values) {
  return `(${values.map(value => `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`).join(',')})`;
}

async function getRecentEpisodes() {
  const chapterParams = new URLSearchParams({
    select: 'id,anime_title,chapter_number,cover_image,updated_at,created_at',
    publish_status: 'eq.published',
    order: 'updated_at.desc.nullslast,created_at.desc,id.desc',
    limit: '250'
  });
  const chapterRows = await supabaseRows('anime_chapters', chapterParams);
  const unique = new Map();
  chapterRows.forEach(chapter => {
    const key = `${chapter.anime_title}\u0000${chapter.chapter_number}`;
    if (!unique.has(key)) unique.set(key, chapter);
  });
  const chapters = Array.from(unique.values()).slice(0, 50);
  const titles = Array.from(new Set(chapters.map(chapter => chapter.anime_title).filter(Boolean)));
  const animeRows = [];
  for (let index = 0; index < titles.length; index += 20) {
    const params = new URLSearchParams({
      select: 'titulo,slug,image_url,descripcion,publish_status',
      titulo: `in.${buildInFilter(titles.slice(index, index + 20))}`,
      publish_status: 'eq.published'
    });
    animeRows.push(...await supabaseRows('animes', params));
  }
  const animeByTitle = new Map(animeRows.map(anime => [anime.titulo, anime]));
  return chapters.map(chapter => ({ chapter, anime: animeByTitle.get(chapter.anime_title) })).filter(item => item.anime);
}

module.exports = async function handler(req, res) {
  try {
    const episodes = await getRecentEpisodes();
    const lastBuildDate = episodes[0]?.chapter.updated_at || episodes[0]?.chapter.created_at || new Date().toISOString();
    const items = episodes.map(({ anime, chapter }) => {
      const slug = canonicalSlug(anime.titulo, anime.slug);
      const url = `${SITE_URL}/ver/${encodeURIComponent(slug)}-episodio-${encodeURIComponent(chapter.chapter_number)}`;
      const image = chapter.cover_image || anime.image_url || '';
      const published = chapter.updated_at || chapter.created_at || lastBuildDate;
      return `    <item>
      <title>${escapeXml(`${anime.titulo} - Episodio ${chapter.chapter_number}`)}</title>
      <link>${escapeXml(url)}</link>
      <guid isPermaLink="true">${escapeXml(url)}</guid>
      <pubDate>${escapeXml(new Date(published).toUTCString())}</pubDate>
      <description>${escapeXml(`Mira ${anime.titulo} episodio ${chapter.chapter_number} online en HD y español latino en AnimeFLV.`)}</description>${image ? `
      <media:thumbnail url="${escapeXml(image)}" />` : ''}
    </item>`;
    }).join('\n');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/">
  <channel>
    <title>Últimos episodios de AnimeFLV</title>
    <link>${SITE_URL}/</link>
    <description>Estrenos y episodios recientes de anime online en español latino.</description>
    <language>es-419</language>
    <lastBuildDate>${escapeXml(new Date(lastBuildDate).toUTCString())}</lastBuildDate>
    <atom:link href="${SITE_URL}/feed.xml" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>`;

    res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8');
    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=86400');
    res.status(200).send(xml);
  } catch (error) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Retry-After', '300');
    res.status(503).send('Feed temporalmente no disponible.');
  }
};
