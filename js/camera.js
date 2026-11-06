// Ventana sobre el tablero, con dos niveles de zoom. Nunca enseña fuera del tablero.
import { clamp } from './gfx.js';

export class Camera {
  constructor(boardW, boardH) {
    this.bw = boardW; this.bh = boardH;
    this.x = 0; this.y = 0;
    this.vx = 0; this.vy = 0;
    this.zoom = 1;
    this.view = { x: 0, y: 0, w: 1, h: 1 };
  }

  setView(x, y, w, h) {
    const c = this.center();
    this.view = { x, y, w, h };
    this.centerOn(c.x, c.y);
  }

  center() {
    return { x: this.x + this.view.w / this.zoom / 2, y: this.y + this.view.h / this.zoom / 2 };
  }

  centerOn(x, y) {
    this.x = x - this.view.w / this.zoom / 2;
    this.y = y - this.view.h / this.zoom / 2;
    this.clamp();
  }

  clamp() {
    const vw = this.view.w / this.zoom, vh = this.view.h / this.zoom;
    this.x = vw >= this.bw ? (this.bw - vw) / 2 : clamp(this.x, 0, this.bw - vw);
    this.y = vh >= this.bh ? (this.bh - vh) / 2 : clamp(this.y, 0, this.bh - vh);
  }

  pan(dx, dy) {
    this.x -= dx / this.zoom;
    this.y -= dy / this.zoom;
    this.clamp();
  }

  fling(vx, vy) {
    this.vx = clamp(-vx / this.zoom, -1, 1);
    this.vy = clamp(-vy / this.zoom, -1, 1);
  }

  stop() { this.vx = 0; this.vy = 0; }

  update(dt) {
    if (!this.vx && !this.vy) return;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.clamp();
    const f = Math.exp(-dt / 110);
    this.vx *= f; this.vy *= f;
    if (Math.abs(this.vx) + Math.abs(this.vy) < 0.01) this.stop();
  }

  setZoom(z, sx, sy) {
    if (z === this.zoom) return;
    const b = this.toBoard(sx, sy);
    this.zoom = z;
    this.x = b.x - (sx - this.view.x) / z;
    this.y = b.y - (sy - this.view.y) / z;
    this.clamp();
    this.stop();
  }

  toBoard(sx, sy) {
    const z = this.zoom;
    return {
      x: (sx - this.view.x + Math.round(this.x * z)) / z,
      y: (sy - this.view.y + Math.round(this.y * z)) / z,
    };
  }

  apply(ctx) {
    const z = this.zoom;
    ctx.setTransform(z, 0, 0, z, this.view.x - Math.round(this.x * z), this.view.y - Math.round(this.y * z));
  }
}
