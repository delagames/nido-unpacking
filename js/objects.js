// Objetos colocables: catálogo de data/objects.json, sprites y reglas de "fits".
import { makeCanvas, hits, inside, clamp, loadImage } from './gfx.js';
import { onFloor, onWall, wallVisible, spriteTopLeft, toScreen, viewIndex, enCaja } from './iso.js';

const STACK_H = 8;      // lo que mide esto o menos se puede apilar
const STACK_MAX = 3;    // pisos de una pila, contados en alturas de STACK_H
const CUBRE = 0.8;      // parte de la huella que debe quedar sobre lo de abajo para apilar
const NO_BASE = new Set(['mancuerna', 'palo_madera']);   // por su forma nada se aguanta encima
const BOCA_BAJO = 4;    // la boca de un hueco baja un poco: la base del objeto no se recorta
const NO_CABE = Symbol('no cabe');
const ARRIMA_SUELO = 28;

export class Catalog {
  constructor(data) {
    this.defs = new Map(data.objects.map((d) => [d.id, d]));
    this.groups = data.groups;
    this.images = new Map();
    this.masks = new Map();
    this.siluetas = new Map();
  }

  async load() {
    await Promise.all([...this.defs.values()].map(async (d) => {
      this.images.set(d.id, await loadImage(`assets/obj/${d.id}.png`));
      // Cuatro sprites reales, del mismo modelo 3D (tools/iso3d.py): nada de espejos.
      if (d.v4) for (let r = 0; r < 4; r++) this.images.set(`${d.id}_${r}`, await loadImage(`assets/obj/${d.id}_${r}.png`));
      if (d.v4 && d.lampara) for (let r = 0; r < 4; r++) this.images.set(`${d.id}_lampara_${r}`, await loadImage(`assets/obj/${d.id}_lampara_${r}.png`));
      if (d.back && !d.v4) this.images.set(`${d.id}_b`, await loadImage(`assets/obj/${d.id}_b.png`));
      if (d.pared) this.images.set(`${d.id}_pared`, await loadImage(`assets/obj/${d.id}_pared.png`));
      if (d.lampara) this.images.set(`${d.id}_lampara`, await loadImage(`assets/obj/${d.id}_lampara.png`));
      if (d.enciende?.capa) this.images.set(`${d.id}_on`, await loadImage(`assets/obj/${d.id}_on.png`));
    }));
  }

  // Devuelve superficies concretas (ids y "top:<tag>") de la lista fits de un objeto.
  tokens(def) {
    const out = [];
    for (const f of def.fits) out.push(...(this.groups[f] ?? [f]));
    return [...new Set(out)];
  }

  image(item) {
    const base = this.images.get(item.variante ? `${item.def.id}_${item.variante}` : item.def.id);
    if (item.def.v4 && item.variante === 'lampara') return this.images.get(`${item.def.id}_lampara_${item.rel}`);
    if (item.def.v4 && !item.variante && !(item.flat && item.wall)) return this.images.get(`${item.def.id}_${item.rel}`);
    return item.def.back && item.rel >= 2 && !item.variante ? this.images.get(`${item.def.id}_b`) : base;
  }

  // Silueta oscura de una lámina: su sombra sobre la pared, con la misma luz que el resto.
  silueta(img) {
    let s = this.siluetas.get(img);
    if (!s) {
      const [c, g] = makeCanvas(img.width, img.height);
      g.drawImage(img, 0, 0);
      g.globalCompositeOperation = 'source-in';
      g.fillStyle = '#2B2420';
      g.fillRect(0, 0, img.width, img.height);
      s = c;
      this.siluetas.set(img, s);
    }
    return s;
  }

  // Opacidad del sprite en (px, py), para no coger objetos por sus esquinas vacías.
  opaque(item, px, py) {
    const img = this.image(item);
    let m = this.masks.get(img);
    if (!m) {
      const [, g] = makeCanvas(img.width, img.height);
      g.drawImage(img, 0, 0);
      m = g.getImageData(0, 0, img.width, img.height).data;
      this.masks.set(img, m);
    }
    if (px < 0 || py < 0 || px >= img.width || py >= img.height) return false;
    return m[(Math.floor(py) * img.width + Math.floor(px)) * 4 + 3] > 0;
  }

  // Lo que se levanta en pantalla el dibujo sobre su base. Manda sobre `h`: es lo que se ve.
  alto(item) {
    return Math.ceil(this.image(item).height - (item.w + item.d) / 2);
  }
}

