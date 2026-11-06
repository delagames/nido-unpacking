// Un capítulo en el sótano: cajas, colocar, notas, Listo y final.
import { makeCanvas, PAL, UI, FONT, drawText, drawOutlined, inside, clamp, hits, wrap } from './gfx.js';
import { Camera } from './camera.js';
import { Room } from './room.js';
import { Item, findFit, sitesFor, carriedBy, planoDe, reapoyar, bocaDe, tapaDe, tapadoPorMueble, alFrente, sfx } from './objects.js';
import { Box, BOX } from './boxes.js';
import { Actor, facingRow } from './characters.js';
import { BOARD, toScreen, onFloor, spriteTopLeft, sortDepth, setView, viewIndex, wallVisible } from './iso.js';
import { Note, Notebook, Reading, Dialogo, paginasDe } from './notes.js';
import { store } from './save.js';
import { Tutorial } from './tutorial.js';
import { Ayuda } from './ayuda.js';
import { voz } from './voz.js';
import { Sombras, sombraEncima, fillQuad } from './sombras.js';
import { Capas } from './capas.js';
import { musica } from './musica.js';
import { Trama } from './transicion.js';
import { guardarFoto } from './foto.js';
import { luzEnSuelo, luzEnObjeto } from './luces.js';

const BAND_TOP = 32;
const BAND_BOTTOM = 64;
const LIFT = 60;          // el punto de caída va por encima del dedo para que se vea
const EDGE = 44;          // margen de la ventana que empuja la cámara al arrastrar
const EDGE_SPEED = 0.4;   // px de tablero por ms
const FLASH_MS = 90;
const BLINK_MS = 250;     // 2 Hz
const ZOOMS = [0.5, 1, 2];
const HOVER = 26;         // altura en pantalla a la que flota el objeto sobre su destino
const MARK_OK = '#7CF08A';
const TRAY_H = 76;
const TRAY_SLOT = 72;
const TRAY_ARRIVE = 240;
const TABS_H = 48;        // pestañas de la caja de guardados
const CATS = [['todo', 'Todo'], ['muebles', 'Muebles'], ['pared', 'Pared'], ['frikadas', 'Frikadas'], ['plantas', 'Plantas'], ['comida', 'Comida'], ['trastos', 'Trastos']];
const catDe = (it) => it.def.cat ?? 'trastos';
const ASIENTA = 190;      // lo recién colocado se asienta un instante
const OBJETO_GRANDE = 90; // ancho + fondo a partir de los que un mueble suena al apoyarlo
const MANOLO_VEL = 0.2;         // unidades de mundo por ms, cuando cruza con la nota
const NOTA_OFRECE = 900;
const NOTA_PASA = 420;
const JUANJO_DENTRO = 9000;     // se queda entre esto y el doble
const JUANJO_FUERA = 14000;     // no se le ve entre esto y el doble
const JUANJO_PARPADEO = 420;
const ESPERA_TOQUE = 340; // un toque que enciende espera por si es doble toque, que gira

const floorQuad = (x, y, w, d, z) => [toScreen(x, y, z), toScreen(x + w, y, z), toScreen(x + w, y + d, z), toScreen(x, y + d, z)];
const enQuad = (q, x, y) => {
  const lados = q.map((a, i) => { const b = q[(i + 1) % q.length]; return (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x); });
  return lados.every((l) => l >= 0) || lados.every((l) => l <= 0);
};
const quadCenter = (q) => ({ x: q.reduce((s, p) => s + p.x, 0) / q.length, y: q.reduce((s, p) => s + p.y, 0) / q.length });
const LUZ = { sol: null, nublado: ['#5A6C8C', 0.14], atardecer: ['#E0803C', 0.13], noche: ['#1E2750', 0.4] };
const ESCALERA = { x: 815, y: 496 };   // donde acaba la escalera: por ahí baja quien baja
// Altura de cada peldaño (tools/render_tablero.py): cinco de 19 de alto y 8 de huella desde x = 836.
const alturaEscalera = (x) => (x < 836 ? 0 : Math.min(95, 19 * (Math.floor((x - 836) / 8) + 1)));
const PUERTA = { x: 668, fuera: 268, dentro: 224 };   // la del cuartillo, para que salga el Alberto

export class Basement {
  constructor(game, chapter) {
    const g = this.g = game;
    this.ch = chapter;
    this.room = new Room(g.data.room, chapter.n);
    this.cerrado = chapter.n >= g.data.room.cierre;   // el Alberto se ha encerrado en el cuartillo
    setView(0);
    this.cam = new Camera(BOARD.w, BOARD.h);
    this.sombras = new Sombras(this.room, BOARD.w, BOARD.h);
    this.capas = new Capas(this);
    this.room.cuerpos = () => this.cuerpos();
    this.trama = new Trama();
    this.items = [];
    this.tray = [];           // lo sacado de las cajas y aún sin colocar
    this.guardados = [];      // fuera del sótano, sin perderse: dura toda la partida
    this.abrirGuardados = !!chapter.libre;  // en el modo libre todo sale de la caja
    this.catCaja = 'todo';
    this.tabScroll = 0;
    this.tabDrag = false;
    this.trayScroll = 0;
    this.trayDrag = null;
    this.held = null;
    this.heldFit = null;
    this.pointer = null;
    this.panning = false;
    this.time = 0;
    this.banner = { name: null, t: 0 };
    this.speech = null;
    this.rafiNote = null;
    this.mode = chapter.libre ? 'libre' : chapter.recoger ? 'recoger' : 'normal';
    this.recoger = chapter.recoger ? new Set(chapter.recoger) : null;
    // Si el capítulo se dejó a medias, se sigue donde estaba.
    this.resume = g.state.progreso?.n === chapter.n ? g.state.progreso : null;
    if (this.resume?.recoger) this.recoger = new Set(this.resume.recoger);
    // Algunos capítulos siguen tras Listo: la fase 2 es recoger lo de `recogida`.
    this.fase = this.resume?.fase ?? 1;
    const recogida = this.fase === 2 ? chapter.recogida : null;
    if (recogida) this.mode = 'recoger';
    this.luz = recogida?.luz ?? chapter.luz;
    this.puertaAbierta = !!recogida?.puerta;
    this.quieto = false;      // algo está pasando: no se toca nada hasta que acabe
    this.caminos = [];        // quien anda solo por el sótano
    this.cola = [];           // lo que se dirá cuando se acabe lo que se está diciendo
    this.visitas = [];
    this.actors = [];

    this.restoreItems();
    this.buildBoxes();
    this.buildCars();
    this.colocaCajas();
    this.buildActors();
    this.escondeJuanjo();
    this.vecesManolo = 0;
    this.placeSueltos();

    this.resize();
    const c = toScreen(730, 430);
    this.cam.centerOn(c.x, c.y);
    this.zone = this.currentZone();
    if (chapter.n === 1 && !g.state.flags.tutorial) this.tutorial = new Tutorial(this);
    else if (chapter.manoloDice && !this.resume) this.say('manolo', chapter.manoloDice);
    // El encargo se queda en el cuaderno, y como primera entrada del capítulo.
    if (chapter.encargo && !this.resume) this.apuntaNota({ de: 'buitre', t: chapter.encargo });
    if (chapter.rafi && !this.resume?.rafiLeida) {
      const t = chapter.rafiSiSagas && g.state.flags.sagas ? `${chapter.rafi} ${chapter.rafiSiSagas}` : chapter.rafi;
      this.rafiNote = { de: 'rafi', t };
    }
    if (chapter.mariaDice) this.speech = { who: 'maria', p: 'Determined', nombre: 'María', t: chapter.mariaDice, left: 9000 };
    // La primera vez que vuelve algo guardado, se dice dónde está.
    else if (!this.speech && this.mode === 'normal' && this.guardados.length && !g.state.flags.cajaVista) {
      g.state.flags.cajaVista = true;
      this.speech = { who: 'maria', p: 'Normal', nombre: 'Guardados', t: 'Lo que no coloqué sigue en la CAJA, en el botón de abajo.', left: 6000 };
    }
    this.entraVisita();
  }

  get parado() { return !!this.entrega || this.quieto; }

  // Guarda la partida tal como está, para poder seguir aunque el móvil cierre el juego.
  persist() {
    const { state } = this.g;
    const held = this.held;
    const items = this.items.filter((i) => !i.fromTray).map((i) => {
      const s = i.save();
      if (i === held && i.prev) Object.assign(s, { x: i.prev.x, y: i.prev.y, z: i.prev.z, surf: i.prev.surf, parent: i.prev.parent, under: i.prev.under, base: i.prev.base, wall: i.prev.wall, u: i.prev.u });
      return s;
    });
    this.saveGuardados();
    if (this.mode === 'libre') {
      state.libreItems = items;
    } else {
      state.progreso = {
        n: this.ch.n, fase: this.fase, items, rafiLeida: !this.rafiNote && !!this.ch.rafi,
        recoger: this.recoger ? [...this.recoger] : null, enCacharras: [...this.enCacharras],
        visitaEnCamino: !!this.visitaEnCamino,
        tray: [...this.tray.map((i) => i.save()), ...(held?.fromTray && !held.fromGuardado ? [this.saveEnMano(held)] : [])],
        boxes: this.boxes.map((b) => ({ id: b.id, at: [b.x, b.y, b.z], items: b.items, note: b.note, label: b.label, open: b.open, keep: b.keep, sentado: b.sentado })),
      };
    }
    store(state);
  }

  saveGuardados() {
    const held = this.held?.fromGuardado ? [this.saveEnMano(this.held)] : [];
    this.g.state.guardados = [...this.guardados.map((i) => i.save()), ...held];
  }

  // En la bandeja, `rot` es la orientación ante la cámara; en la mano, la del mundo.
  saveEnMano(it) { return { ...it.save(), rot: (it.rot + viewIndex()) % 4 }; }

  restoreItems() {
    const { g, ch } = this;
    for (const s of g.state.guardados ?? []) {
      const def = g.catalog.defs.get(s.id);
      if (def) this.guardados.push(Object.assign(new Item(def, s), { enBandeja: true }));
    }
    const saved = this.resume?.items ?? (ch.libre ? (g.state.libreItems ?? g.state.antesDelFinal ?? g.state.items) : g.state.items);
    for (const s of saved) {
      const def = g.catalog.defs.get(s.id);
      if (!def) continue;
      const it = new Item(def, s);
      it.hidden = it.surf === 'caja';
      this.items.push(it);
    }
    reapoyar(this.items);
    for (const s of this.resume?.tray ?? []) {
      const def = g.catalog.defs.get(s.id);
      if (def) this.tray.push(Object.assign(new Item(def, s), { enBandeja: true }));
    }
    this.fromCuartillo = [];
    // Lo que ya estaba en las cacharras al empezar no cuenta como «sin sitio» este capítulo.
    this.enCacharras = new Set(this.resume?.enCacharras ?? this.items.filter((i) => i.surf === 'cacharras').map((i) => i.uid));
    if (this.resume) return;
    // Las rosas secas son las azules de entonces: no pueden estar las dos a la vez.
    if (g.state.flags.rosasGuardadas && ch.boxes?.some((b) => b.items.some((e) => e.id === 'rosas_secas'))) {
      this.items = this.items.filter((i) => i.def.id !== 'rosas_azules');
      this.guardados = this.guardados.filter((i) => i.def.id !== 'rosas_azules');
    }
    if (ch.vaciaCuartillo) {
      const gone = new Set();
      for (const it of this.items) if (it.surf?.startsWith('cuartillo')) gone.add(it.uid);
      for (const it of this.items) if (gone.has(it.parent) || gone.has(it.under)) gone.add(it.uid);
      for (const it of this.items) if (gone.has(it.uid)) this.fromCuartillo.push({ id: it.def.id });
      this.items = this.items.filter((i) => !gone.has(i.uid));
    }
  }

  // Lo que espera suelto al llegar. Nunca sobre algo ya colocado: se busca el hueco más cercano.
  placeSueltos() {
    const { g, ch } = this;
    if (!this.resume) {
      for (const s of ch.sueltos ?? []) {
        if (this.items.some((i) => i.def.id === s.id)) continue;
        const it = new Item(g.catalog.defs.get(s.id), { x: s.x, y: s.y });
        const { x, y } = this.freeNear(it, it.cx, it.cy);
        Object.assign(it, { x, y });
        this.items.push(it);
      }
    }
    // Lo de María que siga en la caja de guardados sale a recogerse: el final lo necesita.
    if (this.recoger && !this.resume) {
      for (const id of this.recoger) {
        const k = this.guardados.findIndex((i) => i.def.id === id);
        if (k < 0 || this.items.some((i) => i.def.id === id)) continue;
        const [it] = this.guardados.splice(k, 1);
        Object.assign(it, { enBandeja: false, surf: null, parent: null, under: null, wall: null, base: 0, z: 0 });
        const { x, y } = this.freeNear(it, 520, 330);   // en la sala, a la vista y lejos de María
        Object.assign(it, { x, y });
        this.items.push(it);
      }
    }
    // Lo que no esté en el sótano no puede exigirse: el capítulo debe poder acabar.
    if (this.recoger) this.recoger = new Set([...this.recoger].filter((id) => this.items.some((i) => i.def.id === id)));
  }

