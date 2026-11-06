// Cajas: cerrada, abierta y el reparto de objetos de uno en uno.
import { spriteTopLeft, viewIndex } from './iso.js';
import { PAL, UI, FONT, drawText } from './gfx.js';

// Planta que suma el ancho del sprite (83) y altura real del cartón: los pisos encajan.
export const BOX = { w: 42, d: 41, h: 48 };

export class Box {
  constructor({ id, at, items, note = null, label = null, open = false }) {
    this.id = id;
    this.x = at[0]; this.y = at[1]; this.z = at[2] ?? 0;
    this.w = BOX.w; this.d = BOX.d; this.h = BOX.h;
    this.items = [...items];  // lista de { id }
    this.note = note;         // la nota se lee antes que los objetos
    this.label = label;
    this.open = open;
  }

  // Abrir; con ella abierta, cada toque saca lo siguiente.
  tap() {
    if (!this.open) { this.open = true; return { opened: true }; }
    if (this.note) { const note = this.note; this.note = null; return { note }; }
    const item = this.items.shift();
    return item ? { item } : {};
  }

  get empty() { return this.open && !this.note && this.items.length === 0; }

  rect(images) {
    const img = images[`${this.open ? 'cajaAbierta' : 'cajaCerrada'}${viewIndex()}`];
    const t = spriteTopLeft(this.x, this.y, this.z, this.w, this.d, img.height);
    return { x: t.x, y: t.y, w: img.width, h: img.height, img };
  }

  draw(ctx, images, time) {
    const r = this.rect(images);
    const breath = this.open && !this.empty ? Math.floor(time / 450) % 2 : 0;
    ctx.drawImage(r.img, r.x, r.y - breath);
    if (!this.label) return;
    // La etiqueta va en un papel pegado, derecha desde cualquier vista.
    const texto = this.label.toUpperCase();
    ctx.font = FONT.label;
    const w = Math.ceil(ctx.measureText(texto).width) + 8;
    const x = Math.round(r.x + r.w / 2 - w / 2), y = Math.round(r.y + r.h * 0.55) - breath;
    ctx.fillStyle = PAL.tinta; ctx.fillRect(x - 1, y - 1, w + 2, 20);
    ctx.fillStyle = UI.papel; ctx.fillRect(x, y, w, 18);
    drawText(ctx, texto, x + 4, y + 1, FONT.label, PAL.tinta);
  }
}
