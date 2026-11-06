// Pantallas fuera del sótano: inicio, llegada, final de capítulo, cólera, créditos.
import { hayFoto, descargarFoto } from './foto.js';
import { PAL, UI, FONT, drawText, inside, makeCanvas, wrap } from './gfx.js';
import { Actor, drawAnim, facingRow } from './characters.js';
import { toScreen } from './iso.js';
import { musica } from './musica.js';
import { Reading, paginasCuaderno } from './notes.js';
import { sfx } from './objects.js';
import { store, blank } from './save.js';
import { voz } from './voz.js';

function cover(ctx, img, W, H) {
  const k = Math.max(W / img.width, H / img.height);
  ctx.drawImage(img, Math.round((W - img.width * k) / 2), Math.round((H - img.height * k) / 2), Math.ceil(img.width * k), Math.ceil(img.height * k));
}

function button(ctx, r, label, color) {
  ctx.fillStyle = PAL.tinta; ctx.fillRect(r.x, r.y + 3, r.w, r.h);
  ctx.fillStyle = color; ctx.fillRect(r.x, r.y, r.w, r.h);
  drawText(ctx, label, r.x + r.w / 2, r.y + 8, FONT.bold, PAL.tinta, 'center');
}

function fachada(g) { return g.H > g.W ? g.images.fachadaV : g.images.fachadaH; }

export class Inicio {
  constructor(game) { this.g = game; this.time = 0; this.seguro = false; }
  update(dt) { this.time += dt; }

  continuar() {
    const { g } = this;
    if (g.state.pendienteCuaderno) {
      const ch = g.data.chapters.chapters.find((c) => c.end?.cuadernoNegro);
      g.go('final', { ch, end: { cuadernoNegro: true }, sinSitio: 0 });
    } else g.go('llegada');
  }

  options() {
    const { W, H, state } = this.g;
    const list = [];
    const add = (label, act) => list.push({ label, act });
    if (this.seguro) {
      add('Sí, borrar la partida', () => { this.g.state = blank(); store(this.g.state); this.g.go('cine', { src: 'intro', next: 'llegada' }); });
      add('No, dejarla', () => { this.seguro = false; });
    } else if (state.items.length || state.progreso || state.chapter > 1) {
      if (state.chapter <= this.g.capFinal) add(`Continuar · capítulo ${state.chapter}`, () => this.continuar());
      add('Empezar de nuevo', () => { this.seguro = true; });
    } else add('Tocar para empezar', () => this.g.go('cine', { src: 'intro', next: 'llegada' }));
    if (state.terminado && !this.seguro) add('Modo libre', () => this.g.go('libre'));
    if (state.terminado && !this.seguro && hayFoto()) add('Descargar la foto', () => descargarFoto());
    const paso = 56;
    const y0 = H - 12 - list.length * paso;
    return list.map((o, i) => ({ ...o, x: W / 2 - 150, y: y0 + i * paso, w: 300, h: 48 }));
  }

  // En apaisado el logo llega a la esquina de arriba.
  sitioMusica() { const { W, H } = this.g; return W > H ? { x: W - 56, y: H - 56, w: 48, h: 48 } : null; }

  tap(p) {
    const list = this.options();
    const hit = list.find((o) => inside(o, p.x, p.y)) ?? (list.length === 1 ? list[0] : null);
    if (hit) { sfx.carton(); hit.act(); }
  }

  draw(ctx) {
    const { W, H, images } = this.g;
    cover(ctx, fachada(this.g), W, H);
    const vertical = H > W;
    const logo = vertical ? images.titleV : images.titleH;
    // El logo se reduce si la pantalla es más estrecha; solo él pide suavizado.
    const k = Math.min(1, W / logo.width);
    const lw = Math.round(logo.width * k), lh = Math.round(logo.height * k);
    ctx.imageSmoothingEnabled = k < 1;
    ctx.imageSmoothingQuality = 'high';     // el lema tiene que leerse también en pequeño
    ctx.drawImage(logo, Math.round((W - lw) / 2), vertical ? 60 : 6, lw, lh);
    ctx.imageSmoothingEnabled = false;
    for (const o of this.options()) button(ctx, o, o.label, UI.papel);
  }
}

// Portada de capítulo: ilustración propia, número y título grandes y el encargo del Buitre.
const ROMANO = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII'];
// La cara de María en cada capítulo.
const CARA = ['', 'Normal', 'Surprised', 'Pain', 'Determined', 'Normal', 'Sad', 'Happy', 'Surprised', 'Angry', 'Determined', 'Pain', 'Inspired', 'Happy'];

// Sombra dura de un píxel grande, para que el título pese.
function titulo(ctx, s, x, y, font, color, align = 'left', sombra = 4) {
  drawText(ctx, s, x + sombra, y + sombra, font, PAL.tinta, align);
  drawText(ctx, s, x, y, font, color, align);
}

export class Llegada {
  constructor(game, ch) { this.g = game; this.ch = ch; this.time = 0; }

