// Música de fondo: una pieza por ambiente, en bucle y con fundidos.
// Va por Web Audio porque el bucle de <audio> deja un hueco al volver a empezar.
// El juego pide qué debe sonar; lo demás (primer toque, silencio, vídeos) se resuelve aquí.
const CLAVE = 'nido-musica';
const VOLUMEN = 0.6;       // bajo los efectos, que son de la misma mano
const CRUCE = 2.5;         // segundos de fundido entre dos piezas
const BAJADA = 0.3;        // parte del volumen que queda mientras alguien habla
const GUARDADAS = 2;       // piezas descodificadas en memoria: un bucle ocupa decenas de MB

let ctx = null;
let salida = null;
let oido = null;
let piezas = null;
let pedidaLista = null;
let deseada = null;        // { id, desde, pedidaEn, fundido }: lo que debería sonar
let sonando = null;        // { id, src, gain }
let enVideo = false;
let bajada = false;
let silencio = leer();
let turno = 0;
let boton = null;
let aviso = null;
const memoria = new Map();

function leer() {
  try { return localStorage.getItem(CLAVE) === '0'; } catch { return false; }
}

function guardar() {
  try { localStorage.setItem(CLAVE, silencio ? '0' : '1'); } catch { /* sin almacén: dura lo que la sesión */ }
}

function lista() {
  pedidaLista ??= traer('assets/music/musica.json')
    .then((r) => r.json())
    .then((d) => { piezas = d; return d; })
    .catch(() => { pedidaLista = null; return null; });
  return pedidaLista;
}

// El servidor de pruebas pierde peticiones en ráfaga: se reintenta antes de rendirse.
async function traer(url) {
  let fallo;
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return r;
      fallo = new Error(`${r.status} ${url}`);
    } catch (e) { fallo = e; }
    await new Promise((ok) => { setTimeout(ok, 400 * (i + 1)); });
  }
  throw fallo;
}

function buffer(id) {
  if (!memoria.has(id)) {
    const p = lista()
      .then((d) => traer(`assets/music/${d[id].archivo}`))
      .then((r) => r.arrayBuffer())
      .then((b) => ctx.decodeAudioData(b));
    p.catch(() => memoria.delete(id));
    memoria.set(id, p);
  }
  // La última pedida va al final; se suelta la más antigua, nunca la que suena.
  const p = memoria.get(id);
  memoria.delete(id);
  memoria.set(id, p);
  for (const k of memoria.keys()) {
    if (memoria.size <= GUARDADAS) break;
    if (k !== id && k !== sonando?.id) memoria.delete(k);
  }
  return p;
}

function apaga(fundido) {
  const s = sonando;
  if (!s) return;
  sonando = null;
  const t = ctx.currentTime;
  s.gain.gain.cancelScheduledValues(t);
  s.gain.gain.setValueAtTime(s.gain.gain.value, t);
  s.gain.gain.linearRampToValueAtTime(0, t + fundido);
  try { s.src.stop(t + fundido + 0.05); } catch { /* ya había parado */ }
}

function arranca(id, b, deseo) {
  const p = piezas[id];
  const src = ctx.createBufferSource();
  src.buffer = b;
  if (p.fin) Object.assign(src, { loop: true, loopStart: p.ini, loopEnd: p.fin });
  const gain = ctx.createGain();
  const t = ctx.currentTime;
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(p.vol ?? 1, t + deseo.fundido);
  src.connect(gain).connect(salida);
  // Una entrada con hora fija sigue a la escena aunque la pieza haya tardado en llegar.
  const pasado = deseo.desde === undefined ? 0 : (performance.now() - deseo.pedidaEn) / 1000;
  const desde = (deseo.desde ?? p.ini ?? 0) + pasado;
  if (desde >= b.duration) return;
  src.start(t, desde);
  const s = { id, src, gain, t0: t - desde };
  src.onended = () => { if (sonando === s) sonando = null; };
  sonando = s;
}

// Compara lo que suena con lo que debería sonar y corrige.
async function ajusta(fundido = CRUCE) {
  if (!ctx || ctx.state !== 'running') return;
  const quiere = silencio || enVideo ? null : deseada;
  if (sonando && sonando.id === quiere?.id) return;
  const este = ++turno;
  apaga(fundido);
  if (!quiere) return;
  try {
    if (!await lista()) return;
    const b = await buffer(quiere.id);
    if (este !== turno) return;   // mientras cargaba, se pidió otra cosa
    arranca(quiere.id, b, quiere);
  } catch { /* sin música se juega igual */ }
}

async function desbloquea() {
  if (!ctx) {
    const Ctx = window.AudioContext ?? window.webkitAudioContext;
    if (!Ctx) return;
    ctx = new Ctx();
    salida = ctx.createGain();
    salida.gain.value = bajada ? VOLUMEN * BAJADA : VOLUMEN;
    oido = ctx.createAnalyser();
    oido.fftSize = 2048;
    salida.connect(oido).connect(ctx.destination);
  }
  if (document.hidden) return;
  if (ctx.state !== 'running') await ctx.resume().catch(() => {});
  if (ctx.state === 'running') ajusta(0.8);
}

