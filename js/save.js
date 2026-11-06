// Guardado en localStorage: capítulo, estado del sótano, notas leídas y detalles que cambian la historia.
const KEY = 'nido.v16';

export const blank = () => ({ chapter: 1, items: [], notes: [], flags: {}, bolitasLampara: 0, antesDelFinal: null, terminado: false, progreso: null, pendienteCuaderno: false, guardados: [] });

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...blank(), ...JSON.parse(raw) } : null;
  } catch { return null; }
}

export function store(state) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* sin guardado la partida sigue */ }
}
