// ============================================
// CONFIGURACIÓN SUPABASE
// ============================================
const SUPABASE_URL = 'tu_url_supabase';
const SUPABASE_KEY = 'tu_key_supabase';
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
  const response = await fetch(url, {
    ...options,
    headers: {
      ...SUPABASE_HEADERS,
      ...options.headers
    }
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`[${response.status}] ${error}`);
  }

  return response.json();
}

async function supabasePagedRequest(path, options = {}) {
  const limit = 1000;
  const results = [];
  let offset = 0;

  while (true) {
    const query = `${path}${path.includes('?') ? '&' : '?'}limit=${limit}&offset=${offset}`;
    const page = await supabaseRequest(query, options);
    
    if (!page || page.length === 0) break;
    
    results.push(...page);
    
    if (page.length < limit) break;
    
    offset += limit;
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
    const data = await supabasePagedRequest('/episodios?select=id,anime_id,numero,links');
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
        const chapters = packageData.chapters || [];
        
        if (chapters.length > 0) {
          let animeTitle = '';
          
          // Buscar el título en el JSON
          if (packageData.title) animeTitle = packageData.title;
          else if (packageData.anime) animeTitle = packageData.anime;
          else if (packageData.animeTitle) animeTitle = packageData.animeTitle;
          else animeTitle = getTitleBeforeJson(text.substring(0, cursor));

          for (const chapter of chapters) {
            const chapterNum = chapter.chapter_number || chapter.numero || 0;
            const serverName = chapter.server_name || chapter.servidor || 'Principal';
            const embedUrl = chapter.embed_url || chapter.url || '';
            const coverImage = pickImageFromValue(chapter);

            if (embedUrl) {
              rows.push({
                animeTitle: animeTitle.trim(),
                chapterNumber: chapterNum,
                serverName,
                embedUrl,
                coverImage
              });
            }
          }
        }

        cursor = endIndex;
      } catch (error) {
        cursor++;
      }
    } else {
      cursor++;
    }
  }

  return rows;
}

// ============================================
// CREAR Y ACTUALIZAR DATOS
// ============================================

async function findOrCreateAnime(animes, title, imageUrl) {
  const existing = animes.find(a => 
    a.titulo.toLowerCase() === title.toLowerCase()
  );

  if (existing) return existing;

  // Crear nuevo anime
  const newAnime = {
    titulo: title,
    imagen: imageUrl || '/images/placeholder.png',
    descripcion: `Anime: ${title}`,
    tipo: 'TV'
  };

  try {
    const result = await supabaseRequest('/animes', {
      method: 'POST',
      body: JSON.stringify([newAnime])
    });

    if (result && result[0]) {
      return result[0];
    }
  } catch (error) {
    console.error(`Error creando anime ${title}:`, error);
  }

  return null;
}

async function saveEpisodio(animeId, numero, titulo, servidor, url) {
  try {
    // Obtener episodio existente
    const existing = await supabaseRequest(
      `/episodios?anime_id=eq.${animeId}&numero=eq.${numero}`,
      { method: 'GET' }
    );

    const links = { [servidor]: url };

    if (existing && existing.length > 0) {
      // Actualizar: fusionar links
      const currentLinks = existing[0].links || {};
      const updatedLinks = { ...currentLinks, ...links };

      await supabaseRequest(
        `/episodios?id=eq.${existing[0].id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ links: updatedLinks, titulo: titulo || `Episodio ${numero}` })
        }
      );
    } else {
      // Crear nuevo episodio
      const newEpisodio = {
        anime_id: animeId,
        numero,
        titulo: titulo || `Episodio ${numero}`,
        links
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

      // Crear o obtener anime
      const coverImage = episodes[0].coverImage || '';
      let anime = await findOrCreateAnime(animes, animeTitle, coverImage);

      if (!anime) {
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
          ep.embedUrl
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
