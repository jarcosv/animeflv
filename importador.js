// ============================================
// CONFIGURACIÓN SUPABASE
// ============================================
const SUPABASE_URL = 'https://vanmxvfhagqfbwynpwzt.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im53dm1sZ2pzdHNmZGxid3pkYnN4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2OTUyNTYsImV4cCI6MjA5NzI3MTI1Nn0.mWSykvxeLxC437SLr4IPhnn2xdZKnHNszvd_7CnvbR8';
const SUPABASE_HEADERS = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json'
};

// ============================================
// UTILIDADES
// ============================================

function escapeHTML(value) {
  return String(value || '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  }[char]));
}

function normalizeImagePath(value) {
  const url = String(value || '').trim();
  if (!url) return '';
  if (/^https:\/\//i.test(url)) return url;
  if (url.startsWith('/')) return url;
  return `/${url}`;
}

function pickImageFromValue(value) {
  if (!value) return '';
  
  if (typeof value === 'string') {
    const normalized = normalizeImagePath(value);
    if (normalized && /\.(jpg|jpeg|png|webp|gif)$/i.test(normalized)) {
      return normalized;
    }
  }
  
  if (Array.isArray(value)) {
    for (const item of value) {
      const img = pickImageFromValue(item);
      if (img) return img;
    }
  }
  
  if (typeof value === 'object') {
    for (const key of ['image', 'imagen', 'cover', 'poster', 'thumbnail', 'thumb', 'url']) {
      const img = pickImageFromValue(value[key]);
      if (img) return img;
    }
  }
  
  return '';
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

// ============================================
// REQUESTS A SUPABASE
// ============================================

async function supabaseRequest(path, options = {}) {
  const url = `${SUPABASE_URL}/rest/v1${path}`;
  
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        ...SUPABASE_HEADERS,
        ...options.headers
      }
    });

    const text = await response.text();

    if (!response.ok) {
      throw new Error(`[${response.status}] ${text}`);
    }

    return text ? JSON.parse(text) : [];
  } catch (error) {
    console.error('Supabase Error:', error);
    throw error;
  }
}

async function supabasePagedRequest(path, options = {}) {
  const limit = 1000;
  const results = [];
  let offset = 0;

  while (true) {
    try {
      const separator = path.includes('?') ? '&' : '?';
      const query = `${path}${separator}limit=${limit}&offset=${offset}`;
      const page = await supabaseRequest(query, options);
      
      if (!page || !Array.isArray(page) || page.length === 0) break;
      
      results.push(...page);
      
      if (page.length < limit) break;
      
      offset += limit;
    } catch (error) {
      console.error('Error en pagination:', error);
      break;
    }
  }

  return results;
}

// ============================================
// CARGAR DATOS
// ============================================

async function loadAnimes() {
  try {
    const data = await supabasePagedRequest('/animes?select=id,titulo,imagen');
    return data;
  } catch (error) {
    console.error('Error cargando animes:', error);
    return [];
  }
}

async function loadEpisodios() {
  try {
    const data = await supabasePagedRequest('/episodios?select=id,anime_id,numero,titulo,links,cover_image,created_at&order=created_at.desc');
    return data;
  } catch (error) {
    console.error('Error cargando episodios:', error);
    return [];
  }
}

// ============================================
// PARSING DE IMPORTACIÓN MASIVA
// ============================================

function findJsonEnd(text, startIndex) {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = startIndex; i < text.length; i++) {
    const char = text[i];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === '\\') {
      escaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (char === '{' || char === '[') {
      depth++;
    } else if (char === '}' || char === ']') {
      depth--;
      if (depth === 0) return i + 1;
    }
  }

  return text.length;
}

function getTitleBeforeJson(text) {
  const firstBrace = text.indexOf('{');
  if (firstBrace <= 0) return '';
  
  const beforeJson = text.substring(0, firstBrace).trim();
  const lines = beforeJson.split('\n');
  return lines[lines.length - 1].trim();
}

