const SUPABASE_URL = 'https://vanmxvfhagqfbwynpwzt.supabase.co';
const SUPABASE_KEY = 'sb_publishable_c4fIwf42U_W18zJH2RkS1w_1UB2PeZO';
const SUPABASE_HEADERS = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json'
};
const ADMIN_SESSION_KEY = 'animeflv-admin-session';

let animes = [];
let globalAnimes = [];
let globalChapters = [];
let socialLinks = [];
let episodeReports = [];
let reportsLoadError = '';
let editingAnime = null;
let editingChapter = null;
let editingSocialLink = null;
const SECTION_LABELS = {
  inicio: 'Inicio',
  destacados: 'Destacados',
  latino: 'Latino',
  directorio: 'Directorio',
  sin_inicio: 'Oculto en inicio'
};
const CHAPTER_SECTION_VALUES = ['inicio', 'destacados'];
const PUBLISH_STATUS_VALUES = ['published', 'draft', 'hidden'];
const ADMIN_RECENT_ANIME_LIMIT = 5;
const ADMIN_CHAPTER_TABLE_LIMIT = 150;
const ADMIN_SERVER_DELETE_TABLE_LIMIT = 200;
const BULK_IMPORT_UI_CHUNK_SIZE = 250;
const BULK_IMPORT_WORKER_URL = '/bulk-import-worker.js?v=rem-blue-worker-5';
const CAROUSEL_LIMIT = 4;
const CAROUSEL_SIZE_STORAGE_KEY = 'animeflv-carousel-image-size';

const adminLock = document.getElementById('admin-lock');
const adminContent = document.getElementById('admin-content');
const animeSelect = document.getElementById('anime-select');
const animeSearchPicker = document.getElementById('anime-search-picker');
const animePickerResults = document.getElementById('anime-picker-results');
const chapterNumber = document.getElementById('chapter-number');
const serverName = document.getElementById('server-name');
const embedUrl = document.getElementById('embed-url');
const coverImage = document.getElementById('cover-image');
const chapterForm = document.getElementById('chapter-form');
const animeForm = document.getElementById('anime-form');
const animeTitle = document.getElementById('anime-title');
const animeImage = document.getElementById('anime-image');
const animeBannerImage = document.getElementById('anime-banner-image');
const animeImagePreview = document.getElementById('anime-image-preview');
const animeYear = document.getElementById('anime-year');
const animeStatus = document.getElementById('anime-status');
const animePublishStatus = document.getElementById('anime-publish-status');
const animeSortOrder = document.getElementById('anime-sort-order');
const animeSlug = document.getElementById('anime-slug');
const animeGenres = document.getElementById('anime-genres');
const animeDescription = document.getElementById('anime-description');
const chapterPublishStatus = document.getElementById('chapter-publish-status');
const adminMessage = document.getElementById('admin-message');
const lockMessage = document.getElementById('lock-message');
const chaptersTable = document.getElementById('chapters-table');
const serverDeleteTable = document.getElementById('server-delete-table');
const serverDeleteEpisodeSearch = document.getElementById('server-delete-episode');
const serverDeleteServerSearch = document.getElementById('server-delete-server');
const animesTable = document.getElementById('animes-table');
const adminAnimeSearch = document.getElementById('admin-anime-search');
const adminChapterSearch = document.getElementById('admin-chapter-search');
const serverDeleteSearch = document.getElementById('server-delete-search');
const chaptersHeading = document.getElementById('chapters-heading');
const sitemapOutput = document.getElementById('sitemap-output');
const saveAnimeButton = document.getElementById('save-anime');
const saveChapterButton = document.getElementById('save-chapter');
const cancelAnimeEditButton = document.getElementById('cancel-anime-edit');
const cancelChapterEditButton = document.getElementById('cancel-chapter-edit');
const socialIntroForm = document.getElementById('social-intro-form');
const socialIntroText = document.getElementById('social-intro-text');
const socialLinkForm = document.getElementById('social-link-form');
const socialTitle = document.getElementById('social-title');
const socialUrl = document.getElementById('social-url');
const socialSortOrder = document.getElementById('social-sort-order');
const socialEnabled = document.getElementById('social-enabled');
const socialLinksTable = document.getElementById('social-links-table');
const saveSocialLinkButton = document.getElementById('save-social-link');
const cancelSocialEditButton = document.getElementById('cancel-social-edit');
const reportsTable = document.getElementById('reports-table');
const refreshReportsButton = document.getElementById('refresh-reports');
const bulkImportForm = document.getElementById('bulk-import-form');
const bulkImportInput = document.getElementById('bulk-import-input');
const bulkImportPreview = document.getElementById('bulk-import-preview');
const importBulkChaptersButton = document.getElementById('import-bulk-chapters');
const analyzeBulkImportButton = document.getElementById('analyze-bulk-import');
const clearBulkImportButton = document.getElementById('clear-bulk-import');
const carouselForm = document.getElementById('carousel-form');
const carouselAnimeSearch = document.getElementById('carousel-anime-search');
const carouselPickerResults = document.getElementById('carousel-picker-results');
const carouselBannerImage = document.getElementById('carousel-banner-image');
const carouselTable = document.getElementById('carousel-table');
const clearCarouselFormButton = document.getElementById('clear-carousel-form');
const carouselImageSizeInput = document.getElementById('carousel-image-size');
const carouselImageSizeValue = document.getElementById('carousel-image-size-value');
const saveCarouselSettingsButton = document.getElementById('save-carousel-settings');

let pendingBulkImportRows = [];
let publishedEpisodeCountByTitle = new Map();
let selectedCarouselAnimeTitle = '';
let carouselSettings = {
  imageSize: Math.min(90, Math.max(28, Number(localStorage.getItem(CAROUSEL_SIZE_STORAGE_KEY)) || 42))
};

function getAdminSession() {
  return JSON.parse(localStorage.getItem(ADMIN_SESSION_KEY) || 'null');
}

function saveAdminSession(session) {
  localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at,
    user: session.user
  }));
}

function clearAdminSession() {
  localStorage.removeItem(ADMIN_SESSION_KEY);
}

function getSupabaseHeaders() {
  const session = getAdminSession();
  return {
    ...SUPABASE_HEADERS,
    Authorization: `Bearer ${session?.access_token || SUPABASE_KEY}`
  };
}