let nextUid = 1;

export class Item {
  constructor(def, extra = {}) {
    this.uid = extra.uid ?? nextUid++;
    nextUid = Math.max(nextUid, this.uid + 1);
    this.def = def;
    this.rot = extra.rot ?? def.rot0 ?? 0;   // hacia dónde mira: 0 sur, 1 oeste, 2 norte, 3 este
    this.tilt = extra.tilt ?? 0;
    this.x = extra.x ?? 0; this.y = extra.y ?? 0; this.z = extra.z ?? 0;
    this.surf = extra.surf ?? null;     // id de superficie, null si está suelto
    this.parent = extra.parent ?? null; // uid del mueble sobre el que está
    this.under = extra.under ?? null;   // uid del objeto sobre el que está apilado
    this.base = extra.base ?? 0;        // altura del plano sobre el que descansa
    this.wall = extra.wall ?? null;     // pared si está colgado
    this.u = extra.u ?? 0;
    this.onCar = false;
    this.red = false;
    this.flash = 0;
    this.anim = null;
    this.origin = extra.origin ?? null; // caja de la que salió
    this.encendido = !!extra.encendido;
  }

  get flat() { return !!this.def.flat; }
  get redonda() { return this.def.sombra === 'redonda'; }
  get w() { return this.rot % 2 ? this.def.d : this.def.w; }
  get d() { return this.flat ? 4 : (this.rot % 2 ? this.def.w : this.def.d); }
  // Orientación respecto a la cámara. En la bandeja `rot` ya es eso: girar la vista no la cambia.
  get rel() { return (this.rot + (this.enBandeja ? 0 : viewIndex())) % 4; }
  // Lo redondo se ve igual desde cualquier lado: voltearlo solo parecería que gira.
  get round() { const d = this.def; return d.turn === 'none' && !d.back && !d.flat && d.w === d.d; }
  // La secuencia es frente, costado, espalda, costado; `frente: izq` si el PNG no mira a abajo-derecha.
  get mirror() { return !this.def.v4 && !this.flat && !this.variante && !this.round && (this.rel % 2 === 1) !== (this.def.frente === 'izq'); }
  get h() { return this.def.h; }
  get placed() { return !!this.surf; }
  // Lo que se cuelga cambia de dibujo: tumbado en la mesa no es igual que de una percha.
  get variante() {
    if (this.wall && this.def.pared) return 'pared';
    return this.surf === 'top:lampara' && this.def.lampara ? 'lampara' : null;
  }
  // Medidas en la pared: sin `pared` en el catálogo, las de la lámina plana.
  get paredW() { return this.def.pared?.w ?? this.def.w; }
  get paredH() { return this.def.pared?.h ?? this.def.h; }
  // Punto del modelo (x, y de la planta en orientación 0, z desde la base) en pantalla.
  punto(x, y, z) {
    let [u, v] = [x - this.def.w / 2, y - this.def.d / 2];
    for (let k = 0; k < this.rot; k++) [u, v] = [-v, u];
    return toScreen(this.cx + u, this.cy + v, this.z + z);
  }
  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.d / 2; }

  // Colocado en un punto del mundo con su centro en (cx, cy).
  centerOn(cx, cy, z = this.z) {
    this.x = Math.round(cx - this.w / 2);
    this.y = Math.round(cy - this.d / 2);
    this.z = z;
  }

  foot() { return { x: this.x, y: this.y, w: this.w, h: this.d }; }

  wallPoint(u, z) {
    return this.wall.side === 'n' ? toScreen(u, this.wall.at, z) : toScreen(this.wall.at, u, z);
  }

  // Inclinación en pantalla de la pared en la que cuelga, de izquierda a derecha.
  get slope() {
    const a = this.wallPoint(0, 0), b = this.wallPoint(1, 0);
    return (b.y - a.y) / (b.x - a.x);
  }

  // Punto de la pared a la izquierda en pantalla, a la altura z. En las paredes cortadas por la
  // vista, u crece hacia la izquierda: el dibujo empieza por el otro extremo.
  esquinaPared(z) {
    const a = this.wallPoint(0, 0), b = this.wallPoint(1, 0);
    return this.wallPoint(b.x > a.x ? this.u : this.u + this.paredW, z);
  }

  // Serialización para el guardado.
  save() {
    const { uid, rot, tilt, surf, parent, under, base, wall, u, origin, encendido } = this;
    const { x, y, z } = this.anim?.to ?? this;
    return { id: this.def.id, uid, rot, tilt, x, y, z, surf, parent, under, base, wall, u, origin, encendido };
  }
}

