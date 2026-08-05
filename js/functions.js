/* ==========================================================================
   functions.js  ·  Zahlen und Funktionskatalog
   Der Katalog beschreibt jede Funktion an genau einer Stelle: Parameter,
   Term, Schreibweise, Hilfslinien, markante Punkte, Ziehpunkte. Eine neue
   Funktion braucht genau einen neuen Eintrag.
   ========================================================================== */
'use strict';
window.MFE = window.MFE || {};

MFE.math = (() => {

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
const DEC = () => (MFE.i18n.lang === 'de' ? ',' : '.');

/** Anzeigeformat. ASCII-Minus, damit kopierte Tabellen in Excel als Zahl
 *  erkannt werden. */
function fmt(n, digits = 2) {
  if (!Number.isFinite(n)) return '\u2013';
  const r = Math.round(n * 10 ** digits) / 10 ** digits;
  return String(r).replace('.', DEC());
}
/** Formelformat mit typografischem Minus (U+2212). */
const mfmt = (n, d = 2) => fmt(n, d).replace('-', '\u2212');

const coef = (n) => (n === 1 ? '' : n === -1 ? '\u2212' : mfmt(n) + '\u00b7');
const term = (n) => (n === 0 ? '' : n < 0 ? `\u2212 ${mfmt(-n)}` : `+ ${mfmt(n)}`);
const bracket = (n) => (n === 0 ? 'x' : n < 0 ? `(x + ${mfmt(-n)})` : `(x \u2212 ${mfmt(n)})`);
const termCoef = (n, sym = 'x') =>
  n === 0 ? '' : `${n < 0 ? '\u2212' : '+'} ${Math.abs(n) === 1 ? '' : mfmt(Math.abs(n)) + '\u00b7'}${sym}`;
const tidy = (s) => s.replace(/\s+/g, ' ').trim();

/** "\u03c0/2", "\u22123\u03c0/2", "2\u03c0" statt 1,57 / \u22124,71 / 6,28.
 *  In jedem Schulbuch steht bei Sinus und Kosinus die \u03c0-Schreibweise; 1,57
 *  ist zwar richtig, aber nicht das, was an der Tafel steht. Ist die Zahl kein
 *  glattes Vielfaches von \u03c0, wird ganz normal dezimal formatiert. */
function piLabel(x) {
  const k = x / Math.PI;
  if (Math.abs(k) < 1e-9) return '0';
  for (const den of [1, 2, 3, 4, 6]) {
    const num = Math.round(k * den);
    if (num !== 0 && Math.abs(k - num / den) < 1e-6) {
      const sign = num < 0 ? '\u2212' : '';
      const a = Math.abs(num);
      const head = a === 1 ? '\u03c0' : `${a}\u03c0`;
      return den === 1 ? sign + head : `${sign}${head}/${den}`;
    }
  }
  return mfmt(x, 2);
}
/** Klammer mit \u03c0-Schreibweise, fuer trigonometrische Funktionen. */
const bracketPi = (n) => (n === 0 ? 'x' : n < 0 ? `(x + ${piLabel(-n)})` : `(x \u2212 ${piLabel(n)})`);

/** Argument einer Sinusfunktion: b\u00b7(x \u2212 c).
 *  Bei b = 1 entfaellt die innere Klammer, sonst stuende dort sin((x + \u03c0)). */
function sinArg(b, c) {
  if (b === 1) return c === 0 ? 'x' : c < 0 ? `x + ${piLabel(-c)}` : `x \u2212 ${piLabel(c)}`;
  return coef(b) + bracketPi(c);
}

/* --------------------------------------------------------------------------
   Zahleneingabe
   Akzeptiert Komma UND Punkt, typografische Minuszeichen aus kopierten
   Arbeitsblaettern, Leerzeichen und Apostroph als Tausendertrenner,
   Bruchschreibweise und pi.
   Bewusst ohne eval oder new Function: Werte koennen ueber Deep Links von
   aussen kommen und duerfen niemals als Code ausgefuehrt werden.
   -------------------------------------------------------------------------- */
function parseAtom(raw) {
  let s = raw, sign = 1;
  if (s.startsWith('-')) { sign = -1; s = s.slice(1); }
  else if (s.startsWith('+')) { s = s.slice(1); }
  let piFactor = 1;
  if (/(pi|\u03c0)$/.test(s)) {
    piFactor = Math.PI;
    s = s.replace(/(pi|\u03c0)$/, '') || '1';
  }
  if (!/^\d*\.?\d*$/.test(s) || s === '' || s === '.') return NaN;
  return sign * parseFloat(s) * piFactor;
}

function parseLoose(raw, fallback = NaN) {
  if (raw === null || raw === undefined) return fallback;
  const s = String(raw).trim().toLowerCase()
    .replace(/[\u2212\u2013\u2014]/g, '-')
    .replace(/[\s\u00a0']/g, '')
    .replace(/,/g, '.');
  if (!s) return fallback;
  const parts = s.split('/');
  if (parts.length > 2) return fallback;
  const nums = parts.map(parseAtom);
  if (nums.some(n => !Number.isFinite(n))) return fallback;
  const v = parts.length === 2 ? nums[0] / nums[1] : nums[0];
  return Number.isFinite(v) ? v : fallback;
}

/* --------------------------------------------------------------------------
   Katalog
   tokens() liefert nur die rechte Seite der Gleichung - der Name f oder g
   wird beim Zeichnen davorgesetzt, damit zwei Kurven denselben Katalog
   nutzen koennen.
   -------------------------------------------------------------------------- */
const T = (text) => ({ text });
const P = (id) => ({ param: id });
const SUP = (text) => ({ sup: text });

const FUNCTIONS = {
  linear: {
    category: 'linear',
    params: [
      { id: 'm', symbol: 'm', value: 1, min: -5, max: 5, step: 0.1, color: 1, desc: 'd.lin.m', pool: [-3, -2, -1, -0.5, 0.5, 1, 2, 3] },
      { id: 'b', symbol: 'b', value: 0, min: -10, max: 10, step: 0.5, color: 2, desc: 'd.lin.b', pool: [-4, -3, -2, -1, 0, 1, 2, 3, 4] }
    ],
    tokens: () => [P('m'), T(' \u00b7 x + '), P('b')],
    f: (x, v) => v.m * x + v.b,
    rhs: (v) => tidy(`${coef(v.m)}x ${term(v.b)}`),
    handles: (v) => [
      { x: 0, y: v.b, hint: 'poi.yint', set: (nx, ny) => ({ b: ny }) },
      { x: 1, y: v.m + v.b, hint: 'd.lin.m', set: (nx, ny) => ({ m: ny - v.b }) }
    ],
    helpers: (g, v, col) => {
      g.line(0, v.b, 1, v.b, { color: col(1), dash: [5, 4] });
      g.line(1, v.b, 1, v.b + v.m, { color: col(1), dash: [5, 4] });
      g.labelAt(0.5, v.b, '1', col(1), 'below');
      g.labelAt(1, v.b + v.m / 2, mfmt(v.m), col(1), 'right');
      g.point(0, v.b, col(2));
    }
  },

  quad_standard: {
    category: 'quadratic',
    params: [
      { id: 'a', symbol: 'a', value: 1, min: -3, max: 3, step: 0.1, color: 1, desc: 'd.q.a', pool: [-2, -1, -0.5, 0.5, 1, 2] },
      { id: 'b', symbol: 'b', value: 0, min: -8, max: 8, step: 0.5, color: 2, desc: 'd.q.b', pool: [-4, -2, -1, 0, 1, 2, 4] },
      { id: 'c', symbol: 'c', value: 0, min: -10, max: 10, step: 0.5, color: 3, desc: 'd.q.c', pool: [-3, -1, 0, 1, 3] }
    ],
    tokens: () => [P('a'), T(' \u00b7 x'), SUP('2'), T(' + '), P('b'), T(' \u00b7 x + '), P('c')],
    f: (x, v) => v.a * x * x + v.b * x + v.c,
    rhs: (v) => tidy(`${coef(v.a)}x\u00b2 ${termCoef(v.b)} ${term(v.c)}`),
    vertex: (v) => (v.a === 0 ? null : { x: -v.b / (2 * v.a), y: v.c - v.b ** 2 / (4 * v.a) }),
    handles: (v) => [{ x: 0, y: v.c, hint: 'poi.yint', set: (nx, ny) => ({ c: ny }) }],
    helpers: (g, v, col) => {
      const vx = FUNCTIONS.quad_standard.vertex(v);
      if (!vx) return;
      g.line(vx.x, g.yMin, vx.x, g.yMax, { color: col(2), dash: [6, 5] });
      g.point(vx.x, vx.y, col(1));
    }
  },

  quad_vertex: {
    category: 'quadratic',
    params: [
      { id: 'a', symbol: 'a', value: 1, min: -3, max: 3, step: 0.1, color: 1, desc: 'd.q.a', pool: [-2, -1, -0.5, 0.5, 1, 2] },
      { id: 'd', symbol: 'd', value: 2, min: -8, max: 8, step: 0.5, color: 2, desc: 'd.q.d', pool: [-3, -2, -1, 0, 1, 2, 3] },
      { id: 'e', symbol: 'e', value: -1, min: -8, max: 8, step: 0.5, color: 3, desc: 'd.q.e', pool: [-3, -2, -1, 0, 1, 2, 3] }
    ],
    tokens: () => [P('a'), T(' \u00b7 (x \u2212 '), P('d'), T(')'), SUP('2'), T(' + '), P('e')],
    f: (x, v) => v.a * (x - v.d) ** 2 + v.e,
    rhs: (v) => tidy(`${coef(v.a)}${bracket(v.d)}\u00b2 ${term(v.e)}`),
    vertex: (v) => ({ x: v.d, y: v.e }),
    transform: true,
    handles: (v) => [{ x: v.d, y: v.e, hint: 'poi.vertex', set: (nx, ny) => ({ d: nx, e: ny }) }],
    helpers: (g, v, col) => {
      g.line(v.d, g.yMin, v.d, g.yMax, { color: col(2), dash: [6, 5] });
      g.line(g.xMin, v.e, g.xMax, v.e, { color: col(3), dash: [2, 5] });
      g.point(v.d, v.e, col(1));
      g.labelAt(v.d, v.e, `(${mfmt(v.d)} | ${mfmt(v.e)})`, col(1), 'above');
    }
  },

  quad_factored: {
    category: 'quadratic',
    params: [
      { id: 'a',  symbol: 'a',  value: 1,  min: -3, max: 3, step: 0.1, color: 1, desc: 'd.q.a',  pool: [-2, -1, -0.5, 0.5, 1, 2] },
      { id: 'x1', symbol: 'x1', value: -1, min: -8, max: 8, step: 0.5, color: 2, desc: 'd.q.x1', pool: [-4, -3, -2, -1, 0] },
      { id: 'x2', symbol: 'x2', value: 3,  min: -8, max: 8, step: 0.5, color: 3, desc: 'd.q.x2', pool: [0, 1, 2, 3, 4] }
    ],
    tokens: () => [P('a'), T(' \u00b7 (x \u2212 '), P('x1'), T(') \u00b7 (x \u2212 '), P('x2'), T(')')],
    f: (x, v) => v.a * (x - v.x1) * (x - v.x2),
    rhs: (v) => tidy(`${coef(v.a)}${bracket(v.x1)}\u00b7${bracket(v.x2)}`),
    vertex: (v) => { const x = (v.x1 + v.x2) / 2; return { x, y: v.a * (x - v.x1) * (x - v.x2) }; },
    handles: (v) => [
      { x: v.x1, y: 0, hint: 'poi.root', set: (nx) => ({ x1: nx }) },
      { x: v.x2, y: 0, hint: 'poi.root', set: (nx) => ({ x2: nx }) }
    ],
    helpers: (g, v, col) => {
      g.point(v.x1, 0, col(2));
      g.point(v.x2, 0, col(3));
      const vx = FUNCTIONS.quad_factored.vertex(v);
      g.line(vx.x, g.yMin, vx.x, g.yMax, { color: col(1), dash: [6, 5] });
    }
  },

  exponential: {
    category: 'exponential',
    params: [
      { id: 'a', symbol: 'a', value: 1, min: -5,  max: 5,  step: 0.1,  color: 1, desc: 'd.exp.a', pool: [-2, -1, 0.5, 1, 2, 3] },
      /* Eigene Grenzen pro Parameter: die Basis darf nicht durch 0 ins
         Negative laufen, dort ist b^x nicht definiert. */
      { id: 'b', symbol: 'b', value: 2, min: 0.1, max: 4,  step: 0.05, color: 2, desc: 'd.exp.b', hardMin: 0.001, pool: [0.5, 0.8, 1.5, 2, 3] },
      { id: 'c', symbol: 'c', value: 0, min: -10, max: 10, step: 0.5,  color: 3, desc: 'd.exp.c', pool: [-2, 0, 1, 2] }
    ],
    tokens: () => [P('a'), T(' \u00b7 '), P('b'), SUP('x'), T(' + '), P('c')],
    f: (x, v) => (v.b > 0 ? v.a * v.b ** x + v.c : NaN),
    rhs: (v) => tidy(`${coef(v.a)}${mfmt(v.b)}^x ${term(v.c)}`),
    asymptote: (v) => v.c,
    handles: (v) => [
      { x: 0, y: v.a + v.c, hint: 'd.exp.a', set: (nx, ny) => ({ a: ny - v.c }) },
      { x: 2, y: v.c, hint: 'poi.asymptote', set: (nx, ny) => ({ c: ny }) }
    ],
    helpers: (g, v, col) => {
      g.line(g.xMin, v.c, g.xMax, v.c, { color: col(3), dash: [8, 5] });
      g.labelAt(g.xMax, v.c, `y = ${mfmt(v.c)}`, col(3), 'left');
      g.point(0, v.a + v.c, col(1));
    }
  },

  sinus: {
    category: 'trig',
    piAxis: true,                       // x-Achse standardmaessig in pi-Schritten
    params: [
      { id: 'a', symbol: 'a', value: 2, min: -5, max: 5, step: 0.1, color: 1, desc: 'd.sin.a', pool: [-2, -1, 0.5, 1, 2, 3] },
      { id: 'b', symbol: 'b', value: 1, min: 0.1, max: 5, step: 0.1, color: 2, desc: 'd.sin.b', hardMin: 0.001, pool: [0.5, 1, 2, 3] },
      { id: 'c', symbol: 'c', value: 0, min: -6.5, max: 6.5, step: 0.1, color: 3, desc: 'd.sin.c', pool: [0, 1, -1, 1.5707963] },
      { id: 'd', symbol: 'd', value: 0, min: -5, max: 5, step: 0.5, color: 4, desc: 'd.sin.d', pool: [-2, -1, 0, 1, 2] }
    ],
    tokens: () => [P('a'), T(' \u00b7 sin('), P('b'), T(' \u00b7 (x \u2212 '), P('c'), T(')) + '), P('d')],
    f: (x, v) => v.a * Math.sin(v.b * (x - v.c)) + v.d,
    rhs: (v) => tidy(`${coef(v.a)}sin(${sinArg(v.b, v.c)}) ${term(v.d)}`),
    handles: (v) => [{ x: v.c, y: v.d, hint: 'd.sin.c', set: (nx, ny) => ({ c: nx, d: ny }) }],
    helpers: (g, v, col) => {
      g.line(g.xMin, v.d, g.xMax, v.d, { color: col(4), dash: [2, 5] });
      g.line(g.xMin, v.d + Math.abs(v.a), g.xMax, v.d + Math.abs(v.a), { color: col(1), dash: [8, 6] });
      g.line(g.xMin, v.d - Math.abs(v.a), g.xMax, v.d - Math.abs(v.a), { color: col(1), dash: [8, 6] });
      const period = (2 * Math.PI) / v.b;
      g.line(v.c, v.d, v.c + period, v.d, { color: col(2), width: 3 });
      g.labelAt(v.c + period / 2, v.d, `T = ${mfmt(period)}`, col(2), 'below');
    }
  },

  tangens: {
    category: 'trig',
    piAxis: true,
    params: [
      { id: 'a', symbol: 'a', value: 1, min: -4, max: 4, step: 0.1, color: 1, desc: 'd.tan.a', pool: [-2, -1, 0.5, 1, 2] },
      { id: 'b', symbol: 'b', value: 1, min: 0.25, max: 4, step: 0.25, color: 2, desc: 'd.tan.b', hardMin: 0.05, pool: [0.5, 1, 2] },
      { id: 'c', symbol: 'c', value: 0, min: -Math.PI, max: Math.PI, step: Math.PI / 12, color: 3, desc: 'd.tan.c', pool: [0, Math.PI / 4, Math.PI / 2] },
      { id: 'd', symbol: 'd', value: 0, min: -4, max: 4, step: 0.25, color: 4, desc: 'd.tan.d', pool: [-1, 0, 1] }
    ],
    tokens: () => [P('a'), T(' \u00b7 tan('), P('b'), T(' \u00b7 (x \u2212 '), P('c'), T(')) + '), P('d')],
    f: (x, v) => {
      if (!v.b) return NaN;
      const arg = v.b * (x - v.c);
      // Genau auf der Polstelle liefert Math.tan wegen Rundung eine riesige
      // endliche Zahl statt Unendlich. Das waere eine Luege im Graphen.
      const k = arg / Math.PI - 0.5;
      if (Math.abs(k - Math.round(k)) < 1e-12) return NaN;
      return v.a * Math.tan(arg) + v.d;
    },
    rhs: (v) => tidy(`${coef(v.a)}tan(${coef(v.b)}(x ${v.c < 0 ? '+ ' + mfmt(-v.c) : '\u2212 ' + mfmt(v.c)})) ${term(v.d)}`),
    /* Polstellen liegen bei c + (pi/2 + k\u00b7pi) / b. Es sind unendlich viele -
       zurueckgegeben werden nur die im sichtbaren Bereich, sonst waere die
       Liste nicht endlich. */
    poles: (v, xMin = -20, xMax = 20) => {
      if (!v.b) return [];
      const out = [];
      const step = Math.PI / v.b;
      const first = v.c + Math.PI / (2 * v.b);
      let k = Math.ceil((xMin - first) / step);
      for (let i = 0; i < 400; i++) {
        const x = first + k * step;
        if (x > xMax) break;
        if (x >= xMin) out.push(x);
        k++;
      }
      return out;
    },
    handles: (v) => [{ x: v.c, y: v.d, hint: 'd.tan.c', set: (nx, ny) => ({ c: nx, d: ny }) }],
    helpers: (g, v, col) => {
      for (const x of FUNCTIONS.tangens.poles(v, g.xMin, g.xMax)) {
        g.line(x, g.yMin, x, g.yMax, { color: col(2), dash: [6, 5] });
      }
      g.line(g.xMin, v.d, g.xMax, v.d, { color: col(4), dash: [3, 6] });
      g.point(v.c, v.d, col(3));
    }
  },

  cubic: {
    category: 'polynomial',
    params: [
      { id: 'a', symbol: 'a', value: 0.2, min: -2, max: 2,  step: 0.05, color: 1, desc: 'd.cub.a', pool: [-1, -0.5, 0.25, 0.5, 1] },
      { id: 'b', symbol: 'b', value: 0,   min: -4, max: 4,  step: 0.1,  color: 2, desc: 'd.cub.b', pool: [-2, -1, 0, 1, 2] },
      { id: 'c', symbol: 'c', value: -2,  min: -8, max: 8,  step: 0.1,  color: 3, desc: 'd.cub.c', pool: [-3, -1, 0, 1, 3] },
      { id: 'd', symbol: 'd', value: 0,   min: -8, max: 8,  step: 0.5,  color: 4, desc: 'd.cub.d', pool: [-2, 0, 1, 2] }
    ],
    tokens: () => [P('a'), T(' \u00b7 x'), SUP('3'), T(' + '), P('b'), T(' \u00b7 x'), SUP('2'), T(' + '), P('c'), T(' \u00b7 x + '), P('d')],
    f: (x, v) => ((v.a * x + v.b) * x + v.c) * x + v.d,      // Horner: stabiler bei grossen x
    rhs: (v) => tidy(`${coef(v.a)}x\u00b3 ${termCoef(v.b, 'x\u00b2')} ${termCoef(v.c)} ${term(v.d)}`),
    handles: (v) => [{ x: 0, y: v.d, hint: 'poi.yint', set: (nx, ny) => ({ d: ny }) }],
    helpers: (g, v, col) => {
      g.point(0, v.d, col(4));
      /* Wendestelle: f''(x) = 6a x + 2b = 0. Bei a = 0 ist die Funktion
         quadratisch, dann gibt es keine. */
      if (v.a !== 0) {
        const xw = -v.b / (3 * v.a);
        const yw = FUNCTIONS.cubic.f(xw, v);
        g.line(xw, g.yMin, xw, g.yMax, { color: col(1), dash: [6, 5] });
        g.point(xw, yw, col(1));
        g.labelAt(xw, yw, 'W', col(1), 'above');
      }
    }
  },

  root: {
    category: 'root',
    params: [
      { id: 'a', symbol: 'a', value: 1, min: -4, max: 4, step: 0.1, color: 1, desc: 'd.root.a', pool: [-2, -1, 0.5, 1, 2] },
      { id: 'b', symbol: 'b', value: 0, min: -8, max: 8, step: 0.5, color: 2, desc: 'd.root.b', pool: [-2, -1, 0, 1, 2] },
      { id: 'c', symbol: 'c', value: 0, min: -8, max: 8, step: 0.5, color: 3, desc: 'd.root.c', pool: [-2, -1, 0, 1, 2] }
    ],
    tokens: () => [P('a'), T(' \u00b7 \u221a(x \u2212 '), P('b'), T(') + '), P('c')],
    // Links von b ist die Wurzel nicht definiert - NaN, nicht 0.
    f: (x, v) => (x < v.b ? NaN : v.a * Math.sqrt(x - v.b) + v.c),
    rhs: (v) => tidy(`${coef(v.a)}\u221a${bracket(v.b)} ${term(v.c)}`),
    domainFrom: (v) => v.b,
    handles: (v) => [{ x: v.b, y: v.c, hint: 'poi.start', set: (nx, ny) => ({ b: nx, c: ny }) }],
    helpers: (g, v, col) => {
      g.line(v.b, g.yMin, v.b, g.yMax, { color: col(2), dash: [3, 6] });
      g.point(v.b, v.c, col(1));
      g.labelAt(v.b, v.c, `(${mfmt(v.b)} | ${mfmt(v.c)})`, col(1), 'above');
    }
  },

  absolute: {
    category: 'absolute',
    params: [
      { id: 'a', symbol: 'a', value: 1, min: -4, max: 4, step: 0.1, color: 1, desc: 'd.abs.a', pool: [-2, -1, 0.5, 1, 2] },
      { id: 'b', symbol: 'b', value: 0, min: -8, max: 8, step: 0.5, color: 2, desc: 'd.abs.b', pool: [-3, -1, 0, 1, 3] },
      { id: 'c', symbol: 'c', value: 0, min: -8, max: 8, step: 0.5, color: 3, desc: 'd.abs.c', pool: [-2, -1, 0, 1, 2] }
    ],
    tokens: () => [P('a'), T(' \u00b7 |x \u2212 '), P('b'), T('| + '), P('c')],
    f: (x, v) => v.a * Math.abs(x - v.b) + v.c,
    rhs: (v) => tidy(`${coef(v.a)}|x ${v.b < 0 ? '+ ' + mfmt(-v.b) : '\u2212 ' + mfmt(v.b)}| ${term(v.c)}`),
    vertex: (v) => ({ x: v.b, y: v.c }),
    handles: (v) => [{ x: v.b, y: v.c, hint: 'poi.kink', set: (nx, ny) => ({ b: nx, c: ny }) }],
    helpers: (g, v, col) => {
      g.line(v.b, g.yMin, v.b, g.yMax, { color: col(2), dash: [6, 5] });
      g.point(v.b, v.c, col(1));
    }
  },

  logarithm: {
    category: 'logarithm',
    params: [
      { id: 'a', symbol: 'a', value: 1, min: -4, max: 4, step: 0.1, color: 1, desc: 'd.log.a', pool: [-2, -1, 0.5, 1, 2] },
      { id: 'b', symbol: 'b', value: 0, min: -8, max: 8, step: 0.5, color: 2, desc: 'd.log.b', pool: [-2, -1, 0, 1] },
      { id: 'c', symbol: 'c', value: 0, min: -8, max: 8, step: 0.5, color: 3, desc: 'd.log.c', pool: [-2, -1, 0, 1, 2] }
    ],
    tokens: () => [P('a'), T(' \u00b7 ln(x \u2212 '), P('b'), T(') + '), P('c')],
    f: (x, v) => (x <= v.b ? NaN : v.a * Math.log(x - v.b) + v.c),
    rhs: (v) => tidy(`${coef(v.a)}ln${bracket(v.b)} ${term(v.c)}`),
    domainFrom: (v) => v.b,
    poles: (v) => [v.b],
    handles: (v) => [{ x: v.b + 1, y: v.c, hint: 'poi.unit', set: (nx, ny) => ({ b: nx - 1, c: ny }) }],
    helpers: (g, v, col) => {
      g.line(v.b, g.yMin, v.b, g.yMax, { color: col(2), dash: [8, 5] });
      g.labelAt(v.b, g.yMax, `x = ${mfmt(v.b)}`, col(2), 'right');
      g.point(v.b + 1, v.c, col(1));
    }
  },

  rational: {
    category: 'rational',
    params: [
      { id: 'a', symbol: 'a', value: 1, min: -6, max: 6, step: 0.1, color: 1, desc: 'd.rat.a', pool: [-3, -2, -1, 1, 2, 3] },
      { id: 'b', symbol: 'b', value: 0, min: -8, max: 8, step: 0.5, color: 2, desc: 'd.rat.b', pool: [-2, -1, 0, 1, 2] },
      { id: 'c', symbol: 'c', value: 0, min: -8, max: 8, step: 0.5, color: 3, desc: 'd.rat.c', pool: [-2, -1, 0, 1, 2] }
    ],
    tokens: () => [P('a'), T(' / (x \u2212 '), P('b'), T(') + '), P('c')],
    // Exakt an der Polstelle ist der Wert nicht definiert; +-Infinity waere
    // beim Zeichnen eine Luege.
    f: (x, v) => (x === v.b ? NaN : v.a / (x - v.b) + v.c),
    rhs: (v) => tidy(`${mfmt(v.a)} / ${bracket(v.b)} ${term(v.c)}`),
    asymptote: (v) => v.c,
    poles: (v) => [v.b],
    handles: (v) => [{ x: v.b + 1, y: v.a + v.c, hint: 'd.rat.a', set: (nx, ny) => ({ a: ny - v.c }) }],
    helpers: (g, v, col) => {
      g.line(v.b, g.yMin, v.b, g.yMax, { color: col(2), dash: [8, 5] });
      g.line(g.xMin, v.c, g.xMax, v.c, { color: col(3), dash: [8, 5] });
      g.labelAt(g.xMax, v.c, `y = ${mfmt(v.c)}`, col(3), 'left');
      g.labelAt(v.b, g.yMin, `x = ${mfmt(v.b)}`, col(2), 'right');
    }
  }
};

/* Reihenfolge = Reihenfolge auf der Startseite. */
const CATEGORY_FORMS = {
  linear: ['linear'],
  quadratic: ['quad_standard', 'quad_vertex', 'quad_factored'],
  polynomial: ['cubic'],
  exponential: ['exponential'],
  logarithm: ['logarithm'],
  trig: ['sinus', 'tangens'],
  root: ['root'],
  absolute: ['absolute'],
  rational: ['rational']
};

return { clamp, fmt, mfmt, coef, term, bracket, bracketPi, termCoef, tidy,
         piLabel, parseLoose, FUNCTIONS, CATEGORY_FORMS };
})();