function escapeHTML(value) {
  return String(value || '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  }[char]));
}

function extractYouTubeId(url) {
  if (url.hostname.includes('youtu.be')) {
    return url.pathname.split('/').filter(Boolean)[0] || '';
  }

  if (url.hostname.includes('youtube.com') || url.hostname.includes('youtube-nocookie.com')) {
    if (url.pathname.startsWith('/embed/')) return url.pathname.split('/')[2] || '';
    if (url.pathname.startsWith('/shorts/')) return url.pathname.split('/')[2] || '';
    return url.searchParams.get('v') || '';
  }

  return '';
}

function getAutoCoverFromEmbed(value) {
  const rawUrl = String(value || '').trim();
  if (!rawUrl) return '';

  try {
    const url = new URL(rawUrl);
    const host = url.hostname.toLowerCase();
    const youtubeId = extractYouTubeId(url);

    if (youtubeId) {
      return `https://i.ytimg.com/vi/${encodeURIComponent(youtubeId)}/hqdefault.jpg`;
    }

    if (host.includes('drive.google.com')) {
      const fileId = url.pathname.includes('/file/d/')
        ? url.pathname.split('/file/d/')[1]?.split('/')[0]
        : url.searchParams.get('id');
      return fileId ? `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w640` : '';
    }

    if (host.includes('minochinos.com')) {
      const videoId = url.pathname.includes('/embed/')
        ? url.pathname.split('/embed/')[1]?.split('/')[0]
        : '';
      return videoId ? `https://pixibay.cc/${encodeURIComponent(videoId)}_xt.jpg` : '';
    }

    if (host.includes('dailymotion.com')) {
      const videoId = url.pathname.includes('/embed/video/')
        ? url.pathname.split('/embed/video/')[1]?.split('/')[0]
        : url.pathname.split('/video/')[1]?.split('_')[0];
      return videoId ? `https://www.dailymotion.com/thumbnail/video/${encodeURIComponent(videoId)}` : '';
    }

    if (host.includes('vimeo.com')) {
      const videoId = url.pathname.split('/').filter(Boolean).pop();
      return videoId ? `https://vumbnail.com/${encodeURIComponent(videoId)}.jpg` : '';
    }
  } catch {
    return '';
  }

  return '';
}

function normalizeImagePath(value) {
  const url = String(value || '').trim();
  if (!url) return '';
  if (/^https:\/\//i.test(url)) return url;
  if (url.startsWith('/images/')) return url.slice(1);

  if (!url.includes('/') && /\.[a-z0-9]+$/i.test(url)) {
    return `/images/${url}`;
  }

  if (!url.includes('/') && !/\.[a-z0-9]+$/i.test(url)) {
    return `/images/${url}.png`;
  }

  if (url.startsWith('images/') && !/\.[a-z0-9]+$/i.test(url)) {
    return `${url}.png`;
  }

  if (url.startsWith('images/')) {
    return url;
  }

  return url;
}

function isDirectImageUrl(value) {
  const url = String(value || '').trim();
  if (!/^https:\/\//i.test(url) && !/^\/?images\//i.test(url)) return false;

  try {
    const parsed = url.startsWith('http') ? new URL(url) : null;
    const path = parsed ? parsed.pathname : url;
    return /\.(jpe?g|png|webp|avif)$/i.test(path);
  } catch {
    return /\.(jpe?g|png|webp|avif)(?:[?#].*)?$/i.test(url);
  }
}

function normalizeCoverImage(value) {
  const normalized = normalizeImagePath(value);
  return isDirectImageUrl(normalized) ? normalized : '';
}

function pickImageFromValue(value) {
  if (!value) return '';

  if (typeof value === 'string') {
    const direct = normalizeCoverImage(value);
    if (direct) return direct;

    const match = value.match(/https:\/\/[^\s"'<>\\]+?\.(?:jpe?g|png|webp|avif)(?:\?[^\s"'<>\\]*)?/i);
    return normalizeCoverImage(match?.[0] || '');
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const image = pickImageFromValue(item);
      if (image) return image;
    }
    return '';
  }

  if (typeof value === 'object') {
    const imageKeys = [
      'cover_image',
      'coverImage',
      'image_url',
      'imageUrl',
      'thumbnail_url',
      'thumbnailUrl',
      'thumbnail',
      'thumb',
      'poster',
      'poster_url',
      'posterUrl',
      'snapshot',
      'preview',
      'imagen',
      'image'
    ];

    for (const key of imageKeys) {
      const image = pickImageFromValue(value[key]);
      if (image) return image;
    }
  }

  return '';
}

function getChapterCoverImage(packageData, chapter, index) {
  const directImage = pickImageFromValue(chapter);
  if (directImage) return directImage;

  const chapterNumber = Number(chapter?.chapter_number);
  const packageImageSources = [
    packageData?.covers,
    packageData?.cover_images,
    packageData?.images,
    packageData?.thumbnails,
    packageData?.thumbs,
    packageData?.posters,
    packageData?.previews
  ];

  for (const source of packageImageSources) {
    if (Array.isArray(source)) {
      if (Number.isInteger(chapterNumber) && source.every(item => typeof item === 'string')) {
        const byEpisodeNumber = pickImageFromValue(source[chapterNumber - 1]);
        if (byEpisodeNumber) return byEpisodeNumber;
      }

      const byIndex = pickImageFromValue(source[index]);
      if (byIndex) return byIndex;

      const byChapter = source.find(item => Number(item?.chapter_number ?? item?.episode ?? item?.number) === chapterNumber);
      const chapterImage = pickImageFromValue(byChapter);
      if (chapterImage) return chapterImage;
    }

    if (source && typeof source === 'object') {
      const keyed = pickImageFromValue(source[chapterNumber] || source[String(chapterNumber)] || source[index] || source[String(index)]);
      if (keyed) return keyed;
    }
  }

  return '';
}

function normalizeDownloadLinks(value) {
  const source = Array.isArray(value) ? value : [];
  const seen = new Set();

  return source
    .map((item, index) => {
      const rawUrl = typeof item === 'string'
        ? item
        : item?.url || item?.href || item?.download_url || item?.downloadUrl || '';
      const url = String(rawUrl || '').trim();
      if (!/^https:\/\//i.test(url) || seen.has(url)) return null;
      seen.add(url);

      const server = typeof item === 'string'
        ? ''
        : item?.server || item?.server_name || item?.name || item?.label || '';
      const quality = typeof item === 'string'
        ? ''
        : item?.quality || item?.resolution || item?.calidad || '';

      return {
        server: String(server || `Descarga ${index + 1}`).trim().slice(0, 80),
        quality: String(quality || '').trim().slice(0, 40),
        url
      };
    })
    .filter(Boolean);
}

function getBulkAnimeCover(packageData) {
  const cover = pickImageFromValue({
    anime_cover: packageData?.anime_cover,
    animeCover: packageData?.animeCover,
    image_url: packageData?.image_url,
    imageUrl: packageData?.imageUrl,
    cover_image: packageData?.cover_image,
    poster: packageData?.poster,
    thumbnail: packageData?.thumbnail,
    imagen: packageData?.imagen,
    image: packageData?.image
  });

  if (!cover || /(?:^|\/)(?:favicon|avatar|ads?)(?:[._-]|$)/i.test(cover)) {
    return '';
  }

  return cover;
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

function getCheckedValues(name) {
  return Array.from(document.querySelectorAll(`input[name="${name}"]:checked`))
    .map(input => input.value);
}

function setCheckedValues(name, values = []) {
  const selected = new Set(values || []);
  document.querySelectorAll(`input[name="${name}"]`).forEach(input => {
    if (name === 'anime-section' && input.value === 'inicio') {
      input.checked = !selected.has('sin_inicio');
      return;
    }
    input.checked = selected.has(input.value);
  });
}

function formatSections(values = []) {
  return values && values.length ? values.map(value => SECTION_LABELS[value] || value).join(', ') : '-';
}

function looksLikeLatinoTitle(value) {
  const normalized = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  return /\b(?:espanol latino|audio latino|latino(?:s|america|americano|americana)?|latina(?:s)?|latam|castellano)\b/.test(normalized);
}

function cleanChapterSections(values = []) {
  return Array.isArray(values)
    ? values.filter(value => CHAPTER_SECTION_VALUES.includes(value))
    : [];
}

function getNewChapterSections(values = []) {
  return Array.from(new Set(['inicio', ...cleanChapterSections(values)]));
}

function cleanPublishStatus(value) {
  return PUBLISH_STATUS_VALUES.includes(value) ? value : 'published';
}

function getAnimeSections(title = animeTitle?.value || '') {
  const values = getCheckedValues('anime-section');
  const sections = looksLikeLatinoTitle(title) && !values.includes('latino')
    ? [...values, 'latino']
    : values;
  return sections.includes('inicio') ? sections : [...sections, 'sin_inicio'];
}

function syncLatinoSectionFromTitle() {
  const input = document.querySelector('input[name="anime-section"][value="latino"]');
  if (!input || !looksLikeLatinoTitle(animeTitle.value)) return;
  input.checked = true;
}

function getSocialNetwork(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '').toLowerCase();
    if (host.includes('instagram')) return 'Instagram';
    if (host.includes('telegram') || host === 't.me') return 'Telegram';
    if (host.includes('youtube') || host.includes('youtu.be')) return 'YouTube';
    if (host.includes('tiktok')) return 'TikTok';
    if (host.includes('discord')) return 'Discord';
    if (host.includes('facebook') || host.includes('fb.com')) return 'Facebook';
    if (host.includes('twitter') || host.includes('x.com')) return 'X';
  } catch {
    return 'Link';
  }
  return 'Link';
}

function getPublishLabel(value) {
  return {
    published: 'Publicado',
    draft: 'Borrador',
    hidden: 'Oculto'
  }[value] || 'Publicado';
}

function isPublished(item) {
  return (item.publish_status || 'published') === 'published';
}

function rebuildPublishedEpisodeCounts() {
  const counts = new Map();

  globalChapters.forEach(chapter => {
    if (!chapter.anime_title || !isPublished(chapter)) return;
    if (!counts.has(chapter.anime_title)) {
      counts.set(chapter.anime_title, new Set());
    }
    counts.get(chapter.anime_title).add(String(chapter.chapter_number));
  });

  publishedEpisodeCountByTitle = new Map(
    Array.from(counts.entries()).map(([title, episodeNumbers]) => [title, episodeNumbers.size])
  );
}

function getPublishedEpisodeCount(title) {
  return publishedEpisodeCountByTitle.get(title) || 0;
}

function updateAnimeImagePreview() {
  if (!animeImagePreview) return;
  animeImagePreview.src = normalizeImagePath(animeImage.value) || '/images/placeholder.png';
}

function setMessage(text, type = '') {
  adminMessage.textContent = text;
  adminMessage.className = `admin-message ${type}`;
}

function setBulkImportPreview(html = '') {
  if (bulkImportPreview) {
    bulkImportPreview.innerHTML = html;
  }
}

function yieldToBrowser() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

async function supabaseRequest(path, options = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      ...getSupabaseHeaders(),
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function supabasePagedRequest(path, options = {}) {
  const pageSize = 1000;
  const rows = [];
  let offset = 0;

  while (true) {
    const page = await supabaseRequest(path, {
      ...options,
      headers: {
        Range: `${offset}-${offset + pageSize - 1}`,
        ...(options.headers || {})
      }
    }) || [];

    rows.push(...page);
    if (page.length < pageSize) break;
    offset += pageSize;
  }

  return rows;
}

async function signInAdmin(email, password) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: SUPABASE_HEADERS,
    body: JSON.stringify({ email, password })
  });

  if (!response.ok) {
    throw new Error('Email o contraseña incorrectos.');
  }

  const session = await response.json();
  saveAdminSession(session);
  await verifyAdminUser(session.user.id);
}

async function verifyAdminUser(userId) {
  const params = new URLSearchParams({
    select: 'user_id',
    user_id: `eq.${userId}`,
    limit: '1'
  });
  const rows = await supabaseRequest(`admin_users?${params.toString()}`);

  if (!rows || rows.length === 0) {
    clearAdminSession();
    throw new Error('Tu usuario existe, pero no está marcado como admin.');
  }
}

async function loadAnimes() {
  const response = await fetch('animes.json', { cache: 'no-store' });
  const data = await response.json();
  const localAnimes = data.filter(anime => anime.imagen && !anime.imagen.toLowerCase().includes('placeholder'));
  const params = new URLSearchParams({
    select: 'id,titulo,image_url,banner_image,descripcion,year,estado,generos,slug,publish_status,sections,sort_order,created_at',
    order: 'created_at.desc'
  });
  try {
    globalAnimes = await supabasePagedRequest(`animes?${params.toString()}`);
  } catch (error) {
    const fallbackParams = new URLSearchParams({
      select: 'id,titulo,image_url,descripcion,year,estado,generos,created_at',
      order: 'created_at.desc'
    });
    globalAnimes = await supabasePagedRequest(`animes?${fallbackParams.toString()}`);
  }
  const animeMap = new Map();

  localAnimes.forEach(anime => animeMap.set(anime.titulo, anime));
  globalAnimes.forEach(anime => {
    animeMap.set(anime.titulo, {
      titulo: anime.titulo,
      imagen: anime.image_url,
      banner_image: anime.banner_image || '',
      descripcion: anime.descripcion,
      year: anime.year,
      estado: anime.estado,
      generos: anime.generos || [],
      slug: anime.slug || slugify(anime.titulo),
      publish_status: anime.publish_status || 'published',
      sections: anime.sections || [],
      sort_order: anime.sort_order || 0,
      capitulos: animeMap.get(anime.titulo)?.capitulos || []
    });
  });

  animes = Array.from(animeMap.values()).sort((a, b) => a.titulo.localeCompare(b.titulo));
}

async function loadGlobalChapters() {
  const params = new URLSearchParams({
    select: 'id,anime_title,chapter_number,embed_url,cover_image,server_name,publish_status,sections,created_at',
    order: 'chapter_number.asc'
  });
  try {
    globalChapters = await supabasePagedRequest(`anime_chapters?${params.toString()}`) || [];
  } catch (error) {
    const fallbackParams = new URLSearchParams({
      select: 'id,anime_title,chapter_number,embed_url,cover_image,server_name,created_at',
      order: 'chapter_number.asc'
    });
    globalChapters = await supabasePagedRequest(`anime_chapters?${fallbackParams.toString()}`) || [];
  }
  rebuildPublishedEpisodeCounts();
}

async function loadSocialContent() {
  const settingsParams = new URLSearchParams({
    select: 'value',
    key: 'in.(social_intro,carousel_settings)'
  });
  const linksParams = new URLSearchParams({
    select: 'id,title,url,sort_order,enabled,created_at',
    order: 'sort_order.asc,created_at.asc'
  });

  const [settingsRows, linksRows] = await Promise.all([
    supabaseRequest(`site_settings?${settingsParams.toString()}`).catch(() => []),
    supabaseRequest(`social_links?${linksParams.toString()}`).catch(() => [])
  ]);

  if (socialIntroText) {
    const introRow = settingsRows.find(row => row.value && row.value.text !== undefined);
    socialIntroText.value = introRow?.value?.text || '';
  }
  const carouselRow = settingsRows.find(row => row.value && row.value.imageSize !== undefined);
  const savedSize = Number(carouselRow?.value?.imageSize);
  if (Number.isFinite(savedSize)) {
    carouselSettings.imageSize = savedSize;
    localStorage.setItem(CAROUSEL_SIZE_STORAGE_KEY, String(savedSize));
  }
  syncCarouselSizeControls();
  socialLinks = linksRows || [];
}

async function loadEpisodeReports() {
  reportsLoadError = '';
  const params = new URLSearchParams({
    select: 'id,user_id,reporter_username,anime_title,anime_slug,chapter_number,server_name,embed_url,page_url,reason,status,created_at',
    order: 'created_at.desc',
    limit: '60'
  });

  try {
    episodeReports = await supabaseRequest(`episode_reports?${params.toString()}`) || [];
  } catch (error) {
    episodeReports = [];
    reportsLoadError = 'No se pudieron cargar reportes. Revisa que hayas ejecutado el SQL de episode_reports en Supabase.';
  }
}

function renderSocialLinksTable() {
  if (!socialLinksTable) return;

  socialLinksTable.innerHTML = socialLinks.length
    ? socialLinks.map(link => `
        <tr>
          <td>${escapeHTML(link.title || getSocialNetwork(link.url))}</td>
          <td><a href="${escapeHTML(link.url)}" target="_blank" rel="noreferrer">${escapeHTML(link.url)}</a></td>
          <td>${escapeHTML(link.sort_order || 0)}</td>
          <td>${link.enabled ? 'Visible' : 'Oculto'}</td>
          <td>
            <button class="admin-secondary" data-edit-social="${escapeHTML(link.id)}">Editar</button>
            <button class="admin-delete" data-delete-social="${escapeHTML(link.id)}">Borrar</button>
          </td>
        </tr>
      `).join('')
    : '<tr><td colspan="5">No hay redes configuradas.</td></tr>';
}

function renderAnimeOptions() {
  animeSelect.innerHTML = animes
    .map(anime => `<option value="${escapeHTML(anime.titulo)}">${escapeHTML(anime.titulo)}</option>`)
    .join('');
  syncAnimePickerInput();
}

function formatAdminDate(value) {
  if (!value) return '';
  try {
    return new Intl.DateTimeFormat('es', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(value));
  } catch {
    return String(value).slice(0, 16);
  }
}

function getReportStatusLabel(status) {
  return status === 'resolved' ? 'Revisado' : 'Abierto';
}

function renderEpisodeReportsTable() {
  if (!reportsTable) return;

  if (reportsLoadError) {
    reportsTable.innerHTML = `<tr><td colspan="9">${escapeHTML(reportsLoadError)}</td></tr>`;
    return;
  }

  reportsTable.innerHTML = episodeReports.length
    ? episodeReports.map(report => {
        const isResolved = report.status === 'resolved';
        const pageUrl = report.page_url || (report.anime_slug && report.chapter_number
          ? `/ver/${report.anime_slug}-episodio-${report.chapter_number}`
          : '');
        return `
          <tr>
            <td>${escapeHTML(formatAdminDate(report.created_at))}</td>
            <td>
              ${escapeHTML(report.anime_title)}
              ${report.embed_url ? `<br><a href="${escapeHTML(report.embed_url)}" target="_blank" rel="noreferrer">Embed</a>` : ''}
            </td>
            <td>${escapeHTML(report.chapter_number || '')}</td>
            <td>${escapeHTML(report.server_name || 'Principal')}</td>
            <td>${escapeHTML(report.reporter_username || 'Invitado')}</td>
            <td>${pageUrl ? `<a href="${escapeHTML(pageUrl)}" target="_blank" rel="noreferrer">Ver origen</a>` : 'No disponible'}</td>
            <td>${escapeHTML(report.reason || 'El episodio no carga')}</td>
            <td><span class="report-status ${isResolved ? 'resolved' : 'open'}">${escapeHTML(getReportStatusLabel(report.status))}</span></td>
            <td>
                  ${pageUrl ? `<button class="admin-secondary" data-view-report="${escapeHTML(pageUrl)}">Ver</button>` : ''}
              <button class="admin-secondary" data-go-server-delete="${escapeHTML(report.id)}">Ir a eliminar servidores</button>
              <button class="admin-secondary" data-edit-report="${escapeHTML(report.id)}">Editar</button>
              <button class="admin-secondary" data-delete-report="${escapeHTML(report.id)}">Eliminar</button>
              <button class="admin-delete" data-delete-report-server="${escapeHTML(report.id)}">Eliminar servidor</button>
              <button class="admin-secondary" data-report-status="${escapeHTML(report.id)}" data-status="${isResolved ? 'open' : 'resolved'}">
                ${isResolved ? 'Reabrir' : 'Marcar revisado'}
              </button>
            </td>
          </tr>
        `;
      }).join('')
    : '<tr><td colspan="9">Todavia no hay reportes.</td></tr>';
}

function selectAnimeForChapter(title) {
  if (!title) return;
  const anime = animes.find(item => item.titulo === title);
  if (!anime) return;
  animeSelect.value = anime.titulo;
  syncAnimePickerInput();
  setNextEpisodeNumber();
  renderAnimesTable();
  renderChaptersTable();
}

function syncAnimePickerInput() {
  if (animeSearchPicker) {
    animeSearchPicker.value = animeSelect.value || '';
  }
}

function getAnimePickerMatches(query) {
  const normalizedQuery = normalizeTitleForMatch(query);
  if (!normalizedQuery) return animes.slice(0, 8);

  return animes
    .map(anime => ({
      anime,
      normalized: normalizeTitleForMatch(anime.titulo)
    }))
    .filter(item => item.normalized.includes(normalizedQuery))
    .slice(0, 8)
    .map(item => item.anime);
}

function getCarouselPickerMatches(query) {
  const normalizedQuery = normalizeTitleForMatch(query);
  const source = normalizedQuery
    ? globalAnimes.filter(anime => normalizeTitleForMatch(anime.titulo).includes(normalizedQuery))
    : [...globalAnimes]
        .sort((a, b) => Date.parse(b.created_at || '') - Date.parse(a.created_at || ''))
        .slice(0, 12);

  return source
    .filter(anime => (anime.publish_status || 'published') === 'published')
    .slice(0, 12);
}

function selectCarouselAnime(title) {
  const anime = globalAnimes.find(item => item.titulo === title);
  if (!anime) return;

  selectedCarouselAnimeTitle = anime.titulo;
  if (carouselAnimeSearch) carouselAnimeSearch.value = anime.titulo;
  if (carouselBannerImage) {
    carouselBannerImage.value = anime.banner_image && anime.banner_image !== anime.image_url ? anime.banner_image : '';
    carouselBannerImage.dataset.originalValue = anime.banner_image || '';
  }
}

function renderCarouselPickerResults() {
  if (!carouselAnimeSearch || !carouselPickerResults) return;
  const matches = getCarouselPickerMatches(carouselAnimeSearch.value);
  if (!matches.length) {
    carouselPickerResults.innerHTML = '';
    carouselPickerResults.classList.add('hidden');
    return;
  }

  carouselPickerResults.innerHTML = matches.map(anime => `
    <button type="button" data-carousel-picker="${escapeHTML(anime.titulo)}">
      <strong>${escapeHTML(anime.titulo)}</strong>
      <small>${escapeHTML(anime.slug || slugify(anime.titulo))} · ${escapeHTML(formatSections(anime.sections))}</small>
    </button>
  `).join('');
  carouselPickerResults.classList.remove('hidden');
}

function commitCarouselPickerValue() {
  if (!carouselAnimeSearch) return;
  const value = carouselAnimeSearch.value.trim();
  const exact = globalAnimes.find(anime => normalizeTitleForMatch(anime.titulo) === normalizeTitleForMatch(value));
  const fallback = getCarouselPickerMatches(value)[0];
  const selected = exact || fallback;

  if (selected) {
    selectCarouselAnime(selected.titulo);
  }

  carouselPickerResults?.classList.add('hidden');
}

function renderAnimePickerResults() {
  if (!animeSearchPicker || !animePickerResults) return;

  const query = animeSearchPicker.value.trim();
  const matches = getAnimePickerMatches(query);

  if (!query || !matches.length) {
    animePickerResults.classList.add('hidden');
    animePickerResults.innerHTML = '';
    return;
  }

  animePickerResults.innerHTML = matches.map(anime => `
    <button type="button" data-anime-picker="${escapeHTML(anime.titulo)}">
      <strong>${escapeHTML(anime.titulo)}</strong>
      <small>${escapeHTML(anime.slug || slugify(anime.titulo))}</small>
    </button>
  `).join('');
  animePickerResults.classList.remove('hidden');
}

function commitAnimePickerValue() {
  if (!animeSearchPicker) return;
  const value = animeSearchPicker.value.trim();
  const exact = animes.find(anime => normalizeTitleForMatch(anime.titulo) === normalizeTitleForMatch(value));
  const fallback = getAnimePickerMatches(value)[0];
  const selected = exact || fallback;

  if (selected) {
    selectAnimeForChapter(selected.titulo);
  } else {
    syncAnimePickerInput();
  }

  animePickerResults?.classList.add('hidden');
}

function renderAnimesTable() {
  const query = (adminAnimeSearch?.value || '').toLowerCase().trim();
  const filteredRows = globalAnimes.filter(anime => {
    if (!query) return true;
    const searchable = [
      anime.titulo,
      anime.slug,
      anime.estado,
      getPublishLabel(anime.publish_status),
      formatSections(anime.sections)
    ].join(' ').toLowerCase();
    return searchable.includes(query);
  });
  const rows = query ? filteredRows : filteredRows.slice(0, ADMIN_RECENT_ANIME_LIMIT);
  const hiddenCount = query ? 0 : Math.max(0, filteredRows.length - rows.length);
  const hiddenNotice = hiddenCount
    ? `<tr><td colspan="6"><small>Mostrando solo ${ADMIN_RECENT_ANIME_LIMIT} animes recientes. Usa el buscador para encontrar los otros ${hiddenCount}.</small></td></tr>`
    : '';

  animesTable.innerHTML = rows.length
    ? `${rows.map(anime => `
        <tr class="${animeSelect.value === anime.titulo ? 'admin-selected-row' : ''}">
          <td><img class="admin-cover-preview" src="${escapeHTML(anime.image_url)}" alt="${escapeHTML(anime.titulo)}"></td>
          <td>
            <button class="admin-link-button" data-edit-anime="${escapeHTML(anime.titulo)}">${escapeHTML(anime.titulo)}</button>
            <br><small>${escapeHTML(anime.slug || slugify(anime.titulo))}</small>
          </td>
          <td>${escapeHTML(anime.estado)}<br><small>${escapeHTML(getPublishLabel(anime.publish_status))}</small></td>
          <td>${escapeHTML(getPublishedEpisodeCount(anime.titulo))}</td>
          <td>${escapeHTML(formatSections(anime.sections))}</td>
          <td>
            <button class="admin-secondary" data-edit-anime="${escapeHTML(anime.titulo)}">Editar</button>
            <button class="admin-secondary" data-manage-chapters="${escapeHTML(anime.titulo)}">Capitulos</button>
            <button class="admin-secondary" data-directory-anime="${escapeHTML(anime.id)}">Agregar a directorio</button>
            <button class="admin-secondary" data-view-anime="${escapeHTML(anime.slug || slugify(anime.titulo))}">Ver</button>
            <button class="admin-delete" data-delete-anime="${escapeHTML(anime.id)}">Borrar</button>
          </td>
        </tr>
      `).join('')}${hiddenNotice}`
    : '<tr><td colspan="6">No hay animes creados desde el panel.</td></tr>';
}

function getCarouselAnimes() {
  return [...globalAnimes]
    .filter(anime => (anime.sections || []).includes('destacados') || anime.banner_image)
    .sort((a, b) => {
      const sortDiff = (Number(b.sort_order) || 0) - (Number(a.sort_order) || 0);
      if (sortDiff !== 0) return sortDiff;
      return Date.parse(b.created_at || '') - Date.parse(a.created_at || '');
    });
}

function renderCarouselTable() {
  if (!carouselTable) return;
  const carouselAnimes = getCarouselAnimes();
  const visibleCount = carouselAnimes.filter(anime => (anime.sections || []).includes('destacados')).length;

  carouselTable.innerHTML = carouselAnimes.length
    ? carouselAnimes.map(anime => {
        const visible = (anime.sections || []).includes('destacados');
        const image = anime.banner_image || anime.image_url || '/images/placeholder.png';
        const usesCover = !anime.banner_image || anime.banner_image === anime.image_url;
        return `
          <tr class="${visible ? 'admin-selected-row' : ''}">
            <td><img class="admin-cover-preview" src="${escapeHTML(image)}" alt="${escapeHTML(anime.titulo)}"></td>
            <td>
              <button class="admin-link-button" data-carousel-select="${escapeHTML(anime.titulo)}">${escapeHTML(anime.titulo)}</button>
              <br><small>${escapeHTML(anime.slug || slugify(anime.titulo))}</small>
            </td>
            <td>
              ${visible ? 'Visible' : 'Oculto'}
              <br><small>${visible ? `${visibleCount}/${CAROUSEL_LIMIT} activos` : 'No aparece'}</small>
            </td>
            <td>${usesCover ? 'Usa portada' : `<a href="${escapeHTML(anime.banner_image)}" target="_blank" rel="noopener">Banner propio</a>`}</td>
            <td>
              <button class="admin-secondary" data-carousel-select="${escapeHTML(anime.titulo)}">Editar</button>
              ${visible
                ? `<button class="admin-secondary" data-carousel-hide="${escapeHTML(anime.id)}">Ocultar</button>`
                : `<button class="admin-secondary" data-carousel-show="${escapeHTML(anime.id)}">Mostrar</button>`}
              <button class="admin-secondary" data-carousel-clear-banner="${escapeHTML(anime.id)}">Quitar banner</button>
            </td>
          </tr>
        `;
      }).join('')
    : '<tr><td colspan="5">Todavia no hay animes configurados para el carrusel.</td></tr>';
}

function getCarouselImageSizeValue() {
  return Math.min(90, Math.max(28, Number(carouselImageSizeInput?.value) || 42));
}

function syncCarouselSizeControls() {
  const size = Math.min(90, Math.max(28, Number(carouselSettings.imageSize) || 42));
  carouselSettings.imageSize = size;
  if (carouselImageSizeInput) carouselImageSizeInput.value = String(size);
  if (carouselImageSizeValue) carouselImageSizeValue.textContent = `${size}%`;
  localStorage.setItem(CAROUSEL_SIZE_STORAGE_KEY, String(size));
}

async function saveCarouselSettings() {
  carouselSettings.imageSize = getCarouselImageSizeValue();
  syncCarouselSizeControls();

  setMessage('Guardando tamaño del carrusel...');
  try {
    await supabaseRequest('site_settings?on_conflict=key', {
      method: 'POST',
      headers: {
        Prefer: 'resolution=merge-duplicates,return=minimal'
      },
      body: JSON.stringify({
        key: 'carousel_settings',
        value: { imageSize: carouselSettings.imageSize },
        updated_at: new Date().toISOString()
      })
    });
    setMessage('Tamaño del carrusel guardado.', 'success');
  } catch (error) {
    setMessage('Tamaño guardado en este navegador. Ejecuta el SQL actualizado para guardarlo globalmente.', 'success');
  }
}

function getSelectedAnime() {
  return animes.find(anime => anime.titulo === animeSelect.value);
}

function getSelectedGlobalChapters() {
  return globalChapters
    .filter(chapter => chapter.anime_title === animeSelect.value)
    .sort((a, b) => Number(a.chapter_number) - Number(b.chapter_number));
}

function setNextEpisodeNumber() {
  const anime = getSelectedAnime();
  const baseNumbers = anime && anime.capitulos ? anime.capitulos.map(cap => Number(cap.numero)) : [];
  const globalNumbers = getSelectedGlobalChapters().map(cap => Number(cap.chapter_number));
  const maxNumber = Math.max(0, ...baseNumbers, ...globalNumbers);
  chapterNumber.value = maxNumber + 1;
}

function renderChaptersTable() {
  const query = (adminChapterSearch?.value || '').toLowerCase().trim();
  const selectedTitle = animeSelect.value || 'un anime';
  if (chaptersHeading) {
    chaptersHeading.textContent = `Episodios de ${selectedTitle}`;
  }
  const chapters = getSelectedGlobalChapters().filter(chapter => {
    if (!query) return true;
    const searchable = [
      `ep ${chapter.chapter_number}`,
      chapter.chapter_number,
      chapter.server_name,
      chapter.embed_url,
      getPublishLabel(chapter.publish_status),
      formatSections(chapter.sections)
    ].join(' ').toLowerCase();
    return searchable.includes(query);
  });

  const visibleChapters = query
    ? chapters.slice(0, ADMIN_CHAPTER_TABLE_LIMIT)
    : chapters.slice(Math.max(0, chapters.length - ADMIN_CHAPTER_TABLE_LIMIT));

  const hiddenCount = Math.max(0, chapters.length - visibleChapters.length);
  const hiddenNotice = hiddenCount
    ? `<tr><td colspan="7"><small>${query
        ? `Mostrando ${visibleChapters.length} de ${chapters.length} resultados. Escribe un numero o servidor mas especifico para afinar.`
        : `Mostrando los ultimos ${visibleChapters.length} de ${chapters.length} episodios. Usa el buscador para encontrar episodios anteriores.`}</small></td></tr>`
    : '';

  chaptersTable.innerHTML = chapters.length
    ? `${visibleChapters.map(chapter => `
        <tr>
          <td>Ep ${escapeHTML(chapter.chapter_number)}</td>
          <td>${chapter.cover_image ? `<img class="admin-cover-preview" src="${escapeHTML(chapter.cover_image)}" alt="Ep ${escapeHTML(chapter.chapter_number)}">` : 'Automatica'}</td>
          <td>${escapeHTML(chapter.server_name)}</td>
          <td>${escapeHTML(formatSections(chapter.sections))}</td>
          <td>${escapeHTML(getPublishLabel(chapter.publish_status))}</td>
          <td><a href="${escapeHTML(chapter.embed_url)}" target="_blank" rel="noreferrer">${escapeHTML(chapter.embed_url)}</a></td>
          <td>
            <button class="admin-secondary" data-edit-chapter="${escapeHTML(chapter.id)}">Editar</button>
            <button class="admin-secondary" data-duplicate-chapter="${escapeHTML(chapter.id)}">Duplicar</button>
            <button class="admin-secondary" data-view-chapter="${escapeHTML(chapter.id)}">Ver</button>
            <button class="admin-delete" data-id="${escapeHTML(chapter.id)}">Borrar</button>
          </td>
        </tr>
      `).join('')}${hiddenNotice}`
    : '<tr><td colspan="7">No hay capitulos para este anime o filtro.</td></tr>';
}

function renderServerDeleteTable() {
  if (!serverDeleteTable) return;

  const query = (serverDeleteSearch?.value || '').toLowerCase().trim();
  const episodeFilter = (serverDeleteEpisodeSearch?.value || '').toLowerCase().trim();
  const serverFilter = (serverDeleteServerSearch?.value || '').toLowerCase().trim();
  const matches = globalChapters
    .filter(chapter => {
      const searchable = [
        chapter.anime_title,
        `ep ${chapter.chapter_number}`,
        chapter.chapter_number,
        chapter.server_name,
        chapter.embed_url,
        getPublishLabel(chapter.publish_status)
      ].join(' ').toLowerCase();

      const matchesText = !query || searchable.includes(query);
      const matchesEpisode = !episodeFilter || String(chapter.chapter_number).toLowerCase().includes(episodeFilter);
      const matchesServer = !serverFilter || String(chapter.server_name).toLowerCase().includes(serverFilter);
      return matchesText && matchesEpisode && matchesServer;
    })
    .sort((a, b) => {
      const animeCompare = String(a.anime_title || '').localeCompare(String(b.anime_title || ''));
      if (animeCompare) return animeCompare;
      return Number(a.chapter_number) - Number(b.chapter_number);
    });

  const visibleRows = query
    ? matches.slice(0, ADMIN_SERVER_DELETE_TABLE_LIMIT)
    : matches.slice(Math.max(0, matches.length - ADMIN_SERVER_DELETE_TABLE_LIMIT));
  const hiddenCount = Math.max(0, matches.length - visibleRows.length);
  const hiddenNotice = hiddenCount
    ? `<tr><td colspan="5"><small>${query
        ? `Mostrando ${visibleRows.length} de ${matches.length} resultados. Escribe mas detalle para afinar.`
        : `Mostrando los ultimos ${visibleRows.length} servidores. Usa el buscador para encontrar cualquier anime o episodio.`}</small></td></tr>`
    : '';

  serverDeleteTable.innerHTML = matches.length
    ? `${visibleRows.map(chapter => `
        <tr>
          <td>${escapeHTML(chapter.anime_title)}</td>
          <td>Ep ${escapeHTML(chapter.chapter_number)}</td>
          <td>${escapeHTML(chapter.server_name)}</td>
          <td><a href="${escapeHTML(chapter.embed_url)}" target="_blank" rel="noreferrer">${escapeHTML(chapter.embed_url)}</a></td>
          <td><button class="admin-delete" data-delete-server="${escapeHTML(chapter.id)}">Borrar servidor</button></td>
        </tr>
      `).join('')}${hiddenNotice}`
    : '<tr><td colspan="5">No hay servidores para ese filtro.</td></tr>';
}

function goToServerDeleteSection(episode, server) {
  if (serverDeleteSearch) serverDeleteSearch.value = '';
  if (serverDeleteEpisodeSearch) serverDeleteEpisodeSearch.value = episode != null ? String(episode) : '';
  if (serverDeleteServerSearch) serverDeleteServerSearch.value = server || '';
  renderServerDeleteTable();

  const section = serverDeleteSearch?.closest('.admin-section');
  if (section) {
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

async function refreshPanel() {
  await loadAnimes();
  await loadGlobalChapters();
  await loadSocialContent();
  await loadEpisodeReports();
  renderAnimeOptions();
  renderAnimesTable();
  renderCarouselTable();
  renderSocialLinksTable();
  renderEpisodeReportsTable();
  setNextEpisodeNumber();
  renderChaptersTable();
  renderServerDeleteTable();
}

function resetAnimeForm() {
  editingAnime = null;
  animeForm.reset();
  animeYear.value = new Date().getFullYear();
  if (animeBannerImage) animeBannerImage.value = '';
  animeStatus.value = 'En emisión';
  animePublishStatus.value = 'published';
  animeSortOrder.value = 0;
  animeSlug.value = '';
  setCheckedValues('anime-section', ['inicio']);
  updateAnimeImagePreview();
  saveAnimeButton.textContent = 'Guardar anime';
  cancelAnimeEditButton.classList.add('hidden');
}

function resetChapterForm() {
  editingChapter = null;
  chapterForm.reset();
  serverName.value = 'Principal';
  chapterPublishStatus.value = 'published';
  setCheckedValues('chapter-section', ['inicio']);
  setNextEpisodeNumber();
  syncAnimePickerInput();
  saveChapterButton.textContent = 'Guardar episodio';
  cancelChapterEditButton.classList.add('hidden');
}

function resetSocialForm() {
  editingSocialLink = null;
  if (!socialLinkForm) return;
  socialLinkForm.reset();
  socialSortOrder.value = 0;
  socialEnabled.value = 'true';
  saveSocialLinkButton.textContent = 'Guardar red';
  cancelSocialEditButton.classList.add('hidden');
}

function parseGenres(value) {
  return value
    .split(',')
    .map(genre => genre.trim())
    .filter(Boolean);
}

async function saveAnime(event) {
  event.preventDefault();
  setMessage(editingAnime ? 'Actualizando anime...' : 'Guardando anime...');

  const title = animeTitle.value.trim();
  const imageUrl = normalizeImagePath(animeImage.value);
  if (!imageUrl) {
    throw new Error('Escribe el nombre, ruta o URL de la portada.');
  }
  const payload = {
    titulo: title,
    image_url: imageUrl,
    banner_image: animeBannerImage ? normalizeImagePath(animeBannerImage.value) || null : null,
    descripcion: animeDescription.value.trim(),
    year: animeYear.value ? Number(animeYear.value) : null,
    estado: animeStatus.value,
    generos: parseGenres(animeGenres.value),
    slug: animeSlug.value.trim() || slugify(title),
    publish_status: animePublishStatus.value,
    sections: getAnimeSections(title),
    sort_order: animeSortOrder.value ? Number(animeSortOrder.value) : 0,
    updated_at: new Date().toISOString()
  };

  if (editingAnime) {
    await supabaseRequest(`animes?id=eq.${encodeURIComponent(editingAnime.id)}`, {
      method: 'PATCH',
      headers: {
        Prefer: 'return=representation'
      },
      body: JSON.stringify(payload)
    });

    if (editingAnime.titulo !== payload.titulo) {
      await supabaseRequest(`anime_chapters?anime_title=eq.${encodeURIComponent(editingAnime.titulo)}`, {
        method: 'PATCH',
        headers: {
          Prefer: 'return=minimal'
        },
        body: JSON.stringify({ anime_title: payload.titulo })
      });
    }
  } else {
    await supabaseRequest('animes?on_conflict=titulo', {
      method: 'POST',
      headers: {
        Prefer: 'resolution=merge-duplicates,return=representation'
      },
      body: JSON.stringify(payload)
    });
  }

  resetAnimeForm();
  setMessage('Anime guardado.', 'success');
  await refreshPanel();
  animeSelect.value = payload.titulo;
  syncAnimePickerInput();
  setNextEpisodeNumber();
  renderChaptersTable();
}

async function saveChapter(event) {
  event.preventDefault();
  commitAnimePickerValue();
  setMessage(editingChapter ? 'Actualizando episodio...' : 'Guardando...');
  if (!animeSelect.value) {
    throw new Error('Selecciona un anime valido para el episodio.');
  }

  const manualCover = normalizeImagePath(coverImage.value);
  const payload = {
    anime_title: animeSelect.value,
    chapter_number: Number(chapterNumber.value),
    embed_url: embedUrl.value.trim(),
    cover_image: manualCover || null,
    server_name: serverName.value.trim() || 'Principal',
    publish_status: cleanPublishStatus(chapterPublishStatus.value),
    sections: editingChapter
      ? cleanChapterSections(getCheckedValues('chapter-section'))
      : getNewChapterSections(getCheckedValues('chapter-section')),
    updated_at: new Date().toISOString()
  };

  if (editingChapter) {
    await supabaseRequest(`anime_chapters?id=eq.${encodeURIComponent(editingChapter.id)}`, {
      method: 'PATCH',
      headers: {
        Prefer: 'return=representation'
      },
      body: JSON.stringify(payload)
    });
  } else {
    await supabaseRequest('anime_chapters?on_conflict=anime_title,chapter_number,server_name', {
      method: 'POST',
      headers: {
        Prefer: 'resolution=merge-duplicates,return=representation'
      },
      body: JSON.stringify(payload)
    });
  }

  resetChapterForm();
  setMessage('Episodio guardado.', 'success');
  await refreshPanel();
  animeSelect.value = payload.anime_title;
  renderChaptersTable();
}

function findJsonEnd(text, startIndex) {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = startIndex; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }

  return -1;
}

function getTitleBeforeJson(text) {
  const lines = text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
  return lines[lines.length - 1] || '';
}

function getBulkImportSummary(rows) {
  const animeMap = rows.reduce((map, row) => {
    if (!map.has(row.anime_title)) {
      map.set(row.anime_title, {
        servers: 0,
        chapters: new Set(),
        covers: new Set(),
        animeCover: ''
      });
    }
    const item = map.get(row.anime_title);
    item.servers += 1;
    item.chapters.add(row.chapter_number);
    if (row.cover_image) item.covers.add(`${row.chapter_number}:${row.cover_image}`);
    if (!item.animeCover) item.animeCover = row.anime_cover || row.cover_image || '';
    return map;
  }, new Map());

  return Array.from(animeMap.entries()).map(([title, info]) => {
    const existingAnime = findExistingAnimeByTitle(title);
    return {
      title,
      servers: info.servers,
      episodes: info.chapters.size,
      covers: info.covers.size,
      animeCover: info.animeCover,
      exists: Boolean(existingAnime),
      existingTitle: existingAnime?.titulo || '',
      matches: existingAnime ? [] : findSimilarAnimeTitles(title)
    };
  });
}

function normalizeTitleForMatch(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(temporada|season|temp|capitulo|episodio)\b/g, ' ')
    .replace(/\b(1st|first|primera)\b/g, '1')
    .replace(/\b(2nd|second|segunda)\b/g, '2')
    .replace(/\b(3rd|third|tercera)\b/g, '3')
    .replace(/\b(4th|fourth|cuarta)\b/g, '4')
    .replace(/\b(5th|fifth|quinta|5ta)\b/g, '5')
    .replace(/\b(6th|sixth|sexta|6ta)\b/g, '6')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function getTitleSimilarity(a, b) {
  const left = normalizeTitleForMatch(a);
  const right = normalizeTitleForMatch(b);
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.includes(right) || right.includes(left)) {
    return Math.min(left.length, right.length) / Math.max(left.length, right.length);
  }

  const wordsA = new Set(left.split(' '));
  const wordsB = new Set(right.split(' '));
  const shared = [...wordsA].filter(word => wordsB.has(word)).length;
  const union = new Set([...wordsA, ...wordsB]).size || 1;
  return shared / union;
}

function findSimilarAnimeTitles(title) {
  return animes
    .map(anime => ({
      title: anime.titulo,
      score: getTitleSimilarity(title, anime.titulo)
    }))
    .filter(match => match.score >= 0.45 && match.title !== title)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

function findExistingAnimeByTitle(title) {
  const exactMatch = animes.find(anime => anime.titulo === title);
  if (exactMatch) return exactMatch;

  const normalizedTitle = normalizeTitleForMatch(title);
  return animes.find(anime => normalizeTitleForMatch(anime.titulo) === normalizedTitle);
}

function getMissingBulkAnimeTitles(rows) {
  return Array.from(new Set(rows.map(row => row.anime_title)))
    .filter(title => !findExistingAnimeByTitle(title));
}

function getResolvedBulkImportRows() {
  const titleMap = new Map();
  document.querySelectorAll('[data-bulk-title]').forEach(select => {
    const originalTitle = select.dataset.bulkTitle;
    const selectedTitle = select.value;
    titleMap.set(originalTitle, selectedTitle === '__create__' ? originalTitle : selectedTitle);
  });

  return pendingBulkImportRows.map(row => {
    const existingAnime = findExistingAnimeByTitle(row.anime_title);
    return {
      ...row,
      anime_title: titleMap.get(row.anime_title) || existingAnime?.titulo || row.anime_title
    };
  });
}

function makeUniqueAnimeSlug(title) {
  const baseSlug = slugify(title) || `anime-${Date.now()}`;
  const existingSlugs = new Set(animes.map(anime => anime.slug || slugify(anime.titulo)));
  if (!existingSlugs.has(baseSlug)) return baseSlug;

  let index = 2;
  let candidate = `${baseSlug}-${index}`;
  while (existingSlugs.has(candidate)) {
    index += 1;
    candidate = `${baseSlug}-${index}`;
  }
  return candidate;
}

function buildDefaultAnimePayload(title, imageUrl = '') {
  const sections = ['inicio', 'directorio'];
  if (looksLikeLatinoTitle(title)) sections.push('latino');

  return {
    titulo: title,
    image_url: imageUrl || 'images/placeholder.png',
    banner_image: null,
    descripcion: `Episodios de ${title} disponibles en AnimeFLV.`,
    year: new Date().getFullYear(),
    estado: 'En emision',
    generos: [],
    slug: makeUniqueAnimeSlug(title),
    publish_status: 'published',
    sections,
    sort_order: 0,
    updated_at: new Date().toISOString()
  };
}

function getBulkRowCover(row) {
  return row?.anime_cover || row?.cover_image || '';
}

async function createMissingBulkAnimes(rows) {
  const missingTitles = getMissingBulkAnimeTitles(rows);
  if (!missingTitles.length) return [];
  const coverByTitle = rows.reduce((map, row) => {
    const cover = getBulkRowCover(row);
    if (cover && !map.has(row.anime_title)) {
      map.set(row.anime_title, cover);
    }
    return map;
  }, new Map());

  await supabaseRequest('animes?on_conflict=titulo', {
    method: 'POST',
    headers: {
      Prefer: 'resolution=merge-duplicates,return=minimal'
    },
    body: JSON.stringify(missingTitles.map(title => buildDefaultAnimePayload(title, coverByTitle.get(title) || '')))
  });

  return missingTitles;
}

async function markBulkAnimesForHome(titles, rows = []) {
  const uniqueTitles = Array.from(new Set(titles)).filter(Boolean);
  const coverByTitle = rows.reduce((map, row) => {
    const cover = getBulkRowCover(row);
    if (cover && !map.has(row.anime_title)) {
      map.set(row.anime_title, cover);
    }
    return map;
  }, new Map());

  for (const title of uniqueTitles) {
    const anime = globalAnimes.find(item => item.titulo === title) || animes.find(item => item.titulo === title);
    const detectedSections = looksLikeLatinoTitle(title) ? ['latino'] : [];
    const sections = Array.from(new Set([...(anime?.sections || []).filter(section => section !== 'sin_inicio'), 'inicio', 'directorio', ...detectedSections]));
    const payload = {
      sections,
      publish_status: 'published',
      updated_at: new Date().toISOString()
    };
    const animeCover = coverByTitle.get(title);
    if (animeCover) {
      payload.image_url = animeCover;
    }

    await supabaseRequest(`animes?titulo=eq.${encodeURIComponent(title)}`, {
      method: 'PATCH',
      headers: {
        Prefer: 'return=minimal'
      },
      body: JSON.stringify(payload)
    });
  }
}

function parseBulkChapterImportInWorker(rawText, onProgress) {
  if (!window.Worker) {
    return Promise.reject(new Error('Worker no disponible.'));
  }

  return new Promise((resolve, reject) => {
    const worker = new Worker(BULK_IMPORT_WORKER_URL);
    worker.addEventListener('message', event => {
      const data = event.data || {};
      if (data.type === 'progress') {
        onProgress?.(data.count);
        return;
      }
      worker.terminate();
      if (data.type === 'done') {
        resolve({
          rows: data.rows || [],
          errors: data.errors || [],
          summary: getBulkImportSummary(data.rows || [])
        });
        return;
      }
      reject(new Error(data.message || 'No se pudo analizar el paquete.'));
    });
    worker.addEventListener('error', event => {
      worker.terminate();
      reject(new Error(event.message || 'No se pudo iniciar el analizador.'));
    });
    worker.postMessage({ rawText });
  });
}

async function parseBulkChapterImportFallback(rawText, onProgress) {
  const text = String(rawText || '').trim();
  const rows = [];
  const errors = [];
  let cursor = 0;
  let packageCount = 0;
  let processedChapters = 0;

  while (cursor < text.length) {
    const jsonStart = text.indexOf('{', cursor);
    if (jsonStart === -1) break;

    const jsonEnd = findJsonEnd(text, jsonStart);

    if (jsonEnd === -1) {
      errors.push(`El JSON del paquete ${packageCount + 1} no esta completo.`);
      break;
    }

    const jsonText = text.slice(jsonStart, jsonEnd + 1);
    const titleBeforeJson = getTitleBeforeJson(text.slice(cursor, jsonStart));
    let packageData;
    try {
      packageData = JSON.parse(jsonText);
    } catch (error) {
      errors.push(`JSON invalido en ${titleBeforeJson || `paquete ${packageCount + 1}`}: ${error.message}`);
      cursor = jsonEnd + 1;
      continue;
    }

    const title = titleBeforeJson
      || String(packageData.anime_title || packageData.title || packageData.titulo || '').trim();

    if (!title) {
      errors.push(`Falta el titulo antes del paquete ${packageCount + 1} o anime_title dentro del JSON.`);
      cursor = jsonEnd + 1;
      continue;
    }

    if (!Array.isArray(packageData.chapters)) {
      errors.push(`${title}: el paquete no tiene chapters.`);
      cursor = jsonEnd + 1;
      continue;
    }

    packageCount += 1;
    const animeCover = getBulkAnimeCover(packageData);
    for (let index = 0; index < packageData.chapters.length; index += 1) {
      const chapter = packageData.chapters[index];
      const chapterNumber = Number(chapter.chapter_number);
      const server = (String(chapter.server_name || '').trim() || 'Principal').slice(0, 80);
      const embed = String(chapter.embed_url || '').trim();
      const cover = getChapterCoverImage(packageData, chapter, index);

      if (!Number.isInteger(chapterNumber) || chapterNumber < 0) {
        errors.push(`${title}: chapter_number invalido en item ${index + 1}.`);
        continue;
      }

      if (!/^https:\/\//i.test(embed)) {
        errors.push(`${title} ep ${chapterNumber} ${server}: link embed invalido.`);
        continue;
      }

      rows.push({
        anime_title: title,
        chapter_number: chapterNumber,
        server_name: server,
        embed_url: embed,
        cover_image: cover || null,
        downloads: normalizeDownloadLinks(chapter.downloads || chapter.download_links || chapter.descargas),
        anime_cover: animeCover || null,
        publish_status: cleanPublishStatus(chapter.publish_status),
        sections: getNewChapterSections(chapter.sections),
        updated_at: new Date().toISOString()
      });
      processedChapters += 1;

      if (processedChapters % BULK_IMPORT_UI_CHUNK_SIZE === 0) {
        onProgress?.(processedChapters);
        await yieldToBrowser();
      }
    }

    cursor = jsonEnd + 1;
    await yieldToBrowser();
  }

  if (!rows.length && !errors.length) {
    errors.push('No encontre ningun paquete JSON para importar.');
  }

  return {
    rows,
    errors,
    summary: getBulkImportSummary(rows)
  };
}

async function parseBulkChapterImport(rawText, onProgress) {
  try {
    return await parseBulkChapterImportInWorker(rawText, onProgress);
  } catch (error) {
    console.warn('Analizador en Worker no disponible, usando fallback:', error.message || error);
    return parseBulkChapterImportFallback(rawText, onProgress);
  }
}

async function analyzeBulkChapterImport() {
  pendingBulkImportRows = [];
  if (importBulkChaptersButton) importBulkChaptersButton.disabled = true;
  if (analyzeBulkImportButton) analyzeBulkImportButton.disabled = true;
  setBulkImportPreview('');
  setMessage('Analizando paquetes en tandas...');

  const result = await parseBulkChapterImport(bulkImportInput?.value || '', count => {
    setMessage(`Analizando... ${count} servidores revisados.`);
  });
  pendingBulkImportRows = result.errors.length ? [] : result.rows;

  if (importBulkChaptersButton) {
    importBulkChaptersButton.disabled = pendingBulkImportRows.length === 0;
  }
  if (analyzeBulkImportButton) analyzeBulkImportButton.disabled = false;

  const summaryRows = result.summary.map(item => {
    const destination = item.exists
      ? item.existingTitle === item.title
        ? 'Existe'
        : `Existe como: ${escapeHTML(item.existingTitle)}`
      : item.matches.length
        ? `<select class="bulk-title-select" data-bulk-title="${escapeHTML(item.title)}">
            ${item.matches.map(match => `<option value="${escapeHTML(match.title)}">Usar: ${escapeHTML(match.title)}</option>`).join('')}
            <option value="__create__">Crear nuevo: ${escapeHTML(item.title)}</option>
          </select>`
        : '<small class="bulk-warning">Se creara automaticamente</small>';

    return `
    <tr>
      <td>${escapeHTML(item.title)}</td>
      <td>${escapeHTML(item.episodes)}</td>
      <td>${escapeHTML(item.servers)}</td>
      <td>${item.covers ? `${escapeHTML(item.covers)} detectadas` : '<small>Automaticas</small>'}</td>
      <td>${item.animeCover ? '<small>Portada detectada</small>' : '<small>Sin portada</small>'}</td>
      <td>${destination}</td>
    </tr>
  `;
  }).join('');

  const errorsHtml = result.errors.length
    ? `<div class="bulk-import-errors">${result.errors.map((error, i) => `<p>${escapeHTML(error)} <button class="bulk-fix" data-error-index="${i}">Corregir</button> <button class="bulk-remove" data-error-index="${i}">Borrar entrada</button></p>`).join('')}</div>`
    : '';

  const tableHtml = result.summary.length
    ? `<div class="admin-table-wrap bulk-import-table">
        <table class="admin-table">
          <thead>
            <tr>
              <th>Anime</th>
              <th>Episodios</th>
              <th>Servidores</th>
              <th>Miniaturas</th>
              <th>Portada</th>
              <th>Destino</th>
            </tr>
          </thead>
          <tbody>${summaryRows}</tbody>
        </table>
      </div>`
    : '';

  setBulkImportPreview(`${errorsHtml}${tableHtml}`);

  // Añadir manejador para botones "Ir al error" y funciones de localización
  (function attachBulkErrorHandlers() {
    function setTextareaSelection(start, end) {
      if (!bulkImportInput) return;
      bulkImportInput.focus();
      bulkImportInput.setSelectionRange(start, end);
      // scroll to selection
      const lines = bulkImportInput.value.slice(0, start).split(/\r?\n/).length - 1;
      const lineHeight = 18; // approximate
      bulkImportInput.scrollTop = Math.max(0, (lines - 3) * lineHeight);
    }

    function findJsonBlockAround(index) {
      const text = bulkImportInput?.value || '';
      // find previous '{'
      let start = text.lastIndexOf('{', index);
      if (start === -1) start = text.indexOf('{');
      if (start === -1) return null;
      const end = findJsonEnd(text, start);
      if (end === -1) return null;
      return { start, end: end + 1 };
    }

    function locateErrorInInput(error) {
      const text = bulkImportInput?.value || '';
      if (!text) return null;

      // JSON invalido -> buscar por titulo antes del JSON
      const jsonInvalidMatch = error.match(/JSON invalido en (.+?):/i);
      if (jsonInvalidMatch) {
        const title = jsonInvalidMatch[1].trim();
        const titleIndex = text.indexOf(title);
        if (titleIndex !== -1) {
          const braceIndex = text.indexOf('{', titleIndex);
          if (braceIndex !== -1) {
            const end = findJsonEnd(text, braceIndex);
            if (end !== -1) return { start: braceIndex, end: end + 1 };
          }
        }
      }

      // chapter_number invalido -> buscar item por chapter_number dentro de paquete
      const chapterNumMatch = error.match(/chapter_number invalido en item (\d+)/i) || error.match(/chapter_number invalido en item (\d+)/i);
      if (chapterNumMatch) {
        const itemIdx = Number(chapterNumMatch[1]) - 1;
        // try to find nth 'chapter_number' occurrence
        let idx = -1, count = 0;
        const re = /"chapter_number"\s*:\s*\d+/g;
        let m;
        while ((m = re.exec(text)) !== null) {
          if (count === itemIdx) { idx = m.index; break; }
          count += 1;
        }
        if (idx !== -1) {
          const block = findJsonBlockAround(idx);
          if (block) return block;
        }
      }

      // link embed invalido -> formato: "<title> ep <num> <server>: link embed invalido."
      const embedMatch = error.match(/^(.*?) ep (\d+) (.*?): link embed invalido\./i);
      if (embedMatch) {
        const title = embedMatch[1].trim();
        const chapterNumber = embedMatch[2];
        const titleIndex = text.indexOf(title);
        if (titleIndex !== -1) {
          // search for "chapter_number":<chapterNumber> after titleIndex
          const re = new RegExp('"chapter_number"\\s*:\\s*' + chapterNumber);
          const m = re.exec(text.slice(titleIndex));
          if (m) {
            const absoluteIndex = titleIndex + m.index;
            const block = findJsonBlockAround(absoluteIndex);
            if (block) return block;
          }
        }
        // fallback: search for first occurrence of chapter_number
        const re2 = new RegExp('"chapter_number"\\s*:\\s*' + chapterNumber);
        const m2 = re2.exec(text);
        if (m2) {
          const block = findJsonBlockAround(m2.index);
          if (block) return block;
        }
      }

      // fallback: seleccionar todo
      return { start: 0, end: Math.min(2000, text.length) };
    }

    function removeRange(text, start, end) {
      let before = text.slice(0, start);
      let after = text.slice(end);
      before = before.replace(/\s*$/, '');
      after = after.replace(/^\s*/, '');
      if (/,$/.test(before)) {
        before = before.replace(/,\s*$/, '');
      } else if (/^,/.test(after)) {
        after = after.replace(/^,\s*/, '');
      }
      return `${before}${after}`;
    }

    function removeInvalidEntry(error) {
      const text = bulkImportInput?.value || '';
      if (!text) return;
      const block = locateErrorInInput(error);
      if (!block) return;
      const updated = removeRange(text, block.start, block.end);
      bulkImportInput.value = updated;
      bulkImportInput.focus();
      const pos = Math.max(0, block.start - 1);
      bulkImportInput.setSelectionRange(pos, pos);
    }

    async function onBulkActionClick(evt) {
      const fixBtn = evt.target.closest && evt.target.closest('.bulk-fix');
      const removeBtn = evt.target.closest && evt.target.closest('.bulk-remove');
      if (!fixBtn && !removeBtn) return;
      const idx = Number((fixBtn || removeBtn).getAttribute('data-error-index'));
      const error = result.errors[idx];
      if (!error) return;

      if (fixBtn) {
        const block = locateErrorInInput(error);
        if (block) setTextareaSelection(block.start, block.end);
        return;
      }

      if (removeBtn) {
        removeInvalidEntry(error);
        await analyzeBulkChapterImport();
      }
    }

    const preview = bulkImportPreview;
    if (preview) {
      const previousHandler = preview._bulkErrorHandler;
      if (previousHandler) {
        preview.removeEventListener('click', previousHandler);
      }
      preview._bulkErrorHandler = onBulkActionClick;
      preview.addEventListener('click', onBulkActionClick);
    }
  })();

  if (result.errors.length) {
    setMessage('Hay errores en el texto pegado. Revisa la vista previa.', 'error');
    return;
  }

  const suggestedCount = result.summary.filter(item => !item.exists && item.matches.length).length;
  const missingCount = result.summary.filter(item => !item.exists && !item.matches.length).length;
  const suggestedText = suggestedCount ? ` Revisa ${suggestedCount} coincidencias sugeridas.` : '';
  const missingText = missingCount ? ` ${missingCount} animes se crearan automaticamente.` : '';
  setMessage(`Analisis listo: ${result.rows.length} servidores en ${result.summary.length} animes.${suggestedText}${missingText}`, 'success');
}

async function importBulkChapters(event) {
  event.preventDefault();

  if (!pendingBulkImportRows.length) {
    await analyzeBulkChapterImport();
  }

  if (!pendingBulkImportRows.length) return;

  importBulkChaptersButton.disabled = true;
  if (analyzeBulkImportButton) analyzeBulkImportButton.disabled = true;
  const resolvedRows = getResolvedBulkImportRows();
  setMessage(`Preparando importacion de ${resolvedRows.length} servidores...`);

  const createdTitles = await createMissingBulkAnimes(resolvedRows);
  const importedTitles = Array.from(new Set(resolvedRows.map(row => row.anime_title)));
  await markBulkAnimesForHome(importedTitles, resolvedRows);

  if (createdTitles.length) {
    setMessage(`Creados ${createdTitles.length} animes faltantes. Importando servidores...`);
  } else {
    setMessage(`Importando ${pendingBulkImportRows.length} servidores...`);
  }

  const batchSize = 400;
  for (let index = 0; index < resolvedRows.length; index += batchSize) {
    const slice = resolvedRows.slice(index, index + batchSize);

    // Evitar enviar filas duplicadas dentro del mismo comando POST.
    // Si hay varias entradas con la misma clave, mantener la última encontrada.
    const seen = new Map();
    slice.forEach(item => {
      const key = `${item.anime_title}::${item.chapter_number}::${item.server_name || ''}`;
      seen.set(key, item);
    });

    const batch = Array.from(seen.values()).map(({ anime_cover, ...row }) => row);
    setMessage(`Importando servidores ${index + 1}-${Math.min(index + batch.length, resolvedRows.length)} de ${resolvedRows.length}...`);
    await supabaseRequest('anime_chapters?on_conflict=anime_title,chapter_number,server_name', {
      method: 'POST',
      headers: {
        Prefer: 'resolution=merge-duplicates,return=minimal'
      },
      body: JSON.stringify(batch)
    });
    await yieldToBrowser();
  }

  const firstTitle = importedTitles[0] || animeSelect.value;
  pendingBulkImportRows = [];
  if (bulkImportInput) bulkImportInput.value = '';
  setBulkImportPreview('');

  await refreshPanel();
  if (firstTitle && animes.some(anime => anime.titulo === firstTitle)) {
    animeSelect.value = firstTitle;
    renderAnimesTable();
    renderChaptersTable();
  }

  const createdText = createdTitles.length ? ` ${createdTitles.length} animes fueron creados con portada provisional.` : '';
  setMessage(`Importacion lista: ${importedTitles.length} animes actualizados.${createdText}`, 'success');
  if (analyzeBulkImportButton) analyzeBulkImportButton.disabled = false;
}

async function saveSocialIntro(event) {
  event.preventDefault();
  setMessage('Guardando texto de redes...');
  await supabaseRequest('site_settings?on_conflict=key', {
    method: 'POST',
    headers: {
      Prefer: 'resolution=merge-duplicates,return=minimal'
    },
    body: JSON.stringify({
      key: 'social_intro',
      value: { text: socialIntroText.value.trim() },
      updated_at: new Date().toISOString()
    })
  });
  setMessage('Texto de redes guardado.', 'success');
}

async function saveSocialLink(event) {
  event.preventDefault();
  setMessage(editingSocialLink ? 'Actualizando red...' : 'Guardando red...');

  const payload = {
    title: socialTitle.value.trim(),
    url: socialUrl.value.trim(),
    sort_order: socialSortOrder.value ? Number(socialSortOrder.value) : 0,
    enabled: socialEnabled.value === 'true',
    updated_at: new Date().toISOString()
  };

  if (editingSocialLink) {
    await supabaseRequest(`social_links?id=eq.${encodeURIComponent(editingSocialLink.id)}`, {
      method: 'PATCH',
      headers: {
        Prefer: 'return=representation'
      },
      body: JSON.stringify(payload)
    });
  } else {
    await supabaseRequest('social_links', {
      method: 'POST',
      headers: {
        Prefer: 'return=representation'
      },
      body: JSON.stringify(payload)
    });
  }

  resetSocialForm();
  setMessage('Red guardada.', 'success');
  await loadSocialContent();
  renderSocialLinksTable();
}

function editSocialLink(id) {
  const link = socialLinks.find(item => item.id === id);
  if (!link) return;

  editingSocialLink = link;
  socialTitle.value = link.title || '';
  socialUrl.value = link.url || '';
  socialSortOrder.value = link.sort_order || 0;
  socialEnabled.value = link.enabled ? 'true' : 'false';
  saveSocialLinkButton.textContent = 'Actualizar red';
  cancelSocialEditButton.classList.remove('hidden');
  socialUrl.focus();
}

async function deleteSocialLink(id) {
  setMessage('Borrando red...');
  await supabaseRequest(`social_links?id=eq.${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: {
      Prefer: 'return=minimal'
    }
  });
  resetSocialForm();
  setMessage('Red borrada.', 'success');
  await loadSocialContent();
  renderSocialLinksTable();
}

async function deleteChapter(id) {
  setMessage('Borrando...');
  await supabaseRequest(`anime_chapters?id=eq.${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: {
      Prefer: 'return=minimal'
    }
  });
  setMessage('Episodio borrado.', 'success');
  await refreshPanel();
}

async function deleteAnime(id) {
  setMessage('Borrando anime...');
  const anime = globalAnimes.find(item => String(item.id) === String(id));
  if (anime) {
    await supabaseRequest(`anime_chapters?anime_title=eq.${encodeURIComponent(anime.titulo)}`, {
      method: 'DELETE',
      headers: {
        Prefer: 'return=minimal'
      }
    });
  }
  await supabaseRequest(`animes?id=eq.${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: {
      Prefer: 'return=minimal'
    }
  });
  setMessage('Anime borrado.', 'success');
  await refreshPanel();
}

async function moveAnimeToDirectory(id) {
  const anime = globalAnimes.find(item => item.id === id);
  const sections = Array.from(new Set([...(anime?.sections || []), 'directorio']));

  setMessage('Agregando anime a Directorio...');
  await supabaseRequest(`animes?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: {
      Prefer: 'return=minimal'
    },
    body: JSON.stringify({
      sections,
      updated_at: new Date().toISOString()
    })
  });
  setMessage('Anime agregado a Directorio.', 'success');
  await refreshPanel();
}

async function saveCarouselItem(event) {
  event.preventDefault();
  
  // Obtener el valor del banner ANTES de sobrescribir el formulario
  const typedBannerImage = normalizeImagePath(carouselBannerImage?.value || '');
  
  commitCarouselPickerValue();

  const anime = globalAnimes.find(item => item.titulo === selectedCarouselAnimeTitle);
  if (!anime) {
    throw new Error('Selecciona un anime valido para el carrusel.');
  }

  const bannerImage = typedBannerImage || anime.banner_image || anime.image_url || null;

  setMessage('Guardando banner...');
  const updatedRows = await supabaseRequest(`animes?id=eq.${encodeURIComponent(anime.id)}`, {
    method: 'PATCH',
    headers: {
      Prefer: 'return=representation'
    },
    body: JSON.stringify({
      banner_image: bannerImage,
      updated_at: new Date().toISOString()
    })
  });

  if (updatedRows?.[0]) {
    const index = globalAnimes.findIndex(item => item.id === anime.id);
    if (index >= 0) globalAnimes[index] = updatedRows[0];
  }

  resetCarouselForm();
  setMessage(`Banner guardado. Ahora usa "Mostrar" para agregarlo al carrusel.`, 'success');
  await refreshPanel();
}

function resetCarouselForm() {
  selectedCarouselAnimeTitle = '';
  if (carouselForm) carouselForm.reset();
  syncCarouselSizeControls();
  carouselPickerResults?.classList.add('hidden');
}

async function setCarouselVisibility(id, visible) {
  const anime = globalAnimes.find(item => item.id === id);
  if (!anime) return;

  const visibleCount = globalAnimes.filter(item => (item.sections || []).includes('destacados')).length;
  const alreadyVisible = (anime.sections || []).includes('destacados');
  if (visible && !alreadyVisible && visibleCount >= CAROUSEL_LIMIT) {
    throw new Error(`El carrusel ya tiene ${CAROUSEL_LIMIT} animes visibles. Oculta uno antes de agregar otro.`);
  }

  const sections = visible
    ? Array.from(new Set([...(anime.sections || []), 'destacados']))
    : (anime.sections || []).filter(section => section !== 'destacados');
  const payload = {
    sections,
    updated_at: new Date().toISOString()
  };

  if (!visible && anime.banner_image === anime.image_url) {
    payload.banner_image = null;
  }
  if (visible && !anime.banner_image) {
    payload.banner_image = anime.image_url || null;
  }
  if (visible && selectedCarouselAnimeTitle === anime.titulo) {
    const typedBannerImage = normalizeImagePath(carouselBannerImage?.value || '');
    if (typedBannerImage) payload.banner_image = typedBannerImage;
  }

  setMessage(visible ? 'Mostrando anime en carrusel...' : 'Ocultando anime del carrusel...');
  const updatedRows = await supabaseRequest(`animes?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: {
      Prefer: 'return=representation'
    },
    body: JSON.stringify(payload)
  });

  if (updatedRows?.[0]) {
    const index = globalAnimes.findIndex(item => item.id === id);
    if (index >= 0) globalAnimes[index] = updatedRows[0];
  }

  setMessage(visible ? 'Anime visible en carrusel.' : 'Anime oculto del carrusel.', 'success');
  await refreshPanel();
}

async function clearCarouselBanner(id) {
  setMessage('Quitando banner del anime...');
  await supabaseRequest(`animes?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: {
      Prefer: 'return=minimal'
    },
    body: JSON.stringify({
      banner_image: null,
      updated_at: new Date().toISOString()
    })
  });

  setMessage('Banner quitado. Si sigue visible, usara la portada del anime.', 'success');
  await refreshPanel();
}

function editAnime(title) {
  const anime = globalAnimes.find(item => item.titulo === title);
  if (!anime) return;

  editingAnime = anime;
  animeSelect.value = anime.titulo;
  syncAnimePickerInput();
  animeTitle.value = anime.titulo;
  animeImage.value = anime.image_url;
  if (animeBannerImage) animeBannerImage.value = anime.banner_image || '';
  updateAnimeImagePreview();
  animeDescription.value = anime.descripcion || '';
  animeYear.value = anime.year || '';
  animeStatus.value = anime.estado || 'En emisión';
  animePublishStatus.value = anime.publish_status || 'published';
  animeSortOrder.value = anime.sort_order || 0;
  animeSlug.value = anime.slug || slugify(anime.titulo);
  animeGenres.value = (anime.generos || []).join(', ');
  setCheckedValues('anime-section', anime.sections || []);
  syncLatinoSectionFromTitle();
  saveAnimeButton.textContent = 'Actualizar anime';
  cancelAnimeEditButton.classList.remove('hidden');
  if (adminChapterSearch) adminChapterSearch.value = '';
  setNextEpisodeNumber();
  renderAnimesTable();
  renderChaptersTable();
  setMessage(`Editando anime. Abajo tienes sus episodios para editar.`, 'success');
  animeTitle.focus();
}

function manageAnimeChapters(title) {
  const anime = globalAnimes.find(item => item.titulo === title);
  if (!anime) return;

  selectAnimeForChapter(anime.titulo);
  if (adminChapterSearch) adminChapterSearch.value = '';
  resetChapterForm();
  renderAnimesTable();
  renderChaptersTable();
  document.getElementById('chapter-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  setMessage(`Capitulos de ${anime.titulo}: usa la tabla de abajo para editar, duplicar, ver o borrar.`, 'success');
}

function editChapter(id) {
  const chapter = globalChapters.find(item => item.id === id);
  if (!chapter) return;

  editingChapter = chapter;
  animeSelect.value = chapter.anime_title;
  syncAnimePickerInput();
  chapterNumber.value = chapter.chapter_number;
  serverName.value = chapter.server_name || 'Principal';
  embedUrl.value = chapter.embed_url || '';
  coverImage.value = chapter.cover_image || '';
  chapterPublishStatus.value = chapter.publish_status || 'published';
  setCheckedValues('chapter-section', chapter.sections || []);
  saveChapterButton.textContent = 'Actualizar episodio';
  cancelChapterEditButton.classList.remove('hidden');
  renderChaptersTable();
  chapterNumber.focus();
}

function duplicateChapter(id) {
  const chapter = globalChapters.find(item => item.id === id);
  if (!chapter) return;

  editingChapter = null;
  animeSelect.value = chapter.anime_title;
  syncAnimePickerInput();
  setNextEpisodeNumber();
  serverName.value = chapter.server_name || 'Principal';
  embedUrl.value = chapter.embed_url || '';
  coverImage.value = chapter.cover_image || '';
  chapterPublishStatus.value = chapter.publish_status || 'published';
  setCheckedValues('chapter-section', chapter.sections || []);
  saveChapterButton.textContent = 'Guardar episodio';
  cancelChapterEditButton.classList.add('hidden');
  setMessage('Episodio duplicado en el formulario. Cambia numero/link y guarda.', 'success');
  chapterNumber.focus();
}

function viewAnimeBySlug(slug) {
  window.open(`/anime/${encodeURIComponent(slug)}`, '_blank', 'noopener');
}

function viewChapter(id) {
  const chapter = globalChapters.find(item => item.id === id);
  const anime = animes.find(item => item.titulo === chapter?.anime_title);
  const chapters = globalChapters
    .filter(item => item.anime_title === chapter?.anime_title)
    .sort((a, b) => Number(a.chapter_number) - Number(b.chapter_number));
  const chapterIndex = chapters.findIndex(item => item.id === id);
  const slug = anime ? (anime.slug || slugify(anime.titulo)) : '';
  const selectedChapter = chapterIndex >= 0 ? chapters[chapterIndex] : null;
  const chapterNumber = selectedChapter?.chapter_number ?? selectedChapter?.numero;
  const url = slug && chapterNumber
    ? `/ver/${encodeURIComponent(slug)}-episodio-${encodeURIComponent(String(chapterNumber))}`
    : (slug ? `/anime/${encodeURIComponent(slug)}` : '/');
  window.open(url, '_blank', 'noopener');
}

function generateSitemapUrls() {
  const urls = ['https://animeflv.lat/'];
  globalAnimes
    .filter(anime => (anime.publish_status || 'published') === 'published')
    .forEach(anime => {
      const slug = anime.slug || slugify(anime.titulo);
      urls.push(`https://animeflv.lat/anime/${slug}`);
      globalChapters
        .filter(chapter => chapter.anime_title === anime.titulo && (chapter.publish_status || 'published') === 'published')
        .forEach(chapter => {
          urls.push(`https://animeflv.lat/ver/${slug}-episodio-${encodeURIComponent(String(chapter.chapter_number))}`);
        });
    });
  sitemapOutput.value = Array.from(new Set(urls)).join('\n');
}

async function updateEpisodeReportStatus(id, status) {
  await supabaseRequest(`episode_reports?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: {
      Prefer: 'return=representation'
    },
    body: JSON.stringify({ status })
  });
  await loadEpisodeReports();
  renderEpisodeReportsTable();
  setMessage(`Reporte marcado como ${getReportStatusLabel(status).toLowerCase()}.`, 'success');
}

async function deleteEpisodeReport(id) {
  setMessage('Eliminando reporte...');
  await supabaseRequest(`episode_reports?id=eq.${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: {
      Prefer: 'return=minimal'
    }
  });
  await loadEpisodeReports();
  renderEpisodeReportsTable();
  setMessage('Reporte eliminado.', 'success');
}

async function editEpisodeReport(id) {
  const report = episodeReports.find(item => item.id === id);
  if (!report) return;

  const newReason = window.prompt('Editar motivo del reporte:', report.reason || '');
  if (newReason === null) return;

  const resolved = window.confirm('¿Marcar como revisado? Aceptar = sí, Cancelar = no.');
  const newStatus = resolved ? 'resolved' : report.status || 'open';

  await supabaseRequest(`episode_reports?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: {
      Prefer: 'return=representation'
    },
    body: JSON.stringify({ reason: newReason.trim() || report.reason, status: newStatus })
  });

  await loadEpisodeReports();
  renderEpisodeReportsTable();
  setMessage('Reporte actualizado.', 'success');
}

async function deleteReportedServer(id) {
  const report = episodeReports.find(item => item.id === id);
  if (!report) {
    throw new Error('Reporte no encontrado.');
  }

  const filters = [];
  if (report.anime_title) filters.push(`anime_title=eq.${encodeURIComponent(report.anime_title)}`);
  if (report.chapter_number != null) filters.push(`chapter_number=eq.${encodeURIComponent(report.chapter_number)}`);
  if (report.server_name) filters.push(`server_name=eq.${encodeURIComponent(report.server_name)}`);

  if (!filters.length) {
    throw new Error('No hay datos suficientes para eliminar el servidor.');
  }

  setMessage('Eliminando servidor reportado...');
  await supabaseRequest(`anime_chapters?${filters.join('&')}`, {
    method: 'DELETE',
    headers: {
      Prefer: 'return=minimal'
    }
  });
  await refreshPanel();
  setMessage('Servidor eliminado. Si era el único servidor, el episodio se perdió.', 'success');
}

async function initAdmin() {
  try {
    const session = getAdminSession();
    if (!session?.access_token || !session?.user?.id) {
      throw new Error('Inicia sesión para administrar.');
    }
    await verifyAdminUser(session.user.id);
    await refreshPanel();
  } catch (error) {
    clearAdminSession();
    adminContent.classList.add('hidden');
    adminLock.classList.remove('hidden');
    setMessage(`Error: ${error.message}`, 'error');
    lockMessage.textContent = error.message;
  }
}

async function unlockAdmin() {
  const emailInput = document.getElementById('admin-email');
  const passwordInput = document.getElementById('admin-password');
  const email = emailInput.value.trim();
  const password = passwordInput.value;

  if (!email || !password) {
    lockMessage.textContent = 'Escribe tu email y contraseña.';
    return;
  }

  lockMessage.textContent = 'Entrando...';
  await signInAdmin(email, password);
  passwordInput.value = '';
  lockMessage.textContent = '';
  adminLock.classList.add('hidden');
  adminContent.classList.remove('hidden');
  await initAdmin();
}

document.getElementById('unlock-admin').addEventListener('click', () => {
  unlockAdmin().catch(error => {
    clearAdminSession();
    lockMessage.textContent = error.message;
  });
});
document.getElementById('lock-admin').addEventListener('click', () => {
  clearAdminSession();
  adminContent.classList.add('hidden');
  adminLock.classList.remove('hidden');
});

animeSelect.addEventListener('change', () => {
  syncAnimePickerInput();
  setNextEpisodeNumber();
  renderAnimesTable();
  renderChaptersTable();
});
animeSearchPicker?.addEventListener('input', renderAnimePickerResults);
animeSearchPicker?.addEventListener('focus', renderAnimePickerResults);
animeSearchPicker?.addEventListener('keydown', event => {
  if (event.key === 'Enter') {
    event.preventDefault();
    commitAnimePickerValue();
  }
  if (event.key === 'Escape') {
    animePickerResults?.classList.add('hidden');
    syncAnimePickerInput();
  }
});
animeSearchPicker?.addEventListener('blur', () => {
  setTimeout(() => {
    if (document.activeElement?.dataset?.animePicker) return;
    commitAnimePickerValue();
  }, 120);
});
animePickerResults?.addEventListener('mousedown', event => {
  const title = event.target.closest('[data-anime-picker]')?.dataset.animePicker;
  if (!title) return;
  event.preventDefault();
  selectAnimeForChapter(title);
  animePickerResults.classList.add('hidden');
});

carouselAnimeSearch?.addEventListener('input', () => {
  selectedCarouselAnimeTitle = '';
  renderCarouselPickerResults();
});
carouselAnimeSearch?.addEventListener('focus', renderCarouselPickerResults);

// Vista previa de imagen del carrusel
carouselBannerImage?.addEventListener('input', function() {
  const url = this.value.trim();
  const preview = document.getElementById('carousel-banner-preview');
  if (!preview) return;
  
  if (!url) {
    preview.classList.add('hidden');
    preview.innerHTML = '';
    return;
  }
  
  const img = document.createElement('img');
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    preview.innerHTML = '';
    preview.appendChild(img);
    preview.classList.remove('hidden');
  };
  img.onerror = () => {
    preview.innerHTML = '<p style="padding: 8px; color: #ff6b6b;">❌ No se pudo cargar la imagen</p>';
    preview.classList.remove('hidden');
  };
  img.src = url;
});
carouselAnimeSearch?.addEventListener('keydown', event => {
  if (event.key === 'Enter') {
    event.preventDefault();
    commitCarouselPickerValue();
  }
  if (event.key === 'Escape') {
    carouselPickerResults?.classList.add('hidden');
  }
});
carouselAnimeSearch?.addEventListener('blur', () => {
  setTimeout(() => commitCarouselPickerValue(), 120);
});
carouselPickerResults?.addEventListener('mousedown', event => {
  const title = event.target.closest('[data-carousel-picker]')?.dataset.carouselPicker;
  if (!title) return;
  event.preventDefault();
  selectCarouselAnime(title);
  carouselPickerResults.classList.add('hidden');
});
serverDeleteSearch?.addEventListener('input', renderServerDeleteTable);
serverDeleteEpisodeSearch?.addEventListener('input', renderServerDeleteTable);
serverDeleteServerSearch?.addEventListener('input', renderServerDeleteTable);
carouselImageSizeInput?.addEventListener('input', () => {
  carouselSettings.imageSize = getCarouselImageSizeValue();
  syncCarouselSizeControls();
});

animeImage.addEventListener('input', updateAnimeImagePreview);
animeTitle.addEventListener('input', () => {
  if (!editingAnime && !animeSlug.value.trim()) {
    animeSlug.value = slugify(animeTitle.value);
  }
  syncLatinoSectionFromTitle();
});
if (adminAnimeSearch) {
  adminAnimeSearch.addEventListener('input', renderAnimesTable);
}
if (adminChapterSearch) {
  adminChapterSearch.addEventListener('input', renderChaptersTable);
}
if (serverDeleteSearch) {
  serverDeleteSearch.addEventListener('input', renderServerDeleteTable);
}
document.getElementById('generate-sitemap')?.addEventListener('click', generateSitemapUrls);
refreshReportsButton?.addEventListener('click', () => {
  loadEpisodeReports()
    .then(renderEpisodeReportsTable)
    .then(() => setMessage('Reportes actualizados.', 'success'))
    .catch(error => setMessage(`Error: ${error.message}`, 'error'));
});
document.getElementById('clear-cover-image')?.addEventListener('click', () => {
  coverImage.value = '';
  setMessage('La portada del episodio quedara automatica al guardar.', 'success');
});

analyzeBulkImportButton?.addEventListener('click', () => {
  analyzeBulkChapterImport().catch(error => {
    if (analyzeBulkImportButton) analyzeBulkImportButton.disabled = false;
    if (importBulkChaptersButton) importBulkChaptersButton.disabled = pendingBulkImportRows.length === 0;
    setMessage(`Error: ${error.message}`, 'error');
  });
});
clearBulkImportButton?.addEventListener('click', () => {
  pendingBulkImportRows = [];
  if (bulkImportInput) bulkImportInput.value = '';
  if (importBulkChaptersButton) importBulkChaptersButton.disabled = true;
  setBulkImportPreview('');
  setMessage('Importador limpio.', 'success');
});
bulkImportInput?.addEventListener('input', () => {
  pendingBulkImportRows = [];
  if (importBulkChaptersButton) importBulkChaptersButton.disabled = true;
});
bulkImportForm?.addEventListener('submit', event => {
  importBulkChapters(event).catch(error => {
    if (analyzeBulkImportButton) analyzeBulkImportButton.disabled = false;
    if (importBulkChaptersButton) importBulkChaptersButton.disabled = pendingBulkImportRows.length === 0;
    setMessage(`Error: ${error.message}`, 'error');
  });
});

chapterForm.addEventListener('submit', event => {
  saveChapter(event).catch(error => setMessage(`Error: ${error.message}`, 'error'));
});

animeForm.addEventListener('submit', event => {
  saveAnime(event).catch(error => setMessage(`Error: ${error.message}`, 'error'));
});

socialIntroForm?.addEventListener('submit', event => {
  saveSocialIntro(event).catch(error => setMessage(`Error: ${error.message}`, 'error'));
});

socialLinkForm?.addEventListener('submit', event => {
  saveSocialLink(event).catch(error => setMessage(`Error: ${error.message}`, 'error'));
});

carouselForm?.addEventListener('submit', event => {
  saveCarouselItem(event).catch(error => setMessage(`Error: ${error.message}`, 'error'));
});
clearCarouselFormButton?.addEventListener('click', () => {
  resetCarouselForm();
  setMessage('Formulario de carrusel limpio.', 'success');
});
saveCarouselSettingsButton?.addEventListener('click', () => {
  saveCarouselSettings().catch(error => setMessage(`Error: ${error.message}`, 'error'));
});

cancelAnimeEditButton.addEventListener('click', resetAnimeForm);
cancelChapterEditButton.addEventListener('click', resetChapterForm);
cancelSocialEditButton?.addEventListener('click', resetSocialForm);

socialLinksTable?.addEventListener('click', event => {
  const editId = event.target.dataset.editSocial;
  const deleteId = event.target.dataset.deleteSocial;

  if (editId) {
    editSocialLink(editId);
  }
  if (deleteId) {
    deleteSocialLink(deleteId).catch(error => setMessage(`Error: ${error.message}`, 'error'));
  }
});

reportsTable?.addEventListener('click', event => {
  const viewUrl = event.target.dataset.viewReport;
  const reportId = event.target.dataset.reportStatus;
  const status = event.target.dataset.status;
  const deleteReportId = event.target.dataset.deleteReport;
  const editReportId = event.target.dataset.editReport;
  const deleteServerReportId = event.target.dataset.deleteReportServer;
  const goServerDeleteReportId = event.target.dataset.goServerDelete;

  if (viewUrl) {
    window.open(viewUrl, '_blank', 'noopener');
  }
  if (reportId && status) {
    updateEpisodeReportStatus(reportId, status).catch(error => setMessage(`Error: ${error.message}`, 'error'));
  }
  if (deleteReportId) {
    deleteEpisodeReport(deleteReportId).catch(error => setMessage(`Error: ${error.message}`, 'error'));
  }
  if (editReportId) {
    editEpisodeReport(editReportId).catch(error => setMessage(`Error: ${error.message}`, 'error'));
  }
  if (deleteServerReportId) {
    deleteReportedServer(deleteServerReportId).catch(error => setMessage(`Error: ${error.message}`, 'error'));
  }
  if (goServerDeleteReportId) {
    const report = episodeReports.find(item => item.id === goServerDeleteReportId);
    if (report) {
      goToServerDeleteSection(report.chapter_number, report.server_name);
    }
  }
});

carouselTable?.addEventListener('click', event => {
  const selectTitle = event.target.dataset.carouselSelect;
  const hideId = event.target.dataset.carouselHide;
  const showId = event.target.dataset.carouselShow;
  const clearBannerId = event.target.dataset.carouselClearBanner;

  if (selectTitle) {
    selectCarouselAnime(selectTitle);
    carouselForm?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  if (hideId) {
    setCarouselVisibility(hideId, false).catch(error => setMessage(`Error: ${error.message}`, 'error'));
  }
  if (showId) {
    setCarouselVisibility(showId, true).catch(error => setMessage(`Error: ${error.message}`, 'error'));
  }
  if (clearBannerId) {
    clearCarouselBanner(clearBannerId).catch(error => setMessage(`Error: ${error.message}`, 'error'));
  }
});

chaptersTable.addEventListener('click', event => {
  const editId = event.target.dataset.editChapter;
  const duplicateId = event.target.dataset.duplicateChapter;
  const viewId = event.target.dataset.viewChapter;
  const deleteId = event.target.dataset.id;

  if (editId) {
    editChapter(editId);
  }
  if (duplicateId) {
    duplicateChapter(duplicateId);
  }
  if (viewId) {
    viewChapter(viewId);
  }
  if (deleteId) {
    deleteChapter(deleteId).catch(error => setMessage(`Error: ${error.message}`, 'error'));
  }
});

serverDeleteTable?.addEventListener('click', event => {
  const deleteId = event.target.dataset.deleteServer;
  if (deleteId) {
    deleteChapter(deleteId).catch(error => setMessage(`Error: ${error.message}`, 'error'));
  }
});

animesTable.addEventListener('click', event => {
  const editTitle = event.target.dataset.editAnime;
  const manageTitle = event.target.dataset.manageChapters;
  const directoryId = event.target.dataset.directoryAnime;
  const viewSlug = event.target.dataset.viewAnime;
  const deleteId = event.target.dataset.deleteAnime;

  if (editTitle) {
    editAnime(editTitle);
  }
  if (manageTitle) {
    manageAnimeChapters(manageTitle);
  }
  if (viewSlug) {
    viewAnimeBySlug(viewSlug);
  }
  if (directoryId) {
    moveAnimeToDirectory(directoryId).catch(error => setMessage(`Error: ${error.message}`, 'error'));
  }
  if (deleteId) {
    deleteAnime(deleteId).catch(error => setMessage(`Error: ${error.message}`, 'error'));
  }
});

if (getAdminSession()?.access_token) {
  adminLock.classList.add('hidden');
  adminContent.classList.remove('hidden');
  initAdmin();
}