// Dónde se apoyan cosas en un mueble: cada plano se mide sobre el dibujo con el mueble en
// orientación 0 (tools/calibrar_superficies.py) y gira con él alrededor de su centro.
// `techo` es la cara de abajo de la balda de encima: ese plano es un hueco, y lo que guarda
// solo se ve por su boca (el borde y0 = y1). `espalda`: de espaldas lo tapa el propio mueble.
// `tapa` es el contorno, en píxeles del dibujo trasero, de lo que se alza delante del plano.
function planosDe(o) {
  const { w, d } = o.def;
  const aMundo = (x, y) => {
    let [u, v] = [x - w / 2, y - d / 2];
    for (let k = 0; k < o.rot; k++) [u, v] = [-v, u];
    return { x: o.cx + u, y: o.cy + v };
  };
  return (o.def.offers?.superficies ?? []).map(({ z, x0, y0, x1, y1, techo, espalda, tapa, tapa3d, centrar }) => {
    const a = aMundo(x0, y0), b = aMundo(x1, y1);
    return {
      z: o.z + z,
      rect: { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) },
      techo: techo == null ? null : o.z + techo,
      espalda: !!espalda || techo != null,
      gira: o.rot,
      centrar: !!centrar,    // lo colgado va siempre en su sitio, aunque se suelte con margen
      boca: techo == null ? null : [{ ...aMundo(x0, y1), z: o.z + z - BOCA_BAJO }, { ...aMundo(x1, y1), z: o.z + z - BOCA_BAJO }, { ...aMundo(x1, y1), z: o.z + techo }, { ...aMundo(x0, y1), z: o.z + techo }],
      tapa: tapa ?? null,
      tapa3d: tapa3d ?? null,
    };
  });
}

// Por dónde se ve `it` dentro de su mueble (cuadrilátero en pantalla), o null si no hace falta.
export function bocaDe(it, mueble) {
  const p = mueble && planoDe(it, mueble);
  return p?.boca && mueble.rel < 2 ? p.boca.map((q) => toScreen(q.x, q.y, q.z)) : null;
}

// De espaldas al jugador: va detrás del mueble entero y solo asoma lo que sobresalga.
export function tapadoPorMueble(it, mueble) {
  return !!mueble && mueble.rel >= 2 && !!planoDe(it, mueble)?.espalda;
}

// Lo que se alza delante de `it` y hay que volver a pintar encima: contorno en pantalla.
export function tapaDe(it, mueble, catalog) {
  const p = mueble && planoDe(it, mueble);
  if (p?.tapa3d && mueble.rel >= 2) return siluetaCaja(mueble, p.tapa3d);
  if (!p?.tapa || mueble.rel < 2) return null;
  const img = catalog.image(mueble);
  const t = spriteTopLeft(mueble.x, mueble.y, mueble.z, mueble.w, mueble.d, img.height);
  return p.tapa.map(([x, y]) => ({ x: t.x + (mueble.mirror ? img.width - x : x), y: t.y + y }));
}

// Contorno en pantalla de una caja del modelo [x0, y0, z0, x1, y1, z1]: envolvente de sus esquinas.
function siluetaCaja(o, [x0, y0, z0, x1, y1, z1]) {
  const pts = [];
  for (const x of [x0, x1]) for (const y of [y0, y1]) for (const z of [z0, z1]) pts.push(o.punto(x, y, z));
  pts.sort((a, b) => a.x - b.x || a.y - b.y);
  const giro = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const media = (lista) => {
    const h = [];
    for (const p of lista) {
      while (h.length >= 2 && giro(h[h.length - 2], h[h.length - 1], p) <= 0) h.pop();
      h.push(p);
    }
    h.pop();
    return h;
  };
  return [...media(pts), ...media([...pts].reverse())];
}

// ¿Cae el punto en el polígono en pantalla?
function enPoligono(q, x, y) {
  let dentro = false;
  for (let i = 0, j = q.length - 1; i < q.length; j = i++) {
    if ((q[i].y > y) !== (q[j].y > y) && x < q[i].x + (q[j].x - q[i].x) * (y - q[i].y) / (q[j].y - q[i].y)) dentro = !dentro;
  }
  return dentro;
}

