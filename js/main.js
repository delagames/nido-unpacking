// Arranque, canvas, orientación, escalado entero y bucle.
import { loadPalette, loadJSON, loadImage, loadFonts, carga } from './gfx.js';
import { attachInput } from './input.js';
import { Catalog } from './objects.js';
import { loadCharacter } from './characters.js';
import { Basement } from './chapter.js';
import { Inicio, Llegada, Final, Estampa, Colera, Epilogo, Creditos, Cine } from './scenes.js';
import { load as loadSave, blank } from './save.js';
import { setupViews } from './iso.js';
import { Solapas } from './transicion.js';
import { sfx } from './objects.js';
import { musica } from './musica.js';
import { voz } from './voz.js';

const canvas = document.getElementById('juego');
const ctx = canvas.getContext('2d');
const PORTRAITS = ['Normal', 'Happy', 'Surprised', 'Pain', 'Determined', 'Sad', 'Angry', 'Inspired'];
const ACTORS = ['0067', '0080', '0630', '0629', '0115', '0094', '0571'];
const RETRATOS = { manolo: '0067', juanjo: '0080', rafi: '0115', samuel: '0094', jorge: '0571', alberto: '0629' };
const MAX_LADO = 540;      // lado corto lógico como mucho
const solapas = new Solapas();

export const game = {
  W: 540, H: 960, ctx,
  data: {}, images: {}, catalog: null, maria: null, pokemon: {},
  state: blank(),
  scene: null, overlay: null,

  current() {
    const chapters = this.data.chapters.chapters;
    return chapters[Math.min(this.state.chapter, chapters.length) - 1];
  },

  // El último capítulo: el de la caja de María.
  get capFinal() { return this.data.chapters.chapters.length; },

  // Cambio dentro del mismo capítulo: se ven las solapas y debajo ya está lo nuevo.
  relevo() { solapas.empezar(canvas); sfx.cinta(); },

  // Qué suena en cada escena. Estampa, final, cólera y epílogo siguen con lo que haya.
  ambiente(name) {
    const { scene } = this;
    if (name === 'cine') musica.parar(1.4);
    else if (name === 'inicio' || scene instanceof Creditos) musica.poner('menu');
    else if (name === 'libre') musica.poner(this.data.chapters.libre.musica);
    else if (name === 'llegada' || name === 'sotano') {
      const ch = this.current();
      musica.poner((scene.fase === 2 && ch.recogida?.musica) || ch.musica);
    }
  },

  // La escena cambia al instante; las solapas tapan el relevo.
  go(name, arg) {
    if (this.scene) this.relevo();
    voz.callar();
    this.overlay = null;
    const scenes = {
      inicio: () => new Inicio(this),
      llegada: () => new Llegada(this, this.current()),
      sotano: () => new Basement(this, this.current()),
      libre: () => new Basement(this, this.data.chapters.libre),
      final: () => (this.state.chapter > this.capFinal ? new Creditos(this) : new Final(this, arg)),
      estampa: () => new Estampa(this, arg),
      colera: () => new Colera(this, arg),
      epilogo: () => new Epilogo(this),
      creditos: () => new Creditos(this),
      cine: () => new Cine(this, arg),
    };
    this.scene = scenes[name]();
    this.ambiente(name);
    // En el final, las solapas ya hacen de fundido: fuera la espera en negro.
    if (name === 'final' && this.scene.lines) this.scene.time = 351;
  },
};

// Un píxel del juego son k píxeles reales, siempre entero. El tamaño lógico sale de la pantalla,
// así llena el móvil entero; k es al menos la densidad, para que el dedo tenga botones de 48 px CSS.
function resize() {
  const dpr = devicePixelRatio || 1;
  const pw = Math.round(innerWidth * dpr), ph = Math.round(innerHeight * dpr);
  const k = Math.max(1, Math.ceil(dpr - 0.01), Math.ceil(Math.min(pw, ph) / MAX_LADO - 0.01));
  game.W = Math.floor(pw / k);
  game.H = Math.floor(ph / k);
  canvas.width = game.W;
  canvas.height = game.H;
  canvas.style.width = `${game.W * k / dpr}px`;
  canvas.style.height = `${game.H * k / dpr}px`;
  game.scene?.resize?.();
}

