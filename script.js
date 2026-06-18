let animesData = [];
let currentSlide = 0;
let carouselInterval;
let currentAnimeIndex = null;
let currentChapterIndex = 0;
let currentServerIndex = 0;
let authMode = 'login';
let popAdsLoaded = false;
const CAROUSEL_SIZE_STORAGE_KEY = 'animeflv-carousel-image-size';
let carouselImageSize = Math.min(90, Math.max(28, Number(localStorage.getItem(CAROUSEL_SIZE_STORAGE_KEY)) || 42));
const HOME_ANIME_LIMIT = 20;
const DIRECTORY_PAGE_SIZE = 30;
const SEARCH_RESULT_LIMIT = 10;
const SUPABASE_URL = 'https://vanmxvfhagqfbwynpwzt.supabase.co';
const SUPABASE_KEY = 'sb_publishable_c4fIwf42U_W18zJH2RkS1w_1UB2PeZO';
const SUPABASE_HEADERS = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json'
};
const SITE_URL = 'https://animeflv.lat/';
const SITE_NAME = 'AnimeFLV';
const HOME_TITLE = 'AnimeFLV - Ver Animes Online en Latino';
const HOME_DESCRIPTION = 'AnimeFLV: mira animes online en latino, estrenos, episodios recientes, series completas y populares en un solo directorio.';
let socialIntroText = '';
let socialLinks = [];
let carouselLoaded = false;

// Register Service Worker for Push Notifications
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(error => {
    console.warn('Service Worker registration failed:', error);
  });
}

function loadPopAdsForAnimeView() {
  if (popAdsLoaded) return;
  popAdsLoaded = true;

  (function() {
    var q = window,
      m = "de6821afc7af45e822d4dd8823d3dd03",
      t = [
        ["siteId", 258 - 890 - 455 + 5302260],
        ["minBid", 0],
        ["popundersPerIP", "5:1"],
        // 900 seconds = 15 minutes between ad openings for the same visitor.
        ["delayBetween", 900],
        ["default", false],
        ["defaultPerDay", 0],
        ["topmostLayer", "auto"]
      ],
      p = [
        "d3d3LmFudGlhZGJsb2Nrc3lzdGVtcy5jb20vaXphYnV0b19jYWxlbmRhci5taW4uY3Nz",
        "ZDNjb2Q4MHRobjdxbmQuY2xvdWRmcm9udC5uZXQvRi9lYXBocm9kaXRlLm1pbi5qcw=="
      ],
      y = -1,
      j,
      a,
      w = function() {
        clearTimeout(a);
        y++;
        if (p[y] && !(1805321534000 < (new Date).getTime() && 1 < y)) {
          j = q.document.createElement("script");
          j.type = "text/javascript";
          j.async = true;
          var e = q.document.getElementsByTagName("script")[0];
          j.src = "https://" + atob(p[y]);
          j.crossOrigin = "anonymous";
          j.onerror = w;
          j.onload = function() {
            clearTimeout(a);
            q[m.slice(0, 16) + m.slice(0, 16)] || w();
          };
          a = setTimeout(w, 5000);
          e.parentNode.insertBefore(j, e);
        }
      };
    if (!q[m]) {
      try {
        Object.freeze(q[m] = t);
      } catch (e) {}
      w();
    }
  })();
}

function requestPopAdsForVideoPlay() {
  // Runs without requiring login. PopAds enforces its own visitor/cooldown limits.
  loadPopAdsForAnimeView();
}

function getOrCreateMeta(selector, createTag = 'meta', attributes = {}) {
  let element = document.head.querySelector(selector);
  if (!element) {
    element = document.createElement(createTag);
    Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
    document.head.appendChild(element);
  }
  return element;
}

function setMeta(selector, value, attributes = {}) {
  const element = getOrCreateMeta(selector, 'meta', attributes);
  element.setAttribute('content', value);
}

function setCanonical(url) {
  const canonical = getOrCreateMeta('link[rel="canonical"]', 'link', { rel: 'canonical' });
  canonical.setAttribute('href', url);
}

function toAbsoluteUrl(value) {
  try {
    return new URL(value || '', SITE_URL).href;
  } catch {
    return SITE_URL;
  }
}

function setJsonLd(id, data) {
  const script = getOrCreateMeta(`#${id}`, 'script', { id, type: 'application/ld+json' });
  script.textContent = JSON.stringify(data);
}

function updateHomeSEO() {
  document.title = HOME_TITLE;
  setCanonical(SITE_URL);
  setMeta('meta[name="description"]', HOME_DESCRIPTION, { name: 'description' });
  setMeta('meta[property="og:title"]', HOME_TITLE, { property: 'og:title' });
  setMeta('meta[property="og:description"]', HOME_DESCRIPTION, { property: 'og:description' });
  setMeta('meta[property="og:url"]', SITE_URL, { property: 'og:url' });
  setMeta('meta[property="og:image"]', `${SITE_URL}image.png`, { property: 'og:image' });
  setMeta('meta[name="twitter:title"]', HOME_TITLE, { name: 'twitter:title' });
  setMeta('meta[name="twitter:description"]', HOME_DESCRIPTION, { name: 'twitter:description' });
  setMeta('meta[name="twitter:image"]', `${SITE_URL}image.png`, { name: 'twitter:image' });
}

function getSocialNetwork(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '').toLowerCase();
    if (host.includes('instagram')) return 'instagram';
    if (host.includes('telegram') || host === 't.me') return 'telegram';
    if (host.includes('youtube') || host.includes('youtu.be')) return 'youtube';
    if (host.includes('tiktok')) return 'tiktok';
    if (host.includes('discord')) return 'discord';
    if (host.includes('facebook') || host.includes('fb.com')) return 'facebook';
    if (host.includes('twitter') || host.includes('x.com')) return 'x';
  } catch {
    return 'link';
  }
  return 'link';
}

function getSocialIcon(name) {
  const icons = {
    instagram: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="5"></rect><circle cx="12" cy="12" r="3.5"></circle><circle cx="17" cy="7" r="1"></circle></svg>',
    telegram: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 4 3 11.4l6.8 2.3L17 8.2l-5.5 6.9L12 20l3.3-4.1L20 18z"></path></svg>',
    youtube: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="6" width="18" height="12" rx="4"></rect><path d="m10 9 5 3-5 3z"></path></svg>',
    tiktok: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4v9.2a4.2 4.2 0 1 1-4.2-4.2c.4 0 .8.1 1.2.2V12a1.8 1.8 0 1 0 1.8 1.8V4zm0 0c.5 2.9 2.2 4.5 5 4.8V12c-1.9-.1-3.6-.8-5-2z"></path></svg>',
    discord: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7c3.4-1.4 6.6-1.4 10 0l1.5 8.6c-1.6 1.2-3.1 1.9-4.6 2.2l-.8-1.3c.9-.2 1.7-.5 2.4-1-2.3 1.1-4.7 1.1-7 0 .7.5 1.5.8 2.4 1l-.8 1.3c-1.5-.3-3-1-4.6-2.2z"></path><circle cx="9.5" cy="12" r="1"></circle><circle cx="14.5" cy="12" r="1"></circle></svg>',
    facebook: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 8h3V4h-3c-3 0-5 2-5 5v2H6v4h3v5h4v-5h3l1-4h-4V9c0-.6.4-1 1-1z"></path></svg>',
    x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h4.7l3.8 5.2L17 4h3.2l-6 7 6.5 9H16l-4.2-5.8L6.8 20H3.6l6.7-7.7z"></path></svg>',
    link: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.1 0l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1"></path><path d="M14 11a5 5 0 0 0-7.1 0l-2 2a5 5 0 0 0 7.1 7.1l1.1-1.1"></path></svg>'
  };
  return icons[name] || icons.link;
}

