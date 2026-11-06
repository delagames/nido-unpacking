// Sombras de contacto. Se pintan en una máscara única, para que dos sombras que se pisan no
// oscurezcan el doble, y solo se rehace cuando algo se mueve.
import { PAL, makeCanvas } from './gfx.js';
import { toScreen, viewIndex } from './iso.js';

// Dirección fija respecto a la cámara: la sombra cae siempre hacia delante. Con la luz fija al
// mundo, en la vista opuesta caía detrás del mueble y lo alto, sin contacto, parecía flotar.
const LUZ = [[-9, 12], [12, 9], [9, -12], [-12, -9]];
const luz = () => LUZ[viewIndex()];
const BORDE = 3;      // contacto: asoma por todos los lados, también cuando la sombra cae hacia atrás
const OPACIDAD = 0.3;

// Lo redondo deja una sombra redonda: el polígono de una elipse inscrita en la huella.
const elipse = (x, y, w, d, z = 0) => Array.from({ length: 20 }, (_, k) => {
  const a = k * Math.PI / 10;
  return toScreen(x + w / 2 + Math.cos(a) * w / 2, y + d / 2 + Math.sin(a) * d / 2, z);
});
const quad = (x, y, w, d, z = 0) => [toScreen(x, y, z), toScreen(x + w, y, z), toScreen(x + w, y + d, z), toScreen(x, y + d, z)];

// Cuadrilátero relleno por columnas: sin antialias.
export function fillQuad(g, q) {
  const pts = q.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) }));
  const x0 = Math.min(...pts.map((p) => p.x)), x1 = Math.max(...pts.map((p) => p.x));
  for (let x = x0; x <= x1; x++) {
    let top = Infinity, bottom = -Infinity;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      if (x < Math.min(a.x, b.x) || x > Math.max(a.x, b.x)) continue;
      if (a.x === b.x) {
        top = Math.min(top, a.y, b.y); bottom = Math.max(bottom, a.y, b.y);
      } else {
        const y = a.y + (b.y - a.y) * (x - a.x) / (b.x - a.x);
        top = Math.min(top, y); bottom = Math.max(bottom, y);
      }
    }
    if (top <= bottom) g.fillRect(x, Math.round(top), 1, Math.round(bottom - top) + 1);
  }
}

export class Sombras {
  constructor(room, w, h) {
    this.room = room;
    [this.mask, this.g] = makeCanvas(w, h);
    this.suelos = new Map();   // máscara de suelo por vista
    this.clave = null;
  }

  // Las sombras no pueden salir del suelo: ni al vacío ni sobre las paredes.
  suelo() {
    const k = viewIndex();
    if (!this.suelos.has(k)) {
      const [c, g] = makeCanvas(this.mask.width, this.mask.height);
      g.fillStyle = '#000000';
      for (const s of this.room.floors()) fillQuad(g, quad(s.rect.x, s.rect.y, s.rect.w, s.rect.h));
      this.suelos.set(k, c);
    }
    return this.suelos.get(k);
  }

  rehacer(lista) {
    const g = this.g;
    g.clearRect(0, 0, this.mask.width, this.mask.height);
    g.fillStyle = PAL.tinta;
    const [lx, ly] = luz();
    for (const { x, y, w, d, redonda } of lista) {
      for (const t of [0, 0.5, 1]) {
        if (redonda) fillQuad(g, elipse(x + lx * t * 0.6 - 1, y + ly * t * 0.6 - 1, w + 2, d + 2));
        else fillQuad(g, quad(x + lx * t - BORDE, y + ly * t - BORDE, w + BORDE * 2, d + BORDE * 2));
      }
    }
    g.globalCompositeOperation = 'destination-in';
    g.drawImage(this.suelo(), 0, 0);
    g.globalCompositeOperation = 'source-over';
  }

  draw(ctx, lista) {
    const clave = `${viewIndex()}|${lista.map((e) => `${e.x},${e.y},${e.w},${e.d},${e.redonda ? 1 : 0}`).join(';')}`;
    if (clave !== this.clave) { this.rehacer(lista); this.clave = clave; }
    ctx.globalAlpha = OPACIDAD;
    ctx.drawImage(this.mask, 0, 0);
    ctx.globalAlpha = 1;
  }
}

// Sombra pequeña de lo que está encima de un mueble: cae sobre él y no se sale.
export function sombraEncima(ctx, it, sobre) {
  const [lx, ly] = luz();
  let x = it.x + lx / 3, y = it.y + ly / 3, x1 = x + it.w, y1 = y + it.d;
  if (sobre) {
    x = Math.max(x, sobre.x); y = Math.max(y, sobre.y);
    x1 = Math.min(x1, sobre.x + sobre.w); y1 = Math.min(y1, sobre.y + sobre.d);
  }
  if (x1 <= x || y1 <= y) return;
  ctx.globalAlpha = OPACIDAD;
  ctx.fillStyle = PAL.tinta;
  fillQuad(ctx, it.redonda ? elipse(x, y, x1 - x, y1 - y, it.z) : quad(x, y, x1 - x, y1 - y, it.z));
  ctx.globalAlpha = 1;
}
