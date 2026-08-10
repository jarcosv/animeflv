const fs = require('fs/promises');
const path = require('path');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vanmxvfhagqfbwynpwzt.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'sb_publishable_c4fIwf42U_W18zJH2RkS1w_1UB2PeZO';
const SITE_URL = 'https://animeflv.lat';
const SITE_NAME = 'AnimeFLV';
const DEFAULT_TITLE = 'Ver Anime Online HD en Español Latino - AnimeFLV';
const DEFAULT_DESCRIPTION = 'AnimeFLV te permite ver anime online en HD y español latino. Disfruta últimos episodios, animes en emisión, estrenos, series populares y directorio anime actualizado.';
const DEFAULT_IMAGE = `${SITE_URL}/og-animeflv.png`;
const LOGO_URL = `${SITE_URL}/image.png`;
const ANIME_FIELDS = 'id,titulo,image_url,banner_image,descripcion,year,estado,generos,slug,publish_status,sections,sort_order,created_at,updated_at';
const CHAPTER_FIELDS = 'id,anime_title,chapter_number,embed_url,cover_image,server_name,publish_status,sections,created_at,updated_at';

let indexHtmlCache = null;

function escapeHTML(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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
  const minimumUsefulLength = Math.min(3, titleSlug.length);
  return candidate.length >= minimumUsefulLength ? candidate : titleSlug;
}

function toAbsoluteUrl(value, fallback = DEFAULT_IMAGE) {
  try {
    return new URL(value || fallback, SITE_URL).href;
  } catch {
    return fallback;
  }
}

