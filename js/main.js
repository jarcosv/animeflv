// ===== SUPABASE CONFIG =====
const SUPABASE_URL = 'https://nwmklqstsfdbwzdbsx.supabase.co';
const SUPABASE_KEY = 'sb_publishable_EhgSd_v1QI6wxfii43fY6w_24g2Z4sA';

class SupabaseClient {
  constructor(url, key) {
    this.url = url;
    this.key = key;
  }

  async request(method, endpoint, data = null) {
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'apikey': this.key,
        'Authorization': `Bearer ${this.key}`
      }
    };

    if (data) options.body = JSON.stringify(data);

    const response = await fetch(`${this.url}/rest/v1${endpoint}`, options);
    
    if (!response.ok) {
      throw new Error(`Supabase error: ${response.statusText}`);
    }

    return await response.json();
  }

  async getAnimes() {
    return this.request('GET', '/animes?select=*');
  }

  async getEpisodes(animeId) {
    return this.request('GET', `/episodios?anime_id=eq.${animeId}&select=*`);
  }

  async insertAnime(data) {
    return this.request('POST', '/animes', data);
  }

  async insertEpisode(data) {
    return this.request('POST', '/episodios', data);
  }

  async getAllEpisodes() {
    return this.request('GET', '/episodios?select=*,animes(titulo,imagen)&order=id.desc&limit=12');
  }
}

const db = new SupabaseClient(SUPABASE_URL, SUPABASE_KEY);

// ===== LAZY LOADING SYSTEM =====
const lazyQueue = [];
let isLoading = false;

function loadNextBatch() {
  if (isLoading || lazyQueue.length === 0) return;
  isLoading = true;

  const item = lazyQueue.shift();
  if (item.loadFn) {
    item.loadFn().finally(() => {
      isLoading = false;
      if (lazyQueue.length > 0) {
        setTimeout(loadNextBatch, 300);
      }
    });
  }
}

function queueLoad(loadFn) {
  lazyQueue.push({ loadFn });
  if (!isLoading) loadNextBatch();
}

// ===== MENU HANDLER =====
document.addEventListener('DOMContentLoaded', function() {
  const hamburger = document.getElementById('hamburger');
  const navbarLinks = document.getElementById('navbarLinks');
  
  if (hamburger && navbarLinks) {
    hamburger.addEventListener('click', function() {
      this.classList.toggle('active');
      navbarLinks.classList.toggle('active');
    });

    const navLinks = navbarLinks.querySelectorAll('.nav-link');
    navLinks.forEach(link => {
      link.addEventListener('click', function() {
        hamburger.classList.remove('active');
        navbarLinks.classList.remove('active');
      });
    });
  }

  loadInitialData();
});

// ===== INICIAL DATA LOADING =====
function loadInitialData() {
  queueLoad(() => loadEpisodes());
  queueLoad(() => loadTopAnimes());
  queueLoad(() => loadSidebar());
}

// Load episodes from Supabase
function loadEpisodes() {
  return new Promise((resolve) => {
    const grid = document.getElementById('episodesGrid');
    if (!grid) return resolve();

    db.getAllEpisodes()
      .then(episodes => {
        if (!episodes || episodes.length === 0) {
          grid.innerHTML = '<div class="loading">No hay episodios disponibles</div>';
          return resolve();
        }

        grid.innerHTML = episodes.map((ep, i) => `
          <div class="episode-card">
            <div class="episode-image">
              ${ep.animes?.imagen ? `
                <img src="${ep.animes.imagen}" alt="${ep.animes.titulo}" loading="lazy">
              ` : `
                <div class="episode-placeholder">▶</div>
              `}
              <div class="play-overlay">
                <div class="play-button">▶</div>
              </div>
              <div class="episode-badge">Ep ${ep.numero}</div>
            </div>
            <div class="episode-info">
              <div class="episode-title">${ep.animes?.titulo || 'Episodio'}</div>
            </div>
          </div>
        `).join('');
        resolve();
      })
      .catch(err => {
        console.error('Error loading episodes:', err);
        grid.innerHTML = '<div class="loading">Error al cargar episodios</div>';
        resolve();
      });
  });
}

// Load top animes from Supabase
function loadTopAnimes() {
  return new Promise((resolve) => {
    const grid = document.getElementById('topAnimesGrid');
    if (!grid) return resolve();

    db.getAnimes()
      .then(animes => {
        if (!animes || animes.length === 0) {
          grid.innerHTML = '<div class="loading">No hay animes disponibles</div>';
          return resolve();
        }

        grid.innerHTML = animes.slice(0, 12).map(anime => `
          <div class="anime-card">
            <div class="anime-image">
              ${anime.imagen ? `
                <img src="${anime.imagen}" alt="${anime.titulo}" loading="lazy">
              ` : `
                <div class="episode-placeholder">▶</div>
              `}
              <div class="anime-badge">${anime.tipo || 'TV'}</div>
            </div>
            <div class="anime-title">${anime.titulo}</div>
          </div>
        `).join('');
        resolve();
      })
      .catch(err => {
        console.error('Error loading animes:', err);
        grid.innerHTML = '<div class="loading">Error al cargar animes</div>';
        resolve();
      });
  });
}

// Load sidebar animes
function loadSidebar() {
  return new Promise((resolve) => {
    const list = document.getElementById('sidebarList');
    if (!list) return resolve();

    db.getAnimes()
      .then(animes => {
        if (!animes || animes.length === 0) {
          list.innerHTML = '<li class="sidebar-item"><span style="padding: 10px 14px; display: block;">Sin animes</span></li>';
          return resolve();
        }

        list.innerHTML = animes.slice(0, 15).map(anime => `
          <li class="sidebar-item">
            <a href="#" class="sidebar-link">
              <span>${anime.titulo}</span>
              <span class="sidebar-badge">ANIME</span>
            </a>
          </li>
        `).join('');
        resolve();
      })
      .catch(err => {
        console.error('Error loading sidebar:', err);
        resolve();
      });
  });
}
