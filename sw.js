// PWA. Imágenes, fuentes, música y voces salen de lo guardado, sin esperar a la red. El código y los
// datos van por red, con un tope de espera: con mala cobertura se tira de lo guardado.
// Se precarga todo al instalar, menos los vídeos, que van por red y pesan 20 MB.
const CACHE = 'nido-88b3d09a9d';

const TIRADA = 8;         // descargas a la vez al instalar: el juego no debe notarlo
const TOPE_RED = 2500;   // ms que se espera a la red antes de tirar de lo guardado

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const lista = await (await fetch('precache.json', { cache: 'no-store' })).json();
    const c = await caches.open(CACHE);
    // Un archivo que falle no tira la instalación: se guardará la primera vez que se use.
    let i = 0;
    const descarga = async () => {
      while (i < lista.length) {
        const url = lista[i++];
        try {
          const r = await fetch(url);
          if (r.ok) await c.put(url, r);
        } catch { /* sin red de momento */ }
      }
    };
    await Promise.all(Array.from({ length: TIRADA }, descarga));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

const clave = (url) => url.origin + url.pathname;   // los reintentos llevan ?r=1

async function guardadoPrimero(req, url) {
  const c = await caches.open(CACHE);
  const hay = await c.match(clave(url));
  if (hay) return hay;
  const r = await fetch(req);
  if (r.status === 200) await c.put(clave(url), r.clone());
  return r;
}

async function redPrimero(req, url) {
  const c = await caches.open(CACHE);
  const hay = await c.match(clave(url));
  const red = fetch(req).then(async (r) => {
    if (r.status === 200) await c.put(clave(url), r.clone());     // un error no pisa lo bueno
    return r;
  });
  if (!hay) return red;
  return Promise.race([
    red.catch(() => hay),
    new Promise((ok) => { setTimeout(() => ok(hay), TOPE_RED); }),
  ]);
}

// El navegador pide el audio a trozos. Se recorta de lo guardado: si no, un corte de wifi deja el juego mudo.
async function trozoGuardado(req, url) {
  const c = await caches.open(CACHE);
  let r = await c.match(clave(url));
  if (!r) {
    r = await fetch(url.href);
    if (r.status !== 200) return r;
    await c.put(clave(url), r.clone());
  }
  const datos = await r.arrayBuffer();
  const total = datos.byteLength;
  const m = /bytes=(\d*)-(\d*)/.exec(req.headers.get('range')) ?? [];
  const desde = m[1] ? Number(m[1]) : m[2] ? Math.max(0, total - Number(m[2])) : 0;
  const hasta = m[1] && m[2] ? Math.min(Number(m[2]), total - 1) : total - 1;
  if (desde > hasta) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${total}` } });
  return new Response(datos.slice(desde, hasta + 1), {
    status: 206,
    headers: {
      'Content-Type': r.headers.get('Content-Type') ?? 'audio/mpeg',
      'Content-Length': String(hasta - desde + 1),
      'Content-Range': `bytes ${desde}-${hasta}/${total}`,
      'Accept-Ranges': 'bytes',
    },
  });
}

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // Los vídeos van directos a la red: pesan demasiado para guardarlos.
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.endsWith('.mp4')) return;
  if (e.request.headers.has('range')) {
    if (url.pathname.endsWith('.mp3')) e.respondWith(trozoGuardado(e.request, url));
    return;
  }
  e.respondWith((url.pathname.includes('/assets/') ? guardadoPrimero : redPrimero)(e.request, url));
});
