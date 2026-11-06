// Proyección isométrica con cuatro vistas (ARTE-ISO.md).
// El mundo se gira a coordenadas de vista (vx, vy) y de ahí pasa a la pantalla.
export const BOARD = { w: 1640, h: 950 };

let meta = null;
let k = 0;
let ox = 0;
let oy = 0;

export function setupViews(data) {
  meta = data;
  BOARD.w = data.w;
  BOARD.h = data.h;
  setView(0);
}

export function setView(n) {
  k = n;
  ({ ox, oy } = meta.vistas[k]);
}

export const viewIndex = () => k;

function toView(x, y) {
  const { wx, wy } = meta;
  if (k === 0) return { x, y };
  if (k === 1) return { x: wy - y, y: x };
  if (k === 2) return { x: wx - x, y: wy - y };
  return { x: y, y: wx - x };
}

function toWorld(vx, vy) {
  const { wx, wy } = meta;
  if (k === 0) return { x: vx, y: vy };
  if (k === 1) return { x: vy, y: wy - vx };
  if (k === 2) return { x: wx - vx, y: wy - vy };
  return { x: wx - vy, y: vx };
}

export function toScreen(x, y, z = 0) {
  const v = toView(x, y);
  return { x: v.x + v.y + ox, y: (v.y - v.x) / 2 + oy - z };
}

// Punto de pantalla sobre un plano horizontal de altura z, en coordenadas de mundo.
export function onFloor(sx, sy, z = 0) {
  const s = sx - ox;
  const c = 2 * (sy - oy + z);
  return toWorld((s - c) / 2, (s + c) / 2);
}

// Las paredes norte y este solo se ven enteras en las vistas que las tienen al fondo.
export function wallVisible(wall) {
  return wall.side === 'n' ? k === 0 || k === 1 : k === 0 || k === 3;
}

// Punto de pantalla sobre una pared visible: { u, z }, con u la posición a lo largo de ella.
export function onWall(sx, sy, wall) {
  const s = sx - ox;
  const north = wall.side === 'n';
  const a = north ? toView(0, wall.at) : toView(wall.at, 0);
  const b = north ? toView(100, wall.at) : toView(wall.at, 100);
  let w;
  let z;
  if (a.x === b.x) {
    const vy = s - a.x;
    w = toWorld(a.x, vy);
    z = (vy - a.x) / 2 + oy - sy;
  } else {
    const vx = s - a.y;
    w = toWorld(vx, a.y);
    z = (a.y - vx) / 2 + oy - sy;
  }
  return { u: north ? w.x : w.y, z };
}

// ¿Cae el punto de pantalla sobre la silueta de una caja del mundo, de z0 a z0 + h?
// Da igual la vista: el punto se lleva al plano de abajo y se sube a lo largo del rayo.
export function enCaja(sx, sy, x, y, w, d, z0, h) {
  const p = onFloor(sx, sy, z0);
  const v = toView(p.x, p.y);
  const r = viewRect(x, y, w, d);
  const de = Math.max(0, v.x - r.x - r.w, r.y - v.y);
  const a = Math.min(h, v.x - r.x, r.y + r.d - v.y);
  return de <= a;
}

export function viewRect(x, y, w, d) {
  const a = toView(x, y);
  const b = toView(x + w, y + d);
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), d: Math.abs(a.y - b.y) };
}

// Esquina superior izquierda de un sprite de planta w×d sobre el mundo.
export function spriteTopLeft(x, y, z, w, d, imgH) {
  const r = viewRect(x, y, w, d);
  return { x: r.x + r.y + ox, y: (r.y + r.d - r.x) / 2 + oy - z - imgH };
}

// Orden de pintado de cajas en coordenadas de vista: a detrás de b.
function isBehind(a, b) {
  if (a.z + a.h <= b.z) return true;
  if (b.z + b.h <= a.z) return false;
  if (a.x >= b.x + b.w) return true;
  if (b.x >= a.x + a.w) return false;
  if (a.y + a.d <= b.y) return true;
  if (b.y + b.d <= a.y) return false;
  return (a.y - a.x) < (b.y - b.x);
}

// ¿Se pisan en pantalla? La silueta de una caja isométrica es un hexágono: basta con
// comparar sus tres ejes. Ordenar piezas que no se tocan crea ciclos y desordena el resto.
function overlap(a, b) {
  return a.x + a.y < b.x + b.y + b.w + b.d && b.x + b.y < a.x + a.y + a.w + a.d
    && a.y - a.z - a.h < b.y + b.d - b.z && b.y - b.z - b.h < a.y + a.d - a.z
    && a.x + a.z < b.x + b.w + b.z + b.h && b.x + b.z < a.x + a.w + a.z + a.h;
}

export function sortDepth(list) {
  const boxes = list.map((e) => ({ ...viewRect(e.x, e.y, e.w, e.d), z: e.z, h: e.h, uid: e.uid, parent: e.parent, detras: e.detras }));
  const n = list.length;
  const after = list.map(() => []);
  const blockers = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (!overlap(boxes[i], boxes[j])) continue;
      // Lo que está sobre un mueble va siempre después del mueble, salvo que el mueble
      // le dé la espalda al jugador: entonces va antes, y el mueble lo tapa.
      const iOnJ = boxes[i].parent != null && boxes[i].parent === boxes[j].uid;
      const jOnI = boxes[j].parent != null && boxes[j].parent === boxes[i].uid;
      const iPrimero = iOnJ ? boxes[i].detras : jOnI ? !boxes[j].detras : isBehind(boxes[i], boxes[j]);
      if (iPrimero) { after[i].push(j); blockers[j]++; } else { after[j].push(i); blockers[i]++; }
    }
  }
  const done = new Array(n).fill(false);
  const out = [];
  for (let c = 0; c < n; c++) {
    // Con cajas muy solapadas puede haber ciclos: se toma la menos bloqueada.
    let best = -1;
    for (let i = 0; i < n; i++) if (!done[i] && (best < 0 || blockers[i] < blockers[best])) best = i;
    done[best] = true;
    out.push(list[best]);
    for (const j of after[best]) blockers[j]--;
  }
  return out;
}
