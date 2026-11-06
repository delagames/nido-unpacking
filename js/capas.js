// Capas horneadas del sótano: lo que no cambia de un fotograma a otro se pinta una vez en un lienzo
// y luego solo se copia. En un móvil modesto es la diferencia entre 60 y 6 fotogramas por segundo.
//
// Hay tres lienzos: el cartón de la caja, el suelo (tablero, alfombras y sombras) y las piezas
// quietas (muebles, muros, coches...). Lo que se anima tiene su zona: ahí se repinta todo en orden,
// así que el resultado es el mismo que pintar el sótano entero pieza a pieza.
//
// La firma resume todo lo que cambia el dibujo de las capas. Si algo nuevo cambia lo que se ve de
// una pieza quieta, hay que sumarlo a `firma()`.
import { makeCanvas } from './gfx.js';
import { BOARD, spriteTopLeft, toScreen, viewIndex } from './iso.js';

const HOLGURA = 6;     // lo que un dibujo puede asomar fuera de su caja
const MARGEN = 40;     // el cartón se ve un poco más allá de la cámara: la cólera sacude la pantalla

function medir(lienzo, w, h) {
  const [c, g] = lienzo;
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; g.imageSmoothingEnabled = false; }
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, w, h);
  return g;
}

const cruzan = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

// Rectángulo de pantalla donde pinta una pieza, a píxeles pares: con el zoom de lejos el recorte
// cae justo en un píxel de la pantalla.
function recuadro(e, catalog) {
  const m = e.halo ?? (e.item || e.actor ? HOLGURA : 24);
  let x0, y0, x1, y1, y0Extra = 0;
  if (e.sube) y0Extra = e.sube;
  if (e.item && !e.item.wall) {
    const it = e.item, img = catalog.image(it);
    const t = spriteTopLeft(it.x, it.y, it.z, it.w, it.d, img.height);
    [x0, y0, x1, y1] = [t.x, t.y, t.x + img.width, t.y + img.height];
  } else if (e.actor) {
    ({ x: x0, y: y0, w: x1, h: y1 } = e.actor.silueta);
    x1 += x0; y1 += y0;
  } else {
    const q = [];
    for (const [x, y] of [[e.x, e.y], [e.x + e.w, e.y], [e.x, e.y + e.d], [e.x + e.w, e.y + e.d]]) q.push(toScreen(x, y, e.z), toScreen(x, y, e.z + e.h));
    x0 = Math.min(...q.map((p) => p.x)); x1 = Math.max(...q.map((p) => p.x));
    y0 = Math.min(...q.map((p) => p.y)); y1 = Math.max(...q.map((p) => p.y));
  }
  x0 = 2 * Math.floor((x0 - m) / 2); y0 = 2 * Math.floor((y0 - m - y0Extra) / 2);
  return { x: x0, y: y0, w: 2 * Math.ceil((x1 + m - x0) / 2), h: 2 * Math.ceil((y1 + m - y0) / 2) };
}

export class Capas {
  constructor(base) {
    this.b = base;
    this.suelo = makeCanvas(1, 1);
    this.quietas = makeCanvas(1, 1);
    this.escena = makeCanvas(1, 1);
    this.conLuces = false;
    this.piezas = [];
    this.reposo = { zonas: [], lista: [] };   // dónde hay algo que se anima y qué repintar ahí
    this.mano = this.reposo;                  // igual, con las luces quietas: se pisan con las guías
    this.clave = null;
    this.carton = makeCanvas(1, 1);
    this.claveCarton = null;
    this.horneos = 0;
  }

  // Con zoom de lejos, las capas van a esa escala: copiar sale idéntico a pintar pieza a pieza.
  get escala() { return Math.min(1, this.b.cam.zoom); }

  firma() {
    const b = this.b;
    let h = 2166136261 ^ viewIndex();
    const suma = (v) => { h = Math.imul(h ^ (v | 0), 16777619); };
    suma(b.puertaAbierta ? 1 : 0);
    suma(b.held?.uid ?? 0);
    for (const i of b.items) {
      suma(i.uid); suma(i.x * 4); suma(i.y * 4); suma(i.z * 4); suma(i.rot); suma(i.tilt); suma(i.u * 4);
      suma(i.base * 4); suma(i.parent ?? 0); suma(i.under ?? 0);
      suma((i.hidden ? 1 : 0) | (i.encendido ? 2 : 0) | (i.red ? 4 : 0) | (i.wall ? 8 : 0) | (i.variante ? 16 : 0) | (i.surf ? 32 : 0));
    }
    for (const c of b.boxes) { suma(c.x); suma(c.y); suma(c.z); suma((c.open ? 1 : 0) | (c.empty ? 2 : 0)); }
    for (const a of b.actors) { suma(a.x * 4); suma(a.y * 4); suma(a.z * 4); suma(a.conCaja ? 1 : 0); }
    suma(b.actors.length);
    suma(b.cars.length);
    return h;
  }

  // ¿Sirven las capas para este fotograma? Si algo se mueve se pinta todo en vivo, como siempre:
  // esos instantes son cortos y no merece la pena hornear en cada uno.
  listas() {
    const b = this.b;
    if (b.cine || b.caminos.length || b.entrega) return false;
    for (const i of b.items) if (i.flash > 0 || i.asienta > 0 || i.anim || i.spin || (i.red && i.def.alfombra)) return false;
    const clave = `${this.firma()}|${this.escala}`;
    if (clave !== this.clave) { this.hornea(); this.clave = clave; }
    return true;
  }

