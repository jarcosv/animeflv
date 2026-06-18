const CHAPTER_SECTION_VALUES = ['inicio', 'estrenos', 'completos', 'populares', 'destacados'];
const PUBLISH_STATUS_VALUES = ['published', 'draft', 'hidden'];
const PROGRESS_CHUNK_SIZE = 250;

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

function parseBulkChapterImport(rawText) {
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

      if (processedChapters % PROGRESS_CHUNK_SIZE === 0) {
        self.postMessage({ type: 'progress', count: processedChapters });
      }
    }

    cursor = jsonEnd + 1;
  }

  if (!rows.length && !errors.length) {
    errors.push('No encontre ningun paquete JSON para importar.');
  }

  return { rows, errors };
}

self.addEventListener('message', event => {
  try {
    const result = parseBulkChapterImport(event.data?.rawText || '');
    self.postMessage({ type: 'done', ...result });
  } catch (error) {
    self.postMessage({ type: 'error', message: error.message || String(error) });
  }
});
