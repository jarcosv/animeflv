module.exports = async function handler(req, res) {
  const key = process.env.YOUTUBE_API_KEY;
  const q = String(req.query.q || '').trim();

  if (!key) {
    return res.status(200).json({ error: 'Falta configurar YOUTUBE_API_KEY en Vercel.' });
  }
  if (!q) {
    return res.status(200).json({ error: 'Di que musica quieres escuchar.' });
  }

  const params = new URLSearchParams({
    part: 'snippet',
    type: 'video',
    maxResults: '1',
    videoEmbeddable: 'true',
    q,
    key
  });

  const response = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`);
  const data = await response.json();
  const item = data.items?.[0];

  res.status(200).json({
    videoId: item?.id?.videoId || '',
    title: item?.snippet?.title || ''
  });
};
