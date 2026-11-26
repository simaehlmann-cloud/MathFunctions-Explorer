/* ==========================================================================
   paths-linear.js  ·  Lernpfad "Lineare Funktionen"
   --------------------------------------------------------------------------
   Reihenfolge wie in Klasse 7/8: proportionale Funktion und Steigung, dann
   der y-Achsenabschnitt, dann beides zusammen, Gleichung aus zwei Punkten,
   Nullstellen und zum Schluss zwei Geraden (parallel, senkrecht, Schnitt).
   Aufbau der Schritte: siehe js/paths-quadratic.js.
   ========================================================================== */
'use strict';

(() => {
const { pick, shuffle, near, matchEqTask, buildTask, trueFalseTask } = MFE.paths.kit;

const L = 'linear';                      // f(x) = m·x + b
const lin = (m, b) => ({ m, b });
const TOL = 0.01;
const VIEW = { xMin: -6, xMax: 6, yMin: -6, yMax: 6 };
const SLOPES = [-3, -2, -1, -0.5, 0.5, 1, 2, 3];
const SLOPES_NZ1 = [-3, -2, -0.5, 0.5, 2, 3];
const INTERCEPTS = [-4, -3, -2, -1, 1, 2, 3, 4];

const slopeDir = (m) => (m > 0 ? 'lp.lin.up' : m < 0 ? 'lp.lin.down' : 'lp.lin.flat');

/* ---------- Bausteine ---------- */
/** Steigung aus zwei Punkten - die Punkte liegen auf einer Geraden mit
 *  "schoener" Steigung, damit das Ergebnis eine Zahl aus dem Schulbuch ist. */
function slopeTask(throughOrigin) {
  const m = pick(SLOPES);
  const b = throughOrigin ? 0 : pick(INTERCEPTS);
  let x1 = throughOrigin ? 0 : pick([-3, -2, -1, 0, 1]);
  const dx = pick(m % 1 === 0 ? [1, 2, 3] : [2, 4]);
  const x2 = x1 + dx;
  const y1 = m * x1 + b, y2 = m * x2 + b;
  return {
    type: 'input', form: L,
    q: ['lp.t.slope2', { p1: ['pt', x1, y1], p2: ['pt', x2, y2] }],
    fields: ['lp.f.m'], answers: [m], concept: 'slope',
    explain: ['lp.x.slope2', { dy: y2 - y1, dx, mv: m }]
  };
}

function findBTask() {
  const m = pick(SLOPES), b = pick(INTERCEPTS), x = pick([-2, -1, 1, 2, 3]);
  const y = m * x + b;
  return {
    type: 'input', form: L, q: ['lp.t.findB', { mv: m, p: ['pt', x, y] }],
    fields: ['lp.f.b'], answers: [b], concept: 'yint',
    explain: ['lp.x.findB', { y, mx: m * x, bv: b }]
  };
}

function steepestTask() {
  let set;
  do { set = shuffle([-3, -2, -1, -0.5, 0.5, 1, 2, 3]).slice(0, 4); }
  while (new Set(set.map(Math.abs)).size < 4);
  const best = set.reduce((a, m) => (Math.abs(m) > Math.abs(a) ? m : a), set[0]);
  const rest = set.filter(m => m !== best);
  const b = pick([-1, 0, 1, 2]);
  return { type: 'choice', q: 'lp.t.steepest', form: L,
           options: [best, ...rest].map(m => ({ eq: lin(m, b) })), correct: 0,
           why: { 1: 'lp.why.steep', 2: 'lp.why.steep', 3: 'lp.why.steep' } };
}

/** Wurzel x0 ganzzahlig, Steigung "schoen". */
function rootLine() {
  const r = pick([-4, -3, -2, -1, 1, 2, 3, 4]);
  const m = pick([-2, -1, -0.5, 0.5, 1, 2]);
  return { r, v: lin(m, -m * r) };
}

/* ==========================================================================
   SCHRITTE
   ========================================================================== */
const proportional = {
  id: 'l1', title: 'lp.l1.title', goal: 'lp.l1.goal',
  form: L, start: lin(1, 0), free: ['m'],
  view: VIEW, show: { helpers: true },
  concepts: ['slope'],
  exploreLead: 'lp.l1.lead',
  predict: { q: 'lp.l1.pq', options: ['lp.l1.p0', 'lp.l1.p1', 'lp.l1.p2', 'lp.l1.p3'], correct: 0 },
  missions: [
    { text: 'lp.l1.m1', hint: 'lp.l1.h1', check: (s) => near(s.f(1), 2, TOL) },
    { text: 'lp.l1.m2', hint: 'lp.l1.h2', check: (s) => near(s.f(1), -3, TOL) },
    { text: 'lp.l1.m3', hint: 'lp.l1.h3', check: (s) => near(s.f(4), 2, TOL) }
  ],
  rule: ['lp.l1.r1', 'lp.l1.r2', 'lp.l1.r3', 'lp.l1.r4'],
  tasks: [
    () => matchEqTask(L, lin(pick(SLOPES), 0), ['m']),
    () => buildTask(L, lin(pick(SLOPES_NZ1), 0), lin(1, 0), ['m']),
    () => slopeTask(true),
    () => {
      const m = pick(SLOPES);
      return trueFalseTask(['lp.t.rising', { eq: ['eq', L, lin(m, 0)] }], m > 0, L, 'lp.why.slopeSign');
    },
    steepestTask
  ]
};

const intercept = {
  id: 'l2', title: 'lp.l2.title', goal: 'lp.l2.goal',
  form: L, start: lin(0.5, 0), free: ['b'],
  view: VIEW, ref: { form: L, values: lin(0.5, 0) }, refLabel: 'lp.l2.ref', show: { yint: true },
  concepts: ['yint'],
  predict: { q: 'lp.l2.pq', options: ['lp.l2.p0', 'lp.l2.p1', 'lp.l2.p2', 'lp.l2.p3'], correct: 0 },
  missions: [
    { text: 'lp.l2.m1', hint: 'lp.l2.h1', check: (s) => near(s.v.b, 3, TOL) },
    { text: 'lp.l2.m2', hint: 'lp.l2.h2', check: (s) => near(s.v.b, -2, TOL) },
    { text: 'lp.l2.m3', hint: 'lp.l2.h3', check: (s) => near(s.f(2), 0, TOL) }
  ],
  rule: ['lp.l2.r1', 'lp.l2.r2', 'lp.l2.r3'],
  tasks: [
    () => matchEqTask(L, lin(pick([-1, 0.5, 1, 2]), pick(INTERCEPTS)), ['b']),
    () => buildTask(L, lin(0.5, pick(INTERCEPTS)), lin(0.5, 0), ['b']),
    () => {
      const m = pick(SLOPES), b = pick(INTERCEPTS);
      return { type: 'input', form: L, q: ['lp.t.linYint', { eq: ['eq', L, lin(m, b)] }],
               fields: ['y'], answers: [b], concept: 'yint', explain: ['lp.x.linYint', { bv: b }] };
    },
    findBTask,
    () => {
      const m = pick([0.5, 1, 2, -1]), b = pick(INTERCEPTS);
      const n = Math.abs(b);
      return { type: 'choice', form: L,
               q: ['lp.t.linShift', { eq: ['eq', L, lin(m, b)], base: ['eq', L, lin(m, 0)] }],
               options: [{ k: b > 0 ? 'lp.dir.up' : 'lp.dir.down', v: { n } },
                         { k: b > 0 ? 'lp.dir.down' : 'lp.dir.up', v: { n } },
                         { k: 'lp.dir.right', v: { n } }, { k: 'lp.dir.left', v: { n } }],
               correct: 0, why: { 1: 'lp.why.bSign', 2: 'lp.why.bIsY', 3: 'lp.why.bIsY' } };
    }
  ]
};

const lineFull = {
  id: 'l3', title: 'lp.l3.title', goal: 'lp.l3.goal',
  form: L, start: lin(1, 0), free: ['m', 'b'],
  view: VIEW, show: { helpers: true, yint: true },
  concepts: ['line'],
  predict: { q: 'lp.l3.pq', options: ['lp.l3.p0', 'lp.l3.p1', 'lp.l3.p2', 'lp.l3.p3'], correct: 0 },
  missions: [
    { text: 'lp.l3.m1', hint: 'lp.l3.h1', check: (s) => near(s.f(0), 1, TOL) && near(s.f(2), 5, TOL) },
    { text: 'lp.l3.m2', hint: 'lp.l3.h2', check: (s) => near(s.f(0), 4, TOL) && near(s.f(2), 0, TOL) },
    { text: 'lp.l3.m3', hint: 'lp.l3.h3', check: (s) => near(s.v.m, 0, TOL) && near(s.v.b, -3, TOL) }
  ],
  rule: ['lp.l3.r1', 'lp.l3.r2', 'lp.l3.r3'],
  tasks: [
    () => matchEqTask(L, lin(pick(SLOPES), pick(INTERCEPTS)), ['m', 'b']),
    () => buildTask(L, lin(pick(SLOPES_NZ1), pick(INTERCEPTS)), lin(1, 0), ['m', 'b']),
    () => {
      const m = pick(SLOPES), b = pick(INTERCEPTS), x = pick([-3, -2, -1, 2, 3, 4]);
      return { type: 'input', form: L, q: ['lp.t.linValue', { x, eq: ['eq', L, lin(m, b)] }],
               fields: ['f(x)'], answers: [m * x + b], concept: 'line',
               explain: ['lp.x.linValue', { x, mx: m * x, bv: b, y: m * x + b }] };
    },
    () => {
      const m = pick(SLOPES), b = pick(INTERCEPTS);
      const o = (mm, bb) => ({ k: 'lp.lin.desc', v: { d: ['t', slopeDir(mm)], b: bb } });
      return { type: 'choice', form: L, q: ['lp.t.linDescribe', { eq: ['eq', L, lin(m, b)] }],
               options: [o(m, b), o(-m, b), o(m, m === b ? b + 1 : m), o(-m, m === b ? b + 1 : m)],
               correct: 0,
               why: { 1: 'lp.why.slopeSign', 2: 'lp.why.mbSwap', 3: 'lp.why.mbSwap' },
               remedy: { 1: 'slope', 2: 'yint', 3: 'yint' } };
    },
    () => {
      const m = pick(SLOPES), b = pick(INTERCEPTS), x = pick([-2, -1, 1, 2, 3]);
      const truth = Math.random() < 0.5;
      const y = truth ? m * x + b : m * x + b + pick([-2, -1, 1, 2]);
      return trueFalseTask(['lp.t.onLine', { p: ['pt', x, y], eq: ['eq', L, lin(m, b)] }], truth, L,
                           'lp.why.onLine', ['lp.x.onLine', { x, y: m * x + b }]);
    }
  ]
};

const twoPoints = {
  id: 'l4', title: 'lp.l4.title', goal: 'lp.l4.goal',
  form: L, start: lin(1, 0), free: ['m', 'b'],
  view: VIEW, show: { helpers: true },
  concepts: ['twoPoints'],
  predict: { q: 'lp.l4.pq', options: ['lp.l4.p0', 'lp.l4.p1', 'lp.l4.p2', 'lp.l4.p3'], correct: 0 },
  missions: [
    { text: 'lp.l4.m1', hint: 'lp.l4.h1', check: (s) => near(s.f(1), 3, TOL) && near(s.f(3), 7, TOL) },
    { text: 'lp.l4.m2', hint: 'lp.l4.h2', check: (s) => near(s.f(-2), 4, TOL) && near(s.f(2), 0, TOL) },
    { text: 'lp.l4.m3', hint: 'lp.l4.h3', check: (s) => near(s.f(0), -3, TOL) && near(s.f(4), -1, TOL) }
  ],
  rule: ['lp.l4.r1', 'lp.l4.r2', 'lp.l4.r3'],
  tasks: [
    () => slopeTask(false),
    findBTask,
    () => {
      const m = pick(SLOPES), b = pick(INTERCEPTS);
      const x1 = pick([-2, -1, 0, 1]), x2 = x1 + pick([2, 4]);
      return { type: 'input', form: L,
               q: ['lp.t.twoPoints', { p1: ['pt', x1, m * x1 + b], p2: ['pt', x2, m * x2 + b] }],
               fields: ['lp.f.m', 'lp.f.b'], answers: [m, b], concept: 'twoPoints',
               solution: ['lp.sol.line', { eq: ['eq', L, lin(m, b)] }] };
    },
    () => {
      const m = pick(SLOPES_NZ1), b = pick(INTERCEPTS);
      const x1 = pick([-2, -1, 0]), x2 = x1 + 2;
      return { type: 'choice', form: L,
               q: ['lp.t.throughBoth', { p1: ['pt', x1, m * x1 + b], p2: ['pt', x2, m * x2 + b] }],
               options: [{ eq: lin(m, b) }, { eq: lin(-m, b) }, { eq: lin(m, -b) }, { eq: b === m ? lin(m + 1, b) : lin(b, m) }],
               correct: 0, why: { 1: 'lp.why.slopeSign', 2: 'lp.why.bSign', 3: 'lp.why.mbSwap' } };
    },
    () => matchEqTask(L, lin(pick(SLOPES), pick(INTERCEPTS)), ['m', 'b'])
  ]
};

const linRoots = {
  id: 'l5', title: 'lp.l5.title', goal: 'lp.l5.goal',
  form: L, start: lin(1, 0), free: ['m', 'b'],
  view: VIEW, show: { roots: true },
  concepts: ['linRoot'],
  predict: { q: 'lp.l5.pq', options: ['lp.l5.p0', 'lp.l5.p1', 'lp.l5.p2', 'lp.l5.p3'], correct: 0 },
  missions: [
    { text: 'lp.l5.m1', hint: 'lp.l5.h1', check: (s) => near(s.f(3), 0, TOL) && Math.abs(s.v.m) > TOL },
    { text: 'lp.l5.m2', hint: 'lp.l5.h2', check: (s) => near(s.v.m, 0.5, TOL) && near(s.f(-2), 0, TOL) },
    { text: 'lp.l5.m3', hint: 'lp.l5.h3', check: (s) => near(s.v.m, 0, TOL) && Math.abs(s.v.b) > TOL }
  ],
  rule: ['lp.l5.r1', 'lp.l5.r2', 'lp.l5.r3'],
  tasks: [
    () => {
      const { r, v } = rootLine();
      return { type: 'input', form: L, q: ['lp.t.linRoot', { eq: ['eq', L, v] }],
               fields: ['x'], answers: [r], concept: 'linRoot',
               explain: ['lp.x.linRoot', { mv: v.m, bv: v.b, r }] };
    },
    () => {
      const { r, v } = rootLine();
      // Typische Verwechslungen: Vorzeichen, b selbst, -m. Doppelte fallen weg.
      const uniq = [...new Set([r, -r, v.b, -v.m, r + 1, r - 1])].slice(0, 4);
      return { type: 'choice', form: L, q: ['lp.t.linRootChoice', { eq: ['eq', L, v] }],
               options: uniq.map(x => ({ k: 'lp.lin.xeq', v: { x } })), correct: 0,
               why: Object.fromEntries(uniq.slice(1).map((_, i) => [i + 1, 'lp.why.linRoot'])) };
    },
    () => {
      const { r, v } = rootLine();
      const truth = Math.random() < 0.5;
      const claim = truth ? r : -r;
      return trueFalseTask(['lp.t.linRootTf', { eq: ['eq', L, v], r: claim }], truth, L, 'lp.why.linRoot',
                           ['lp.x.linRoot', { mv: v.m, bv: v.b, r }]);
    },
    () => {
      const b = pick([-3, -2, 2, 3]);
      return { type: 'choice', form: L, q: 'lp.t.noRoot',
               options: [{ eq: lin(0, b) }, { eq: lin(pick([0.5, 1, 2]), b) }, { eq: lin(pick([-1, -2]), 0) },
                         { eq: lin(pick([-0.5, 3]), -b) }],
               correct: 0, why: { 1: 'lp.why.noRoot', 2: 'lp.why.noRoot', 3: 'lp.why.noRoot' } };
    },
    () => {
      const { v } = rootLine();
      return matchEqTask(L, v, ['m', 'b']);
    }
  ]
};

const G = lin(0.5, 2);       // die gestrichelte zweite Gerade g
const twoLines = {
  id: 'l6', title: 'lp.l6.title', goal: 'lp.l6.goal',
  form: L, start: lin(1, 0), free: ['m', 'b'],
  view: VIEW, ref: { form: L, values: G }, refLabel: 'lp.l6.ref',
  concepts: ['twoLines'],
  predict: { q: 'lp.l6.pq', options: ['lp.l6.p0', 'lp.l6.p1', 'lp.l6.p2', 'lp.l6.p3'], correct: 0 },
  missions: [
    { text: 'lp.l6.m1', hint: 'lp.l6.h1', check: (s) => near(s.v.m, 0.5, TOL) && near(s.v.b, -2, TOL) },
    { text: 'lp.l6.m2', hint: 'lp.l6.h2', check: (s) => near(s.v.m, -2, TOL) && near(s.v.b, 0, TOL) },
    { text: 'lp.l6.m3', hint: 'lp.l6.h3', check: (s) => near(s.f(2), 3, TOL) && s.v.m < -TOL }
  ],
  rule: ['lp.l6.r1', 'lp.l6.r2', 'lp.l6.r3'],
  tasks: [
    () => {
      const m = pick(SLOPES_NZ1), b = pick(INTERCEPTS), b2 = pick(INTERCEPTS.filter(x => x !== b));
      return { type: 'choice', form: L, q: ['lp.t.parallel', { eq: ['eq', L, lin(m, b)] }],
               options: [{ eq: lin(m, b2) }, { eq: lin(-m, b) }, { eq: lin(Math.round(100 / m) / 100, b2) }, { eq: lin(2 * m, b) }],
               correct: 0, why: { 1: 'lp.why.parallel', 2: 'lp.why.parallel', 3: 'lp.why.parallel' } };
    },
    () => {
      // Ohne m = 1 und m = -1: dort fallen Kehrwert und Gegenzahl zusammen.
      const m = pick([-2, -0.5, 0.5, 2]), b = pick(INTERCEPTS);
      const perp = -1 / m;
      const opts = [perp, -m, 1 / m, m].map(x => Math.round(x * 100) / 100);
      const uniq = [...new Set(opts)];
      return { type: 'choice', form: L, q: ['lp.t.perp', { eq: ['eq', L, lin(m, b)] }],
               options: uniq.map(x => ({ eq: lin(x, pick([-1, 0, 1])) })), correct: 0,
               why: Object.fromEntries(uniq.slice(1).map((_, i) => [i + 1, 'lp.why.perp'])) };
    },
    () => {
      // Schnittpunkt mit ganzzahligen Koordinaten
      const x = pick([-3, -2, -1, 1, 2, 3]), y = pick([-3, -2, -1, 1, 2, 3]);
      const m1 = pick([2, 1, 0.5]), m2 = pick([-2, -1, -0.5]);
      const f = lin(m1, y - m1 * x), g = lin(m2, y - m2 * x);
      return { type: 'input', form: L,
               q: ['lp.t.intersect', { f: ['eq', L, f], g: ['eqg', L, g] }],
               fields: ['x', 'y'], answers: [x, y], concept: 'twoLines',
               solution: ['lp.sol.point', { p: ['pt', x, y] }],
               explain: ['lp.x.intersect', { x, y }] };
    },
    () => {
      const m = pick(SLOPES_NZ1), b = pick(INTERCEPTS);
      const truth = Math.random() < 0.5;
      const m2 = truth ? m : -m;
      return trueFalseTask(['lp.t.parallelTf', { f: ['eq', L, lin(m, b)], g: ['eqg', L, lin(m2, b + 1)] }],
                           truth, L, 'lp.why.parallel');
    },
    () => buildTask(L, lin(0.5, pick([-4, -2, -1, 1, 3, 4])), lin(1, 0), ['m', 'b'])
  ]
};

MFE.paths.register({
  id: 'linear', category: 'linear', feature: 'cat.linear', title: 'cat.linear',
  concepts: { linear: { m: 'slope', b: 'yint' } },
  steps: [proportional, intercept, lineFull, twoPoints, linRoots, twoLines]
});
})();
