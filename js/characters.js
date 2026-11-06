// Cargador común de personajes en formato SpriteCollab: AnimData.xml + <Anim>-Anim.png.
// Cada fila de la hoja es una dirección, en este orden:
// abajo, abajo-dcha, dcha, arriba-dcha, arriba, arriba-izq, izq, abajo-izq.
import { loadImage, loadText } from './gfx.js';
import { toScreen, viewIndex } from './iso.js';

const TICK_MS = 1000 / 60; // las Duration van en frames de 60 Hz

export async function loadCharacter(dir) {
  const xml = new DOMParser().parseFromString(await loadText(`${dir}/AnimData.xml`), 'text/xml');
  const anims = {};
  await Promise.all([...xml.querySelectorAll('Anim')].map(async (a) => {
    const name = a.querySelector('Name').textContent;
    anims[name] = {
      fw: +a.querySelector('FrameWidth').textContent,
      fh: +a.querySelector('FrameHeight').textContent,
      durations: [...a.querySelectorAll('Duration')].map((d) => +d.textContent * TICK_MS),
      img: await loadImage(`${dir}/${name}-Anim.png`),
    };
    anims[name].pies = pies(anims[name]);
  }));
  return anims;
}

// Dónde acaban los pies en cada fila de la hoja: el dibujo no ocupa lo mismo en todas las celdas,
// y un ancla fija deja al personaje flotando sobre su sombra.
function pies(a) {
  const { width, height } = a.img;
  const c = document.createElement('canvas');
  c.width = width; c.height = height;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(a.img, 0, 0);
  const { data } = g.getImageData(0, 0, width, height);
  const salida = [];
  for (let r = 0; r < Math.floor(height / a.fh); r++) {
    const bajos = [];
    for (let k = 0; k < a.durations.length; k++) {
      let bajo = -1;
      for (let y = a.fh - 1; y >= 0 && bajo < 0; y--) {
        for (let x = 0; x < a.fw; x++) {
          if (data[((r * a.fh + y) * width + k * a.fw + x) * 4 + 3]) { bajo = y; break; }
        }
      }
      if (bajo >= 0) bajos.push(bajo);
    }
    bajos.sort((p, q) => p - q);
    salida.push(bajos.length ? bajos[bajos.length >> 1] + 1 : a.fh * 0.72);
  }
  return salida;
}

// Fila de la hoja para mirar en la dirección (dx, dy) de pantalla.
export function facingRow(dx, dy) {
  const deg = Math.atan2(dy, dx) * 180 / Math.PI;
  return ((Math.round((90 - deg) / 45) % 8) + 8) % 8;
}

export function drawAnim(ctx, anim, row, x, y, timeMs, scale = 1) {
  const total = anim.durations.reduce((a, b) => a + b, 0);
  let t = timeMs % total, frame = 0;
  while (t >= anim.durations[frame]) t -= anim.durations[frame++];
  const r = Math.min(row, Math.floor(anim.img.height / anim.fh) - 1);
  ctx.drawImage(anim.img, frame * anim.fw, r * anim.fh, anim.fw, anim.fh, x, y, anim.fw * scale, anim.fh * scale);
}

// Personaje de pie en un punto del mundo; los Pokémon van a ×2 para casar con el tablero.
export class Actor {
  constructor(anims, x, y, row, scale = 2, anim = 'Idle') {
    Object.assign(this, { anims, x, y, row, scale, anim, z: 0, w: 16, d: 16, h: 48 });
    this.worldFacing = scale > 1;   // María mira por pantalla; los demás, por el mundo
  }

  // Caja para el orden de pintado: la del dibujo, no la de los pies.
  get caja() {
    const a = this.anims[this.anim] ?? this.anims.Idle;
    const alto = a.fh * this.scale * (this.scale > 1 ? 0.72 : 1);
    return { x: this.x - 8, y: this.y - 8, z: this.z, w: 32, d: 32, h: Math.max(this.h, alto - 32) };
  }

  // Rectángulo de pantalla que puede ocupar con cualquiera de sus animaciones.
  get silueta() {
    const celdas = Object.values(this.anims);
    const fw = Math.max(...celdas.filter((a) => a.fw).map((a) => a.fw)) * this.scale, fh = Math.max(...celdas.filter((a) => a.fh).map((a) => a.fh)) * this.scale;
    const s = toScreen(this.x + this.w / 2, this.y + this.d / 2, this.alto ?? this.z);
    return { x: Math.round(s.x - fw / 2), y: Math.round(s.y - fh), w: fw, h: Math.round(fh * 1.3) };
  }

  draw(ctx, time) {
    if (this.oculto || (this.parpadea > 0 && Math.floor(this.parpadea / 70) % 2)) return;
    const a = this.anims[this.anim] ?? this.anims.Idle;
    const s = toScreen(this.x + this.w / 2, this.y + this.d / 2, this.alto ?? this.z);
    const px = a.fw * this.scale;
    const row = this.worldFacing ? (this.row + 16 - 2 * viewIndex()) % 8 : this.row;
    // Los frames de SpriteCollab dejan sitio bajo los pies. Quien vuela va a 3/4 de la celda.
    const fila = Math.min(row, a.pies.length - 1);
    const py = this.scale > 1 ? (this.anims.vuela ? a.fh * 0.72 : a.pies[fila]) * this.scale : a.fh * this.scale;
    drawAnim(ctx, a, row, Math.round(s.x - px / 2) + (this.dx ?? 0), Math.round(s.y - py), time, this.scale);
  }
}