function safeHttpUrl(value) {
  try {
    const url = new URL(value || '');
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

function cleanText(value) {
  return String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function cleanDescription(value, limit = 158) {
  const text = cleanText(value || DEFAULT_DESCRIPTION);
  if (text.length <= limit) return text;
  const shortened = text.slice(0, Math.max(0, limit - 3)).replace(/\s+\S*$/, '');
  return `${shortened || text.slice(0, limit - 3)}...`;
}

function safeJsonScript(data) {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

function firstQuery(value) {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeAnime(row) {
  return {
    title: row.titulo || 'Anime',
    slug: canonicalSlug(row.titulo, row.slug),
    image: row.image_url || row.banner_image || DEFAULT_IMAGE,
    description: row.descripcion || '',
    year: row.year,
    status: row.estado || '',
    genres: Array.isArray(row.generos) ? row.generos : [],
    sections: Array.isArray(row.sections) ? row.sections : [],
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function chapterKey(value) {
  return String(value ?? '').trim().toLowerCase();
}

function chapterSort(a, b) {
  const aNumber = Number(a.number);
  const bNumber = Number(b.number);
  if (Number.isFinite(aNumber) && Number.isFinite(bNumber)) return aNumber - bNumber;
  return String(a.number).localeCompare(String(b.number), 'es', { numeric: true });
}

function newestDate(...values) {
  return values.filter(Boolean).sort((a, b) => Date.parse(b) - Date.parse(a))[0];
}

function mergeChapters(rows) {
  const chapters = new Map();

  rows.forEach(row => {
    const key = chapterKey(row.chapter_number);
    if (!key) return;
    const current = chapters.get(key);
    const next = {
      animeTitle: row.anime_title,
      number: row.chapter_number,
      image: row.cover_image || current?.image || '',
      embedUrl: safeHttpUrl(row.embed_url) || current?.embedUrl || '',
      serverName: row.server_name || current?.serverName || '',
      createdAt: current?.createdAt || row.created_at,
      updatedAt: newestDate(row.updated_at, row.created_at, current?.updatedAt, current?.createdAt)
    };
    chapters.set(key, next);
  });

  return Array.from(chapters.values()).sort(chapterSort);
}

async function readIndexHtml() {
  if (!indexHtmlCache) {
    indexHtmlCache = await fs.readFile(path.join(process.cwd(), 'index.html'), 'utf8');
  }
  return indexHtmlCache;
}

async function supabaseFetch(table, params, extraHeaders = {}, allowedStatuses = []) {
  const url = `${SUPABASE_URL}/rest/v1/${table}?${params.toString()}`;
  const response = await fetch(url, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      ...extraHeaders
    }
  });

  if (!response.ok && !allowedStatuses.includes(response.status)) {
    throw new Error(`Supabase ${table} ${response.status}: ${await response.text()}`);
  }

  return response;
}

async function supabaseRows(table, params) {
  const response = await supabaseFetch(table, params);
  return response.json();
}

async function supabaseRowsWithCount(table, params) {
  const response = await supabaseFetch(table, params, { Prefer: 'count=exact' }, [416]);
  const range = response.headers.get('content-range') || '';
  const total = Number(range.split('/')[1]);
  if (response.status === 416) {
    return { rows: [], total: Number.isFinite(total) ? total : 0 };
  }
  const rows = await response.json();
  return { rows, total: Number.isFinite(total) ? total : rows.length };
}

async function supabaseAllRows(table, sourceParams, pageSize = 1000) {
  const rows = [];
  for (let offset = 0; ; offset += pageSize) {
    const params = new URLSearchParams(sourceParams);
    params.set('limit', String(pageSize));
    params.set('offset', String(offset));
    const batch = await supabaseRows(table, params);
    rows.push(...batch);
    if (batch.length < pageSize) break;
  }
  return rows;
}

async function findAnimeBySlug(slug) {
  const directParams = new URLSearchParams({
    select: ANIME_FIELDS,
    slug: `ilike.${slug}`,
    publish_status: 'eq.published',
    limit: '1'
  });
  let rows = await supabaseRows('animes', directParams);

  if (!rows.length) {
    const titlePattern = slug.replace(/[^a-z0-9-]/gi, '').split('-').filter(Boolean).join('*');
    if (titlePattern) {
      const titleParams = new URLSearchParams({
        select: ANIME_FIELDS,
        titulo: `ilike.*${titlePattern}*`,
        publish_status: 'eq.published',
        limit: '25'
      });
      rows = (await supabaseRows('animes', titleParams)).filter(anime => (
        canonicalSlug(anime.titulo, anime.slug) === slug || slugify(anime.titulo) === slug
      )).slice(0, 1);
    }
  }

  if (!rows.length) {
    const fallbackParams = new URLSearchParams({
      select: ANIME_FIELDS,
      publish_status: 'eq.published',
      order: 'created_at.desc,id.asc'
    });
    const published = await supabaseAllRows('animes', fallbackParams);
    rows = published.filter(anime => (
      canonicalSlug(anime.titulo, anime.slug) === slug || slugify(anime.titulo) === slug
    )).slice(0, 1);
  }

  return rows[0] ? normalizeAnime(rows[0]) : null;
}

async function findChapters(animeTitle) {
  if (!animeTitle) return [];
  const params = new URLSearchParams({
    select: CHAPTER_FIELDS,
    anime_title: `eq.${animeTitle}`,
    publish_status: 'eq.published',
    order: 'chapter_number.asc,id.asc'
  });
  return mergeChapters(await supabaseAllRows('anime_chapters', params));
}

async function findCollection(section, page) {
  const isDirectory = section === 'directorio';
  const limit = isDirectory ? 30 : 20;
  const offset = isDirectory ? (page - 1) * limit : 0;
  const params = new URLSearchParams({
    select: ANIME_FIELDS,
    publish_status: 'eq.published',
    order: isDirectory ? 'titulo.asc,id.asc' : 'updated_at.desc.nullslast,created_at.desc,id.asc',
    limit: String(limit),
    offset: String(offset)
  });

  if (section === 'inicio') {
    params.set('or', '(sections.cs.{inicio},sections.cs.{destacados})');
  } else if (section === 'latino') {
    params.set('or', '(sections.cs.{latino},titulo.ilike.*latino*,titulo.ilike.*latam*,titulo.ilike.*castellano*)');
  } else {
    params.set('sections', 'cs.{directorio}');
  }

  let result = await supabaseRowsWithCount('animes', params);
  if (isDirectory && result.total === 0) {
    params.delete('sections');
    result = await supabaseRowsWithCount('animes', params);
  }

  return {
    items: result.rows.map(normalizeAnime),
    total: result.total,
    page,
    pageSize: limit
  };
}

function replaceTag(html, pattern, replacement) {
  return pattern.test(html) ? html.replace(pattern, replacement) : html.replace('</head>', `${replacement}\n</head>`);
}

function replaceOptionalTag(html, pattern, replacement) {
  if (!replacement) return html.replace(pattern, '');
  return replaceTag(html, pattern, replacement);
}

function buildSiteNode() {
  return {
    '@type': 'WebSite',
    '@id': `${SITE_URL}/#website`,
    name: SITE_NAME,
    alternateName: ['Anime FLV', 'AnimeFLV Latino'],
    url: `${SITE_URL}/`,
    inLanguage: 'es-419'
  };
}

function buildOrganizationNode() {
  return {
    '@type': 'Organization',
    '@id': `${SITE_URL}/#organization`,
    name: SITE_NAME,
    url: `${SITE_URL}/`,
    logo: LOGO_URL
  };
}

function buildBreadcrumb(items) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url
    }))
  };
}

