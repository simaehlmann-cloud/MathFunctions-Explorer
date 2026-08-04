/* ==========================================================================
   graph.js  ·  Zeichnen
   Enthaelt den Renderer, die adaptive Achsenteilung (dezimal oder in pi),
   die numerische Suche nach Nullstellen und Schnittpunkten sowie das
   Zeichnen einer kompletten Szene. Bildschirm und PNG-Export nutzen
   dieselbe Szenenfunktion, damit die Ausgabe nicht von der Anzeige abweichen
   kann.
   ========================================================================== */
'use strict';
window.MFE = window.MFE || {};

MFE.colors = (() => {
  let cache = {};
  return {
    get(name) {
      return (cache[name] ??= getComputedStyle(document.documentElement)
        .getPropertyValue(name).trim() || '#888');
    },
    clear() { cache = {}; }
  };
})();

MFE.graph = (() => {
const { clamp, mfmt, piLabel, FUNCTIONS } = MFE.math;   // piLabel lebt im Mathe-Modul
const C = (n) => MFE.colors.get(n);

/* --------------------------------------------------------------------------
   Achsenteilung
   -------------------------------------------------------------------------- */
function niceStep(range, targetTicks) {
  const raw = range / Math.max(2, targetTicks);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const n = raw / mag;
  return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * mag;
}

/** Schrittweite in Vielfachen von pi - so, wie es im Schulbuch steht. */
const PI_STEPS = [Math.PI / 6, Math.PI / 4, Math.PI / 2, Math.PI, 2 * Math.PI, 4 * Math.PI];
function nicePiStep(range, targetTicks) {
  const raw = range / Math.max(2, targetTicks);
  let best = PI_STEPS[0];
  for (const s of PI_STEPS) if (Math.abs(s - raw) < Math.abs(best - raw)) best = s;
  return best;
}

/* --------------------------------------------------------------------------
   Nullstellen und Schnittpunkte
   Beides ist dasselbe Problem: die Nullstellen von h(x). Fuer Schnittpunkte
   ist h(x) = f(x) \u2212 g(x).
   -------------------------------------------------------------------------- */
function findZeros(h, xMin, xMax, samples = 1200, limit = 32) {
  const out = [];
  let px = xMin, py = h(xMin);
  for (let i = 1; i <= samples && out.length < limit; i++) {
    const x = xMin + ((xMax - xMin) * i) / samples;
    const y = h(x);
    if (Number.isFinite(py) && Number.isFinite(y)) {
      if (py === 0) out.push(px);
      else if (py * y < 0) {
        let lo = px, hi = x, flo = py;
        for (let k = 0; k < 60; k++) {
          const mid = (lo + hi) / 2, fm = h(mid);
          if (fm === 0) { lo = hi = mid; break; }
          if (flo * fm < 0) hi = mid; else { lo = mid; flo = fm; }
        }
        out.push((lo + hi) / 2);
      }
    }
    px = x; py = y;
  }
  return out;
}

/* --------------------------------------------------------------------------
   Renderer
   -------------------------------------------------------------------------- */
class Graph {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.w = 0; this.h = 0;
    this.ready = false;
    this.bg = null;                 // nur fuer den Export gesetzt
    this.setView(10, 10);
  }

  setView(xScale, yScale) {
    this.xMax = xScale; this.xMin = -xScale;
    this.yMax = yScale; this.yMin = -yScale;
  }

  /** Groesse kommt aus dem CSS-Layout. Breite 0 (Tab noch versteckt) wird
   *  sauber abgefangen statt durch 0 zu teilen. */
  measure() {
    const r = this.canvas.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) { this.ready = false; return false; }
    const dpr = Math.min(window.devicePixelRatio || 1, 2);   // deckeln
    const pw = Math.round(r.width * dpr), ph = Math.round(r.height * dpr);
    if (this.canvas.width !== pw || this.canvas.height !== ph) {
      this.canvas.width = pw; this.canvas.height = ph;
    }
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.w = r.width; this.h = r.height;
    this.ready = true;
    return true;
  }

  setSize(w, h, scale) {
    this.canvas.width = Math.round(w * scale);
    this.canvas.height = Math.round(h * scale);
    this.ctx.setTransform(scale, 0, 0, scale, 0, 0);
    this.w = w; this.h = h; this.ready = true;
  }

  x2px(x) { return ((x - this.xMin) / (this.xMax - this.xMin)) * this.w; }
  y2px(y) { return this.h - ((y - this.yMin) / (this.yMax - this.yMin)) * this.h; }
  px2x(px) { return this.xMin + (px / this.w) * (this.xMax - this.xMin); }
  py2y(py) { return this.yMin + ((this.h - py) / this.h) * (this.yMax - this.yMin); }

  line(x1, y1, x2, y2, { color = C('--grid'), width = 2, dash = [] } = {}) {
    const c = this.ctx;
    c.save(); c.setLineDash(dash); c.strokeStyle = color; c.lineWidth = width;
    c.beginPath(); c.moveTo(this.x2px(x1), this.y2px(y1)); c.lineTo(this.x2px(x2), this.y2px(y2));
    c.stroke(); c.restore();
  }

  point(x, y, color, r = 6) {
    const c = this.ctx;
    c.save();
    c.fillStyle = color; c.strokeStyle = this.bg || C('--surface'); c.lineWidth = 2;
    c.beginPath(); c.arc(this.x2px(x), this.y2px(y), r, 0, Math.PI * 2);
    c.fill(); c.stroke(); c.restore();
  }

  labelAt(x, y, text, color, pos = 'above') {
    const c = this.ctx;
    const px = this.x2px(x), py = this.y2px(y);
    c.save();
    c.font = '600 12px system-ui, sans-serif';
    c.fillStyle = color;
    c.textAlign = pos === 'right' ? 'left' : pos === 'left' ? 'right' : 'center';
    c.textBaseline = pos === 'below' ? 'top' : pos === 'above' ? 'bottom' : 'middle';
    const dx = pos === 'right' ? 8 : pos === 'left' ? -8 : 0;
    const dy = pos === 'above' ? -10 : pos === 'below' ? 10 : 0;
    c.lineWidth = 3; c.strokeStyle = this.bg || C('--surface');
    c.strokeText(text, px + dx, py + dy);
    c.fillText(text, px + dx, py + dy);
    c.restore();
  }

  drawGrid(piAxis = false) {
    const c = this.ctx, { w, h } = this;
    c.fillStyle = this.bg || C('--surface');
    c.fillRect(0, 0, w, h);

    const rangeX = this.xMax - this.xMin, rangeY = this.yMax - this.yMin;
    const stepX = piAxis ? nicePiStep(rangeX, Math.round(w / 84)) : niceStep(rangeX, Math.round(w / 72));
    const stepY = niceStep(rangeY, Math.round(h / 52));
    const labelX = piAxis ? piLabel : (v) => mfmt(v, 2);
    const x0 = this.x2px(0), y0 = this.y2px(0);

    c.save();
    c.lineWidth = 1; c.strokeStyle = C('--grid');
    c.beginPath();
    for (let x = Math.ceil(this.xMin / stepX) * stepX; x <= this.xMax + 1e-9; x += stepX) {
      const px = Math.round(this.x2px(x)) + 0.5;
      c.moveTo(px, 0); c.lineTo(px, h);
    }
    for (let y = Math.ceil(this.yMin / stepY) * stepY; y <= this.yMax + 1e-9; y += stepY) {
      const py = Math.round(this.y2px(y)) + 0.5;
      c.moveTo(0, py); c.lineTo(w, py);
    }
    c.stroke();

    c.lineWidth = 2; c.strokeStyle = C('--axis');
    c.beginPath();
    c.moveTo(0, Math.round(y0) + 0.5); c.lineTo(w, Math.round(y0) + 0.5);
    c.moveTo(Math.round(x0) + 0.5, 0); c.lineTo(Math.round(x0) + 0.5, h);
    c.stroke();

    c.fillStyle = C('--axis');
    c.font = '11px system-ui, sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'top';
    for (let x = Math.ceil(this.xMin / stepX) * stepX; x <= this.xMax + 1e-9; x += stepX) {
      if (Math.abs(x) < stepX / 1000) continue;
      c.fillText(labelX(x), this.x2px(x), clamp(y0 + 4, 4, h - 16));
    }
    c.textAlign = 'right'; c.textBaseline = 'middle';
    for (let y = Math.ceil(this.yMin / stepY) * stepY; y <= this.yMax + 1e-9; y += stepY) {
      if (Math.abs(y) < stepY / 1000) continue;
      c.fillText(mfmt(y, 2), clamp(x0 - 6, 24, w - 4), this.y2px(y));
    }
    c.textAlign = 'right'; c.textBaseline = 'top';
    c.fillText('0', clamp(x0 - 5, 12, w), clamp(y0 + 4, 0, h - 14));
    c.restore();
  }

  plotFunction(f, v, color, { width = 3, dash = [] } = {}) {
    const c = this.ctx;
    c.save();
    c.strokeStyle = color; c.lineWidth = width; c.setLineDash(dash);
    c.lineJoin = 'round'; c.lineCap = 'round';
    c.beginPath();
    const guard = (this.yMax - this.yMin) * 12;
    let drawing = false, prevY = NaN;
    for (let px = 0; px <= this.w; px += 1) {
      const y = f(this.px2x(px), v);
      if (!Number.isFinite(y) || Math.abs(y) > 1e6) { drawing = false; prevY = NaN; continue; }
      if (drawing && Math.abs(y - prevY) > guard) drawing = false;
      const py = clamp(this.y2px(y), -1e4, 1e4);
      if (!drawing) { c.moveTo(px, py); drawing = true; } else { c.lineTo(px, py); }
      prevY = y;
    }
    c.stroke();
    c.restore();
  }
}

