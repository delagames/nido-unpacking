// Lo que se enciende: pantallas con imagen y luces con halo. Los halos se pintan una vez en un
// lienzo pequeño y luego solo se copian: en el móvil cuesta lo mismo que un sprite más.
import { makeCanvas } from './gfx.js';
import { toScreen, spriteTopLeft } from './iso.js';

const LADO = 96;
const halos = new Map();

function halo(color) {
  if (!halos.has(color)) {
    const [c, g] = makeCanvas(LADO, LADO);
    const r = g.createRadialGradient(LADO / 2, LADO / 2, 0, LADO / 2, LADO / 2, LADO / 2);
    r.addColorStop(0, color);
    r.addColorStop(0.45, `${color}70`);
    r.addColorStop(1, `${color}00`);
    g.fillStyle = r;
    g.fillRect(0, 0, LADO, LADO);
    halos.set(color, c);
  }
  return halos.get(color);
}

const brilloDe = (d) => d.luz ?? (d.pantalla || d.cara ? { color: d.tono ?? '#BFD8FF', suelo: 64, fuerza: 0.3 } : null);
const parpadeo = (d, t) => (d.parpadea ? 0.86 + 0.14 * Math.sin(t / 90) * Math.sin(t / 37) : 1);

// Mancha de luz en el suelo, y en la pared que tenga detrás: va debajo de todos los muebles.
export function luzEnSuelo(ctx, it, time) {
  const d = it.def.enciende, l = d && brilloDe(d);
  if (!l?.suelo) return;
  const s = toScreen(it.cx, it.cy, 0);
  const r = l.suelo;
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  ctx.globalAlpha = (l.fuerza ?? 0.42) * parpadeo(d, time);
  ctx.drawImage(halo(l.color), Math.round(s.x - r), Math.round(s.y - r / 2), r * 2, r);
  ctx.restore();
}

const interpola = (q, u, v) => {
  const [a, b, c, e] = q;
  return [a[0] + (b[0] - a[0]) * u + (e[0] - a[0] + (a[0] - b[0] + c[0] - e[0]) * u) * v,
    a[1] + (b[1] - a[1]) * u + (e[1] - a[1] + (a[1] - b[1] + c[1] - e[1]) * u) * v];
};

function poligono(ctx, q, x, y, ancho, mirror) {
  ctx.beginPath();
  q.forEach(([px, py], i) => {
    const sx = x + (mirror ? ancho - px : px), sy = y + py;
    if (i) ctx.lineTo(sx, sy); else ctx.moveTo(sx, sy);
  });
  ctx.closePath();
}

// Una película cualquiera: bloques de color que cambian de plano de vez en cuando.
const PLANOS = [['#23406E', '#E8C27A', '#5E8FD0'], ['#3C6E47', '#D9E3B0', '#8DBB6C'], ['#7A3B2E', '#F0B070', '#C76A3C'], ['#2C2C54', '#C8C8F0', '#6A6AC8']];

function imagen(ctx, d, q, x, y, ancho, mirror, time) {
  const plano = PLANOS[Math.floor(time / 1700) % PLANOS.length];
  ctx.save();
  poligono(ctx, q, x, y, ancho, mirror);
  ctx.clip();
  ctx.fillStyle = d.fondo ?? plano[0];
  ctx.fill();
  const banda = (u0, v0, u1, v1, color) => {
    ctx.fillStyle = color;
    poligono(ctx, [interpola(q, u0, v0), interpola(q, u1, v0), interpola(q, u1, v1), interpola(q, u0, v1)], x, y, ancho, mirror);
    ctx.fill();
  };
  if (d.fondo) {
    banda(0.08, 0.1, 0.92, 0.2, '#3A6FD0');
    for (let k = 0; k < 4; k++) banda(0.1, 0.3 + k * 0.14, 0.5 + ((k * 7 + Math.floor(time / 600)) % 4) * 0.1, 0.36 + k * 0.14, '#BFD8FF');
  } else {
    const paso = Math.floor(time / 240) % 5;
    banda(0, 0.62, 1, 1, plano[2]);
    banda(0.12 + paso * 0.03, 0.2, 0.42 + paso * 0.03, 0.62, plano[1]);
    banda(0.66 - paso * 0.02, 0.32, 0.84 - paso * 0.02, 0.62, plano[1]);
  }
  ctx.restore();
}

