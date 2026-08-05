/* ==========================================================================
   graph.js  ·  Zeichnen
   --------------------------------------------------------------------------
   Der Ausschnitt ist seit v5 ein Rechteck aus vier Zahlen
   {xMin, xMax, yMin, yMax} statt zweier Halbweiten. Damit sind
   0 bis 10 auf der x-Achse und 0 bis 1000 auf der y-Achse moeglich - vorher
   war beides nicht darstellbar, obwohl die App selbst mit "a = 100 bei einer
   Bakterienkultur" genau so ein Beispiel erklaert.

   Enthaelt ausserdem: adaptive Achsenteilung (dezimal oder in pi), Pfeile und
   Achsenbeschriftung, numerische Ableitung, Tangente, Trace-Punkt, die Suche
   nach Nullstellen und Schnittpunkten sowie das Zeichnen einer kompletten
   Szene. Bildschirm und PNG-Export nutzen dieselbe Szenenfunktion, damit die
   Ausgabe nicht von der Anzeige abweichen kann.
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
const { clamp, mfmt, piLabel, FUNCTIONS } = MFE.math;
const C = (n) => MFE.colors.get(n);

/* --------------------------------------------------------------------------
   Ausschnitt
   -------------------------------------------------------------------------- */
const DEFAULT_VIEW = { xMin: -10, xMax: 10, yMin: -10, yMax: 10 };

/** Grenzen des Erlaubten. Ohne Untergrenze fuer die Spannweite laesst sich
 *  mit zwei Fingern in Gleitkomma-Rauschen hineinzoomen. */
const MIN_SPAN = 1e-4;
const MAX_SPAN = 1e7;

/** Bringt einen beliebigen Ausschnitt in einen zeichenbaren Zustand.
 *  Faengt vertauschte Grenzen, NaN und entartete Spannweiten ab - solche
 *  Werte koennen ueber Deep Links von aussen kommen. */
function normalizeView(v) {
  const out = { ...DEFAULT_VIEW, ...(v || {}) };
  for (const k of ['xMin', 'xMax', 'yMin', 'yMax']) {
    if (!Number.isFinite(out[k])) return { ...DEFAULT_VIEW, piAxis: !!out.piAxis };
  }
  if (out.xMin > out.xMax) [out.xMin, out.xMax] = [out.xMax, out.xMin];
  if (out.yMin > out.yMax) [out.yMin, out.yMax] = [out.yMax, out.yMin];

  for (const [lo, hi] of [['xMin', 'xMax'], ['yMin', 'yMax']]) {
    let span = out[hi] - out[lo];
    if (!(span > 0)) span = 0;
    const mid = span > 0 ? (out[lo] + out[hi]) / 2 : (out[lo] || 0);
    if (span < MIN_SPAN) { out[lo] = mid - MIN_SPAN / 2; out[hi] = mid + MIN_SPAN / 2; }
    else if (span > MAX_SPAN) { out[lo] = mid - MAX_SPAN / 2; out[hi] = mid + MAX_SPAN / 2; }
  }
  return out;
}

/** Ausschnitt um einen festen Punkt skalieren - das ist die Rechnung hinter
 *  Mausrad und Zwei-Finger-Geste: der Punkt unter dem Finger bleibt liegen. */
function zoomView(view, factor, ax, ay, axis = 'both') {
  const v = { ...view };
  if (axis !== 'y') {
    v.xMin = ax + (v.xMin - ax) * factor;
    v.xMax = ax + (v.xMax - ax) * factor;
  }
  if (axis !== 'x') {
    v.yMin = ay + (v.yMin - ay) * factor;
    v.yMax = ay + (v.yMax - ay) * factor;
  }
  return normalizeView(v);
}

function panView(view, dx, dy) {
  return normalizeView({
    xMin: view.xMin + dx, xMax: view.xMax + dx,
    yMin: view.yMin + dy, yMax: view.yMax + dy,
    piAxis: view.piAxis
  });
}

/** Sucht den y-Bereich, in dem die Kurven im gegebenen x-Fenster wirklich
 *  liegen. Ausreisser an Polstellen wuerden den Bereich sprengen, deshalb
 *  wird nicht ueber Minimum und Maximum gearbeitet, sondern ueber Quantile. */
