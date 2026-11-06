// Tutorial del capítulo 1: cada paso espera a que se haga de verdad lo que pide.
import { PAL, UI, FONT, drawText, wrap, inside } from './gfx.js';
import { findFit } from './objects.js';
import { toScreen, spriteTopLeft, setView, viewIndex } from './iso.js';
import { store } from './save.js';

const SOFA = 'sofa_viejo';
const MANO = [
  '....##......',
  '...#oo#.....',
  '...#oo#.....',
  '...#oo#.....',
  '...#oo###...',
  '...#oo#oo###',
  '.###oo#oo#oo#',
  '#oo#oooooooo#',
  '#oooooooooo#.',
  '.#ooooooooo#.',
  '..#oooooooo#.',
  '...#ooooooo#.',
  '....#######..',
];

const STEPS = [
  { ev: 'opened', t: 'Toca la caja para abrirla.', at: 'box' },
  { ev: 'noteRead', t: 'Dentro hay una nota. Toca la caja otra vez para leerla.', at: 'box' },
  { ev: 'taken', t: 'Ahora toca la caja para sacar lo que hay dentro.', at: 'box' },
  { ev: 'placed', t: 'Arrastra el sofá desde la bandeja hasta el suelo. Con la huella en verde, suelta: se pega con un clic.', at: 'drag' },
  { ev: 'turned', t: 'Haz doble toque sobre el sofá para girarlo.', at: 'item' },
  { ev: 'held', t: 'Mantén el dedo sobre el sofá hasta cogerlo. Así se mueve lo ya colocado.', at: 'item' },
  { ev: 'panned', t: 'Arrastra el fondo con un dedo para mover la cámara.' },
  { ev: 'zoomed', t: 'Pellizca con dos dedos para acercar y alejar. (En el PC, con la rueda.)' },
  { ev: 'rotated', t: 'Pulsa Girar para ver el sótano desde otro lado. Los muebles se giran hasta ponerlos de espaldas.' },
  { ev: 'ok', t: 'Muebles al suelo, pósters a la pared y lo pequeño encima de otros muebles. Lo que no sepas dónde poner, a las cacharras.', at: 'cacharras' },
  { ev: 'ok', t: 'Cuando quieras acabar, pulsa Listo. Te preguntará si quieres continuar, y lo que no hayas colocado irá solo a la CAJA de guardados. Con el botón CAJA lo sacas cuando quieras.' },
  { ev: 'ok', t: 'Empieza por el arcón: está fuera, en la rampa.', at: 'arcon' },
];

export class Tutorial {
  constructor(basement) {
    this.b = basement;
    this.i = 0;
    this.seen = new Set();
    this.time = 0;
    // El tutorial sigue al sofá: abrir otra caja no adelanta ningún paso.
    this.boxId = basement.boxes.find((b) => b.items.some((e) => e.id === SOFA))?.id ?? null;
    const sofa = this.sofa;
    if (sofa || !this.boxId) for (const ev of ['opened', 'noteRead', 'taken']) this.seen.add(ev);
    // Al volver a una partida, lo ya hecho con la caja no se vuelve a pedir.
    const caja = basement.boxes.find((b) => b.id === this.boxId);
    if (caja?.open) this.seen.add('opened');
    if (caja && !caja.note) this.seen.add('noteRead');
    if (sofa?.placed) this.seen.add('placed');
    this.on('');
  }

  get sofa() { return this.b.items.find((i) => i.def.id === SOFA) ?? this.b.tray.find((i) => i.def.id === SOFA); }

  get step() { return STEPS[this.i]; }

  // `quien` es la caja o el objeto del evento; solo cuentan los del sofá.
  on(ev, quien, entry) {
    if (quien?.def && quien.def.id !== SOFA) return;
    if (quien?.items && quien.id !== this.boxId) return;
    if (entry && entry.id !== SOFA) return;
    this.seen.add(ev);
    const antes = this.i;
    while (this.step && this.step.ev !== 'ok' && this.seen.has(this.step.ev)) this.i++;
    if (!this.step) { this.finish(); return; }
    if (this.i !== antes) this.enfoca();
  }

