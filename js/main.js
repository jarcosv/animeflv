// Hamburger Menu Handler
document.addEventListener('DOMContentLoaded', function() {
  const hamburger = document.getElementById('hamburger');
  const navbarLinks = document.getElementById('navbarLinks');
  
  if (hamburger && navbarLinks) {
    hamburger.addEventListener('click', function() {
      this.classList.toggle('active');
      navbarLinks.classList.toggle('active');
    });

    // Close menu when a link is clicked
    const navLinks = navbarLinks.querySelectorAll('.nav-link');
    navLinks.forEach(link => {
      link.addEventListener('click', function() {
        hamburger.classList.remove('active');
        navbarLinks.classList.remove('active');
      });
    });
  }
});

// Generic anime loader function
function loadAnimeData(apiUrl, gridId) {
  const grid = document.getElementById(gridId);
  if (!grid) return;

  fetch(apiUrl)
    .then(response => response.json())
    .then(data => {
      const animes = data.data || [];
      if (animes.length > 0) {
        grid.innerHTML = animes.map(anime => createAnimeCard(anime)).join('');
      }
    })
    .catch(error => {
      console.error('Error loading anime:', error);
      if (grid) {
        grid.innerHTML = '<div class="loading">Error al cargar. Intenta de nuevo.</div>';
      }
    });
}

// Create anime card HTML
function createAnimeCard(anime) {
  const image = anime.images?.jpg?.image_url ? 
    `<img src="${anime.images.jpg.image_url}" alt="${anime.title}" class="card-image">` :
    `<div class="card-placeholder"><span class="play-icon">▶</span></div>`;
  
  const rating = anime.score ? 
    `<div class="badge badge-rating"><span class="star">★</span> ${anime.score.toFixed(1)}</div>` :
    '';

  return `
    <div class="anime-card">
      <div class="card-image-container">
        ${image}
        <div class="badge badge-type">${anime.type || 'TV'}</div>
        ${rating}
      </div>
      <div class="card-title">${anime.title}</div>
    </div>
  `;
}