// ¿Entra en el hueco? Mejor fácil que exacto: la balda de encima puede comerle hasta el 40 %.
function entraEnHueco(item, s, catalog) {
  const alto = catalog.alto(item);
  return alto - (s.techo - s.z) <= alto * 0.4;
}

// En un hueco, todo va contra la boca: al fondo la balda de encima lo taparía casi entero.
export function alFrente(it, x, y, p) {
  const r = p.rect;
  if (p.gira === 0) return { x, y: r.y + r.h - it.d - 1 };
  if (p.gira === 1) return { x: r.x + 1, y };
  if (p.gira === 2) return { x, y: r.y + 1 };
  return { x: r.x + r.w - it.w - 1, y };
}

// El plano de `mueble` sobre el que descansa `it`.
export function planoDe(it, mueble) {
  const base = it.base ?? it.z;
  return planosDe(mueble).reduce((m, p) => (!m || Math.abs(p.z - base) < Math.abs(m.z - base) ? p : m), null);
}

// Las partidas guardadas con las alturas de antes: lo de encima baja a su plano actual.
export function reapoyar(items) {
  for (const it of items) {
    const mueble = it.parent != null && items.find((o) => o.uid === it.parent);
    const p = mueble && planoDe(it, mueble);
    if (!p) continue;
    if (p.z !== it.base) {
      it.z += p.z - (it.base ?? it.z);
      it.base = p.z;
      it.x = clamp(it.x, p.rect.x, p.rect.x + p.rect.w - it.w);
      it.y = clamp(it.y, p.rect.y, p.rect.y + p.rect.h - it.d);
    }
    if (p.boca) Object.assign(it, alFrente(it, it.x, it.y, p));
  }
}

function surfacesOffered(items, tag) {
  const out = [];
  for (const o of items) {
    if (!o.placed || o.def.offers?.tag !== tag) continue;
    for (const { z, rect, techo, boca, gira, centrar } of planosDe(o)) {
      out.push({ id: `top:${tag}`, kind: 'top', z, parent: o.uid, rect, techo, boca, gira, centrar });
    }
  }
  return out;
}

// Los muebles con sitio para `item` bajo el punto, el que queda más delante primero.
// Lo que manda es la silueta del mueble, no la planta: así vale lo mismo desde cualquier vista.
function mueblesBajo(sx, sy, others, candidates, catalog) {
  const out = [];
  for (const o of others) {
    const planos = candidates.filter((s) => s.parent === o.uid && !s.centrar);
    if (!planos.length || !enCaja(sx, sy, o.x - 3, o.y - 3, o.w + 6, o.d + 6, o.z, Math.max(o.h, catalog.alto(o)) + 3)) continue;
    out.push({ o, planos });
  }
  return out.sort((a, b) => toScreen(b.o.cx, b.o.cy).y - toScreen(a.o.cx, a.o.cy).y);
}

// A qué altura apunta el dedo: el centro del tramo del rayo de la cámara dentro de la caja del
// mueble, que no depende de la vista ni de lo largo que sea. Si entra por la tapa, es la tapa.
function alturaDedo(o, sx, sy, alto, tapa) {
  const caja = { x: o.x - 3, y: o.y - 3, w: o.w + 6, h: o.d + 6 };
  let entra = null, sale = 0;
  for (let z = alto; z >= 0; z--) {
    const f = onFloor(sx, sy, o.z + z);
    if (inside(caja, f.x, f.y)) { entra ??= z; sale = z; } else if (entra != null) break;
  }
  if (entra == null) return o.z;
  return o.z + (entra + o.z >= tapa ? entra : (entra + sale) / 2);
}