function buildDefaultJsonLd(meta) {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      buildSiteNode(),
      buildOrganizationNode(),
      {
        '@type': 'WebPage',
        '@id': `${meta.url}#webpage`,
        name: meta.title,
        description: cleanDescription(meta.description),
        image: toAbsoluteUrl(meta.image),
        url: meta.url,
        inLanguage: 'es-419',
        isPartOf: { '@id': `${SITE_URL}/#website` }
      }
    ]
  };
}

function applyMeta(html, meta) {
  const title = escapeHTML(meta.title);
  const description = escapeHTML(cleanDescription(meta.description));
  const url = escapeHTML(meta.url);
  const image = escapeHTML(toAbsoluteUrl(meta.image));
  const type = escapeHTML(meta.type || 'website');
  const robots = meta.robots || 'index, follow, max-image-preview:large';
  const botRobots = meta.robots?.startsWith('noindex')
    ? 'noindex, follow'
    : 'index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1';
  const keywords = escapeHTML((meta.keywords || ['anime online', 'ver anime online', 'anime latino', SITE_NAME]).filter(Boolean).join(', '));
  const imageAlt = escapeHTML(meta.imageAlt || meta.title);
  const jsonLd = safeJsonScript(meta.jsonLd || buildDefaultJsonLd(meta));

  let output = html.replace(/<html\s+lang="[^"]*"/i, '<html lang="es-419"');
  output = output.replace(/<title>[\s\S]*?<\/title>/i, `<title>${title}</title>`);
  output = replaceTag(output, /<meta name="description" content="[^"]*"\s*\/?>/i, `<meta name="description" content="${description}">`);
  output = replaceTag(output, /<meta name="keywords" content="[^"]*"\s*\/?>/i, `<meta name="keywords" content="${keywords}">`);
  output = replaceTag(output, /<meta name="robots" content="[^"]*"\s*\/?>/i, `<meta name="robots" content="${robots}">`);
  output = replaceTag(output, /<meta name="googlebot" content="[^"]*"\s*\/?>/i, `<meta name="googlebot" content="${botRobots}">`);
  output = replaceTag(output, /<meta name="bingbot" content="[^"]*"\s*\/?>/i, `<meta name="bingbot" content="${botRobots}">`);
  output = replaceTag(output, /<link rel="canonical" href="[^"]*"\s*\/?>/i, `<link rel="canonical" href="${url}">`);
  output = replaceOptionalTag(output, /<link rel="prev" href="[^"]*"\s*\/?>\s*/i, meta.prevUrl ? `<link rel="prev" href="${escapeHTML(meta.prevUrl)}">` : '');
  output = replaceOptionalTag(output, /<link rel="next" href="[^"]*"\s*\/?>\s*/i, meta.nextUrl ? `<link rel="next" href="${escapeHTML(meta.nextUrl)}">` : '');
  output = replaceTag(output, /<meta property="og:type" content="[^"]*"\s*\/?>/i, `<meta property="og:type" content="${type}">`);
  output = replaceTag(output, /<meta property="og:site_name" content="[^"]*"\s*\/?>/i, `<meta property="og:site_name" content="${SITE_NAME}">`);
  output = replaceTag(output, /<meta property="og:title" content="[^"]*"\s*\/?>/i, `<meta property="og:title" content="${title}">`);
  output = replaceTag(output, /<meta property="og:description" content="[^"]*"\s*\/?>/i, `<meta property="og:description" content="${description}">`);
  output = replaceTag(output, /<meta property="og:url" content="[^"]*"\s*\/?>/i, `<meta property="og:url" content="${url}">`);
  output = replaceTag(output, /<meta property="og:image" content="[^"]*"\s*\/?>/i, `<meta property="og:image" content="${image}">`);
  output = replaceTag(output, /<meta property="og:image:secure_url" content="[^"]*"\s*\/?>/i, `<meta property="og:image:secure_url" content="${image}">`);
  output = replaceTag(output, /<meta property="og:image:alt" content="[^"]*"\s*\/?>/i, `<meta property="og:image:alt" content="${imageAlt}">`);
  output = replaceOptionalTag(output, /<meta property="og:image:width" content="[^"]*"\s*\/?>\s*/i, meta.imageWidth ? `<meta property="og:image:width" content="${Number(meta.imageWidth)}">` : '');
  output = replaceOptionalTag(output, /<meta property="og:image:height" content="[^"]*"\s*\/?>\s*/i, meta.imageHeight ? `<meta property="og:image:height" content="${Number(meta.imageHeight)}">` : '');
  output = replaceOptionalTag(output, /<meta property="og:updated_time" content="[^"]*"\s*\/?>\s*/i, meta.modifiedTime ? `<meta property="og:updated_time" content="${escapeHTML(meta.modifiedTime)}">` : '');
  output = replaceTag(output, /<meta name="twitter:card" content="[^"]*"\s*\/?>/i, '<meta name="twitter:card" content="summary_large_image">');
  output = replaceTag(output, /<meta name="twitter:title" content="[^"]*"\s*\/?>/i, `<meta name="twitter:title" content="${title}">`);
  output = replaceTag(output, /<meta name="twitter:description" content="[^"]*"\s*\/?>/i, `<meta name="twitter:description" content="${description}">`);
  output = replaceTag(output, /<meta name="twitter:image" content="[^"]*"\s*\/?>/i, `<meta name="twitter:image" content="${image}">`);
  output = replaceTag(output, /<meta name="twitter:image:alt" content="[^"]*"\s*\/?>/i, `<meta name="twitter:image:alt" content="${imageAlt}">`);
  output = output.replace(/<script type="application\/ld\+json" id="site-schema">[\s\S]*?<\/script>/i, `<script type="application/ld+json" id="site-schema">${jsonLd}</script>`);

  if (meta.hideHero) {
    output = output.replace(/\s*<section class="site-hero"[\s\S]*?<\/section>/i, '');
  }
  if (meta.bodyHtml) {
    output = output.replace(/<main(?:\s[^>]*)?>[\s\S]*?<\/main>/i, meta.bodyHtml);
  }
  return output;
}