  // `solo`: no cuenta a los personajes, que aún no están en su sitio.
  freeNear(it, cx, cy, solo = false) {
    const busy = this.items.filter((i) => !i.wall && !i.hidden && !i.def.alfombra).map((i) => i.foot());
    const foot = (x, y) => ({ x: Math.round(x - it.w / 2), y: Math.round(y - it.d / 2), w: it.w, h: it.d });
    const suelos = this.room.floors().filter((s) => !this.cerrado || !s.id.startsWith('cuartillo'));
    const dentro = (f) => suelos.some((s) => f.x >= s.rect.x && f.y >= s.rect.y && f.x + f.w <= s.rect.x + s.rect.w && f.y + f.h <= s.rect.y + s.rect.h);
    for (let r = 0; r < 300; r += 8) {
      for (let k = 0; k < (r ? 16 : 1); k++) {
        const a = k * Math.PI / 8;
        const f = foot(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
        if (dentro(f) && (solo ? !this.room.solido(f) : !this.room.blocked(f)) && !busy.some((o) => hits(f, o))) return f;
      }
    }
    return foot(cx, cy);
  }

  // Lo que ocupa suelo sin ser un mueble. Encima de esto no se coloca: sale en rojo.
  // Juanjo no cuenta cuando va y viene: si le ponen algo encima, se marcha.
  cuerpos() {
    const out = this.boxes?.map((b) => ({ x: b.x, y: b.y, w: b.w, h: b.d })) ?? [];
    for (const a of this.actors) if (a !== this.juanjo) out.push({ x: a.x - 8, y: a.y - 8, w: 32, h: 32 });
    return out;
  }

  // Nada sale dentro de lo que ya esté colocado, y lo colocado no se mueve: si su sitio está ocupado,
  // la pila se muda entera al hueco más cercano. Si no cabe entera, caja a caja.
  colocaCajas() {
    const planta = (b) => ({ x: b.x, y: b.y, w: b.w, h: b.d });
    const pisa = (r) => this.items.some((i) => !i.wall && !i.hidden && !i.def.alfombra && hits(r, i.foot()));
    const pegadas = (a, b) => hits({ x: a.x - 2, y: a.y - 2, w: a.w + 4, h: a.h + 4 }, b);
    const quedan = [...this.boxes];
    while (quedan.length) {
      const pila = [quedan.pop()];
      for (let i = 0; i < pila.length; i++) {
        for (const o of [...quedan]) {
          if (pegadas(planta(pila[i]), planta(o))) { pila.push(o); quedan.splice(quedan.indexOf(o), 1); }
        }
      }
      if (!pila.some((b) => pisa(planta(b)))) continue;
      const x0 = Math.min(...pila.map((b) => b.x)), y0 = Math.min(...pila.map((b) => b.y));
      const w = Math.max(...pila.map((b) => b.x + b.w)) - x0, d = Math.max(...pila.map((b) => b.y + b.d)) - y0;
      const fuera = (b) => !pila.includes(b);
      const antes = this.boxes;
      this.boxes = antes.filter(fuera);       // la pila no se estorba a sí misma
      const f = this.freeNear({ w, d }, x0 + w / 2, y0 + d / 2, true);
      const hueco = !pisa(f) && !this.room.blocked(f);
      this.boxes = antes;
      if (hueco) {
        for (const b of pila) { b.x += f.x - x0; b.y += f.y - y0; }
        continue;
      }
      for (const b of pila) {
        const g = this.freeNear(b, b.x + b.w / 2, b.y + b.d / 2, true);
        Object.assign(b, { x: g.x, y: g.y, z: 0 });
      }
    }
  }

  buildBoxes() {
    const { g, ch } = this;
    if (this.resume) {
      this.boxes = this.resume.boxes.map((b) => Object.assign(new Box(b), { keep: b.keep, sentado: b.sentado }));
      return;
    }
    if (ch.libre) this.llenaCajaLibre();
    const raw = (ch.boxes ?? []).map((b) => ({ ...b }));
    if (this.fromCuartillo.length) raw.unshift({ id: 'cuartillo', items: this.fromCuartillo });
    const flat = (list) => list.flatMap((e) => {
      if (e.si && !g.state.flags[e.si] && !ch.libre) return [];
      return Array.from({ length: e.n ?? 1 }, () => ({ id: e.id }));
    });
    const { base, encima } = g.data.room.pila;
    const enPila = raw.filter((b) => !b.at);
    const pisoAlto = Math.max(0, enPila.length - base.length);
    // Las primeras cajas van arriba: son las que se abren antes.
    const sitio = (b) => {
      if (b.at) return b.at;
      const i = enPila.indexOf(b);
      return i < pisoAlto ? [...encima[i % encima.length], BOX.h] : base[(i - pisoAlto) % base.length];
    };
    this.boxes = raw.map((b, i) => {
      let note = b.note ?? null;
      if (b.items.some((e) => e.id === 'rosas_secas') && ch.notaSiRosasCacharras && !g.state.flags.rosasGuardadas) {
        note = { de: 'buitre', t: ch.notaSiRosasCacharras };
      }
      const box = new Box({ ...b, id: b.id ?? `c${i}`, at: sitio(b), items: flat(b.items), note });
      box.keep = !!b.keep;
      box.sentado = !!b.sentado;
      return box;
    });
  }

  // Modo libre: lo que trajeron los capítulos y no esté ya en el sótano, en la caja de guardados.
  // Las bolitas no vuelven: el chiste es del capítulo 1.
  llenaCajaLibre() {
    const { g } = this;
    const fuera = new Map();
    for (const i of [...this.items, ...this.guardados]) fuera.set(i.def.id, (fuera.get(i.def.id) ?? 0) + 1);
    for (const c of g.data.chapters.chapters) {
      for (const b of c.boxes) {
        for (const e of b.items) {
          if (e.id === 'bolita') continue;
          for (let k = 0; k < (e.n ?? 1); k++) {
            const quedan = fuera.get(e.id) ?? 0;
            if (quedan > 0) fuera.set(e.id, quedan - 1);
            else this.guardados.push(Object.assign(new Item(g.catalog.defs.get(e.id), {}), { enBandeja: true }));
          }
        }
      }
    }
  }

  buildCars() {
    const { g, ch } = this;
    const r = g.data.room;
    this.cars = [];
    const add = (kind, c, rot) => {
      const imgs = [0, 1, 2, 3].map((r) => g.images[`coche_${kind}_${r}`]);
      this.cars.push({ imgs, x: c.pos[0], y: c.pos[1], z: 0, w: c.w, d: c.d, h: c.h, rot });
      this.room.addObstacle('coche', { x: c.pos[0], y: c.pos[1], w: c.w, h: c.d });
    };
    if (ch.car) add(ch.car, r.car, 0);
    if (ch.carRampa) add(ch.carRampa, r.carRampa, 3);
  }

  buildActors() {
    const { g, ch } = this;
    const [mx, my] = g.data.room.maria;
    const sitio = this.plaza(mx, my);
    this.maria = new Actor(g.maria, sitio.x, sitio.y, 0, 1);
    this.actors = [this.maria];
    const m = this.fase === 2 ? ch.recogida.manolo ?? ch.manolo : ch.manolo;
    if (m) {
      const { x, y } = this.plaza(m.x, m.y);
      this.manolo = new Actor(g.pokemon['0067'], x, y, m.row);
      this.actors.push(this.manolo);
    }
    // El Alberto se queda con el cuartillo: se le ve dentro, delante de su ordenador.
    if (this.cerrado && !ch.libre) {
      const a = g.data.room.alberto;
      this.alberto = new Actor(g.pokemon['0629'], a.x, a.y, a.row);
      this.actors.push(this.alberto);
      if (this.puertaAbierta) { Object.assign(this.alberto, { x: PUERTA.x, y: PUERTA.fuera, row: 0 }); this.albertoHabla(); }
    }
    // Los que bajan de visita: solo en la primera parte del capítulo.
    if (this.fase === 1) {
      for (const v of ch.visitas ?? []) {
        const sitio = this.plaza(v.x, v.y);
        const a = new Actor(g.pokemon[v.id], sitio.x, sitio.y, v.row);
        a.visita = v;
        a.sitio = sitio;
        this.visitas.push(a);
        this.actors.push(a);
      }
    }
    // Juanjo se sienta en la caja de la tele y no se mueve hasta que no queda otra por abrir.
    const asiento = this.boxes.find((b) => b.sentado);
    if (ch.juanjo && asiento) {
      this.juanjo = new Actor(g.pokemon['0080'], asiento.x + 12, asiento.y + 12, ch.juanjo.row);
      this.juanjo.z = asiento.h;
      this.actors.push(this.juanjo);
      this.room.addObstacle('juanjo', { x: asiento.x, y: asiento.y, w: asiento.w, h: asiento.d });
    }
  }

  resize() {
    const { W, H } = this.g;
    if (this.cine) this.cam.setView(0, 0, W, H);
    else this.cam.setView(0, BAND_TOP, W, H - BAND_TOP - BAND_BOTTOM - this.trayH);
    const y = H - 56, h = 48;
    // Con la pantalla estrecha se aprietan para dejarle sitio a Listo.
    const [cu, ay, gi, gu, mu, gap] = W < 340 ? [48, 48, 52, 48, 48, 2] : W < 440 ? [48, 48, 56, 52, 48, 4] : [56, 48, 80, 72, 64, 8];
    const fin = 8 + cu + ay + gi + gu + mu + gap * 5;
    const listo = Math.min(148, W - fin - 8);
    this.buttons = {
      cuaderno: { x: 8, y, w: cu, h },
      ayuda: { x: 8 + cu + gap, y, w: ay, h },
      girar: { x: 8 + cu + ay + gap * 2, y, w: gi, h },
      guardados: { x: 8 + cu + ay + gi + gap * 3, y, w: gu, h },
      musica: { x: 8 + cu + ay + gi + gu + gap * 4, y, w: mu, h },
      listo: { x: W - 8 - listo, y, w: listo, h },
    };
  }

  // En la banda de abajo, con los demás botones: ahí no tapa nada del sótano.
  sitioMusica() { return this.buttons.musica; }

  currentZone() {
    const c = this.cam.center();
    return this.room.zoneAt(...Object.values(onFloor(c.x, c.y)));
  }

  // Juanjo va y viene. Nunca está donde haya algo ni se queda si le ponen algo encima.
  escondeJuanjo() {
    if (this.ch.juanjoEscondido && !this.juanjo) this.relojJuanjo = 3000 + Math.random() * 7000;
  }

  ocupadoJuanjo(f) {
    return this.items.some((i) => !i.wall && !i.hidden && !i.def.alfombra && i !== this.held && hits(f, i.foot()))
      || this.boxes.some((b) => hits(f, { x: b.x, y: b.y, w: b.w, h: b.d }))
      || this.actors.some((a) => a !== this.juanjo && hits(f, { x: a.x - 8, y: a.y - 8, w: 32, h: 32 }));
  }

  // Un hueco del suelo a la vista, si lo hay; si no, cualquier otro.
  sitioJuanjo() {
    const suelos = this.room.floors().filter((s) => /^(sala|garaje)_suelo$/.test(s.id)).map((s) => s.rect);
    const huecos = [];
    const prueba = (x, y) => {
      const f = { x: x - 8, y: y - 8, w: 32, h: 32 };
      if (!this.room.blocked(f) && !this.ocupadoJuanjo(f) && suelos.some((r) => inside(r, f.x, f.y) && inside(r, f.x + f.w, f.y + f.h))) huecos.push({ x, y });
    };
    if (!this.juanjoVisto) prueba(this.ch.juanjoEscondido[0], this.ch.juanjoEscondido[1]);
    for (let n = 0; n < 60; n++) {
      const r = suelos[n % suelos.length];
      prueba(Math.round(r.x + Math.random() * r.w), Math.round(r.y + Math.random() * r.h));
    }
    const { view: v, zoom } = this.cam;
    const o = this.cam.toBoard(v.x, v.y);
    const marco = { x: o.x, y: o.y + 40 / zoom, w: v.w / zoom, h: v.h / zoom - 40 / zoom };
    const aLaVista = (q) => { const s = toScreen(q.x, q.y); return inside(marco, s.x, s.y); };
    return huecos.find(aLaVista) ?? huecos[0] ?? null;
  }

  sigueJuanjo(dt) {
    if (this.relojJuanjo == null) return;
    const j = this.juanjo;
    if (j?.parpadea > 0) {
      j.parpadea -= dt;
      if (j.parpadea <= 0 && this.juanjoSale) {
        this.actors = this.actors.filter((a) => a !== j);
        this.juanjo = null;
        this.juanjoSale = false;
        this.relojJuanjo = JUANJO_FUERA + Math.random() * JUANJO_FUERA;
      }
      return;
    }
    const estorba = j && !this.held && this.ocupadoJuanjo({ x: j.x - 8, y: j.y - 8, w: 32, h: 32 });
    if (!estorba && (this.relojJuanjo -= dt) > 0) return;
    if (j) {
      if (!estorba && this.speech?.who === 'juanjo') { this.relojJuanjo = 800; return; }
      j.parpadea = JUANJO_PARPADEO;
      this.juanjoSale = true;
      return;
    }
    const sitio = !this.held && !this.parado && this.sitioJuanjo();
    if (!sitio) { this.relojJuanjo = 2000; return; }
    this.juanjoVisto = true;
    this.juanjo = new Actor(this.g.pokemon['0080'], sitio.x, sitio.y, Math.floor(Math.random() * 8));
    this.juanjo.parpadea = JUANJO_PARPADEO;
    this.actors.push(this.juanjo);
    this.relojJuanjo = JUANJO_DENTRO + Math.random() * JUANJO_DENTRO;
  }

  say(who, t, nombre) { this.speech = { who, t, nombre, left: 6000 }; }

  // Lo que entra en el bocadillo suena y se queda lo que dure la voz. Con una carta abierta, manda la carta.
  get speech() { return this.dicho; }

  set speech(s) {
    const antes = this.dicho;
    this.dicho = s;
    if (s?.t && !this.g.overlay) this.suena(s);
    else if (antes?.t) voz.callar(antes.t);
  }

  suena(s) { voz.decir(s.who, s.t, (ms) => { s.left = Math.max(s.left, ms); }); }

  // Un bocadillo tapado por una nota no se ha oído: suena al cerrarla.
  bocadilloTapado() {
    const s = this.dicho;
    if (!s?.t) return;
    if (this.g.overlay) s.tapado = true;
    else if (s.tapado) { s.tapado = false; this.suena(s); }
  }

  // Nadie se planta dentro de un mueble: si su sitio está ocupado, al hueco más cercano.
  plaza(x, y) {
    if (!this.ocupadoJuanjo({ x: x - 8, y: y - 8, w: 32, h: 32 })) return { x, y };
    const f = this.freeNear({ w: 32, d: 32 }, x + 8, y + 8);
    return { x: f.x + 8, y: f.y + 8 };
  }

  get pending() {
    if (!this.recoger) return this.boxes.filter((b) => !b.keep).length;
    return this.ch.recogida ? this.items.filter((i) => this.recoger.has(i.def.id)).length : this.recoger.size;
  }
  // Listo vale siempre: lo que quede se guarda solo tras preguntar. Recoger acaba con la caja de María.
  get canFinish() { return !this.held && this.mode !== 'recoger'; }

  // Lo que aún no tiene sitio, y dónde está. Es lo que Listo mandaría a la caja de guardados.
  quedan() {
    const bandeja = this.tray.length;
    const sueltas = this.wrongItems().length;
    const cajas = this.boxes.reduce((s, b) => s + b.items.length, 0);
    return { bandeja, sueltas, cajas, total: bandeja + sueltas + cajas };
  }

  // Lo que la historia necesita colocado para seguir.
  faltanObligatorios() {
    return (this.ch.obligatorio ?? []).filter((id) => !this.items.some((i) => i.def.id === id && i.placed && i.surf !== 'cacharras'));
  }

  ocupado() { return !!this.held; }

  // ---- Gestos -----------------------------------------------------------

  tap(p) {
    if (this.parado) return;
    const dicho = this.speech;
    this.speech = null;
    if (this.tutorial?.tap(p)) return;
    const b = this.buttons;
    if (inside(b.girar, p.x, p.y)) { this.rotateView(); return; }
    if (inside(b.ayuda, p.x, p.y)) { this.g.overlay = new Ayuda(this.g); return; }
    if (inside(b.listo, p.x, p.y)) { if (this.canFinish) this.finish(); return; }
    if (inside(b.cuaderno, p.x, p.y)) { this.g.overlay = new Notebook(this.g); return; }
    if (this.seGuarda && inside(b.guardados, p.x, p.y)) { this.tapGuardados(); return; }
    if (this.inTray(p)) { this.tapTray(p, dicho); return; }
    // La banda de arriba enseña otra vez el encargo del capítulo.
    if (p.y < BAND_TOP && this.ch.encargo) { this.readNote({ de: 'buitre', t: this.ch.encargo }); return; }
    if (!this.inView(p)) return;
    this.cam.stop();
    const w = this.cam.toBoard(p.x, p.y);
    if (this.rafiNote && this.hitRafi(w)) { this.readNote(this.rafiNote); this.rafiNote = null; return; }
    const box = this.boxAt(w);
    if (box) { this.tapBox(box); return; }
    if (this.hitPC(w)) { this.speech = { who: 'maria', p: 'Normal', nombre: 'El ordenador del Alberto', t: 'El Guild Wars a las cuatro de la tarde. Ni saluda.', left: 4200 }; return; }
    const quien = this.actorAt(w);
    if (quien) { this.hablar(quien); return; }
    const it = this.itemAt(w.x, w.y);
    if (it?.def.lee) this.leer(it);
    else if (it?.placed && it.def.enciende) this.tocaLuz = { it, left: ESPERA_TOQUE };
  }

  // El botón de la caja se ve desde el principio: es lo que explica para qué sirve.
  tapGuardados() {
    sfx.papel();
    if (!this.guardados.length) {
      this.speech = { who: 'maria', p: 'Normal', nombre: 'Caja de guardados', t: 'Vacía. Lo que no coloque al pulsar Listo se guarda aquí solo.', left: 4200 };
      return;
    }
    this.abrirGuardados = !this.abrirGuardados;
    this.trayScroll = 0;
  }

  // Encender o apagar. El ordenador del Alberto no se toca: lo dice él y lo dice la nota.
  pulsaLuz(it) {
    const { enciende } = it.def;
    if (enciende.noTocar) { this.speech = { who: 'maria', p: 'Normal', nombre: it.def.name, t: enciende.noTocar, left: 3600 }; return; }
    it.encendido = !it.encendido;
    sfx.click();
    this.persist();
  }

  // Lo que hay en la bandeja se comenta al pulsarlo.
  tapTray(p, dicho = null) {
    if (this.inTabs(p)) {
      const tab = this.pestanas().find((t) => inside(t, p.x, p.y));
      if (tab && tab.id !== this.catCaja) { this.catCaja = tab.id; this.trayScroll = 0; sfx.papel(); }
      return;
    }
    const slot = this.traySlots().find((s) => inside(s, p.x, p.y));
    if (!slot) return;
    const it = slot.items[0];
    // «Toca para leer»: el segundo toque lo abre, también desde la bandeja.
    if (it.def.lee && dicho?.lee && dicho.nombre === it.def.name) { this.leer(it); return; }
    this.quip(it);
    // Al recoger, la lista también lleva hasta el objeto.
    if (this.mode === 'recoger') {
      const s = toScreen(it.cx, it.cy, it.z);
      this.cam.stop();
      this.cam.centerOn(s.x, s.y);
    }
  }

  // Doble toque en la bandeja: gira lo que hay en ese hueco antes de sacarlo.
  turnTray(p) {
    if (this.inTabs(p) || this.mode === 'recoger') { this.tapTray(p); return; }
    const slot = this.traySlots().find((s) => inside(s, p.x, p.y));
    if (!slot) return;
    if (slot.items[0].def.lee) { this.leer(slot.items[0]); return; }
    // Lo que se ve igual por todos lados no gira, pero el toque se nota.
    for (const it of slot.items) {
      if (it.def.turn === 'flip') it.rot = it.def.back ? (it.rot + 1) % 4 : it.rot ^ 1;
      it.arrive = TRAY_ARRIVE;
    }
    sfx.papel();
    this.persist();
  }

  // Manolo y Juanjo se pueden tocar.
  actorAt(w) {
    return [this.juanjo, this.manolo, ...this.visitas].find((a) => {
      if (!a || !this.actors.includes(a)) return false;
      const s = toScreen(a.x + a.w / 2, a.y + a.d / 2, a.z);
      return Math.abs(w.x - s.x) < 44 && w.y > s.y - 110 && w.y < s.y + 12;
    }) ?? null;
  }

  hablar(a) {
    if (a === this.juanjo) { this.say('juanjo', this.fraseJuanjo()); return; }
    if (a.visita) {
      const { who, nombre, habla } = a.visita;
      a.veces = (a.veces ?? -1) + 1;
      this.say(who, habla[a.veces % habla.length], nombre);
      return;
    }
    const lista = (this.fase === 2 ? this.ch.recogida.manoloHabla : this.ch.manoloHabla) ?? ['...'];
    this.say('manolo', lista[this.vecesManolo++ % lista.length]);
  }

  // Al azar, sin repetir la última que ha dicho.
  fraseJuanjo() {
    const frases = this.g.data.textos.juanjo;
    const otras = frases.filter((t) => t !== this.ultimaJuanjo);
    this.ultimaJuanjo = otras[Math.floor(Math.random() * otras.length)];
    return this.ultimaJuanjo;
  }

  // María comenta el objeto. No detiene nada: se quita sola o al siguiente toque.
  quip(it) {
    const { dice, diceCap, name: nombre, cara, lee } = it.def;
    const t = diceCap?.[this.ch.n] ?? dice;   // un objeto que vuelve puede decir otra cosa según el capítulo
    if (!t) { this.speech = { who: 'maria', p: 'Normal', nombre, t: '', left: 1800 }; return; }
    this.speech = { who: 'maria', p: cara ?? 'Normal', nombre, t, left: 4200, lee: !!lee };
  }

  // Lo que tiene texto se abre tocándolo: manuscrito, pizarrita y el recorte.
  leer(it) {
    const { titulo, paginas } = paginasDe(this.g, it.def);
    const { state } = this.g;
    if (!state.notes.some((n) => n.leer === it.def.id)) state.notes.push({ cap: this.ch.n, de: 'buitre', t: titulo, leer: it.def.id });
    this.g.overlay = new Reading(this.g, titulo, paginas, null, true);
  }

  // El ordenador del Alberto, en el cuartillo desde que se encierra.
  get pcAlberto() { return this.cerrado ? this.g.data.room.pcAlberto : null; }

  hitPC(w) {
    const pc = this.pcAlberto;
    if (!pc) return false;
    const s = toScreen(pc.x + pc.w / 2, pc.y + pc.d / 2, 20);
    return Math.hypot(w.x - s.x, w.y - s.y) < 40;
  }

  // Gira la cámara 90° sin perder de vista lo que se estaba mirando.
  rotateView(dir = 1) {
    if (this.held) return;
    this.trama.empezar(this.g.ctx.canvas);
    const c = this.cam.center();
    const w = onFloor(c.x, c.y);
    setView((viewIndex() + dir + 4) % 4);
    const s = toScreen(w.x, w.y);
    this.cam.centerOn(s.x, s.y);
    this.cam.stop();
    sfx.papel();
    this.tutorial?.on('rotated');
  }

  // Giro de dos dedos: la maqueta gira hacia donde giran los dedos, siempre de vista en vista.
  twist(dir) {
    if (this.parado || this.cine) return;
    this.rotateView(dir);
  }

  doubleTap(p) {
    if (this.parado) return;
    this.tocaLuz = null;      // eran dos toques: gira, no enciende
    if (this.inTray(p)) { this.turnTray(p); return; }
    if (!this.inView(p)) { this.tap(p); return; }
    const w = this.cam.toBoard(p.x, p.y);
    // Abrir cajas a toques rápidos es lo normal: nunca gira el mueble que tengan detrás.
    if (this.boxAt(w)) { this.tap(p); return; }
    const it = this.itemAt(w.x, w.y);
    if (!it) { this.tap(p); return; }
    if (it.def.lee) { this.leer(it); return; }
    this.turn(it);
    this.tutorial?.on('turned', it);
  }

  hold(p) {
    if (this.parado || !this.inView(p)) return false;
    const w = this.cam.toBoard(p.x, p.y);
    const it = this.itemAt(w.x, w.y);
    if (!it || !it.placed) return false;
    this.pick(it, p);
    this.tutorial?.on('held', it);
    navigator.vibrate?.(15);
    return true;
  }

  dragStart(p0, p) {
    if (this.held || this.parado) return;
    if (this.inTabs(p0)) { this.tabDrag = true; return; }
    if (this.inTray(p0) && this.mode === 'recoger') {
      // La lista de lo que hay que recoger coge el objeto esté donde esté.
      const slot = this.traySlots().find((s) => inside(s, p0.x, p0.y));
      if (slot) { slot.items[0].desdeLista = true; this.pick(slot.items[0], p); }
      return;
    }
    if (this.inTray(p0)) {
      // Con la bandeja llena, deslizar a lo ancho la recorre; si el dedo sale de ella, coge el objeto.
      if (this.trayMaxScroll && Math.abs(p.x - p0.x) > Math.abs(p.y - p0.y)) this.trayDrag = { p0, scroll: this.trayScroll };
      else this.pickFromTray(p0, p);
      return;
    }
    const w = this.inView(p0) ? this.cam.toBoard(p0.x, p0.y) : null;
    if (!w) return;
    const it = this.itemAt(w.x, w.y);
    if (it && !it.anim && (!it.placed || this.recoger?.has(it.def.id))) this.pick(it, p);
    else { this.panning = true; this.cam.stop(); }
  }

  drag(p, dx, dy) {
    this.pointer = p;
    if (this.tabDrag) { this.tabScroll = clamp(this.tabScroll - dx, 0, this.tabMaxScroll); return; }
    if (this.trayDrag) {
      if (this.inTray(p)) { this.trayScroll = clamp(this.trayScroll - dx, 0, this.trayMaxScroll); return; }
      const { p0, scroll } = this.trayDrag;
      this.trayDrag = null;
      this.trayScroll = scroll;
      this.pickFromTray(p0, p);
      return;
    }
    if (this.held) this.followPointer();
    else if (this.panning) { this.cam.pan(dx, dy); this.tutorial?.on('panned'); }
  }

  dragEnd(p, vx, vy) {
    if (this.held) this.drop();
    else if (this.panning) this.cam.fling(vx, vy);
    else if (this.trayDrag) this.trayVel = -vx;
    this.panning = false;
    this.trayDrag = null;
    this.tabDrag = false;
  }

  // Gesto interrumpido por el sistema: el objeto vuelve donde estaba.
  dragCancel() {
    const it = this.held;
    this.panning = false;
    this.trayDrag = null;
    this.tabDrag = false;
    if (!it) return;
    Object.assign(it, { alzado: false, desdeLista: false });
    if (it.fromTray) {
      this.held = null;
      this.heldFit = null;
      this.backToTray(it);
      return;
    }
    const { x, y, z, surf, parent, under, base, wall, u } = it.prev;
    Object.assign(it, { x, y, z, surf, parent, under, base, wall, u });
    this.held = null;
    this.heldFit = null;
    this.releaseChildren(it, 0, 0, true);
  }

  pinch(dir, p) {
    if (this.held) return;
    // La rueda sobre la bandeja la recorre: con muchos objetos, en el PC, es lo cómodo.
    if (this.inTray(p)) { this.trayScroll = clamp(this.trayScroll - dir * TRAY_SLOT * 2, 0, this.trayMaxScroll); return; }
    const next = ZOOMS[clamp(ZOOMS.indexOf(this.cam.zoom) + dir, 0, ZOOMS.length - 1)];
    if (next !== this.cam.zoom) this.trama.empezar(this.g.ctx.canvas);
    this.cam.setZoom(next, p.x, clamp(p.y, BAND_TOP, this.g.H - BAND_BOTTOM));
    this.tutorial?.on('zoomed');
  }

  inView(p) { return inside(this.cam.view, p.x, p.y); }

  hitRafi(w) {
    const s = toScreen(868, 496, 95);
    return Math.hypot(w.x - s.x, w.y - s.y) < 26;
  }

  boxAt(w) {
    const delante = this.drawOrder().filter((e) => e.box).reverse();
    const b = delante.find((e) => inside(e.box.rect(this.g.images), w.x, w.y))?.box;
    // Una caja con otra encima no se alcanza: el toque va a la de arriba.
    return b && (this.boxes.find((o) => o.z > b.z && o.x === b.x && o.y === b.y) ?? b);
  }

  visibleItems() { return this.items.filter((i) => !i.hidden); }

  isPending(it) { return !!this.recoger?.has(it.def.id) && !it.hidden; }

  // Un objeto que hay que coger gana siempre, esté detrás de lo que esté, y con margen generoso.
  pendingAt(x, y) {
    const { catalog } = this.g;
    let best = null, dist = Infinity;
    for (const it of this.items) {
      if (!this.isPending(it) || it.anim) continue;
      const img = catalog.image(it);
      const t = spriteTopLeft(it.x, it.y, it.z, it.w, it.d, img.height);
      const r = { x: t.x - 14, y: t.y - 14, w: img.width + 28, h: img.height + 28 };
      if (!inside(r, x, y)) continue;
      const d = Math.hypot(x - (t.x + img.width / 2), y - (t.y + img.height / 2));
      if (d < dist) { dist = d; best = it; }
    }
    return best;
  }

  // Lo suelto tampoco se pierde detrás de un mueble: se coge aunque esté tapado.
  looseAt(x, y) {
    const { catalog } = this.g;
    return this.items.find((i) => !i.placed && !i.hidden && !i.anim && !i.wall && this.hitItem(i, x, y, catalog)) ?? null;
  }

  itemAt(x, y) {
    const { catalog } = this.g;
    // Lo que hay que resolver gana a lo que tenga delante: pendiente, suelto y en rojo.
    const rojo = this.items.find((i) => i.red && !i.hidden && !i.wall && !i.anim && this.hitItem(i, x, y, catalog));
    const first = this.pendingAt(x, y) ?? this.looseAt(x, y) ?? rojo;
    if (first) return first;
    const order = this.drawOrder().filter((e) => e.item).reverse();
    for (const e of order) {
      const it = e.item;
      if (this.hitItem(it, x, y, catalog)) return it;
    }
    return this.items.filter((i) => (i.wall ? wallVisible(i.wall) : i.def.alfombra) && !i.hidden).find((i) => this.hitItem(i, x, y, catalog));
  }

  hitItem(it, x, y, catalog) {
    const img = catalog.image(it);
    if (it.wall) {
      const base = it.esquinaPared(it.z + it.paredH);
      const rx = x - base.x, ry = y - base.y - it.slope * rx;
      return rx >= -2 && rx <= it.paredW + 2 && ry >= -2 && ry <= it.paredH + 2;
    }
    const t = spriteTopLeft(it.x, it.y, it.z, it.w, it.d, img.height);
    const rx = x - t.x, ry = y - t.y;
    // Lo pequeño, con margen para el dedo; lo suelto, por todo su rectángulo: una corona tiene un agujero.
    if (img.width < 28) return rx >= -10 && rx <= img.width + 10 && ry >= -10 && ry <= img.height + 10;
    if (!it.placed) return rx >= 0 && rx <= img.width && ry >= 0 && ry <= img.height;
    // Lo que el mueble tapa no se coge por ahí: el toque es para el mueble.
    const boca = bocaDe(it, this.muebleDe(it));
    if (boca && !enQuad(boca, x, y)) return false;
    return catalog.opaque(it, it.mirror ? img.width - 1 - rx : rx, ry);
  }

  // ---- Reglas -----------------------------------------------------------

  readNote(note, then) {
    this.apuntaNota(note);
    this.g.overlay = new Note(this.g, note, then);
  }

  apuntaNota(note) {
    const { state } = this.g;
    if (!state.notes.some((n) => n.t === note.t)) state.notes.push({ cap: this.ch.n, de: note.de, t: note.t });
  }

  // Juanjo se va cuando solo queda su caja.
  levantaJuanjo() {
    const b = this.boxes.find((o) => o.sentado);
    if (!b || this.boxes.some((o) => o !== b && !o.keep)) return;
    b.sentado = false;
    this.actors = this.actors.filter((a) => a !== this.juanjo);
    this.juanjo = null;
    this.room.removeObstacle('juanjo');
  }

  tapBox(box) {
    if (box.sentado) { if (this.juanjo) this.hablar(this.juanjo); else sfx.thud(); return; }
    const r = box.tap();
    if (r.opened) { sfx.cinta(); this.kneel(); this.tutorial?.on('opened', box); this.persist(); return; }
    if (r.note) {
      this.readNote(r.note, () => {
        this.tutorial?.on('noteRead', box);
      });
      this.persist();
      return;
    }
    if (r.item) {
      sfx.carton();
      this.kneel();
      this.takeOut(box, r.item);
      // Lo que viene repetido sale de una vez: doce bolitas no son doce toques.
      while (box.items[0]?.id === r.item.id) this.takeOut(box, box.items.shift());
      this.tutorial?.on('taken', box, r.item);
      const dice = this.ch.manoloAlSacar?.[r.item.id];
      if (dice) this.say('manolo', dice);
      // La Rafi pide cada cosa una vez; lo que María iba a decir, después.
      const pide = this.ch.rafiAlSacar?.[r.item.id];
      const { dichos } = this.g.state;
      if (pide && !dichos[`rafi:${r.item.id}`]) {
        dichos[`rafi:${r.item.id}`] = true;
        if (this.speech) this.cola.push(this.speech);
        this.say('rafi', pide, 'La Rafi');
      }
      if (box.empty && !box.keep) { this.boxes.splice(this.boxes.indexOf(box), 1); sfx.carton(); this.levantaJuanjo(); }
      this.persist();
    }
  }

  kneel() {
    this.maria.anim = 'Kneel';
    this.kneelT = 320;
  }

  // Lo que sale de una caja va a la bandeja: de ahí se arrastra a cualquier sitio.
  takeOut(box, entry) {
    const it = new Item(this.g.catalog.defs.get(entry.id), { origin: box.id });
    it.arrive = TRAY_ARRIVE;
    it.enBandeja = true;
    this.primeraVez(it);
    this.tray.push(it);
    this.abrirGuardados = false;
    this.trayScroll = 0;
  }

  // ---- Bandeja ----------------------------------------------------------

  // Con algo en la mano aparece siempre: soltarlo ahí es la manera de quitarlo del sótano.
  get trayH() { return this.bandeja.length || (this.held && this.mode !== 'recoger') ? TRAY_H + this.tabsH : 0; }
  get tabsH() { return this.verGuardados ? TABS_H : 0; }

  // La bandeja enseña lo sacado de las cajas o, con el botón de la caja, lo guardado.
  // Al recoger es la lista de lo que falta, con el objeto de verdad en cada hueco.
  get verGuardados() {
    return this.seGuarda && this.abrirGuardados && (this.guardados.length > 0 || !!this.held?.fromGuardado || (this.mode === 'libre' && !!this.held));
  }

  get bandeja() {
    if (this.mode === 'recoger') return [...new Map(this.items.filter((i) => this.isPending(i)).map((i) => [i.def.id, i])).values()];
    return this.verGuardados ? this.guardados : this.tray;
  }

  get trayRect() {
    const { W, H } = this.g;
    return { x: 0, y: H - BAND_BOTTOM - this.trayH, w: W, h: this.trayH };
  }

  // Un hueco por tipo de objeto, el último en llegar primero. Los iguales se agrupan.
  traySlots() {
    const r = this.trayRect;
    const grupos = new Map();
    for (const it of this.verGuardados ? this.enPestana() : [...this.bandeja].reverse()) {
      if (!grupos.has(it.def.id)) grupos.set(it.def.id, []);
      grupos.get(it.def.id).push(it);
    }
    return [...grupos.values()].map((items, i) => ({
      items, x: 8 + i * TRAY_SLOT - this.trayScroll, y: r.y + this.tabsH + 8, w: TRAY_SLOT - 8, h: TRAY_H - 14,
    }));
  }

  // Lo guardado de la pestaña abierta, por categorías y en el orden del catálogo.
  enPestana() {
    const { defs } = this.g.catalog;
    this.ordenCaja ??= new Map([...defs.values()].map((d, i) => [d.id, CATS.findIndex(([id]) => id === (d.cat ?? 'trastos')) * 1000 + i]));
    const lista = this.catCaja === 'todo' ? [...this.guardados] : this.guardados.filter((i) => catDe(i) === this.catCaja);
    return lista.sort((a, b) => this.ordenCaja.get(a.def.id) - this.ordenCaja.get(b.def.id));
  }

  // Solo las pestañas con algo dentro, más Todo: nada de pestañas vacías.
  pestanas() {
    const { ctx } = this.g;
    const r = this.trayRect;
    const hay = new Set(this.guardados.map(catDe));
    ctx.font = FONT.label;
    let x = 8 - this.tabScroll;
    return CATS.filter(([id]) => id === 'todo' || hay.has(id)).map(([id, label]) => {
      const texto = label.toUpperCase();
      const w = Math.ceil(ctx.measureText(texto).width) + 24;
      const tab = { id, texto, x, y: r.y + 4, w, h: TABS_H - 6 };
      x += w + 6;
      return tab;
    });
  }

  get tabMaxScroll() {
    const l = this.pestanas().at(-1);
    return l ? Math.max(0, l.x + l.w + this.tabScroll + 8 - this.g.W) : 0;
  }

  inTabs(p) {
    if (!this.tabsH) return false;
    const r = this.trayRect;
    return inside({ x: r.x, y: r.y, w: r.w, h: this.tabsH }, p.x, p.y);
  }

  get trayMaxScroll() {
    return Math.max(0, 8 + this.traySlots().length * TRAY_SLOT - this.g.W);
  }

  inTray(p) { return this.trayH > 0 && inside(this.trayRect, p.x, p.y); }

  pickFromTray(p0, p) {
    const slot = this.traySlots().find((s) => inside(s, p0.x, p0.y));
    if (!slot) return;
    const it = slot.items[0];
    const lista = this.bandeja;
    it.fromGuardado = this.verGuardados;
    lista.splice(lista.indexOf(it), 1);
    this.items.push(it);
    it.fromTray = true;
    it.hidden = false;
    // Sale al mundo tal como se veía en la bandeja.
    it.rot = (it.rot - viewIndex() + 4) % 4;
    it.enBandeja = false;
    this.pick(it, p);
  }

  backToTray(it) {
    this.items.splice(this.items.indexOf(it), 1);
    const lista = it.fromGuardado || this.mode === 'libre' ? this.guardados : this.tray;
    Object.assign(it, { rot: (it.rot + viewIndex()) % 4, enBandeja: true, encendido: false, fromTray: false, fromGuardado: false, leftTray: false, alzado: false, surf: null, parent: null, under: null, base: 0, z: 0, wall: null, prev: null });
    this.releaseChildren(it, 0, 0, false);
    lista.push(it);
    if (lista === this.tray) this.abrirGuardados = false;
    this.trayScroll = 0;      // el grupo vuelve al principio: que se vea
    sfx.papel();
  }

  // ---- Guardados --------------------------------------------------------

  get seGuarda() { return this.mode !== 'recoger'; }

  // Al confirmar Listo: lo suelto, la bandeja y lo que quede en las cajas pasa a la caja de guardados.
  // Las notas sin leer no se pierden: van al cuaderno.
  guardarLoQueQueda() {
    const { catalog } = this.g;
    for (const it of this.wrongItems()) {
      this.items.splice(this.items.indexOf(it), 1);
      Object.assign(it, { rot: (it.rot + viewIndex()) % 4, enBandeja: true, encendido: false, surf: null, parent: null, under: null, base: 0, wall: null, z: 0, red: false, anim: null });
      this.guardados.push(it);
    }
    this.guardados.push(...this.tray);
    this.tray = [];
    for (const b of this.boxes) {
      if (b.note) this.apuntaNota(b.note);
      for (const e of b.items) this.guardados.push(Object.assign(new Item(catalog.defs.get(e.id), { origin: b.id }), { enBandeja: true }));
      Object.assign(b, { note: null, items: [], open: true });
    }
    if (this.rafiNote) this.apuntaNota(this.rafiNote);
    this.rafiNote = null;
    this.boxes = this.boxes.filter((b) => b.keep);
    this.abrirGuardados = false;
    sfx.carton();
  }

  // Cuando la bandeja aparece, el sótano no salta: solo se acorta la ventana.
  fitTray() {
    const { W, H } = this.g;
    const h = H - BAND_TOP - BAND_BOTTOM - this.trayH;
    if (this.cam.view.h === h) return;
    const { x, y } = this.cam;
    if (!this.cine) this.cam.setView(0, BAND_TOP, W, h);
    Object.assign(this.cam, { x, y });
    this.cam.clamp();
  }

  // La primera vez que aparece cada cosa, María dice lo suyo.
  primeraVez(it) {
    if (this.tutorial) return;       // mientras explica, que hable solo el tutorial
    const { state } = this.g;
    state.dichos ??= {};
    if (state.dichos[it.def.id]) return;
    state.dichos[it.def.id] = true;
    this.quip(it);
  }

  pick(it, p) {
    this.primeraVez(it);
    if (this.mode === 'libre') this.abrirGuardados = true;    // lo que se suelte en la franja vuelve a la caja
    it.prev = { x: it.x, y: it.y, z: it.z, surf: it.surf, parent: it.parent, under: it.under, base: it.base, wall: it.wall, u: it.u, p0: { ...p } };
    this.children = carriedBy(it, this.items);
    for (const c of this.children) c.hidden = true;
    Object.assign(it, { surf: null, parent: null, under: null, wall: null, onCar: false, red: false, anim: null });
    this.held = it;
    this.pointer = p;
    this.followPointer();
  }

  followPointer() {
    const it = this.held, p = this.pointer;
    const v = this.cam.view;
    const b = this.cam.toBoard(p.x, clamp(p.y - LIFT, v.y, v.y + v.h));
    this.heldAt = b;
    // Salir de la bandeja o alejarse del hueco: ya no es arrepentirse.
    if (it.fromTray && (!this.inTray(p) || Math.hypot(p.x - it.prev.p0.x, p.y - it.prev.p0.y) > 40)) it.leftTray = true;
    const opts = { allowFree: this.mode !== 'recoger', girar: true };
    this.heldFit = findFit(it, b.x, b.y, this.room, this.items, this.g.catalog, opts);
    this.heldNoCabe = !!opts.noCabe;
    const m = toScreen(this.maria.x, this.maria.y);
    this.maria.row = facingRow(b.x - m.x, b.y - m.y + 40);
  }

  // Qué pasará al soltar. La vista previa y la caída real salen de aquí, para que coincidan.
  dropTarget() {
    const it = this.held, prev = it.prev, p = this.pointer, w = this.heldAt;
    // Mantener y soltar sin mover: se queda donde estaba.
    if (prev?.surf && Math.hypot(p.x - prev.p0.x, p.y - prev.p0.y) < 12) return { kind: 'stay' };
    // Sin haber salido de la bandeja, soltar es arrepentirse.
    if (it.fromTray && !it.leftTray) return { kind: 'tray' };
    // La franja de abajo es para quitar: al recoger no, ahí solo se vuelve atrás.
    if (this.enBandaBaja(p)) return this.mode === 'recoger' ? { kind: 'stay' } : { kind: 'tray', quitar: !it.fromTray };
    const box = this.boxAt(w);
    if (box && this.acceptsBox(it, box)) return { kind: 'box', box };
    if (this.heldFit) return { kind: 'fit', fit: this.heldFit };
    // Apuntando a un mueble en el que no cabe: ni se suelta ni cae detrás de él.
    if (this.heldNoCabe) {
      if (it.fromTray) return { kind: 'tray', muro: true };
      if (prev?.surf) return { kind: 'stay', muro: true };
    }
    // Tocando un muro no se suelta: vuelve a la bandeja o a donde estaba.
    const pisada = this.rawFoot(it, w);
    if (it.def.layer !== 'wall' && (this.room.touchesWall(pisada) || (!it.def.alfombra && this.room.pisaCuerpo(pisada)))) {
      if (it.fromTray) return { kind: 'tray', muro: true };
      if (prev?.surf) return { kind: 'stay', muro: true };
    }
    // Manolo solo recoge lo que no tiene sitio.
    if (this.manolo && this.ch.ayudaManolo && this.nearManolo(w)) return { kind: 'manolo' };
    // Lo que viene de la bandeja no cae: vuelve a ella.
    if (it.fromTray) return { kind: 'tray' };
    const spot = this.fallSpot(it, w);
    // Si cae en un sitio que le vale, se queda colocado: que no parezca puesto sin estarlo.
    const s = toScreen(spot.x + it.w / 2, spot.y + it.d / 2);
    const fit = findFit(it, s.x, s.y, this.room, this.items, this.g.catalog);
    if (fit && !fit.wall && !fit.surface.parent && !fit.z) return { kind: 'fit', fit };
    return { kind: 'fall', spot };
  }

  // Lo que vuelve a la bandeja vuelve por algo: se dice en una línea.
  avisaSitio(it) {
    const { room, g } = this;
    const sitios = g.catalog.tokens(it.def).filter((t) => !t.startsWith('caja:'));
    const aviso = !it.def.alfombra && room.pisaCuerpo(this.rawFoot(it, this.heldAt)) ? 'Ahí ya hay algo'
      : sitios.every((t) => room.surface(t)?.kind === 'wall') ? 'Eso va en la pared'
        : sitios.every((t) => t.startsWith('top:')) ? 'Eso va encima de un mueble' : 'Ahí no cabe';
    this.banner = { name: aviso, t: 1800 };
  }

  enBandaBaja(p) { return this.inTray(p) || p.y >= this.g.H - BAND_BOTTOM; }

  rawFoot(it, w) {
    const f = onFloor(w.x, w.y, 0);
    return { x: f.x - it.w / 2, y: f.y - it.d / 2, w: it.w, h: it.d };
  }

  drop() {
    const it = this.held, prev = it.prev, w = this.heldAt;
    const target = this.dropTarget();
    this.held = null;
    this.heldFit = null;
    if (target.muro || (target.kind === 'tray' && it.leftTray && !target.quitar && !this.enBandaBaja(this.pointer))) this.avisaSitio(it);
    if (target.kind === 'stay') {
      Object.assign(it, { x: prev.x, y: prev.y, z: prev.z, surf: prev.surf, parent: prev.parent, under: prev.under, base: prev.base, wall: prev.wall, u: prev.u });
      this.releaseChildren(it, 0, 0, true);
    } else if (target.kind === 'tray') this.backToTray(it);
    else if (target.kind === 'box') this.intoBox(it, target.box);
    else if (target.kind === 'manolo') this.giveToManolo(it);
    else if (target.kind === 'fit') this.stick(it, target.fit);
    else this.fall(it, w, target.spot);
    Object.assign(it, { fromTray: false, fromGuardado: false, leftTray: false, alzado: false, desdeLista: false });
    this.persist();
  }

  acceptsBox(it, box) {
    if (this.mode === 'recoger') return this.recoger.has(it.def.id);
    return it.def.fits.includes('caja:origen') && it.origin === box.id;
  }

  intoBox(it, box) {
    sfx.carton();
    this.releaseChildren(it, 0, 0, false);
    if (this.mode === 'recoger') {
      this.items.splice(this.items.indexOf(it), 1);
      this.tachaRecoger(it.def.id);
      return;
    }
    Object.assign(it, { surf: 'caja', hidden: true, x: box.x, y: box.y });
  }

  nearManolo(w) {
    const s = toScreen(this.manolo.x, this.manolo.y);
    return Math.hypot(w.x - s.x, w.y - s.y + 30) < 48;
  }

  giveToManolo(it) {
    const r = this.room.surface('cacharras').rect;
    const n = this.items.filter((i) => i.surf === 'cacharras').length;
    const x = r.x + 6 + (n * 26) % (r.w - Math.min(r.w - 8, it.w + 6));
    const y = r.y + (n % 2 ? 0 : 8);
    it.centerOn(clamp(x + it.w / 2, r.x + it.w / 2, r.x + r.w - it.w / 2), clamp(y + it.d / 2, r.y + it.d / 2, r.y + r.h - it.d / 2), 0);
    it.surf = 'cacharras';
    this.releaseChildren(it, 0, 0, false);
    sfx.thud();
  }

  stick(it, fit) {
    const prev = it.prev;
    if (fit.wall) Object.assign(it, { wall: fit.wall, u: fit.u, z: fit.z, surf: fit.surface.id, parent: null, under: null, base: 0 });
    else Object.assign(it, { x: fit.x, y: fit.y, z: fit.z, surf: fit.surface.id, parent: fit.surface.parent ?? null, under: fit.under ?? null, base: fit.base ?? 0, rot: fit.rot ?? it.rot });
    it.flash = FLASH_MS;
    this.tutorial?.on('placed', it);
    this.releaseChildren(it, it.x - (prev?.x ?? it.x), it.y - (prev?.y ?? it.y), true, it.z - (prev?.z ?? it.z));
    sfx.click();
    if (!prev) return;          // girar en el sitio no es colocar
    it.asienta = ASIENTA;
    if (fit.wall) sfx.papel();
    else if (it.w + it.d >= OBJETO_GRANDE) sfx.thud();
  }

  // Los objetos de encima viajan con el mueble; si este se cae, caen con él.
  releaseChildren(it, dx, dy, keep, dz = 0) {
    for (const c of this.children ?? []) {
      c.hidden = false;
      if (keep) { c.x += dx; c.y += dy; c.z += dz; c.base += dz; continue; }
      const s = toScreen(c.cx, c.cy);
      Object.assign(c, { surf: null, parent: null, under: null, base: 0 }, this.fallSpot(c, s), { z: 0 });
    }
    this.children = [];
  }

  // Sin sitio válido cae al suelo; sobre una pared o sobre el coche, al suelo más cercano.
  fall(it, w, spot) {
    this.releaseChildren(it, 0, 0, false);
    const p = onFloor(w.x, w.y, 0);
    const from = { x: Math.round(p.x - it.w / 2), y: Math.round(p.y - it.d / 2), z: 40 };
    const to = { x: spot.x, y: spot.y, z: 0 };
    Object.assign(it, from);
    it.anim = { from, to, t: 0, dur: 170, hop: 0, gravity: true, thud: true };
  }

  // Dónde acaba un objeto soltado donde no vale.
  fallSpot(it, w) {
    const room = this.room;
    const p = onFloor(w.x, w.y, 0);
    let tx = p.x, ty = p.y;
    if (!room.floors().some((s) => inside(s.rect, p.x, p.y))) {
      let best = Infinity;
      for (const s of room.floors()) {
        const r = s.rect;
        const px = clamp(p.x, r.x, r.x + r.w - 1), py = clamp(p.y, r.y, r.y + r.h - 1);
        const d = (px - p.x) ** 2 + (py - p.y) ** 2;
        if (d < best) { best = d; tx = px; ty = py; }
      }
    }
    // Nunca dentro de un obstáculo: desde ahí ni se vería ni se podría coger.
    const foot = (cx, cy) => ({ x: Math.round(cx - it.w / 2), y: Math.round(cy - it.d / 2), w: it.w, h: it.d });
    const sobreSuelo = (f) => room.floors().some((s) => f.x >= s.rect.x && f.y >= s.rect.y && f.x + f.w <= s.rect.x + s.rect.w && f.y + f.h <= s.rect.y + s.rect.h);
    if (room.blocked(foot(tx, ty)) || !sobreSuelo(foot(tx, ty))) {
      for (let r = 10; r < 400; r += 8) {
        for (let k = 0; k < 16; k++) {
          const a = k * Math.PI / 8;
          const f = foot(tx + Math.cos(a) * r, ty + Math.sin(a) * r);
          if (sobreSuelo(f) && !room.blocked(f)) return { x: f.x, y: f.y, z: 0 };
        }
      }
    }
    const f = foot(tx, ty);
    return { x: f.x, y: f.y, z: 0 };
  }

  // Doble toque: gira (espejo) o tuerce (pósters).
  turn(it) {
    if (it === this.held || it.anim) return;
    if (it.def.turn === 'tilt') {
      it.tilt = it.tilt === 0 ? 1 : it.tilt === 1 ? -1 : 0;
      sfx.papel();
      return;
    }
    if (it.def.turn !== 'flip') return;
    const next = it.def.back ? (it.rot + 1) % 4 : it.rot ^ 1;
    if (!it.placed) { const cx = it.cx, cy = it.cy; it.rot = next; it.centerOn(cx, cy); return; }
    const before = { x: it.x, y: it.y, z: it.z, rot: it.rot, cx: it.cx, cy: it.cy };
    const { surf, parent, under, base } = it;
    const s = toScreen(it.cx, it.cy, base ?? it.z);
    const carried = carriedBy(it, this.items);
    Object.assign(it, { surf: null, parent: null, under: null });
    // Si no cabe en la siguiente posición, prueba las otras antes de rendirse.
    let fit = null;
    const steps = it.def.back ? [1, 2, 3] : [1];
    for (const step of steps) {
      it.rot = it.def.back ? (before.rot + step) % 4 : next;
      fit = findFit(it, s.x, s.y, this.room, this.items, this.g.catalog, { plano: { surf, parent, base: base ?? 0 } });
      if (fit) break;
    }
    if (fit) {
      it.prev = null;
      this.children = [];
      this.stick(it, fit);
      // Lo que lleva encima gira con él, un cuarto de vuelta cada paso.
      const pasos = (it.rot - before.rot + 4) % 4;
      const dz = it.z - before.z;
      for (const c of carried) {
        let ox = c.cx - before.cx, oy = c.cy - before.cy;
        for (let k = 0; k < pasos; k++) [ox, oy] = [-oy, ox];
        c.rot = (c.rot + pasos) % 4;
        c.base += dz;
        const p = planoDe(c, it);
        const r = p?.rect ?? { x: it.x, y: it.y, w: it.w, h: it.d };
        c.centerOn(clamp(it.cx + ox, r.x + c.w / 2, r.x + r.w - c.w / 2), clamp(it.cy + oy, r.y + c.d / 2, r.y + r.h - c.d / 2), c.z + dz);
        if (p?.boca) Object.assign(c, alFrente(c, c.x, c.y, p));
      }
    } else {
      const { x, y, z, rot } = before;
      Object.assign(it, { x, y, z, rot, surf, parent, under, base });
    }
    this.persist();
  }

  // ---- Listo ------------------------------------------------------------

  wrongItems() {
    if (this.mode === 'libre') return [];
    return this.items.filter((i) => !i.placed && !i.hidden && i !== this.held);
  }

  finish() {
    if (this.mode === 'libre') {
      this.saveGuardados();
      this.g.state.libreItems = this.items.map((i) => i.save());
      store(this.g.state);
      this.g.go('inicio');
      return;
    }
    const falta = this.faltanObligatorios();
    if (falta.length) { this.avisaObligatorios(falta); return; }
    const q = this.quedan();
    const notas = this.boxes.filter((b) => b.note).length + (this.rafiNote ? 1 : 0);
    const sigue = this.ch.recogida && this.fase === 1 ? 'Seguirás en este capítulo: aún queda recoger.' : 'Pasarás al capítulo siguiente.';
    const lineas = q.total ? [...this.lineasQuedan(q)] : [`Está todo colocado. ${sigue}`];
    if (notas) lineas.push('Las notas sin leer pasan al cuaderno.');
    this.g.overlay = new Dialogo(this.g, {
      titulo: '¿Seguro que quieres continuar?',
      lineas,
      si: 'Sí, continuar',
      no: 'Seguir colocando',
      onSi: () => this.terminar(),
      onNo: () => this.marcaSueltos(),
    });
  }

  lineasQuedan({ bandeja, sueltas, cajas, total }) {
    const trozos = [];
    if (bandeja) trozos.push(`${bandeja} en la bandeja`);
    if (sueltas) trozos.push(`${sueltas} ${sueltas === 1 ? 'suelta' : 'sueltas'} por el sótano`);
    if (cajas) trozos.push(`${cajas} en las cajas`);
    const lista = trozos.length > 1 ? `: ${trozos.slice(0, -1).join(', ')} y ${trozos.at(-1)}` : ` ${trozos[0].replace(/^\d+ /, '')}`;
    const una = total === 1;
    return [
      `${una ? 'Queda 1 cosa' : `Quedan ${total} cosas`} sin colocar${lista}.`,
      this.ch.n === this.g.capFinal - 1
        ? `${una ? 'Irá sola' : 'Irán solas'} a la caja de guardados.`
        : `${una ? 'Irá sola' : 'Irán solas'} a la caja de guardados. En los próximos capítulos ${una ? 'la sacas' : 'las sacas'} con el botón CAJA.`,
    ];
  }

  // Sin esto la historia no sigue: se avisa y se vuelve a colocar.
  avisaObligatorios(falta) {
    const { defs } = this.g.catalog;
    const nombres = falta.map((id) => defs.get(id).name).join(', ');
    this.g.overlay = new Dialogo(this.g, {
      titulo: 'Aún no puedes terminar',
      lineas: [`Falta colocar: ${nombres}.`, 'Es lo que pide el encargo. Búscalo en las cajas o en la bandeja y déjalo en el sótano.'],
      si: 'Vale',
      onSi: () => this.marcaSueltos(),
    });
  }

  // Al volver a colocar, lo que sigue suelto parpadea en rojo y la cámara lleva hasta ello.
  marcaSueltos() {
    const wrong = this.wrongItems();
    for (const i of wrong) i.red = true;
    if (wrong.length) this.showWrong(wrong);
  }

  terminar() {
    this.guardarLoQueQueda();
    this.persist();
    if (this.ch.recogida && this.fase === 1) { this.empiezaRecogida(); return; }
    if (this.ch.notaManolo) { this.darNota(); return; }
    this.cerrar();
  }

  cerrar() {
    this.closeChapter();
    const fin = { ch: this.ch, end: this.ch.end, sinSitio: this.sinSitio };
    if (this.ch.end?.estampa) this.g.go('estampa', { ...fin, base: this });
    else this.g.go('final', fin);
  }

  // Capítulo 7: Manolo espera con el papelito en la mano. Cuando María acaba, cruza y se lo da.
  darNota() {
    const m = this.manolo, a = this.maria;
    const f = this.freeNear({ w: 16, d: 16 }, a.x - 6, a.y - 34);
    this.entrega = { ruta: [...this.ch.notaManolo.paso.map(([x, y]) => ({ x, y })), { x: f.x, y: f.y }], fase: 'camina', t: 0 };
    m.anim = 'Walk';
    m.worldFacing = false;
    const s = toScreen((a.x + f.x) / 2, (a.y + f.y) / 2);
    this.cam.stop();
    if (this.cam.zoom < 1) { this.trama.empezar(this.g.ctx.canvas); this.cam.zoom = 1; }
    this.cam.centerOn(s.x, s.y);
  }

  sigueEntrega(dt) {
    const e = this.entrega, m = this.manolo, a = this.maria;
    if (e.fase === 'camina') {
      let paso = dt * MANOLO_VEL;
      while (paso > 0 && e.ruta.length) {
        const q = e.ruta[0], d = Math.hypot(q.x - m.x, q.y - m.y);
        const s = toScreen(m.x, m.y), t = toScreen(q.x, q.y);
        if (d > 1) m.row = facingRow(t.x - s.x, t.y - s.y);
        if (d <= paso) { Object.assign(m, { x: q.x, y: q.y }); e.ruta.shift(); paso -= d; continue; }
        m.x += (q.x - m.x) * paso / d;
        m.y += (q.y - m.y) * paso / d;
        paso = 0;
      }
      if (e.ruta.length) return;
      const p = toScreen(m.x, m.y), q = toScreen(a.x, a.y);
      m.anim = 'Idle';
      m.row = facingRow(q.x - p.x, q.y - p.y);
      a.row = facingRow(p.x - q.x, p.y - q.y);
      this.say('manolo', 'Toma.');
      Object.assign(e, { fase: 'ofrece', t: 0 });
      return;
    }
    e.t += dt;
    if (e.fase === 'ofrece' && e.t >= NOTA_OFRECE) { Object.assign(e, { fase: 'pasa', t: 0 }); sfx.papel(); return; }
    if (e.fase === 'pasa' && e.t >= NOTA_PASA) {
      e.fase = 'leida';
      this.speech = null;
      this.readNote({ de: 'manolo', t: this.ch.notaManolo.t }, () => this.cerrar());
    }
  }

  // Si no se ve ningún objeto en rojo, la cámara lleva al primero.
  showWrong(wrong) {
    const v = this.cam.view;
    const visible = wrong.some((i) => {
      const p = this.cam.toBoard(0, 0);
      const s = toScreen(i.cx, i.cy, i.z);
      const z = this.cam.zoom;
      return inside(v, (s.x - p.x) * z, (s.y - p.y) * z);
    });
    if (visible) return;
    const s = toScreen(wrong[0].cx, wrong[0].cy, wrong[0].z);
    this.cam.stop();
    this.cam.centerOn(s.x, s.y);
  }

  closeChapter() {
    const { state } = this.g;
    const { n } = this.ch;
    const f = state.flags;
    const ids = (id) => this.items.filter((i) => i.def.id === id);
    if (n === 2) {
      // Las sagas ordenadas: los tres packs en la misma estantería.
      const packs = ['pack_lotr', 'pack_sw', 'pack_hp'].map((id) => ids(id)[0]);
      const baldas = (it) => this.items.find((o) => o.uid === it?.parent)?.def.offers?.tag === 'estanteria';
      f.sagas = packs.every((b) => baldas(b) && b.parent === packs[0].parent);
    }
    if (n === 3) f.rosasGuardadas = ids('rosas_azules').some((i) => i.surf !== 'cacharras');
    const lamp = ids('lampara')[0];
    if (lamp) {
      state.bolitasLampara = ids('bolita').filter((b) => Math.hypot(b.cx - lamp.cx, b.cy - lamp.cy) < 30).length;
    }
    this.saveGuardados();
    this.sinSitio = this.items.filter((i) => i.surf === 'cacharras' && !this.enCacharras.has(i.uid) && !i.def.id.startsWith('cacharra')).length;
    state.items = this.items.filter((i) => i.surf !== 'caja').map((i) => i.save());
    state.chapter = n + 1;
    state.progreso = null;
    if (n === this.g.capFinal - 1) state.antesDelFinal = state.items;
    if (n === this.g.capFinal) state.terminado = true;     // ya no se puede perder aunque se recargue en la cólera
    if (this.ch.end?.cuadernoNegro) state.pendienteCuaderno = true;
    store(state);
  }

  // La foto del sótano terminado, antes de que el Buitre lo destroce.
  hacerFoto() {
    const [c, ctx] = makeCanvas(BOARD.w, BOARD.h);
    ctx.fillStyle = UI.fondo;
    ctx.fillRect(0, 0, c.width, c.height);
    this.drawBoard(ctx, true);
    guardarFoto(c);
  }

  endRecoger() {
    if (this.ch.recogida) { this.acabaRecogida(); return; }
    this.hacerFoto();
    this.closeChapter();
    this.boxes[0].open = false;
    sfx.cinta();
    setTimeout(() => this.g.go('colera', this), 700);
  }

  // ---- Visitas y recogida -------------------------------------------------

  // Quien baja por la escalera lo hace al entrar, y al llegar dice lo suyo.
  entraVisita() {
    const a = this.visitas.find((v) => v.visita.entra);
    if (!a || (this.resume && !this.resume.visitaEnCamino)) return;
    this.visitaEnCamino = true;
    const v = a.visita;
    const s = toScreen((a.sitio.x + ESCALERA.x) / 2, a.sitio.y);
    this.cam.centerOn(s.x, s.y);
    // Sale de lo alto de la escalera y baja pisando los peldaños.
    Object.assign(a, { x: ESCALERA.x + 47, y: ESCALERA.y, enEscalera: true });
    a.z = alturaEscalera(a.x + a.w / 2);
    this.quieto = true;
    this.camina(a, [ESCALERA, ...this.rutaHasta(ESCALERA, a.sitio.x, a.sitio.y)], () => {
      this.quieto = false;
      this.visitaEnCamino = false;
      this.mira(a, this.maria);
      this.mira(this.maria, a);
      this.speech = { who: v.who, nombre: v.nombre, t: v.dice, left: 14000 };
      if (v.respuesta) this.cola.push({ who: 'maria', nombre: 'María', ...v.respuesta, left: 5000 });
    });
  }

  mira(a, b) {
    const p = toScreen(a.x, a.y), q = toScreen(b.x, b.y);
    a.row = facingRow(q.x - p.x, q.y - p.y);
    if (a.worldFacing) a.row = (a.row + 2 * viewIndex()) % 8;
  }

  // Andar por una lista de puntos; `fin` se llama al llegar.
  camina(a, ruta, fin) {
    a.anim = 'Walk';
    this.caminos.push({ a, ruta: ruta.map((p) => ({ ...p })), fin, antes: a.worldFacing });
    a.worldFacing = false;
  }

  sigueCaminos(dt) {
    for (const c of [...this.caminos]) {
      let paso = dt * MANOLO_VEL;
      while (paso > 0 && c.ruta.length) {
        const q = c.ruta[0], d = Math.hypot(q.x - c.a.x, q.y - c.a.y);
        const s = toScreen(c.a.x, c.a.y), t = toScreen(q.x, q.y);
        if (d > 1) c.a.row = facingRow(t.x - s.x, t.y - s.y);
        if (d <= paso) { Object.assign(c.a, { x: q.x, y: q.y }); c.ruta.shift(); paso -= d; continue; }
        c.a.x += (q.x - c.a.x) * paso / d;
        c.a.y += (q.y - c.a.y) * paso / d;
        paso = 0;
      }
      if (c.a.enEscalera) {
        c.a.z = alturaEscalera(c.a.x + c.a.w / 2);
        if (!c.a.z) c.a.enEscalera = false;
      }
      if (c.ruta.length) continue;
      c.a.anim = 'Idle';
      this.caminos.splice(this.caminos.indexOf(c), 1);
      if (c.antes) { c.a.row = (c.a.row + 2 * viewIndex()) % 8; c.a.worldFacing = true; }
      c.fin?.();
    }
  }

  // Camino por el suelo libre, en una malla: se rodean muebles y cajas. Si no lo hay, en línea recta.
  rutaHasta(desde, x, y) {
    const PASO = 12;
    const hueco = (px, py) => {
      const f = { x: px - 8, y: py - 8, w: 32, h: 32 };
      return !this.room.solido(f) && this.room.floors().some((s) => inside(s.rect, f.x + 8, f.y + 8))
        && !this.items.some((i) => !i.wall && !i.hidden && !i.def.alfombra && !i.parent && !i.under && !this.recoger?.has(i.def.id) && hits(f, i.foot()))
        && !this.boxes.some((b) => hits(f, { x: b.x, y: b.y, w: b.w, h: b.d }));
    };
    const clave = (i, j) => i * 1000 + j;
    const i0 = Math.round(desde.x / PASO), j0 = Math.round(desde.y / PASO);
    const previo = new Map([[clave(i0, j0), null]]);
    const cola = [[i0, j0]];
    while (cola.length) {
      const [i, j] = cola.shift();
      const px = i * PASO, py = j * PASO;
      if (Math.hypot(px - x, py - y) < PASO) {
        const ruta = [{ x, y }];
        for (let k = clave(i, j); k != null && k !== clave(i0, j0); k = previo.get(k)) ruta.unshift({ x: Math.floor(k / 1000) * PASO, y: (k % 1000) * PASO });
        return ruta;
      }
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = clave(i + di, j + dj);
        if (previo.has(n) || !hueco((i + di) * PASO, (j + dj) * PASO)) continue;
        previo.set(n, clave(i, j));
        cola.push([i + di, j + dj]);
      }
    }
    return [{ x, y }];
  }