  hornea() {
    const b = this.b, s = this.escala, { catalog } = b.g;
    this.horneos++;
    const w = Math.ceil(BOARD.w * s), h = Math.ceil(BOARD.h * s);
    const suelo = medir(this.suelo, w, h);
    suelo.setTransform(s, 0, 0, s, 0, 0);
    b.drawSuelo(suelo);
    const quietas = medir(this.quietas, w, h);
    quietas.setTransform(s, 0, 0, s, 0, 0);
    const piezas = this.piezas = b.piezas().map((e) => ({ e, r: recuadro(e, catalog) }));
    for (const { e } of piezas) if (!e.vivo && !e.luce) e.draw(quietas);
    // En cada zona se repinta lo que la pise, también lo quieto, y solo dentro de ella.
    const reparto = (hay) => {
      const zonas = piezas.filter(({ e }) => hay(e)).map(({ r }) => r);
      return { zonas, lista: piezas.filter(({ e, r }) => hay(e) || zonas.some((z) => cruzan(z, r))) };
    };
    this.mano = reparto((e) => e.vivo || e.luce);
    this.reposo = reparto((e) => e.vivo);
    // Una luz quieta suma sobre lo que tiene detrás: necesita el suelo debajo. Con alguna encendida,
    // el conjunto se hornea entero; el suelo y las piezas por separado siguen ahí para la mano.
    this.conLuces = piezas.some(({ e }) => e.luce);
    if (this.conLuces) {
      const g = medir(this.escena, w, h);
      g.setTransform(s, 0, 0, s, 0, 0);
      this.pintaSuelo(g);
      b.drawSobreSuelo(g);
      this.pintaPiezas(g, this.mano, null);
    }
  }

  pintaSuelo(ctx) { ctx.drawImage(this.suelo[0], 0, 0, BOARD.w, BOARD.h); }

  // Lo que se anima cambia dentro de su zona: se borra y se repinta todo lo de esa zona, en orden.
  pintaPiezas(ctx, reparto, vista = this.vista) {
    ctx.drawImage(this.quietas[0], 0, 0, BOARD.w, BOARD.h);
    this.repinta(ctx, reparto, vista);
  }

  // Lo que queda fuera de la cámara no se repinta. Sin `vista`, todo: al hornear.
  repinta(ctx, reparto, vista = this.vista) {
    const zonas = vista ? reparto.zonas.filter((z) => cruzan(vista, z)) : reparto.zonas;
    if (!zonas.length) return;
    ctx.save();
    ctx.beginPath();
    for (const z of zonas) ctx.rect(z.x, z.y, z.w, z.h);
    ctx.clip();
    for (const z of zonas) ctx.clearRect(z.x, z.y, z.w, z.h);
    this.pintaSuelo(ctx);
    this.b.drawSobreSuelo(ctx);
    for (const { e, r } of reparto.lista) if (!vista || zonas.some((z) => cruzan(z, r))) e.draw(ctx);
    ctx.restore();
  }

  // Lo que enseña la cámara, en coordenadas de tablero.
  get vista() {
    const { cam } = this.b;
    const o = cam.toBoard(cam.view.x, cam.view.y);
    return { x: o.x, y: o.y, w: cam.view.w / cam.zoom, h: cam.view.h / cam.zoom };
  }

  // El sótano entero. Con algo en la mano sus guías van entre el suelo y las piezas.
  pinta(ctx) {
    const { cam } = this.b;
    // De cerca se ve poco y a doble tamaño: pieza a pieza, cada una cae en su píxel exacto.
    if (cam.zoom > 1) {
      this.pintaSuelo(ctx);
      this.b.drawSobreSuelo(ctx);
      const v = this.vista;
      for (const { e, r } of this.piezas) if (cruzan(v, r)) e.draw(ctx);
      return;
    }
    if (!this.b.held && this.conLuces) {
      ctx.drawImage(this.escena[0], 0, 0, BOARD.w, BOARD.h);
      this.repinta(ctx, this.reposo);
      return;
    }
    this.pintaSuelo(ctx);
    this.b.drawSobreSuelo(ctx);
    this.pintaPiezas(ctx, this.b.held ? this.mano : this.reposo);
  }

  // El cartón: un relleno con patrón de todo el fondo, lo más caro con diferencia si se hace siempre.
  pintaCarton(ctx) {
    const { W, H } = this.b.g;
    const z = this.b.cam.zoom, s = this.escala;
    const ex = 2 * Math.ceil(Math.max(0, (W / z - BOARD.w) / 2 + MARGEN) / 2);
    const ey = 2 * Math.ceil(Math.max(0, (H / z - BOARD.h) / 2 + MARGEN) / 2);
    const w = BOARD.w + ex * 2, h = BOARD.h + ey * 2;
    const clave = `${viewIndex()}|${s}|${w}|${h}`;
    if (clave !== this.claveCarton) {
      const g = medir(this.carton, Math.ceil(w * s), Math.ceil(h * s));
      g.setTransform(s, 0, 0, s, ex * s, ey * s);
      g.globalCompositeOperation = 'destination-over';
      this.b.cartonPat = null;     // cada lienzo pide su propio patrón
      this.b.drawCarton(g);
      g.globalCompositeOperation = 'source-over';
      this.claveCarton = clave;
    }
    ctx.drawImage(this.carton[0], -ex, -ey, w, h);
  }
}
