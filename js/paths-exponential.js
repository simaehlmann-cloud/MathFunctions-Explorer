/* ==========================================================================
   paths-exponential.js  ·  Lernpfad "Exponentialfunktionen"
   --------------------------------------------------------------------------
   Reihenfolge wie in Klasse 10: die Grundfunktion b^x, dann der
   Anfangswert a, dann Wachstum und Abnahme in Prozent, zuletzt die
   Verschiebung c mit der Asymptote.
   Aufbau der Schritte: siehe js/paths-quadratic.js.
   ========================================================================== */
'use strict';

(() => {
const { pick, near, matchEqTask, buildTask, trueFalseTask } = MFE.paths.kit;

const E = 'exponential';                 // f(x) = a·b^x + c
const ex = (a, b, c = 0) => ({ a, b, c });
const TOL = 0.01;
const VIEW = { xMin: -4, xMax: 4, yMin: -2, yMax: 10 };
const VIEW_SIGNED = { xMin: -4, xMax: 4, yMin: -8, yMax: 10 };
const BASES = [0.5, 2, 3, 1.5, 0.8];
const r2 = (v) => Math.round(v * 100) / 100;

/* ==========================================================================
   SCHRITTE
   ========================================================================== */
const basic = {
  id: 'e1', title: 'lp.e1.title', goal: 'lp.e1.goal',
  form: E, start: ex(1, 1.5), free: ['b'],
  view: VIEW, show: { helpers: true },
  concepts: ['base'],
  predict: { q: 'lp.e1.pq', options: ['lp.e1.p0', 'lp.e1.p1', 'lp.e1.p2', 'lp.e1.p3'], correct: 0 },
  missions: [
    { text: 'lp.e1.m1', hint: 'lp.e1.h1', check: (s) => near(s.f(2), 4, TOL) },
    { text: 'lp.e1.m2', hint: 'lp.e1.h2', check: (s) => near(s.f(1), 0.5, TOL) },
    { text: 'lp.e1.m3', hint: 'lp.e1.h3', check: (s) => near(s.f(2), 9, TOL) }
  ],
  rule: ['lp.e1.r1', 'lp.e1.r2', 'lp.e1.r3', 'lp.e1.r4'],
  tasks: [
    () => {
      const b = pick([2, 3, 0.5, 1.5]);
      return matchEqTask(E, ex(1, b), ['b'], [ex(1, r2(1 / b))]);
    },
    () => buildTask(E, ex(1, pick([2, 3, 0.5, 0.8, 2.5])), ex(1, 1.5), ['b']),
    () => {
      // Keine Basis 10: bei 1000 laesst die Ablesetoleranz auch 1001 gelten.
      const b = pick([2, 3, 0.5]), x = pick([0, 1, 2, 3, -1]);
      const y = b ** x;
      return { type: 'input', form: E, q: ['lp.t.expValue', { x, eq: ['eq', E, ex(1, b)] }],
               fields: ['f(x)'], answers: [y], concept: 'base',
               explain: ['lp.x.expValue', { x, bv: b, y }] };
    },
    () => {
      const b = pick(BASES);
      return trueFalseTask(['lp.t.growing', { eq: ['eq', E, ex(1, b)] }], b > 1, E, 'lp.why.base');
    },
    () => {
      // Welche Funktion beschreibt eine Abnahme?
      const down = pick([0.5, 0.8, 0.25]);
      return { type: 'choice', form: E, q: 'lp.t.decay',
               options: [{ eq: ex(1, down) }, { eq: ex(1, 2) }, { eq: ex(-1, 2) }, { eq: ex(1, 1.5) }],
               correct: 0, why: { 1: 'lp.why.base', 2: 'lp.why.negA', 3: 'lp.why.base' } };
    }
  ]
};

const startValue = {
  id: 'e2', title: 'lp.e2.title', goal: 'lp.e2.goal',
  form: E, start: ex(1, 2), free: ['a'],
  view: VIEW_SIGNED, ref: { form: E, values: ex(1, 2) }, refLabel: 'lp.e2.ref', show: { yint: true },
  concepts: ['start'],
  predict: { q: 'lp.e2.pq', options: ['lp.e2.p0', 'lp.e2.p1', 'lp.e2.p2', 'lp.e2.p3'], correct: 0 },
  missions: [
    { text: 'lp.e2.m1', hint: 'lp.e2.h1', check: (s) => near(s.f(0), 3, TOL) },
    { text: 'lp.e2.m2', hint: 'lp.e2.h2', check: (s) => near(s.f(1), 1, TOL) },
    { text: 'lp.e2.m3', hint: 'lp.e2.h3', check: (s) => near(s.f(0), -1, TOL) }
  ],
  rule: ['lp.e2.r1', 'lp.e2.r2', 'lp.e2.r3'],
  tasks: [
    () => matchEqTask(E, ex(pick([0.5, 2, 3, -1, -2]), 2), ['a'], [], VIEW_SIGNED),
    () => buildTask(E, ex(pick([0.5, 2, 3, -1, 4]), 2), ex(1, 2), ['a'], VIEW_SIGNED),
    () => {
      const a = pick([2, 3, 5, 0.5, -2]), b = pick([2, 3, 0.5]);
      return { type: 'input', form: E, q: ['lp.t.expYint', { eq: ['eq', E, ex(a, b)] }],
               fields: ['y'], answers: [a], concept: 'start', explain: ['lp.x.expYint', { av: a }] };
    },
    () => {
      const a = pick([2, 3, 4, 0.5]), b = pick([2, 3]), x = pick([1, 2]);
      return { type: 'input', form: E, q: ['lp.t.findExpA', { bv: b, p: ['pt', x, a * b ** x] }],
               fields: ['lp.f.a'], answers: [a], concept: 'start',
               explain: ['lp.x.findExpA', { y: a * b ** x, bx: b ** x, av: a }] };
    },
    () => {
      // Wahrheit nachrechnen: bei a = b waere "y = b" ebenfalls richtig.
      const a = pick([2, 3, 5]), b = pick([2, 3]);
      const claim = pick([a, b, a * b]);
      const truth = claim === a;
      return trueFalseTask(['lp.t.expYintTf', { eq: ['eq', E, ex(a, b)], y: claim }], truth, E,
                           'lp.why.startIsA', ['lp.x.expYint', { av: a }]);
    }
  ]
};

const percent = {
  id: 'e3', title: 'lp.e3.title', goal: 'lp.e3.goal',
  form: E, start: ex(1, 1.5), free: ['a', 'b'],
  view: { xMin: -1, xMax: 5, yMin: -1, yMax: 12 }, show: { yint: true },
  concepts: ['factor'],
  predict: { q: 'lp.e3.pq', options: ['lp.e3.p0', 'lp.e3.p1', 'lp.e3.p2', 'lp.e3.p3'], correct: 0 },
  missions: [
    { text: 'lp.e3.m1', hint: 'lp.e3.h1', check: (s) => near(s.v.a, 2, TOL) && near(s.v.b, 1.5, TOL) },
    { text: 'lp.e3.m2', hint: 'lp.e3.h2', check: (s) => near(s.v.a, 5, TOL) && near(s.v.b, 0.8, TOL) },
    { text: 'lp.e3.m3', hint: 'lp.e3.h3', check: (s) => near(s.v.a, 1, TOL) && near(s.v.b, 2, TOL) }
  ],
  rule: ['lp.e3.r1', 'lp.e3.r2', 'lp.e3.r3'],
  tasks: [
    () => {
      const p = pick([5, 10, 20, 25, 50]), up = Math.random() < 0.5;
      return { type: 'input', form: E, q: [up ? 'lp.t.factorUp' : 'lp.t.factorDown', { p }],
               fields: ['lp.f.b'], answers: [up ? 1 + p / 100 : 1 - p / 100], concept: 'factor',
               explain: [up ? 'lp.x.factorUp' : 'lp.x.factorDown', { p, bv: up ? 1 + p / 100 : 1 - p / 100 }] };
    },
    () => {
      // Ohne 0,5: dort waeren "50 % Abnahme" und "b · 100 = 50" dieselbe Antwort.
      const b = pick([1.05, 1.2, 1.5, 0.9, 0.75, 0.8]);
      const p = Math.round(Math.abs(b - 1) * 100);
      return { type: 'choice', form: E, q: ['lp.t.whatPercent', { eq: ['eq', E, ex(100, b)] }],
               options: [{ k: b > 1 ? 'lp.pct.up' : 'lp.pct.down', v: { p } },
                         { k: b > 1 ? 'lp.pct.down' : 'lp.pct.up', v: { p } },
                         { k: b > 1 ? 'lp.pct.up' : 'lp.pct.down', v: { p: Math.round(b * 100) } },
                         { k: b > 1 ? 'lp.pct.up' : 'lp.pct.down', v: { p: r2(b) } }],
               correct: 0, why: { 1: 'lp.why.factor', 2: 'lp.why.factor', 3: 'lp.why.factor' } };
    },
    () => {
      const a = pick([100, 200, 500, 1000]), p = pick([2, 3, 5, 10]);
      const b = r2(1 + p / 100);
      return { type: 'choice', form: E, q: ['lp.t.model', { av: a, p }],
               options: [{ eq: ex(a, b) }, { eq: ex(a, r2(p / 100)) }, { eq: ex(a, 1 + p) },
                         { eq: { m: a * p / 100, b: a }, form: 'linear' }],
               correct: 0, why: { 1: 'lp.why.factor', 2: 'lp.why.factor', 3: 'lp.why.linVsExp' } };
    },
    () => matchEqTask(E, ex(pick([1, 2, 3]), pick([0.5, 2, 1.5])), ['a', 'b'],
                      [], { xMin: -1, xMax: 5, yMin: -1, yMax: 12 }),
    () => {
      const kind = pick(['double', 'half', 'up', 'down']);
      const b = { double: 2, half: 0.5, up: 1.1, down: 0.9 }[kind];
      const truth = Math.random() < 0.5;
      const shown = truth ? b : { double: 0.5, half: 2, up: 0.9, down: 1.1 }[kind];
      return trueFalseTask(['lp.t.factorTf', { eq: ['eq', E, ex(1, shown)], what: ['t', 'lp.kind.' + kind] }],
                           truth, E, 'lp.why.factor');
    }
  ]
};

const shift = {
  id: 'e4', title: 'lp.e4.title', goal: 'lp.e4.goal',
  form: E, start: ex(1, 2), free: ['c'],
  view: VIEW_SIGNED, ref: { form: E, values: ex(1, 2) }, refLabel: 'lp.e2.ref', show: { helpers: true },
  concepts: ['shiftY'],
  predict: { q: 'lp.e4.pq', options: ['lp.e4.p0', 'lp.e4.p1', 'lp.e4.p2', 'lp.e4.p3'], correct: 0 },
  missions: [
    { text: 'lp.e4.m1', hint: 'lp.e4.h1', check: (s) => near(s.v.c, 2, TOL) },
    { text: 'lp.e4.m2', hint: 'lp.e4.h2', check: (s) => near(s.v.c, -3, TOL) },
    { text: 'lp.e4.m3', hint: 'lp.e4.h3', check: (s) => near(s.f(0), 0, TOL) }
  ],
  rule: ['lp.e4.r1', 'lp.e4.r2', 'lp.e4.r3'],
  tasks: [
    () => matchEqTask(E, ex(1, 2, pick([-3, -2, -1, 1, 2, 3])), ['c'], [], VIEW_SIGNED),
    () => buildTask(E, ex(1, 2, pick([-4, -3, -1, 1, 2, 4])), ex(1, 2), ['c'], VIEW_SIGNED),
    () => {
      const a = pick([1, 2, 3]), b = pick([2, 3, 0.5]), c = pick([-4, -2, -1, 1, 2, 3]);
      return { type: 'input', form: E, q: ['lp.t.asymptote', { eq: ['eq', E, ex(a, b, c)] }],
               fields: ['y'], answers: [c], concept: 'shiftY', solution: ['lp.sol.asym', { cv: c }] };
    },
    () => {
      // Klassiker: der y-Achsenabschnitt ist a + c, nicht a
      const a = pick([1, 2, 3]), b = pick([2, 3]), c = pick([-3, -2, -1, 1, 2]);
      return { type: 'input', form: E, q: ['lp.t.expYint', { eq: ['eq', E, ex(a, b, c)] }],
               fields: ['y'], answers: [a + c], concept: 'shiftY',
               explain: ['lp.x.expYintC', { av: a, cv: c, y: a + c }] };
    },
    () => {
      const c = pick([-3, -2, -1, 1, 2, 3]);
      return { type: 'choice', form: E, q: ['lp.t.whichAsym', { eq: ['eq', E, ex(1, 2, c)] }],
               options: [{ k: 'lp.asym.y', v: { c } }, { k: 'lp.asym.y', v: { c: -c } },
                         { k: 'lp.asym.y', v: { c: 0 } }, { k: 'lp.asym.x', v: { c } }],
               correct: 0, why: { 1: 'lp.why.asym', 2: 'lp.why.asym', 3: 'lp.why.asym' } };
    }
  ]
};

MFE.paths.register({
  id: 'exponential', category: 'exponential', feature: 'cat.exponential', title: 'cat.exponential',
  concepts: { exponential: { a: 'start', b: 'base', c: 'shiftY' } },
  steps: [basic, startValue, percent, shift]
});
})();