function renderAnimeCard(anime) {
  const genres = anime.genres.slice(0, 2).map(genre => `<span class="genre-tag">${escapeHTML(genre)}</span>`).join('');
  return `
    <a class="anime-card" href="/anime/${encodeURIComponent(anime.slug)}">
      <img loading="lazy" width="200" height="280" src="${escapeHTML(toAbsoluteUrl(anime.image))}" alt="Poster de ${escapeHTML(anime.title)}">
      ${anime.status ? `<div class="status-badge">${escapeHTML(anime.status)}</div>` : ''}
      ${anime.title.toLowerCase().includes('latino') ? '<div class="latino-badge">Latino</div>' : ''}
      <div class="anime-info">
        <h3>${escapeHTML(anime.title)}</h3>
        <div class="meta">${anime.year ? `<span class="year">${escapeHTML(anime.year)}</span>` : ''}</div>
        ${genres ? `<div class="genres">${genres}</div>` : ''}
      </div>
    </a>`;
}

function renderCollectionBody(title, collection) {
  const sidebar = collection.items.slice(0, 18).map(anime => `
    <li class="home-sidebar-item">
      <a href="/anime/${encodeURIComponent(anime.slug)}" class="home-sidebar-link">
        <span>${escapeHTML(anime.title)}</span><strong>ANIME</strong>
      </a>
    </li>`).join('');
  const cards = collection.items.map(renderAnimeCard).join('');
  const totalPages = Math.max(1, Math.ceil(collection.total / collection.pageSize));
  const pagination = collection.pageSize === 30 ? `
    <nav id="directory-pagination" class="pagination" aria-label="Paginación del directorio">
      ${collection.page > 1 ? `<a class="pagination-btn" href="/?section=directorio${collection.page > 2 ? `&amp;page=${collection.page - 1}` : ''}" rel="prev">Anterior</a>` : ''}
      <span class="pagination-btn active">${collection.page} de ${totalPages}</span>
      ${collection.page < totalPages ? `<a class="pagination-btn" href="/?section=directorio&amp;page=${collection.page + 1}" rel="next">Siguiente</a>` : ''}
    </nav>` : '<div id="directory-pagination" class="pagination"></div>';

  return `<main id="content">
    <div class="animeflv-layout">
      <aside class="home-sidebar" aria-label="Animes disponibles">
        <div class="home-sidebar-title">ANIMES EN EMISIÓN</div>
        <ul id="home-sidebar-list" class="home-sidebar-list">${sidebar}</ul>
      </aside>
      <div class="home-main">
        <section class="home-section">
          <div class="home-section-header"><h2 id="main-title">${escapeHTML(title)}</h2></div>
          <div id="anime-list" class="anime-list">${cards || '<p>No hay animes disponibles en esta sección.</p>'}</div>
        </section>
      </div>
    </div>
    ${pagination}
  </main>`;
}

