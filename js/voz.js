// Voces: lo que aparece escrito suena, si hay archivo. Si no lo hay, se sigue sin voz.
// Las claves de data/voces.json son «quién|texto», porque Manolo y María dicen a veces lo mismo.
// La música baja mientras se habla; el botón de la música calla también las voces.
import { musica } from './musica.js';

const CARPETA = 'assets/voz/';
const NADA = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';
const AIRE = 400;          // ms que el bocadillo sigue en pantalla tras la última palabra

let archivos = {};
let el = null;
let actual = null;         // { t, alDurar }: lo que se está diciendo
let cola = [];

function quita() {
  actual = null;
  cola = [];
  el?.pause();
}

function siguiente() {
  const archivo = cola.shift();
  if (!archivo) {
    actual = null;
    musica.bajar(false);
    return;
  }
  const este = actual;
  el.src = CARPETA + archivo;
  el.play().catch((e) => {
    // AbortError es que otra frase ha entrado antes de empezar esta.
    if (e.name !== 'AbortError' && este === actual) { quita(); musica.bajar(false); }
  });
}

// La carta de la Rafi con posdata son dos archivos seguidos.
function trozos(who, t) {
  return t.split(/\s+(?=P\.D\.)/).map((p) => archivos[`${who}|${p.trim()}`]).filter(Boolean);
}

export const voz = {
  // Se llama una vez. El móvil solo deja sonar sin toque a un audio que ya ha sonado con uno.
  iniciar() {
    el = new Audio();
    el.preload = 'auto';
    el.onended = siguiente;
    el.onerror = () => { if (actual) siguiente(); };
    el.onloadedmetadata = () => {
      if (Number.isFinite(el.duration)) actual?.alDurar?.(el.duration * 1000 + AIRE);
    };
    const desbloquea = () => {
      removeEventListener('pointerdown', desbloquea, true);
      if (actual) return;
      el.src = NADA;
      el.play().catch(() => {});
    };
    addEventListener('pointerdown', desbloquea, { capture: true, passive: true });
    document.addEventListener('visibilitychange', () => {
      if (!actual) return;
      if (document.hidden) el.pause();
      else el.play().catch(() => {});
    });
    musica.alSilenciar = () => { if (musica.silenciada) voz.callar(); };
    return fetch('data/voces.json')
      .then((r) => r.json())
      .then((d) => { archivos = d; })
      .catch(() => { /* sin manifiesto se juega sin voz */ });
  },

  // Corta lo que suene y dice esto. `alDurar` recibe los ms que necesita en pantalla.
  decir(who, t, alDurar) {
    if (!el) return;
    quita();
    const partes = musica.silenciada ? [] : trozos(who, t);
    if (!partes.length) { musica.bajar(false); return; }
    actual = { t, alDurar };
    cola = partes;
    musica.bajar(true);
    siguiente();
  },

  // Con texto, solo se calla si eso es lo que está sonando: un bocadillo que caduca no corta una carta.
  callar(t) {
    if (t !== undefined && t !== actual?.t) return;
    quita();
    musica.bajar(false);
  },

  estado() {
    return { sonando: !!actual && !el.paused, archivo: actual ? el.src.split('/').pop() : null, segundo: el?.currentTime ?? 0, texto: actual?.t ?? null, claves: Object.keys(archivos).length };
  },
};