  // Lo que queda por recoger al otro día. Aquí nada se apila: se saca todo a una caja.
  empiezaRecogida() {
    const { g, ch } = this;
    const r = ch.recogida;
    g.relevo();
    Object.assign(this, { fase: 2, mode: 'recoger', luz: r.luz ?? ch.luz, abrirGuardados: false, trayScroll: 0 });
    if (r.musica) musica.poner(r.musica);
    this.actors = this.actors.filter((a) => !a.visita);
    this.visitas = [];
    if (r.manolo && this.manolo) Object.assign(this.manolo, this.plaza(r.manolo.x, r.manolo.y), { row: r.manolo.row });
    const [bx, by] = r.caja.at;
    const f = this.freeNear({ w: BOX.w, d: BOX.d }, bx + BOX.w / 2, by + BOX.d / 2);
    this.boxes = [Object.assign(new Box({ id: 'recogida', at: [f.x, f.y], label: r.caja.label, items: [], open: true }), { keep: true })];
    this.recoger = new Set(r.piezas.map((p) => p.id));
    for (const p of r.piezas) {
      const it = new Item(g.catalog.defs.get(p.id), { rot: this.items.length % 2 });
      // Lo del cuartillo está al otro lado de la puerta: ahí el sitio es el que es.
      const { x, y } = r.puerta ? { x: p.x - it.w / 2, y: p.y - it.d / 2 } : this.freeNear(it, p.x, p.y);
      Object.assign(it, { x, y });
      this.items.push(it);
    }
    this.banner = { name: r.banda, t: 3200 };
    this.speech = { who: 'maria', p: 'Pain', nombre: 'María', t: r.mariaDice, left: 5000 };
    if (r.manoloDice) this.cola.push({ who: 'manolo', t: r.manoloDice, left: 4000 });
    if (r.camara) { const c = toScreen(...r.camara); this.cam.stop(); this.cam.centerOn(c.x, c.y); }
    if (r.puerta) this.abrePuerta();
    this.persist();
  }