  // Lo que se señala tiene que verse: la cámara va allí, desde la vista de siempre.
  enfoca() {
    const b = this.b, { at } = this.step;
    if (at === 'cacharras' || at === 'arcon') {
      if (viewIndex()) { b.trama.empezar(b.g.ctx.canvas); setView(0); }
      const p = this.target();
      if (p) { b.cam.stop(); b.cam.centerOn(p.x, p.y); }
    } else if (at === 'drag') {
      // Con la pantalla estrecha, el destino del sofá caería en el borde, que arrastra la cámara.
      const p = this.dropPoint();
      if (!p) return;
      const v = b.cam.view, a = b.cam.toBoard(v.x + 70, v.y + 70), c = b.cam.toBoard(v.x + v.w - 70, v.y + v.h - 70);
      if (p.x < a.x || p.x > c.x || p.y < a.y || p.y > c.y) { b.cam.stop(); b.cam.centerOn(p.x, p.y); }
    }
  }

  finish() {
    const { b } = this;
    b.tutorial = null;
    b.g.state.flags.tutorial = true;
    store(b.g.state);
    if (b.ch.manoloDice) b.say('manolo', b.ch.manoloDice, 'Manolo');
  }

  panel() {
    const { W, H } = this.b.g;
    // En apaisado va a un lado: la caja queda en el centro y debe verse y tocarse.
    const w = W > H ? Math.round(W * 0.42) : W - 16;
    const lines = wrap(this.b.g.ctx, this.step.t, w - 32, FONT.text);
    const h = 66 + lines.length * 30;
    // Por encima de la etiqueta de la bandeja: el arrastre de muestra sale de ahí y debe verse.
    // Al arrastrar va arriba: el camino de la mano queda libre.
    const arriba = W <= H && this.step.at === 'drag';
    const r = { x: 8, y: arriba ? 40 : Math.max(36, H - 64 - this.b.trayH - h - 32), w, h };
    const fila = { y: r.y + h - 48, w: Math.round(w / 2) - 4, h: 48 };
    return { r, lines, skip: { ...fila, x: r.x }, ok: { ...fila, x: r.x + w - fila.w } };
  }

  // Devuelve true si el toque era para el panel.
  tap(p) {
    const { r, skip, ok } = this.panel();
    if (inside(skip, p.x, p.y)) { this.finish(); return true; }
    if (this.step.ev === 'ok' && inside(ok, p.x, p.y)) {
      this.i++;
      this.on('');
      if (this.b.tutorial) this.enfoca();
      return true;
    }
    return inside(r, p.x, p.y);
  }

  update(dt) { this.time += dt; }

  target() {
    const b = this.b;
    if (this.step.at === 'cacharras') {
      const { x, y, w, d } = b.g.data.room.monton;
      return toScreen(x + w / 2, y + d / 2, 20);
    }
    if (this.step.at === 'arcon') {
      const it = b.items.find((i) => i.def.id === 'arcon');
      if (!it) return null;
      const img = b.g.catalog.image(it);
      const t = spriteTopLeft(it.x, it.y, it.z, it.w, it.d, img.height);
      return { x: t.x + img.width / 2, y: t.y + img.height / 2 };
    }
    if (this.step.at === 'box') {
      const box = b.boxes.find((o) => o.id === this.boxId);
      if (!box) return null;
      // Un punto de la caja que no tape otra: la mano debe señalar lo que se puede tocar.
      const r = box.rect(b.g.images);
      for (const fy of [0.5, 0.35, 0.65, 0.2, 0.8]) {
        for (const fx of [0.5, 0.35, 0.65, 0.2, 0.8]) {
          const p = { x: r.x + r.w * fx, y: r.y + r.h * fy };
          if (b.boxAt(p) === box) return p;
        }
      }
      return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
    }
    const it = this.sofa;
    if (!it) return null;
    if (b.tray.includes(it)) {
      const s = b.traySlots().find((o) => o.items.includes(it));
      return b.cam.toBoard(s.x + s.w / 2, s.y + s.h / 2);
    }
    const img = b.g.catalog.image(it);
    const t = spriteTopLeft(it.x, it.y, it.z, it.w, it.d, img.height);
    return { x: t.x + img.width / 2, y: t.y + img.height * 0.6 };
  }

