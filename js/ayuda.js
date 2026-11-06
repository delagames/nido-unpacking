// Cómo se juega: cuatro fichas cortas, con frases sueltas y aire. Se sale desde cualquiera.
import { PAL, UI, FONT, drawText, wrap, inside } from './gfx.js';
import { sfx } from './objects.js';

const MARGEN = 16;
const LADO_BOTON = 52;

const FICHAS = [
  {
    titulo: 'Las cajas',
    icono: 'caja',
    lineas: [
      'Toca una caja para abrirla.',
      'Cada toque saca la siguiente cosa a la bandeja de abajo.',
      'Toca lo que hay en la bandeja y María te lo comenta.',
    ],
  },
  {
    titulo: 'Colocar',
    icono: 'sofa',
    lineas: [
      'Arrastra desde la bandeja. Con la huella en verde, suelta.',
      'Muebles al suelo, pósters a la pared y lo pequeño encima de un mueble.',
      'Lo que sobre, a las cacharras.',
      'Doble toque: gira, o tuerce un póster.',
      'Dedo quieto sobre algo colocado: lo coges. En la franja de abajo, lo quitas.',
    ],
  },
  {
    titulo: 'Mirar y tocar',
    icono: 'girar',
    lineas: [
      'Arrastra el fondo para mover la cámara. Pellizca para el zoom.',
      'Girar enseña otro lado. Lo colgado solo se ve en las paredes del fondo.',
      'Un toque enciende teles, pantallas y luces.',
      'Toca a Manolo o a quien baje: dice algo. A veces hay alguien escondido.',
      'Toca la banda de arriba para volver a leer el encargo.',
      'SONIDO, abajo: quita o pone la música y las voces.',
    ],
  },
  {
    titulo: 'Terminar',
    icono: 'listo',
    lineas: [
      'Listo se puede pulsar siempre. Te dice lo que queda.',
      'Lo no colocado va solo a la CAJA. Si falta algo importante, te avisa.',
      'En la CAJA, arrastra hacia arriba lo que quieras sacar.',
      'Si toca recoger, lleva cada cosa a la caja de la flecha.',
    ],
  },
];

export class Ayuda {
  constructor(game) { this.g = game; this.i = 0; sfx.papel(); }

  update() {}

  botones() {
    const { W, H } = this.g;
    const y = H - MARGEN - LADO_BOTON;
    const w = Math.min(120, Math.floor((W - MARGEN * 2 - 16) / 3) + 8);
    return {
      antes: { x: MARGEN + 8, y, w: LADO_BOTON, h: LADO_BOTON },
      cerrar: { x: Math.round((W - w) / 2), y, w, h: LADO_BOTON },
      luego: { x: W - MARGEN - 8 - LADO_BOTON, y, w: LADO_BOTON, h: LADO_BOTON },
    };
  }

  tap(p) {
    const b = this.botones();
    if (inside(b.cerrar, p.x, p.y)) { sfx.papel(); this.g.overlay = null; return; }
    if (inside(b.antes, p.x, p.y) && this.i > 0) { sfx.papel(); this.i--; return; }
    if (inside(b.luego, p.x, p.y) && this.i < FICHAS.length - 1) { sfx.papel(); this.i++; }
  }

  icono(ctx, tipo, x, y) {
    const { images, catalog } = this.g;
    if (tipo === 'caja' || tipo === 'sofa') {
      const img = tipo === 'caja' ? images.cajaCerrada : catalog.images.get('sofa_viejo_0');
      const k = 44 / Math.max(img.width, img.height);
      ctx.drawImage(img, x, y + Math.round(22 - img.height * k / 2), Math.round(img.width * k), Math.round(img.height * k));
      return;
    }
    ctx.fillStyle = PAL.tinta; ctx.fillRect(x, y + 11, 60, 30);
    ctx.fillStyle = tipo === 'listo' ? UI.acento : UI.sombra; ctx.fillRect(x, y + 8, 60, 30);
    drawText(ctx, tipo === 'listo' ? 'LISTO' : 'GIRAR', x + 30, y + 15, FONT.label, PAL.tinta, 'center');
  }