  albertoHabla() {
    this.alberto.visita = { who: 'alberto', nombre: 'El Alberto', habla: this.ch.recogida.albertoHabla ?? ['...'] };
    this.visitas.push(this.alberto);
  }

  // El Alberto sale hasta la puerta y se queda ahí, mirando, mientras se saca lo suyo.
  abrePuerta() {
    this.puertaAbierta = true;
    sfx.thud();
    this.albertoHabla();
    this.camina(this.alberto, [{ x: PUERTA.x, y: PUERTA.dentro }, { x: PUERTA.x, y: PUERTA.fuera }], () => { this.alberto.row = 0; });
  }

  // Una cosa menos. Un capítulo de `recogida` no acaba hasta que no quede ninguna de ese tipo.
  tachaRecoger(id) {
    if (!this.ch.recogida || !this.items.some((i) => i.def.id === id)) this.recoger.delete(id);
    if (this.recoger.size === 0) this.endRecoger();
    else this.manoloAyuda();
  }

  // Manolo no se queda mirando: va a por lo que tiene más cerca y vuelve a la bolsa.
  manoloAyuda() {
    const m = this.manolo;
    if (!this.ch.recogida?.ayudaManolo || this.ayudando || !m) return;
    const queda = this.items.filter((i) => this.recoger.has(i.def.id) && i !== this.held);
    if (queda.length < 2) return;     // lo último lo coge María
    const dist = (i) => Math.hypot(i.cx - m.x, i.cy - m.y);
    const pieza = queda.reduce((a, b) => (dist(b) < dist(a) ? b : a));
    const vuelta = { x: m.x, y: m.y };
    this.ayudando = true;
    this.camina(m, this.rutaHasta(m, Math.round(pieza.cx), Math.round(pieza.cy)), () => {
      if (this.items.includes(pieza) && pieza !== this.held && this.recoger.size) {
        this.items.splice(this.items.indexOf(pieza), 1);
        sfx.carton();
        this.say('manolo', this.ch.recogida.manoloHabla[0]);
        this.recoger = new Set([...this.recoger].filter((id) => this.items.some((i) => i.def.id === id)));
        if (!this.recoger.size) { this.endRecoger(); return; }
        this.persist();
      }
      this.camina(m, this.rutaHasta(m, vuelta.x, vuelta.y), () => { this.ayudando = false; });
    });
  }