// Primero el plano a la altura del dedo y luego los demás, del más cercano al más lejano.
function porAltura({ o, planos }, sx, sy, catalog) {
  // Un mueble con cajones: los huecos solo se cogen por su boca abierta, donde se dibuja. Lo que se
  // suelta sobre un cajón cerrado o por la trasera va a la tapa, nunca dentro.
  if (o.def.offers?.macizo) {
    const huecos = planos.filter((s) => s.boca);
    const suyo = o.rel < 2 ? huecos.find((s) => enPoligono(s.boca.map((q) => toScreen(q.x, q.y, q.z)), sx, sy)) : null;
    if (suyo) return [suyo];
    return planos.filter((s) => !s.boca);
  }
  const dedo = alturaDedo(o, sx, sy, Math.max(o.h, catalog.alto(o)) + 3, Math.max(...planos.map((s) => s.z)));
  const techo = Math.max(...planos.filter((s) => s.z <= dedo + 6).map((s) => s.z), -Infinity);
  // Huecos a la misma altura, uno junto a otro: el que tenga el dedo encima.
  const juntos = planos.filter((s) => Math.abs(s.z - techo) <= 2);
  const enDedo = juntos.find((s) => { const f = onFloor(sx, sy, s.z); return inside(s.rect, f.x, f.y); });
  const suyo = enDedo ?? juntos[0] ?? planos[0];
  return [...planos].sort((a, b) => (a === suyo ? -1 : b === suyo ? 1 : Math.abs(a.z - dedo) - Math.abs(b.z - dedo)));
}

// ¿Cabe `item` en este plano, tal como viene o girado?
function cabeEn(item, s) {
  const { w, h } = s.rect;
  if (s.ciego) return false;
  return (item.w <= w && item.d <= h) || (item.def.turn === 'flip' && item.d <= w && item.w <= h);
}

// Dónde se pegaría `item` con el dedo en (sx, sy) de tablero. Devuelve el sitio o null.
// `opts.plano` lo deja en ese plano: girar un objeto colocado no lo cambia de sitio.
export function findFit(item, sx, sy, room, items, catalog, opts = {}) {
  const { others, candidates } = sitesFor(item, room, items, catalog, opts);
  if (opts.plano) {
    const { surf, parent, base } = opts.plano;
    for (const s of candidates) {
      if (s.id !== surf || (s.parent ?? null) !== (parent ?? null) || (s.z ?? 0) !== base) continue;
      const fit = plano(item, sx, sy, s, room, others, catalog, { ...opts, apuntado: true });
      if (fit && fit !== NO_CABE) return fit;
    }
    return null;
  }
  // Sobre un mueble: siempre el mismo plano y el mismo punto, se mire desde donde se mire.
  for (const m of mueblesBajo(sx, sy, others, candidates, catalog)) {
    const planos = porAltura(m, sx, sy, catalog).filter((s) => cabeEn(item, s));
    if (!planos.length) continue;
    for (const s of planos) {
      const fit = plano(item, sx, sy, s, room, others, catalog, { ...opts, apuntado: true });
      if (fit && fit !== NO_CABE) return fit;
    }
    opts.noCabe = true;   // lleno: seguir lo mandaría al suelo de detrás, donde no se vería
    return null;
  }
  // Apuntando a una estantería lo que no va en ella no se queda en el suelo de detrás: no se vería.
  const baldaDelante = () => !item.def.offers && others.some((o) => planosDe(o).some((q) => {
    const f = q.boca && onFloor(sx, sy, q.z);
    return f && inside(q.rect, f.x, f.y);
  }));
  for (const s of candidates) {
    if (s.parent != null && !s.centrar) continue;
    if (s.kind !== 'wall' && s.parent == null && !s.z && baldaDelante()) { opts.noCabe = true; return null; }
    const fit = s.kind === 'wall' ? fitWall(item, sx, sy, s, others) : plano(item, sx, sy, s, room, others, catalog, opts);
    if (fit === NO_CABE) { opts.noCabe = true; return null; }
    if (fit) return fit;
  }
  return null;
}

// Si en la mano no cabe tal como viene pero girado sí (un pack en una estantería girada), se gira.
function plano(item, sx, sy, s, room, others, catalog, { girar = false, apuntado = false } = {}) {
  const fit = fitPlane(item, sx, sy, s, room, others, catalog, apuntado);
  if (fit !== NO_CABE || !girar || s.ciego || item.def.turn !== 'flip') return fit;
  const rot = item.rot;
  item.rot = item.def.back ? (rot + 1) % 4 : rot ^ 1;
  const otro = fitPlane(item, sx, sy, s, room, others, catalog, apuntado);
  const giro = item.rot;
  item.rot = rot;
  return otro && otro !== NO_CABE ? { ...otro, rot: giro } : fit;
}

