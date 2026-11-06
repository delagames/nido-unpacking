// Notas del Buitre, de la Rafi y de Manolo, a pantalla completa, y lectura por páginas.
import { PAL, UI, FONT, drawText, wrap, inside } from './gfx.js';
import { sfx } from './objects.js';
import { voz } from './voz.js';

const MARGIN = 32;

const LINE_HAND = 36;
const PARRAFO = 14;

// Letra del Buitre, siempre en mayúsculas: cada letra ±1 px, fijo por nota.
// La posición se mide sobre la línea entera para que coincida con el ancho de wrap().
function drawShaky(ctx, line, x, y, seed, color = PAL.tinta_azul) {
  ctx.font = FONT.hand;
  for (let i = 0; i < line.length; i++) {
    const dy = ((seed + i * 7) * 2654435761 >>> 30) % 3 - 1;
    drawText(ctx, line[i], x + ctx.measureText(line.slice(0, i)).width, y + dy, FONT.hand, color);
  }
}

// Una carta en líneas: la última, si es corta, es la firma.
function lineasCarta(ctx, text, width) {
  const salida = [];
  const parrafos = text.toLocaleUpperCase('es').split('\n');
  parrafos.forEach((p, i) => {
    const firma = i > 0 && i === parrafos.length - 1 && p.length <= 20;
    for (const l of wrap(ctx, p, width, FONT.hand)) salida.push({ l, firma, aparte: false });
    salida.at(-1).aparte = true;
  });
  return salida;
}

function altoCarta(lineas, lh = LINE_HAND) {
  return lineas.reduce((s, c) => s + lh + (c.aparte ? PARRAFO : 0), 0);
}

// Con la pantalla baja el papel aprovecha casi todo el alto.
const margen = (H) => (H < 420 ? 10 : MARGIN);

// Reparte una carta en hojas de `alto` px. Si cabe entera, una sola.
function hojasCarta(lineas, alto) {
  const hojas = [[]];
  let y = 0;
  for (const c of lineas) {
    if (y + LINE_HAND > alto && hojas.at(-1).length) { hojas.push([]); y = 0; }
    hojas.at(-1).push(c);
    y += LINE_HAND + (c.aparte ? PARRAFO : 0);
  }
  return hojas;
}

// Bloque de texto escrito a mano. Son cartas: saludo, cuerpo y firma, y la firma a la derecha.
function drawHand(ctx, lineas, x, y, width, seed, color) {
  for (const { l, firma, aparte } of lineas) {
    ctx.font = FONT.hand;
    const px = firma ? x + width - ctx.measureText(l).width : x;
    drawShaky(ctx, l, px, y, seed + y, color);
    y += LINE_HAND + (aparte ? PARRAFO : 0);
  }
  return y;
}

// Una hoja de alto `alto`, centrada. Sin alto, toda la pantalla.
function paper(ctx, W, H, squared, alto = H - margen(H) * 2) {
  const top = Math.max(margen(H), Math.round((H - alto) / 2));
  ctx.fillStyle = UI.fondo;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = UI.sombra;
  ctx.fillRect(MARGIN + 4, top + 4, W - MARGIN * 2, alto);
  ctx.fillStyle = squared ? PAL.papel_cuadros : UI.papel;
  ctx.fillRect(MARGIN, top, W - MARGIN * 2, alto);
  if (squared) {
    ctx.fillStyle = PAL.cuadros;
    for (let x = MARGIN + 16; x < W - MARGIN; x += 16) ctx.fillRect(x, top, 1, alto);
    for (let y = top + 16; y < top + alto; y += 16) ctx.fillRect(MARGIN, y, W - MARGIN * 2, 1);
  } else {
    ctx.fillStyle = UI.sombra;
    ctx.beginPath();
    ctx.moveTo(W - MARGIN - 28, top); ctx.lineTo(W - MARGIN, top + 28); ctx.lineTo(W - MARGIN - 28, top + 28);
    ctx.fill();
  }
  return top;
}

