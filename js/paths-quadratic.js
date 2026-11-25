/* ==========================================================================
   paths-quadratic.js  ·  Lernpfad "Quadratische Funktionen"
   --------------------------------------------------------------------------
   Reihenfolge wie in den Westermann-Lehrwerken (Parallelo, Elemente,
   Mathematik heute): erst die Normalparabel, dann jede Verschiebung fuer
   sich, dann die Streckung, dann alles zusammen, zuletzt Normalform und
   Nullstellen. Wer ein anderes Lehrwerk nutzt, stellt die Schritte in der
   Liste ganz unten um - die Engine haengt an keiner Reihenfolge.

   Jeder Schritt:
     form/start/free  Darstellungsform, Startwerte, frei bewegliche Regler
     trace            zusaetzlicher x-Regler mit Punkt auf dem Graphen
     view/ref/show    Ausschnitt, gestrichelte Vergleichskurve, Markierungen
     concepts         Begriffe, die der Schritt einfuehrt (Rueckverweise)
     predict          Frage vor dem Ausprobieren
     missions         Auftraege; check() laeuft beim Loslassen des Reglers
     rule             Merkkasten
     tasks            Erzeuger fuer die Uebungsaufgaben

   Texte stehen in js/i18n.js unter "lp.q.*" und "lp.t.*". In den Texten
   stehen Parameter als {a}, {d}, {e} - die Engine setzt dort die Buchstaben
   ein, die in den Einstellungen gewaehlt sind.
   ========================================================================== */
'use strict';