function parseBulkChapterImport(rawText) {
  const rows = [];
  let cursor = 0;
  const text = rawText || '';

  while (cursor < text.length) {
    const remainingText = text.substring(cursor);
    const trimmed = remainingText.trimLeft();
    const skipChars = remainingText.length - trimmed.length;
    cursor += skipChars;

    if (cursor >= text.length) break;

    const firstChar = text[cursor];

    if (firstChar === '{' || firstChar === '[') {
      const endIndex = findJsonEnd(text, cursor);
      const jsonStr = text.substring(cursor, endIndex);

      try {
        const packageData = JSON.parse(jsonStr);
        
        // Detectar formato bulk_package o array de capítulos
        if (packageData.import_type === 'bulk_package' || packageData.chapters || Array.isArray(packageData)) {
          let chapters = [];
          
          // Si es un array directamente, es un array de capítulos
          if (Array.isArray(packageData)) {
            chapters = packageData;
          } else {
            chapters = packageData.chapters || [];
          }
          
          if (chapters.length > 0) {
            let animeTitle = '';
            let animeCover = '';
            
            // Obtener título del anime (solo si no es array puro)
            if (!Array.isArray(packageData)) {
              if (packageData.anime_title) animeTitle = packageData.anime_title;
              else if (packageData.title) animeTitle = packageData.title;
              else if (packageData.anime) animeTitle = packageData.anime;
              else if (packageData.animeTitle) animeTitle = packageData.animeTitle;
              else animeTitle = getTitleBeforeJson(text.substring(0, cursor));

              // Obtener portada del anime
              if (packageData.anime_cover) animeCover = packageData.anime_cover;
              else if (packageData.image_url) animeCover = packageData.image_url;
              else if (packageData.cover) animeCover = packageData.cover;
              else if (packageData.poster) animeCover = packageData.poster;
            }

            // Si no hay título, usar del primer capítulo o default
            if (!animeTitle && chapters.length > 0) {
              animeTitle = chapters[0].anime_title || 
                          chapters[0].title || 
                          chapters[0].anime || 
                          'Anime Importado';
            }

            for (const chapter of chapters) {
              // Permitir varios formatos de número de episodio
              let chapterNum = chapter.chapter_number || 
                              chapter.numero || 
                              chapter.episode_number ||
                              chapter.episodio ||
                              0;
              
              // Si es un número en string, convertir
              if (typeof chapterNum === 'string' && !isNaN(chapterNum)) {
                chapterNum = parseInt(chapterNum, 10);
              }

              const serverName = chapter.server_name || 
                                chapter.servidor || 
                                chapter.server ||
                                'Principal';
              
              // Permitir varios formatos de URL
              const embedUrl = chapter.embed_url || 
                              chapter.url || 
                              chapter.link ||
                              chapter.enlace || '';
              
              const coverImage = chapter.cover_image || 
                                chapter.cover ||
                                chapter.image ||
                                pickImageFromValue(chapter) || '';

              // Crear fila incluso si no hay URL (permite edición posterior)
              if (animeTitle && chapterNum > 0) {
                rows.push({
                  animeTitle: animeTitle.trim(),
                  chapterNumber: chapterNum,
                  serverName,
                  embedUrl,
                  coverImage,
                  animeCover: animeCover
                });
              }
            }
          }
        }

        cursor = endIndex;
      } catch (error) {
        console.error('Error parsing JSON:', error.message);
        cursor++;
      }
    } else {
      cursor++;
    }
  }

  console.log(`Parser encontró ${rows.length} episodios`);
  return rows;
}

// ============================================
// CREAR Y ACTUALIZAR DATOS
// ============================================