async function loadSocialContent() {
  const settingsParams = new URLSearchParams({
    select: 'value',
    key: 'in.(social_intro,carousel_settings)'
  });
  const linksParams = new URLSearchParams({
    select: 'title,url,sort_order,enabled',
    enabled: 'eq.true',
    order: 'sort_order.asc,created_at.asc'
  });

  try {
    const [settingsResponse, linksResponse] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/site_settings?${settingsParams.toString()}`, { headers: SUPABASE_HEADERS }),
      fetch(`${SUPABASE_URL}/rest/v1/social_links?${linksParams.toString()}`, { headers: SUPABASE_HEADERS })
    ]);

    if (settingsResponse.ok) {
      const rows = await settingsResponse.json();
      const introRow = rows.find(row => row.value && row.value.text !== undefined);
      const carouselRow = rows.find(row => row.value && row.value.imageSize !== undefined);
      socialIntroText = introRow?.value?.text || '';
      const savedSize = Number(carouselRow?.value?.imageSize);
      if (Number.isFinite(savedSize)) {
        carouselImageSize = Math.min(90, Math.max(28, savedSize));
        localStorage.setItem(CAROUSEL_SIZE_STORAGE_KEY, String(carouselImageSize));
      }
    }
    if (linksResponse.ok) {
      socialLinks = await linksResponse.json();
    }
  } catch (error) {
    console.warn('No se pudo cargar redes sociales:', error);
  }
}

function renderSocialStrip() {
  const strip = document.getElementById('social-strip');
  if (!strip) return;

  const visibleLinks = socialLinks.filter(link => link.enabled !== false && link.url);
  if (!socialIntroText && visibleLinks.length === 0) {
    strip.classList.add('hidden');
    strip.innerHTML = '';
    return;
  }

  strip.classList.remove('hidden');
  strip.innerHTML = `
    <div class="social-strip-inner">
      ${socialIntroText ? `<p>${escapeHTML(socialIntroText)}</p>` : ''}
      <div class="social-links">
        ${visibleLinks.map(link => {
          const network = getSocialNetwork(link.url);
          const label = link.title || network;
          return `
            <a class="social-link social-${network}" href="${escapeHTML(link.url)}" target="_blank" rel="noopener noreferrer" title="${escapeHTML(label)}">
              ${getSocialIcon(network)}
              <span>${escapeHTML(label)}</span>
            </a>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

function updateAnimeSEO(index, anime) {
  const title = `${anime.titulo} - Ver Anime Online en Latino | ${SITE_NAME}`;
  const description = `${anime.titulo}: mira sus episodios online en latino en AnimeFLV. ${anime.descripcion || 'Encuentra estrenos, capitulos recientes y animes completos.'}`.slice(0, 155);
  const url = toAbsoluteUrl(getAnimeUrl(anime, index));
  const image = toAbsoluteUrl(safeImageUrl(anime.imagen));

  document.title = title;
  setCanonical(url);
  setMeta('meta[name="description"]', description, { name: 'description' });
  setMeta('meta[property="og:type"]', 'video.tv_show', { property: 'og:type' });
  setMeta('meta[property="og:title"]', title, { property: 'og:title' });
  setMeta('meta[property="og:description"]', description, { property: 'og:description' });
  setMeta('meta[property="og:url"]', url, { property: 'og:url' });
  setMeta('meta[property="og:image"]', image, { property: 'og:image' });
  setMeta('meta[name="twitter:title"]', title, { name: 'twitter:title' });
  setMeta('meta[name="twitter:description"]', description, { name: 'twitter:description' });
  setMeta('meta[name="twitter:image"]', image, { name: 'twitter:image' });

  setJsonLd('anime-schema', {
    '@context': 'https://schema.org',
    '@type': 'TVSeries',
    name: anime.titulo,
    description,
    image,
    url,
    inLanguage: 'es',
    genre: anime.generos || [],
    numberOfEpisodes: Array.isArray(anime.capitulos) ? anime.capitulos.length : 0
  });
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

function normalizeSearchText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function getSearchScore(anime, query) {
  const cleanQuery = normalizeSearchText(query);
  if (!cleanQuery) return 0;

  const title = normalizeSearchText(anime.titulo);
  const slug = normalizeSearchText(anime.slug);
  const genres = normalizeSearchText((anime.generos || []).join(' '));

  if (title === cleanQuery) return 100;
  if (title.startsWith(cleanQuery)) return 90;
  if (title.includes(cleanQuery)) return 75;
  if (slug.includes(cleanQuery)) return 68;
  if (genres.includes(cleanQuery)) return 55;

  let qi = 0;
  for (const char of title) {
    if (char === cleanQuery[qi]) qi += 1;
    if (qi === cleanQuery.length) return 42;
  }

  return 0;
}

function getAnimeSlug(anime, animeIndex) {
  return anime?.slug || slugify(anime?.titulo) || `anime-${animeIndex}`;
}

function getAnimeUrl(anime, animeIndex) {
  return `/anime/${encodeURIComponent(getAnimeSlug(anime, animeIndex))}`;
}

function getChapterUrl(anime, animeIndex, chapterIndex) {
  const chapters = Array.isArray(anime?.capitulos) ? anime.capitulos : [];
  const chapter = chapters[chapterIndex];
  const chapterNumber = chapter?.numero ?? chapter?.chapter_number;
  if (chapterNumber === undefined || chapterNumber === null || chapterNumber === '') {
    return getAnimeUrl(anime, animeIndex);
  }
  return `/ver/${encodeURIComponent(getAnimeSlug(anime, animeIndex))}-episodio-${encodeURIComponent(String(chapterNumber))}`;
}

function getRouteRequest() {
  const path = decodeURIComponent(window.location.pathname).replace(/^\/+|\/+$/g, '');
  const params = new URLSearchParams(window.location.search);

  const watchMatch = path.match(/^ver\/(.+)-episodio-([^/]+)$/);
  if (watchMatch) {
    return {
      type: 'watch',
      slug: watchMatch[1],
      chapterNumber: watchMatch[2]
    };
  }

  const animeMatch = path.match(/^anime\/([^/]+)$/);
  if (animeMatch) {
    return {
      type: 'anime',
      slug: animeMatch[1]
    };
  }

  const legacySlug = params.get('slug');
  if (legacySlug) {
    return {
      type: 'detail',
      slug: legacySlug,
      legacyEp: params.get('ep')
    };
  }

  const animeIndex = params.get('anime');
  if (animeIndex !== null) {
    return {
      type: 'detail',
      animeIndex: Number(animeIndex),
      legacyEp: params.get('ep')
    };
  }

  return {
    type: 'section',
    section: params.get('section') || 'inicio',
    page: Math.max(1, Number(params.get('page')) || 1)
  };
}

function getRequestedChapterIndex(chapters) {
  const route = getRouteRequest();
  const chapterNumber = route.chapterNumber;
  if (chapterNumber !== undefined) {
    const byNumber = chapters.findIndex(chapter => String(chapter.numero ?? chapter.chapter_number) === String(chapterNumber));
    if (byNumber >= 0) return byNumber;
  }

  if (route.legacyEp !== null && route.legacyEp !== undefined) {
    const requestedEp = Number(route.legacyEp);
    if (Number.isInteger(requestedEp) && requestedEp >= 0 && requestedEp < chapters.length) {
      return requestedEp;
    }
  }

  return getLatestChapterIndex(chapters);
}

function isPublished(item) {
  return (item.publish_status || 'published') === 'published';
}

function hasSection(item, section) {
  return Array.isArray(item.sections) && item.sections.includes(section);
}

function looksLikeLatinoTitle(value) {
  const normalized = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  return /\b(?:espanol latino|audio latino|latino(?:s|america|americano|americana)?|latina(?:s)?|latam|castellano)\b/.test(normalized);
}

function getAnimeOwnSections(anime) {
  return Array.isArray(anime.anime_sections) ? anime.anime_sections : (anime.sections || []);
}

function getDateTime(value) {
  const time = Date.parse(value || '');
  return Number.isFinite(time) ? time : 0;
}

function getLatestChapterNumber(anime) {
  return (anime.capitulos || []).reduce((latest, chapter) => {
    const number = Number(chapter.numero) || 0;
    return number > latest ? number : latest;
  }, 0);
}

function getLatestChapterIndex(chapters = []) {
  if (!chapters.length) return 0;

  return chapters.reduce((latestIndex, chapter, index) => {
    const latest = chapters[latestIndex];
    const timeDiff = getDateTime(chapter.updated_at || chapter.created_at || chapter.fecha || chapter.date)
      - getDateTime(latest.updated_at || latest.created_at || latest.fecha || latest.date);

    if (timeDiff !== 0) return timeDiff > 0 ? index : latestIndex;
    return (Number(chapter.numero) || 0) > (Number(latest.numero) || 0) ? index : latestIndex;
  }, 0);
}

function getLatestUploadTime(anime) {
  const animeTime = getDateTime(anime.updated_at || anime.created_at);
  const chapterTimes = (anime.capitulos || []).map(chapter =>
    getDateTime(chapter.updated_at || chapter.created_at || chapter.fecha || chapter.date)
  );
  return Math.max(animeTime, ...chapterTimes, 0);
}

function sortByLatestUpload(animes) {
  return [...animes].sort((a, b) => {
    const uploadDiff = getLatestUploadTime(b) - getLatestUploadTime(a);
    if (uploadDiff !== 0) return uploadDiff;
    return getLatestChapterNumber(b) - getLatestChapterNumber(a);
  });
}

function getCarouselImage(anime) {
  return String(anime.banner_image || anime.imagen || '').trim();
}

function hasBannerImage(anime) {
  return Boolean(String(anime.banner_image || '').trim());
}

function hasCarouselImage(anime) {
  return Boolean(getCarouselImage(anime));
}

function getHomeAnimes() {
  const homeSections = ['inicio', 'destacados'];
  return sortByLatestUpload(animesData.filter(anime => {
    const ownSections = getAnimeOwnSections(anime);
    const sections = Array.isArray(anime.sections) ? anime.sections : ownSections;
    const hasHomeSection = sections.some(section => homeSections.includes(section));
    const hasChapters = Array.isArray(anime.capitulos) && anime.capitulos.length > 0;

    if (ownSections.includes('sin_inicio')) return false;
    if (sections.length === 0) return true;
    return hasHomeSection || hasChapters;
  }));
}

// CARRUSEL
function initCarousel() {
  const bannerSection = document.querySelector('.banner-carousel');
  const carouselContainer = document.getElementById("carousel");
  const indicatorsContainer = document.getElementById("carousel-indicators");
  if (!bannerSection || !carouselContainer || !indicatorsContainer) return;

  const carouselSourceAnimes = animesData.filter(a => isPublished(a) && hasCarouselImage(a));
  const selectedCarouselAnimes = carouselSourceAnimes
    .filter(a => hasSection(a, 'destacados'))
    .sort((a, b) => (Number(b.sort_order) || 0) - (Number(a.sort_order) || 0))
    .slice(0, 4);
  const estrenando = selectedCarouselAnimes.length ? selectedCarouselAnimes : [];
  if (estrenando.length === 0) {
    bannerSection.classList.add('hidden');
    return;
  }

  bannerSection.classList.remove('hidden');
  bannerSection.style.setProperty('--carousel-art-width', `${carouselImageSize}%`);
  currentSlide = 0;
  clearInterval(carouselInterval);
  carouselContainer.innerHTML = '';
  indicatorsContainer.innerHTML = '';

  estrenando.forEach((anime, idx) => {
    const genresText = anime.generos && anime.generos.length > 0 
      ? anime.generos[0] 
      : "Anime";

    const slide = document.createElement("div");
    const realIndex = animesData.indexOf(anime);
    slide.className = `carousel-slide ${idx === 0 ? 'active' : ''}`;
    slide.innerHTML = `
      <div class="carousel-art">
        <img loading="lazy" src="${escapeHTML(safeImageUrl(getCarouselImage(anime)))}" alt="${escapeHTML(anime.titulo)}" onerror="this.style.display='none'">
      </div>
      <div class="carousel-content">
        <div class="genre">${escapeHTML(genresText)}</div>
        <h2>${escapeHTML(anime.titulo)}</h2>
        <p>${escapeHTML(anime.descripcion)}</p>
        <div class="meta">
          <span><strong>Año:</strong> ${escapeHTML(anime.year || 'N/A')}</span>
          <span><strong>Cap:</strong> ${anime.capitulos ? anime.capitulos.length : 0}</span>
        </div>
        <button class="carousel-watch" type="button" data-anime-index="${realIndex}">Ver Ahora</button>
      </div>
    `;

    slide.querySelector('.carousel-watch').addEventListener('click', () => mostrarAnime(realIndex, true));
    carouselContainer.appendChild(slide);

    const dot = document.createElement("div");
    dot.className = `carousel-dot ${idx === 0 ? 'active' : ''}`;
    dot.addEventListener('click', () => goToSlide(idx));
    indicatorsContainer.appendChild(dot);
  });

  setupCarouselButtons(estrenando.length);
  startCarouselAutoPlay();
}

function goToSlide(n) {
  currentSlide = n;
  updateCarousel();
}

function nextSlide() {
  const slides = document.querySelectorAll('.carousel-slide');
  currentSlide = (currentSlide + 1) % slides.length;
  updateCarousel();
  resetCarouselTimer();
}

function prevSlide() {
  const slides = document.querySelectorAll('.carousel-slide');
  currentSlide = (currentSlide - 1 + slides.length) % slides.length;
  updateCarousel();
  resetCarouselTimer();
}

function updateCarousel() {
  const slides = document.querySelectorAll('.carousel-slide');
  const dots = document.querySelectorAll('.carousel-dot');

  slides.forEach((slide, idx) => {
    slide.classList.toggle('active', idx === currentSlide);
  });

  dots.forEach((dot, idx) => {
    dot.classList.toggle('active', idx === currentSlide);
  });
}

function startCarouselAutoPlay() {
  carouselInterval = setInterval(() => {
    nextSlide();
  }, 5000);
}

function resetCarouselTimer() {
  clearInterval(carouselInterval);
  startCarouselAutoPlay();
}

function setupCarouselButtons(slideCount) {
  const prevButton = document.getElementById("prev-btn");
  const nextButton = document.getElementById("next-btn");
  if (!prevButton || !nextButton) return;

  if (slideCount <= 1) {
    prevButton.style.display = 'none';
    nextButton.style.display = 'none';
  } else {
    prevButton.style.display = '';
    nextButton.style.display = '';
    prevButton.onclick = prevSlide;
    nextButton.onclick = nextSlide;
  }
}

function mostrarLista(animes, section = 'inicio') {
  const animeList = document.getElementById("anime-list");
  if (!animeList) return;
  animeList.innerHTML = "";

  // Ordenar por fecha de subida; si no hay fecha, usar el capitulo mas alto.
  const sorted = sortByLatestUpload(animes);

  sorted.forEach((anime, index) => {
    const realIndex = animesData.indexOf(anime);
    const ultimoCapitulo = getLatestChapterNumber(anime);

    const card = document.createElement("a");
    card.className = "anime-card";
    card.href = getAnimeUrl(anime, realIndex);

    const genresTags = anime.generos && anime.generos.length > 0 
      ? anime.generos.slice(0, 2).map(g => `<span class="genre-tag">${escapeHTML(g)}</span>`).join('')
      : '';

    // En el inicio, no mostrar descripción para ahorrar espacio
    const descriptionHTML = section === 'inicio' ? '' : `<p class="description">${escapeHTML(anime.descripcion)}</p>`;

    card.innerHTML = `
      <img loading="lazy" src="${escapeHTML(safeImageUrl(anime.imagen))}" alt="${escapeHTML(anime.titulo)}" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22200%22 height=%22280%22%3E%3Crect fill=%22%23444%22 width=%22200%22 height=%22280%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 font-size=%2220%22 fill=%22%23888%22 text-anchor=%22middle%22 dominant-baseline=%22middle%22%3EImagen%3C/text%3E%3C/svg%3E'">
      ${ultimoCapitulo ? `<div class="episode-badge">EP ${ultimoCapitulo}</div>` : ""}
      ${anime.estado ? `<div class="status-badge">${escapeHTML(anime.estado)}</div>` : ""}
      ${anime.titulo.toLowerCase().includes('latino') ? `<div class="latino-badge">Latino</div>` : ""}
      <div class="anime-info">
        <h3 title="${escapeHTML(anime.titulo)}">${escapeHTML(anime.titulo)}</h3>
        <div class="meta">
          ${anime.year ? `<span class="year">${escapeHTML(anime.year)}</span>` : ""}
          ${anime.capitulos ? `<span>${anime.capitulos.length} eps</span>` : ""}
        </div>
        ${genresTags ? `<div class="genres">${genresTags}</div>` : ""}
        ${descriptionHTML}
      </div>
    `;

    card.addEventListener('click', (event) => {
      event.preventDefault();
      // En el inicio, ir al último capítulo; en otras secciones, ir a la página del anime
      if (section === 'inicio') {
        mostrarAnime(realIndex, true);
      } else {
        mostrarAnimeInfo(realIndex, true);
      }
    });
    animeList.appendChild(card);
  });
}

function renderAnimeLoadingSkeleton(count = 12) {
  const animeList = document.getElementById("anime-list");
  if (!animeList) return;

  animeList.innerHTML = Array.from({ length: count }, (_, index) => `
    <article class="anime-card anime-loading-card" aria-hidden="true">
      <div class="loading-rem-frame">
        <img class="loading-rem loading-rem-one" src="/rem1.png" alt="">
        <img class="loading-rem loading-rem-two" src="/rem2.png" alt="">
      </div>
      <div class="anime-info">
        <span class="loading-line loading-line-title"></span>
        <span class="loading-line loading-line-short"></span>
        <span class="loading-line"></span>
      </div>
    </article>
  `).join('');
}

function getRecommendedAnimes(currentAnime, currentIndex, limit = 6) {
  const currentGenres = new Set((currentAnime?.generos || []).map(genre => normalizeSearchText(genre)));
  return sortByLatestUpload(
    animesData
      .map((anime, index) => ({
        anime,
        index,
        score: (anime.generos || []).reduce((total, genre) => (
          currentGenres.has(normalizeSearchText(genre)) ? total + 1 : total
        ), 0)
      }))
      .filter(item => item.index !== currentIndex && item.anime?.titulo)
      .sort((a, b) => b.score - a.score)
      .map(item => item.anime)
  ).slice(0, limit);
}

function renderRecommendedAnimeCard(anime) {
  const realIndex = animesData.indexOf(anime);
  const ultimoCapitulo = getLatestChapterNumber(anime);
  const genresTags = anime.generos && anime.generos.length > 0
    ? anime.generos.slice(0, 2).map(g => `<span class="genre-tag">${escapeHTML(g)}</span>`).join('')
    : '';

  return `
    <a href="${escapeHTML(getAnimeUrl(anime, realIndex))}" class="anime-card recommended-card" data-recommended-index="${realIndex}">
      <img loading="lazy" src="${escapeHTML(safeImageUrl(anime.imagen))}" alt="${escapeHTML(anime.titulo)}" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22200%22 height=%22280%22%3E%3Crect fill=%22%23444%22 width=%22200%22 height=%22280%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 font-size=%2220%22 fill=%22%23888%22 text-anchor=%22middle%22 dominant-baseline=%22middle%22%3EImagen%3C/text%3E%3C/svg%3E'">
      ${ultimoCapitulo ? `<div class="episode-badge">EP ${ultimoCapitulo}</div>` : ""}
      ${anime.estado ? `<div class="status-badge">${escapeHTML(anime.estado)}</div>` : ""}
      ${anime.titulo.toLowerCase().includes('latino') ? `<div class="latino-badge">Latino</div>` : ""}
      <div class="anime-info">
        <h3 title="${escapeHTML(anime.titulo)}">${escapeHTML(anime.titulo)}</h3>
        <div class="meta">
          ${anime.year ? `<span class="year">${escapeHTML(anime.year)}</span>` : ""}
          ${anime.capitulos ? `<span>${anime.capitulos.length} eps</span>` : ""}
        </div>
        ${genresTags ? `<div class="genres">${genresTags}</div>` : ""}
      </div>
    </a>
  `;
}

function renderHome(titleText = 'Últimos episodios') {
  const main = document.querySelector('main');
  if (!main) return;
  main.innerHTML = `
    <h1 class="sr-only">AnimeFLV - Ver animes online en latino</h1>
    <div class="animeflv-layout">
      <aside class="home-sidebar" aria-label="Animes en emisión">
        <div class="home-sidebar-title">ANIMES EN EMISIÓN</div>
        <ul id="home-sidebar-list" class="home-sidebar-list"></ul>
      </aside>
      <div class="home-main">
        <section class="home-section">
          <div class="home-section-header">
            <h2 id="main-title">${titleText}</h2>
            <span class="home-section-pill">${titleText === 'Ultimos episodios' || titleText === 'Últimos episodios' ? 'HOY' : 'VER MÁS'}</span>
          </div>
          <div id="anime-list" class="anime-list"></div>
        </section>
      </div>
    </div>
    <div id="directory-pagination" class="pagination"></div>
  `;
}

function renderHomeSidebar(items = []) {
  const list = document.getElementById('home-sidebar-list');
  if (!list) return;

  const source = (items.length ? items : animesData)
    .filter(anime => isPublished(anime))
    .slice(0, 18);

  list.innerHTML = source.length
    ? source.map(anime => `
        <li class="home-sidebar-item">
          <a href="${escapeHTML(getAnimeUrl(anime, animesData.indexOf(anime)))}" class="home-sidebar-link">
            <span>${escapeHTML(anime.titulo)}</span>
            <strong>ANIME</strong>
          </a>
        </li>
      `).join('')
    : `
        <li class="home-sidebar-item">
          <span class="home-sidebar-link">
            <span>Cargando...</span>
            <strong>ANIME</strong>
          </span>
        </li>
      `;
}

function setActiveNavById(id) {
  document.querySelectorAll('.nav-link').forEach(a => a.classList.remove('active'));
  const link = document.getElementById(id);
  if (link) link.classList.add('active');
}

function setBannerVisible(visible) {
  const bannerSection = document.querySelector('.banner-carousel');
  if (!bannerSection) return;

  if (!visible) {
    bannerSection.classList.add('hidden');
    clearInterval(carouselInterval);
    return;
  }

  initCarousel();
}

function updateSectionHistory(section, title, pushState = false, page = 1) {
  const url = section === 'inicio'
    ? '/'
    : `/?section=${encodeURIComponent(section)}${section === 'directorio' && page > 1 ? `&page=${page}` : ''}`;
  const state = { page: 'section', section, sectionPage: page };
  const method = pushState ? 'pushState' : 'replaceState';
  history[method](state, title, url);
}

async function getSectionContent(section, page = 1) {
  if (section === 'latino') {
    const { items } = await loadLatinoAnimesPage();
    return {
      title: 'Anime Latino',
      items,
      total: items.length
    };
  }

  if (section === 'directorio') {
    const { items, total } = await loadDirectoryAnimesPage(page);
    return {
      title: 'Directorio',
      items,
      total
    };
  }

  const { items } = await loadHomeAnimesPage();
  return {
    title: 'Ultimos episodios',
    items,
    total: items.length
  };
}

function renderDirectoryPagination(totalItems, currentPage) {
  const pagination = document.getElementById('directory-pagination');
  if (!pagination) return;

  const totalPages = Math.ceil(totalItems / DIRECTORY_PAGE_SIZE);
  if (totalPages <= 1) {
    pagination.innerHTML = '';
    return;
  }

  const pages = [];
  const addPage = page => {
    if (page >= 1 && page <= totalPages && !pages.includes(page)) pages.push(page);
  };

  addPage(1);
  for (let page = currentPage - 2; page <= currentPage + 2; page += 1) addPage(page);
  addPage(totalPages);
  pages.sort((a, b) => a - b);

  let lastPage = 0;
  const pageButtons = pages.map(page => {
    const gap = page - lastPage > 1 ? '<span class="pagination-gap">...</span>' : '';
    lastPage = page;
    return `${gap}<a href="/?section=directorio&page=${page}" class="pagination-btn ${page === currentPage ? 'active' : ''}" data-page="${page}">${page}</a>`;
  }).join('');

  pagination.innerHTML = `
    <a href="/?section=directorio&page=${Math.max(1, currentPage - 1)}" class="pagination-btn ${currentPage <= 1 ? 'disabled' : ''}" data-page="${Math.max(1, currentPage - 1)}" aria-label="Pagina anterior">&laquo;</a>
    ${pageButtons}
    <a href="/?section=directorio&page=${Math.min(totalPages, currentPage + 1)}" class="pagination-btn ${currentPage >= totalPages ? 'disabled' : ''}" data-page="${Math.min(totalPages, currentPage + 1)}" aria-label="Pagina siguiente">&raquo;</a>
  `;

  pagination.querySelectorAll('.pagination-btn:not(.disabled)').forEach(link => {
    link.addEventListener('click', event => {
      event.preventDefault();
      renderSection('directorio', true, Number(link.dataset.page) || 1);
    });
  });
}

async function renderSection(section = 'inicio', pushState = false, page = 1) {
  updateHomeSEO();
  renderHome(section === 'directorio' ? 'Directorio' : section === 'latino' ? 'Anime Latino' : 'Ultimos episodios');
  renderAnimeLoadingSkeleton(section === 'directorio' ? DIRECTORY_PAGE_SIZE : HOME_ANIME_LIMIT);
  await loadCarouselAnimes();
  setBannerVisible(true);
  let content = await getSectionContent(section, page);
  const totalItems = content.total ?? content.items.length;
  const currentPage = section === 'directorio'
    ? Math.min(Math.max(1, page), Math.max(1, Math.ceil(totalItems / DIRECTORY_PAGE_SIZE)))
    : 1;
  if (section === 'directorio' && currentPage !== page) {
    content = await getSectionContent(section, currentPage);
  }
  const visibleItems = section === 'directorio'
    ? content.items
    : content.items;
  renderHome(content.title);
  mostrarLista(visibleItems, section);
  renderHomeSidebar(section === 'inicio' ? visibleItems : animesData);
  renderDirectoryPagination(section === 'directorio' ? totalItems : 0, currentPage);
  setActiveNavById(section);
  updateSectionHistory(section, content.title, pushState, currentPage);
  window.scrollTo({ top: 0, behavior: 'auto' });
}

function showHome(pushState = false) {
  renderSection('inicio', pushState);
}

async function handleInitialState() {
  const route = getRouteRequest();
  if ((route.type === 'anime' || route.type === 'watch' || route.type === 'detail') && route.slug) {
    let index = animesData.findIndex(anime => getAnimeSlug(anime, animesData.indexOf(anime)) === route.slug);
    if (index < 0) {
      index = await loadAnimeBySlug(route.slug);
    }
    if (index >= 0) {
      if (route.type === 'anime') {
        mostrarAnimeInfo(index, false);
      } else {
        mostrarAnime(index, false);
      }
      return;
    }
  }

  if (route.type === 'detail' && Number.isInteger(route.animeIndex) && animesData[route.animeIndex]) {
    mostrarAnime(route.animeIndex, false);
    return;
  }

  await renderSection(route.section || 'inicio', false, route.page || 1);
}

window.addEventListener('popstate', async event => {
  if (event.state && event.state.page === 'anime') {
    mostrarAnimeInfo(event.state.index, false);
  } else if (event.state && event.state.page === 'detail') {
    mostrarAnime(event.state.index, false);
  } else if (event.state && event.state.page === 'section') {
    await renderSection(event.state.section || 'inicio', false, event.state.sectionPage || 1);
  } else {
    await showHome(false);
  }
});

async function fetchAllSupabaseRows(path, params, pageSize = 1000) {
  const rows = [];

  for (let offset = 0; ; offset += pageSize) {
    const pageParams = new URLSearchParams(params);
    pageParams.set('limit', String(pageSize));
    pageParams.set('offset', String(offset));

    const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}?${pageParams.toString()}`, {
      headers: SUPABASE_HEADERS
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(message);
    }

    const page = await response.json();
    rows.push(...page);
    if (page.length < pageSize) break;
  }

  return rows;
}

function getSupabaseCount(response, fallbackCount = 0) {
  const range = response.headers.get('content-range') || '';
  const total = Number(range.split('/')[1]);
  return Number.isFinite(total) ? total : fallbackCount;
}

async function fetchSupabaseRows(path, params, { limit = 30, offset = 0, count = false } = {}) {
  const pageParams = new URLSearchParams(params);
  pageParams.set('limit', String(limit));
  pageParams.set('offset', String(offset));

  const headers = count
    ? { ...SUPABASE_HEADERS, Prefer: 'count=exact' }
    : SUPABASE_HEADERS;
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}?${pageParams.toString()}`, { headers });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message);
  }

  const rows = await response.json();
  return {
    rows,
    count: count ? getSupabaseCount(response, rows.length) : rows.length
  };
}

function mapSupabaseAnime(anime) {
  return {
    titulo: anime.titulo,
    imagen: anime.image_url,
    banner_image: anime.banner_image || '',
    descripcion: anime.descripcion || '',
    year: anime.year,
    estado: anime.estado || 'En emisiÃ³n',
    generos: anime.generos || [],
    slug: anime.slug || slugify(anime.titulo),
    publish_status: anime.publish_status || 'published',
    sections: anime.sections || [],
    sort_order: anime.sort_order || 0,
    created_at: anime.created_at,
    updated_at: anime.updated_at,
    capitulos: []
  };
}

function upsertAnimeCache(anime) {
  const slug = getAnimeSlug(anime);
  const existingIndex = animesData.findIndex(item =>
    item.titulo === anime.titulo || getAnimeSlug(item) === slug
  );

  if (existingIndex >= 0) {
    animesData[existingIndex] = {
      ...animesData[existingIndex],
      ...anime,
      capitulos: anime.capitulos?.length ? anime.capitulos : (animesData[existingIndex].capitulos || [])
    };
    return existingIndex;
  }

  animesData.push(anime);
  return animesData.length - 1;
}

function cacheAnimes(animes) {
  return animes.map(anime => {
    const index = upsertAnimeCache(anime);
    return animesData[index];
  });
}

function buildInFilter(values) {
  return `(${values.map(value => `"${String(value).replace(/"/g, '\\"')}"`).join(',')})`;
}

async function loadChaptersForAnimes(animes) {
  const titles = Array.from(new Set(animes.map(anime => anime.titulo).filter(Boolean)));
  if (!titles.length) return animes;

  const params = new URLSearchParams({
    select: 'anime_title,chapter_number,embed_url,cover_image,server_name,downloads,publish_status,sections,created_at,updated_at',
    anime_title: `in.${buildInFilter(titles)}`,
    order: 'chapter_number.asc'
  });

  let chapters = [];
  try {
    chapters = await fetchAllSupabaseRows('anime_chapters', params);
  } catch {
    const fallbackParams = new URLSearchParams({
      select: 'anime_title,chapter_number,embed_url,cover_image,server_name,created_at',
      anime_title: `in.${buildInFilter(titles)}`,
      order: 'chapter_number.asc'
    });
    try {
      chapters = await fetchAllSupabaseRows('anime_chapters', fallbackParams);
    } catch (error) {
      console.warn('No se pudieron cargar capitulos de la vista:', error.message || error);
    }
  }

  return mergeGlobalChapters(animes, chapters).map(anime => {
    const publishedChapters = (anime.capitulos || []).filter(isPublished);
    const chapterSections = publishedChapters.flatMap(chapter => chapter.sections || []);
    return {
      ...anime,
      anime_sections: anime.sections || [],
      sections: Array.from(new Set([...(anime.sections || []), ...chapterSections])),
      capitulos: publishedChapters
    };
  });
}

function getAnimeSelectFields() {
  return 'titulo,image_url,banner_image,descripcion,year,estado,generos,slug,publish_status,sections,sort_order,created_at,updated_at';
}

async function loadGlobalChapters() {
  const params = new URLSearchParams({
    select: 'anime_title,chapter_number,embed_url,cover_image,server_name,downloads,publish_status,sections,created_at,updated_at',
    order: 'chapter_number.asc'
  });

  try {
    return await fetchAllSupabaseRows('anime_chapters', params);
  } catch {
    const fallbackParams = new URLSearchParams({
      select: 'anime_title,chapter_number,embed_url,cover_image,server_name,created_at',
      order: 'chapter_number.asc'
    });
    try {
      return await fetchAllSupabaseRows('anime_chapters', fallbackParams);
    } catch (error) {
      console.warn('No se pudieron cargar capitulos globales:', error.message || error);
      return [];
    }
  }
}

async function loadGlobalAnimes() {
  const params = new URLSearchParams({
    select: 'titulo,image_url,banner_image,descripcion,year,estado,generos,slug,publish_status,sections,sort_order,created_at',
    order: 'created_at.desc'
  });

  try {
    const globalAnimes = await fetchAllSupabaseRows('animes', params);
    return globalAnimes.map(anime => ({
      titulo: anime.titulo,
      imagen: anime.image_url,
      banner_image: anime.banner_image || '',
      descripcion: anime.descripcion || '',
      year: anime.year,
      estado: anime.estado || 'En emisión',
      generos: anime.generos || [],
      slug: anime.slug || slugify(anime.titulo),
      publish_status: anime.publish_status || 'published',
      sections: anime.sections || [],
      sort_order: anime.sort_order || 0,
      created_at: anime.created_at,
      capitulos: []
    }));
  } catch {
    const fallbackParams = new URLSearchParams({
      select: 'titulo,image_url,descripcion,year,estado,generos,created_at',
      order: 'created_at.desc'
    });
    let fallbackAnimes = [];
    try {
      fallbackAnimes = await fetchAllSupabaseRows('animes', fallbackParams);
    } catch (error) {
      console.warn('No se pudieron cargar animes globales:', error.message || error);
      return [];
    }
    return fallbackAnimes.map(anime => ({
      titulo: anime.titulo,
      imagen: anime.image_url,
      banner_image: '',
      descripcion: anime.descripcion || '',
      year: anime.year,
      estado: anime.estado || 'En emisión',
      generos: anime.generos || [],
      slug: slugify(anime.titulo),
      publish_status: 'published',
      sections: [],
      sort_order: 0,
      created_at: anime.created_at,
      capitulos: []
    }));
  }
}

async function loadAnimesPage(params, { limit = HOME_ANIME_LIMIT, offset = 0, count = false } = {}) {
  const { rows, count: total } = await fetchSupabaseRows('animes', params, { limit, offset, count });
  const animes = rows
    .map(mapSupabaseAnime)
    .filter(anime => isPublished(anime) && anime.imagen && !anime.imagen.toLowerCase().includes('placeholder'));
  const withChapters = await loadChaptersForAnimes(animes);
  return {
    items: cacheAnimes(withChapters),
    total
  };
}

async function loadHomeAnimesPage() {
  const params = new URLSearchParams({
    select: getAnimeSelectFields(),
    publish_status: 'eq.published',
    or: '(sections.cs.{inicio},sections.cs.{destacados})',
    order: 'updated_at.desc.nullslast,created_at.desc'
  });
  return loadAnimesPage(params, { limit: HOME_ANIME_LIMIT, offset: 0 });
}

async function loadDirectoryAnimesPage(page = 1) {
  const offset = (Math.max(1, page) - 1) * DIRECTORY_PAGE_SIZE;
  const params = new URLSearchParams({
    select: getAnimeSelectFields(),
    publish_status: 'eq.published',
    sections: 'cs.{directorio}',
    order: 'titulo.asc'
  });
  let result = await loadAnimesPage(params, { limit: DIRECTORY_PAGE_SIZE, offset, count: true });

  if (result.total === 0) {
    const fallbackParams = new URLSearchParams({
      select: getAnimeSelectFields(),
      publish_status: 'eq.published',
      order: 'titulo.asc'
    });
    result = await loadAnimesPage(fallbackParams, { limit: DIRECTORY_PAGE_SIZE, offset, count: true });
  }

  return result;
}

async function loadLatinoAnimesPage() {
  const params = new URLSearchParams({
    select: getAnimeSelectFields(),
    publish_status: 'eq.published',
    or: '(sections.cs.{latino},titulo.ilike.*latino*,titulo.ilike.*latam*,titulo.ilike.*castellano*)',
    order: 'updated_at.desc.nullslast,created_at.desc'
  });
  return loadAnimesPage(params, { limit: HOME_ANIME_LIMIT, offset: 0 });
}

async function searchAnimes(query) {
  const cleanQuery = String(query || '').trim().replace(/[%*]/g, '');
  if (!cleanQuery) return [];

  const params = new URLSearchParams({
    select: getAnimeSelectFields(),
    publish_status: 'eq.published',
    or: `(titulo.ilike.*${cleanQuery}*,slug.ilike.*${slugify(cleanQuery)}*)`,
    order: 'updated_at.desc.nullslast,created_at.desc'
  });
  const { items } = await loadAnimesPage(params, { limit: SEARCH_RESULT_LIMIT, offset: 0 });
  return items
    .map(anime => ({
      anime,
      score: getSearchScore(anime, query)
    }))
    .filter(result => result.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, SEARCH_RESULT_LIMIT)
    .map(result => result.anime);
}

async function loadAnimeBySlug(slug) {
  const params = new URLSearchParams({
    select: getAnimeSelectFields(),
    publish_status: 'eq.published',
    slug: `eq.${slug}`,
    limit: '1'
  });

  const { rows } = await fetchSupabaseRows('animes', params, { limit: 1 });
  const anime = rows[0] ? mapSupabaseAnime(rows[0]) : null;
  if (!anime || !anime.imagen || anime.imagen.toLowerCase().includes('placeholder')) return -1;

  const [withChapters] = await loadChaptersForAnimes([anime]);
  return upsertAnimeCache(withChapters || anime);
}

async function loadCarouselAnimes() {
  if (carouselLoaded) return;
  carouselLoaded = true;

  const params = new URLSearchParams({
    select: getAnimeSelectFields(),
    publish_status: 'eq.published',
    sections: 'cs.{destacados}',
    order: 'sort_order.desc,updated_at.desc.nullslast,created_at.desc'
  });

  try {
    const { items } = await loadAnimesPage(params, { limit: 4, offset: 0 });
    cacheAnimes(items);
  } catch (error) {
    console.warn('No se pudo cargar carrusel paginado:', error.message || error);
  }
}

function mergeGlobalAnimes(localAnimes, globalAnimes) {
  const animeMap = new Map();
  localAnimes.forEach(anime => animeMap.set(anime.titulo, anime));
  globalAnimes.forEach(anime => {
    animeMap.set(anime.titulo, {
      ...(animeMap.get(anime.titulo) || {}),
      ...anime,
      capitulos: animeMap.get(anime.titulo)?.capitulos || anime.capitulos || []
    });
  });
  return Array.from(animeMap.values());
}

function mergeGlobalChapters(animes, globalChapters) {
  const chaptersByAnime = globalChapters.reduce((groups, chapter) => {
    if (!groups[chapter.anime_title]) groups[chapter.anime_title] = [];
    groups[chapter.anime_title].push(chapter);
    return groups;
  }, {});

  return animes.map(anime => {
    const remoteChapters = chaptersByAnime[anime.titulo] || [];
    if (remoteChapters.length === 0) return anime;

    const chapters = mergeChapterEntries((anime.capitulos || []).map(chapter => normalizeChapterServers(chapter, anime)), anime);
    remoteChapters.forEach(chapter => {
      const automaticCover = getAutoCoverFromEmbed(chapter.embed_url);
      const server = {
        name: chapter.server_name || 'Principal',
        embed: chapter.embed_url,
        imagen: chapter.cover_image || automaticCover || anime.imagen
      };
      const existingIndex = chapters.findIndex(cap => Number(getChapterNumberValue(cap)) === Number(chapter.chapter_number));
      if (existingIndex >= 0) {
        chapters[existingIndex] = addServerToChapter(chapters[existingIndex], server, chapter);
      } else {
        chapters.push(normalizeChapterServers({
          numero: chapter.chapter_number,
          embed: chapter.embed_url,
          imagen: server.imagen,
          server: server.name,
          publish_status: chapter.publish_status || 'published',
          sections: chapter.sections || [],
          created_at: chapter.created_at,
          updated_at: chapter.updated_at,
          downloads: chapter.downloads || [],
          servers: [server]
        }, anime));
      }
    });

    return {
      ...anime,
      capitulos: mergeChapterEntries(chapters, anime)
    };
  });
}

function getChapterNumberValue(chapter) {
  return chapter?.numero ?? chapter?.chapter_number ?? chapter?.episode_number ?? '';
}

function normalizeChapterServers(chapter, anime = {}) {
  const numero = getChapterNumberValue(chapter);
  const servers = Array.isArray(chapter.servers) && chapter.servers.length
    ? chapter.servers
    : [{
        name: chapter.server || chapter.server_name || 'Principal',
        embed: chapter.embed || chapter.embed_url || '',
        imagen: chapter.imagen || chapter.cover_image || anime.imagen || ''
      }];

  const cleanServers = servers
    .map((server, index) => ({
      name: server.name || server.server || server.server_name || (index === 0 ? 'Principal' : `Servidor ${index + 1}`),
      embed: server.embed || server.embed_url || '',
      imagen: server.imagen || server.cover_image || chapter.imagen || anime.imagen || ''
    }))
    .filter(server => server.embed);

  const firstServer = cleanServers[0] || { name: chapter.server || 'Principal', embed: chapter.embed || '', imagen: chapter.imagen || anime.imagen || '' };
  return {
    ...chapter,
    numero,
    chapter_number: chapter.chapter_number ?? numero,
    embed: firstServer.embed,
    imagen: chapter.imagen || firstServer.imagen || anime.imagen,
    server: firstServer.name,
    servers: cleanServers,
    downloads: normalizeDownloadLinks(chapter.downloads || chapter.download_links || chapter.descargas)
  };
}

function normalizeDownloadLinks(value) {
  const source = Array.isArray(value) ? value : [];
  const seen = new Set();

  return source
    .map((item, index) => {
      const rawUrl = typeof item === 'string'
        ? item
        : item?.url || item?.href || item?.download_url || item?.downloadUrl || '';
      const url = safeUrl(rawUrl);
      if (!url || seen.has(url)) return null;
      seen.add(url);

      const server = typeof item === 'string'
        ? ''
        : item?.server || item?.server_name || item?.name || item?.label || '';
      const quality = typeof item === 'string'
        ? ''
        : item?.quality || item?.resolution || item?.calidad || '';

      return {
        server: String(server || `Descarga ${index + 1}`).trim(),
        quality: String(quality || '').trim(),
        url
      };
    })
    .filter(Boolean);
}

function mergeDownloadLinks(...groups) {
  const seen = new Set();
  return groups
    .flatMap(group => normalizeDownloadLinks(group))
    .filter(item => {
      if (!item.url || seen.has(item.url)) return false;
      seen.add(item.url);
      return true;
    });
}

function mergeChapterEntries(chapters, anime = {}) {
  const chapterMap = new Map();

  chapters.forEach(chapter => {
    const normalized = normalizeChapterServers(chapter, anime);
    const numberKey = String(getChapterNumberValue(normalized)).trim();
    if (!numberKey) return;

    if (!chapterMap.has(numberKey)) {
      chapterMap.set(numberKey, normalized);
      return;
    }

    const current = chapterMap.get(numberKey);
    normalized.servers.forEach(server => {
      chapterMap.set(numberKey, addServerToChapter(chapterMap.get(numberKey), server, normalized));
    });

    chapterMap.set(numberKey, {
      ...chapterMap.get(numberKey),
      imagen: current.imagen || normalized.imagen || anime.imagen,
      downloads: mergeDownloadLinks(current.downloads, normalized.downloads),
      publish_status: current.publish_status || normalized.publish_status || 'published',
      sections: Array.from(new Set([...(current.sections || []), ...(normalized.sections || [])])),
      created_at: current.created_at || normalized.created_at,
      updated_at: normalized.updated_at || current.updated_at
    });
  });

  return Array.from(chapterMap.values())
    .sort((a, b) => Number(getChapterNumberValue(a)) - Number(getChapterNumberValue(b)));
}

function addServerToChapter(chapter, server, source = {}) {
  const normalized = normalizeChapterServers(chapter);
  const exists = normalized.servers.some(item =>
    item.embed === server.embed || item.name.toLowerCase() === server.name.toLowerCase()
  );
  const servers = exists ? normalized.servers : [...normalized.servers, server];
  return {
    ...normalized,
    embed: servers[0]?.embed || normalized.embed,
    server: servers[0]?.name || normalized.server,
    imagen: source.cover_image || server.imagen || normalized.imagen,
    servers,
    downloads: mergeDownloadLinks(normalized.downloads, source.downloads),
    publish_status: normalized.publish_status || source.publish_status || 'published',
    sections: Array.from(new Set([...(normalized.sections || []), ...(source.sections || [])])),
    created_at: normalized.created_at || source.created_at,
    updated_at: source.updated_at || normalized.updated_at
  };
}

function getChapterServer(chapter, serverIndex = 0) {
  const normalized = normalizeChapterServers(chapter);
  return normalized.servers[serverIndex] || normalized.servers[0] || {
    name: normalized.server || 'Principal',
    embed: normalized.embed || '',
    imagen: normalized.imagen || ''
  };
}

function getChapterPreviewImage(chapter, anime = {}) {
  const normalized = normalizeChapterServers(chapter, anime);
  const animeImage = anime.imagen || '';
  const candidates = [
    chapter?.cover_image,
    chapter?.imagen,
    ...normalized.servers.map(server => server.imagen),
    ...normalized.servers.map(server => getAutoCoverFromEmbed(server.embed))
  ];

  const specificImage = candidates.find(image => {
    const cleanImage = String(image || '').trim();
    return cleanImage && cleanImage !== animeImage;
  });

  return specificImage || getGeneratedChapterPreview(chapter, anime) || animeImage;
}

function getGeneratedChapterPreview(chapter, anime = {}) {
  const title = escapeHTML(anime.titulo || 'AnimeFLV').slice(0, 42);
  const number = escapeHTML(chapter?.numero ?? chapter?.chapter_number ?? '');
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#202238"/>
          <stop offset="0.52" stop-color="#351d2c"/>
          <stop offset="1" stop-color="#11111f"/>
        </linearGradient>
      </defs>
      <rect width="640" height="360" fill="url(#bg)"/>
      <rect x="24" y="24" width="592" height="312" rx="18" fill="none" stroke="#ff6b6b" stroke-opacity="0.42" stroke-width="3"/>
      <circle cx="320" cy="158" r="58" fill="#ff6b6b" fill-opacity="0.92"/>
      <path d="M302 126v64l54-32z" fill="#fff"/>
      <text x="320" y="252" fill="#fff" font-family="Arial, sans-serif" font-size="34" font-weight="700" text-anchor="middle">Ep ${number}</text>
      <text x="320" y="294" fill="#d8d8e4" font-family="Arial, sans-serif" font-size="22" text-anchor="middle">${title}</text>
    </svg>
  `.trim();
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function getChapterServerCount(chapter) {
  return normalizeChapterServers(chapter).servers.length || 1;
}

function updateChapterUrl(chapterIndex, replace = false) {
  const anime = currentAnimeIndex !== null ? animesData[currentAnimeIndex] : null;
  if (!anime) return;

  const nextUrl = getChapterUrl(anime, currentAnimeIndex, chapterIndex);
  const state = { page: 'detail', index: currentAnimeIndex, ep: chapterIndex };
  if (replace) {
    history.replaceState(state, anime.titulo, nextUrl);
  } else {
    history.pushState(state, anime.titulo, nextUrl);
  }
}

// Cargar datos
async function loadAnimeData() {
  renderAnimeLoadingSkeleton();

  try {
    animesData = [];
    await loadSocialContent();
    renderSocialStrip();
    setupBuscador();
    setupNavegacion();
    setupAuth();
    await handleInitialState();
  } catch (error) {
    console.error("Error cargando datos:", error);
    const animeList = document.getElementById("anime-list");
    if (animeList) {
      animeList.innerHTML = '<div class="comment-empty">No se pudieron cargar los animes. Intenta recargar la pagina.</div>';
    }
  }
}

loadAnimeData();

// Navegación
function setupNavegacion() {
  const inicio = document.getElementById('inicio');
  const latino = document.getElementById('latino');
  const directorio = document.getElementById('directorio');

  inicio?.addEventListener('click', (e) => {
    e.preventDefault();
    renderSection('inicio', true);
  });

  latino?.addEventListener('click', (e) => {
    e.preventDefault();
    renderSection('latino', true);
  });

  directorio?.addEventListener('click', (e) => {
    e.preventDefault();
    renderSection('directorio', true);
  });
}

function mostrarAnimeInfo(index, pushState = true) {
  currentAnimeIndex = null;
  const anime = animesData[index];
  const main = document.querySelector("main");
  if (!anime || !main) {
    main.innerHTML = "<h2>Anime no encontrado</h2>";
    return;
  }

  updateAnimeSEO(index, anime);
  setBannerVisible(false);
  document.querySelectorAll('.nav-link').forEach(a => a.classList.remove('active'));

  if (pushState) {
    history.pushState(
      { page: 'anime', index },
      anime.titulo,
      getAnimeUrl(anime, index)
    );
  }

  const chapters = Array.isArray(anime.capitulos) ? anime.capitulos : [];
  const latestIndex = getLatestChapterIndex(chapters);
  const latestChapter = chapters[latestIndex];
  const orderedChapters = chapters
    .map((chapter, chapterIndex) => ({ chapter, chapterIndex }))
    .sort((a, b) => Number(getChapterNumberValue(b.chapter)) - Number(getChapterNumberValue(a.chapter)));
  const genreTags = Array.isArray(anime.generos) && anime.generos.length
    ? anime.generos.map(g => `<span class="genre-tag">${escapeHTML(g)}</span>`).join('')
    : '<span class="genre-tag">Anime</span>';

  main.innerHTML = `
    <article class="anime-profile">
      <section class="anime-profile-hero">
        <div class="anime-profile-poster">
          <img loading="lazy" src="${escapeHTML(safeImageUrl(anime.imagen))}" alt="${escapeHTML(anime.titulo)}" onerror="this.style.display='none'">
          ${anime.estado ? `<span class="anime-profile-status">${escapeHTML(anime.estado)}</span>` : ''}
        </div>
        <div class="anime-profile-copy">
          <h1>${escapeHTML(anime.titulo)}</h1>
          <div class="anime-profile-tags">${genreTags}</div>
          <div class="anime-profile-meta">
            ${anime.year ? `<span>Año: <strong>${escapeHTML(anime.year)}</strong></span>` : ''}
            <span>Capitulos: <strong>${escapeHTML(chapters.length)}</strong></span>
          </div>
          <p>${escapeHTML(anime.descripcion || 'Sinopsis no disponible por ahora.')}</p>
          ${latestChapter ? `
            <button type="button" class="profile-watch-btn" data-chapter-index="${latestIndex}">
              Último episodio: ${escapeHTML(latestChapter.numero)}
            </button>
          ` : ''}
        </div>
      </section>

      <section class="anime-profile-episodes">
        <div class="profile-section-head">
          <h2>Lista de episodios</h2>
          <span>${chapters.length} episodio${chapters.length === 1 ? '' : 's'}</span>
        </div>
        <div class="profile-episode-list">
          ${orderedChapters.map(({ chapter, chapterIndex }) => `
            <a href="${escapeHTML(getChapterUrl(anime, index, chapterIndex))}" class="profile-episode-row" data-chapter-index="${chapterIndex}">
              <img loading="lazy" src="${escapeHTML(safeImageUrl(getChapterPreviewImage(chapter, anime)))}" alt="${escapeHTML(anime.titulo)} episodio ${escapeHTML(chapter.numero)}" onerror="this.src='${escapeHTML(safeImageUrl(anime.imagen))}'">
              <span>
                <strong>Ep ${escapeHTML(chapter.numero)}</strong>
                <small>${escapeHTML(getChapterServerCount(chapter))} servidor${getChapterServerCount(chapter) === 1 ? '' : 'es'}</small>
              </span>
              <em>Ver</em>
            </a>
          `).join('') || '<div class="comment-empty">No hay capitulos disponibles.</div>'}
        </div>
      </section>
    </article>
  `;

  main.querySelector('.profile-watch-btn')?.addEventListener('click', event => {
    mostrarAnime(index, true, Number(event.currentTarget.dataset.chapterIndex));
  });

  main.querySelectorAll('.profile-episode-row').forEach(link => {
    link.addEventListener('click', event => {
      event.preventDefault();
      mostrarAnime(index, true, Number(link.dataset.chapterIndex));
    });
  });

  window.scrollTo({ top: 0, behavior: 'auto' });
}

// Mostrar anime detallado
function mostrarAnime(index, pushState = true, requestedChapterIndex = null) {
  currentAnimeIndex = index;
  const anime = animesData[index];
  const main = document.querySelector("main");
  if (!anime) {
    main.innerHTML = "<h2>Anime no encontrado</h2>";
    return;
  }
  updateAnimeSEO(index, anime);
  setBannerVisible(false);
  document.querySelectorAll('.nav-link').forEach(a => a.classList.remove('active'));

  const chapters = Array.isArray(anime.capitulos) ? anime.capitulos : [];
  const requestedIndex = Number.isInteger(requestedChapterIndex)
    ? requestedChapterIndex
    : getRequestedChapterIndex(chapters);
  currentChapterIndex = chapters.length
    ? Math.min(Math.max(0, requestedIndex), chapters.length - 1)
    : 0;
  currentServerIndex = 0;
  if (pushState) {
    history.pushState(
      { page: 'detail', index, ep: currentChapterIndex },
      anime.titulo,
      chapters.length ? getChapterUrl(anime, index, currentChapterIndex) : getAnimeUrl(anime, index)
    );
  } else if (window.location.search.includes('slug=') || window.location.search.includes('anime=')) {
    history.replaceState(
      { page: 'detail', index, ep: currentChapterIndex },
      anime.titulo,
      chapters.length ? getChapterUrl(anime, index, currentChapterIndex) : getAnimeUrl(anime, index)
    );
  }
  window.scrollTo({ top: 0, behavior: 'auto' });
  const selectedServer = chapters.length > 0 ? getChapterServer(chapters[currentChapterIndex], currentServerIndex) : null;
  const primerCap = selectedServer ? safeEmbedUrl(selectedServer.embed) : "";
  const currentChapter = chapters[currentChapterIndex];
  const recommendedAnimes = getRecommendedAnimes(anime, index, 6);

  main.innerHTML = `
    <div class="anime-detail">
      <header class="watch-head">
        <span>Estas viendo</span>
        <h1>${escapeHTML(anime.titulo)}</h1>
        ${currentChapter ? `<p>Episodio ${escapeHTML(currentChapter.numero)}</p>` : ''}
      </header>

      <div class="watch-layout">
        <section class="watch-player-column">
          <div class="server-section watch-server-section">
            <h2>Opciones</h2>
            <div class="server-list"></div>
          </div>

          <div class="video-container">
            <iframe
              data-video-src="${escapeHTML(primerCap)}"
              frameborder="0"
              allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
              allowfullscreen
              referrerpolicy="no-referrer">
            </iframe>
            <div class="video-play-overlay">
              <button type="button" class="video-play-button" ${primerCap ? '' : 'disabled'}>
                <span class="video-play-icon" aria-hidden="true">&#9658;</span>
                <span>Play</span>
              </button>
            </div>
          </div>

          <section class="download-section"></section>
        </section>

        <aside class="watch-sidebar">
          ${currentChapter ? `
            <div class="now-watching">
              <img loading="lazy" src="${escapeHTML(safeImageUrl(getChapterPreviewImage(currentChapter, anime)))}" alt="${escapeHTML(anime.titulo)} episodio ${escapeHTML(currentChapter.numero)}" onerror="this.style.display='none'">
              <div>
                <span>Reproduciendo</span>
                <strong>Ep ${escapeHTML(currentChapter.numero)}</strong>
                <small>${escapeHTML(getChapterServerCount(currentChapter))} servidor${getChapterServerCount(currentChapter) === 1 ? '' : 'es'}</small>
              </div>
            </div>
          ` : ''}

          <div class="watch-toolbar" aria-label="Navegacion de episodios">
            <button type="button" class="watch-nav-btn prev-chapter" ${currentChapterIndex <= 0 ? 'disabled' : ''}>
              <span aria-hidden="true">&#8249;</span>
              <strong>Anterior</strong>
            </button>
            <button type="button" class="watch-nav-btn next-chapter" ${currentChapterIndex >= chapters.length - 1 ? 'disabled' : ''}>
              <strong>Siguiente</strong>
              <span aria-hidden="true">&#8250;</span>
            </button>
            <a href="${escapeHTML(getAnimeUrl(anime, index))}" class="watch-list-toggle">
              <span aria-hidden="true">&#9776;</span>
              <strong>Ficha del anime</strong>
            </a>
            <button type="button" class="watch-nav-btn report-chapter">
              <strong>Reportar</strong>
            </button>
          </div>

          <p class="server-help">Si el video no carga, cambia de opcion o reporta el episodio.</p>

          <div class="episode-list-panel">
            <div class="episode-list-header">
              <h2>Capitulos</h2>
              <span>${chapters.length}</span>
            </div>
            <div class="episode-list">
              ${chapters.map((cap, idx) => `
                <button type="button" data-chapter-index="${idx}" class="episode-row ${idx === currentChapterIndex ? 'active' : ''}">
                  <img loading="lazy" src="${escapeHTML(safeImageUrl(getChapterPreviewImage(cap, anime)))}" alt="${escapeHTML(anime.titulo)} episodio ${escapeHTML(cap.numero)}" onerror="this.src='${escapeHTML(safeImageUrl(anime.imagen))}'">
                  <span>
                    <strong>Ep ${escapeHTML(cap.numero)}</strong>
                    <small>${escapeHTML(getChapterServerCount(cap))} servidor${getChapterServerCount(cap) === 1 ? '' : 'es'}</small>
                  </span>
                </button>
              `).join('') || '<div class="comment-empty">No hay capitulos disponibles.</div>'}
            </div>
          </div>
        </aside>
      </div>

      <div class="chapter-section hidden">
        <h2>Capítulos</h2>
        <div class="chapter-list">
          ${chapters.map((cap, idx) => `
            <button type="button" data-chapter-index="${idx}" class="chapter-btn ${idx === currentChapterIndex ? 'active' : ''}">
              <img loading="lazy" src="${escapeHTML(safeImageUrl(cap.imagen || anime.imagen))}" alt="${escapeHTML(anime.titulo)} episodio ${escapeHTML(cap.numero)}" onerror="this.src='${escapeHTML(safeImageUrl(anime.imagen))}'">
              <span>Ep ${escapeHTML(cap.numero)}</span>
              <small>${escapeHTML((cap.servers || []).length || 1)} servidor${((cap.servers || []).length || 1) === 1 ? '' : 'es'}</small>
            </button>
          `).join('') || '<div class="comment-empty">No hay capítulos disponibles.</div>'}
        </div>
      </div>

      <div class="comments-section">
        <h2>Comentarios</h2>
        <div id="comment-state"></div>
        <div id="comments-list" class="comments-list"></div>
      </div>

      ${recommendedAnimes.length ? `
        <section class="recommended-section">
          <div class="recommended-head">
            <h2>Animes recomendados</h2>
            <span>Tambien te puede gustar</span>
          </div>
          <div class="recommended-list">
            ${recommendedAnimes.map(renderRecommendedAnimeCard).join('')}
          </div>
        </section>
      ` : ''}
    </div>
  `;

  document.querySelectorAll('.episode-row, .chapter-btn').forEach(button => {
    button.addEventListener('click', () => {
      const idx = Number(button.dataset.chapterIndex);
      const chapter = chapters[idx];
      if (chapter) cambiarCapitulo(chapter.embed, anime.titulo, idx);
    });
  });

  main.querySelector('.prev-chapter')?.addEventListener('click', () => navigateChapter(-1));
  main.querySelector('.next-chapter')?.addEventListener('click', () => navigateChapter(1));
  main.querySelector('.report-chapter')?.addEventListener('click', reportCurrentChapter);
  main.querySelector('.watch-list-toggle')?.addEventListener('click', (event) => {
    event.preventDefault();
    mostrarAnimeInfo(index, true);
  });
  main.querySelector('.video-play-button')?.addEventListener('click', playSelectedChapter);
  main.querySelectorAll('.recommended-card').forEach(card => {
    card.addEventListener('click', event => {
      const recommendedIndex = Number(card.dataset.recommendedIndex);
      if (!Number.isInteger(recommendedIndex) || !animesData[recommendedIndex]) return;
      event.preventDefault();
      mostrarAnimeInfo(recommendedIndex, true);
    });
  });
  renderServerSelector(chapters[currentChapterIndex], 0);
  renderDownloadSection(chapters[currentChapterIndex]);

  if (chapters.length > 0) {
    loadCommentsForChapter(index, currentChapterIndex);
  }
}

function renderServerSelector(chapter, activeIndex = 0) {
  const main = document.querySelector("main");
  const list = main.querySelector('.server-list');
  const section = main.querySelector('.server-section');
  if (!list || !section) return;

  const servers = chapter ? normalizeChapterServers(chapter).servers : [];
  section.classList.toggle('hidden', servers.length === 0);
  list.innerHTML = servers.map((server, index) => `
    <button type="button" data-server-index="${index}" class="server-btn ${index === activeIndex ? 'active' : ''}">
      ${escapeHTML(server.name || `Servidor ${index + 1}`)}
    </button>
  `).join('');

  list.querySelectorAll('.server-btn').forEach(button => {
    button.addEventListener('click', () => {
      cambiarServidor(Number(button.dataset.serverIndex));
    });
  });
}

function renderDownloadSection(chapter) {
  const main = document.querySelector("main");
  const section = main?.querySelector('.download-section');
  if (!section) return;

  const downloads = normalizeDownloadLinks(chapter?.downloads);
  section.classList.toggle('hidden', downloads.length === 0);

  if (!downloads.length) {
    section.innerHTML = '';
    return;
  }

  section.innerHTML = `
    <div class="download-head">
      <div>
        <span>Links directos</span>
        <h2>Descargas</h2>
      </div>
      <small>${downloads.length} opcion${downloads.length === 1 ? '' : 'es'}</small>
    </div>
    <div class="download-list">
      ${downloads.map(item => `
        <a class="download-link" href="${escapeHTML(item.url)}" target="_blank" rel="nofollow noreferrer noopener">
          <span class="download-quality">${escapeHTML(item.quality || 'HD')}</span>
          <strong>${escapeHTML(item.server || 'Descarga')}</strong>
        </a>
      `).join('')}
    </div>
  `;
}

function toggleEpisodeList(forceOpen) {
  const main = document.querySelector("main");
  const panel = main.querySelector('.episode-list-panel');
  const button = main.querySelector('.watch-list-toggle');
  if (!panel || !button) return;

  const open = typeof forceOpen === 'boolean' ? forceOpen : panel.classList.contains('hidden');
  panel.classList.toggle('hidden', !open);
  button.setAttribute('aria-expanded', String(open));
}

function updateWatchControls(chapterIndex) {
  const anime = currentAnimeIndex !== null ? animesData[currentAnimeIndex] : null;
  const chapters = anime?.capitulos || [];
  const chapter = chapters[chapterIndex];
  const main = document.querySelector("main");
  if (!anime || !chapter || !main) return;

  main.querySelector('.prev-chapter')?.toggleAttribute('disabled', chapterIndex <= 0);
  main.querySelector('.next-chapter')?.toggleAttribute('disabled', chapterIndex >= chapters.length - 1);

  main.querySelectorAll('.episode-row, .chapter-btn').forEach((btn) => {
    btn.classList.toggle('active', Number(btn.dataset.chapterIndex) === chapterIndex);
  });

  const current = main.querySelector('.now-watching');
  const preview = getChapterPreviewImage(chapter, anime);
  if (current) {
    const image = current.querySelector('img');
    const title = current.querySelector('strong');
    if (image) {
      image.src = safeImageUrl(preview);
      image.alt = `${anime.titulo} episodio ${chapter.numero}`;
    }
    if (title) title.textContent = `Ep ${chapter.numero}`;
  }
}

function navigateChapter(direction) {
  const anime = currentAnimeIndex !== null ? animesData[currentAnimeIndex] : null;
  const chapters = anime?.capitulos || [];
  const nextIndex = currentChapterIndex + direction;
  if (!anime || nextIndex < 0 || nextIndex >= chapters.length) return;

  const chapter = chapters[nextIndex];
  cambiarCapitulo(chapter.embed, anime.titulo, nextIndex);
}

function playSelectedChapter() {
  const main = document.querySelector("main");
  const iframe = main.querySelector('.video-container iframe');
  const overlay = main.querySelector('.video-play-overlay');
  const embedUrl = iframe?.dataset.videoSrc || '';
  if (!iframe || !embedUrl) return;

  requestPopAdsForVideoPlay();
  iframe.src = embedUrl;
  if (overlay) overlay.classList.add('hidden');
}

window.cambiarCapitulo = function(embedUrl, titulo, idx) {
  const anime = currentAnimeIndex !== null ? animesData[currentAnimeIndex] : null;
  const chapter = anime?.capitulos?.[idx];
  const server = chapter ? getChapterServer(chapter, 0) : { embed: embedUrl };
  const main = document.querySelector("main");
  const iframe = main.querySelector('.video-container iframe');
  const overlay = main.querySelector('.video-play-overlay');
  if (iframe) {
    iframe.removeAttribute('src');
    iframe.dataset.videoSrc = safeEmbedUrl(server.embed);
  }
  if (overlay) {
    overlay.classList.remove('hidden');
  }

  // Actualizar botón activo
  document.querySelectorAll('.chapter-btn').forEach((btn, index) => {
    btn.classList.toggle('active', index === idx);
  });

  currentChapterIndex = idx;
  currentServerIndex = 0;
  updateWatchControls(idx);
  renderServerSelector(chapter, 0);
  renderDownloadSection(chapter);
  updateChapterUrl(idx);
  if (currentAnimeIndex !== null) {
    loadCommentsForChapter(currentAnimeIndex, idx);
  }
};

window.cambiarServidor = function(serverIndex) {
  const anime = currentAnimeIndex !== null ? animesData[currentAnimeIndex] : null;
  const chapter = anime?.capitulos?.[currentChapterIndex];
  const server = chapter ? getChapterServer(chapter, serverIndex) : null;
  const main = document.querySelector("main");
  const iframe = main.querySelector('.video-container iframe');
  const overlay = main.querySelector('.video-play-overlay');
  if (!server || !iframe) return;

  iframe.removeAttribute('src');
  iframe.dataset.videoSrc = safeEmbedUrl(server.embed);
  if (overlay) overlay.classList.remove('hidden');
  currentServerIndex = serverIndex;
  renderServerSelector(chapter, serverIndex);
};

function getCommentStorageKey(animeIndex, chapterIndex) {
  return `anime-comments-${animeIndex}-${chapterIndex}`;
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

function safeUrl(value, fallback = '') {
  const url = String(value || '').trim();
  if (url.startsWith('/images/')) return url;
  if (url.startsWith('images/')) return `/${url}`;

  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' ? parsed.href : fallback;
  } catch {
    return fallback;
  }
}

function safeImageUrl(value) {
  const url = String(value || '').trim();
  if (/^data:image\/(svg\+xml|png|jpe?g|webp);/i.test(url)) {
    return url;
  }
  if (url.startsWith('/images/') && !/\.[a-z0-9]+$/i.test(url)) {
    return `${url}.png`;
  }
  if (url.startsWith('images/') && !/\.[a-z0-9]+$/i.test(url)) {
    return `/${url}.png`;
  }

  return safeUrl(url, '/images/placeholder.png');
}

function safeEmbedUrl(value) {
  return safeUrl(value, '');
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

function getChapterNumber(animeIndex, chapterIndex) {
  const anime = animesData[animeIndex];
  return anime && anime.capitulos && anime.capitulos[chapterIndex]
    ? anime.capitulos[chapterIndex].numero
    : chapterIndex + 1;
}

function loadLocalComments(animeIndex, chapterIndex) {
  const stored = localStorage.getItem(getCommentStorageKey(animeIndex, chapterIndex));
  return stored ? JSON.parse(stored) : [];
}

function saveLocalComments(animeIndex, chapterIndex, comments) {
  localStorage.setItem(getCommentStorageKey(animeIndex, chapterIndex), JSON.stringify(comments));
}

async function loadComments(animeIndex, chapterIndex) {
  const anime = animesData[animeIndex];
  if (!anime) {
    throw new Error('Anime no encontrado.');
  }

  const params = new URLSearchParams({
    select: 'id,username,content,created_at',
    anime_title: `eq.${anime.titulo}`,
    chapter_number: `eq.${getChapterNumber(animeIndex, chapterIndex)}`,
    order: 'created_at.desc',
    limit: '100'
  });
  const response = await fetch(`${SUPABASE_URL}/rest/v1/comments?${params.toString()}`, {
    headers: SUPABASE_HEADERS
  });

  if (!response.ok) {
    const message = await response.text();
    console.error('Error cargando comentarios globales:', message);
    throw new Error(message);
  }

  const data = await response.json();
  return data.map(comment => ({
    username: comment.username,
    text: comment.content,
    date: comment.created_at
  }));
}

async function saveComment(animeIndex, chapterIndex, text) {
  const anime = animesData[animeIndex];
  const session = await refreshUserSession();
  const username = session ? getSessionUsername(session) : 'Invitado';

  if (!anime) {
    throw new Error('Anime no encontrado.');
  }
  if (!session?.access_token || !session?.user?.id) {
    throw new Error('Debes iniciar sesion para comentar.');
  }

  const response = await fetch(`${SUPABASE_URL}/rest/v1/comments`, {
    method: 'POST',
    headers: {
      ...SUPABASE_HEADERS,
      Authorization: `Bearer ${session.access_token}`,
      Prefer: 'return=minimal'
    },
    body: JSON.stringify({
      user_id: session.user.id,
      anime_title: anime.titulo,
      chapter_number: getChapterNumber(animeIndex, chapterIndex),
      username,
      content: text
    })
  });

  if (!response.ok) {
    const message = await response.text();
    console.error('Error guardando comentario global:', message);
    throw new Error(message);
  }
}

async function saveEpisodeReport(animeIndex, chapterIndex, reason) {
  const anime = animesData[animeIndex];
  const chapter = anime?.capitulos?.[chapterIndex];
  const server = chapter ? getChapterServer(chapter, currentServerIndex) : null;
  if (!anime || !chapter || !server) {
    throw new Error('No se pudo identificar el episodio.');
  }

  const session = await refreshUserSession();
  const username = session ? getSessionUsername(session) : 'Invitado';

  const response = await fetch(`${SUPABASE_URL}/rest/v1/episode_reports`, {
    method: 'POST',
    headers: {
      ...SUPABASE_HEADERS,
      Authorization: session?.access_token ? `Bearer ${session.access_token}` : SUPABASE_KEY,
      Prefer: 'return=minimal'
    },
    body: JSON.stringify({
      user_id: session?.user?.id || null,
      reporter_username: username,
      anime_title: anime.titulo,
      anime_slug: anime.slug || getAnimeSlug(anime, animeIndex),
      chapter_number: Number(getChapterNumberValue(chapter)) || null,
      server_name: server.name || 'Principal',
      embed_url: server.embed || '',
      page_url: window.location.href,
      reason: reason || 'El episodio no carga',
      status: 'open'
    })
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || 'No se pudo enviar el reporte.');
  }
}

async function reportCurrentChapter() {
  const reason = window.prompt('Cuéntanos qué falla: no carga, audio, subtítulos, link caído, etc.', 'El episodio no carga');
  if (reason === null) return;

  try {
    await saveEpisodeReport(currentAnimeIndex, currentChapterIndex, reason.trim() || 'El episodio no carga');
    alert('Gracias por reportar, pronto lo estaremos solucionando lo más pronto posible.');
  } catch (error) {
    alert(`No se pudo enviar el reporte: ${error.message || 'error desconocido'}`);
  }
}

async function renderComments(animeIndex, chapterIndex) {
  const commentsList = document.getElementById('comments-list');
  if (!commentsList) return;

  commentsList.innerHTML = '<div class="comment-empty">Cargando comentarios...</div>';

  let comments = [];
  try {
    comments = await loadComments(animeIndex, chapterIndex);
  } catch (error) {
    commentsList.innerHTML = `
      <div class="comment-empty">
        No se pudieron cargar los comentarios globales: ${escapeHTML(error.message || 'error desconocido')}
      </div>
    `;
    return;
  }

  if (currentAnimeIndex !== animeIndex || currentChapterIndex !== chapterIndex) return;

  commentsList.innerHTML = comments.length
    ? comments.map(comment => `
        <div class="comment-card">
          <p>${escapeHTML(comment.text)}</p>
          <span>${escapeHTML(comment.username || 'Usuario')} - ${new Date(comment.date).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}</span>
        </div>
      `).join('')
    : '<div class="comment-empty">No hay comentarios aún. Sé el primero.</div>';
}

function setupCommentForm(animeIndex, chapterIndex) {
  const submitButton = document.getElementById('submit-comment');
  const commentInput = document.getElementById('comment-input');
  if (!submitButton || !commentInput) return;

  submitButton.onclick = async () => {
    const text = commentInput.value.trim();
    if (!text) return;

    submitButton.disabled = true;
    submitButton.textContent = 'Enviando...';

    try {
      await saveComment(animeIndex, chapterIndex, text);
      commentInput.value = '';
      await renderComments(animeIndex, chapterIndex);
    } catch (error) {
      alert(`No se pudo enviar el comentario: ${error.message || 'error desconocido'}`);
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = 'Enviar comentario';
    }
  };
}

function loadCommentsForChapter(animeIndex, chapterIndex) {
  renderComments(animeIndex, chapterIndex);
  renderCommentState(animeIndex, chapterIndex);
}

function renderCommentState(animeIndex, chapterIndex) {
  const commentState = document.getElementById('comment-state');
  if (!commentState) return;

  if (!isLoggedIn()) {
    commentState.innerHTML = `
      <div class="comment-login-prompt">
        Inicia sesión para poder comentar.
        <button id="comment-login-btn" class="auth-btn small">Entrar</button>
      </div>
    `;
    const commentLoginBtn = document.getElementById('comment-login-btn');
    if (commentLoginBtn) {
      commentLoginBtn.addEventListener('click', () => openAuthModal('login'));
    }
    return;
  }

  const session = getSession();
  commentState.innerHTML = `
    <div class="comment-form">
      <textarea id="comment-input" placeholder="Escribe tu comentario..." rows="3"></textarea>
      <button id="submit-comment">Enviar comentario</button>
      <div class="comment-user">Comentando como <strong>${escapeHTML(getSessionUsername(session))}</strong></div>
    </div>
  `;

  setupCommentForm(animeIndex, chapterIndex);
}

function isLoggedIn() {
  const session = getSession();
  return !!session?.access_token;
}

function getSession() {
  return JSON.parse(localStorage.getItem('animeflv-session') || 'null');
}

function getSessionUsername(session = getSession()) {
  return session?.username
    || session?.user?.user_metadata?.username
    || session?.user?.email?.split('@')[0]
    || 'Usuario';
}

function saveSession(session) {
  localStorage.setItem('animeflv-session', JSON.stringify({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at,
    user: session.user,
    username: getSessionUsername(session)
  }));
}

function clearSession() {
  localStorage.removeItem('animeflv-session');
}

function getAuthMessage() {
  return document.getElementById('auth-message');
}

function setAuthMessage(text, type = '') {
  const message = getAuthMessage();
  if (!message) return;
  message.textContent = text;
  message.className = `auth-message ${type}`;
}

function getAuthErrorMessage(errorText) {
  const text = String(errorText || '').toLowerCase();
  if (text.includes('invalid login credentials')) return 'Email o contrasena incorrectos.';
  if (text.includes('user already registered') || text.includes('already registered')) return 'Ese email ya esta registrado.';
  if (text.includes('password')) return 'La contrasena debe tener al menos 6 caracteres.';
  if (text.includes('email')) return 'Revisa que el email este bien escrito.';
  return 'No se pudo completar la accion. Intenta otra vez.';
}

async function supabaseAuth(path, body) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, {
    method: 'POST',
    headers: SUPABASE_HEADERS,
    body: JSON.stringify(body)
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : {};

  if (!response.ok) {
    throw new Error(data.msg || data.message || text);
  }

  return data;
}

async function signInUser(email, password) {
  const session = await supabaseAuth('token?grant_type=password', { email, password });
  saveSession(session);
  return session;
}

function isSessionExpired(session) {
  return !!session?.expires_at && Date.now() >= (Number(session.expires_at) - 60) * 1000;
}

async function refreshUserSession() {
  const session = getSession();
  if (session && !session.access_token && !session.refresh_token) {
    clearSession();
    return null;
  }
  if (!session?.refresh_token || !isSessionExpired(session)) return session;

  try {
    const refreshed = await supabaseAuth('token?grant_type=refresh_token', {
      refresh_token: session.refresh_token
    });
    saveSession(refreshed);
    return getSession();
  } catch (error) {
    clearSession();
    return null;
  }
}

async function registerUser(username, email, password) {
  const session = await supabaseAuth('signup', {
    email,
    password,
    data: { username }
  });

  if (session?.access_token) {
    saveSession(session);
  }

  return session;
}

function openAuthModal(mode = 'login') {
  authMode = mode;
  const authModal = document.getElementById('auth-modal');
  const authTitle = document.getElementById('auth-title');
  const authSubmit = document.querySelector('.auth-submit');
  const switchLink = document.getElementById('switch-auth-mode');
  const usernameInput = document.getElementById('auth-username');
  const passwordInput = document.getElementById('auth-password');

  if (!authModal || !authTitle || !authSubmit || !switchLink) return;

  authModal.classList.remove('hidden');
  setAuthMessage('');
  if (mode === 'login') {
    authTitle.textContent = 'Iniciar sesión';
    authSubmit.textContent = 'Entrar';
    if (usernameInput) {
      usernameInput.classList.add('hidden');
      usernameInput.required = false;
    }
    if (passwordInput) passwordInput.autocomplete = 'current-password';
    switchLink.textContent = 'Regístrate';
  } else {
    authTitle.textContent = 'Crear cuenta';
    authSubmit.textContent = 'Registrar';
    if (usernameInput) {
      usernameInput.classList.remove('hidden');
      usernameInput.required = true;
    }
    if (passwordInput) passwordInput.autocomplete = 'new-password';
    switchLink.textContent = 'Inicia sesión';
  }
}

function closeAuthModal() {
  const authModal = document.getElementById('auth-modal');
  if (authModal) authModal.classList.add('hidden');
}

function updateAuthUI() {
  const session = getSession();
  const loginBtn = document.getElementById('login-btn');
  const logoutBtn = document.getElementById('logout-btn');
  const userGreeting = document.getElementById('user-greeting');

  if (session?.access_token) {
    if (userGreeting) userGreeting.textContent = `Hola, ${getSessionUsername(session)}`;
    if (loginBtn) loginBtn.classList.add('hidden');
    if (logoutBtn) logoutBtn.classList.remove('hidden');
  } else {
    if (userGreeting) userGreeting.textContent = '';
    if (loginBtn) loginBtn.classList.remove('hidden');
    if (logoutBtn) logoutBtn.classList.add('hidden');
  }
}

function setupAuth() {
  const loginBtn = document.getElementById('login-btn');
  const logoutBtn = document.getElementById('logout-btn');
  const closeModal = document.getElementById('close-auth-modal');
  const overlay = document.getElementById('modal-overlay');
  const switchLink = document.getElementById('switch-auth-mode');
  const authForm = document.getElementById('auth-form');

  if (loginBtn) {
    loginBtn.addEventListener('click', () => openAuthModal('login'));
  }
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      clearSession();
      updateAuthUI();
      if (currentAnimeIndex !== null) loadCommentsForChapter(currentAnimeIndex, currentChapterIndex);
    });
  }
  if (closeModal) {
    closeModal.addEventListener('click', closeAuthModal);
  }
  if (overlay) {
    overlay.addEventListener('click', closeAuthModal);
  }
  if (switchLink) {
    switchLink.addEventListener('click', (e) => {
      e.preventDefault();
      authMode = authMode === 'login' ? 'register' : 'login';
      openAuthModal(authMode);
    });
  }
  if (authForm) {
    authForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      e.stopImmediatePropagation();

      const usernameInput = document.getElementById('auth-username');
      const emailInput = document.getElementById('auth-email');
      const passwordInput = document.getElementById('auth-password');
      const submitButton = document.querySelector('.auth-submit');
      if (!emailInput || !passwordInput || !submitButton) return;

      const username = usernameInput?.value.trim() || emailInput.value.trim().split('@')[0];
      const email = emailInput.value.trim().toLowerCase();
      const password = passwordInput.value;
      if (!email || !password || (authMode === 'register' && !username)) return;

      submitButton.disabled = true;
      submitButton.textContent = authMode === 'login' ? 'Entrando...' : 'Registrando...';
      setAuthMessage('');

      try {
        const session = authMode === 'login'
          ? await signInUser(email, password)
          : await registerUser(username, email, password);

        if (!session?.access_token) {
          setAuthMessage('Cuenta creada. Revisa tu email para confirmar y luego inicia sesion.', 'success');
          return;
        }

        closeAuthModal();
        updateAuthUI();
        if (currentAnimeIndex !== null) loadCommentsForChapter(currentAnimeIndex, currentChapterIndex);
        if (usernameInput) usernameInput.value = '';
        emailInput.value = '';
        passwordInput.value = '';
      } catch (error) {
        setAuthMessage(getAuthErrorMessage(error.message), 'error');
      } finally {
        submitButton.disabled = false;
        submitButton.textContent = authMode === 'login' ? 'Entrar' : 'Registrar';
      }
    }, true);
  }

  refreshUserSession().finally(() => updateAuthUI());
}