  update(dt) {
    this.time += dt;
    // El papel del encargo empieza a verse a los 520 ms: ahí lo lee Ismael.
    if (this.ch.encargo && !this.leido && this.time >= 520) {
      this.leido = true;
      voz.decir('buitre', this.ch.encargo);
    }
  }

  tap() { if (this.time > 700) this.g.go('sotano'); }

  // En apaisado la esquina de la derecha es del número; la de la izquierda, solo ilustración.
  // En un móvil muy bajo el número sube hasta arriba: el botón va a la franja de abajo.
  sitioMusica() {
    const { W, H } = this.g;
    if (W > H) return { x: 8, y: 8, w: 48, h: 48 };
    return H < 600 ? { x: W - 56, y: H - 56, w: 48, h: 48 } : null;
  }

  // En horizontal: la ilustración cede ancho y el título baja de tamaño hasta que quepa el encargo.
  medidasH(ctx, W, H) {
    const encargo = this.ch.encargo?.toLocaleUpperCase('es') ?? this.ch.mariaDice;
    const letra = this.ch.encargo ? FONT.hand : FONT.text;
    let mejor = null;
    for (const k of [0.46, 0.4, 0.34, 0.28, 0.22]) {
      const ancho = Math.round(Math.min(H, W * k));
      const pw = W - ancho - 44;
      const grande = pw >= 380;
      const arriba = grande ? 104 : 76;
      for (const [fuente, altoLinea, papelPad, papelLinea] of [[FONT.titulo, 58, 36, 34], [FONT.tituloS, 44, 36, 34], [FONT.tituloS, 44, 20, 30]]) {
        const papel = encargo ? papelPad + wrap(ctx, encargo, pw - 40, letra).length * papelLinea : 0;
        const sobra = H - 40 - (arriba + wrap(ctx, this.ch.title, pw, fuente).length * altoLinea + 34 + papel);
        if (!mejor || sobra > mejor.sobra) mejor = { ancho, grande, arriba, fuente, altoLinea, papelPad, papelLinea, sobra };
        if (sobra >= 0) return mejor;
      }
    }
    return mejor;
  }

  // Reparto de la portada en vertical, según lo que ocupe de verdad cada texto.
  medidas(ctx, W, H) {
    const margen = 24;
    const pw = W - margen * 2;
    const s = Math.min(W < 440 ? 160 : 240, Math.round(H * 0.26));
    const grande = W >= 440;
    const fecha = wrap(ctx, this.ch.when.toUpperCase(), W - margen - (margen + s + 20), FONT.label);
    const bajoArte = Math.max(Math.round(s * 0.28) + 18, 28 + fecha.length * 20 + 12);
    const encargo = this.ch.encargo?.toLocaleUpperCase('es') ?? this.ch.mariaDice;
    const papel = encargo ? 36 + wrap(ctx, encargo, pw - 40, this.ch.encargo ? FONT.hand : FONT.text).length * 34 + 16 : 0;
    const AVISO = 60;   // lo de abajo: «Tocar para entrar», sin pisar el papel
    const debajo = (fuente, lh) => bajoArte + wrap(ctx, this.ch.title, pw, fuente).length * lh + 34 + papel + AVISO;
    let fuente = FONT.titulo, altoLinea = 58;
    if (H - debajo(fuente, altoLinea) < H * 0.36 || W < 440) { fuente = FONT.tituloS; altoLinea = 44; }
    const lado = Math.min(W, H - debajo(fuente, altoLinea));
    return { s, lado, grande, fecha, bajoArte, fuente, altoLinea, fundido: grande ? 132 : 84, numeral: grande ? 122 : 74 };
  }

  // Fundido a tramos, sin suavizado, entre la ilustración y el panel.
  fundido(ctx, x, y, w, h, vertical) {
    const pasos = 8;
    ctx.fillStyle = UI.banda;
    for (let i = 0; i < pasos; i++) {
      ctx.globalAlpha = (i + 1) / (pasos + 1);
      if (vertical) ctx.fillRect(x, y + Math.round(i * h / pasos), w, Math.ceil(h / pasos));
      else ctx.fillRect(x + Math.round(i * w / pasos), y, Math.ceil(w / pasos), h);
    }
    ctx.globalAlpha = 1;
  }

  draw(ctx) {
    const { W, H, images } = this.g;
    const vertical = H > W;
    const ease = (ms, dur) => { const k = Math.min(1, Math.max(0, (this.time - ms) / dur)); return 1 - (1 - k) ** 3; };
    ctx.fillStyle = UI.banda;
    ctx.fillRect(0, 0, W, H);

    // Ilustración: se acerca un poco al entrar.
    const art = images[`capitulo${this.ch.n}`];
    // En vertical ocupa todo el ancho y se recorta por arriba y por abajo. Lo que haya debajo
    // manda: fecha, título y encargo tienen que caber enteros, y abajo queda sitio para el aviso.
    const c = vertical ? this.medidas(ctx, W, H) : null;
    const m = vertical ? null : this.medidasH(ctx, W, H);
    const lado = vertical ? c.lado : H;
    const ancho = vertical ? W : m.ancho;
    const zoom = 1 + (1 - ease(0, 900)) * 0.06;
    const dib = Math.round(Math.max(ancho, lado) * zoom);
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, ancho, lado); ctx.clip();
    ctx.drawImage(art, Math.round((ancho - dib) / 2), Math.round((lado - dib) / 2), dib, dib);
    ctx.restore();
    if (vertical) this.fundido(ctx, 0, lado - c.fundido, W, c.fundido, true);
    else this.fundido(ctx, ancho - 72, 0, 72, H, false);

