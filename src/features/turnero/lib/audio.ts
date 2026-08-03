let contexto: AudioContext | null = null;
let buffer: AudioBuffer | null = null;

function crearBuffer(ctx: AudioContext) {
  const duracion = 0.9;
  const sampleRate = ctx.sampleRate;
  const audio = ctx.createBuffer(1, Math.ceil(sampleRate * duracion), sampleRate);
  const canal = audio.getChannelData(0);

  for (let i = 0; i < canal.length; i += 1) {
    const tiempo = i / sampleRate;
    const primerTono = Math.sin(2 * Math.PI * 784 * tiempo) * Math.exp(-7 * tiempo);
    const segundoTiempo = Math.max(0, tiempo - 0.36);
    const segundoTono =
      tiempo >= 0.36
        ? Math.sin(2 * Math.PI * 659 * segundoTiempo) * Math.exp(-7 * segundoTiempo)
        : 0;
    canal[i] = (primerTono + segundoTono) * 0.32;
  }

  return audio;
}

export async function prepararAudio() {
  contexto ??= new AudioContext();
  buffer ??= crearBuffer(contexto);
  if (contexto.state === "suspended") await contexto.resume();
}

export async function reproducirDingDong() {
  await prepararAudio();
  if (!contexto || !buffer) return;

  const fuente = contexto.createBufferSource();
  const ganancia = contexto.createGain();
  fuente.buffer = buffer;
  ganancia.gain.value = 0.85;
  fuente.connect(ganancia);
  ganancia.connect(contexto.destination);
  fuente.start();
}