/* --------------------------------------------------------------------------
   Szene
   -------------------------------------------------------------------------- */
const CURVE_COLORS = ['--graph', '--graph2'];
const paramColor = (i) => C(`--p${clamp(i, 1, 4)}`);

function drawScene(g, scene) {
  const { view, opts, curves } = scene;
  g.setView(view.xScale, view.yScale);
  g.drawGrid(view.piAxis);

  const active = curves[scene.activeIndex ?? 0];

  // Hilfslinien nur fuer die aktive Kurve, sonst wird das Bild unlesbar.
  if (opts.helpers && active) {
    const d = FUNCTIONS[active.form];
    if (d.helpers) d.helpers(g, active.values, paramColor);
  }

  // Zielkurve im Nachbau-Modus liegt unter allem anderen
  if (scene.ghost) {
    const gd = FUNCTIONS[scene.ghost.form];
    g.plotFunction(gd.f, scene.ghost.values, C('--muted'), { width: 6, dash: [10, 8] });
  }

  curves.forEach((cu, i) => {
    const d = FUNCTIONS[cu.form];
    g.plotFunction(d.f, cu.values, C(cu.color || CURVE_COLORS[i] || '--graph'), { width: 3 });
  });

  if (opts.roots && active) {
    const d = FUNCTIONS[active.form];
    for (const r of findZeros((x) => d.f(x, active.values), g.xMin, g.xMax)) {
      g.point(r, 0, C('--p2'), 5);
      g.labelAt(r, 0, mfmt(r), C('--p2'), 'below');
    }
  }
  if (opts.yint && active) {
    const y = FUNCTIONS[active.form].f(0, active.values);
    if (Number.isFinite(y)) {
      g.point(0, y, C('--p3'), 5);
      g.labelAt(0, y, `(0 | ${mfmt(y)})`, C('--p3'), 'right');
    }
  }
  if (opts.vertex && active) {
    const d = FUNCTIONS[active.form];
    const vx = d.vertex?.(active.values);
    if (vx && Number.isFinite(vx.x) && Number.isFinite(vx.y)) {
      g.point(vx.x, vx.y, C('--p4'), 6);
      g.labelAt(vx.x, vx.y, `S(${mfmt(vx.x)} | ${mfmt(vx.y)})`, C('--p4'), 'above');
    }
  }

  // Schnittpunkte zweier Kurven: Nullstellen von f(x) \u2212 g(x)
  scene.intersections = [];
  if (opts.intersections && curves.length === 2) {
    const [A, B] = curves.map(cu => ({ f: FUNCTIONS[cu.form].f, v: cu.values }));
    const h = (x) => A.f(x, A.v) - B.f(x, B.v);
    for (const x of findZeros(h, g.xMin, g.xMax)) {
      const y = A.f(x, A.v);
      if (!Number.isFinite(y)) continue;
      scene.intersections.push({ x, y });
      g.point(x, y, C('--accent'), 7);
      g.labelAt(x, y, `(${mfmt(x)} | ${mfmt(y)})`, C('--accent'), 'above');
    }
  }

  if (opts.drag && active) {
    const d = FUNCTIONS[active.form];
    if (d.handles) for (const hd of d.handles(active.values)) g.point(hd.x, hd.y, C('--accent'), 9);
  }
  return scene.intersections;
}

return { Graph, drawScene, findZeros, niceStep, piLabel, CURVE_COLORS, paramColor };
})();