  // Primer sitio válido del garaje a la vista, para enseñar el arrastre.
  dropPoint() {
    const b = this.b;
    const it = this.sofa;
    if (!it || it === b.held) return null;
    for (const [x, y] of [[660, 340], [620, 340], [700, 340], [580, 350], [540, 320]]) {
      const p = toScreen(x, y);
      if (findFit(it, p.x, p.y, b.room, b.items, b.g.catalog)) return p;
    }
    return null;
  }

  // Una mano señalando, con la punta del índice en (x, y). Por encima de todo, también del panel.
  hand(ctx, x, y) {
    const k = 2 / this.b.cam.zoom;
    const pulsa = Math.floor(this.time / 300) % 2;
    const l = Math.round(x - 5 * k), t = Math.round(y + pulsa * k);
    for (let f = 0; f < MANO.length; f++) {
      for (let c = 0; c < MANO[f].length; c++) {
        const v = MANO[f][c];
        if (v === '.') continue;
        ctx.fillStyle = v === '#' ? PAL.tinta : UI.papel;
        ctx.fillRect(l + c * k, t + f * k, k, k);
      }
    }
  }

  // Se pinta en coordenadas de tablero, con la cámara ya aplicada.
  drawWorld(ctx) {
    const at = this.step.at;
    if (!at || this.b.held) return;
    const a = this.target();
    if (!a) return;
    if (at === 'drag') {
      const to = this.dropPoint();
      if (to) {
        const k = (this.time % 1400) / 1100;
        const e = Math.min(1, k);
        ctx.strokeStyle = UI.papel;
        ctx.setLineDash([6, 6]);
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(to.x, to.y); ctx.stroke();
        ctx.setLineDash([]);
        this.hand(ctx, Math.round(a.x + (to.x - a.x) * e), Math.round(a.y + (to.y - a.y) * e));
        return;
      }
    }
    this.hand(ctx, Math.round(a.x), Math.round(a.y));
  }

  draw(ctx) {
    const { r, lines, skip, ok } = this.panel();
    ctx.fillStyle = PAL.tinta; ctx.fillRect(r.x + 3, r.y + 4, r.w, r.h);
    ctx.fillStyle = UI.papel; ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = UI.acento; ctx.fillRect(r.x, r.y, r.w, 4);
    lines.forEach((l, i) => drawText(ctx, l, r.x + 16, r.y + 14 + i * 30, FONT.text, PAL.tinta));
    drawText(ctx, 'Saltar', skip.x + skip.w / 2, skip.y + 16, FONT.label, UI.apagado, 'center');
    if (this.step.ev === 'ok') {
      ctx.fillStyle = UI.acento; ctx.fillRect(ok.x, ok.y + 4, ok.w - 8, ok.h - 12);
      drawText(ctx, 'Vale', ok.x + (ok.w - 8) / 2, ok.y + 16, FONT.label, PAL.tinta, 'center');
    } else {
      drawText(ctx, `${this.i + 1} / ${STEPS.length}`, ok.x + ok.w / 2, ok.y + 16, FONT.label, UI.apagado, 'center');
    }
    // La mano va la última: si el camino pasa por detrás del panel, ella sigue encima.
    ctx.save();
    this.b.cam.apply(ctx);
    this.drawWorld(ctx);
    ctx.restore();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
}