export class Note {
  constructor(game, { de, t }, onClose) {
    this.g = game; this.de = de; this.t = t; this.onClose = onClose;
    this.seed = t.length * 31 + t.charCodeAt(0);
    this.h = 0;
    sfx.papel();
    voz.decir(de, t);
  }

  update() {}

  // Las hojas de esta pantalla: lo que no cabe sigue en otra, nunca se sale del papel.
  hojas() {
    const { W, H, ctx } = this.g;
    if (this.reparto?.W !== W || this.reparto?.H !== H) {
      const lineas = lineasCarta(ctx, this.t, W - (MARGIN + 24) * 2);
      this.reparto = { W, H, hojas: hojasCarta(lineas, H - margen(H) * 2 - 112) };
    }
    return this.reparto.hojas;
  }

  tap() {
    if (++this.h < this.hojas().length) { sfx.papel(); return; }
    voz.callar();
    this.g.overlay = null;
    this.onClose?.();
  }

  draw(ctx) {
    const { W, H } = this.g;
    const left = MARGIN + 24;
    const width = W - left * 2;
    const hojas = this.hojas();
    this.h = Math.min(this.h, hojas.length - 1);
    // El papel, a la medida de lo escrito: nada de media hoja en blanco.
    const alto = hojas.length > 1 ? H - margen(H) * 2 : Math.min(H - margen(H) * 2, altoCarta(hojas[0]) + 112);
    const top = paper(ctx, W, H, this.de === 'rafi', alto);
    drawHand(ctx, hojas[this.h], left, top + 36, width, this.seed, this.de === 'buitre' ? PAL.tinta_azul : PAL.tinta);
    const accion = this.h < hojas.length - 1 ? 'TOCAR PARA SEGUIR' : 'TOCAR PARA CERRAR';
    drawText(ctx, hojas.length > 1 ? `${accion} · ${this.h + 1} / ${hojas.length}` : accion, W / 2, top + alto - 40, FONT.label, UI.apagado, 'center');
  }
}

// Pregunta o aviso sobre el juego: una tarjeta con uno o dos botones. Lo de fuera no responde.
export class Dialogo {
  constructor(game, { titulo, lineas, si, no = null, onSi, onNo }) {
    Object.assign(this, { g: game, titulo, lineas, si, no, onSi, onNo });
    sfx.papel();
  }

  update() {}

  layout() {
    const { W, H, ctx } = this.g;
    // En horizontal la tarjeta crece a lo ancho, y si aún no cabe, la letra baja y todo se aprieta.
    const w = Math.min(W - 32, H < 480 ? 720 : 480), iw = w - 40;
    const cab = wrap(ctx, this.titulo, iw, FONT.bold);
    const medida = (font) => this.lineas.flatMap((t, i) => wrap(ctx, t, iw, font).map((l, k) => ({ l, nuevo: i > 0 && k === 0 })));
    let cuerpo = medida(FONT.text);
    // Los botones van en fila si caben, y si no, uno encima del otro.
    ctx.font = FONT.bold;
    const textos = [this.no, this.si].filter(Boolean);
    const enFila = textos.length === 2 && textos.every((t) => ctx.measureText(t).width + 24 <= (iw - 12) / 2);
    const altoBotones = enFila || textos.length === 1 ? 52 : 116;
    const total = (m) => m.pad + cab.length * m.cab + m.hueco + cuerpo.reduce((s, c) => s + m.lh + (c.nuevo ? m.hueco : 0), 0) + m.pie + altoBotones + m.pie;
    let m = { pad: 24, cab: 34, hueco: 10, lh: 30, pie: 18, font: FONT.text };
    if (total(m) > H - 16) {
      m = { pad: 14, cab: 28, hueco: 6, lh: 24, pie: 10, font: FONT.small };
      cuerpo = medida(m.font);
    }
    const alto = total(m);
    const x = Math.round((W - w) / 2), y = Math.max(8, Math.round((H - alto) / 2));
    // Pase lo que pase, los botones se ven: sin ellos no se sale de aquí.
    const by = Math.min(y + alto - m.pie - altoBotones, H - altoBotones - 8);
    const bx = x + 20, bw = enFila ? Math.floor((iw - 12) / 2) : iw;
    const botones = textos.map((label, i) => ({
      label, ok: label === this.si, h: 52, w: bw,
      x: enFila ? bx + i * (bw + 12) : bx,
      y: enFila || textos.length === 1 ? by : by + i * 64,
    }));
    return { x, y, w, alto, cab, cuerpo, botones, m };
  }

