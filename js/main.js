// ===== LAZY LOADING SYSTEM =====
const lazyQueue = [];
let isLoading = false;

// Load items with debounce
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

  // Cargar datos al iniciar (lazy)
  loadInitialData();
});

// ===== INICIAL DATA LOADING =====
function loadInitialData() {
  queueLoad(() => loadEpisodes());
  queueLoad(() => loadTopAnimes());
  queueLoad(() => loadSidebar());
}

// Load episodes
function loadEpisodes() {
  return new Promise((resolve) => {
    const grid = document.getElementById('episodesGrid');
    if (!grid) return resolve();

    fetch('https://api.jikan.moe/v4/watch/episodes')
      .then(res => res.json())
      .then(data => {
        const episodes = data.data || [];
        grid.innerHTML = episodes.slice(0, 12).map((ep, i) => `
          <div class="episode-card">
            <div class="episode-image">
              ${ep.entry?.images?.jpg?.image_url ? `
                <img src="${ep.entry.images.jpg.image_url}" alt="${ep.entry.title}" loading="lazy">
              ` : `
                <div class="episode-placeholder">▶</div>
              `}
              <div class="play-overlay">
                <div class="play-button">▶</div>
              </div>
              <div class="episode-badge">Ep ${i + 1}</div>
            </div>
            <div class="episode-info">
              <div class="episode-title">${ep.entry?.title || 'Episodio'}</div>
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

// Load top animes
function loadTopAnimes() {
  return new Promise((resolve) => {
    const grid = document.getElementById('topAnimesGrid');
    if (!grid) return resolve();

    fetch('https://api.jikan.moe/v4/top/anime?limit=12')
      .then(res => res.json())
      .then(data => {
        const animes = data.data || [];
        grid.innerHTML = animes.map(anime => `
          <div class="anime-card">
            <div class="anime-image">
              ${anime.images?.jpg?.image_url ? `
                <img src="${anime.images.jpg.image_url}" alt="${anime.title}" loading="lazy">
              ` : `
                <div class="episode-placeholder">▶</div>
              `}
              <div class="anime-badge">${anime.type || 'TV'}</div>
            </div>
            <div class="anime-title">${anime.title}</div>
          </div>
        `).join('');
        resolve();
      })
      .catch(err => {
        console.error('Error loading top animes:', err);
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

    fetch('https://api.jikan.moe/v4/seasons/now?limit=15')
      .then(res => res.json())
      .then(data => {
        const animes = data.data || [];
        list.innerHTML = animes.map(anime => `
          <li class="sidebar-item">
            <a href="#" class="sidebar-link">
              <span>${anime.title}</span>
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
