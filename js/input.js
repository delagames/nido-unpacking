// Gestos táctiles (y ratón): tocar, doble toque, mantener, arrastrar y pellizco.
// Entrega coordenadas lógicas del canvas a los manejadores de `h`.
const SLOP_CSS = 8;      // px CSS antes de considerar que el dedo se ha movido
const HOLD_MS = 380;
const DOUBLE_MS = 320;
const PINCH_STEP = 1.5;  // razón de distancias para cambiar de zoom
const GIRO_RAD = 0.6;    // unos 35° de giro de dos dedos cambian de vista
const GIRO_MIN_CSS = 70; // con los dedos muy juntos el ángulo baila: no cuenta

export function attachInput(canvas, h) {
  const fingers = new Map();
  let one = null;        // gesto de un dedo en curso
  let pinch = null;
  let lastTap = null;

  const logical = (e) => {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * canvas.width / r.width, y: (e.clientY - r.top) * canvas.height / r.height };
  };
  const distance = () => {
    const [a, b] = [...fingers.values()];
    return Math.hypot(a.cx - b.cx, a.cy - b.cy);
  };
  const angle = () => {
    const [a, b] = [...fingers.values()];
    return Math.atan2(b.cy - a.cy, b.cx - a.cx);
  };
  const midpoint = () => {
    const [a, b] = [...fingers.values()];
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  };
  const stopHold = () => { if (one) { clearTimeout(one.timer); one.timer = null; } };

  // Termina el gesto de un dedo. Sin `tap` no cuenta como toque (cancelado o segundo dedo).
  function finish(p, tap) {
    stopHold();
    const g = one;
    one = null;
    if (!g) return;
    if (g.moved || g.held) { (tap ? h.dragEnd : h.dragCancel)?.(p, g.vx, g.vy); return; }
    if (!tap) return;
    const now = performance.now();
    if (lastTap && now - lastTap.t < DOUBLE_MS && Math.hypot(p.x - lastTap.x, p.y - lastTap.y) < 28) {
      lastTap = null;
      h.doubleTap?.(p);
    } else {
      lastTap = { t: now, x: p.x, y: p.y };
      h.tap?.(p);
    }
  }

  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    const p = logical(e);
    fingers.set(e.pointerId, { ...p, cx: e.clientX, cy: e.clientY });
    if (fingers.size === 1) {
      pinch = null;
      one = { id: e.pointerId, cx: e.clientX, cy: e.clientY, p, last: p, t: performance.now(), vx: 0, vy: 0, moved: false, held: false };
      one.timer = setTimeout(() => {
        if (!one || one.moved) return;
        one.timer = null;
        one.held = !!h.hold?.(one.last);
      }, HOLD_MS);
    } else if (fingers.size === 2) {
      // Con un objeto en la mano, rozar con otro dedo no lo suelta ni lo devuelve.
      if (h.ocupado?.()) return;
      finish(p, false);
      pinch = { d: distance(), a: angle(), modo: null };
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    const f = fingers.get(e.pointerId);
    if (!f) return;
    const p = logical(e);
    Object.assign(f, p, { cx: e.clientX, cy: e.clientY });
    if (pinch && fingers.size >= 2) {
      // El primero que pasa su umbral manda hasta levantar los dedos: girar no hace zoom ni al revés.
      const ratio = distance() / pinch.d;
      let giro = angle() - pinch.a;
      giro = Math.atan2(Math.sin(giro), Math.cos(giro));
      if (pinch.modo !== 'zoom' && Math.abs(giro) > GIRO_RAD && distance() > GIRO_MIN_CSS) {
        pinch.modo = 'giro';
        pinch.a = angle();
        h.twist?.(giro > 0 ? 1 : -1);
      } else if (!pinch.modo && (ratio > PINCH_STEP || ratio < 1 / PINCH_STEP)) {
        // Un pellizco, un nivel de zoom: por amplio que sea, no se salta el del medio.
        pinch.modo = 'zoom';
        h.pinch?.(ratio > 1 ? 1 : -1, midpoint());
      }
      return;
    }
    if (!one || one.id !== e.pointerId) return;
    if (!one.moved) {
      if (Math.hypot(e.clientX - one.cx, e.clientY - one.cy) < SLOP_CSS) return;
      one.moved = true;
      stopHold();
      h.dragStart?.(one.p, p);
    }
    const now = performance.now();
    const dt = Math.max(1, now - one.t);
    one.vx = one.vx * 0.5 + 0.5 * (p.x - one.last.x) / dt;
    one.vy = one.vy * 0.5 + 0.5 * (p.y - one.last.y) / dt;
    h.drag?.(p, p.x - one.last.x, p.y - one.last.y);
    one.last = p;
    one.t = now;
  });

  const up = (e, tap) => {
    if (!fingers.delete(e.pointerId)) return;
    if (one?.id === e.pointerId) {
      // Si el dedo lleva un rato parado, no hay inercia.
      if (performance.now() - one.t > 80) { one.vx = 0; one.vy = 0; }
      finish(logical(e), tap);
    }
    if (fingers.size < 2) pinch = null;
  };
  canvas.addEventListener('pointerup', (e) => up(e, true));
  canvas.addEventListener('pointercancel', (e) => up(e, false));

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    h.pinch?.(e.deltaY < 0 ? 1 : -1, logical(e));
  }, { passive: false });

  // Safari reparte sus propios gestos de zoom aunque touch-action sea none.
  for (const ev of ['gesturestart', 'gesturechange', 'contextmenu']) {
    document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
  }
}
