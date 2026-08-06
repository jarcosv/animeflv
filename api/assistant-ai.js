module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Metodo no permitido.' });
  }

  const key = process.env.GEMINI_API_KEY;
  const prompt = String(req.body?.prompt || '').trim();

  if (!key) {
    return res.status(200).json({ error: 'Falta configurar GEMINI_API_KEY en Vercel.' });
  }
  if (!prompt) {
    return res.status(200).json({ error: 'Pregunta algo primero.' });
  }

  const models = [
    process.env.GEMINI_MODEL,
    'gemini-1.5-flash-latest',
    'gemini-1.5-flash-002',
    'gemini-1.5-flash-8b-latest',
    'gemini-2.0-flash'
  ].filter(Boolean);

  let data = null;
  let lastError = '';

  for (const model of models) {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [{ text: `Responde breve en espanol latino. Usuario: ${prompt}` }]
        }]
      })
    });

    data = await response.json();
    if (response.ok) break;
    lastError = data.error?.message || `Gemini respondio con error ${response.status}.`;
    data = null;
  }

  if (!data) {
    return res.status(200).json({ error: lastError || 'Gemini no respondio.' });
  }

  const answer = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  res.status(200).json({ answer: answer || 'No pude responder ahora.' });
};
