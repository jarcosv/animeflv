const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const FACEBOOK_PAGE_ID = process.env.FACEBOOK_PAGE_ID;
const FACEBOOK_PAGE_ACCESS_TOKEN = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
const FACEBOOK_PAGES_JSON = process.env.FACEBOOK_PAGES_JSON;
const FACEBOOK_API_VERSION = process.env.FACEBOOK_API_VERSION || 'v25.0';
const SITE_URL = 'https://animeflv.lat';

function slugify(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90);
}

function errorResponse(res, status, message) {
  res.status(status).json({ success: false, error: String(message) });
}

async function parseJsonBody(req) {
  if (req.body && typeof req.body === 'object') {
    return req.body;
  }

  if (!req.headers['content-type'] || !req.headers['content-type'].includes('application/json')) {
    throw new Error('Content-Type debe ser application/json.');
  }

  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error('JSON inválido en el cuerpo de la solicitud.'));
      }
    });
    req.on('error', reject);
  });
}

async function verifySupabaseAuth(token) {
  if (!token) {
    throw new Error('Token de autorización faltante.');
  }

  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: SUPABASE_KEY,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Autenticación Supabase fallida: ${text}`);
  }

  const user = await response.json();
  if (!user || !user.id) {
    throw new Error('Usuario no autorizado.');
  }

  const adminParams = new URLSearchParams({
    select: 'user_id',
    user_id: `eq.${user.id}`,
    limit: '1'
  });
  const adminResponse = await fetch(`${SUPABASE_URL}/rest/v1/admin_users?${adminParams.toString()}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: SUPABASE_KEY,
      'Content-Type': 'application/json'
    }
  });

  if (!adminResponse.ok) {
    throw new Error('No se pudo comprobar el permiso de administrador.');
  }

  const admins = await adminResponse.json();
  if (!Array.isArray(admins) || !admins.length) {
    throw new Error('El usuario no tiene permiso de administrador.');
  }

  return user;
}

function getFacebookPages() {
  if (FACEBOOK_PAGES_JSON) {
    let parsed;
    try {
      parsed = JSON.parse(FACEBOOK_PAGES_JSON);
    } catch {
      throw new Error('FACEBOOK_PAGES_JSON no contiene JSON valido.');
    }

    if (!Array.isArray(parsed) || !parsed.length) {
      throw new Error('FACEBOOK_PAGES_JSON debe ser una lista con al menos una pagina.');
    }

    const pages = parsed.map((page, index) => ({
      name: String(page?.name || `Pagina ${index + 1}`).trim(),
      pageId: String(page?.page_id || '').trim(),
      accessToken: String(page?.access_token || '').trim()
    }));

    if (pages.some(page => !page.pageId || !page.accessToken)) {
      throw new Error('Cada pagina en FACEBOOK_PAGES_JSON necesita page_id y access_token.');
    }

    return pages.filter((page, index, all) => (
      all.findIndex(candidate => candidate.pageId === page.pageId) === index
    ));
  }

  if (FACEBOOK_PAGE_ID && FACEBOOK_PAGE_ACCESS_TOKEN) {
    return [{
      name: 'Pagina de Facebook',
      pageId: FACEBOOK_PAGE_ID,
      accessToken: FACEBOOK_PAGE_ACCESS_TOKEN
    }];
  }

  throw new Error('Falta FACEBOOK_PAGES_JSON o las variables FACEBOOK_PAGE_ID y FACEBOOK_PAGE_ACCESS_TOKEN.');
}

async function findAnimeSlugByTitle(animeTitle) {
  const params = new URLSearchParams({
    select: 'slug',
    titulo: `eq.${animeTitle}`,
    limit: '1'
  });
  const url = `${SUPABASE_URL}/rest/v1/animes?${params.toString()}`;
  const response = await fetch(url, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Error consultando anime: ${text}`);
  }

  const rows = await response.json();
  if (Array.isArray(rows) && rows.length && rows[0].slug) {
    return rows[0].slug;
  }

  return slugify(animeTitle);
}

function buildFacebookMessage(animeTitle, chapterNumber, link) {
  const title = String(animeTitle || '').trim();
  return `${title} capitulo ${chapterNumber}\n\n${link}`;
}

async function publishFacebookPost(page, message, link) {
  const body = new URLSearchParams({
    message,
    link,
    access_token: page.accessToken,
    published: 'true'
  });

  const response = await fetch(`https://graph.facebook.com/${FACEBOOK_API_VERSION}/${encodeURIComponent(page.pageId)}/feed`, {
    method: 'POST',
    body
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Facebook API error: ${text}`);
  }

  const result = await response.json();
  return { name: page.name, page_id: page.pageId, post_id: result.id };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return errorResponse(res, 405, 'Method not allowed.');
  }

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return errorResponse(res, 500, 'Faltan variables de entorno de Supabase.');
  }

  try {
    const authHeader = String(req.headers.authorization || '');
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    await verifySupabaseAuth(token);

    const body = await parseJsonBody(req);
    const animeTitle = String(body.anime_title || '').trim();
    const chapterNumber = String(body.chapter_number || '').trim();

    if (!animeTitle || !chapterNumber) {
      return errorResponse(res, 400, 'anime_title y chapter_number son obligatorios.');
    }

    const slug = await findAnimeSlugByTitle(animeTitle);
    const link = `${SITE_URL}/ver/${encodeURIComponent(slug)}-episodio-${encodeURIComponent(chapterNumber)}`;
    const message = buildFacebookMessage(animeTitle, chapterNumber, link);
    const pages = getFacebookPages();
    const settled = await Promise.allSettled(
      pages.map(page => publishFacebookPost(page, message, link))
    );
    const published = settled
      .filter(result => result.status === 'fulfilled')
      .map(result => result.value);
    const failed = settled
      .map((result, index) => ({ result, page: pages[index] }))
      .filter(item => item.result.status === 'rejected')
      .map(item => ({
        name: item.page.name,
        page_id: item.page.pageId,
        error: item.result.reason?.message || 'Error desconocido de Facebook.'
      }));

    if (!published.length) {
      return res.status(502).json({
        success: false,
        error: 'Facebook rechazo la publicacion en todas las paginas.',
        published,
        failed
      });
    }

    res.status(failed.length ? 207 : 200).json({
      success: failed.length === 0,
      partial: failed.length > 0,
      link,
      published,
      failed
    });
  } catch (error) {
    console.error(error);
    errorResponse(res, 500, error.message || 'Error al publicar en Facebook.');
  }
};