    const margen = 24;
    const px = vertical ? margen : ancho + 20;
    const pw = W - px - margen;
    const entra = ease(150, 450);
    const dx = Math.round((1 - entra) * -46);

    // María manda: su retrato grande, solapado sobre la ilustración.
    const foto = images[`portrait${CARA[this.ch.n]}`];
    const s = vertical ? c.s : Math.min(Math.round(H * 0.42), ancho - 36);
    const fx = vertical ? margen : 20, fy = vertical ? lado - Math.round(s * 0.72) : H - s - 22;
    const e = ease(300, 380);
    const sube = Math.round((1 - e) * 26);
    ctx.globalAlpha = e;
    ctx.fillStyle = PAL.tinta; ctx.fillRect(fx - 2, fy - 2 + sube, s + 12, s + 12);
    ctx.fillStyle = UI.papel; ctx.fillRect(fx - 7, fy - 7 + sube, s + 14, s + 14);
    // El retrato no es de píxel entero a este tamaño: suavizado no se escalona.
    const nitido = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(foto, fx, fy + sube, s, s);
    ctx.imageSmoothingEnabled = nitido;
    ctx.globalAlpha = 1;

    // Número y título. El número va aparte, para que ningún título lo pise.
    let y;
    ctx.globalAlpha = entra;
    if (vertical) {
      // El numeral va en la parte que ya se funde con el panel, sobre el arte no se leería.
      const cx = fx + s + 20;
      titulo(ctx, ROMANO[this.ch.n], W - margen + dx, lado - c.numeral, c.grande ? FONT.romano : FONT.romanoS, UI.acento, 'right', c.grande ? 5 : 3);
      drawText(ctx, `CAPÍTULO ${this.ch.n}`, cx + dx, lado + 6, FONT.label, UI.acento);
      c.fecha.forEach((l, i) => drawText(ctx, l, cx + dx, lado + 28 + i * 20, FONT.label, UI.sombra));
      y = lado + c.bajoArte;
    } else {
      drawText(ctx, `CAPÍTULO ${this.ch.n}`, px + dx, 30, FONT.label, UI.acento);
      drawText(ctx, this.ch.when.toUpperCase(), px + dx, 52, FONT.label, UI.sombra);
      titulo(ctx, ROMANO[this.ch.n], W - margen + dx, 4, m.grande ? FONT.romano : FONT.romanoS, UI.acento, 'right', m.grande ? 5 : 3);
      y = m.arriba;
    }
    const fuenteTitulo = (c ?? m).fuente, altoTitulo = (c ?? m).altoLinea;
    for (const l of wrap(ctx, this.ch.title, pw, fuenteTitulo)) {
      titulo(ctx, l, px + dx, y, fuenteTitulo, UI.papel);
      y += altoTitulo;
    }
    ctx.fillStyle = UI.acento;
    ctx.fillRect(px + dx, y + 8, Math.round(pw * 0.34), 4);
    ctx.globalAlpha = 1;
    y += 34;

    // El encargo, un papel del Buitre pegado con cinta.
    // Sin encargo, el papel lo escribe María: va con su letra y a su manera.
    const encargo = this.ch.encargo?.toLocaleUpperCase('es') ?? this.ch.mariaDice;
    if (encargo) {
      const deMaria = !this.ch.encargo;
      const letra = deMaria ? FONT.text : FONT.hand;
      const lines = wrap(ctx, encargo, pw - 40, letra);
      const pad = m?.papelPad ?? 36, linea = m?.papelLinea ?? 34;
      const alto = pad + lines.length * linea;
      const n = ease(520, 320);
      const py = y + Math.round((1 - n) * 30);
      ctx.globalAlpha = n;
      ctx.fillStyle = PAL.tinta; ctx.fillRect(px + 5, py + 6, pw, alto);
      ctx.fillStyle = UI.papel; ctx.fillRect(px, py, pw, alto);
      lines.forEach((l, i) => drawText(ctx, l, px + 20, py + pad / 2 + i * linea, letra, deMaria ? PAL.tinta : PAL.tinta_azul));
      ctx.fillStyle = PAL.carton; ctx.fillRect(px + pw / 2 - 42, py - 11, 84, 22);
      ctx.fillStyle = PAL.carton_sombra; ctx.fillRect(px + pw / 2 - 42, py + 8, 84, 3);
      ctx.globalAlpha = 1;
    }

    if (this.time > 800 && Math.floor(this.time / 550) % 2 === 0) {
      drawText(ctx, 'TOCAR PARA ENTRAR', vertical ? W / 2 : px + pw / 2, H - 36, FONT.label, UI.papel, 'center');
    }
  }
}