  boton(ctx, r, texto, activo, fuente = FONT.bold) {
    if (!activo) return;
    ctx.fillStyle = PAL.tinta; ctx.fillRect(r.x, r.y + 3, r.w, r.h);
    ctx.fillStyle = UI.sombra; ctx.fillRect(r.x, r.y, r.w, r.h);
    drawText(ctx, texto, r.x + r.w / 2, r.y + 13, fuente, PAL.tinta, 'center');
  }

  draw(ctx) {
    const { W, H } = this.g;
    const f = FICHAS[this.i];
    ctx.fillStyle = UI.fondo;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = UI.sombra; ctx.fillRect(MARGEN + 4, MARGEN + 4, W - MARGEN * 2, H - MARGEN * 2);
    ctx.fillStyle = UI.papel; ctx.fillRect(MARGEN, MARGEN, W - MARGEN * 2, H - MARGEN * 2);
    ctx.fillStyle = UI.acento; ctx.fillRect(MARGEN, MARGEN, W - MARGEN * 2, 5);

    const izq = MARGEN + 24, ancho = W - izq * 2;
    // En apaisado la cabecera va en una línea y el aire se aprieta: si no, las frases llegan a los botones.
    const bajo = H < 480;
    const cabecera = `CÓMO SE JUEGA · ${this.i + 1} / ${FICHAS.length}`;
    if (bajo) drawText(ctx, cabecera, W - izq - 76, MARGEN + 24, FONT.label, UI.apagado, 'right');
    else drawText(ctx, cabecera, W / 2, MARGEN + 18, FONT.label, UI.apagado, 'center');
    ctx.font = FONT.boldBig;
    const cabe = izq + ctx.measureText(f.titulo).width + 8 <= W - izq - 60;
    drawText(ctx, f.titulo, izq, MARGEN + (bajo ? 14 : cabe ? 56 : 60), cabe ? FONT.boldBig : FONT.bold, PAL.tinta);
    this.icono(ctx, f.icono, W - izq - 60, MARGEN + (bajo ? 8 : 50));

    // Si no cabe en esta pantalla baja la letra; el aire entre frases no se toca.
    const b = this.botones();
    const arriba = MARGEN + (bajo ? 62 : 116), abajo = b.cerrar.y - (bajo ? 8 : 16);
    let aire = bajo ? 4 : 16;
    let font = FONT.text, lh = 28;
    let filas = f.lineas.map((l) => wrap(ctx, l, ancho - 18, font));
    if (filas.flat().length * lh + (filas.length - 1) * aire > abajo - arriba) {
      font = FONT.small; lh = 24;
      filas = f.lineas.map((l) => wrap(ctx, l, ancho - 18, font));
    }
    if (filas.flat().length * lh + (filas.length - 1) * aire > abajo - arriba) {
      font = '16px "Pixelify Sans"'; lh = 19; aire = 6;
      filas = f.lineas.map((l) => wrap(ctx, l, ancho - 18, font));
    }
    const total = filas.flat().length * lh + (filas.length - 1) * aire;
    const hueco = Math.max(aire, Math.min(30, aire + Math.floor((abajo - arriba - total) / Math.max(1, filas.length - 1))));
    let y = arriba;
    for (const fila of filas) {
      ctx.fillStyle = UI.acento; ctx.fillRect(izq, y + 10, 8, 8);
      fila.forEach((l, k) => drawText(ctx, l, izq + 18, y + k * lh, font, PAL.tinta));
      y += fila.length * lh + hueco;
    }

    this.boton(ctx, b.antes, '<', this.i > 0);
    this.boton(ctx, b.cerrar, 'Cerrar', true);
    this.boton(ctx, b.luego, '>', this.i < FICHAS.length - 1);
  }
}