  // Todo fuera. Si la puerta estaba abierta, el Alberto se vuelve dentro y la cierra.
  acabaRecogida() {
    const { ch } = this;
    this.quieto = true;
    this.closeChapter();
    const sigue = () => setTimeout(() => this.g.go('final', { ch, end: ch.end, sinSitio: this.sinSitio }), 700);
    if (!this.puertaAbierta) { sfx.cinta(); sigue(); return; }
    const a = this.g.data.room.alberto;
    this.camina(this.alberto, [{ x: PUERTA.x, y: PUERTA.dentro }, { x: a.x, y: a.y }], () => {
      this.puertaAbierta = false;
      this.alberto.row = a.row;
      sfx.thud();
      sigue();
    });
  }

  // ---- Bucle ------------------------------------------------------------

  update(dt) {
    this.bocadilloTapado();
    this.time += dt;
    this.trama.update(dt);
    this.cam.update(dt);
    if (this.abrirGuardados && !this.verGuardados) this.abrirGuardados = false;
    // Si se saca lo último de una pestaña, esa pestaña ya no está.
    if (this.catCaja !== 'todo' && !this.held && !this.guardados.some((i) => catDe(i) === this.catCaja)) this.catCaja = 'todo';
    // Con muchos objetos, un deslizamiento sigue un poco: la bandeja frena sola.
    if (this.trayVel && !this.held) {
      this.trayScroll = clamp(this.trayScroll + this.trayVel * dt, 0, this.trayMaxScroll);
      this.trayVel *= 0.992 ** dt;
      if (Math.abs(this.trayVel) < 0.02) this.trayVel = 0;
    }
    this.trayScroll = Math.min(this.trayScroll, this.trayMaxScroll);
    this.fitTray();
    for (const it of this.bandeja) if (it.arrive > 0) it.arrive -= dt;
    if (this.tocaLuz && (this.tocaLuz.left -= dt) <= 0) {
      const { it } = this.tocaLuz;
      this.tocaLuz = null;
      if (this.items.includes(it)) this.pulsaLuz(it);
    }
    if (this.held) this.edgeScroll(dt);
    if (this.kneelT > 0) { this.kneelT -= dt; if (this.kneelT <= 0) this.maria.anim = 'Idle'; }
    for (const it of this.items) {
      if (it.flash > 0) it.flash -= dt;
      if (it.asienta > 0) it.asienta -= dt;
      const a = it.anim;
      if (!a) continue;
      a.t = Math.min(1, a.t + dt / a.dur);
      const e = a.gravity ? a.t * a.t : a.t;
      it.x = Math.round(a.from.x + (a.to.x - a.from.x) * e);
      it.y = Math.round(a.from.y + (a.to.y - a.from.y) * e);
      it.z = Math.round(a.from.z + (a.to.z - a.from.z) * e + Math.sin(a.t * Math.PI) * a.hop);
      if (a.t === 1) { it.anim = null; if (a.thud) sfx.thud(); }
    }
    const z = this.currentZone();
    if (z && z !== this.zone) { this.zone = z; this.banner = { name: z, t: 1600 }; }
    if (this.banner.t > 0) this.banner.t -= dt;
    this.tutorial?.update(dt);
    this.sigueJuanjo(dt);
    if (this.entrega) this.sigueEntrega(dt);
    this.sigueCaminos(dt);
    if (this.speech && !this.g.overlay && (this.speech.left -= dt) <= 0) this.speech = null;
    if (!this.speech && this.cola.length) this.speech = this.cola.shift();
  }