  tap(p) {
    const b = this.layout().botones.find((o) => p.x >= o.x && p.x < o.x + o.w && p.y >= o.y && p.y < o.y + o.h);
    if (!b) return;
    sfx.papel();
    this.g.overlay = null;
    (b.ok ? this.onSi : this.onNo)?.();
  }

  draw(ctx) {
    const { W, H } = this.g;
    const { x, y, w, alto, cab, cuerpo, botones, m } = this.layout();
    ctx.fillStyle = 'rgba(20,16,22,0.72)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = PAL.tinta; ctx.fillRect(x + 4, y + 5, w, alto);
    ctx.fillStyle = UI.papel; ctx.fillRect(x, y, w, alto);
    ctx.fillStyle = UI.acento; ctx.fillRect(x, y, w, 5);
    let ty = y + m.pad - 4;
    for (const l of cab) { drawText(ctx, l, x + 20, ty, FONT.bold, PAL.tinta); ty += m.cab; }
    ty += m.hueco;
    for (const { l, nuevo } of cuerpo) {
      if (nuevo) ty += m.hueco;
      drawText(ctx, l, x + 20, ty, m.font, PAL.tinta);
      ty += m.lh;
    }
    for (const b of botones) {
      ctx.fillStyle = PAL.tinta; ctx.fillRect(b.x, b.y + 3, b.w, b.h);
      ctx.fillStyle = b.ok ? UI.acento : UI.sombra; ctx.fillRect(b.x, b.y, b.w, b.h);
      drawText(ctx, b.label, b.x + b.w / 2, b.y + 10, FONT.bold, PAL.tinta, 'center');
    }
  }
}

// Texto largo: páginas que se pasan tocando. Se reparte según el alto de la pantalla.
export class Reading {
  constructor(game, title, pages, onClose, hand = false) {
    this.g = game; this.title = title; this.pages = pages; this.onClose = onClose; this.i = 0;
    this.hand = hand;   // escrito por el Buitre
    this.gap = pages[0].length === 10 ? 0 : 12;   // el cuaderno negro es una lista seguida
    sfx.papel();
    this.habla();
  }

  update() {}

  // Lo manuscrito lo lee el Buitre; lo que no tenga voz grabada se queda en silencio.
  habla() {
    const texto = [this.pages[this.i] ?? []].flat().filter((p) => !p.startsWith('@img:')).join(' ');
    if (this.hand && texto) voz.decir('buitre', texto);
    else voz.callar();
  }

  layout() {
    const { W, H, ctx } = this.g;
    if (this.laid?.W === W && this.laid?.H === H) return this.laid.pages;
    const font = this.hand ? FONT.hand : FONT.text;
    const lh = this.hand ? LINE_HAND : 30;
    const width = W - (MARGIN + 24) * 2;
    const top = margen(H) + 60, bottom = H - margen(H) - 56;
    const pages = [];
    for (const src of this.pages) {
      let cur = [], y = top;
      for (const p of src) {
        // «@img:clave» es una página con una imagen, no con texto.
        if (p.startsWith('@img:')) { cur.push({ img: p.slice(5), y }); continue; }
        for (const trozo of (this.hand ? p.toLocaleUpperCase('es') : p).split('\n')) {
          for (const l of wrap(ctx, trozo, width, font)) {
            if (y + lh > bottom) { pages.push(cur); cur = []; y = top; }
            cur.push({ l, y });
            y += lh;
          }
          y += this.gap || PARRAFO * (p.includes('\n') ? 1 : 0);
        }
      }
      pages.push(cur);
    }
    this.laid = { W, H, pages };
    return pages;
  }

