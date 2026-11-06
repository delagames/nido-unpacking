// Transiciones: solapas de caja entre escenas y trama breve al girar la vista o cambiar el zoom.
import { PAL, makeCanvas } from './gfx.js';

const CIERRA_MS = 160;
const PAUSA_MS = 40;
const ABRE_MS = 170;
const CINTA = 18;

export class Solapas {
  constructor() { this.t = null; this.foto = null; this.panel = null; }

  get activa() { return this.t !== null; }
  get cerrando() { return this.t !== null && this.t < CIERRA_MS + PAUSA_MS; }

  // Foto de lo que había: la escena nueva ya existe, pero aún no se ve.
  empezar(canvas) {
    if (this.cerrando) return;
    if (!this.foto || this.foto.width !== canvas.width || this.foto.height !== canvas.height) {
      [this.foto, this.fg] = makeCanvas(canvas.width, canvas.height);
    }
    this.fg.drawImage(canvas, 0, 0);
    this.t = 0;
  }

  update(dt) {
    this.t += dt;
    if (this.t >= CIERRA_MS + PAUSA_MS + ABRE_MS) this.t = null;
  }

  // Cartón con ondulado y borde de solapa.
  hacerPanel(W, h) {
    const [c, g] = makeCanvas(W, h);
    g.fillStyle = PAL.carton;
    g.fillRect(0, 0, W, h);
    g.fillStyle = PAL.carton_sombra;
    for (let x = 0; x < W; x += 6) g.fillRect(x, 0, 1, h);
    for (let y = 9; y < h; y += 37) g.fillRect(0, y, W, 1);
    this.panel = c;
  }

  // Si aún cierra, debajo se ve la escena de antes.
  fondo(ctx) { ctx.drawImage(this.foto, 0, 0); }

  draw(ctx, W, H) {
    const t = this.t;
    let e;
    if (t < CIERRA_MS) e = 1 - (1 - t / CIERRA_MS) ** 2;
    else if (t < CIERRA_MS + PAUSA_MS) e = 1;
    else e = 1 - ((t - CIERRA_MS - PAUSA_MS) / ABRE_MS) ** 2;
    const mitad = Math.ceil(H / 2);
    if (this.panel?.width !== W || this.panel?.height !== mitad) this.hacerPanel(W, mitad);
    const h = Math.round(mitad * e);
    if (h > 0) {
      ctx.drawImage(this.panel, 0, h - mitad);
      ctx.drawImage(this.panel, 0, H - h);
      ctx.fillStyle = PAL.tinta;
      ctx.fillRect(0, h, W, 2);
      ctx.fillRect(0, H - h - 2, W, 2);
    }
    // La cinta sella la caja en la parte central del gesto.
    if (e > 0.92) {
      const ancho = Math.round(W * Math.min(1, (e - 0.92) / 0.08));
      const y = Math.round(H / 2 - CINTA / 2);
      ctx.fillStyle = PAL.cinta_marron;
      ctx.fillRect(0, y, ancho, CINTA);
      ctx.fillStyle = PAL.carton_sombra;
      ctx.fillRect(0, y + 4, ancho, 2);
    }
  }
}

const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
const PASOS = 3;
const PASO_MS = 34;

// Patrón 4×4: deja ver un cuarto, la mitad o tres cuartos de la imagen anterior.
function patron(g, nivel) {
  const [c, t] = makeCanvas(4, 4);
  t.fillStyle = '#000000';
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) if (BAYER[y][x] < nivel * 16) t.fillRect(x, y, 1, 1);
  return g.createPattern(c, 'repeat');
}

export class Trama {
  constructor() { this.t = null; this.foto = null; this.patrones = null; }

  empezar(canvas) {
    if (!this.foto || this.foto.width !== canvas.width || this.foto.height !== canvas.height) {
      [this.foto, this.fg] = makeCanvas(canvas.width, canvas.height);
      [this.mezcla, this.mg] = makeCanvas(canvas.width, canvas.height);
    }
    this.fg.drawImage(canvas, 0, 0);
    this.t = 0;
  }

  update(dt) {
    if (this.t === null) return;
    this.t += dt;
    if (this.t >= PASOS * PASO_MS) this.t = null;
  }

  draw(ctx, x, y, w, h) {
    if (this.t === null) return;
    this.patrones ??= [0.75, 0.5, 0.25].map((n) => patron(this.mg, n));
    const g = this.mg;
    g.clearRect(0, 0, this.mezcla.width, this.mezcla.height);
    g.drawImage(this.foto, x, y, w, h, x, y, w, h);
    g.globalCompositeOperation = 'destination-in';
    g.fillStyle = this.patrones[Math.min(PASOS - 1, Math.floor(this.t / PASO_MS))];
    g.fillRect(0, 0, this.mezcla.width, this.mezcla.height);
    g.globalCompositeOperation = 'source-over';
    ctx.drawImage(this.mezcla, 0, 0);
  }
}