function fitY(curves, xMin, xMax, samples = 600) {
  const ys = [];
  for (const cu of curves) {
    const d = FUNCTIONS[cu.form];
    if (!d) continue;
    for (let i = 0; i <= samples; i++) {
      const y = d.f(xMin + ((xMax - xMin) * i) / samples, cu.values);
      if (Number.isFinite(y)) ys.push(y);
    }
  }
  if (ys.length < 8) return { yMin: -10, yMax: 10 };
  ys.sort((a, b) => a - b);
  const q = (p) => ys[clamp(Math.round(p * (ys.length - 1)), 0, ys.length - 1)];
  let lo = q(0.02), hi = q(0.98);
  // Die Null gehoert ins Bild, solange sie nicht weit weg liegt.
  if (lo > 0 && lo < (hi - lo) * 1.5) lo = 0;
  if (hi < 0 && -hi < (hi - lo) * 1.5) hi = 0;
  let span = hi - lo;
  if (!(span > 0)) span = Math.max(Math.abs(hi), 1) * 2;
  const pad = span * 0.12;
  return { yMin: lo - pad, yMax: hi + pad };
}

/* --------------------------------------------------------------------------
   Achsenteilung
   -------------------------------------------------------------------------- */
function niceStep(range, targetTicks) {
  const raw = range / Math.max(2, targetTicks);
  if (!(raw > 0) || !Number.isFinite(raw)) return 1;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const n = raw / mag;
  return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * mag;
}

/** Schrittweite in Vielfachen von pi - so, wie es im Schulbuch steht. */
const PI_STEPS = [Math.PI / 6, Math.PI / 4, Math.PI / 2, Math.PI, 2 * Math.PI, 4 * Math.PI, 8 * Math.PI];
function nicePiStep(range, targetTicks) {
  const raw = range / Math.max(2, targetTicks);
  let best = PI_STEPS[0];
  for (const s of PI_STEPS) if (Math.abs(s - raw) < Math.abs(best - raw)) best = s;
  return best;
}

/** Sinnvolle Nachkommastellen fuer die Achsenbeschriftung. Bei einem
 *  Ausschnitt von 0,01 waeren zwei Stellen zu wenig. */
function labelDigits(step) {
  if (!(step > 0)) return 2;
  return clamp(Math.ceil(-Math.log10(step)) + 1, 0, 6);
}

/* --------------------------------------------------------------------------
   Ableitung
   Zentraler Differenzenquotient. Analytisch waere schoener, muesste aber fuer
   jede Funktionsform gepflegt werden und liefe damit irgendwann auseinander;
   numerisch stimmt es fuer den Unterricht auf mehr Stellen, als der Bildschirm
   zeigen kann.
   -------------------------------------------------------------------------- */
