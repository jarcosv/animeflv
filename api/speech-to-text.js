module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo no permitido.' });

  const key = process.env.GEMINI_API_KEY;
  const audio = String(req.body?.audio || '');
  const mimeType = String(req.body?.mimeType || 'audio/webm');

  if (!key) return res.status(200).json({ error: 'Falta GEMINI_API_KEY.' });
  if (!audio) return res.status(200).json({ error: 'No llego audio.' });

  const model = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        role: 'user',
        parts: [
          { text: 'Transcribe este audio en espanol. Devuelve solo el texto, sin explicaciones.' },
          { inlineData: { mimeType, data: audio } }
        ]
      }]
    })
  });

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  res.status(200).json({ text: text.trim() });
};
