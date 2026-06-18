const params = new URLSearchParams(window.location.search);
const animeId = params.get("id");

fetch("animes.json")
  .then(response => response.json())
  .then(animes => {
    const anime = animes[animeId];
    const animePage = document.getElementById("anime-page");

    if (!anime) {
      animePage.innerHTML = "<h2>Anime no encontrado</h2>";
      return;
    }

    function mostrarCapitulo(embedUrl) {
      animePage.innerHTML = `
        <div class="anime-detail">

          <h1>${anime.titulo}</h1>

          <div class="video-container">
            <iframe
              src="${embedUrl}"
              frameborder="0"
              allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
              referrerpolicy="no-referrer"
              allowfullscreen>
            </iframe>
          </div>

          <p>${anime.descripcion}</p>

          <h2>Capítulos</h2>

          <div class="chapter-list">
            ${anime.capitulos
              .map(
                cap => `
                <button onclick="cambiarCapitulo('${cap.embed}')">
                  Episodio ${cap.numero}
                </button>
              `
              )
              .join("")}
          </div>

        </div>
      `;
    }

    window.cambiarCapitulo = function(embedUrl) {
      mostrarCapitulo(embedUrl);
    };

    mostrarCapitulo(anime.capitulos[0].embed);
  })
  .catch(error => {
    console.error("Error:", error);
  });