// El botón de la música va donde la escena diga, en una esquina libre si no dice nada.
// Fuera en vídeos, notas, diálogos y mientras se pide el nombre de la foto.
let musicaEn = '';
function colocaMusica() {
  const { scene, overlay } = game;
  const fuera = !scene || overlay || scene instanceof Cine || solapas.activa || document.querySelector('.nombre-foto');
  const r = fuera ? null : scene.sitioMusica?.() ?? { x: game.W - 56, y: 8, w: 48, h: 48 };
  const clave = r ? `${r.x},${r.y},${r.w},${r.h},${game.W},${game.H},${innerWidth},${innerHeight}` : '';
  if (clave === musicaEn) return;
  musicaEn = clave;
  if (!r) { musica.situar(null); return; }
  const c = canvas.getBoundingClientRect(), k = c.width / game.W;
  musica.situar({ x: c.left + r.x * k, y: c.top + r.y * k, w: r.w * k, h: r.h * k });
}

// Los gestos van a la pantalla superpuesta si la hay. Donde no hay doble toque, es otro toque.
const forward = (name) => (...args) => {
  if (solapas.cerrando) return undefined;
  const target = game.overlay ?? game.scene;
  return (target?.[name] ?? (name === 'doubleTap' ? target?.tap : null))?.call(target, ...args);
};

// El móvil puede cerrar el juego en cualquier momento: se guarda al salir de la pantalla.
const guardar = () => { if (document.visibilityState === 'hidden') game.scene?.persist?.(); };

async function load() {
  await Promise.all([loadPalette(), loadFonts()]);
  const [room, objects, chapters, textos] = await Promise.all(
    ['room', 'objects', 'chapters', 'textos'].map((n) => loadJSON(`data/${n}.json`)),
  );
  game.data = { room, chapters, textos };
  game.vistas = await loadJSON('assets/bg/vistas.json');
  setupViews(game.vistas);
  const tandas = Promise.all([
    Promise.all([0, 1, 2, 3].map((k) => loadImage(`assets/bg/02-sotano-${k}.png`))),
    Promise.all(game.vistas.vistas.map((v) => Promise.all(v.muros.map((m) => loadImage(`assets/bg/${m.archivo}`))))),
    Promise.all([0, 1, 2, 3].map((k) => loadImage(`assets/bg/cuartillo-${k}.png`))),
    Promise.all(game.vistas.vistas.map((v) => Promise.all(v.cerrado.map((m) => loadImage(`assets/bg/${m.archivo}`))))),
  ]);
  const files = {
    titleV: 'assets/logo/title-nido-unpacking-540x280.png',
    titleH: 'assets/logo/title-nido-unpacking-960x200.png',
    naranjo: 'assets/bg/naranjo.png',
    carton: 'assets/bg/carton.png',
    candado: 'assets/bg/03-cuartillo-candado.png',
    fachadaV: 'assets/bg/01-fachada.png',
    fachadaH: 'assets/bg/01-fachada-h.png',
    finalV: 'assets/bg/04-desde-escalera.png',
    finalH: 'assets/bg/04-desde-escalera-h.png',
    coche_pajero: 'assets/obj/coche_pajero.png',
    coche_accord: 'assets/obj/coche_accord.png',
    coche_pajero_0: 'assets/obj/coche_pajero_0.png',
    coche_pajero_1: 'assets/obj/coche_pajero_1.png',
    coche_pajero_2: 'assets/obj/coche_pajero_2.png',
    coche_pajero_3: 'assets/obj/coche_pajero_3.png',
    coche_accord_0: 'assets/obj/coche_accord_0.png',
    coche_accord_1: 'assets/obj/coche_accord_1.png',
    coche_accord_2: 'assets/obj/coche_accord_2.png',
    coche_accord_3: 'assets/obj/coche_accord_3.png',
    fotoSerresiete: 'assets/obj/foto_serresiete_grande.png',
    cajaCerrada: 'assets/obj/caja_cerrada.png',
    cajaAbierta: 'assets/obj/caja_abierta.png',
    mariaTrainer: 'assets/sprites/maria/maria-trainer.png',
  };
  for (const [quien, id] of Object.entries(RETRATOS)) files[`${quien}Retrato`] = `assets/portraits/${id}/Normal.png`;
  for (let r = 0; r < 4; r++) {
    files[`cajaCerrada${r}`] = `assets/obj/caja_cerrada_${r}.png`;
    files[`cajaAbierta${r}`] = `assets/obj/caja_abierta_${r}.png`;
    for (let n = 1; n <= 4; n++) files[`monton${n}_${r}`] = `assets/obj/monton_${n}_${r}.png`;
    for (const d of room.destrozos) files[`destrozo_${d.img}_${r}`] = `assets/bg/destrozo-${d.img}_${r}.png`;
  }
  for (const p of PORTRAITS) files[`portrait${p}`] = `assets/portraits/maria/portrait-${p}.png`;
  for (const { n } of chapters.chapters) files[`capitulo${n}`] = `assets/bg/capitulo-${n}.png`;
  game.catalog = new Catalog(objects);
  // Todo a la vez: esperar a una tanda para empezar la siguiente solo alarga la pantalla de carga.
  const [[tableros, muros, cuartillo, murosCerrado]] = await Promise.all([
    tandas,
    Promise.all(Object.entries(files).map(async ([k, src]) => { game.images[k] = await loadImage(src); })),
    game.catalog.load(),
    loadCharacter('assets/sprites/maria').then((m) => { game.maria = m; }),
    Promise.all(ACTORS.map(async (id) => { game.pokemon[id] = await loadCharacter(`assets/sprites/${id}`); })),
  ]);
  game.pokemon['0630'].vuela = true;   // el Buitre no toca el suelo
  Object.assign(game.images, { tableros, muros, cuartillo, murosCerrado });
  game.state = loadSave() ?? blank();
}