function renderAnimeBody(anime, chapters) {
  const genres = anime.genres.length
    ? anime.genres.map(genre => `<span class="genre-tag">${escapeHTML(genre)}</span>`).join('')
    : '<span class="genre-tag">Anime</span>';
  const episodeLinks = chapters.slice().reverse().slice(0, 200).map(chapter => `
    <a href="/ver/${encodeURIComponent(anime.slug)}-episodio-${encodeURIComponent(chapter.number)}" class="profile-episode-row">
      <img loading="lazy" width="96" height="54" src="${escapeHTML(toAbsoluteUrl(chapter.image || anime.image))}" alt="${escapeHTML(anime.title)} episodio ${escapeHTML(chapter.number)}">
      <span><strong>Episodio ${escapeHTML(chapter.number)}</strong><small>Ver online</small></span><em>Ver</em>
    </a>`).join('');

  return `<main id="content">
    <article class="anime-profile">
      <section class="anime-profile-hero">
        <div class="anime-profile-poster">
          <img width="300" height="420" src="${escapeHTML(toAbsoluteUrl(anime.image))}" alt="Poster de ${escapeHTML(anime.title)}">
          ${anime.status ? `<span class="anime-profile-status">${escapeHTML(anime.status)}</span>` : ''}
        </div>
        <div class="anime-profile-copy">
          <h1>${escapeHTML(anime.title)}</h1>
          <div class="anime-profile-tags">${genres}</div>
          <div class="anime-profile-meta">
            ${anime.year ? `<span>Año: <strong>${escapeHTML(anime.year)}</strong></span>` : ''}
            <span>Capítulos: <strong>${chapters.length}</strong></span>
          </div>
          <p>${escapeHTML(cleanText(anime.description) || 'Consulta la ficha y los episodios disponibles de este anime.')}</p>
          ${chapters.length ? `<a class="profile-watch-btn" href="/ver/${encodeURIComponent(anime.slug)}-episodio-${encodeURIComponent(chapters.at(-1).number)}">Ver último episodio</a>` : ''}
        </div>
      </section>
      <section class="anime-profile-episodes">
        <div class="profile-section-head"><h2>Lista de episodios</h2><span>${chapters.length} episodios</span></div>
        <div class="profile-episode-list">${episodeLinks || '<p>No hay episodios publicados.</p>'}</div>
      </section>
    </article>
  </main>`;
}

function renderWatchBody(anime, chapter, chapters) {
  const currentIndex = chapters.findIndex(item => chapterKey(item.number) === chapterKey(chapter.number));
  const previous = currentIndex > 0 ? chapters[currentIndex - 1] : null;
  const next = currentIndex >= 0 && currentIndex < chapters.length - 1 ? chapters[currentIndex + 1] : null;
  const nearby = chapters.slice(Math.max(0, currentIndex - 10), Math.min(chapters.length, currentIndex + 11));

  return `<main id="content">
    <article class="anime-profile">
      <header class="watch-head"><span>Estás viendo</span><h1>${escapeHTML(anime.title)} - Episodio ${escapeHTML(chapter.number)}</h1></header>
      <section class="anime-profile-hero">
        <div class="anime-profile-poster"><img width="300" height="420" src="${escapeHTML(toAbsoluteUrl(chapter.image || anime.image))}" alt="${escapeHTML(anime.title)} episodio ${escapeHTML(chapter.number)}"></div>
        <div class="anime-profile-copy">
          <h2>Episodio ${escapeHTML(chapter.number)}</h2>
          <p>Mira ${escapeHTML(anime.title)} episodio ${escapeHTML(chapter.number)} online en HD y español latino. El reproductor se carga al abrir la página.</p>
          <div class="anime-profile-meta"><a href="/anime/${encodeURIComponent(anime.slug)}">Ver ficha y todos los episodios</a></div>
          <nav class="pagination" aria-label="Navegación entre episodios">
            ${previous ? `<a class="pagination-btn" rel="prev" href="/ver/${encodeURIComponent(anime.slug)}-episodio-${encodeURIComponent(previous.number)}">Anterior</a>` : ''}
            ${next ? `<a class="pagination-btn" rel="next" href="/ver/${encodeURIComponent(anime.slug)}-episodio-${encodeURIComponent(next.number)}">Siguiente</a>` : ''}
          </nav>
        </div>
      </section>
      <section class="anime-profile-episodes">
        <div class="profile-section-head"><h2>Episodios cercanos</h2><span>${chapters.length} disponibles</span></div>
        <div class="profile-episode-list">${nearby.map(item => `
          <a href="/ver/${encodeURIComponent(anime.slug)}-episodio-${encodeURIComponent(item.number)}" class="profile-episode-row">
            <span><strong>Episodio ${escapeHTML(item.number)}</strong><small>${chapterKey(item.number) === chapterKey(chapter.number) ? 'Reproduciendo' : 'Ver online'}</small></span><em>Ver</em>
          </a>`).join('')}</div>
      </section>
    </article>
  </main>`;
}

