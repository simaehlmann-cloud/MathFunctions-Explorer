/* ==========================================================================
   paths-trig.js  ·  Lernpfad "Trigonometrische Funktionen"
   --------------------------------------------------------------------------
   Reihenfolge wie in Klasse 10: die Sinusfunktion selbst, dann jeder
   Parameter fuer sich (Amplitude, Periode, Verschiebung in x, in y), zum
   Schluss alles zusammen. Winkel stehen im Bogenmass und in pi-Schreibweise.

   Achtung Raster: Der Regler fuer c hat die Schrittweite 0,1 und trifft
   pi/2 nie genau. Auftraege mit pi pruefen deshalb mit PI_TOL; Nachbau-
   Aufgaben bewertet gradeBuild() ohnehin mit der Toleranz der Schrittweite.
   tools/paths-test.mjs prueft, dass jedes Ziel auf dem Raster erreichbar ist.
   ========================================================================== */
'use strict';

(() => {
const { pick, near, matchEqTask, buildTask, trueFalseTask } = MFE.paths.kit;

const T = 'sinus';                       // f(x) = a·sin(b·(x − c)) + d
const PI = Math.PI;
const sv = (a = 1, b = 1, c = 0, d = 0) => ({ a, b, c, d });
const TOL = 0.01;
const PI_TOL = 0.06;                     // Raster 0,1: halbe Schrittweite plus Luft
const VIEW = { xMin: -2 * PI, xMax: 2 * PI, yMin: -4, yMax: 4, piAxis: true };
const VIEW_TALL = { xMin: -2 * PI, xMax: 2 * PI, yMin: -6, yMax: 6, piAxis: true };
const SINE = { form: T, values: sv() };
const AMPS = [-3, -2, -0.5, 0.5, 2, 3];
const FREQS = [0.5, 2, 3, 4];
const SHIFTS = [PI / 2, -PI / 2, PI, PI / 4, -PI / 4];
const LIFTS = [-2, -1, 1, 2, 3];

const rangeOpt = (lo, hi) => ({ k: 'lp.range', v: { lo, hi } });

/* ==========================================================================
   SCHRITTE
   ========================================================================== */
const sine = {
  id: 't1', title: 'lp.t1.title', goal: 'lp.t1.goal',
  form: T, start: sv(), free: [],
  trace: { min: -2 * PI, max: 2 * PI, step: PI / 12, start: PI / 6, pi: true },
  view: VIEW,
  concepts: ['sine'],
  exploreLead: 'lp.t1.lead',
  predict: { q: 'lp.t1.pq', options: ['lp.t1.p0', 'lp.t1.p1', 'lp.t1.p2', 'lp.t1.p3'], correct: 0 },
  missions: [
    { text: 'lp.t1.m1', hint: 'lp.t1.h1', check: (s) => near(s.y, 1, TOL) },
    { text: 'lp.t1.m2', hint: 'lp.t1.h2', check: (s) => near(s.y, 0, TOL) && Math.abs(s.x) > 0.1 },
    { text: 'lp.t1.m3', hint: 'lp.t1.h3', check: (s) => near(s.y, -1, TOL) }
  ],
  rule: ['lp.t1.r1', 'lp.t1.r2', 'lp.t1.r3', 'lp.t1.r4'],
  tasks: [
    () => {
      const x = pick([0, PI / 2, PI, 3 * PI / 2, 2 * PI, -PI / 2]);
      const y = Math.round(Math.sin(x));
      return { type: 'input', form: T, q: ['lp.t.sinValue', { x: ['pi', x] }], graph: SINE,
               fields: ['f(x)'], answers: [y], concept: 'sine' };
    },
    () => {
      const x = pick([PI, PI / 2, 2 * PI, 3 * PI / 2, -PI, -PI / 2]);
      const truth = Math.abs(Math.sin(x)) < 1e-9;
      return trueFalseTask(['lp.t.sinZeroTf', { x: ['pi', x] }], truth, T, 'lp.why.sinZeros');
    },
    () => {
      const [lo, hi, n] = pick([[0, PI, 2], [0, 2 * PI, 3], [-PI, PI, 3], [0, PI / 2, 1], [-2 * PI, 2 * PI, 5]]);
      const opts = [n, n + 1, n - 1, n + 2].filter((v, i, a) => v >= 0 && a.indexOf(v) === i).slice(0, 4);
      return { type: 'choice', form: T, q: ['lp.t.sinZeroCount', { lo: ['pi', lo], hi: ['pi', hi] }],
               graph: SINE, options: opts.map(v => ({ text: String(v) })), correct: 0,
               why: Object.fromEntries(opts.slice(1).map((_, i) => [i + 1, 'lp.why.sinZeros'])) };
    },
    () => ({ type: 'choice', form: T, q: 'lp.t.sinPeriod',
             options: [{ text: '2π' }, { text: 'π' }, { text: 'π/2' }, { text: '1' }],
             correct: 0, why: { 1: 'lp.why.period2pi', 2: 'lp.why.period2pi', 3: 'lp.why.period2pi' } }),
    () => ({ type: 'choice', form: T, q: ['lp.t.sinRange', { eq: ['eq', T, sv()] }],
             options: [rangeOpt(-1, 1), rangeOpt(0, 1), { k: 'lp.range', v: { lo: ['pi', -PI], hi: ['pi', PI] } },
                       { k: 'lp.rangeAll' }],
             correct: 0, why: { 1: 'lp.why.sinRange', 2: 'lp.why.sinRange', 3: 'lp.why.sinRange' } })
  ]
};

const amplitude = {
  id: 't2', title: 'lp.t2.title', goal: 'lp.t2.goal',
  form: T, start: sv(), free: ['a'],
  view: VIEW, ref: SINE, refLabel: 'lp.t.refSin', show: { helpers: true },
  concepts: ['amp'],
  predict: { q: 'lp.t2.pq', options: ['lp.t2.p0', 'lp.t2.p1', 'lp.t2.p2', 'lp.t2.p3'], correct: 0 },
  missions: [
    { text: 'lp.t2.m1', hint: 'lp.t2.h1', check: (s) => near(Math.abs(s.v.a), 2, TOL) },
    { text: 'lp.t2.m2', hint: 'lp.t2.h2', check: (s) => near(s.v.a, -1, TOL) },
    { text: 'lp.t2.m3', hint: 'lp.t2.h3', check: (s) => near(Math.abs(s.v.a), 0.5, TOL) }
  ],
  rule: ['lp.t2.r1', 'lp.t2.r2', 'lp.t2.r3'],
  tasks: [
    () => matchEqTask(T, sv(pick(AMPS)), ['a'], [], VIEW),
    () => buildTask(T, sv(pick(AMPS)), sv(), ['a'], VIEW),
    () => {
      const a = pick(AMPS);
      return { type: 'input', form: T, q: ['lp.t.amp', { eq: ['eq', T, sv(a)] }], fields: ['lp.f.amp'],
               answers: [Math.abs(a)], concept: 'amp', explain: ['lp.x.amp', { n: Math.abs(a) }] };
    },
    () => {
      // Ohne |a| = 0,5: dort waere "-2|a| bis 2|a|" dasselbe wie "-1 bis 1".
      const a = pick([-3, -2, 2, 3]), n = Math.abs(a);
      return { type: 'choice', form: T, q: ['lp.t.sinRange', { eq: ['eq', T, sv(a)] }],
               options: [rangeOpt(-n, n), rangeOpt(0, n), rangeOpt(-1, 1), rangeOpt(-2 * n, 2 * n)],
               correct: 0, why: { 1: 'lp.why.amp', 2: 'lp.why.amp', 3: 'lp.why.amp' } };
    },
    () => {
      const a = pick([-3, -2, 2, 3]);
      const truth = Math.random() < 0.5;
      return trueFalseTask(['lp.t.ampTf', { eq: ['eq', T, sv(a)], n: truth ? Math.abs(a) : 2 * Math.abs(a) }],
                           truth, T, 'lp.why.amp', ['lp.x.amp', { n: Math.abs(a) }]);
    }
  ]
};

const period = {
  id: 't3', title: 'lp.t3.title', goal: 'lp.t3.goal',
  form: T, start: sv(), free: ['b'],
  view: VIEW, ref: SINE, refLabel: 'lp.t.refSin', show: { helpers: true },
  concepts: ['period'],
  predict: { q: 'lp.t3.pq', options: ['lp.t3.p0', 'lp.t3.p1', 'lp.t3.p2', 'lp.t3.p3'], correct: 0 },
  missions: [
    { text: 'lp.t3.m1', hint: 'lp.t3.h1', check: (s) => near(s.v.b, 2, TOL) },
    { text: 'lp.t3.m2', hint: 'lp.t3.h2', check: (s) => near(s.v.b, 0.5, TOL) },
    { text: 'lp.t3.m3', hint: 'lp.t3.h3', check: (s) => near(s.v.b, 3, TOL) }
  ],
  rule: ['lp.t3.r1', 'lp.t3.r2', 'lp.t3.r3'],
  tasks: [
    () => {
      const b = pick(FREQS);
      return { type: 'input', form: T, q: ['lp.t.period', { eq: ['eq', T, sv(1, b)] }], fields: ['lp.f.period'],
               answers: [2 * PI / b], concept: 'period',
               solution: ['lp.sol.period', { p: ['pi', 2 * PI / b] }],
               explain: ['lp.x.period', { bv: b, p: ['pi', 2 * PI / b] }] };
    },
    () => {
      const b = pick(FREQS);
      return { type: 'input', form: T, q: ['lp.t.freq', { p: ['pi', 2 * PI / b] }], fields: ['lp.f.b'],
               answers: [b], concept: 'period', explain: ['lp.x.freq', { p: ['pi', 2 * PI / b], bv: b }] };
    },
    () => {
      const b = pick(FREQS);
      return matchEqTask(T, sv(1, b), ['b'], [sv(1, b * 2 <= 5 ? b * 2 : b / 2)], VIEW);
    },
    () => buildTask(T, sv(1, pick(FREQS)), sv(), ['b'], VIEW),
    () => {
      const b = pick([2, 3, 4]);
      const truth = Math.random() < 0.5;
      const claim = truth ? 2 * PI / b : 2 * PI * b;
      return trueFalseTask(['lp.t.periodTf', { eq: ['eq', T, sv(1, b)], p: ['pi', claim] }], truth, T,
                           'lp.why.period', ['lp.x.period', { bv: b, p: ['pi', 2 * PI / b] }]);
    }
  ]
};

const shiftX = {
  id: 't4', title: 'lp.t4.title', goal: 'lp.t4.goal',
  form: T, start: sv(), free: ['c'],
  view: VIEW, ref: SINE, refLabel: 'lp.t.refSin',
  concepts: ['shiftX'],
  predict: { q: 'lp.t4.pq', options: ['lp.t4.p0', 'lp.t4.p1', 'lp.t4.p2', 'lp.t4.p3'], correct: 0 },
  missions: [
    { text: 'lp.t4.m1', hint: 'lp.t4.h1',
      check: (s) => near(s.f(PI / 2), 0, PI_TOL) && s.f(PI / 2 + 0.3) > s.f(PI / 2) },
    { text: 'lp.t4.m2', hint: 'lp.t4.h2', check: (s) => near(s.f(0), 1, TOL) },
    { text: 'lp.t4.m3', hint: 'lp.t4.h3', check: (s) => near(s.v.c, -1, TOL) }
  ],
  rule: ['lp.t4.r1', 'lp.t4.r2', 'lp.t4.r3'],
  tasks: [
    () => {
      const c = pick(SHIFTS);
      return matchEqTask(T, sv(1, 1, c), ['c'], [sv(1, 1, -c), sv(1, 1, c + PI / 2), sv(1, 1, c / 2), sv(1, 1, 2 * c)], VIEW);
    },
    () => buildTask(T, sv(1, 1, pick([PI / 2, -PI / 2, PI, 1, -2])), sv(), ['c'], VIEW),
    () => {
      const c = pick(SHIFTS);
      const n = ['pi', Math.abs(c)];
      return { type: 'choice', form: T, q: ['lp.t.dirQSin', { eq: ['eq', T, sv(1, 1, c)] }],
               options: [{ k: c > 0 ? 'lp.dir.right' : 'lp.dir.left', v: { n } },
                         { k: c > 0 ? 'lp.dir.left' : 'lp.dir.right', v: { n } },
                         { k: 'lp.dir.up', v: { n } }, { k: 'lp.dir.down', v: { n } }],
               correct: 0, why: { 1: 'lp.why.sinShift', 2: 'lp.why.sinXY', 3: 'lp.why.sinXY' } };
    },
    () => ({ type: 'choice', form: T, q: 'lp.t.cosAsSin',
             options: [{ eq: sv(1, 1, -PI / 2) }, { eq: sv(1, 1, PI / 2) }, { eq: sv(1, 1, 0, 1) }, { eq: sv(-1) }],
             correct: 0, why: { 1: 'lp.why.sinShift', 2: 'lp.why.sinXY', 3: 'lp.why.cos' } }),
    () => {
      // Die Wahrheit wird nachgerechnet, nicht angenommen: bei c = pi liegt
      // auch bei x = -pi eine Nullstelle.
      const c = pick(SHIFTS);
      const x = pick([c, -c]);
      const truth = Math.abs(Math.sin(x - c)) < 1e-9;
      return trueFalseTask(['lp.t.sinShiftZero', { eq: ['eq', T, sv(1, 1, c)], x: ['pi', x] }],
                           truth, T, 'lp.why.sinShift');
    }
  ]
};

const shiftY = {
  id: 't5', title: 'lp.t5.title', goal: 'lp.t5.goal',
  form: T, start: sv(), free: ['d'],
  view: VIEW, ref: SINE, refLabel: 'lp.t.refSin', show: { helpers: true },
  concepts: ['shiftY'],
  predict: { q: 'lp.t5.pq', options: ['lp.t5.p0', 'lp.t5.p1', 'lp.t5.p2', 'lp.t5.p3'], correct: 0 },
  missions: [
    { text: 'lp.t5.m1', hint: 'lp.t5.h1', check: (s) => near(s.v.d, 2, TOL) },
    { text: 'lp.t5.m2', hint: 'lp.t5.h2', check: (s) => near(s.v.d, -2, TOL) },
    { text: 'lp.t5.m3', hint: 'lp.t5.h3', check: (s) => near(s.v.d, 1, TOL) }
  ],
  rule: ['lp.t5.r1', 'lp.t5.r2', 'lp.t5.r3'],
  tasks: [
    () => matchEqTask(T, sv(1, 1, 0, pick(LIFTS)), ['d'], [], VIEW),
    () => buildTask(T, sv(1, 1, 0, pick(LIFTS)), sv(), ['d'], VIEW),
    () => {
      const d = pick(LIFTS);
      return { type: 'input', form: T, q: ['lp.t.midline', { eq: ['eq', T, sv(1, 1, 0, d)] }], fields: ['y'],
               answers: [d], concept: 'shiftY', solution: ['lp.sol.asym', { cv: d }] };
    },
    () => {
      const d = pick(LIFTS);
      return { type: 'choice', form: T, q: ['lp.t.sinRange', { eq: ['eq', T, sv(1, 1, 0, d)] }],
               options: [rangeOpt(d - 1, d + 1), rangeOpt(-1, 1), rangeOpt(d - 2, d + 2), rangeOpt(-d - 1, -d + 1)],
               correct: 0, why: { 1: 'lp.why.lift', 2: 'lp.why.lift', 3: 'lp.why.lift' } };
    },
    () => {
      const d = pick(LIFTS);
      const truth = Math.random() < 0.5;
      return trueFalseTask(['lp.t.maxTf', { eq: ['eq', T, sv(1, 1, 0, d)], y: truth ? d + 1 : d }],
                           truth, T, 'lp.why.lift');
    }
  ]
};

const general = {
  id: 't6', title: 'lp.t6.title', goal: 'lp.t6.goal',
  form: T, start: sv(), free: ['a', 'b', 'c', 'd'],
  view: VIEW_TALL, ref: SINE, refLabel: 'lp.t.refSin', show: { helpers: true },
  concepts: ['all'],
  predict: { q: 'lp.t6.pq', options: ['lp.t6.p0', 'lp.t6.p1', 'lp.t6.p2', 'lp.t6.p3'], correct: 0 },
  missions: [
    { text: 'lp.t6.m1', hint: 'lp.t6.h1',
      check: (s) => near(Math.abs(s.v.a), 2, TOL) && near(s.v.b, 2, TOL) && near(s.v.d, 1, TOL) },
    { text: 'lp.t6.m2', hint: 'lp.t6.h2',
      check: (s) => near(Math.abs(s.v.a), 2, TOL) && near(s.v.b, 1, TOL) && near(s.v.d, 1, TOL) && near(s.f(0), 3, 0.02) },
    { text: 'lp.t6.m3', hint: 'lp.t6.h3',
      check: (s) => near(Math.abs(s.v.a), 1, TOL) && near(s.v.b, 1, TOL) && near(s.v.d, 0, TOL)
                 && near(s.f(0), 0, PI_TOL) && s.f(0.3) < s.f(0) }
  ],
  rule: ['lp.t6.r1', 'lp.t6.r2', 'lp.t6.r3'],
  tasks: [
    () => {
      const a = pick([2, -2, 0.5, 3]), b = pick([1, 2, 0.5]), d = pick([-1, 0, 1, 2]);
      return matchEqTask(T, sv(a, b, 0, d), ['a', 'b', 'd'],
                         [sv(-a, b, 0, d), sv(a, b === 2 ? 1 : 2, 0, d), sv(a, b, 0, -d - 1)], VIEW_TALL);
    },
    () => buildTask(T, sv(pick([2, -2, 0.5, 3]), pick([1, 2, 0.5]), 0, pick([-1, 1, 2])), sv(), ['a', 'b', 'd'], VIEW_TALL),
    () => {
      const a = pick([2, -2, 3, 0.5]), b = pick([1, 2]), d = pick([-1, 1, 2]);
      return { type: 'input', form: T, q: ['lp.t.sinMax', { eq: ['eq', T, sv(a, b, 0, d)] }], fields: ['y'],
               answers: [d + Math.abs(a)], concept: 'all',
               explain: ['lp.x.sinMax', { dv: d, n: Math.abs(a), y: d + Math.abs(a) }] };
    },
    () => {
      const a = pick([2, 3, -2]), b = pick(FREQS), c = pick([0, PI / 2, -PI / 4]);
      return { type: 'input', form: T, q: ['lp.t.period', { eq: ['eq', T, sv(a, b, c, 1)] }],
               fields: ['lp.f.period'], answers: [2 * PI / b], concept: 'period',
               solution: ['lp.sol.period', { p: ['pi', 2 * PI / b] }],
               explain: ['lp.x.period', { bv: b, p: ['pi', 2 * PI / b] }] };
    },
    () => {
      const a = pick([2, 3, -2, 0.5]), d = pick([-1, 1, 2]), n = Math.abs(a);
      return { type: 'choice', form: T, q: ['lp.t.sinRange', { eq: ['eq', T, sv(a, 1, 0, d)] }],
               options: [rangeOpt(d - n, d + n), rangeOpt(-n, n), rangeOpt(d, d + n), rangeOpt(d - 1, d + 1)],
               correct: 0, why: { 1: 'lp.why.lift', 2: 'lp.why.amp', 3: 'lp.why.amp' },
               remedy: { 1: 'shiftY', 2: 'amp', 3: 'amp' } };
    }
  ]
};

MFE.paths.register({
  id: 'trig', category: 'trig', feature: 'cat.trig', title: 'cat.trig',
  concepts: { sinus: { a: 'amp', b: 'period', c: 'shiftX', d: 'shiftY' } },
  steps: [sine, amplitude, period, shiftX, shiftY, general]
});
})();