// Buscador
function setupBuscador() {
  const buscador = document.getElementById("search");
  const searchResults = document.getElementById("search-results");
  let searchTimer = null;
  
  if (!buscador || buscador.dataset.listenerAdded) return;

  buscador.addEventListener("input", function () {
    const texto = this.value.trim();
    clearTimeout(searchTimer);
    
    if (texto.length === 0) {
      searchResults.classList.remove('active');
      return;
    }

    searchTimer = setTimeout(async () => {
      try {
        const resultados = await searchAnimes(texto);

        if (buscador.value.trim() !== texto) return;
        if (resultados.length === 0) {
          searchResults.classList.remove('active');
          return;
        }

        searchResults.innerHTML = '';
        resultados.forEach((anime) => {
          const animeIndex = animesData.indexOf(anime);
          const ultimoCapitulo = anime.capitulos && anime.capitulos.length > 0
            ? anime.capitulos[anime.capitulos.length - 1].numero
            : 'N/A';

          const resultItem = document.createElement('div');
          resultItem.className = 'search-result-item';
          resultItem.innerHTML = `
            <img loading="lazy" src="${escapeHTML(safeImageUrl(anime.imagen))}" alt="${escapeHTML(anime.titulo)}" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2260%22 height=%2280%22%3E%3Crect fill=%22%23444%22 width=%2260%22 height=%2280%22/%3E%3C/svg%3E'">
            <div class="search-result-info">
              <h4>${escapeHTML(anime.titulo)}</h4>
              <p>${escapeHTML((anime.descripcion || '').substring(0, 50))}...</p>
              <p class="episode">Episodio: ${escapeHTML(ultimoCapitulo)}</p>
            </div>
          `;

          resultItem.addEventListener('click', () => {
            mostrarAnimeInfo(animeIndex);
            buscador.value = '';
            searchResults.classList.remove('active');
          });

          searchResults.appendChild(resultItem);
        });

        searchResults.classList.add('active');
      } catch (error) {
        console.warn('No se pudo buscar animes:', error.message || error);
        searchResults.classList.remove('active');
      }
    }, 250);
  });

  // Cerrar al hacer clic fuera
  document.addEventListener('click', (e) => {
    if (e.target !== buscador && !searchResults.contains(e.target)) {
      searchResults.classList.remove('active');
    }
  });

  buscador.dataset.listenerAdded = true;
}