// La pantalla de carga está en index.html, para verse antes de que llegue nada de esto.
const ARCHIVOS = 820;     // lo que baja el juego más o menos: la barra no retrocede si se pide más
const LENTO_MS = 12000;
const caja = document.getElementById('carga');
const barra = document.querySelector('#carga-barra div');
let avance = 0;
carga.alCambiar = () => {
  avance = Math.max(avance, Math.min(99, Math.floor(100 * carga.hechas / Math.max(carga.pedidas, ARCHIVOS))));
  barra.style.width = `${avance}%`;
};
const lento = setTimeout(() => { document.getElementById('carga-texto').textContent = 'La primera vez baja todo el juego y tarda un poco. Las siguientes, no.'; }, LENTO_MS);

let last = 0;
function frame(now) {
  const dt = Math.min(50, now - last);
  last = now;
  if (solapas.activa) solapas.update(dt);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;
  if (solapas.cerrando) {
    solapas.fondo(ctx);
  } else {
    game.scene.update(dt);
    game.scene.draw(ctx);
    if (game.overlay) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      game.overlay.update(dt);
      game.overlay.draw(ctx);
    }
  }
  if (solapas.activa) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    solapas.draw(ctx, game.W, game.H);
  }
  colocaMusica();
  requestAnimationFrame(frame);
}

addEventListener('resize', resize);
addEventListener('orientationchange', resize);
resize();
attachInput(canvas, Object.fromEntries(
  ['tap', 'doubleTap', 'hold', 'dragStart', 'drag', 'dragEnd', 'dragCancel', 'pinch', 'twist', 'ocupado'].map((n) => [n, forward(n)]),
));
addEventListener('pagehide', () => game.scene?.persist?.());
document.addEventListener('visibilitychange', guardar);
musica.iniciar();
voz.iniciar();
try {
  await load();
} catch (e) {
  clearTimeout(lento);
  window.falloCarga(e.archivo);
  throw e;
}
clearTimeout(lento);
carga.alCambiar = null;
caja.remove();
game.go('inicio');
requestAnimationFrame((t) => { last = t; frame(t); });
// Con el juego ya en marcha: la descarga para jugar sin red no compite con la de arriba.
if ('serviceWorker' in navigator && isSecureContext) setTimeout(() => navigator.serviceWorker.register('sw.js'), 1500);