  edgeScroll(dt) {
    const p = this.pointer, v = this.cam.view;
    if (this.enBandaBaja(p) || this.tutorial?.step.ev === 'placed') return;
    const dx = p.x < v.x + EDGE ? 1 : p.x > v.x + v.w - EDGE ? -1 : 0;
    // Al salir de la bandeja se cruza el borde de abajo: eso no debe mover la cámara.
    const fuera = (this.held.fromTray || this.held.desdeLista) && !this.held.alzado;
    if (fuera && p.y < v.y + v.h - EDGE) this.held.alzado = true;
    const dy = p.y < v.y + EDGE ? 1 : p.y > v.y + v.h - EDGE && !fuera ? -1 : 0;
    if (!dx && !dy) return;
    const step = EDGE_SPEED * dt * this.cam.zoom;
    this.cam.pan(dx * step, dy * step);
    this.followPointer();
  }

  drawOrder() {
    // Ordenar cuesta: mientras nada cambie, vale el último orden.
    const firma = this.cine ? null : this.capas.firma();
    if (firma !== null && firma === this.firmaOrden) return this.orden;
    const list = [];
    for (const it of this.items) {
      if (it.wall?.alta && !it.hidden && it !== this.held && wallVisible(it.wall)) list.push(this.colgadoAlto(it));
      if (it.wall || it.hidden || it === this.held || it.def.alfombra) continue;
      const mueble = this.muebleDe(it);
      list.push({ item: it, uid: it.uid, parent: it.parent, detras: tapadoPorMueble(it, mueble), ...this.luzDe(it), x: it.x, y: it.y, z: it.z, w: it.w, d: it.d, h: Math.max(it.h, this.g.catalog.image(it).height - (it.w + it.d) / 2), draw: (ctx) => this.dentroDe(ctx, it, mueble, () => { this.drawTopShadow(ctx, it); this.drawItem(ctx, it); luzEnObjeto(ctx, it, this.g.catalog, this.time); }) });
    }
    for (const b of this.boxes) list.push({ box: b, vivo: b.open && !b.empty, x: b.x, y: b.y, z: b.z, w: b.w, d: b.d, h: b.h, draw: (ctx) => b.draw(ctx, this.g.images, this.time) });
    for (const c of this.cars) list.push({ x: c.x, y: c.y, z: 0, w: c.w, d: c.d, h: c.h, draw: (ctx) => this.drawCar(ctx, c) });
    // En los peldaños se ordena como si estuviera al pie: delante de ellos o tapada por su espalda.
    for (const a of this.actors) list.push({ ...a.caja, actor: a, vivo: true, ...(a.enEscalera ? { x: 836 - a.caja.w } : null), draw: (ctx) => a.draw(ctx, this.time) });
    const vista = this.g.vistas.vistas[viewIndex()];
    const { muros, murosCerrado } = this.g.images;
    (this.cerrado ? vista.cerrado : vista.muros).forEach((m, i) => {
      const img = (this.cerrado ? murosCerrado : muros)[viewIndex()][i];
      list.push({ x: m.x, y: m.y, z: 0, w: m.w, d: m.d, h: m.h, draw: (ctx) => ctx.drawImage(img, m.px, m.py) });
    });
    const mon = this.g.data.room.monton;
    list.push({ ...mon, z: 0, draw: (ctx) => this.drawMonton(ctx, mon) });
    list.push(...this.extras());
    const nar = this.g.data.room.props[0];
    list.push({ x: nar.rect[0] - 14, y: nar.rect[1] - 14, z: 0, w: 48, d: 48, h: 85, draw: (ctx) => this.drawNaranjo(ctx) });
    this.firmaOrden = firma;
    this.orden = sortDepth(list);
    return this.orden;
  }

  // Cómo pinta lo encendido: si cambia con el tiempo (`vivo`) o solo alumbra (`luce`), y hasta dónde
  // llega fuera de su dibujo. Con las capas, cada cosa va a su sitio.
  luzDe(it) {
    if (!it.encendido) return { vivo: it.red };
    const d = it.def.enciende;
    const vivo = it.red || !!(d.pantalla || d.cara || d.aspas || d.humo || d.parpadea);
    const humo = d.humo ? 34 * (d.humo.r ?? 1) : 0;
    return { vivo, luce: !vivo, halo: Math.ceil(Math.max(6, d.luz?.r ?? 0, d.parpadea ? d.luz.suelo : 0, humo)) + 2, sube: d.humo ? 80 * (d.humo.r ?? 1) : 0 };
  }

  // Las paredes del cuartillo se pintan en orden, con todo lo demás: lo colgado va pegado a ellas.
  colgadoAlto(it) {
    const norte = it.wall.side === 'n';
    return {
      item: it, uid: it.uid, z: it.z, h: it.paredH,
      x: norte ? it.u : it.wall.at - 1, y: norte ? it.wall.at : it.u,
      w: norte ? it.paredW : 1, d: norte ? 1 : it.paredW,
      draw: (ctx) => this.drawItem(ctx, it),
    };
  }

  // Lo que proyecta sombra sobre el suelo. Lo que va en la mano la deja en su destino.
  shadowList() {
    const list = [];
    for (const it of this.items) {
      if (it.wall || it.hidden || it === this.held) continue;
      if ((it.z === 0 || it.anim) && !it.def.alfombra) list.push(it);
    }
    for (const b of this.boxes) if (!b.z) list.push(b);
    for (const c of this.cars) list.push(c);
    for (const a of this.actors) if (!a.enEscalera) list.push({ x: a.x - 2, y: a.y - 2, w: 20, d: 20, redonda: true });
    list.push(this.g.data.room.monton);
    list.push({ x: 2, y: 512, w: 44, d: 44 });      // la copa del naranjo
    return list;
  }

  muebleDe(it) { return it.parent == null ? null : this.items.find((o) => o.uid === it.parent); }

  // Pinta lo que va sobre un mueble: en un hueco, solo por su boca; lo que tenga delante, encima.
  dentroDe(ctx, it, mueble, pintar) {
    const boca = bocaDe(it, mueble);
    if (boca) {
      ctx.save();
      this.pathQuad(ctx, boca);
      ctx.clip();
      pintar();
      ctx.restore();
    } else pintar();
    const tapa = tapaDe(it, mueble, this.g.catalog);
    if (tapa) {
      ctx.save();
      this.pathQuad(ctx, tapa);
      ctx.clip();
      this.drawItem(ctx, mueble);
      ctx.restore();
    }
  }

  drawTopShadow(ctx, it) {
    if (it.z === 0 || it.anim || it.flat || it.variante) return;
    const mueble = this.muebleDe(it);
    const r = mueble && planoDe(it, mueble)?.rect;
    sombraEncima(ctx, it, r ? { x: r.x, y: r.y, w: r.w, d: r.h } : mueble);
  }

  // Lo que no es colocable pero forma parte de la historia.
  extras() {
    const out = [];
    const pc = this.pcAlberto;
    if (pc) out.push({ ...pc, z: 0, vivo: true, draw: (ctx) => this.drawPC(ctx, pc) });
    if (this.cerrado) {
      if (this.puertaAbierta) out.push({ x: 640, y: 248, z: 0, w: 56, d: 46, h: 72, draw: (ctx) => this.drawPuertaAbierta(ctx) });
      // El candado va por fuera: desde dentro la puerta es la del muro cortado.
      else if (viewIndex() < 2) out.push({ x: 640, y: 248, z: 0, w: 56, d: 1, h: 72, draw: (ctx) => this.drawCandado(ctx) });
      const { n } = this.ch;
      for (const d of this.g.data.room.destrozos) if (n >= d.desde && n < (d.hasta ?? Infinity)) out.push({ ...d, z: 0, draw: (ctx) => this.drawDestrozo(ctx, d) });
    }
    const m = this.manolo;
    if (m?.conCaja && this.actors.includes(m)) out.push({ x: m.x, y: m.y, z: 48, w: m.w, d: m.d, h: 10, draw: (ctx) => this.drawCajaManolo(ctx, m) });
    // Hasta que se lo da a María, el papelito va en su mano.
    if (this.ch.notaManolo && this.actors.includes(m) && !this.entrega?.t) out.push({ x: m.x, y: m.y, z: 22, w: m.w, d: m.d, h: 4, draw: (ctx) => { const s = toScreen(m.x + 8, m.y + 8, 17); this.drawPapelito(ctx, s.x + 11, s.y, 1); } });
    return out;
  }

  drawPC(ctx, pc) {
    const v = viewIndex();
    const img = this.g.catalog.images.get(`escritorio_${v}`);
    const t = spriteTopLeft(pc.x, pc.y, 0, pc.w, pc.d, img.height);
    ctx.drawImage(img, t.x, t.y);
    if (v >= 2) return;      // de espaldas, el monitor no se ve
    // La pantalla parpadea: alguien está jugando al Guild Wars. Es la cara del monitor del modelo.
    const fase = Math.floor(this.time / 300) % 3;
    const p = (x, z) => toScreen(pc.x + x, pc.y + 20.3, z);
    const cara = (x0, x1, z0, z1, color) => {
      ctx.fillStyle = color;
      this.pathQuad(ctx, [p(x0, z1), p(x1, z1), p(x1, z0), p(x0, z0)]);
      ctx.fill();
    };
    cara(19.5, 38.5, 46, 61, PAL.tinta);
    cara(20.5, 37.5, 47, 60, ['#C0392B', '#3E7A48', '#D98A4B'][fase]);
    cara(23 + fase * 3, 28 + fase * 3, 50, 54, PAL.papel);
  }

  drawCajaManolo(ctx, m) {
    const s = toScreen(m.x + m.w / 2, m.y + m.d / 2, 6);
    ctx.drawImage(this.g.images.cajaCerrada, Math.round(s.x) - 18, Math.round(s.y) - 34, 36, 39);
  }

  // Un papel doblado, con dos renglones: a escala 2 se lee desde lejos.
  drawPapelito(ctx, x, y, k) {
    const w = 10 * k, h = 8 * k;
    const l = Math.round(x - w / 2), t = Math.round(y - h / 2);
    ctx.fillStyle = PAL.tinta; ctx.fillRect(l - 1, t - 1, w + 2, h + 2);
    ctx.fillStyle = PAL.papel_cuadros; ctx.fillRect(l, t, w, h);
    ctx.fillStyle = PAL.cuadros;
    ctx.fillRect(l + k, t + 2 * k, w - 2 * k, 1);
    ctx.fillRect(l + k, t + 5 * k, w - 3 * k, 1);
  }

  // Manolo alarga la mano y el papel pasa a la de María, por encima de todo.
  drawEntrega(ctx) {
    const e = this.entrega, m = this.manolo, a = this.maria;
    if (e.fase !== 'ofrece' && e.fase !== 'pasa') return;
    const de = toScreen(m.x + 8, m.y + 8, 36), a2 = toScreen(a.x, a.y, 40);
    const mano = { x: de.x + (a2.x - de.x) * 0.3, y: de.y + (a2.y - de.y) * 0.3 };
    const u = e.fase === 'pasa' ? Math.min(1, e.t / NOTA_PASA) : 0;
    const sube = e.fase === 'ofrece' ? Math.abs(Math.sin(e.t / 160)) * 3 : Math.sin(u * Math.PI) * 14;
    this.drawPapelito(ctx, mano.x + (a2.x - mano.x) * u, mano.y + (a2.y - mano.y) * u - sube, 2);
  }