(() => {
const { pick, shuffle, near, eqOptions } = MFE.paths.kit;
const { FUNCTIONS } = MFE.math;

const V = 'quad_vertex';     // a·(x − d)² + e
const S = 'quad_standard';   // a·x² + b·x + c
const vtx = (a, d, e) => ({ a, d, e });
const std = (a, b, c) => ({ a, b, c });
const NORMAL = { form: V, values: vtx(1, 0, 0) };
const TOL = 0.01;

const SHIFTS = [-5, -4, -3, -2, -1, 1, 2, 3, 4, 5];
const SMALL = [-3, -2, -1, 1, 2, 3];
const STRETCH = [-3, -2, -1, -0.5, 0.5, 2, 3];

/* ---------- Aufgabenbausteine, die mehrere Schritte nutzen ---------- */
function matchEq(form, values, free, extra = []) {
  const { options, correct } = eqOptions(form, values, free, 3, extra);
  return { type: 'choice', q: 'lp.t.matchEq', form, graph: { form, values }, options, correct, kind: 'graphEq' };
}

function build(form, target, start, free, view) {
  const task = { type: 'build', q: 'lp.t.build', form, target, start, free };
  if (view) task.view = view;
  return task;
}

function vertexInput(form, values, concept) {
  const vx = FUNCTIONS[form].vertex(values);
  return {
    type: 'input', q: ['lp.t.vertex', { eq: ['eq', form, values] }], form,
    fields: ['x', 'y'], answers: [vx.x, vx.y], concept,
    solution: ['lp.sol.vertex', { p: ['pt', vx.x, vx.y] }]
  };
}

/** Richtung einer Verschiebung als Auswahl. axis: 'x' oder 'y'. */
function directionTask(values, axis) {
  const n = Math.abs(axis === 'x' ? values.d : values.e);
  const pos = (axis === 'x' ? values.d : values.e) > 0;
  const right = axis === 'x' ? (pos ? 'lp.dir.right' : 'lp.dir.left') : (pos ? 'lp.dir.up' : 'lp.dir.down');
  const wrong = axis === 'x' ? (pos ? 'lp.dir.left' : 'lp.dir.right') : (pos ? 'lp.dir.down' : 'lp.dir.up');
  const other = axis === 'x' ? ['lp.dir.up', 'lp.dir.down'] : ['lp.dir.right', 'lp.dir.left'];
  const concept = axis === 'x' ? 'shiftX' : 'shiftY';
  return {
    type: 'choice', q: ['lp.t.dirQ', { eq: ['eq', V, values] }], form: V,
    options: [{ k: right, v: { n } }, { k: wrong, v: { n } }, { k: other[0], v: { n } }, { k: other[1], v: { n } }],
    correct: 0,
    why: { 1: axis === 'x' ? 'lp.why.innerShift' : 'lp.why.shiftY', 2: 'lp.why.xy', 3: 'lp.why.xy' },
    remedy: { 1: concept, 2: concept, 3: concept }
  };
}

/** Wahr/Falsch. truth: Ist die Aussage wahr? whyIfWrong: Erklaerung, wenn
 *  daneben getippt wird. */
function trueFalse(q, truth, form, whyIfWrong, explain) {
  return {
    type: 'choice', q, form,
    options: [{ k: 'lp.true' }, { k: 'lp.false' }],
    correct: truth ? 0 : 1,
    why: { [truth ? 1 : 0]: whyIfWrong },
    explain
  };
}

const roots = (v) => {
  // Nur fuer a·(x − d)² + e mit e/a <= 0.
  const r = Math.sqrt(-v.e / v.a);
  return [v.d - r, v.d + r];
};

/* ==========================================================================
   SCHRITTE
   ========================================================================== */

/* 1 · Die Normalparabel ------------------------------------------------- */
const normal = {
  id: 'q1', title: 'lp.q1.title', goal: 'lp.q1.goal',
  form: V, start: vtx(1, 0, 0), free: [],
  trace: { min: -3, max: 3, step: 0.5, start: 1 },
  view: { xMin: -5, xMax: 5, yMin: -1, yMax: 10 },
  concepts: ['normal'],
  exploreLead: 'lp.q1.lead',
  predict: { q: 'lp.q1.pq', options: ['lp.q1.p0', 'lp.q1.p1', 'lp.q1.p2', 'lp.q1.p3'], correct: 0 },
  missions: [
    { text: 'lp.q1.m1', hint: 'lp.q1.h1', check: (s) => near(s.y, 4, TOL),
      done: (s, memo) => { memo.x1 = s.x; } },
    { text: 'lp.q1.m2', hint: 'lp.q1.h2', check: (s, memo) => near(s.y, 4, TOL) && Math.abs(s.x - memo.x1) > 0.1 },
    { text: 'lp.q1.m3', hint: 'lp.q1.h3', check: (s) => near(s.x, 0, TOL) }
  ],
  rule: ['lp.q1.r1', 'lp.q1.r2', 'lp.q1.r3', 'lp.q1.r4'],
  tasks: [
    // Funktionswert, gern mit negativem x - (-3)² ist der Klassiker.
    () => {
      const x = pick([-4, -3, -2, -1, 2, 3, 4]);
      return { type: 'input', q: ['lp.t.square', { x }], form: V, fields: ['f(x)'], answers: [x * x],
               concept: 'normal', explain: ['lp.x.square', { x, y: x * x }] };
    },
    // Liegt der Punkt auf der Normalparabel?
    () => {
      const x = pick([-3, -2, -1, 1, 2, 3]);
      const truth = Math.random() < 0.5;
      const y = truth ? x * x : pick([-x * x, x * x + 1, 2 * x].filter(v => v !== x * x));
      return trueFalse(['lp.t.onNormal', { p: ['pt', x, y] }], truth, V, 'lp.why.square',
                       ['lp.x.square', { x, y: x * x }]);
    },
    // Welcher Punkt liegt NICHT darauf?
    () => {
      const xs = shuffle([-3, -2, -1, 1, 2, 3]).slice(0, 4);
      const bad = xs[0];
      const badY = pick([-bad * bad, 2 * bad, bad * bad + 2].filter(v => v !== bad * bad));
      const options = [{ k: 'lp.pt', v: { p: ['pt', bad, badY] } },
                       ...xs.slice(1).map(x => ({ k: 'lp.pt', v: { p: ['pt', x, x * x] } }))];
      return { type: 'choice', q: 'lp.t.notOnNormal', form: V, options, correct: 0,
               why: { 1: 'lp.why.square', 2: 'lp.why.square', 3: 'lp.why.square' } };
    },
    // Symmetrie
    () => {
      const x = pick([-3, -2, -1, 1, 2, 3]);
      return { type: 'input', q: ['lp.t.mirror', { p: ['pt', x, x * x] }], form: V, fields: ['x'],
               answers: [-x], concept: 'normal', explain: ['lp.x.mirror', { x, mx: -x, y: x * x }] };
    },
    // Eigenschaften
    () => {
      const wrong = shuffle(['lp.q1.f0', 'lp.q1.f1', 'lp.q1.f2', 'lp.q1.f3']).slice(0, 3);
      const right = pick(['lp.q1.t0', 'lp.q1.t1', 'lp.q1.t2']);
      return { type: 'choice', q: 'lp.t.propNormal', form: V,
               options: [{ k: right }, ...wrong.map(k => ({ k }))], correct: 0 };
    }
  ]
};

/* 2 · Verschiebung in y-Richtung --------------------------------------- */
const shiftY = {
  id: 'q2', title: 'lp.q2.title', goal: 'lp.q2.goal',
  form: V, start: vtx(1, 0, 0), free: ['e'],
  view: { xMin: -6, xMax: 6, yMin: -7, yMax: 10 },
  ref: NORMAL, show: { vertex: true },
  concepts: ['shiftY'],
  predict: { q: 'lp.q2.pq', options: ['lp.q2.p0', 'lp.q2.p1', 'lp.q2.p2', 'lp.q2.p3'], correct: 0 },
  missions: [
    { text: 'lp.q2.m1', hint: 'lp.q2.h1', check: (s) => near(s.v.e, 3, TOL) },
    { text: 'lp.q2.m2', hint: 'lp.q2.h2', check: (s) => near(s.v.e, -2, TOL) },
    { text: 'lp.q2.m3', hint: 'lp.q2.h3', check: (s) => near(s.f(2), 1, TOL) }
  ],
  rule: ['lp.q2.r1', 'lp.q2.r2', 'lp.q2.r3'],
  tasks: [
    () => matchEq(V, vtx(1, 0, pick(SHIFTS)), ['e']),
    () => build(V, vtx(1, 0, pick(SHIFTS)), vtx(1, 0, 0), ['e']),
    () => vertexInput(V, vtx(1, 0, pick(SHIFTS)), 'shiftY'),
    () => directionTask(vtx(1, 0, pick(SHIFTS)), 'y'),
    () => {
      const x = pick([-2, -1, 1, 2, 3]);
      const e = pick(SHIFTS);
      const y = x * x + e;
      return { type: 'input', q: ['lp.t.findE', { p: ['pt', x, y] }], form: V, fields: ['lp.f.e'],
               answers: [e], concept: 'shiftY', explain: ['lp.x.findE', { y, x2: x * x, ev: e }] };
    }
  ]
};

/* 3 · Verschiebung in x-Richtung --------------------------------------- */
const shiftX = {
  id: 'q3', title: 'lp.q3.title', goal: 'lp.q3.goal',
  form: V, start: vtx(1, 0, 0), free: ['d'],
  view: { xMin: -8, xMax: 8, yMin: -2, yMax: 12 },
  ref: NORMAL, show: { vertex: true },
  concepts: ['shiftX'],
  predict: { q: 'lp.q3.pq', options: ['lp.q3.p0', 'lp.q3.p1', 'lp.q3.p2', 'lp.q3.p3'], correct: 0 },
  missions: [
    { text: 'lp.q3.m1', hint: 'lp.q3.h1', check: (s) => near(s.v.d, 3, TOL) },
    { text: 'lp.q3.m2', hint: 'lp.q3.h2', check: (s) => near(s.v.d, -2, TOL) },
    { text: 'lp.q3.m3', hint: 'lp.q3.h3', check: (s) => near(s.f(0), 4, TOL),
      done: (s, memo) => { memo.d = s.v.d; } },
    { text: 'lp.q3.m4', hint: 'lp.q3.h4', check: (s, memo) => near(s.f(0), 4, TOL) && Math.abs(s.v.d - memo.d) > 0.1 }
  ],
  rule: ['lp.q3.r1', 'lp.q3.r2', 'lp.q3.r3', 'lp.q3.r4'],
  tasks: [
    () => matchEq(V, vtx(1, pick(SHIFTS), 0), ['d']),
    () => build(V, vtx(1, pick(SHIFTS), 0), vtx(1, 0, 0), ['d']),
    () => vertexInput(V, vtx(1, pick(SHIFTS), 0), 'shiftX'),
    () => directionTask(vtx(1, pick(SHIFTS), 0), 'x'),
    () => {
      const d = pick(SHIFTS);
      return { type: 'choice', q: ['lp.t.whichVertex', { p: ['pt', d, 0] }], form: V,
               options: [{ eq: vtx(1, d, 0) }, { eq: vtx(1, -d, 0) }, { eq: vtx(1, 0, d) }, { eq: vtx(1, 0, -d) }],
               correct: 0, why: { 1: 'lp.why.innerShift', 2: 'lp.why.xy', 3: 'lp.why.xy' } };
    }
  ]
};

/* 4 · Verschiebung in beide Richtungen --------------------------------- */
const shiftXY = {
  id: 'q4', title: 'lp.q4.title', goal: 'lp.q4.goal',
  form: V, start: vtx(1, 0, 0), free: ['d', 'e'],
  view: { xMin: -8, xMax: 8, yMin: -8, yMax: 8 },
  ref: NORMAL, show: { vertex: true },
  concepts: ['vertexShift'],
  predict: { q: 'lp.q4.pq', options: ['lp.q4.p0', 'lp.q4.p1', 'lp.q4.p2', 'lp.q4.p3'], correct: 0 },
  missions: [
    { text: 'lp.q4.m1', hint: 'lp.q4.h1', check: (s) => near(s.v.d, 2, TOL) && near(s.v.e, -1, TOL) },
    { text: 'lp.q4.m2', hint: 'lp.q4.h2', check: (s) => near(s.v.d, -3, TOL) && near(s.v.e, 2, TOL) },
    { text: 'lp.q4.m3', hint: 'lp.q4.h3', check: (s) => near(s.v.d, 4, TOL) && near(s.v.e, 0, TOL) }
  ],
  rule: ['lp.q4.r1', 'lp.q4.r2', 'lp.q4.r3'],
  tasks: [
    () => matchEq(V, vtx(1, pick(SMALL), pick(SMALL)), ['d', 'e']),
    () => build(V, vtx(1, pick(SMALL), pick(SMALL)), vtx(1, 0, 0), ['d', 'e']),
    () => vertexInput(V, vtx(1, pick(SHIFTS), pick(SHIFTS)), 'shiftX'),
    () => {
      const d = pick(SMALL);
      let e = pick(SMALL);
      if (Math.abs(e) === Math.abs(d)) e = e > 0 ? e + 1 : e - 1;   // sonst fallen Ablenker zusammen
      return { type: 'choice', q: ['lp.t.whichVertex', { p: ['pt', d, e] }], form: V,
               options: [{ eq: vtx(1, d, e) }, { eq: vtx(1, -d, e) }, { eq: vtx(1, d, -e) }, { eq: vtx(1, e, d) }],
               correct: 0,
               why: { 1: 'lp.why.innerShift', 2: 'lp.why.shiftY', 3: 'lp.why.swap' },
               remedy: { 1: 'shiftX', 2: 'shiftY' } };
    },
    () => {
      const d = pick(SMALL), e = pick(SMALL);
      const truth = Math.random() < 0.5;
      const p = truth ? ['pt', d, e] : ['pt', -d, e];
      return trueFalse(['lp.t.isVertex', { p, eq: ['eq', V, vtx(1, d, e)] }], truth, V,
                       truth ? 'lp.why.vertexRead' : 'lp.why.innerShift',
                       ['lp.x.vertexRead', { p: ['pt', d, e] }]);
    }
  ]
};

/* 5 · Strecken, Stauchen, Spiegeln ------------------------------------- */
const stretch = {
  id: 'q5', title: 'lp.q5.title', goal: 'lp.q5.goal',
  form: V, start: vtx(1, 0, 0), free: ['a'],
  view: { xMin: -5, xMax: 5, yMin: -8, yMax: 8 },
  ref: NORMAL, show: { pointAt: 1 },
  concepts: ['stretch'],
  exploreLead: 'lp.q5.lead',
  predict: { q: 'lp.q5.pq', options: ['lp.q5.p0', 'lp.q5.p1', 'lp.q5.p2', 'lp.q5.p3'], correct: 0 },
  missions: [
    { text: 'lp.q5.m1', hint: 'lp.q5.h1', check: (s) => near(s.v.a, -1, TOL) },
    { text: 'lp.q5.m2', hint: 'lp.q5.h2', check: (s) => near(s.f(1), 3, TOL) },
    { text: 'lp.q5.m3', hint: 'lp.q5.h3', check: (s) => near(s.f(2), 2, TOL) }
  ],
  rule: ['lp.q5.r1', 'lp.q5.r2', 'lp.q5.r3', 'lp.q5.r4'],
  tasks: [
    () => matchEq(V, vtx(pick(STRETCH), 0, 0), ['a']),
    () => build(V, vtx(pick(STRETCH.filter(a => a !== 1)), 0, 0), vtx(1, 0, 0), ['a']),
    // Schmalste oder breiteste Parabel - der Betrag entscheidet, nicht das Vorzeichen.
    () => {
      const widest = Math.random() < 0.5;
      let set;
      do { set = shuffle([-3, -2, -1, -0.5, 0.5, 2, 3, -0.3, 0.3]).slice(0, 4); }
      while (new Set(set.map(Math.abs)).size < 4);
      const key = (a) => Math.abs(a);
      const best = set.reduce((m, a) => (widest ? key(a) < key(m) : key(a) > key(m)) ? a : m, set[0]);
      const rest = set.filter(a => a !== best);
      return { type: 'choice', q: widest ? 'lp.t.widest' : 'lp.t.narrowest', form: V,
               options: [best, ...rest].map(a => ({ eq: vtx(a, 0, 0) })), correct: 0,
               why: { 1: 'lp.why.absA', 2: 'lp.why.absA', 3: 'lp.why.absA' } };
    },
    () => {
      const x = pick([-2, -1, 1, 2]);
      const a = pick([-2, -1, -0.5, 0.5, 2, 3]);
      const y = a * x * x;
      return { type: 'input', q: ['lp.t.findA', { p: ['pt', x, y] }], form: V, fields: ['lp.f.a'],
               answers: [a], concept: 'stretch', explain: ['lp.x.findA', { y, x2: x * x, av: a }] };
    },
    () => {
      const a = pick([-3, -2, -0.5, 0.5, 2, 3]);
      const kind = pick(['down', 'wide']);
      const truth = kind === 'down' ? a < 0 : Math.abs(a) < 1;
      return trueFalse([kind === 'down' ? 'lp.t.tfDown' : 'lp.t.tfWide', { eq: ['eq', V, vtx(a, 0, 0)] }],
                       truth, V, kind === 'down' ? 'lp.why.signA' : 'lp.why.absA');
    }
  ]
};

/* 6 · Die Scheitelpunktform ------------------------------------------- */
const widthKey = (a) => (Math.abs(a) > 1 ? 'lp.w.narrow' : Math.abs(a) < 1 ? 'lp.w.wide' : 'lp.w.same');
const openKey = (a) => (a > 0 ? 'lp.open.up' : 'lp.open.down');
const descOpt = (a, d, e) => ({ k: 'lp.desc', v: { o: ['t', openKey(a)], w: ['t', widthKey(a)], p: ['pt', d, e] } });

const vertexForm = {
  id: 'q6', title: 'lp.q6.title', goal: 'lp.q6.goal',
  form: V, start: vtx(1, 0, 0), free: ['a', 'd', 'e'],
  view: { xMin: -8, xMax: 8, yMin: -8, yMax: 8 },
  ref: NORMAL, show: { vertex: true },
  concepts: ['vertexForm'],
  predict: { q: 'lp.q6.pq', options: ['lp.q6.p0', 'lp.q6.p1', 'lp.q6.p2', 'lp.q6.p3'], correct: 0 },
  missions: [
    { text: 'lp.q6.m1', hint: 'lp.q6.h1',
      check: (s) => near(s.v.a, -1, TOL) && near(s.v.d, 1, TOL) && near(s.v.e, 2, TOL) },
    { text: 'lp.q6.m2', hint: 'lp.q6.h2',
      check: (s) => near(s.v.d, -2, TOL) && near(s.v.e, -3, TOL) && near(s.f(-1), -1, TOL) },
    { text: 'lp.q6.m3', hint: 'lp.q6.h3',
      check: (s) => near(s.f(0), 4, TOL) && near(s.v.d, 0, TOL) && near(s.f(2), 0, TOL) && near(s.f(-2), 0, TOL) }
  ],
  rule: ['lp.q6.r1', 'lp.q6.r2', 'lp.q6.r3'],
  tasks: [
    () => matchEq(V, vtx(pick([-2, -1, -0.5, 0.5, 2]), pick([-3, -2, -1, 0, 1, 2, 3]), pick([-4, -2, -1, 0, 1, 2, 4])),
                  ['a', 'd', 'e']),
    () => build(V, vtx(pick([-2, -1, -0.5, 0.5, 2]), pick(SMALL), pick(SMALL)), vtx(1, 0, 0), ['a', 'd', 'e']),
    () => vertexInput(V, vtx(pick([-2, -0.5, 0.5, 2, 3]), pick(SHIFTS), pick(SHIFTS)), 'shiftX'),
    () => {
      const a = pick([-3, -2, -0.5, 0.5, 2, 3]);
      const d = pick(SMALL), e = pick([-4, -2, -1, 0, 1, 2, 4]);
      const wrongW = Math.abs(a) > 1 ? a / Math.abs(a) * 0.5 : a / Math.abs(a) * 2;
      return { type: 'choice', q: ['lp.t.describe', { eq: ['eq', V, vtx(a, d, e)] }], form: V,
               options: [descOpt(a, d, e), descOpt(-a, d, e), descOpt(wrongW, d, e), descOpt(a, -d, e)],
               correct: 0,
               why: { 1: 'lp.why.signA', 2: 'lp.why.absA', 3: 'lp.why.innerShift' },
               remedy: { 1: 'stretch', 2: 'stretch', 3: 'shiftX' } };
    },
    () => {
      const a = pick([-2, -1, -0.5, 0.5, 2, 3]);
      const d = pick([-2, -1, 0, 1, 2]), e = pick([-3, -1, 0, 1, 3]);
      const k = pick([1, -1, 2]);
      const x = d + k, y = a * k * k + e;
      return { type: 'input', q: ['lp.t.findA2', { s: ['pt', d, e], p: ['pt', x, y] }], form: V,
               fields: ['lp.f.a'], answers: [a], concept: 'stretch',
               explain: ['lp.x.findA2', { k: Math.abs(k), k2: k * k, dy: y - e, av: a }] };
    }
  ]
};

/* 7 · Normalform und Scheitelpunktform ---------------------------------- */
const normalForm = {
  id: 'q7', title: 'lp.q7.title', goal: 'lp.q7.goal',
  form: S, start: std(1, 0, 0), free: ['b', 'c'],
  view: { xMin: -8, xMax: 8, yMin: -10, yMax: 10 },
  show: { vertex: true, yint: true },
  concepts: ['normalForm'],
  predict: { q: 'lp.q7.pq', options: ['lp.q7.p0', 'lp.q7.p1', 'lp.q7.p2', 'lp.q7.p3'], correct: 0 },
  missions: [
    { text: 'lp.q7.m1', hint: 'lp.q7.h1', check: (s) => near(s.v.c, -3, TOL) },
    { text: 'lp.q7.m2', hint: 'lp.q7.h2', check: (s) => near(-s.v.b / 2, 2, TOL) },
    { text: 'lp.q7.m3', hint: 'lp.q7.h3', check: (s) => near(-s.v.b / 2, -1, TOL) && near(s.f(-1), -4, TOL) }
  ],
  rule: ['lp.q7.r1', 'lp.q7.r2', 'lp.q7.r3', 'lp.q7.r4'],
  tasks: [
    () => {
      const b = pick([-6, -4, -2, 2, 4, 6]), c = pick([-5, -3, -2, -1, 1, 2, 3, 5]);
      return { type: 'input', q: ['lp.t.yint', { eq: ['eq', S, std(1, b, c)] }], form: S, fields: ['y'],
               answers: [c], concept: 'normalForm', explain: ['lp.x.yint', { cv: c }] };
    },
    () => {
      const b = pick([-6, -4, -2, 2, 4, 6]), c = pick([-5, -3, -1, 0, 1, 3, 5]);
      const xs = -b / 2, ys = c - (b * b) / 4;
      const task = vertexInput(S, std(1, b, c), 'normalForm');
      task.explain = ['lp.x.complete', { lhs: ['rhs', S, std(1, b, c)], rhs: ['rhs', V, vtx(1, xs, ys)], p: ['pt', xs, ys] }];
      return task;
    },
    () => {
      const b = pick([-6, -4, -2, 2, 4, 6]), c = pick([-5, -3, -1, 0, 1, 3, 5]);
      const h = -b / 2, sq = (b * b) / 4;
      const o = (v) => ({ eq: v, form: V });
      return { type: 'choice', q: ['lp.t.toVertex', { eq: ['eq', S, std(1, b, c)] }], form: S,
               options: [o(vtx(1, h, c - sq)), o(vtx(1, -h, c - sq)), o(vtx(1, h, c)), o(vtx(1, h, c + sq))],
               correct: 0,
               why: { 1: 'lp.why.halfB', 2: 'lp.why.forgotSquare', 3: 'lp.why.forgotSquare' } };
    },
    () => build(S, std(1, pick([-4, -2, 2, 4]), pick([-3, -2, -1, 1, 2, 3, 4])), std(1, 0, 0), ['b', 'c']),
    () => {
      const b = pick([-6, -4, -2, 2, 4, 6]), c = pick([-3, -1, 1, 3]);
      const truth = Math.random() < 0.5;
      const xs = truth ? -b / 2 : b / 2;
      return trueFalse(['lp.t.tfVertexX', { eq: ['eq', S, std(1, b, c)], xs }], truth, S,
                       truth ? 'lp.why.vertexX' : 'lp.why.halfB', ['lp.x.vertexX', { xs: -b / 2 }]);
    }
  ]
};

/* 8 · Nullstellen ------------------------------------------------------ */
const ROOT_VIEW = { xMin: -8, xMax: 8, yMin: -10, yMax: 8 };
const zeros = {
  id: 'q8', title: 'lp.q8.title', goal: 'lp.q8.goal',
  form: V, start: vtx(1, 0, -4), free: ['d', 'e'],
  view: { xMin: -8, xMax: 8, yMin: -8, yMax: 8 },
  show: { vertex: true, roots: true },
  concepts: ['roots'],
  predict: { q: 'lp.q8.pq', options: ['lp.q8.p0', 'lp.q8.p1', 'lp.q8.p2', 'lp.q8.p3'], correct: 0 },
  missions: [
    // Start ist e = -4 (zwei Nullstellen) - der erste Auftrag verlangt
    // deshalb gleich eine Aenderung.
    { text: 'lp.q8.m1', hint: 'lp.q8.h1', check: (s) => near(s.v.e, 0, TOL) },
    { text: 'lp.q8.m2', hint: 'lp.q8.h2', check: (s) => s.v.e > TOL },
    { text: 'lp.q8.m3', hint: 'lp.q8.h3', check: (s) => near(s.f(1), 0, TOL) && near(s.f(5), 0, TOL) }
  ],
  rule: ['lp.q8.r1', 'lp.q8.r2', 'lp.q8.r3', 'lp.q8.r4'],
  tasks: [
    // Anzahl der Nullstellen - mit nach unten geoeffneten Parabeln als Falle.
    () => {
      const a = pick([1, -1, 2, -0.5]);
      const d = pick([-2, -1, 0, 1, 2]);
      const e = pick([-3, -2, 0, 2, 3]);
      const count = e === 0 ? 1 : a * e < 0 ? 2 : 0;
      const keys = ['lp.roots.0', 'lp.roots.1', 'lp.roots.2'];
      const order = [count, ...[0, 1, 2].filter(c => c !== count)];
      const why = a < 0 ? 'lp.why.rootsOpen' : 'lp.why.rootCount';
      return { type: 'choice', q: ['lp.t.rootCount', { eq: ['eq', V, vtx(a, d, e)] }], form: V,
               options: order.map(c => ({ k: keys[c] })), correct: 0,
               why: { 1: why, 2: why } };
    },
    // Nullstellen aus der Scheitelpunktform berechnen
    () => {
      const d = pick([-3, -2, -1, 0, 1, 2, 3]);
      const r = pick([1, 2, 3]);
      const v = vtx(1, d, -r * r);
      const [x1, x2] = roots(v);
      return { type: 'input', q: ['lp.t.rootsV', { eq: ['eq', V, v] }], form: V,
               fields: ['x₁', 'x₂'], answers: [x1, x2], unordered: true, concept: 'roots',
               explain: ['lp.x.rootsV', { br: ['br', d], r2: r * r, r, x1, x2 }] };
    },
    // p-q-Formel
    () => {
      let r1, r2;
      do { r1 = pick([-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5]); r2 = pick([-5, -4, -3, -2, -1, 1, 2, 3, 4, 5]); }
      while (r1 === r2 || Math.abs(r1 - r2) > 8);
      const p = -(r1 + r2), q = r1 * r2;
      const h = -p / 2, disc = (p / 2) ** 2 - q;
      return { type: 'input', q: ['lp.t.pq', { eq: ['eq', S, std(1, p, q)] }], form: S,
               fields: ['x₁', 'x₂'], answers: [r1, r2], unordered: true, concept: 'roots',
               explain: ['lp.x.pq', { p, q, h, disc, r: Math.sqrt(disc) }] };
    },
    // Genau eine Nullstelle
    () => {
      const d = pick([-3, -2, -1, 1, 2, 3]);
      const a = pick([1, -1, 2]);
      const e1 = pick([-2, -1]), e2 = pick([1, 2]);
      return { type: 'choice', q: 'lp.t.oneRoot', form: V,
               options: [{ eq: vtx(a, d, 0) }, { eq: vtx(a, d, e1) }, { eq: vtx(a, d, e2) }, { eq: vtx(a, 0, d) }],
               correct: 0, why: { 1: 'lp.why.touch', 2: 'lp.why.touch', 3: 'lp.why.touch' } };
    },
    // Nullstellen am Graphen ablesen
    () => {
      const d = pick([-3, -2, -1, 0, 1, 2, 3]);
      const r = pick([1, 2, 3]);
      const v = vtx(1, d, -r * r);
      const [x1, x2] = roots(v);
      return { type: 'input', q: 'lp.t.readRoots', form: V, graph: { form: V, values: v }, view: ROOT_VIEW,
               fields: ['x₁', 'x₂'], answers: [x1, x2], unordered: true, concept: 'roots' };
    }
  ]
};

/* ==========================================================================
   ANMELDUNG
   Reihenfolge = Reihenfolge im Lernpfad.
   ========================================================================== */
MFE.paths.register({
  id: 'quadratic',
  category: 'quadratic',
  feature: 'cat.quadratic',
  title: 'cat.quadratic',
  /* Fehleranalyse -> Begriff -> Schritt fuer den Rueckverweis. */
  concepts: {
    quad_vertex: { a: 'stretch', d: 'shiftX', e: 'shiftY' },
    quad_standard: { a: 'stretch', b: 'normalForm', c: 'normalForm' }
  },
  steps: [normal, shiftY, shiftX, shiftXY, stretch, vertexForm, normalForm, zeros]
});
})();
