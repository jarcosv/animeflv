const fs = require('fs/promises');
const path = require('path');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vanmxvfhagqfbwynpwzt.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'sb_publishable_c4fIwf42U_W18zJH2RkS1w_1UB2PeZO';
const SITE_URL = 'https://animeflv.lat';
const SITE_NAME = 'AnimeFLV';
const DEFAULT_TITLE = 'Ver Anime Online HD en Español Latino - AnimeFLV';
const DEFAULT_DESCRIPTION = 'AnimeFLV te permite ver anime online en HD y español latino. Disfruta últimos episodios, animes en emisión, estrenos, series populares y directorio anime actualizado.';
const DEFAULT_IMAGE = `${SITE_URL}/image.png`;

let indexHtmlCache = null;

function escapeHTML(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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

function toAbsoluteUrl(value) {
  try {
    return new URL(value || DEFAULT_IMAGE, SITE_URL).href;
  } catch {
    return DEFAULT_IMAGE;
  }
}

function cleanDescription(value) {
  const text = String(value || DEFAULT_DESCRIPTION).replace(/\s+/g, ' ').trim();
  return text.length > 155 ? `${text.slice(0, 152)}...` : text;
}

function safeJsonScript(data) {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

async function readIndexHtml() {
  if (!indexHtmlCache) {
    indexHtmlCache = await fs.readFile(path.join(process.cwd(), 'index.html'), 'utf8');
  }
  return indexHtmlCache;
}

async function supabaseRows(table, params) {
  const url = `${SUPABASE_URL}/rest/v1/${table}?${params.toString()}`;
  const response = await fetch(url, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`Supabase ${table} ${response.status}: ${await response.text()}`);
  }

  return response.json();
}

async function findAnimeBySlug(slug) {
  const fields = 'titulo,image_url,banner_image,descripcion,year,estado,generos,slug,publish_status,sections,created_at,updated_at';
  const directParams = new URLSearchParams({
    select: fields,
    slug: `eq.${slug}`,
    limit: '1'
  });
  let rows = await supabaseRows('animes', directParams);

  if (!rows.length) {
    const fallbackParams = new URLSearchParams({
      select: fields,
      publish_status: 'eq.published',
      limit: '1000'
    });
    rows = (await supabaseRows('animes', fallbackParams)).filter(anime =>
      (anime.slug || slugify(anime.titulo)) === slug
    );
  }

  const anime = rows[0];
  if (!anime || (anime.publish_status && anime.publish_status !== 'published')) return null;

  return {
    title: anime.titulo || 'Anime',
    slug: anime.slug || slugify(anime.titulo),
    image: anime.image_url || anime.banner_image || DEFAULT_IMAGE,
    description: anime.descripcion || '',
    year: anime.year,
    status: anime.estado || '',
    genres: anime.generos || []
  };
}

async function findChapter(animeTitle, chapterNumber) {
  if (!animeTitle || !chapterNumber) return null;

  const params = new URLSearchParams({
    select: 'anime_title,chapter_number,cover_image,server_name,publish_status,created_at,updated_at',
    anime_title: `eq.${animeTitle}`,
    chapter_number: `eq.${chapterNumber}`,
    limit: '1'
  });

  const rows = await supabaseRows('anime_chapters', params);
  const chapter = rows.find(item => !item.publish_status || item.publish_status === 'published');
  return chapter || rows[0] || null;
}

function replaceTag(html, pattern, replacement) {
  return pattern.test(html) ? html.replace(pattern, replacement) : html.replace('</head>', `${replacement}\n</head>`);
}

function applyMeta(html, meta) {
  const title = escapeHTML(meta.title);
  const description = escapeHTML(cleanDescription(meta.description));
  const url = escapeHTML(meta.url);
  const image = escapeHTML(toAbsoluteUrl(meta.image));
  const type = escapeHTML(meta.type || 'website');
  const jsonLd = safeJsonScript(meta.jsonLd || {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: meta.title,
    description: cleanDescription(meta.description),
    image,
    url,
    inLanguage: 'es'
  });

  let output = html;
  output = output.replace(/<title>[\s\S]*?<\/title>/i, `<title>${title}</title>`);
  output = replaceTag(output, /<meta name="description" content="[^"]*"\s*\/?>/i, `<meta name="description" content="${description}">`);
  output = replaceTag(output, /<link rel="canonical" href="[^"]*"\s*\/?>/i, `<link rel="canonical" href="${url}">`);
  output = replaceTag(output, /<meta property="og:type" content="[^"]*"\s*\/?>/i, `<meta property="og:type" content="${type}">`);
  output = replaceTag(output, /<meta property="og:site_name" content="[^"]*"\s*\/?>/i, `<meta property="og:site_name" content="${SITE_NAME}">`);
  output = replaceTag(output, /<meta property="og:title" content="[^"]*"\s*\/?>/i, `<meta property="og:title" content="${title}">`);
  output = replaceTag(output, /<meta property="og:description" content="[^"]*"\s*\/?>/i, `<meta property="og:description" content="${description}">`);
  output = replaceTag(output, /<meta property="og:url" content="[^"]*"\s*\/?>/i, `<meta property="og:url" content="${url}">`);
  output = replaceTag(output, /<meta property="og:image" content="[^"]*"\s*\/?>/i, `<meta property="og:image" content="${image}">`);
  output = replaceTag(output, /<meta name="twitter:card" content="[^"]*"\s*\/?>/i, '<meta name="twitter:card" content="summary_large_image">');
  output = replaceTag(output, /<meta name="twitter:title" content="[^"]*"\s*\/?>/i, `<meta name="twitter:title" content="${title}">`);
  output = replaceTag(output, /<meta name="twitter:description" content="[^"]*"\s*\/?>/i, `<meta name="twitter:description" content="${description}">`);
  output = replaceTag(output, /<meta name="twitter:image" content="[^"]*"\s*\/?>/i, `<meta name="twitter:image" content="${image}">`);
  output = replaceTag(output, /<meta property="og:image:width" content="[^"]*"\s*\/?>/i, '<meta property="og:image:width" content="1200">');
  output = replaceTag(output, /<meta property="og:image:height" content="[^"]*"\s*\/?>/i, '<meta property="og:image:height" content="630">');
  output = replaceTag(output, /<meta property="og:image:alt" content="[^"]*"\s*\/?>/i, `<meta property="og:image:alt" content="${title}">`);
  output = output.replace(/<script type="application\/ld\+json" id="site-schema">[\s\S]*?<\/script>/i, `<script type="application/ld+json" id="site-schema">${jsonLd}</script>`);

  return output;
}

async function buildMeta(query) {
  const type = String(query.type || '');

  if (type === 'anime' && query.slug) {
    const anime = await findAnimeBySlug(String(query.slug));
    if (anime) {
      const url = `${SITE_URL}/anime/${encodeURIComponent(anime.slug)}`;
      const description = `${anime.title}: ver anime online en HD y español latino en ${SITE_NAME}. ${anime.description || 'Episodios recientes, estrenos, animes en emision y series completas.'}`;
      return {
        title: `${anime.title} - Ver Anime Online HD en Latino | ${SITE_NAME}`,
        description,
        url,
        image: anime.image,
        type: 'video.tv_show',
        jsonLd: {
          '@context': 'https://schema.org',
          '@type': 'TVSeries',
          name: anime.title,
          description: cleanDescription(description),
          image: toAbsoluteUrl(anime.image),
          url,
          inLanguage: 'es',
          genre: anime.genres
        }
      };
    }
  }

  if (type === 'watch' && query.episode) {
    const match = String(query.episode).match(/^(.+)-episodio-([^/]+)$/);
    const slug = match ? match[1] : '';
    const chapterNumber = match ? match[2] : '';
    const anime = slug ? await findAnimeBySlug(slug) : null;

    if (anime) {
      const chapter = await findChapter(anime.title, chapterNumber);
      const image = anime.image;
      const url = `${SITE_URL}/ver/${encodeURIComponent(slug)}-episodio-${encodeURIComponent(chapterNumber)}`;
      const description = `Mira ${anime.title} episodio ${chapterNumber} online en HD y español latino en ${SITE_NAME}.`;
      return {
        title: `${anime.title} Episodio ${chapterNumber} - Ver Online HD | ${SITE_NAME}`,
        description,
        url,
        image,
        type: 'video.episode',
        jsonLd: {
          '@context': 'https://schema.org',
          '@type': 'TVEpisode',
          name: `${anime.title} Episodio ${chapterNumber}`,
          partOfSeries: {
            '@type': 'TVSeries',
            name: anime.title
          },
          episodeNumber: chapterNumber,
          description,
          image: toAbsoluteUrl(image),
          url,
          inLanguage: 'es'
        }
      };
    }
  }

  return {
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    url: `${SITE_URL}/`,
    image: DEFAULT_IMAGE,
    type: 'website'
  };
}

module.exports = async function handler(req, res) {
  try {
    const html = await readIndexHtml();
    const meta = await buildMeta(req.query || {});
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=86400');
    res.status(200).send(applyMeta(html, meta));
  } catch (error) {
    const html = await readIndexHtml();
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(200).send(applyMeta(html, {
      title: DEFAULT_TITLE,
      description: DEFAULT_DESCRIPTION,
      url: `${SITE_URL}/`,
      image: DEFAULT_IMAGE,
      type: 'website'
    }));
  }
};