// Humo de cachimba: unas volutas que suben, se abren y se van. Un puñado de copias del mismo halo.
const VOLUTAS = 6, VIDA = 3400;

function humo(ctx, s, escala, time) {
  ctx.save();
  for (let k = 0; k < VOLUTAS; k++) {
    const f = ((time / VIDA) + k / VOLUTAS) % 1;
    const r = (5 + f * 13) * escala;
    ctx.globalAlpha = Math.sin(f * Math.PI) * 0.6;
    const x = s.x + Math.sin(f * 7 + k * 2.1) * (3 + f * 11) * escala;
    const y = s.y - f * 62 * escala;
    ctx.drawImage(halo('#8EA4B8'), Math.round(x - r), Math.round(y - r), r * 2, r * 2);
  }
  ctx.restore();
}

// Aspas girando: un disco borroso y tres palas en el plano del aro, que va en la cara de delante.
function aspas(ctx, it, a, time) {
  const r = it.rel;
  // Punto del aro en la planta del objeto (orientación 0), girado con él.
  let [u, v] = [a.x - it.def.w / 2, a.y - it.def.d / 2];
  for (let k = 0; k < it.rot; k++) [u, v] = [-v, u];
  const s = toScreen(it.cx + u, it.cy + v, it.z + a.z);
  ctx.save();
  // El aro corre a lo largo de la x del objeto: sube a la derecha de frente y baja en el costado.
  ctx.transform(1, r % 2 ? 0.5 : -0.5, 0, 1, s.x, s.y);
  ctx.fillStyle = 'rgba(214,220,226,0.45)';
  ctx.beginPath(); ctx.arc(0, 0, a.r, 0, 7); ctx.fill();
  ctx.rotate(time / 45);
  ctx.fillStyle = 'rgba(246,248,250,0.9)';
  for (let k = 0; k < 3; k++) { ctx.rotate(2.094); ctx.fillRect(1, -1.5, a.r - 1, 3); }
  ctx.restore();
}

// La llama de una vela, sobre su mecha: por código para que salga bien en las cuatro vistas.
function llama(ctx, p, t) {
  const x = Math.round(p.x), y = Math.round(p.y);
  const alta = Math.sin(t / 110) > 0.2 ? 1 : 0;
  ctx.fillStyle = '#FFB040';
  ctx.fillRect(x - 1, y - 3, 2, 3);
  ctx.fillRect(x - 1, y - 5 - alta, 1, 2 + alta);
  ctx.fillStyle = '#FFF0B0';
  ctx.fillRect(x - 1, y - 2, 1, 2);
}

// Sobre el propio objeto, después de su sprite.
export function luzEnObjeto(ctx, it, catalog, time) {
  const d = it.def.enciende;
  if (!d || !it.encendido) return;
  const img = catalog.image(it);
  const t = spriteTopLeft(it.x, it.y, it.z, it.w, it.d, img.height);
  const q = it.rel >= 2 && it.def.back ? d.pantallaB : d.pantalla;
  if (q) imagen(ctx, d, q, t.x, t.y, img.width, it.mirror, time);
  // La pantalla como cara del modelo 3D: se proyecta igual que el mueble en cualquier vista.
  const cara = it.rel < 2 ? d.cara : d.caraB;
  if (cara) imagen(ctx, d, cara.map(([x, y, z]) => { const p = it.punto(x, y, z); return [p.x, p.y]; }), 0, 0, 0, false, time);
  if (d.capa && !it.flat) {
    const capa = catalog.images.get(`${it.def.id}_on`);
    const c = spriteTopLeft(it.x, it.y, it.z, it.w, it.d, capa.height);
    ctx.drawImage(capa, c.x, c.y);
  }
  if (d.llamas) for (const [x, y, z] of d.llamas) llama(ctx, it.punto(x, y, z), time + x * 53);
  if (d.aspas) aspas(ctx, it, d.aspas, time);
  if (d.humo) humo(ctx, toScreen(it.cx, it.cy, it.z + d.humo.z), d.humo.r ?? 1, time);
  const l = d.luz;
  if (!l?.r) return;
  const s = toScreen(it.cx, it.cy, it.z + l.z);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = (l.brillo ?? 0.5) * parpadeo(d, time);
  ctx.drawImage(halo(l.color), Math.round(s.x - l.r), Math.round(s.y - l.r), l.r * 2, l.r * 2);
  ctx.restore();
}