  tap() {
    sfx.papel();
    if (++this.i >= this.layout().length) {
      voz.callar();
      this.g.overlay = null;
      this.onClose?.();
    } else this.habla();
  }

  draw(ctx) {
    const { W, H } = this.g;
    paper(ctx, W, H, false);
    const pages = this.layout();
    this.i = Math.min(this.i, pages.length - 1);
    drawText(ctx, this.title.toUpperCase(), W / 2, margen(H) + 20, FONT.label, UI.apagado, 'center');
    for (const { l, y, img } of pages[this.i]) {
      if (img) {
        const pic = this.g.images[img];
        const k = Math.max(1, Math.floor(2 * Math.min((W - MARGIN * 2 - 16) / pic.width, (H - y - MARGIN - 64) / pic.height)) / 2);
        ctx.drawImage(pic, Math.round((W - pic.width * k) / 2), y, pic.width * k, pic.height * k);
        continue;
      }
      if (this.hand) drawShaky(ctx, l, MARGIN + 24, y, this.i * 97 + 13 + y);
      else drawText(ctx, l, MARGIN + 24, y, FONT.text, PAL.tinta);
    }
    drawText(ctx, `${this.i + 1} / ${pages.length}`, W / 2, H - margen(H) - 40, FONT.label, UI.apagado, 'center');
  }
}

// Lista de páginas del cuaderno negro.
export function paginasCuaderno(game) {
  const { lineas } = game.data.textos.cuaderno;
  const pages = [];
  for (let i = 0; i < lineas.length; i += 10) pages.push(lineas.slice(i, i + 10));
  return pages;
}

// Páginas de un objeto que se puede leer. Los cantos del manuscrito van en su propia línea.
export function paginasDe(game, def) {
  const texto = def.lee === 'manuscrito' ? game.data.textos.manuscrito : def.lee;
  return {
    titulo: texto.titulo,
    paginas: texto.paginas.map((t) => {
      const canto = t.match(/^(CANTO [IVX]+\.) (.*)$/);
      return canto ? [canto[1], canto[2]] : [t];
    }),
  };
}

// Cuaderno de María: lista de lo leído. Abajo se cierra; a los lados se pasa de nota.
export class Notebook {
  constructor(game) { this.g = game; this.i = 0; this.h = 0; this.habla(); }
  update() {}

  // Lo que se ve es lo que suena: al pasar de nota cambia, y al salir del cuaderno se calla.
  habla() {
    const n = this.g.state.notes[this.i];
    if (n) voz.decir(n.de, n.t);
  }

  tap(p) {
    const antes = this.i;
    this.pasa(p);
    if (this.g.overlay !== this) voz.callar();
    else if (this.i !== antes) this.habla();
  }

  pasa(p) {
    const notes = this.g.state.notes;
    const { W, H } = this.g;
    const n = notes[this.i];
    sfx.papel();
    const b = this.botones();
    // Vacío no hay nada que pasar: cualquier toque cierra.
    if (!n || inside(b.cerrar, p.x, p.y)) { this.g.overlay = null; return; }
    // Las flechas pasan las hojas de la nota y, al acabarlas, de nota.
    if (inside(b.luego, p.x, p.y)) {
      if (this.h < this.hojas(n).length - 1) this.h++;
      else if (this.i < notes.length - 1) { this.i++; this.h = 0; }
      return;
    }
    if (inside(b.antes, p.x, p.y)) {
      if (this.h > 0) this.h--;
      else if (this.i > 0) { this.i--; this.h = this.hojas(notes[this.i]).length - 1; }
      return;
    }
    if (n?.negro) {
      const volver = this;
      this.g.overlay = new Reading(this.g, n.t, paginasCuaderno(this.g), () => { this.g.overlay = volver; }, true);
    } else if (n?.leer) {
      const volver = this;
      const { titulo, paginas } = paginasDe(this.g, this.g.catalog.defs.get(n.leer));
      this.g.overlay = new Reading(this.g, titulo, paginas, () => { this.g.overlay = volver; }, true);
    }
  }