// Superficies en las que podría ir un objeto, de la más alta a la más baja.
export function sitesFor(item, room, items, catalog, { allowFree = true } = {}) {
  const others = items.filter((o) => o !== item && o.placed && !o.hidden && !descendsFrom(o, item, items));
  const candidates = [];
  for (const t of catalog.tokens(item.def)) {
    if (t.startsWith('top:')) candidates.push(...surfacesOffered(others, t.slice(4)));
    else if (!t.startsWith('caja:')) { const s = room.surface(t); if (s) candidates.push(s); }
  }
  for (const s of candidates) if (s.techo != null && !entraEnHueco(item, s, catalog)) s.ciego = true;
  const free = room.surfaces.filter((s) => s.free);
  if (allowFree && !item.def.strict) for (const s of free) if (!candidates.includes(s)) candidates.push(s);
  // Primero lo más alto: un Blu-ray sobre la mesa gana al suelo de debajo.
  // A igual altura gana el sitio libre: las cacharras están dentro del garaje.
  candidates.sort((a, b) => (b.z ?? 0) - (a.z ?? 0) || (b.free ? 1 : 0) - (a.free ? 1 : 0));
  return { others, candidates };
}

// ¿Va `o` encima de `item`, sobre él o apilado, a cualquier distancia?
function descendsFrom(o, item, items) {
  for (let p = o; p; ) {
    const up = p.under ?? p.parent;
    if (up == null) return false;
    if (up === item.uid) return true;
    p = items.find((i) => i.uid === up);
  }
  return false;
}

// Todo lo que lleva encima un objeto, a cualquier nivel.
export function carriedBy(item, items) {
  return items.filter((o) => o !== item && descendsFrom(o, item, items));
}

function fitWall(item, sx, sy, s, others) {
  if (!wallVisible(s.wall)) return null;
  const p = onWall(sx, sy, s.wall);
  const r = s.rect;   // x = u, y = z, w = largo, h = alto
  if (!inside(r, p.u, p.z)) return null;
  const w = item.paredW, h = item.paredH;
  if (w > r.w || h > r.h) return null;
  const u = clamp(Math.round(p.u - w / 2), r.x, r.x + r.w - w);
  const z = clamp(Math.round(p.z - h / 2), r.y, r.y + r.h - h);
  const box = { x: u, y: z, w, h };
  const taken = others.some((o) => o.surf === s.id && hits(box, { x: o.u, y: o.z, w: o.paredW, h: o.paredH }));
  return taken ? null : { surface: s, wall: s.wall, u, z };
}

// Se apila solo si la base cubre casi toda la huella y no es redonda: nada en equilibrio.
function aguanta(base, foot, item) {
  if (NO_BASE.has(base.def.id)) return false;
  if (base.redonda && base.def.id !== item.def.id) return false;
  if (base.redonda && base.h > 3) return false;     // platos sobre platos sí; bolitas sobre bolitas no
  const f = base.foot();
  const ancho = Math.min(foot.x + foot.w, f.x + f.w) - Math.max(foot.x, f.x);
  const fondo = Math.min(foot.y + foot.h, f.y + f.h) - Math.max(foot.y, f.y);
  return ancho > 0 && fondo > 0 && ancho * fondo >= CUBRE * foot.w * foot.h;
}