async function findOrCreateAnime(animes, title, imageUrl) {
  // Buscar anime existente
  const existing = animes.find(a => 
    a.titulo.toLowerCase().trim() === title.toLowerCase().trim()
  );

  if (existing) return existing;

  // Crear nuevo anime
  const newAnime = {
    titulo: title.trim(),
    imagen: imageUrl || '/images/placeholder.png',
    descripcion: `Anime: ${title}`,
    tipo: 'TV'
  };

  try {
    const result = await supabaseRequest('/animes', {
      method: 'POST',
      body: JSON.stringify([newAnime])
    });

    if (result && Array.isArray(result) && result[0]) {
      return result[0];
    }
    
    // Si falla, retornar objeto temporal con id generado
    return { 
      id: Math.floor(Math.random() * 1000000), 
      ...newAnime 
    };
  } catch (error) {
    console.error(`Error creando anime ${title}:`, error);
    // Retornar objeto temporal
    return { 
      id: Math.floor(Math.random() * 1000000), 
      ...newAnime 
    };
  }
}

async function saveEpisodio(animeId, numero, titulo, servidor, url, coverImage = '') {
  try {
    // Buscar episodio existente con INNER JOIN
    const query = `/episodios?anime_id=eq.${animeId}&numero=eq.${numero}`;
    const existing = await supabaseRequest(query);

    const links = { [servidor]: url };

    if (existing && Array.isArray(existing) && existing.length > 0) {
      // Actualizar: fusionar links
      const currentLinks = existing[0].links || {};
      const updatedLinks = { ...currentLinks, ...links };

      await supabaseRequest(
        `/episodios?id=eq.${existing[0].id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ 
            links: updatedLinks, 
            titulo: titulo || `Episodio ${numero}`,
            cover_image: coverImage || existing[0].cover_image
          })
        }
      );
    } else {
      // Crear nuevo episodio
      const newEpisodio = {
        anime_id: animeId,
        numero,
        titulo: titulo || `Episodio ${numero}`,
        links,
        cover_image: coverImage || ''
      };

      await supabaseRequest('/episodios', {
        method: 'POST',
        body: JSON.stringify([newEpisodio])
      });
    }

    return true;
  } catch (error) {
    console.error(`Error guardando episodio ${numero}:`, error);
    return false;
  }
}

// ============================================
// IMPORTADOR PRINCIPAL
// ============================================

async function importarMasivo(rawText) {
  console.log('Iniciando importación masiva...');
  
  try {
    // Cargar animes existentes
    const animes = await loadAnimes();
    const rows = parseBulkChapterImport(rawText);

    if (rows.length === 0) {
      throw new Error('No se encontraron episodios para importar');
    }

    console.log(`Se encontraron ${rows.length} episodios`);

    // Agrupar por anime
    const animeGroups = {};
    for (const row of rows) {
      if (!animeGroups[row.animeTitle]) {
        animeGroups[row.animeTitle] = [];
      }
      animeGroups[row.animeTitle].push(row);
    }

    // Procesar cada anime
    let totalImported = 0;
    for (const [animeTitle, episodes] of Object.entries(animeGroups)) {
      console.log(`Procesando: ${animeTitle} (${episodes.length} episodios)`);

      // Usar anime_cover del paquete JSON
      const coverImage = episodes[0].animeCover || episodes[0].coverImage || '';
      let anime = await findOrCreateAnime(animes, animeTitle, coverImage);

      if (!anime || !anime.id) {
        console.warn(`No se pudo crear anime: ${animeTitle}`);
        continue;
      }

      // Guardar episodios
      for (const ep of episodes) {
        const success = await saveEpisodio(
          anime.id,
          ep.chapterNumber,
          `Episodio ${ep.chapterNumber}`,
          ep.serverName,
          ep.embedUrl,
          ep.coverImage
        );

        if (success) {
          totalImported++;
        }
      }
    }

    console.log(`✓ Importación completada: ${totalImported} episodios`);
    return { success: true, imported: totalImported };

  } catch (error) {
    console.error('Error en importación masiva:', error);
    return { success: false, error: error.message };
  }
}

// ============================================
// EXPORTAR PARA USO EN MÓDULOS
// ============================================
export {
  importarMasivo,
  parseBulkChapterImport,
  findOrCreateAnime,
  saveEpisodio,
  supabaseRequest,
  loadAnimes,
  loadEpisodios
};