// Una escena muda del sótano antes del final del capítulo: alguien solo, y unas horas que pasan.
export class Estampa {
  constructor(game, { base, ch, end, sinSitio }) {
    Object.assign(this, { g: game, base, ch, end, sinSitio, time: 0, i: 0 });
    Object.assign(base, { cine: true, speech: null, luz: 'noche', quieto: true, cola: [] });
    base.cam.zoom = 1;
    base.resize();
    // Todo encendido, que para eso lo ha colocado.
    for (const it of base.items) if (it.placed && it.def.enciende && !it.def.enciende.noTocar) it.encendido = true;
    const asiento = ['puf', 'sofa_nuevo', 'sofa_viejo'].map((id) => base.items.find((i) => i.def.id === id && i.placed)).find(Boolean);
    const b = new Actor(game.pokemon['0630'], asiento ? asiento.cx - 8 : 360, asiento ? asiento.cy - 8 : 140, 0);
    // El sprite vuela a media celda: para sentarlo hay que bajarlo.
    Object.assign(b, { z: asiento?.h ?? 0, alto: asiento ? asiento.h - 34 : 0 });
    const pantalla = base.items.find((i) => i.def.id === 'pantalla' && i.placed);
    if (pantalla) base.mira(b, pantalla);
    base.actors = [b];
    const c = toScreen(b.x, b.y);
    base.cam.centerOn(c.x, c.y);
  }

  resize() { this.base.resize(); }

  update(dt) {
    this.time += dt;
    this.base.time += dt;
  }

  tap() {
    if (this.time < 400) return;
    this.time = 0;
    if (++this.i < this.end.estampa.length) return;
    this.g.go('final', { ch: this.ch, end: this.end, sinSitio: this.sinSitio });
  }

  draw(ctx) {
    const { W, H } = this.g;
    this.base.draw(ctx);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const lineas = wrap(ctx, this.end.estampa[this.i], W - 40, FONT.bold);
    const alto = lineas.length * 34 + 48;
    ctx.fillStyle = UI.banda;
    ctx.fillRect(0, H - alto, W, alto);
    lineas.forEach((t, k) => drawText(ctx, t, W / 2, H - alto + 10 + k * 34, FONT.bold, UI.papel, 'center'));
    if (this.time > 900) drawText(ctx, 'TOCAR PARA SEGUIR', W / 2, H - 30, FONT.label, UI.sombra, 'center');
  }
}

// Final de capítulo: fundido, retrato ×2 con frase, cuaderno negro y cosas sin sitio.
export class Final {
  constructor(game, { ch, end, sinSitio }) {
    this.g = game; this.ch = ch; this.end = end; this.time = 0; this.i = 0;
    this.lines = [...(end.lines ?? [])];
    if (end.manoloDice) this.lines.push({ who: 'manolo', t: end.manoloDice });
    if (sinSitio > 0) this.lines.push({ p: 'Pain', t: `Cosas que se han quedado sin sitio: ${sinSitio}.`, oido: 'Cosas que se han quedado sin sitio.' });
    // Se recargó en esta pantalla: solo queda la decisión del cuaderno.
    this.choice = !this.lines.length && !!end.cuadernoNegro;
    this.habla();
  }

  habla() {
    const l = this.lines[this.i];
    if (l) voz.decir(l.who ?? 'maria', l.oido ?? l.t);
    else voz.callar();
  }

  update(dt) { this.time += dt; }

  buttons() {
    const { W, H } = this.g;
    const w = Math.min(170, Math.floor((W - 32) / 2));
    const y = Math.min(H - 64, H / 2 + 40);
    return [
      { label: 'Abrirlo', act: true, x: W / 2 - w - 8, y, w, h: 48 },
      { label: 'Dejarlo', act: false, x: W / 2 + 8, y, w, h: 48 },
    ];
  }

  next() { this.g.go('llegada'); }

  tap(p) {
    if (this.time < 400) return;
    if (this.choice) {
      const b = this.buttons().find((o) => inside(o, p.x, p.y));
      if (!b) return;
      const { state } = this.g;
      state.flags.cuadernoAbierto = b.act;
      state.pendienteCuaderno = false;
      if (b.act) {
        const { titulo } = this.g.data.textos.cuaderno;
        state.notes.push({ cap: this.ch.n, de: 'buitre', t: titulo, negro: true });
        this.g.overlay = new Reading(this.g, titulo, paginasCuaderno(this.g), () => this.next(), true);
      } else this.next();
      store(state);
      return;
    }
    this.time = 351;
    this.i++;
    this.habla();
    if (this.i < this.lines.length) return;
    if (this.end.cuadernoNegro) this.choice = true;
    else this.next();
  }