  draw(ctx) {
    const { W, H } = this.g;
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.beginPath();
    if (this.cine) ctx.rect(0, 0, W, H);
    else ctx.rect(0, BAND_TOP, W, H - BAND_TOP - BAND_BOTTOM);
    ctx.clip();
    this.cam.apply(ctx);
    if (this.shake) ctx.translate(this.shake.x / this.cam.zoom, this.shake.y / this.cam.zoom);
    this.drawBoard(ctx);
    // La luz del capítulo cae solo sobre lo ya pintado: la maqueta, no el cartón.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-atop';
    const luz = LUZ[this.luz];
    if (luz) { ctx.globalAlpha = luz[1]; ctx.fillStyle = luz[0]; ctx.fillRect(0, 0, W, H); }
    // Conforme el Buitre gasta, el sótano se calienta.
    ctx.globalAlpha = (this.ch.n ?? 1) * 0.005;
    ctx.fillStyle = PAL.calido;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
    // El cartón va por detrás de todo lo pintado.
    ctx.globalCompositeOperation = 'destination-over';
    this.cam.apply(ctx);
    if (this.shake) ctx.translate(this.shake.x / this.cam.zoom, this.shake.y / this.cam.zoom);
    this.capas.pintaCarton(ctx);
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.trama.draw(ctx, 0, BAND_TOP, W, H - BAND_TOP - BAND_BOTTOM);
    if (this.cine) return;
    this.drawZoneBanner(ctx);
    this.drawBands(ctx);
    this.drawTray(ctx);
    this.drawSpeech(ctx);
    this.tutorial?.draw(ctx);
  }

  // Fondo: el interior de la caja de cartón sobre la que se apoya la maqueta.
  // Se pinta con destination-over: lo primero que se dibuja aquí queda arriba.
  drawCarton(ctx) {
    const { wx, wy } = this.g.vistas;
    const M = 150, Z = -18;
    const fondo = floorQuad(-M, -M, wx + 2 * M, wy + 2 * M, Z);
    // El pliegue entre el fondo de la caja y sus paredes.
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#1C120B';
    this.pathQuad(ctx, fondo);
    ctx.stroke();
    ctx.lineWidth = 1;
    // Fuera del fondo están las paredes de la caja, más oscuras.
    ctx.fillStyle = 'rgba(16,10,6,0.42)';
    ctx.beginPath();
    ctx.rect(-1500, -1500, BOARD.w + 3000, BOARD.h + 3000);
    this.pathQuad(ctx, fondo, true);
    ctx.fill('evenodd');
    // Dos tiras de cinta cruzan el fondo de la caja, por debajo de la maqueta.
    for (const q of [floorQuad(-M, wy / 2 - 22, wx + 2 * M, 44, Z), floorQuad(wx / 2 - 22, -M, 44, wy + 2 * M, Z)]) {
      ctx.fillStyle = 'rgba(124,94,62,0.75)';
      this.pathQuad(ctx, q);
      ctx.fill();
    }
    this.cartonPat ??= ctx.createPattern(this.g.images.carton, 'repeat');
    ctx.fillStyle = this.cartonPat;
    ctx.fillRect(-1500, -1500, BOARD.w + 3000, BOARD.h + 3000);
  }

  pathQuad(ctx, q, seguir = false) {
    if (!seguir) ctx.beginPath();
    q.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
  }

