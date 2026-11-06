// El sótano: superficies, obstáculos y zonas de data/room.json. El dibujo viene en assets/bg.
import { hits, inside, toRect } from './gfx.js';

// Distancia mínima entre un objeto y un muro: lo que la pisa, toca pared.
const MARGEN_MURO = 6;

export class Room {
  constructor(data, chapterN) {
    this.data = data;
    const active = (s) => chapterN >= (s.from ?? 0) && chapterN < (s.until ?? Infinity);
    this.surfaces = data.surfaces.filter(active).map((s) => ({ ...s, rect: toRect(s.rect), z: s.z ?? 0 }));
    this.obstacles = data.obstacles.map((o) => ({ ...o, rect: toRect(o.rect) }));
    // Desde el capítulo `cierre` el Alberto se encierra: la puerta deja de ser un paso.
    this.walls = [...data.muros, ...(chapterN >= data.cierre ? data.murosCerrado : [])].map(toRect);
    this.zones = data.zones.map((z) => ({ ...z, name: chapterN >= (z.desde?.n ?? Infinity) ? z.desde.name : z.name, rect: toRect(z.rect) }));
  }

  surface(id) { return this.surfaces.find((s) => s.id === id); }
  floors() { return this.surfaces.filter((s) => s.kind === 'floor'); }
  addObstacle(id, rect) { this.obstacles.push({ id, rect }); }
  removeObstacle(id) { this.obstacles = this.obstacles.filter((o) => o.id !== id); }
  touchesWall(rect) {
    const m = MARGEN_MURO;
    const r = { x: rect.x - m, y: rect.y - m, w: rect.w + m * 2, h: rect.h + m * 2 };
    return this.walls.some((w) => hits(r, w));
  }

  // Cajas y quien esté de pie: no son del cuarto, pero ocupan suelo. Los da el capítulo.
  pisaCuerpo(rect) { return !!this.cuerpos?.().some((c) => hits(rect, c)); }
  solido(rect) { return this.touchesWall(rect) || this.obstacles.some((o) => hits(rect, o.rect)); }
  blocked(rect) { return this.solido(rect) || this.pisaCuerpo(rect); }
  zoneAt(x, y) { return this.zones.find((z) => inside(z.rect, x, y))?.name ?? null; }
}