  // Lo escrito se reparte entre la cabecera y los botones.
  hojas(n) {
    const { W, H, ctx } = this.g;
    const abre = n.negro || n.leer ? 28 : 0;
    return hojasCarta(lineasCarta(ctx, n.t, W - (MARGIN + 24) * 2), this.botones().antes.y - 8 - abre - this.arriba);
  }

  // Donde empieza lo escrito. Con la pantalla baja, la cabecera se aprieta.
  get arriba() { return this.g.H < 420 ? 52 : MARGIN + 100; }

  botones() {
    const { W, H } = this.g;
    const y = H - margen(H) - (H < 420 ? 58 : 68), h = 52, lado = 56;
    const izq = MARGIN + 12;
    const w = Math.min(130, W - (izq + lado + 10) * 2);
    return {
      antes: { x: izq, y, w: lado, h },
      cerrar: { x: Math.round((W - w) / 2), y, w, h },
      luego: { x: W - izq - lado, y, w: lado, h },
    };
  }

  boton(ctx, r, texto) {
    ctx.fillStyle = PAL.tinta; ctx.fillRect(r.x, r.y + 3, r.w, r.h);
    ctx.fillStyle = UI.sombra; ctx.fillRect(r.x, r.y, r.w, r.h);
    drawText(ctx, texto, r.x + r.w / 2, r.y + 13, FONT.bold, PAL.tinta, 'center');
  }

  draw(ctx) {
    const { W, H } = this.g;
    const notes = this.g.state.notes;
    paper(ctx, W, H, false);
    if (H >= 420 || !notes.length) drawText(ctx, 'CUADERNO DE MARÍA', W / 2, margen(H) + 20, FONT.label, UI.apagado, 'center');
    if (!notes.length) {
      drawText(ctx, 'Nada todavía.', W / 2, H / 2 - 16, FONT.text, UI.apagado, 'center');
      this.boton(ctx, this.botones().cerrar, 'Cerrar');
      return;
    }
    const n = notes[this.i];
    const hojas = this.hojas(n);
    const baja = H < 420;
    const cy = baja ? 18 : MARGIN + 60;
    this.h = Math.min(this.h, hojas.length - 1);
    drawText(ctx, `Capítulo ${n.cap}`, MARGIN + 24, cy, FONT.bold, PAL.tinta);
    const hoja = hojas.length > 1 ? ` · ${W < 440 ? '' : 'HOJA '}${this.h + 1}/${hojas.length}` : '';
    drawText(ctx, `${this.i + 1}/${notes.length}${hoja}`, W - MARGIN - 24, cy + 6, FONT.label, UI.apagado, 'right');
    const width = W - (MARGIN + 24) * 2;
    const y = drawHand(ctx, hojas[this.h], MARGIN + 24, this.arriba, width, n.t.length, n.de === 'buitre' ? PAL.tinta_azul : PAL.tinta);
    if ((n.negro || n.leer) && this.h === hojas.length - 1) drawText(ctx, 'Tocar para abrirlo', W / 2, y + 4, FONT.label, UI.apagado, 'center');
    const b = this.botones();
    if (this.i > 0 || this.h > 0) this.boton(ctx, b.antes, '<');
    this.boton(ctx, b.cerrar, 'Cerrar');
    if (this.i < notes.length - 1 || this.h < hojas.length - 1) this.boton(ctx, b.luego, '>');
  }
}
