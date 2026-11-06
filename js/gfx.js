// Utilidades de dibujo comunes: paleta, imágenes, texto nítido y contornos.
export const PAL = {};

export async function loadPalette() {
  Object.assign(PAL, await loadJSON('assets/ui/palette.json'));
}

// Lo que lleva descargado el juego, para la barra de carga.
export const carga = { hechas: 0, pedidas: 0, alCambiar: null };
const ESPERAS = [400, 1200, 3000];   // la red del móvil pierde peticiones: se insiste antes de rendirse

async function conReintentos(url, intento) {
  carga.pedidas++;
  for (let i = 0; ; i++) {
    try {
      const hecho = await intento(i);
      carga.hechas++;
      carga.alCambiar?.();
      return hecho;
    } catch (e) {
      if (i >= ESPERAS.length) throw Object.assign(new Error(`No carga ${url}`), { archivo: url });
      await new Promise((ok) => { setTimeout(ok, ESPERAS[i]); });
    }
  }
}

const traer = async (url) => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`No carga ${url}`);
  return r;
};

export const loadJSON = (url) => conReintentos(url, async () => (await traer(url)).json());
export const loadText = (url) => conReintentos(url, async () => (await traer(url)).text());

export function loadImage(src) {
  return conReintentos(src, (intento) => new Promise((ok, ko) => {
    const i = new Image();
    i.onload = () => ok(i);
    i.onerror = () => ko(new Error(`No carga ${src}`));
    i.src = intento ? `${src}?r=${intento}` : src;   // el navegador no repite una imagen que falló
  }));
}

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  return [c, g];
}

export const FONT = {
  label: '16px Silkscreen',
  text: '24px "Pixelify Sans"',
  bold: 'bold 24px "Pixelify Sans"',
  boldBig: 'bold 30px "Pixelify Sans"',
  hand: '28px "Patrick Hand"',
  small: '20px "Pixelify Sans"',
  titulo: 'bold 56px "Pixelify Sans"',
  tituloS: 'bold 42px "Pixelify Sans"',
  romano: 'bold 110px "Pixelify Sans"',
  romanoS: 'bold 64px "Pixelify Sans"',
};

export const UI = {
  fondo: '#1E1A22',
  banda: '#2B2420',
  papel: '#F4EBD9',
  sombra: '#C9B999',
  acento: '#D98A4B',
  apagado: '#665A4B',
  apagadoClaro: '#A89A85',
};

// Parte un texto en líneas que quepan en `width`.
export function wrap(ctx, text, width, font) {
  ctx.font = font;
  const lines = [];
  let line = '';
  for (const word of text.split(' ')) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > width && line) { lines.push(line); line = word; } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

// Sin una fuente el juego se ve peor, pero se juega: no para la carga.
export const loadFonts = () => Promise.all(Object.values(FONT).map((f) => document.fonts.load(f, 'AÑó').catch(() => null)));

const texts = new Map();

// fillText sale con antialias: se umbraliza el alfa para que siga siendo pixel art.
function textSprite(str, font, color) {
  const key = `${font}|${color}|${str}`;
  let s = texts.get(key);
  if (s) return s;
  const size = parseInt(font.match(/(\d+)px/)[1], 10);
  const [, m] = makeCanvas(1, 1);
  m.font = font;
  const [c, g] = makeCanvas(Math.max(1, Math.ceil(m.measureText(str).width) + 2), Math.ceil(size * 1.5));
  g.font = font;
  g.textBaseline = 'top';
  g.fillStyle = color;
  g.fillText(str, 1, 1);
  const rgb = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
  const img = g.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = rgb[0]; d[i + 1] = rgb[1]; d[i + 2] = rgb[2];
    d[i + 3] = d[i + 3] >= 110 ? 255 : 0;
  }
  g.putImageData(img, 0, 0);
  texts.set(key, c);
  return c;
}

export function drawText(ctx, str, x, y, font, color, align = 'left') {
  // Sin ligaduras: en Pixelify la «fi» de Rafi sale como una A.
  const s = textSprite(str.replace(/f([il])/g, 'f‌$1'), font, color);
  const dx = align === 'center' ? Math.round(s.width / 2) : align === 'right' ? s.width : 0;
  ctx.drawImage(s, Math.round(x - dx), Math.round(y));
}

const masks = new WeakMap();

function mask(sprite, color) {
  let byColor = masks.get(sprite);
  if (!byColor) masks.set(sprite, (byColor = new Map()));
  let m = byColor.get(color);
  if (!m) {
    const [c, g] = makeCanvas(sprite.width, sprite.height);
    g.drawImage(sprite, 0, 0);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = color;
    g.fillRect(0, 0, c.width, c.height);
    byColor.set(color, (m = c));
  }
  return m;
}

// Contorno de 1 px por fuera de la silueta del sprite.
export function drawOutlined(ctx, sprite, x, y, color) {
  const m = mask(sprite, color);
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) ctx.drawImage(m, x + dx, y + dy);
  ctx.drawImage(sprite, x, y);
}

export function drawSilhouette(ctx, sprite, x, y, color) {
  ctx.drawImage(mask(sprite, color), x, y);
}

export function hits(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

export const inside = (r, x, y) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const toRect = ([x, y, w, h]) => ({ x, y, w, h });