  // Marca suave, sin hormigas: para lo que orienta, no para lo que avisa.
  softQuad(ctx, q, color, fill) {
    ctx.globalAlpha = fill;
    ctx.fillStyle = color;
    fillQuad(ctx, q);
    ctx.globalAlpha = Math.min(1, fill * 3);
    const t = Math.max(1, Math.round(1 / this.cam.zoom));
    const pts = q.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) }));
    pts.forEach((a, i) => {
      const b = pts[(i + 1) % pts.length];
      const n = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y), 1);
      for (let s = 0; s <= n; s += 2) ctx.fillRect(Math.round(a.x + (b.x - a.x) * s / n), Math.round(a.y + (b.y - a.y) * s / n), t, t);
    });
    ctx.globalAlpha = 1;
  }

  // Sitios donde puede ir lo que está en la mano. Lo de encima de muebles se pinta aparte,
  // por encima de ellos; el suelo y las paredes, debajo.
  guideQuads(it) {
    const view = viewIndex();
    const zoom = this.cam.zoom;
    if (this.guides?.it === it && this.guides.view === view && this.guides.total === this.items.length && this.guides.zoom === zoom) return this.guides;
    const { candidates } = sitesFor(it, this.room, this.items, this.g.catalog, { allowFree: this.mode !== 'recoger' });
    const abajo = [], encima = [];
    for (const s of candidates) {
      if (s.ciego) continue;
      const r = s.rect;
      if (s.kind === 'wall') {
        if (!wallVisible(s.wall)) continue;
        const p = (u, z) => (s.wall.side === 'n' ? toScreen(u, s.wall.at, z) : toScreen(s.wall.at, u, z));
        abajo.push([p(r.x, r.y), p(r.x + r.w, r.y), p(r.x + r.w, r.y + r.h), p(r.x, r.y + r.h)]);
      } else if (s.parent != null) encima.push(floorQuad(r.x, r.y, r.w, r.h, s.z));
      else abajo.push(floorQuad(r.x, r.y, r.w, r.h, s.z ?? 0));
    }
    // Se pintan una vez en su capa: rellenar columna a columna en cada fotograma sale caro.
    this.capasGuia ??= [makeCanvas(BOARD.w, BOARD.h), makeCanvas(BOARD.w, BOARD.h)];
    const pintar = ([c, g], lista, opacidad) => {
      g.clearRect(0, 0, c.width, c.height);
      for (const q of lista) this.softQuad(g, q, MARK_OK, opacidad);
      return c;
    };
    this.guides = {
      it, view, zoom, total: this.items.length,
      abajo: pintar(this.capasGuia[0], abajo, 0.13),
      encima: pintar(this.capasGuia[1], encima, 0.22),
    };
    return this.guides;
  }

  // `directo`: sin capas, pieza a pieza. La foto se saca así.
  drawBoard(ctx, directo = false) {
    if (!directo && this.capas.listas()) this.capas.pinta(ctx);
    else {
      this.drawSuelo(ctx);
      this.drawSobreSuelo(ctx);
      for (const e of this.piezas()) e.draw(ctx);
    }
    // Lo pendiente y lo que está en rojo se ve siempre, aunque quede detrás de algo.
    for (const it of this.items) {
      if (it.hidden || it === this.held || it.wall) continue;
      if (this.isPending(it)) this.drawPulse(ctx, it);
      else if (it.red) this.drawItem(ctx, it);
    }
    if (this.entrega) this.drawEntrega(ctx);
    if (this.rafiNote) this.drawRafiNote(ctx);
    if (this.recoger?.size && this.boxes[0]) this.drawFlechaCaja(ctx, this.boxes[0]);
    if (this.held) this.drawHeld(ctx);
  }

  // Lo que hay debajo de todo y no se anima: va entero a la capa del suelo.
  drawSuelo(ctx) {
    ctx.drawImage(this.g.images.tableros[viewIndex()], 0, 0);
    // Con la puerta abierta entra luz: es el único momento en que se ve lo que hay dentro.
    if (this.cerrado && !this.puertaAbierta) ctx.drawImage(this.g.images.cuartillo[viewIndex()], 0, 0);
    // Las alfombras, tumbadas: debajo de todo, también de las sombras.
    for (const it of this.items) if (it.def.alfombra && !it.hidden && it !== this.held) this.drawItem(ctx, it);
    this.sombras.draw(ctx, this.shadowList());
  }

  // Las manchas de luz y las guías: entre el suelo y lo que hay encima.
  drawSobreSuelo(ctx) {
    for (const it of this.items) if (it.encendido && it.placed && !it.hidden && it !== this.held) luzEnSuelo(ctx, it, this.time);
    if (this.held) ctx.drawImage(this.guideQuads(this.held).abajo, 0, 0);
  }

  // Todo lo que va sobre el suelo, de atrás adelante.
  piezas() {
    return [
      ...this.items.filter((i) => i.wall && !i.wall.alta && !i.hidden && wallVisible(i.wall)).map((it) => this.colgadoAlto(it)),
      ...this.drawOrder(),
    ];
  }

  // Una flecha que bota sobre la caja de María: ahí va todo lo que se recoge.
  drawFlechaCaja(ctx, box) {
    const r = box.rect(this.g.images);
    const k = Math.max(2, Math.round(2 / this.cam.zoom));
    const cx = Math.round(r.x + r.w / 2);
    const y = Math.round(r.y - 8 * k - (Math.floor(this.time / 300) % 2) * 4 * k);
    for (let i = 7; i >= 0; i--) {
      ctx.fillStyle = PAL.tinta;
      ctx.fillRect(cx - (i + 2) * k, y - i * 2 * k - k, (i * 2 + 4) * k, 3 * k);
    }
    for (let i = 6; i >= 0; i--) {
      ctx.fillStyle = UI.acento;
      ctx.fillRect(cx - (i + 1) * k, y - i * 2 * k - 2 * k, (i * 2 + 2) * k, 2 * k);
    }
  }

  // Lo que el Alberto va rompiendo. Decorado: no se coge ni estorba.
  drawDestrozo(ctx, d) {
    const img = this.g.images[`destrozo_${d.img}_${viewIndex()}`];
    const t = spriteTopLeft(d.x, d.y, 0, d.w, d.d, img.height);
    ctx.drawImage(img, t.x, t.y);
  }

  // La puerta del cuartillo abierta: hueco a oscuras y la hoja vuelta hacia el garaje.
  drawPuertaAbierta(ctx) {
    const y = 248, x0 = 644, x1 = 692, alto = 70, hoja = 42;
    const quad = (pts, color) => { ctx.fillStyle = color; this.pathQuad(ctx, pts.map(([a, b, c]) => toScreen(a, b, c))); ctx.fill(); };
    // Con la pared cortada por la vista, la puerta se corta con ella: hueco y hoja a la altura del muro.
    if (viewIndex() >= 2) {
      const b = 24;
      quad([[x0, 240, 0], [x1, 240, 0], [x1, 240, b], [x0, 240, b]], '#17120F');
      quad([[x0, 240, b], [x1, 240, b], [x1, 248, b], [x0, 248, b]], '#17120F');
      quad([[x0, y, 0], [x0, y + hoja, 0], [x0, y + hoja, b], [x0, y, b]], '#6E3430');
      quad([[x0 - 2, y, b], [x0, y, b], [x0, y + hoja, b], [x0 - 2, y + hoja, b]], '#8A4A42');
      return;
    }
    quad([[x0, y, 0], [x1, y, 0], [x1, y, alto], [x0, y, alto]], '#17120F');
    quad([[x0 - 4, y, 0], [x0, y, 0], [x0, y, alto + 4], [x0 - 4, y, alto + 4]], '#CFC8BA');
    quad([[x1, y, 0], [x1 + 4, y, 0], [x1 + 4, y, alto + 4], [x1, y, alto + 4]], '#CFC8BA');
    quad([[x0 - 4, y, alto], [x1 + 4, y, alto], [x1 + 4, y, alto + 4], [x0 - 4, y, alto + 4]], '#CFC8BA');
    quad([[x0, y, 0], [x0, y + hoja, 0], [x0, y + hoja, alto], [x0, y, alto]], '#6E3430');
    for (const [z0, z1] of [[6, 30], [38, 64]]) quad([[x0, y + 6, z0], [x0, y + hoja - 6, z0], [x0, y + hoja - 6, z1], [x0, y + 6, z1]], '#57282A');
  }

  drawCandado(ctx) {
    const img = this.g.images.candado;
    const a = toScreen(640, 248), b = toScreen(696, 248);
    const left = Math.min(a.x, b.x), top = Math.min(a.y, b.y) - 72;
    // El sprite va cizallado como en la primera vista; en las otras se cizalla al otro lado, sin espejo.
    if ((b.y - a.y) / (b.x - a.x) < 0) { ctx.drawImage(img, left, top); return; }
    ctx.save();
    ctx.transform(1, 1, 0, 1, left, top - img.width / 2);
    ctx.drawImage(img, 0, 0);
    ctx.restore();
  }

  drawRafiNote(ctx) {
    const s = toScreen(868, 496, 95);
    const up = Math.floor(this.time / 500) % 2;
    ctx.fillStyle = PAL.tinta; ctx.fillRect(s.x - 9, s.y - 7 - up, 18, 14);
    ctx.fillStyle = PAL.papel_cuadros; ctx.fillRect(s.x - 8, s.y - 6 - up, 16, 12);
    ctx.fillStyle = PAL.cuadros; ctx.fillRect(s.x - 8, s.y - 2 - up, 16, 1); ctx.fillRect(s.x - 2, s.y - 6 - up, 1, 12);
  }

  drawCar(ctx, c) {
    // El sprite de frente lleva el morro abajo-izquierda: el orden no es el de los muebles.
    const img = c.imgs[(c.rot + viewIndex()) % 4];
    const t = spriteTopLeft(c.x, c.y, 0, c.w, c.d, img.height);
    ctx.drawImage(img, t.x, t.y);
  }

  // El montón de garrafas de las cacharras. No es colocable: es parte del sitio.
  drawMonton(ctx, m) {
    const n = this.ch.n;
    const img = this.g.images[`monton${n <= 2 ? 1 : n <= 5 ? 2 : n <= 9 ? 3 : 4}_${viewIndex()}`];
    const t = spriteTopLeft(m.x, m.y, 0, m.w, m.d, img.height);
    ctx.drawImage(img, t.x, t.y);
  }

  drawNaranjo(ctx) {
    const { naranjo } = this.g.images;
    const [ax, ay] = this.g.data.room.naranjoAncla ?? [naranjo.width / 2, naranjo.height];
    const s = toScreen(24, 536);
    ctx.drawImage(naranjo, Math.round(s.x - ax), Math.round(s.y - ay));
  }

  sprite(ctx, it, x, y, color) {
    const img = this.g.catalog.image(it);
    if (it.mirror) {
      ctx.save();
      ctx.translate(x + img.width, y);
      ctx.scale(-1, 1);
      if (color) drawOutlined(ctx, img, 0, 0, color); else ctx.drawImage(img, 0, 0);
      ctx.restore();
    } else if (color) drawOutlined(ctx, img, x, y, color);
    else ctx.drawImage(img, x, y);
  }

  // Contorno que late: los objetos que hay que recoger.
  drawPulse(ctx, it) {
    const img = this.g.catalog.image(it);
    const t = spriteTopLeft(it.x, it.y, it.z, it.w, it.d, img.height);
    const fase = Math.floor(this.time / 400) % 2 === 0;
    this.sprite(ctx, it, t.x, t.y, fase ? PAL.papel : UI.acento);
  }

  drawItem(ctx, it) {
    const blink = it.red && Math.floor(this.time / BLINK_MS) % 2 === 0;
    const color = it.flash > 0 ? '#FFFFFF' : blink ? PAL.rojo_aviso : null;
    const img = this.g.catalog.image(it);
    if (it.wall) {
      const base = it.esquinaPared(it.z + it.paredH);
      ctx.save();
      ctx.transform(1, it.slope, 0, 1, base.x, base.y);
      if (it.tilt) { ctx.translate(it.paredW / 2, it.paredH / 2); ctx.rotate(it.tilt * 0.07); ctx.translate(-it.paredW / 2, -it.paredH / 2); }
      const alfa = ctx.globalAlpha;
      ctx.globalAlpha = alfa * 0.3;
      ctx.drawImage(this.g.catalog.silueta(img), 1, 2);
      ctx.globalAlpha = alfa;
      if (color) drawOutlined(ctx, img, 0, 0, color); else ctx.drawImage(img, 0, 0);
      if (it.encendido && it.def.enciende?.capa) ctx.drawImage(this.g.catalog.images.get(`${it.def.id}_on`), 0, 0);
      ctx.restore();
      return;
    }
    const t = spriteTopLeft(it.x, it.y, it.z, it.w, it.d, img.height);
    if (it.asienta > 0 && !it.anim) {
      // Recién colocado: se aplasta un poco sobre su base y recupera la forma.
      const u = Math.sin((1 - it.asienta / ASIENTA) * Math.PI);
      const bx = t.x + img.width / 2, by = t.y + img.height;
      ctx.save();
      ctx.translate(bx, by); ctx.scale(1 + u * 0.05, 1 - u * 0.08); ctx.translate(-bx, -by);
      this.sprite(ctx, it, t.x, t.y, color);
      ctx.restore();
      return;
    }
    if (it.spin) {
      // Lo que se tambalea o se cae gira sobre su base.
      const bx = t.x + img.width / 2, by = t.y + img.height;
      ctx.save();
      ctx.translate(bx, by); ctx.rotate(it.spin); ctx.translate(-bx, -by);
      this.sprite(ctx, it, t.x, t.y, color);
      ctx.restore();
      return;
    }
    this.sprite(ctx, it, t.x, t.y, color);
  }

  // Mientras se arrastra: el objeto flota, y debajo se ve exactamente dónde va a quedar.
  drawHeld(ctx) {
    const it = this.held;
    const img = this.g.catalog.image(it);
    const target = this.dropTarget();
    const dest = this.heldDest(it, target);
    const ok = target.kind !== 'fall' && (target.kind !== 'tray' || target.quitar) && !target.muro;
    const color = ok ? MARK_OK : PAL.rojo_aviso;
    if (dest.ghost) {
      ctx.globalAlpha = ok ? 0.6 : 0.45;
      const copia = Object.assign(Object.create(it), { red: false, flash: 0, ...dest.ghost });
      this.dentroDe(ctx, copia, this.muebleDe(copia), () => this.drawItem(ctx, copia));
      ctx.globalAlpha = 1;
    }
    ctx.drawImage(this.guideQuads(it).encima, 0, 0);
    if (dest.surface) this.markQuad(ctx, floorQuad(dest.surface.rect.x, dest.surface.rect.y, dest.surface.rect.w, dest.surface.rect.h, dest.surface.z), UI.papel, 0.12);
    this.markQuad(ctx, dest.quad, color, 0.3);

    const zoom = this.cam.zoom;
    const x = Math.round(this.heldAt.x - img.width / 2);
    const y = Math.round(this.heldAt.y - img.height - HOVER / zoom);
    const c = quadCenter(dest.quad);
    this.markLine(ctx, { x: this.heldAt.x, y: y + img.height }, c, color);
    this.sprite(ctx, it, x, y);
  }

  // Huella en pantalla del sitio de destino y copia translúcida del objeto, si procede.
  heldDest(it, target) {
    const prev = it.prev;
    if (target.muro) {
      const r = this.rawFoot(it, this.heldAt);
      return { quad: floorQuad(r.x, r.y, r.w, r.h, 0) };
    }
    if (target.kind === 'tray') {
      const f = onFloor(this.heldAt.x, this.heldAt.y, 0);
      return { quad: floorQuad(f.x - it.w / 2, f.y - it.d / 2, it.w, it.d, 0) };
    }
    if (target.kind === 'box') {
      const b = target.box;
      return { quad: floorQuad(b.x, b.y, b.w, b.d, 0) };
    }
    if (target.kind === 'manolo') {
      const m = this.manolo;
      return { quad: floorQuad(m.x - 14, m.y - 14, 44, 44, 0) };
    }
    const spot = target.kind === 'fit' ? target.fit : target.kind === 'fall' ? target.spot : prev;
    const ghost = { wall: spot.wall ?? null, u: spot.u, x: spot.x ?? it.x, y: spot.y ?? it.y, z: spot.z, surf: target.fit?.surface.id ?? null, rot: spot.rot ?? it.rot, parent: target.fit?.surface.parent ?? spot.parent ?? null, base: spot.base ?? 0 };
    const surface = target.fit?.surface.kind === 'top' ? target.fit.surface : null;
    if (spot.wall) {
      const g = Object.assign(Object.create(it), ghost);
      const w = it.paredW, h = it.paredH, z = spot.z;
      return { ghost, quad: [g.wallPoint(spot.u, z), g.wallPoint(spot.u + w, z), g.wallPoint(spot.u + w, z + h), g.wallPoint(spot.u, z + h)] };
    }
    const huella = Object.assign(Object.create(it), ghost);
    return { ghost, surface, quad: floorQuad(spot.x, spot.y, huella.w, huella.d, spot.z) };
  }

  // Cuadrilátero relleno por columnas y contorno de hormigas: sin antialias, se lee sobre cualquier suelo.
  markQuad(ctx, q, color, fill) {
    const pts = q.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) }));
    const x0 = Math.min(...pts.map((p) => p.x)), x1 = Math.max(...pts.map((p) => p.x));
    ctx.globalAlpha = fill;
    ctx.fillStyle = color;
    for (let x = x0; x <= x1; x++) {
      let top = Infinity, bottom = -Infinity;
      pts.forEach((a, i) => {
        const b = pts[(i + 1) % pts.length];
        if (x < Math.min(a.x, b.x) || x > Math.max(a.x, b.x)) return;
        const ys = a.x === b.x ? [a.y, b.y] : [a.y + (b.y - a.y) * (x - a.x) / (b.x - a.x)];
        for (const y of ys) { top = Math.min(top, y); bottom = Math.max(bottom, y); }
      });
      if (top <= bottom) ctx.fillRect(x, Math.round(top), 1, Math.round(bottom - top) + 1);
    }
    ctx.globalAlpha = 1;
    pts.forEach((a, i) => this.markLine(ctx, a, pts[(i + 1) % pts.length], color));
  }

  // Línea de píxeles: fondo de tinta y trazos de color que avanzan.
  markLine(ctx, a, b, color) {
    const t = Math.max(1, Math.round(2 / this.cam.zoom));
    const steps = Math.max(1, Math.round(Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y))));
    const phase = Math.floor(this.time / 60);
    for (const ink of [true, false]) {
      ctx.fillStyle = ink ? PAL.tinta : color;
      for (let i = 0; i <= steps; i++) {
        if (!ink && (i + phase) % 8 >= 5) continue;
        const x = Math.round(a.x + (b.x - a.x) * i / steps), y = Math.round(a.y + (b.y - a.y) * i / steps);
        ctx.fillRect(x, y, t, t);
      }
    }
  }

  // La bandeja: cartón, con un hueco por tipo de objeto y un contador si hay varios iguales.
  drawTray(ctx) {
    if (!this.trayH) return;
    const r = this.trayRect;
    ctx.fillStyle = this.verGuardados ? PAL.tinta : PAL.carton_sombra;
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = PAL.tinta;
    ctx.fillRect(r.x, r.y, r.w, 2);
    // Una etiqueta encima: qué es esta franja y qué se hace con lo que hay en ella.
    const { W } = this.g;
    const quitando = this.held && !this.held.fromTray && this.mode !== 'recoger';
    const recoge = this.mode === 'recoger';
    const estrecho = W < 480;
    // En estrecho no caben las dos cosas juntas: se turnan.
    const turno = Math.floor(this.time / 3200) % 2;
    const enCaja = estrecho && turno ? `CAJA · ${this.guardados.length} · 2 TOQUES GIRA` : `CAJA · ${this.guardados.length} · ARRÁSTRALO ARRIBA`;
    const titulo = recoge ? (this.ch.recogida?.titulo ?? (W >= 520 ? 'RECOGE ESTO · LLÉVALO A LA CAJA DE MARÍA' : 'LLÉVALO A LA CAJA DE MARÍA'))
      : quitando ? 'SUELTA AQUÍ PARA QUITARLO'
        : this.verGuardados ? enCaja : estrecho ? 'ARRÁSTRALO · 2 TOQUES GIRA' : 'POR COLOCAR · ARRÁSTRALO';
    const pista = !estrecho && !recoge && !quitando ? ' · 2 TOQUES GIRA' : '';
    ctx.font = FONT.label;
    const ancho = Math.ceil(ctx.measureText(titulo + pista).width) + 12;
    ctx.fillStyle = PAL.tinta;
    ctx.fillRect(0, r.y - 20, Math.min(ancho, r.w), 20);
    drawText(ctx, titulo + pista, 6, r.y - 19, FONT.label, UI.papel);
    if (this.tabsH) {
      for (const t of this.pestanas()) {
        const activa = t.id === this.catCaja;
        ctx.fillStyle = activa ? UI.acento : PAL.carton;
        ctx.fillRect(t.x, t.y, t.w, t.h);
        drawText(ctx, t.texto, t.x + t.w / 2, t.y + 11, FONT.label, PAL.tinta, 'center');
      }
      // Si hay más pestañas de las que caben, se ve: el borde se apaga y sale una flecha.
      const ts = this.pestanas();
      const y0 = r.y + 4, alto = TABS_H - 6;
      const flecha = (x, dir) => {
        for (let i = 0; i < 4; i++) {
          ctx.globalAlpha = (i + 1) / 5;
          ctx.fillStyle = this.verGuardados ? PAL.tinta : PAL.carton_sombra;
          ctx.fillRect(dir > 0 ? x + i * 7 : x - (i + 1) * 7, y0, 7, alto);
        }
        ctx.globalAlpha = 1;
        const cx = dir > 0 ? W - 13 : 13, cy = y0 + alto / 2;
        ctx.fillStyle = UI.papel;
        for (let i = 0; i < 6; i++) ctx.fillRect(cx - dir * (3 - i), cy - (5 - i), 2, (5 - i) * 2);
      };
      if (ts.at(-1).x + ts.at(-1).w > W - 2) flecha(W - 28, 1);
      if (ts[0].x < 0) flecha(28, -1);
    }
    ctx.save();
    ctx.beginPath();
    ctx.rect(r.x, r.y + this.tabsH, r.w, r.h - this.tabsH);
    ctx.clip();
    const { catalog } = this.g;
    const slots = this.traySlots();
    for (const s of slots) {
      if (s.x + s.w < 0 || s.x > W) continue;
      ctx.fillStyle = PAL.carton;
      ctx.fillRect(s.x, s.y, s.w, s.h);
      const it = s.items[0];
      const img = catalog.image(it);
      const k = Math.min(2, (s.w - 8) / img.width, (s.h - 8) / img.height);
      const w = Math.round(img.width * k), h = Math.round(img.height * k);
      const bote = it.arrive > 0 ? Math.round(Math.sin((it.arrive / TRAY_ARRIVE) * Math.PI) * 6) : 0;
      const ox = Math.round(s.x + (s.w - w) / 2), oy = Math.round(s.y + (s.h - h) / 2) - bote;
      if (it.mirror) {
        ctx.save();
        ctx.translate(ox + w, oy);
        ctx.scale(-1, 1);
        ctx.drawImage(img, 0, 0, w, h);
        ctx.restore();
      } else ctx.drawImage(img, ox, oy, w, h);
      if (s.items.length > 1) {
        const texto = `×${s.items.length}`;
        ctx.font = FONT.label;
        const a = Math.ceil(ctx.measureText(texto).width) + 6;
        ctx.fillStyle = PAL.tinta;
        ctx.fillRect(s.x + s.w - a, s.y + s.h - 18, a, 18);
        drawText(ctx, texto, s.x + s.w - a + 2, s.y + s.h - 17, FONT.label, UI.papel);
      }
    }
    ctx.restore();
    // Si hay más de lo que cabe, una barrita dice cuánto y por dónde se va.
    const max = this.trayMaxScroll;
    if (max > 0) {
      const ancho = Math.max(40, Math.round(W * W / (W + max)));
      ctx.fillStyle = PAL.tinta;
      ctx.fillRect(0, r.y + r.h - 5, W, 5);
      ctx.fillStyle = UI.papel;
      ctx.fillRect(Math.round((W - ancho) * this.trayScroll / max), r.y + r.h - 4, ancho, 3);
    }
  }

  drawZoneBanner(ctx) {
    if (this.banner.t <= 0) return;
    const { W } = this.g;
    ctx.fillStyle = UI.banda;
    ctx.fillRect(0, BAND_TOP + 8, W, 24);
    drawText(ctx, this.banner.name.toUpperCase(), W / 2, BAND_TOP + 11, FONT.label, UI.papel, 'center');
  }

  drawSpeech(ctx) {
    if (!this.speech) return;
    const { W, H, images } = this.g;
    const s = this.speech;
    const lines = s.t ? wrap(ctx, s.t, W - 128, FONT.text) : [];
    const cabecera = s.nombre ? 24 : 0;
    const h = Math.max(s.t ? 84 : 40, lines.length * 30 + 24 + cabecera);
    // María habla arriba, para no tapar dónde se está colocando; Manolo, abajo.
    // Con algo en la mano, siempre abajo: arriba taparía la pared en la que se está colgando.
    const y = s.who === 'maria' && !this.held ? BAND_TOP + 8 : H - BAND_BOTTOM - this.trayH - h - 8;
    ctx.fillStyle = UI.sombra; ctx.fillRect(12, y + 4, W - 20, h);
    ctx.fillStyle = UI.papel; ctx.fillRect(8, y, W - 20, h);
    const cara = s.who === 'maria' ? images[`portrait${s.p}`] : images[`${s.who}Retrato`];
    if (s.t) ctx.drawImage(cara, 24, y + 10, 64, 64);
    const tx = s.t ? 108 : 24;
    if (s.nombre) {
      const pista = s.lee ? ' · TOCA PARA LEER' : '';
      drawText(ctx, `${s.nombre}${pista}`.toUpperCase(), tx, y + 9, FONT.label, s.lee ? PAL.tinta_azul : UI.apagado);
    }
    lines.forEach((l, i) => drawText(ctx, l, tx, y + 12 + cabecera + i * 30, FONT.text, PAL.tinta));
  }

  drawBands(ctx) {
    const { W, H } = this.g;
    ctx.fillStyle = UI.banda;
    ctx.fillRect(0, 0, W, BAND_TOP);
    ctx.fillRect(0, H - BAND_BOTTOM, W, BAND_BOTTOM);
    ctx.fillStyle = UI.acento;
    ctx.fillRect(0, BAND_TOP - 2, W, 2);
    ctx.fillRect(0, H - BAND_BOTTOM, W, 2);
    // Con pantalla estrecha, el título largo no cabe junto a los contadores.
    const titulo = `Cap. ${this.ch.n} · ${this.ch.title}`.toUpperCase();
    const quedan = this.mode === 'normal' ? this.quedan().total : 0;
    const contador = this.mode === 'recoger' ? `RECOGE ${this.pending}` : this.mode === 'normal' ? `QUEDAN ${quedan}` : '';
    ctx.font = FONT.label;
    const sitio = W - 66 - ctx.measureText(contador).width - 16;
    drawText(ctx, ctx.measureText(titulo).width > sitio ? `CAP. ${this.ch.n}` : titulo, 10, 7, FONT.label, UI.papel);
    if (this.mode === 'normal') {
      drawText(ctx, String(this.pending), W - 10, 7, FONT.label, UI.papel, 'right');
      ctx.fillStyle = PAL.carton; ctx.fillRect(W - 46, 8, 20, 16);
      ctx.fillStyle = PAL.cinta_marron; ctx.fillRect(W - 38, 8, 4, 16);
      if (contador) drawText(ctx, contador, W - 58, 7, FONT.label, UI.papel, 'right');
    } else if (contador) drawText(ctx, contador, W - 10, 7, FONT.label, UI.papel, 'right');

    const c = this.buttons.cuaderno;
    this.button(ctx, c, UI.sombra);
    const ix = c.x + (c.w - 28) / 2, iy = c.y + 10;
    ctx.fillStyle = PAL.tinta; ctx.fillRect(ix, iy, 28, 28);
    ctx.fillStyle = UI.papel; ctx.fillRect(ix + 2, iy + 2, 24, 24);
    ctx.fillStyle = PAL.tinta;
    for (const dy of [7, 13, 19]) ctx.fillRect(ix + 6, iy + dy, 16, 2);

    const gi = this.buttons.girar;
    this.button(ctx, gi, UI.sombra);
    drawText(ctx, 'GIRAR', gi.x + gi.w / 2, gi.y + 15, FONT.label, PAL.tinta, 'center');

    const a = this.buttons.ayuda;
    this.button(ctx, a, UI.sombra);
    drawText(ctx, '?', a.x + a.w / 2, a.y + 8, FONT.bold, PAL.tinta, 'center');

    if (this.seGuarda) {
      const b = this.buttons.guardados;
      this.button(ctx, b, this.verGuardados ? UI.acento : UI.sombra);
      // La caja y cuántas cosas hay dentro, con su nombre: sin intuir qué hace.
      const cuantos = String(this.guardados.length);
      ctx.font = FONT.label;
      const ic = Math.min(20, b.w - 18 - Math.ceil(ctx.measureText(cuantos).width));
      if (ic >= 10) {
        ctx.fillStyle = PAL.carton; ctx.fillRect(b.x + 6, b.y + 6, ic, 16);
        ctx.fillStyle = PAL.cinta_marron; ctx.fillRect(b.x + 6 + Math.round(ic / 2) - 2, b.y + 6, 4, 16);
      }
      drawText(ctx, cuantos, b.x + b.w - 6, b.y + 5, FONT.label, PAL.tinta, 'right');
      drawText(ctx, 'CAJA', b.x + b.w / 2, b.y + 26, FONT.label, PAL.tinta, 'center');
    }

    const l = this.buttons.listo;
    if (this.mode !== 'recoger') {
      // Con todo colocado, late: ya solo queda pulsarlo.
      const late = this.mode === 'normal' && !quedan && Math.floor(this.time / 500) % 2 === 0;
      this.button(ctx, l, late ? MARK_OK : UI.acento);
      drawText(ctx, this.mode === 'libre' ? 'Salir' : 'Listo', l.x + l.w / 2, l.w < 64 ? l.y + 12 : l.y + 8, l.w < 64 ? '17px "Pixelify Sans"' : FONT.bold, PAL.tinta, 'center');
    }
  }

  button(ctx, r, color) {
    ctx.fillStyle = PAL.tinta;
    ctx.fillRect(r.x, r.y + 3, r.w, r.h);
    ctx.fillStyle = color;
    ctx.fillRect(r.x, r.y, r.w, r.h);
  }
}