function fitPlane(item, sx, sy, s, room, others, catalog, apuntado = false) {
  const z0 = s.z ?? 0;
  const p = onFloor(sx, sy, z0);
  const r = s.rect;
  if (!apuntado && !inside(r, p.x, p.y)) return null;
  // Con el dedo sobre un mueble, si ahí no cabe, no vale: seguir buscando lo mandaría al
  // suelo de detrás del mueble, donde no se vería.
  const fallo = s.parent != null ? NO_CABE : null;
  if (s.ciego || item.w > r.w || item.d > r.h) return fallo;
  const alto = catalog.alto(item);
  const enHueco = (x, y) => (s.boca ? alFrente(item, x, y, s) : { x, y });
  let [xMin, xMax, yMin, yMax] = [r.x, r.x + r.w - item.w, r.y, r.y + r.h - item.d];
  if (s.boca) {
    // Contra un lateral, el objeto se metería detrás de él. Se deja el margen por los dos lados:
    // el sitio no puede depender de por dónde se mira. Si no da para tanto, va al centro.
    const porX = s.gira % 2 === 0;
    const sesgo = Math.min(porX ? item.d : item.w, Math.floor((porX ? xMax - xMin : yMax - yMin) / 2));
    if (porX) { xMin += sesgo; xMax -= sesgo; } else { yMin += sesgo; yMax -= sesgo; }
  }
  const sitio = (cx, cy) => {
    const q = enHueco(clamp(cx, xMin, xMax), clamp(cy, yMin, yMax));
    const foot = { ...q, w: item.w, h: item.d };
    // Una alfombra no ocupa: va debajo de las cajas y de quien esté encima.
    if (z0 === 0 && (item.def.alfombra ? room.solido(foot) : room.blocked(foot))) return null;
    let z = z0;
    let under = null;
    // Mismo plano: mismo mueble y misma balda. En el suelo cuentan todas las superficies,
    // porque se solapan: el arcón y las cacharras están dentro del garaje.
    // Una alfombra no ocupa: se pone debajo de lo que haya y lo demás se pone encima.
    const below = item.def.alfombra ? [] : others.filter((o) => (o.parent ?? null) === (s.parent ?? null) && o.base === z0
      && !o.wall && !o.def.alfombra && hits(foot, o.foot()));
    let base = null;
    for (const o of below) {
      if (item.h > STACK_H || o.h > STACK_H) return null;
      // La medida del dibujo sobra un par de píxeles por redondeo: apilado se notaría el hueco.
      const alzado = catalog.alto(o);
      const arriba = o.z + (alzado - o.h <= 2 ? o.h : alzado);
      if (arriba > z) { z = arriba; under = o.uid; base = o; }
    }
    if (base && !aguanta(base, foot, item)) return null;
    // En un hueco se apila mientras quepa; lo primero que entra siempre vale.
    if (z > z0 + STACK_H * STACK_MAX || (s.techo != null && z > z0 && z + alto > s.techo)) return null;
    return { surface: s, x: q.x, y: q.y, z, under, base: z0 };
  };
  const cx = Math.round(s.centrar ? r.x + (r.w - item.w) / 2 : p.x - item.w / 2);
  const cy = Math.round(s.centrar ? r.y + (r.h - item.d) / 2 : p.y - item.d / 2);
  const fit = sitio(cx, cy);
  if (fit) return fit;
  // Ocupado: se arrima al hueco libre más cercano del mismo plano. En el suelo, solo lo pequeño
  // y muy cerca: lo grande se suelta donde uno quiere, y junto a un muro no hay que hacer nada.
  const pequeno = item.h <= STACK_H && !room.blocked({ x: cx, y: cy, w: item.w, h: item.d });
  const radio = s.parent != null ? Math.max(r.w, r.h) : pequeno ? ARRIMA_SUELO : 0;
  for (let k = 1; k <= radio; k++) {
    for (const [dx, dy] of [[k, 0], [-k, 0], [0, k], [0, -k]]) {
      const hueco = sitio(cx + dx, cy + dy);
      if (hueco) return hueco;
    }
  }
  return fallo;
}

// ---- Sonidos sintetizados: colocar, cartón y cinta -------------------------

let audio = null;

function ctx() {
  audio ??= new (window.AudioContext || window.webkitAudioContext)();
  audio.resume();
  return audio;
}

function tone(type, from, to, secs, gain) {
  const a = ctx(), o = a.createOscillator(), v = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(from, a.currentTime);
  o.frequency.exponentialRampToValueAtTime(to, a.currentTime + secs * 0.7);
  v.gain.setValueAtTime(gain, a.currentTime);
  v.gain.exponentialRampToValueAtTime(0.001, a.currentTime + secs);
  o.connect(v).connect(a.destination);
  o.start();
  o.stop(a.currentTime + secs + 0.01);
}

function noise(secs, gain, lowpass) {
  const a = ctx();
  const buf = a.createBuffer(1, Math.floor(a.sampleRate * secs), a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const s = a.createBufferSource(), f = a.createBiquadFilter(), v = a.createGain();
  s.buffer = buf;
  f.type = 'lowpass';
  f.frequency.value = lowpass;
  v.gain.value = gain;
  s.connect(f).connect(v).connect(a.destination);
  s.start();
}

export const sfx = {
  click() { try { tone('square', 1500, 420, 0.06, 0.12); navigator.vibrate?.(12); } catch { /* sin audio */ } },
  thud() { try { tone('sine', 180, 70, 0.14, 0.25); } catch { /* sin audio */ } },
  carton() { try { noise(0.16, 0.22, 900); } catch { /* sin audio */ } },
  cinta() { try { noise(0.32, 0.14, 3200); } catch { /* sin audio */ } },
  papel() { try { noise(0.1, 0.12, 2200); } catch { /* sin audio */ } },
};
