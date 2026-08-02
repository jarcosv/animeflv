const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const FACEBOOK_PAGE_ID = process.env.FACEBOOK_PAGE_ID;
const FACEBOOK_PAGE_ACCESS_TOKEN = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
const FACEBOOK_API_VERSION = process.env.FACEBOOK_API_VERSION || 'v17.0';
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

function isLatinoTitle(value) {
  const normalized = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  return /\b(?:espanol latino|audio latino|latino(?:s|america|americano|americana)?|latina(?:s)?|latam|castellano)\b/.test(normalized);
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

  return user;
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
  const label = isLatinoTitle(title) ? `${title} +Latino+` : title;

  return `Nuevo capítulo: ${label} - Capítulo ${chapterNumber}\n\nMira ahora: ${link}\n\nVer anime online en HD y español latino en AnimeFLV.`;
}

async function publishFacebookPost(message, link) {
  const body = new URLSearchParams({
    message,
    link,
    access_token: FACEBOOK_PAGE_ACCESS_TOKEN,
    published: 'true'
  });

  const response = await fetch(`https://graph.facebook.com/${FACEBOOK_API_VERSION}/${FACEBOOK_PAGE_ID}/feed`, {
    method: 'POST',
    body
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Facebook API error: ${text}`);
  }

  return response.json();
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return errorResponse(res, 405, 'Method not allowed.');
  }

  if (!SUPABASE_URL || !SUPABASE_KEY || !FACEBOOK_PAGE_ID || !FACEBOOK_PAGE_ACCESS_TOKEN) {
    return errorResponse(res, 500, 'Faltan variables de entorno para publicar en Facebook.');
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
    const facebookResult = await publishFacebookPost(message, link);

    res.status(200).json({ success: true, facebook: facebookResult });
  } catch (error) {
    console.error(error);
    errorResponse(res, 500, error.message || 'Error al publicar en Facebook.');
  }
};