function pintaBoton() {
  if (!boton) return;
  boton.classList.toggle('apagada', silencio);
  boton.querySelector('span').textContent = silencio ? 'MUDO' : 'SONIDO';
  boton.setAttribute('aria-pressed', String(!silencio));
  boton.setAttribute('aria-label', silencio ? 'Poner la música y las voces' : 'Quitar la música y las voces');
  boton.title = boton.getAttribute('aria-label');
}

export const musica = {
  // Se llama una vez: el navegador no deja sonar nada hasta el primer toque.
  iniciar() {
    for (const n of ['pointerdown', 'pointerup', 'touchend', 'keydown', 'click']) {
      addEventListener(n, desbloquea, { capture: true, passive: true });
    }
    // Con el móvil en el bolsillo no suena; al volver, sigue por donde iba.
    document.addEventListener('visibilitychange', () => {
      if (!ctx) return;
      if (document.hidden) ctx.suspend().catch(() => {});
      else desbloquea();
    });
    boton = document.createElement('button');
    boton.className = 'boton-musica';
    boton.type = 'button';
    // Una nota y un bocadillo: lo que se calla es la música y también las voces.
    boton.innerHTML = '<svg viewBox="0 0 22 12" width="44" height="24" aria-hidden="true"><path fill="currentColor" d="M3 0h6v2H5v7H4v1H3v1H1v-1H0V8h1V7h2z"/><path fill="currentColor" fill-rule="evenodd" d="M11 1h11v7h-6v1h-1v1h-2V8h-2zM13 4v1h1V4zm3 0v1h1V4zm3 0v1h1V4z"/><path class="tacha" fill="#A3262A" d="M0 0h2v1h2v1h2v1h2v1h2v1h2v1h2v1h2v1h2v1h2v1h2v1h-3v-1h-2v-1h-2V9h-2V8h-2V7h-2V6H9V5H7V4H5V3H3V2H1V1H0z"/></svg><span></span>';
    boton.onclick = () => this.alternar();
    aviso = document.createElement('div');
    aviso.className = 'aviso-musica';
    aviso.hidden = true;
    boton.hidden = true;
    document.body.append(boton, aviso);
    pintaBoton();
  },

  // Dónde va, en px de pantalla; null lo esconde. Lo decide la escena (main.js).
  situar(r) {
    boton.hidden = !r;
    if (!r) { aviso.hidden = true; return; }
    Object.assign(boton.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` });
    this.sitio = r;
  },

  poner(id, fundido = CRUCE) {
    if (!id || (deseada?.id === id && deseada.desde === undefined)) return;
    deseada = { id, fundido: Math.min(fundido, 2) };
    ajusta(fundido);
  },

  // Entra en un punto concreto y sin bucle propio: la canción del final.
  desde(id, segundo, fundido = 0.25) {
    deseada = { id, desde: segundo, pedidaEn: performance.now(), fundido };
    ajusta(0.1);
  },

  // Lo deja listo para entrar sin espera.
  cargar(id) {
    if (ctx && !silencio) lista().then((d) => d && buffer(id)).catch(() => {});
  },

  parar(fundido = CRUCE) {
    deseada = null;
    ajusta(fundido);
  },

  // Un vídeo a pantalla completa: la música baja y se para hasta que acabe.
  video(activo, fundido = 1.2) {
    enVideo = activo;
    ajusta(fundido);
  },

  // Mientras alguien habla, la música se aparta.
  bajar(activo) {
    if (activo === bajada) return;
    bajada = activo;
    if (!salida) return;
    const t = ctx.currentTime;
    salida.gain.cancelScheduledValues(t);
    salida.gain.setValueAtTime(salida.gain.value, t);
    salida.gain.linearRampToValueAtTime(activo ? VOLUMEN * BAJADA : VOLUMEN, t + (activo ? 0.25 : 0.8));
  },

  get silenciada() { return silencio; },

  alternar() {
    silencio = !silencio;
    guardar();
    pintaBoton();
    ajusta(0.5);
    this.alSilenciar?.();
    this.avisa();
  },

  // Se dice con palabras qué ha cambiado, un momento, junto al botón.
  avisa() {
    aviso.textContent = silencio ? 'Sin música ni voces' : 'Con música y voces';
    aviso.hidden = false;
    const { x, y, w, h } = this.sitio;
    const ancho = aviso.offsetWidth, alto = aviso.offsetHeight;
    aviso.style.left = `${Math.max(8, Math.min(innerWidth - ancho - 8, x + w / 2 - ancho / 2))}px`;
    aviso.style.top = `${y < innerHeight / 2 ? y + h + 8 : y - alto - 8}px`;
    clearTimeout(this.quitaAviso);
    this.quitaAviso = setTimeout(() => { aviso.hidden = true; }, 1800);
  },

  // Por dónde va una pieza, en segundos de archivo; null si no está sonando.
  posicion(id) {
    return sonando?.id === id ? ctx.currentTime - sonando.t0 : null;
  },

  estado() {
    let nivel = 0;
    if (oido) {
      const d = new Float32Array(oido.fftSize);
      oido.getFloatTimeDomainData(d);
      nivel = Math.sqrt(d.reduce((s, v) => s + v * v, 0) / d.length);
    }
    const posicion = sonando ? ctx.currentTime - sonando.t0 : null;
    return { pieza: sonando?.id ?? null, deseada: deseada?.id ?? null, contexto: ctx?.state ?? null, silencio, enVideo, bajada, nivel, posicion };
  },
};