  draw(ctx) {
    const { W, H, images } = this.g;
    ctx.fillStyle = UI.fondo;
    ctx.fillRect(0, 0, W, H);
    if (this.time < 350) return;
    if (this.choice) {
      drawText(ctx, 'El cuaderno negro.', W / 2, H / 2 - 60, FONT.boldBig, UI.papel, 'center');
      drawText(ctx, 'No voy a leer esto.', W / 2, H / 2 - 10, FONT.text, UI.sombra, 'center');
      for (const b of this.buttons()) button(ctx, b, b.label, UI.papel);
      return;
    }
    const l = this.lines[this.i];
    if (!l) return;
    const size = Math.min(320, W - 40, H - 130);
    const x = Math.round((W - size) / 2), y = Math.max(16, Math.round((H - size) / 2) - 40);
    const img = l.who ? images[`${l.who}Retrato`] : images[`portrait${l.p}`];
    ctx.drawImage(img, x, y, size, size);
    wrap(ctx, l.t, W - 60, FONT.text).forEach((t, i) => drawText(ctx, t, W / 2, y + size + 20 + i * 30, FONT.text, UI.papel, 'center'));
    if (this.time > 1100) drawText(ctx, 'TOCAR PARA SEGUIR', W / 2, H - 34, FONT.label, UI.apagadoClaro, 'center');
  }
}

// Último capítulo: el Buitre baja y el sótano de la partida salta por los aires.
// Sin Angry en SpriteCollab, Idle con sacudida. Todo depende del tiempo: saltar es adelantarlo.
const COL = { rafi: 4200, furia: 6500, salen: 13000, fin: 16000 };
const PARADAS = [3000, COL.rafi, COL.furia, COL.salen, COL.fin];
const sube = (u) => Math.sin(Math.PI * u);
const suave = (u) => { const k = Math.min(1, Math.max(0, u)); return k * k * (3 - 2 * k); };
// El vuelo: un ocho sobre el sótano, en píxeles de tablero. Medido para que quepa en vertical.
const VUELO = { anchoX: 400, anchoY: 200, altura: 140, escala: 10, vuelta: 4800, despega: 900, posa: 1000 };
// La canción del final, en segundos del recorte hero.m4a (31,0 s de la original). Entra con el vuelo, en un
// compás fuerte (32,0); «And they say» cae a los 3 s y «hero» (36,8) a los 4,8, en la segunda pasada por el centro.
const HERO_ENTRA = 1;

function azar(n) {
  const s = Math.sin(n * 91.17 + 3.3) * 43758.5453;
  return s - Math.floor(s);
}

export class Colera {
  constructor(game, base) {
    this.g = game; this.base = base; this.time = 0; this.heroDentro = false;
    game.fin = base;
    // Se apaga lo del capítulo: la entrada del Buitre va en seco, y la canción llega con el vuelo.
    musica.parar(3.5);
    musica.cargar('hero');
    base.cine = true;
    base.speech = null;
    voz.decir('buitre', 'Sabía que ibas a venir.');
    base.cam.zoom = 0.5;
    base.resize();
    const c = toScreen(480, 300);
    base.cam.centerOn(c.x, c.y);
    this.buitre = new Actor(game.pokemon['0630'], 846, 496, 6);
    this.buitre.worldFacing = false;
    base.actors.push(this.buitre);
    this.quien = [base.maria, base.manolo].filter(Boolean);
    this.salida = this.quien.map((a) => ({ a, x: a.x, y: a.y }));
    for (const a of this.quien) a.worldFacing = false;
    const suelos = base.room.floors().filter((s) => /sala|garaje/.test(s.id)).map((s) => s.rect);
    // Lo pequeño vuela y cae por el sótano; lo grande solo tiembla.
    this.piezas = base.items.filter((i) => !i.wall && !i.hidden).map((it, n) => {
      const r = suelos[n % suelos.length];
      const grande = it.w + it.d >= 70 || it.h >= 60;
      return {
        it, grande, x: it.x, y: it.y, z: it.z,
        tx: r.x + azar(n) * (r.w - it.w), ty: r.y + azar(n + 40) * (r.h - it.d),
        retraso: azar(n + 80) * 2800, alto: 90 + azar(n + 120) * 200,
      };
    });
  }

  update(dt) {
    this.time += dt;
    this.base.time += dt;
    this.aplicar();
    if (!this.gritoRafi && this.time >= COL.rafi) {
      this.gritoRafi = true;
      voz.decir('rafi', '¡ISMAELITO! ¿QUÉ PASA AHÍ ABAJO?');
    }
    if (!this.heroDentro && this.time >= COL.furia) {
      this.heroDentro = true;
      musica.desde('hero', HERO_ENTRA + (this.time - COL.furia) / 1000);
    }
    // Con el móvil a pocos fotogramas el reloj de la escena se queda atrás: manda la canción.
    const cancion = musica.posicion('hero');
    if (cancion !== null) this.time = Math.max(this.time, COL.furia + (cancion - HERO_ENTRA) * 1000);
    if (this.time > COL.fin) this.g.go('epilogo');
  }