function buildNotFoundPage(kind = 'contenido') {
  const title = 'Página no encontrada | AnimeFLV';
  const description = 'La página solicitada no existe o ya no está disponible en AnimeFLV.';
  return {
    status: 404,
    title,
    description,
    url: `${SITE_URL}/`,
    image: DEFAULT_IMAGE,
    imageAlt: 'AnimeFLV',
    imageWidth: 1200,
    imageHeight: 630,
    type: 'website',
    robots: 'noindex, follow',
    hideHero: true,
    bodyHtml: `<main id="content"><article class="anime-profile"><div class="anime-profile-copy"><h1>Página no encontrada</h1><p>El ${escapeHTML(kind)} solicitado no existe o ya no está disponible.</p><a class="profile-watch-btn" href="/">Volver a AnimeFLV</a></div></article></main>`
  };
}

async function buildCollectionPage(query) {
  const requestedSection = String(firstQuery(query.section) || 'inicio').toLowerCase();
  const section = ['inicio', 'latino', 'directorio'].includes(requestedSection) ? requestedSection : 'inicio';
  const requestedPage = Math.floor(Number(firstQuery(query.page)) || 1);
  const page = section === 'directorio' ? Math.min(500, Math.max(1, requestedPage)) : 1;
  const collection = await findCollection(section, page);
  const labels = { inicio: 'Últimos episodios', latino: 'Anime Latino', directorio: 'Directorio Anime' };
  const label = labels[section];
  const totalPages = Math.max(1, Math.ceil(collection.total / collection.pageSize));
  if (section === 'directorio' && page > totalPages) {
    return buildNotFoundPage('página del directorio');
  }
  const url = section === 'inicio'
    ? `${SITE_URL}/`
    : `${SITE_URL}/?section=${section}${section === 'directorio' && page > 1 ? `&page=${page}` : ''}`;
  const title = section === 'inicio' ? DEFAULT_TITLE : `${label} Online HD en Español Latino | ${SITE_NAME}`;
  const description = section === 'inicio'
    ? DEFAULT_DESCRIPTION
    : `${label} en AnimeFLV: explora ${collection.total} series, estrenos y episodios disponibles online en HD y español latino.`;
  const itemList = collection.items.map((anime, index) => ({
    '@type': 'ListItem',
    position: (page - 1) * collection.pageSize + index + 1,
    name: anime.title,
    url: `${SITE_URL}/anime/${encodeURIComponent(anime.slug)}`
  }));

  return {
    status: 200,
    title,
    description,
    url,
    image: DEFAULT_IMAGE,
    imageAlt: 'AnimeFLV - Ver anime online en español latino',
    imageWidth: 1200,
    imageHeight: 630,
    type: 'website',
    keywords: [label, 'anime online', 'anime latino', 'episodios anime', SITE_NAME],
    prevUrl: section === 'directorio' && page > 1
      ? `${SITE_URL}/?section=directorio${page > 2 ? `&page=${page - 1}` : ''}`
      : '',
    nextUrl: section === 'directorio' && page < totalPages
      ? `${SITE_URL}/?section=directorio&page=${page + 1}`
      : '',
    bodyHtml: renderCollectionBody(label, collection),
    jsonLd: {
      '@context': 'https://schema.org',
      '@graph': [
        buildSiteNode(),
        buildOrganizationNode(),
        {
          '@type': 'CollectionPage',
          '@id': `${url}#webpage`,
          name: title,
          description,
          url,
          image: DEFAULT_IMAGE,
          inLanguage: 'es-419',
          isPartOf: { '@id': `${SITE_URL}/#website` },
          mainEntity: {
            '@type': 'ItemList',
            numberOfItems: collection.total,
            itemListElement: itemList
          }
        },
        buildBreadcrumb(section === 'inicio'
          ? [{ name: 'Inicio', url: `${SITE_URL}/` }]
          : [{ name: 'Inicio', url: `${SITE_URL}/` }, { name: label, url }])
      ]
    }
  };
}

