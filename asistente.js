let player;
let volume = 70;

const statusEl = document.getElementById('status');
const transcriptEl = document.getElementById('transcript');
const answerEl = document.getElementById('answer');
const listenBtn = document.getElementById('listen-btn');
const stopBtn = document.getElementById('stop-btn');
const micTestBtn = document.getElementById('mic-test-btn');
const textCommandForm = document.getElementById('text-command-form');
const textCommandInput = document.getElementById('text-command');
const debugEl = document.getElementById('debug');

function setStatus(text) {
  statusEl.textContent = text;
}

function setDebug(text) {
  debugEl.textContent = text;
}

function speak(text) {
  answerEl.textContent = text;
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'es-ES';
  utterance.volume = 1;
  speechSynthesis.speak(utterance);
}

function onYouTubeIframeAPIReady() {
  player = new YT.Player('player', {
    height: '390',
    width: '640',
    videoId: '',
    playerVars: { autoplay: 0, controls: 1, rel: 0 },
    events: {
      onReady: () => {
        player.setVolume(volume);
        setStatus('Listo');
      }
    }
  });
}

async function playMusic(query) {
  setStatus('Buscando musica...');
  const response = await fetch(`/api/youtube-search?q=${encodeURIComponent(query)}`);
  const data = await response.json();
  if (!data.videoId) {
    speak(data.error || 'No pude encontrar esa musica.');
    setStatus('Listo');
    return;
  }
  player.loadVideoById(data.videoId);
  player.setVolume(volume);
  speak(`Reproduciendo ${data.title || query}`);
  setStatus('Reproduciendo');
}

async function askAI(prompt) {
  setStatus('Pensando...');
  const response = await fetch('/api/assistant-ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt })
  });
  const data = await response.json();
  speak(data.answer || data.error || 'No pude responder ahora.');
  setStatus('Listo');
}

async function runCommand(command) {
  const action = command.action || 'answer';

  if (action === 'play_music') {
    await playMusic(command.query || command.answer || '');
    return;
  }

  if (action === 'pause') {
    player?.pauseVideo();
    speak(command.answer || 'Pausado.');
    return;
  }

  if (action === 'resume') {
    player?.playVideo();
    speak(command.answer || 'Continuando.');
    return;
  }

  if (action === 'stop') {
    player?.stopVideo();
    speechSynthesis.cancel();
    answerEl.textContent = command.answer || 'Apagado.';
    setStatus('Apagado');
    return;
  }

  if (action === 'volume_up') {
    volume = Math.min(100, volume + 15);
    player?.setVolume(volume);
    speak(command.answer || `Volumen ${volume}.`);
    return;
  }

  if (action === 'volume_down') {
    volume = Math.max(0, volume - 15);
    player?.setVolume(volume);
    speak(command.answer || `Volumen ${volume}.`);
    return;
  }

  speak(command.answer || 'No pude interpretar eso.');
}

async function interpretWithAI(rawText) {
  setStatus('Interpretando...');
  const response = await fetch('/api/assistant-command', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: rawText })
  });
  return response.json();
}

async function handleCommand(rawText) {
  const text = rawText.toLowerCase().trim();
  transcriptEl.textContent = rawText;

  try {
    const command = await interpretWithAI(rawText);
    await runCommand(command);
    return;
  } catch (error) {
    console.warn('No se pudo usar IA para interpretar:', error);
  }

  if (text.includes('pausa') || text.includes('pausar')) {
    player?.pauseVideo();
    speak('Pausado.');
    return;
  }

  if (text.includes('continua') || text.includes('continúa') || text.includes('play')) {
    player?.playVideo();
    speak('Continuando.');
    return;
  }

  if (text.includes('apaga') || text.includes('deten') || text.includes('detén')) {
    player?.stopVideo();
    speechSynthesis.cancel();
    setStatus('Apagado');
    answerEl.textContent = 'Apagado.';
    return;
  }

  if (text.includes('sube volumen')) {
    volume = Math.min(100, volume + 15);
    player?.setVolume(volume);
    speak(`Volumen ${volume}.`);
    return;
  }

  if (text.includes('baja volumen')) {
    volume = Math.max(0, volume - 15);
    player?.setVolume(volume);
    speak(`Volumen ${volume}.`);
    return;
  }

  const musicMatch = text.match(/(?:pon|reproduce|coloca|busca)\s+(?:musica|música|cancion|canción)?\s*(?:de)?\s*(.+)/);
  if (musicMatch?.[1]) {
    playMusic(musicMatch[1]);
    return;
  }

  askAI(rawText);
}