  aplicar() {
    const { base, time } = this;
    const furia = time - COL.furia;
    const tiembla = time > COL.furia && time < COL.salen;
    base.shake = tiembla ? { x: Math.round(Math.sin(time / 23) * 6), y: Math.round(Math.cos(time / 17) * 6) } : null;
    for (const p of this.piezas) {
      const { it } = p;
      if (it.def.id === 'lampara') it.spin = Math.min(1, Math.max(0, furia / 1200)) * 1.45;
      else if (it.def.id.startsWith('cachimba')) it.spin = tiembla ? Math.sin(time / 90) * 0.16 : 0;
      if (p.grande) {
        it.x = p.x + (tiembla ? Math.round(azar(Math.floor(time / 50) + p.x) * 3 - 1.5) : 0);
        continue;
      }
      const u = Math.min(1, Math.max(0, (furia - p.retraso) / 1500));
      it.x = Math.round(p.x + (p.tx - p.x) * u);
      it.y = Math.round(p.y + (p.ty - p.y) * u);
      it.z = Math.round(p.z * (1 - u) + sube(u) * p.alto);
    }
    // El Buitre baja, mira a Manolo y se hace grande.
    const b = this.buitre;
    const baja = Math.min(1, time / 1400);
    b.x = 846 - 90 * baja; b.y = 496 - 20 * baja;
    // Mientras todo cae, vuela: el del suelo se esconde y se pinta el grande, por encima de todo.
    b.oculto = time > COL.furia && time < COL.salen;
    const objetivo = time > 3000 ? base.manolo : base.maria;
    if (objetivo) {
      const m = toScreen(objetivo.x, objetivo.y), s = toScreen(b.x, b.y);
      b.row = facingRow(m.x - s.x, m.y - s.y);
    }
    // Manolo coge la caja y suben los dos.
    if (time < COL.salen) return;
    base.boxes = [];
    if (base.manolo) base.manolo.conCaja = true;
    const u = Math.min(1, (time - COL.salen) / 2400);
    for (const s of this.salida) {
      const m = toScreen(s.x, s.y), e = toScreen(846, 496);
      s.a.x = s.x + (846 - s.x) * u;
      s.a.y = s.y + (496 - s.y) * u;
      s.a.anim = 'Walk';
      s.a.row = facingRow(e.x - m.x, e.y - m.y);
    }
    if (u === 1) base.actors = base.actors.filter((a) => !this.quien.includes(a));
  }

  // Dónde va el Buitre en vuelo: punto del suelo en el tablero, altura y escala.
  enVuelo(ms) {
    const dur = COL.salen - COL.furia;
    const k = suave(ms / VUELO.despega) * (1 - suave((ms - dur + VUELO.posa) / VUELO.posa));
    const g = toScreen(this.buitre.x, this.buitre.y), c = toScreen(480, 300);
    const a = (ms / VUELO.vuelta) * Math.PI * 2;
    const ox = c.x + Math.sin(a) * VUELO.anchoX, oy = c.y + Math.sin(a * 2) * VUELO.anchoY;
    return { x: g.x + (ox - g.x) * k, y: g.y + (oy - g.y) * k, alto: VUELO.altura * k, escala: 2 + (VUELO.escala - 2) * k };
  }

  // Sombra en el suelo: su silueta aplastada. Lleva las alas, así se ve que aletea.
  drawVuelo(ctx) {
    const { base, time } = this;
    const ms = time - COL.furia;
    const { cam } = base;
    const anim = this.buitre.anims.Walk;
    const p = this.enVuelo(ms), q = this.enVuelo(ms + 80);
    const row = facingRow(q.x - p.x, q.y - q.alto - p.y + p.alto);
    const ox = cam.view.x - Math.round(cam.x * cam.zoom) + (base.shake?.x ?? 0);
    const oy = cam.view.y - Math.round(cam.y * cam.zoom) + (base.shake?.y ?? 0);
    const k = p.escala * cam.zoom;
    const w = anim.fw * k, h = anim.fh * k;
    if (!this.silueta) [this.silueta, this.gSilueta] = makeCanvas(anim.fw, anim.fh);
    const g = this.gSilueta;
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, anim.fw, anim.fh);
    drawAnim(g, anim, row, 0, 0, time * 0.7);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = PAL.tinta;
    g.fillRect(0, 0, anim.fw, anim.fh);
    const sx = p.x * cam.zoom + ox, sy = p.y * cam.zoom + oy;
    const menos = 1 - p.alto / VUELO.altura * 0.15;
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = 0.4;
    ctx.drawImage(this.silueta, Math.round(sx - w * menos / 2), Math.round(sy - h * menos * 0.25), Math.round(w * menos), Math.round(h * menos * 0.5));
    ctx.globalAlpha = 1;
    drawAnim(ctx, anim, row, Math.round(sx - w / 2), Math.round(sy - p.alto * cam.zoom - h * 0.72), time * 0.7, k);
  }

  resize() { this.base.resize(); }

  tap() { if (this.time > 3000) this.time = Math.max(this.time, PARADAS.find((t) => t > this.time) ?? COL.fin); }

  draw(ctx) {
    const { W, H } = this.g;
    this.base.draw(ctx);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (this.time > COL.furia && this.time < COL.salen) this.drawVuelo(ctx);
    // Pegadas al borde, con el nombre de quien habla. Arriba se deja sitio al botón de la música.
    const banda = (texto, abajo, font, nombre) => {
      const lineas = wrap(ctx, texto, abajo ? W - 40 : W - 112, font);
      const alto = lineas.length * 36 + 44;
      const y = abajo ? H - alto : 0;
      ctx.fillStyle = UI.banda;
      ctx.fillRect(0, y, W, alto);
      ctx.fillStyle = UI.acento;
      ctx.fillRect(0, abajo ? y : alto - 2, W, 2);
      drawText(ctx, nombre, W / 2, y + 10, FONT.label, UI.acento, 'center');
      lineas.forEach((t, i) => drawText(ctx, t, W / 2, y + 32 + i * 36, font, UI.papel, 'center'));
    };
    if (this.time < 3000) banda('Sabía que ibas a venir.', true, FONT.bold, 'EL BUITRE');
    if (this.time >= COL.rafi && this.time < COL.furia) banda('¡ISMAELITO! ¿QUÉ PASA AHÍ ABAJO?', false, FONT.boldBig, 'LA RAFI, DESDE ARRIBA');
  }
}

