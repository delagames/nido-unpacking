// La foto del sótano terminado: se hace antes de la cólera y se puede descargar al final.
// Se guarda sin pie: el pie lleva el nombre de quien la descarga y se compone en ese momento.
import { PAL, UI, FONT, drawText, makeCanvas } from './gfx.js';

const CLAVE = 'nido.foto.v15';
const CLAVE_NOMBRE = 'nido.nombre';
const BANDA = 110;
const MAX_NOMBRE = 24;

export function guardarFoto(canvas) {
  try {
    localStorage.removeItem('nido.foto');      // la de antes llevaba el pie pintado
    localStorage.setItem(CLAVE, canvas.toDataURL('image/png'));
  } catch { /* sin sitio: se queda sin foto */ }
}

export function hayFoto() {
  try { return !!localStorage.getItem(CLAVE); } catch { return false; }
}

// «José María» pasa a «jose-maria»: el nombre del archivo, sin tildes ni espacios.
const trozoArchivo = (t) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

function componer(img, nombre) {
  const [c, g] = makeCanvas(img.width, img.height + BANDA);
  const pie = `El sótano de ${nombre}`;
  g.fillStyle = UI.fondo;
  g.fillRect(0, 0, c.width, c.height);
  g.drawImage(img, 0, 0);
  g.fillStyle = UI.papel;
  g.fillRect(0, img.height, c.width, BANDA);
  g.font = FONT.titulo;
  const font = g.measureText(pie).width <= c.width - 40 ? FONT.titulo : FONT.boldBig;
  drawText(g, pie, c.width / 2, img.height + (font === FONT.titulo ? 14 : 30), font, PAL.tinta, 'center');
  const bytes = atob(c.toDataURL('image/png').split(',')[1]);
  const datos = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) datos[i] = bytes.charCodeAt(i);
  const trozo = trozoArchivo(nombre);
  return { pie, file: new File([datos], trozo ? `el-sotano-de-${trozo}.png` : 'el-sotano.png', { type: 'image/png' }) };
}

async function entregar({ pie, file }) {
  // En el móvil la hoja de compartir deja guardarla en la galería.
  if (navigator.maxTouchPoints > 0 && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: pie }); return; } catch { /* cancelado o sin permiso */ }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// Un formulario de verdad: en el móvil abre el teclado, con tildes y todo, y el canvas no podría.
function pedirNombre(alAceptar) {
  const f = document.createElement('form');
  f.className = 'nombre-foto';
  f.innerHTML = `<div class="nombre-tarjeta">
    <label for="nombre-foto">¿Cómo te llamas?</label>
    <p>Saldrá en el pie: El sótano de (tu nombre).</p>
    <input id="nombre-foto" type="text" maxlength="${MAX_NOMBRE}" autocomplete="given-name" autocapitalize="words" enterkeyhint="done" placeholder="Tu nombre">
    <div class="nombre-botones"><button type="button" class="no">Cancelar</button><button type="submit" class="si">Descargar</button></div>
  </div>`;
  const campo = f.querySelector('input');
  try { campo.value = localStorage.getItem(CLAVE_NOMBRE) ?? ''; } catch { /* sin guardado */ }
  const cerrar = () => f.remove();
  f.querySelector('.no').addEventListener('click', cerrar);
  f.addEventListener('submit', (e) => {
    e.preventDefault();
    const nombre = campo.value.trim().replace(/\s+/g, ' ');
    if (!nombre) { campo.focus(); return; }
    try { localStorage.setItem(CLAVE_NOMBRE, nombre); } catch { /* sin guardado */ }
    cerrar();
    alAceptar(nombre);
  });
  document.body.append(f);
  campo.focus();
}

export function descargarFoto() {
  if (!hayFoto() || document.querySelector('.nombre-foto')) return;
  // Se decodifica antes de preguntar: compartir solo vale justo tras el toque en Descargar.
  const img = new Image();
  img.onload = () => pedirNombre((nombre) => entregar(componer(img, nombre)));
  img.src = localStorage.getItem(CLAVE);
}