async function buildAnimePage(slug) {
  const anime = await findAnimeBySlug(slug);
  if (!anime) return buildNotFoundPage('anime');
  if (slug !== anime.slug) {
    return { status: 308, redirectUrl: `${SITE_URL}/anime/${encodeURIComponent(anime.slug)}` };
  }
  const chapters = await findChapters(anime.title);
  const url = `${SITE_URL}/anime/${encodeURIComponent(anime.slug)}`;
  const description = `${anime.title}: ver anime online en HD y español latino en ${SITE_NAME}. ${anime.description || 'Consulta la sinopsis y todos los episodios disponibles.'}`;
  const modifiedTime = newestDate(anime.updatedAt, anime.createdAt, ...chapters.map(chapter => chapter.updatedAt));

  return {
    status: 200,
    title: `${anime.title} - Ver Anime Online HD en Latino | ${SITE_NAME}`,
    description,
    url,
    image: anime.image,
    imageAlt: `Poster de ${anime.title}`,
    type: 'video.tv_show',
    keywords: [anime.title, `ver ${anime.title} online`, `${anime.title} español latino`, ...anime.genres, 'anime online', SITE_NAME],
    modifiedTime,
    hideHero: true,
    bodyHtml: renderAnimeBody(anime, chapters),
    jsonLd: {
      '@context': 'https://schema.org',
      '@graph': [
        buildSiteNode(),
        buildOrganizationNode(),
        {
          '@type': 'TVSeries',
          '@id': `${url}#series`,
          name: anime.title,
          description: cleanDescription(description),
          image: toAbsoluteUrl(anime.image),
          url,
          inLanguage: 'es-419',
          genre: anime.genres,
          numberOfEpisodes: chapters.length,
          datePublished: anime.year ? String(anime.year) : anime.createdAt,
          dateModified: modifiedTime,
          potentialAction: { '@type': 'WatchAction', target: url }
        },
        buildBreadcrumb([{ name: 'Inicio', url: `${SITE_URL}/` }, { name: anime.title, url }])
      ]
    }
  };
}