async function startListening() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    speak('Tu navegador no soporta reconocimiento de voz. Prueba con Chrome.');
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.lang = 'es-ES';
  recognition.interimResults = false;
  recognition.continuous = false;
  recognition.onstart = () => setStatus('Escuchando...');
  recognition.onerror = event => {
    if (event.error === 'not-allowed') {
      startGeminiAudioFallback();
      return;
    }
    const messages = {
      'no-speech': 'No escuche nada. Habla despues de presionar el boton.',
      'audio-capture': 'No encuentro un microfono activo.',
      'not-allowed': 'Chrome bloqueo el microfono. Revisa permisos del sitio y del sistema.',
      'network': 'Chrome no pudo conectar con el servicio de reconocimiento de voz.'
    };
    speak(messages[event.error] || `Error de microfono: ${event.error}`);
    setStatus(event.error || 'Error');
  };
  recognition.onresult = event => handleCommand(event.results[0][0].transcript);
  recognition.onend = () => {
    if (statusEl.textContent === 'Escuchando...') setStatus('Listo');
  };

  try {
    recognition.start();
  } catch (error) {
    speak('No pude iniciar el reconocimiento de voz. Recarga la pagina e intenta otra vez.');
    setStatus('Error');
  }
}

async function startGeminiAudioFallback() {
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    speak('Chrome bloqueo la voz y este navegador no permite grabar audio aqui.');
    setStatus('Microfono bloqueado');
    return;
  }

  try {
    setStatus('Grabando 4 segundos...');
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream);
    const chunks = [];

    recorder.ondataavailable = event => {
      if (event.data.size) chunks.push(event.data);
    };

    recorder.onstop = async () => {
      stream.getTracks().forEach(track => track.stop());
      const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = String(reader.result).split(',')[1] || '';
        setStatus('Transcribiendo...');
        const response = await fetch('/api/speech-to-text', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ audio: base64, mimeType: blob.type })
        });
        const data = await response.json();
        if (data.text) {
          handleCommand(data.text);
        } else {
          speak(data.error || 'No pude entender el audio.');
          setStatus('Listo');
        }
      };
      reader.readAsDataURL(blob);
    };

    recorder.start();
    setTimeout(() => recorder.stop(), 4000);
  } catch (error) {
    speak('El microfono sigue bloqueado por Chrome o Windows.');
    setStatus('Microfono bloqueado');
  }
}

async function testMicrophone() {
  const lines = [];
  lines.push(`HTTPS: ${window.isSecureContext ? 'si' : 'no'}`);
  lines.push(`SpeechRecognition: ${Boolean(window.SpeechRecognition || window.webkitSpeechRecognition) ? 'si' : 'no'}`);
  lines.push(`mediaDevices: ${Boolean(navigator.mediaDevices?.getUserMedia) ? 'si' : 'no'}`);

  try {
    if (navigator.permissions?.query) {
      const permission = await navigator.permissions.query({ name: 'microphone' });
      lines.push(`permiso Chrome: ${permission.state}`);
    }
  } catch (error) {
    lines.push(`permiso Chrome: no disponible`);
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    lines.push('getUserMedia: OK');
    setStatus('Microfono OK');
    speak('Microfono funcionando.');
    stream.getTracks().forEach(track => track.stop());
  } catch (error) {
    lines.push(`getUserMedia: ${error.name} ${error.message}`);
    setStatus('Microfono bloqueado');
    speak('Chrome o Windows sigue bloqueando el microfono.');
  }

  setDebug(lines.join('\n'));
}

listenBtn.addEventListener('click', startListening);
micTestBtn.addEventListener('click', testMicrophone);
stopBtn.addEventListener('click', () => handleCommand('apaga'));
textCommandForm.addEventListener('submit', event => {
  event.preventDefault();
  const value = textCommandInput.value.trim();
  if (!value) return;
  textCommandInput.value = '';
  handleCommand(value);
});