// Última imagen: el sótano de la partida, y el Buitre solo en su sofá, con la lengüilla fuera.
export class Epilogo {
  constructor(game) {
    this.g = game; this.time = 0;
    const base = this.base = game.fin ?? null;
    if (!base) return;
    base.shake = null;
    base.actors = base.actors.filter((a) => a.anims === game.pokemon['0629'] || a.anims === game.pokemon['0630']);
    const b = base.actors.find((a) => a.anims === game.pokemon['0630']);
    const sofa = base.items.find((i) => i.def.id === 'sofa_nuevo' && i.placed) ?? base.items.find((i) => i.def.id === 'sofa_viejo' && i.placed);
    // z lo ordena delante del sofá; alto es dónde se dibuja: sentado en el asiento.
    Object.assign(b, { x: sofa ? sofa.cx - 8 : 360, y: sofa ? sofa.cy - 8 : 140, z: sofa ? sofa.h : 0, alto: sofa ? 8 : 0, scale: 2, dx: 0, row: 0, oculto: false });
    this.buitre = b;
    base.cam.zoom = 1;
    base.resize();
    const c = toScreen(b.x, b.y);
    base.cam.centerOn(c.x, c.y);
  }

  resize() { this.base?.resize(); }

  update(dt) {
    this.time += dt;
    if (this.base) this.base.time += dt;
  }

  tap() { if (this.time > 800) this.g.go('cine', { src: 'final', next: 'creditos' }); }

  draw(ctx) {
    const { W, H, images } = this.g;
    if (!this.base) {
      cover(ctx, H > W ? images.finalV : images.finalH, W, H);
      return;
    }
    this.base.draw(ctx);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // La lengüilla, un rato sí y un rato no.
    if (Math.floor(this.time / 1400) % 3 !== 2) {
      const { cam } = this.base;
      const b = this.buitre;
      const s = toScreen(b.x + b.w / 2, b.y + b.d / 2, b.alto + 44);
      const x = Math.round(s.x * cam.zoom - Math.round(cam.x * cam.zoom) + cam.view.x);
      const y = Math.round(s.y * cam.zoom - Math.round(cam.y * cam.zoom) + cam.view.y);
      ctx.fillStyle = PAL.tinta; ctx.fillRect(x - 3, y, 8, 11);
      ctx.fillStyle = '#E8798F'; ctx.fillRect(x - 2, y, 6, 9);
    }
  }
}

const ARRIBA_CREDITOS = 64;

export class Creditos {
  constructor(game) {
    this.g = game; this.time = 0;
    const { state, data } = game;
    state.terminado = true;
    store(state);
    this.lines = [...data.textos.creditos, '', `Bolitas de aluminio en la lámpara: ${state.bolitasLampara}. Y ahora limpiáis.`];
    // Bloques: cabecera, quién lo hizo, los agradecimientos, lo legal y la última línea.
    this.bloques = [[]];
    for (const l of this.lines) { if (l) this.bloques.at(-1).push(l); else this.bloques.push([]); }
  }

  // Cada bloque con su letra. El título es el logo, que ya lo dice.
  filas(ctx, W) {
    const n = this.bloques.length;
    const salida = [];
    this.bloques.forEach((b, i) => {
      const estilo = i === 0 ? { font: FONT.label, lh: 24, color: UI.acento }
        : i === 1 ? { font: FONT.bold, lh: 32, color: UI.papel }
          : i === 2 ? { font: FONT.text, lh: 30, color: UI.papel }
            : i === n - 1 ? { font: FONT.bold, lh: 32, color: UI.acento }
              : { font: FONT.small, lh: 24, color: UI.sombra };
      const lineas = i === 0 ? b.slice(1) : b;
      for (const t of lineas) salida.push({ ...estilo, partes: wrap(ctx, t, W - 48, estilo.font), hueco: i === 2 ? 8 : 2 });
      salida.at(-1).hueco = 34;
    });
    return salida;
  }

  update(dt) { this.time += dt; }