async function buildWatchPage(episodePath) {
  const match = String(episodePath || '').match(/^(.+)-episodio-([^/]+)$/);
  if (!match) return buildNotFoundPage('episodio');
  const slug = match[1];
  const chapterNumber = decodeURIComponent(match[2]);
  const anime = await findAnimeBySlug(slug);
  if (!anime) return buildNotFoundPage('anime');
  const chapters = await findChapters(anime.title);
  const chapter = chapters.find(item => chapterKey(item.number) === chapterKey(chapterNumber));
  if (!chapter) return buildNotFoundPage('episodio');
  if (slug !== anime.slug) {
    return {
      status: 308,
      redirectUrl: `${SITE_URL}/ver/${encodeURIComponent(anime.slug)}-episodio-${encodeURIComponent(chapter.number)}`
    };
  }

  const url = `${SITE_URL}/ver/${encodeURIComponent(anime.slug)}-episodio-${encodeURIComponent(chapter.number)}`;
  const animeUrl = `${SITE_URL}/anime/${encodeURIComponent(anime.slug)}`;
  const image = chapter.image || anime.image;
  const description = `Mira ${anime.title} episodio ${chapter.number} online en HD y español latino en ${SITE_NAME}. Reproduce el capítulo y consulta más episodios de la serie.`;
  const currentIndex = chapters.indexOf(chapter);
  const previous = currentIndex > 0 ? chapters[currentIndex - 1] : null;
  const next = currentIndex < chapters.length - 1 ? chapters[currentIndex + 1] : null;
  const videoId = `${url}#video`;
  const episodeId = `${url}#episode`;
  const uploadDate = chapter.createdAt || chapter.updatedAt || anime.createdAt;
  const videoObject = chapter.embedUrl && uploadDate ? {
    '@type': 'VideoObject',
    '@id': videoId,
    name: `${anime.title} Episodio ${chapter.number}`,
    description,
    thumbnailUrl: toAbsoluteUrl(image),
    uploadDate,
    embedUrl: chapter.embedUrl,
    inLanguage: 'es-419'
  } : null;

  return {
    status: 200,
    title: `${anime.title} Episodio ${chapter.number} - Ver Online HD | ${SITE_NAME}`,
    description,
    url,
    image,
    imageAlt: `${anime.title} episodio ${chapter.number}`,
    type: 'video.episode',
    keywords: [`${anime.title} episodio ${chapter.number}`, `ver ${anime.title} episodio ${chapter.number}`, `${anime.title} online latino`, 'anime online', SITE_NAME],
    modifiedTime: chapter.updatedAt || chapter.createdAt,
    prevUrl: previous ? `${SITE_URL}/ver/${encodeURIComponent(anime.slug)}-episodio-${encodeURIComponent(previous.number)}` : '',
    nextUrl: next ? `${SITE_URL}/ver/${encodeURIComponent(anime.slug)}-episodio-${encodeURIComponent(next.number)}` : '',
    hideHero: true,
    bodyHtml: renderWatchBody(anime, chapter, chapters),
    jsonLd: {
      '@context': 'https://schema.org',
      '@graph': [
        buildSiteNode(),
        buildOrganizationNode(),
        {
          '@type': 'TVEpisode',
          '@id': episodeId,
          name: `${anime.title} Episodio ${chapter.number}`,
          episodeNumber: String(chapter.number),
          description,
          image: toAbsoluteUrl(image),
          url,
          inLanguage: 'es-419',
          datePublished: chapter.createdAt || chapter.updatedAt,
          dateModified: chapter.updatedAt || chapter.createdAt,
          partOfSeries: { '@type': 'TVSeries', '@id': `${animeUrl}#series`, name: anime.title, url: animeUrl },
          associatedMedia: videoObject ? { '@id': videoId } : undefined,
          potentialAction: { '@type': 'WatchAction', target: url }
        },
        ...(videoObject ? [videoObject] : []),
        buildBreadcrumb([
          { name: 'Inicio', url: `${SITE_URL}/` },
          { name: anime.title, url: animeUrl },
          { name: `Episodio ${chapter.number}`, url }
        ])
      ]
    }
  };
}

async function buildPage(query) {
  const type = String(firstQuery(query.type) || 'home');
  if (type === 'anime') return buildAnimePage(String(firstQuery(query.slug) || ''));
  if (type === 'watch') return buildWatchPage(String(firstQuery(query.episode) || ''));
  return buildCollectionPage(query);
}

module.exports = async function handler(req, res) {
  const html = await readIndexHtml();
  let page;

  try {
    page = await buildPage(req.query || {});
  } catch (error) {
    const type = String(firstQuery(req.query?.type) || 'home');
    if (type === 'home') {
      page = {
        status: 200,
        title: DEFAULT_TITLE,
        description: DEFAULT_DESCRIPTION,
        url: `${SITE_URL}/`,
        image: DEFAULT_IMAGE,
        imageAlt: 'AnimeFLV - Ver anime online en español latino',
        imageWidth: 1200,
        imageHeight: 630,
        type: 'website'
      };
    } else {
      page = {
        status: 503,
        title: `Contenido temporalmente no disponible | ${SITE_NAME}`,
        description: 'AnimeFLV no pudo cargar este contenido temporalmente. Inténtalo de nuevo en unos minutos.',
        url: `${SITE_URL}/`,
        image: DEFAULT_IMAGE,
        imageWidth: 1200,
        imageHeight: 630,
        type: 'website',
        robots: 'noindex, follow',
        hideHero: true,
        bodyHtml: '<main id="content"><article class="anime-profile"><div class="anime-profile-copy"><h1>Contenido temporalmente no disponible</h1><p>Inténtalo de nuevo en unos minutos.</p><a class="profile-watch-btn" href="/">Volver a AnimeFLV</a></div></article></main>'
      };
    }
  }

  const status = page.status || 200;
  if (page.redirectUrl) {
    res.setHeader('Location', page.redirectUrl);
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400');
    return res.status(status).send('Redirigiendo a la URL canónica.');
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Language', 'es-419');
  res.setHeader('Vary', 'Accept-Encoding');
  res.setHeader('Link', `<${page.url}>; rel="canonical"`);
  if (status >= 500) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Retry-After', '300');
    res.setHeader('X-Robots-Tag', 'noindex, follow');
  } else if (status === 404) {
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    res.setHeader('X-Robots-Tag', 'noindex, follow');
  } else {
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=86400');
  }
  res.status(status).send(applyMeta(html, page));
};
