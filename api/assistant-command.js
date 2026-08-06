module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Metodo no permitido.' });
  }

  const key = process.env.GEMINI_API_KEY;
  const text = String(req.body?.text || '').trim();

  if (!key) {
    return res.status(200).json({
      action: 'answer',
      answer: 'Falta configurar GEMINI_API_KEY en Vercel.'
    });
  }

  if (!text) {
    return res.status(200).json({
      action: 'answer',
      answer: 'No escuche ningun comando.'
    });
  }

  const model = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: [
          'Eres el cerebro de un asistente de voz musical en una web.',
          'Devuelve SOLO JSON valido, sin markdown.',
          'Acciones validas:',
          '{"action":"play_music","query":"texto para buscar en YouTube","answer":"respuesta breve"}',
          '{"action":"pause","answer":"respuesta breve"}',
          '{"action":"resume","answer":"respuesta breve"}',
          '{"action":"stop","answer":"respuesta breve"}',
          '{"action":"volume_up","answer":"respuesta breve"}',
          '{"action":"volume_down","answer":"respuesta breve"}',
          '{"action":"answer","answer":"respuesta breve"}',
          'Interpreta frases naturales como: pon algo de rock, coloca openings de anime, callate, baja un poco, dale play, quiero escuchar Bad Bunny, etc.',
          'Si pide musica o canciones, usa play_music.'
        ].join('\n') }]
      },
      contents: [
        {
          role: 'user',
          parts: [{ text }]
        }
      ],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: 'application/json'
      }
    })
  });

  const data = await response.json();
  if (!response.ok) {
    return res.status(200).json({
      action: 'answer',
      answer: data.error?.message || `Gemini respondio con error ${response.status}.`
    });
  }

  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';

  try {
    const command = JSON.parse(raw);
    return res.status(200).json({
      action: command.action || 'answer',
      query: command.query || '',
      answer: command.answer || 'Listo.'
    });
  } catch {
    return res.status(200).json({ action: 'answer', answer: raw || 'No pude interpretar eso.' });
  }
};