  botonFoto() {
    if (!hayFoto()) return null;
    const { W, H } = this.g;
    const w = Math.min(320, W - 32);
    return { x: Math.round((W - w) / 2), y: H - 64, w, h: 48 };
  }

  tap(p) {
    const b = this.botonFoto();
    if (b && inside(b, p.x, p.y)) { sfx.carton(); descargarFoto(); return; }
    if (this.time > 800) this.g.go('inicio');
  }

  draw(ctx) {
    const { W, H } = this.g;
    ctx.fillStyle = UI.fondo;
    ctx.fillRect(0, 0, W, H);
    // Suben hasta que se ve la última línea, quepan o no en la pantalla.
    const logo = this.g.images.titleV;
    const lw = Math.min(W - 48, 420), lh = Math.round(logo.height * lw / logo.width);
    const filas = this.filas(ctx, W);
    const texto = filas.reduce((s, f) => s + f.partes.length * f.lh + f.hueco, 0);
    const boton = this.botonFoto();
    const pie = boton ? 112 : 56;
    const alto = lh + 12 + texto;
    const tope = Math.min(ARRIBA_CREDITOS, H - alto - pie);
    let y = Math.max(tope, H - this.time * 0.05);
    const fin = y === tope;
    ctx.drawImage(logo, Math.round((W - lw) / 2), Math.round(y), lw, lh);
    y += lh + 12;
    for (const f of filas) {
      for (const t of f.partes) {
        if (y > -40 && y < H) drawText(ctx, t, W / 2, y, f.font, f.color, 'center');
        y += f.lh;
      }
      y += f.hueco;
    }
    // Arriba también: pasan por detrás de la franja del botón de la música, sin chocar con él.
    ctx.fillStyle = UI.fondo;
    ctx.fillRect(0, 0, W, ARRIBA_CREDITOS);
    for (let k = 0; k < 4; k++) {
      ctx.globalAlpha = 1 - (k + 1) / 5;
      ctx.fillRect(0, ARRIBA_CREDITOS + k * 4, W, 4);
    }
    ctx.globalAlpha = 1;
    // El pie va fijo: los créditos pasan por detrás y se ve cómo salir.
    if (boton || fin) {
      ctx.fillStyle = UI.fondo;
      ctx.fillRect(0, H - pie, W, pie);
    }
    if (boton) button(ctx, boton, 'Descargar la foto', UI.papel);
    if (fin) drawText(ctx, 'TOCAR PARA VOLVER', W / 2, H - pie + 14, FONT.label, UI.sombra, 'center');
  }
}

// Vídeo a pantalla completa, por encima del lienzo. Si no se puede ver, se sigue jugando.
export class Cine {
  constructor(game, { src, next }) {
    this.g = game; this.next = next; this.acabado = false;
    if (location.search.includes('sincine')) { setTimeout(() => this.fin(), 0); return; }
    const v = this.video = document.createElement('video');
    v.className = 'cine';
    v.src = `assets/video/${src}.mp4`;
    v.playsInline = true;
    v.setAttribute('playsinline', '');
    v.preload = 'auto';
    v.onended = () => this.fin();
    v.onerror = () => this.sinVideo();
    // Con mala red se ve negro: se dice que está cargando. Y un toque lo sigue si se ha parado.
    v.onwaiting = () => this.avisa('Cargando el vídeo...');
    v.onplaying = () => this.avisa(null);
    v.onclick = () => { if (v.paused) v.play().catch(() => {}); };
    this.vuelve = () => { if (!document.hidden) v.play().catch(() => {}); };
    document.addEventListener('visibilitychange', this.vuelve);
    const b = this.saltar = document.createElement('button');
    b.className = 'saltar';
    b.textContent = 'Saltar';
    b.onclick = () => this.fin();
    document.body.append(v, b);
    musica.video(true);
    v.play().catch(() => { v.muted = true; v.play().catch(() => this.sinVideo()); });
  }

  avisa(texto) {
    if (!this.aviso) {
      const a = this.aviso = document.createElement('div');
      a.style.cssText = 'position:fixed;left:16px;right:16px;bottom:88px;z-index:6;text-align:center;font:20px "Pixelify Sans",sans-serif;color:#F4EBD9;pointer-events:none';
      document.body.append(a);
    }
    this.aviso.textContent = texto ?? '';
  }

  // Sin red no hay vídeo: se dice, y la historia sigue.
  sinVideo() {
    if (this.acabado || this.sinRed) return;
    this.sinRed = true;
    this.avisa(navigator.onLine === false ? 'Sin conexión: este vídeo no se puede ver ahora.' : 'Este vídeo no se ha podido cargar.');
    setTimeout(() => this.fin(), 2600);
  }

  fin() {
    if (this.acabado) return;
    this.acabado = true;
    document.removeEventListener('visibilitychange', this.vuelve);
    this.video?.pause();
    this.video?.remove();
    this.saltar?.remove();
    this.aviso?.remove();
    musica.video(false);
    this.g.go(this.next);
  }

  update() {}
  tap() {}

  draw(ctx) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, this.g.W, this.g.H);
  }
}