function derivative(d, values, x, span = 20) {
  const h = Math.max(Math.abs(x), 1) * 1e-6 + span * 1e-9;
  const a = d.f(x - h, values), b = d.f(x + h, values);
  if (Number.isFinite(a) && Number.isFinite(b)) return (b - a) / (2 * h);
  // Am Rand des Definitionsbereichs einseitig weiterrechnen.
  const c = d.f(x, values);
  if (!Number.isFinite(c)) return NaN;
  if (Number.isFinite(b)) return (b - c) / h;
  if (Number.isFinite(a)) return (c - a) / h;
  return NaN;
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
        // Ein Vorzeichenwechsel an einer Polstelle ist keine Nullstelle:
        // dort springt der Wert, statt durch null zu gehen.
        const m = (lo + hi) / 2;
        if (Math.abs(h(m)) < Math.max(1e-6, Math.abs(y) * 1e-6)) out.push(m);
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
    this.scale = 1;                 // 1 = normal, >1 = Beamer-Modus
    this.setView(DEFAULT_VIEW);
  }

  setView(view) {
    const v = normalizeView(view);
    this.xMin = v.xMin; this.xMax = v.xMax;
    this.yMin = v.yMin; this.yMax = v.yMax;
  }
  get view() { return { xMin: this.xMin, xMax: this.xMax, yMin: this.yMin, yMax: this.yMax }; }

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

  /** Wie viele x-Einheiten ein Bildpunkt breit ist - Grundlage fuer alle
   *  Treffer- und Fangabstaende. */
  get unitPerPx() { return (this.xMax - this.xMin) / Math.max(this.w, 1); }

  line(x1, y1, x2, y2, { color = C('--grid'), width = 2, dash = [] } = {}) {
    const c = this.ctx;
    c.save(); c.setLineDash(dash.map(d => d * this.scale));
    c.strokeStyle = color; c.lineWidth = width * this.scale;
    c.beginPath(); c.moveTo(this.x2px(x1), this.y2px(y1)); c.lineTo(this.x2px(x2), this.y2px(y2));
    c.stroke(); c.restore();
  }

  point(x, y, color, r = 6) {
    const c = this.ctx;
    c.save();
    c.fillStyle = color; c.strokeStyle = this.bg || C('--surface'); c.lineWidth = 2 * this.scale;
    c.beginPath(); c.arc(this.x2px(x), this.y2px(y), r * this.scale, 0, Math.PI * 2);
    c.fill(); c.stroke(); c.restore();
  }

  labelAt(x, y, text, color, pos = 'above') {
    const c = this.ctx;
    const px = clamp(this.x2px(x), 2, this.w - 2);
    const py = clamp(this.y2px(y), 2, this.h - 2);
    c.save();
    c.font = `600 ${Math.round(12 * this.scale)}px system-ui, sans-serif`;
    c.fillStyle = color;
    c.textAlign = pos === 'right' ? 'left' : pos === 'left' ? 'right' : 'center';
    c.textBaseline = pos === 'below' ? 'top' : pos === 'above' ? 'bottom' : 'middle';
    const dx = (pos === 'right' ? 8 : pos === 'left' ? -8 : 0) * this.scale;
    const dy = (pos === 'above' ? -10 : pos === 'below' ? 10 : 0) * this.scale;
    // Weisser Rand hinter der Schrift, damit Beschriftung ueber dem Gitter
    // lesbar bleibt.
    c.lineWidth = 3 * this.scale; c.strokeStyle = this.bg || C('--surface');
    c.strokeText(text, px + dx, py + dy);
    c.fillText(text, px + dx, py + dy);
    c.restore();
  }

  /** Pfeilspitze am Achsenende - steht so in jedem Schulheft. */
  arrow(px, py, dir) {
    const c = this.ctx;
    const s = 7 * this.scale;
    c.save();
    c.fillStyle = C('--axis');
    c.beginPath();
    if (dir === 'right') { c.moveTo(px, py); c.lineTo(px - s * 1.6, py - s * 0.6); c.lineTo(px - s * 1.6, py + s * 0.6); }
    else { c.moveTo(px, py); c.lineTo(px - s * 0.6, py + s * 1.6); c.lineTo(px + s * 0.6, py + s * 1.6); }
    c.closePath(); c.fill(); c.restore();
  }

  drawGrid(piAxis = false) {
    const c = this.ctx, { w, h } = this;
    c.fillStyle = this.bg || C('--surface');
    c.fillRect(0, 0, w, h);

    const rangeX = this.xMax - this.xMin, rangeY = this.yMax - this.yMin;
    const stepX = piAxis ? nicePiStep(rangeX, Math.round(w / (84 * this.scale)))
                         : niceStep(rangeX, Math.round(w / (72 * this.scale)));
    const stepY = niceStep(rangeY, Math.round(h / (52 * this.scale)));
    const digX = labelDigits(stepX), digY = labelDigits(stepY);
    const labelX = piAxis ? piLabel : (v) => mfmt(v, digX);
    // Achsen ausserhalb des Ausschnitts an den Rand legen, damit die
    // Beschriftung nicht verschwindet.
    const x0 = clamp(this.x2px(0), 0, w);
    const y0 = clamp(this.y2px(0), 0, h);

    // Zahl der Linien deckeln: bei extremem Zoom sonst zehntausende Striche.
    const nx = Math.min(Math.floor(rangeX / stepX) + 2, 400);
    const ny = Math.min(Math.floor(rangeY / stepY) + 2, 400);

    c.save();
    c.lineWidth = 1 * this.scale; c.strokeStyle = C('--grid');
    c.beginPath();
    for (let i = 0; i <= nx; i++) {
      const x = (Math.ceil(this.xMin / stepX) + i) * stepX;
      if (x > this.xMax + 1e-9) break;
      const px = Math.round(this.x2px(x)) + 0.5;
      c.moveTo(px, 0); c.lineTo(px, h);
    }
    for (let i = 0; i <= ny; i++) {
      const y = (Math.ceil(this.yMin / stepY) + i) * stepY;
      if (y > this.yMax + 1e-9) break;
      const py = Math.round(this.y2px(y)) + 0.5;
      c.moveTo(0, py); c.lineTo(w, py);
    }
    c.stroke();

    c.lineWidth = 2 * this.scale; c.strokeStyle = C('--axis');
    c.beginPath();
    c.moveTo(0, Math.round(y0) + 0.5); c.lineTo(w, Math.round(y0) + 0.5);
    c.moveTo(Math.round(x0) + 0.5, 0); c.lineTo(Math.round(x0) + 0.5, h);
    c.stroke();
    this.arrow(w - 1, Math.round(y0) + 0.5, 'right');
    this.arrow(Math.round(x0) + 0.5, 1, 'up');

    c.fillStyle = C('--axis');
    c.font = `${Math.round(11 * this.scale)}px system-ui, sans-serif`;
    c.textAlign = 'center'; c.textBaseline = 'top';
    for (let i = 0; i <= nx; i++) {
      const x = (Math.ceil(this.xMin / stepX) + i) * stepX;
      if (x > this.xMax + 1e-9) break;
      if (Math.abs(x) < stepX / 1000) continue;
      c.fillText(labelX(x), this.x2px(x), clamp(y0 + 4, 4, h - 16 * this.scale));
    }
    c.textAlign = 'right'; c.textBaseline = 'middle';
    for (let i = 0; i <= ny; i++) {
      const y = (Math.ceil(this.yMin / stepY) + i) * stepY;
      if (y > this.yMax + 1e-9) break;
      if (Math.abs(y) < stepY / 1000) continue;
      c.fillText(mfmt(y, digY), clamp(x0 - 6, 26 * this.scale, w - 4), this.y2px(y));
    }
    // Ursprung nur beschriften, wenn er im Bild liegt.
    if (this.xMin < 0 && this.xMax > 0 && this.yMin < 0 && this.yMax > 0) {
      c.textAlign = 'right'; c.textBaseline = 'top';
      c.fillText('0', x0 - 5, y0 + 4);
    }
    // Achsennamen
    c.font = `italic 600 ${Math.round(13 * this.scale)}px var(--ff-math), Georgia, serif`;
    c.textAlign = 'right'; c.textBaseline = 'bottom';
    c.fillText('x', w - 6 * this.scale, clamp(y0 - 6, 14, h - 2));
    c.textAlign = 'left'; c.textBaseline = 'top';
    c.fillText('y', clamp(x0 + 8, 2, w - 14), 6 * this.scale);
    c.restore();
  }

  /**
   * Zeichnet eine Funktion. Der Stift wird abgesetzt, wenn der Wert nicht
   * definiert ist, wenn er ins Unermessliche laeuft oder wenn zwischen zwei
   * Bildpunkten ein Sprung liegt - sonst zoege eine Hyperbel eine senkrechte
   * Linie durch ihre Polstelle.
   */
  plotFunction(f, v, color, { width = 3, dash = [], poles = [] } = {}) {
    const c = this.ctx;
    c.save();
    c.strokeStyle = color; c.lineWidth = width * this.scale; c.setLineDash(dash.map(d => d * this.scale));
    c.lineJoin = 'round'; c.lineCap = 'round';
    c.beginPath();
    const guard = (this.yMax - this.yMin) * 12;
    let drawing = false, prevY = NaN, prevX = NaN;
    const step = Math.max(0.5, 1 / Math.min(window.devicePixelRatio || 1, 2));
    for (let px = 0; px <= this.w; px += step) {
      const x = this.px2x(px);
      const y = f(x, v);
      if (!Number.isFinite(y) || Math.abs(y) > 1e12) { drawing = false; prevY = NaN; prevX = x; continue; }
      if (drawing) {
        if (Math.abs(y - prevY) > guard) drawing = false;
        // Bekannte Polstelle zwischen den letzten beiden Punkten
        else if (poles.some(p => (prevX - p) * (x - p) < 0)) drawing = false;
      }
      const py = clamp(this.y2px(y), -1e4, 1e4);
      if (!drawing) { c.moveTo(px, py); drawing = true; } else { c.lineTo(px, py); }
      prevY = y; prevX = x;
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
  const { opts, curves } = scene;
  const view = normalizeView(scene.view);
  g.scale = scene.scale || 1;
  g.setView(view);
  g.drawGrid(view.piAxis);

  const active = curves[scene.activeIndex ?? 0];
  const activeDef = active ? FUNCTIONS[active.form] : null;
  // Der sichtbare Bereich wird mitgegeben: bei tan gibt es unendlich viele
  // Polstellen, endlich sind nur die im Bild.
  const polesOf = (cu) => FUNCTIONS[cu.form]?.poles?.(cu.values, view.xMin, view.xMax) ?? [];

  // Hilfslinien nur fuer die aktive Kurve, sonst wird das Bild unlesbar.
  if (opts.helpers && activeDef?.helpers) activeDef.helpers(g, active.values, paramColor);

  // Zielkurve im Nachbau-Modus liegt unter allem anderen
  if (scene.ghost) {
    const gd = FUNCTIONS[scene.ghost.form];
    if (gd) g.plotFunction(gd.f, scene.ghost.values, C('--muted'),
      { width: 6, dash: [10, 8], poles: gd.poles?.(scene.ghost.values, view.xMin, view.xMax) ?? [] });
  }

  // Ableitung liegt unter der Funktion, damit die Funktion oben bleibt
  if (opts.derivative && activeDef) {
    g.plotFunction((x) => derivative(activeDef, active.values, x, view.xMax - view.xMin), null,
      C('--deriv'), { width: 2, dash: [7, 5], poles: polesOf(active) });
  }

  curves.forEach((cu, i) => {
    const d = FUNCTIONS[cu.form];
    if (!d) return;
    g.plotFunction(d.f, cu.values, C(cu.color || CURVE_COLORS[i] || '--graph'),
      { width: 3, poles: polesOf(cu) });
  });

  if (opts.roots && activeDef) {
    for (const r of findZeros((x) => activeDef.f(x, active.values), g.xMin, g.xMax)) {
      g.point(r, 0, C('--p2'), 5);
      g.labelAt(r, 0, mfmt(r), C('--p2'), 'below');
    }
  }
  if (opts.yint && activeDef) {
    const y = activeDef.f(0, active.values);
    if (Number.isFinite(y) && g.xMin <= 0 && g.xMax >= 0) {
      g.point(0, y, C('--p3'), 5);
      g.labelAt(0, y, `(0 | ${mfmt(y)})`, C('--p3'), 'right');
    }
  }
  if (opts.vertex && activeDef) {
    const vx = activeDef.vertex?.(active.values);
    if (vx && Number.isFinite(vx.x) && Number.isFinite(vx.y)) {
      g.point(vx.x, vx.y, C('--p4'), 6);
      g.labelAt(vx.x, vx.y, `S(${mfmt(vx.x)} | ${mfmt(vx.y)})`, C('--p4'), 'above');
    }
  }

  // Schnittpunkte zweier Kurven: Nullstellen von f(x) \u2212 g(x)
  scene.intersections = [];
  if (opts.intersections && curves.length === 2 && FUNCTIONS[curves[0].form] && FUNCTIONS[curves[1].form]) {
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

  // Tangente an einer frei waehlbaren Stelle
  scene.tangentInfo = null;
  if (opts.tangent && activeDef && Number.isFinite(scene.tangentX)) {
    const x0 = clamp(scene.tangentX, g.xMin, g.xMax);
    const y0 = activeDef.f(x0, active.values);
    const m = derivative(activeDef, active.values, x0, g.xMax - g.xMin);
    if (Number.isFinite(y0) && Number.isFinite(m)) {
      const span = g.xMax - g.xMin;
      g.line(x0 - span, y0 - m * span, x0 + span, y0 + m * span, { color: C('--tangent'), width: 2 });
      g.point(x0, y0, C('--tangent'), 7);
      g.labelAt(x0, y0, `m = ${mfmt(m)}`, C('--tangent'), 'above');
      scene.tangentInfo = { x: x0, y: y0, m };
    }
  }

  // Trace: mit dem Finger am Graphen entlang
  scene.traceInfo = null;
  if (opts.trace && activeDef && Number.isFinite(scene.traceX)) {
    const x0 = clamp(scene.traceX, g.xMin, g.xMax);
    const y0 = activeDef.f(x0, active.values);
    if (Number.isFinite(y0)) {
      g.line(x0, g.yMin, x0, g.yMax, { color: C('--trace'), width: 1, dash: [3, 4] });
      g.line(g.xMin, y0, g.xMax, y0, { color: C('--trace'), width: 1, dash: [3, 4] });
      g.point(x0, y0, C('--trace'), 7);
      g.labelAt(x0, y0, `(${mfmt(x0)} | ${mfmt(y0)})`, C('--trace'), 'above');
      scene.traceInfo = { x: x0, y: y0 };
    }
  }

  if (opts.drag && activeDef?.handles) {
    for (const hd of activeDef.handles(active.values)) g.point(hd.x, hd.y, C('--accent'), 9);
  }
  return scene.intersections;
}

return {
  Graph, drawScene, findZeros, niceStep, piLabel, derivative,
  normalizeView, zoomView, panView, fitY, labelDigits,
  DEFAULT_VIEW, MIN_SPAN, MAX_SPAN, CURVE_COLORS, paramColor
};
})();
