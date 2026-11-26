/* ==========================================================================
   tools/paths-test.mjs  ·  Lernpfade pruefen
   --------------------------------------------------------------------------
   Ein Lernpfad, in dem ein Auftrag mit dem Regler nicht erreichbar ist,
   haelt eine Schuelerin fest, die allein arbeitet - niemand ist da, der
   "ueberspring das" sagt. Deshalb wird hier nicht stichprobenartig, sondern
   erschoepfend geprueft:

     1. Jeder Text existiert in beiden Sprachen, mit denselben Platzhaltern,
        und nach dem Einsetzen bleibt kein {x} und kein "undefined" stehen.
     2. Jeder Auftrag ist auf dem Raster der Regler erreichbar - geprueft
        durch Absuchen ALLER Reglerstellungen, in der vorgesehenen Reihenfolge.
     3. Jeder Aufgabenerzeuger wird 400-mal aufgerufen. Jede Aufgabe muss
        loesbar, eindeutig und sichtbar sein; die eigene Loesung muss als
        richtig gewertet werden und eine falsche nicht.
     4. Fortschritt: Freischalten, Test, Ueberspringen, Bereinigen fremder
        Daten aus dem Speicher.

   Aufruf:  npm run paths
   ========================================================================== */
import { JSDOM, VirtualConsole } from 'jsdom';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(path.join(ROOT, f), 'utf8');

const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', (e) => errors.push('jsdomError: ' + e.message));
vc.on('error', (...a) => errors.push('console.error: ' + a.join(' ')));

const dom = new JSDOM('<!DOCTYPE html><body></body>', {
  url: 'https://example.org/', runScripts: 'outside-only', virtualConsole: vc
});
const { window } = dom;
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });

for (const f of ['js/licence.js', 'js/i18n.js', 'js/functions.js', 'js/graph.js', 'js/diagnose.js',
                 'js/nav.js', 'js/ui.js', 'js/qr.js', 'js/quiz.js', 'js/paths.js', 'js/paths-linear.js',
                 'js/paths-quadratic.js', 'js/paths-exponential.js', 'js/paths-trig.js']) {
  try { window.eval(read(f)); } catch (e) { errors.push(`${f}: ${e.message}`); }
}

const MFE = window.MFE;
const { FUNCTIONS } = MFE.math;
const P = MFE.paths;
const { core, kit } = P;
const I18N = MFE.i18n;

let checks = 0;
const problems = [];
const expect = (cond, what) => { checks++; if (!cond) problems.push(what); };
const once = new Set();
const expectOnce = (cond, what) => {      // gleiche Meldung nur einmal
  checks++;
  if (!cond && !once.has(what)) { once.add(what); problems.push(what); }
};

/* ==========================================================================
   1 · TEXTE
   ========================================================================== */
const i18nSrc = read('js/i18n.js');
function dictKeys(name, next) {
  const start = i18nSrc.indexOf(`const ${name} = {`);
  const end = next ? i18nSrc.indexOf(`const ${next} = {`) : i18nSrc.indexOf('const dicts');
  const body = i18nSrc.slice(start, end);
  const map = new Map();
  for (const m of body.matchAll(/^\s{2}'([^']+)':\s*'((?:[^'\\]|\\.)*)'/gm)) map.set(m[1], m[2]);
  return map;
}
const de = dictKeys('de', 'en');
const en = dictKeys('en', null);

const src = ['js/paths.js', 'js/paths-linear.js', 'js/paths-quadratic.js', 'js/paths-exponential.js', 'js/paths-trig.js']
  .map(read).join('\n');
const literalKeys = new Set([...src.matchAll(/'((?:lp|home|info|cat|quiz|btn)\.[\w.]+)'/g)].map(m => m[1]));
// Zur Laufzeit zusammengesetzte Schluessel ausdruecklich aufzaehlen.
for (const s of ['done', 'skipped', 'open', 'locked']) literalKeys.add('lp.state.' + s);
for (const s of ['predict', 'explore', 'rule', 'practice', 'test']) literalKeys.add('lp.phase.' + s);
for (const k of [...literalKeys]) if (k.endsWith('.')) literalKeys.delete(k);

for (const k of literalKeys) {
  expect(de.has(k), `Schluessel "${k}" fehlt auf Deutsch`);
  expect(en.has(k), `Schluessel "${k}" fehlt auf Englisch`);
}
const holes = (s) => new Set([...(s ?? '').matchAll(/\{(\w+)\}/g)].map(m => m[1]));
for (const [k, v] of de) {
  if (!k.startsWith('lp.') || !en.has(k)) continue;
  const a = [...holes(v)].sort().join(','), b = [...holes(en.get(k))].sort().join(',');
  expect(a === b, `Platzhalter in "${k}" unterscheiden sich: de {${a}} / en {${b}}`);
}

/** Text in beiden Sprachen erzeugen und auf Reste pruefen. */
function rendered(spec, form, where) {
  const out = [];
  for (const lang of ['de', 'en']) {
    I18N.lang = lang;
    const s = typeof spec === 'function' ? spec() : core.txt(spec, form);
    expectOnce(typeof s === 'string' && s.length > 0, `${where}: leerer Text (${lang})`);
    expectOnce(!/\{\w+\}/.test(s), `${where}: Platzhalter bleibt stehen (${lang}): "${s}"`);
    expectOnce(!/undefined|NaN|\[object/.test(s), `${where}: kaputter Text (${lang}): "${s}"`);
    const key = Array.isArray(spec) ? spec[0] : spec;
    if (typeof key === 'string') expectOnce(s !== key, `${where}: Schluessel "${key}" nicht uebersetzt (${lang})`);
    out.push(s);
  }
  I18N.lang = 'de';
  return out;
}

/* ==========================================================================
   2 · REGISTER UND AUFBAU
   ========================================================================== */
const path_ = P.paths.quadratic;
expect(!!path_, 'Lernpfad "quadratic" ist angemeldet');
expect(path_?.steps.length === 8, `acht Schritte (${path_?.steps.length})`);
expect(new Set(path_.steps.map(s => s.id)).size === path_.steps.length, 'Schritt-IDs sind eindeutig');

for (const bad of [null, {}, { id: 'x', steps: [] },
                   { id: 'x', steps: [{ id: 's', form: 'nope', free: [], tasks: [() => null] }] },
                   { id: 'x', steps: [{ id: 's', form: 'quad_vertex', free: ['zz'], tasks: [() => null] }] },
                   { id: 'x', steps: [{ id: 's', form: 'quad_vertex', free: [], tasks: [] }] }]) {
  let threw = false;
  try { P.register(bad); } catch { threw = true; }
  expect(threw, `register() weist fehlerhafte Definition ab: ${JSON.stringify(bad)?.slice(0, 60)}`);
}
expect(!P.paths.x, 'eine abgewiesene Definition landet nicht im Register');

const EXPECTED = { linear: 6, quadratic: 8, exponential: 4, trig: 6 };
const ALL = Object.keys(EXPECTED).map(id => P.paths[id]).filter(Boolean);
for (const [id, n] of Object.entries(EXPECTED)) {
  expect(P.paths[id]?.steps.length === n, `Lernpfad "${id}" mit ${n} Schritten angemeldet (${P.paths[id]?.steps.length})`);
}
for (const pa of ALL) {
  expect(new Set(pa.steps.map(s => s.id)).size === pa.steps.length, `${pa.id}: Schritt-IDs sind eindeutig`);
  expect(pa.category === pa.id && !!FUNCTIONS[pa.steps[0].form], `${pa.id}: Kategorie passt`);
  // Jeder Begriff, auf den ein Rueckverweis zeigen kann, wird von einem Schritt eingefuehrt.
  for (const map of Object.values(pa.concepts)) {
    for (const c of Object.values(map)) {
      expect(pa.steps.some(s => s.concepts.includes(c)), `${pa.id}: Begriff "${c}" wird von keinem Schritt eingefuehrt`);
    }
  }
  // Begriffe von Aufgaben (concept, remedy) muessen ebenfalls eingefuehrt sein.
  for (const st of pa.steps) for (let r = 0; r < 60; r++) {
    const tk = core.buildTasks(st);
    for (const t0 of tk) for (const c of [t0.concept, ...Object.values(t0.remedy ?? {})].filter(Boolean)) {
      expectOnce(pa.steps.some(s => s.concepts.includes(c)), `${pa.id}: Aufgabe verweist auf unbekannten Begriff "${c}"`);
    }
  }
}
// Schritt-IDs sind pfaduebergreifend eindeutig (der Speicher trennt nach Pfad, die Tests nicht)
{
  const ids = ALL.flatMap(pa => pa.steps.map(s => s.id));
  expect(new Set(ids).size === ids.length, 'Schritt-IDs sind ueber alle Pfade eindeutig');
}

/* ==========================================================================
   3 · SCHRITTE: TEXTE, VERMUTUNG, AUFTRAEGE
   ========================================================================== */
/** Alle Werte, die ein Regler annehmen kann (Raster aus min, step, max). */
function grid(p) {
  const out = [];
  const n = Math.round((p.max - p.min) / p.step);
  for (let i = 0; i <= n; i++) out.push(Math.round((p.min + i * p.step) * 1e4) / 1e4);
  return out;
}

function stateOf(form, values, x) {
  const d = FUNCTIONS[form];
  return { v: values, x, y: x == null ? NaN : d.f(x, values), f: (xx) => d.f(xx, values) };
}

/** Alle erreichbaren Zustaende eines Schritts. */
function* states(step) {
  const d = FUNCTIONS[step.form];
  const base = { ...Object.fromEntries(d.params.map(p => [p.id, p.value])), ...step.start };
  const axes = step.free.map(id => grid(d.params.find(p => p.id === id)));
  const xs = step.trace ? grid({ min: step.trace.min, max: step.trace.max, step: step.trace.step }) : [null];
  const rec = function* (i, vals) {
    if (i === axes.length) { for (const x of xs) yield stateOf(step.form, { ...vals }, x); return; }
    for (const v of axes[i]) { vals[step.free[i]] = v; yield* rec(i + 1, vals); }
  };
  yield* rec(0, { ...base });
}

for (const pa of ALL) for (const [si, step] of pa.steps.entries()) {
  const tag = `${pa.id} Schritt ${si + 1} (${step.id})`;
  for (const k of ['title', 'goal']) rendered(step[k], step.form, `${tag} ${k}`);
  if (step.exploreLead) rendered(step.exploreLead, step.form, `${tag} lead`);
  for (const [i, r] of step.rule.entries()) rendered(r, step.form, `${tag} Merksatz ${i + 1}`);

  // Vermutung
  const pr = step.predict;
  expect(pr.options.length >= 3, `${tag}: Vermutung mit mindestens drei Antworten`);
  expect(Number.isInteger(pr.correct) && pr.correct >= 0 && pr.correct < pr.options.length, `${tag}: Vermutung hat gueltige richtige Antwort`);
  rendered(pr.q, step.form, `${tag} Vermutungsfrage`);
  const texts = pr.options.map((o, i) => rendered(o, step.form, `${tag} Vermutung ${i}`)[0]);
  expect(new Set(texts).size === texts.length, `${tag}: Antworten der Vermutung sind verschieden`);

  // Sichtfenster, Startwerte
  expect(step.view.xMin < step.view.xMax && step.view.yMin < step.view.yMax, `${tag}: Ausschnitt ist gueltig`);
  for (const p of FUNCTIONS[step.form].params) {
    const v = step.start[p.id] ?? p.value;
    expect(v >= p.min && v <= p.max, `${tag}: Startwert ${p.id}=${v} liegt im Reglerbereich`);
  }
  if (step.ref) expect(!!FUNCTIONS[step.ref.form], `${tag}: Vergleichskurve hat eine bekannte Form`);
  expect(step.free.length > 0 || !!step.trace, `${tag}: es gibt etwas zu bewegen`);

  // Auftraege: erreichbar, in Reihenfolge, Start erfuellt den ersten nicht
  expect(step.missions.length >= 2, `${tag}: mindestens zwei Auftraege`);
  const startState = stateOf(step.form,
    { ...Object.fromEntries(FUNCTIONS[step.form].params.map(p => [p.id, p.value])), ...step.start },
    step.trace ? step.trace.start : null);
  expect(!step.missions[0].check(startState, {}), `${tag}: der Startzustand erfuellt den ersten Auftrag nicht schon`);
  const memo = {};
  step.missions.forEach((m, mi) => {
    rendered(m.text, step.form, `${tag} Auftrag ${mi + 1}`);
    rendered(m.hint, step.form, `${tag} Tipp ${mi + 1}`);
    // Beim ersten Treffer aufhoeren: bei vier freien Reglern (Sinus) sind es
    // sonst 14 Millionen Zustaende je Auftrag.
    let hit = null;
    for (const s of states(step)) {
      if (m.check(s, memo)) { hit = s; break; }
    }
    expect(!!hit, `${tag}: Auftrag ${mi + 1} ist mit den Reglern NICHT erreichbar`);
    if (hit) m.done?.(hit, memo);
  });
}

/* ==========================================================================
   4 · AUFGABEN
   ========================================================================== */
const RUNS = 400;
const inRange = (p, v) => v >= (p.hardMin ?? -1e6) - 1e-9 && v <= (p.hardMax ?? 1e6) + 1e-9;
const inSlider = (p, v) => v >= p.min - 1e-9 && v <= p.max + 1e-9;
const visibleVertex = (form, values, view) => {
  const vx = FUNCTIONS[form].vertex?.(values);
  return !vx || (vx.x > view.xMin && vx.x < view.xMax && vx.y > view.yMin && vx.y < view.yMax);
};
const tasksSeen = {};

/** Anteil von 200 Stuetzstellen, deren Funktionswert im Bild liegt. */
function visibleShare(form, values, view) {
  let ok = 0;
  for (let i = 0; i < 200; i++) {
    const x = view.xMin + ((view.xMax - view.xMin) * (i + 0.5)) / 200;
    const y = FUNCTIONS[form].f(x, values);
    if (Number.isFinite(y) && y > view.yMin && y < view.yMax) ok++;
  }
  return ok / 200;
}

/** Kleinster und groesster Wert ueber eine volle Periode (fein abgetastet). */
function sinRange(v) {
  let lo = Infinity, hi = -Infinity;
  const per = (2 * Math.PI) / v.b;
  for (let i = 0; i <= 4000; i++) {
    const y = FUNCTIONS.sinus.f(v.c + (per * i) / 4000, v);
    lo = Math.min(lo, y); hi = Math.max(hi, y);
  }
  return [lo, hi];
}

/**
 * Unabhaengige Nachrechnung fuer die Aufgabenarten der Pfade "linear",
 * "exponential" und "trig". Grundsatz wie oben: NIE die Loesung des
 * Erzeugers uebernehmen, sondern aus der Aufgabenstellung selbst rechnen.
 */
function semantic(task, qKey, tag, view) {
  const v1 = task.q?.[1] ?? {};
  const ans = task.answers ?? [];
  const opt = task.type === 'choice' ? task.options : [];
  const right = opt[task.correct];
  const saysTrue = right?.k === 'lp.true';
  const ok = (cond, what) => expectOnce(cond, `${tag}: ${what}`);
  const lf = (v, x) => v.m * x + v.b;
  const ef = (v, x) => FUNCTIONS.exponential.f(x, v);
  const sf = (v, x) => FUNCTIONS.sinus.f(x, v);
  const near6 = (a, b) => Math.abs(a - b) < 1e-6;

  switch (qKey) {
    /* ---- linear ---- */
    case 'lp.t.slope2': {
      const [, x1, y1] = v1.p1, [, x2, y2] = v1.p2;
      ok(near6(ans[0], (y2 - y1) / (x2 - x1)), 'Steigung aus zwei Punkten falsch'); break;
    }
    case 'lp.t.findB': {
      const [, x, y] = v1.p;
      ok(near6(ans[0], y - v1.mv * x), 'b aus Punkt und Steigung falsch'); break;
    }
    case 'lp.t.linYint': ok(near6(ans[0], lf(v1.eq[2], 0)), 'y-Achsenabschnitt der Geraden falsch'); break;
    case 'lp.t.linValue': ok(near6(ans[0], lf(v1.eq[2], v1.x)), 'Funktionswert der Geraden falsch'); break;
    case 'lp.t.twoPoints': {
      const [, x1, y1] = v1.p1, [, x2, y2] = v1.p2;
      ok(near6(lf({ m: ans[0], b: ans[1] }, x1), y1) && near6(lf({ m: ans[0], b: ans[1] }, x2), y2),
         'Gerade geht nicht durch beide Punkte'); break;
    }
    case 'lp.t.linRoot': ok(near6(lf(v1.eq[2], ans[0]), 0), 'Nullstelle der Geraden falsch'); break;
    case 'lp.t.intersect': {
      const f = v1.f[2], g = v1.g[2];
      ok(near6(lf(f, ans[0]), ans[1]) && near6(lf(g, ans[0]), ans[1]) && f.m !== g.m, 'Schnittpunkt falsch'); break;
    }
    case 'lp.t.steepest': {
      const ms = opt.map(o => Math.abs(o.eq.m));
      ok(ms[task.correct] === Math.max(...ms) && ms.filter(x => x === Math.max(...ms)).length === 1, 'steilste Gerade nicht eindeutig'); break;
    }
    case 'lp.t.rising': ok(saysTrue === (v1.eq[2].m > 0), '"steigend" falsch bewertet'); break;
    case 'lp.t.onLine': { const [, x, y] = v1.p; ok(saysTrue === near6(lf(v1.eq[2], x), y), '"liegt auf der Geraden" falsch bewertet'); break; }
    case 'lp.t.linRootTf': ok(saysTrue === near6(lf(v1.eq[2], v1.r), 0), 'Nullstellen-Aussage falsch bewertet'); break;
    case 'lp.t.linRootChoice': {
      opt.forEach((o, i) => ok(near6(lf(v1.eq[2], o.v.x), 0) === (i === task.correct), 'Nullstellen-Auswahl falsch zugeordnet'));
      break;
    }
    case 'lp.t.parallel': {
      const m0 = v1.eq[2].m;
      opt.forEach((o, i) => ok(near6(o.eq.m, m0) === (i === task.correct), 'parallele Gerade falsch zugeordnet'));
      opt.forEach((o, i) => i === task.correct && ok(o.eq.b !== v1.eq[2].b, 'die "parallele" Gerade ist identisch'));
      break;
    }
    case 'lp.t.perp': {
      const m0 = v1.eq[2].m;
      opt.forEach((o, i) => ok(near6(o.eq.m * m0, -1) === (i === task.correct), 'senkrechte Gerade falsch zugeordnet'));
      break;
    }
    case 'lp.t.parallelTf': ok(saysTrue === near6(v1.f[2].m, v1.g[2].m), 'Parallel-Aussage falsch bewertet'); break;
    case 'lp.t.noRoot':
      opt.forEach((o, i) => ok((o.eq.m === 0 && o.eq.b !== 0) === (i === task.correct), '"keine Nullstelle" falsch zugeordnet'));
      break;
    case 'lp.t.throughBoth': {
      const [, x1, y1] = v1.p1, [, x2, y2] = v1.p2;
      opt.forEach((o, i) => ok((near6(lf(o.eq, x1), y1) && near6(lf(o.eq, x2), y2)) === (i === task.correct),
                               '"durch beide Punkte" falsch zugeordnet'));
      break;
    }
    case 'lp.t.linDescribe': {
      const v = v1.eq[2];
      const dir = v.m > 0 ? 'lp.lin.up' : v.m < 0 ? 'lp.lin.down' : 'lp.lin.flat';
      ok(right.v.d[1] === dir && right.v.b === v.b, 'Beschreibung der Geraden falsch'); break;
    }
    case 'lp.t.linShift': {
      const b = v1.eq[2].b;
      ok(right.k === (b > 0 ? 'lp.dir.up' : 'lp.dir.down') && right.v.n === Math.abs(b) && v1.base[2].m === v1.eq[2].m,
         'Verschiebung der Geraden falsch'); break;
    }
    /* ---- exponentiell ---- */
    case 'lp.t.expValue': ok(near6(ans[0], ef(v1.eq[2], v1.x)), 'Funktionswert der Exponentialfunktion falsch'); break;
    case 'lp.t.expYint': ok(near6(ans[0], ef(v1.eq[2], 0)), 'y-Achsenabschnitt der Exponentialfunktion falsch'); break;
    case 'lp.t.findExpA': { const [, x, y] = v1.p; ok(near6(ans[0] * v1.bv ** x, y), 'Anfangswert erfuellt die Punktprobe nicht'); break; }
    case 'lp.t.expYintTf': ok(saysTrue === near6(ef(v1.eq[2], 0), v1.y), 'y-Achsenabschnitt-Aussage falsch bewertet'); break;
    case 'lp.t.factorUp': ok(near6(ans[0], 1 + v1.p / 100), 'Wachstumsfaktor falsch'); break;
    case 'lp.t.factorDown': ok(near6(ans[0], 1 - v1.p / 100), 'Abnahmefaktor falsch'); break;
    case 'lp.t.growing': ok(saysTrue === (v1.eq[2].b > 1 && v1.eq[2].a > 0), '"steigend" falsch bewertet'); break;
    case 'lp.t.decay':
      opt.forEach((o, i) => ok((o.eq.b < 1 && o.eq.a > 0) === (i === task.correct), '"Abnahme" falsch zugeordnet'));
      break;
    case 'lp.t.whatPercent': {
      const b = v1.eq[2].b;
      ok(right.k === (b > 1 ? 'lp.pct.up' : 'lp.pct.down') && near6(right.v.p, Math.abs(b - 1) * 100), 'Prozentsatz falsch'); break;
    }
    case 'lp.t.model': {
      const o = right; const want = 1 + v1.p / 100;
      ok(!o.form && near6(o.eq.a, v1.av) && near6(o.eq.b, want) && o.eq.c === 0, 'Zinsmodell falsch'); break;
    }
    case 'lp.t.factorTf': {
      const b = v1.eq[2].b;
      const want = { 'lp.kind.double': 2, 'lp.kind.half': 0.5, 'lp.kind.up': 1.1, 'lp.kind.down': 0.9 }[v1.what[1]];
      ok(saysTrue === near6(b, want), 'Faktor-Aussage falsch bewertet'); break;
    }
    case 'lp.t.asymptote': {
      const v = v1.eq[2];
      // Asymptote: Grenzwert fuer x -> -inf (b>1) bzw. +inf (b<1)
      const far = v.b > 1 ? -60 : 60;
      ok(Math.abs(ef(v, far) - ans[0]) < 1e-6, 'Asymptote falsch'); break;
    }
    case 'lp.t.whichAsym': ok(right.k === 'lp.asym.y' && right.v.c === v1.eq[2].c, 'Asymptote falsch markiert'); break;
    /* ---- trigonometrisch ---- */
    case 'lp.t.sinValue': ok(Math.abs(Math.sin(v1.x[1]) - ans[0]) < 1e-9, 'Sinuswert falsch'); break;
    case 'lp.t.sinZeroTf': ok(saysTrue === (Math.abs(Math.sin(v1.x[1])) < 1e-9), 'Sinus-Nullstelle falsch bewertet'); break;
    case 'lp.t.sinZeroCount': {
      const lo = v1.lo[1], hi = v1.hi[1];
      const n = Math.floor(hi / Math.PI + 1e-9) - Math.ceil(lo / Math.PI - 1e-9) + 1;
      ok(Number(right.text) === n, `Anzahl der Sinus-Nullstellen falsch (${right.text} statt ${n})`); break;
    }
    case 'lp.t.sinPeriod': ok(right.text === '2π', 'Periode von sin(x) falsch'); break;
    case 'lp.t.amp': ok(near6(ans[0], (sinRange(v1.eq[2])[1] - sinRange(v1.eq[2])[0]) / 2), 'Amplitude falsch'); break;
    case 'lp.t.ampTf': {
      const [lo, hi] = sinRange(v1.eq[2]);
      ok(saysTrue === (Math.abs((hi - lo) / 2 - v1.n) < 1e-6), 'Amplituden-Aussage falsch bewertet'); break;
    }
    case 'lp.t.period': {
      const v = v1.eq[2], p = ans[0];
      let same = true;
      for (let x = -3; x <= 3; x += 0.37) if (Math.abs(sf(v, x) - sf(v, x + p)) > 1e-9) same = false;
      let shorter = false;
      for (const q of [p / 2, p / 3, p / 4]) {
        let s2 = true;
        for (let x = -3; x <= 3; x += 0.37) if (Math.abs(sf(v, x) - sf(v, x + q)) > 1e-9) s2 = false;
        if (s2) shorter = true;
      }
      ok(same && !shorter, 'Periode falsch (nicht die kleinste)'); break;
    }
    case 'lp.t.freq': ok(near6(2 * Math.PI / ans[0], v1.p[1]), 'b aus der Periode falsch'); break;
    case 'lp.t.periodTf': ok(saysTrue === near6(2 * Math.PI / v1.eq[2].b, v1.p[1]), 'Perioden-Aussage falsch bewertet'); break;
    case 'lp.t.sinShiftZero': ok(saysTrue === (Math.abs(sf(v1.eq[2], v1.x[1])) < 1e-9), 'Nullstellen-Aussage (Sinus) falsch bewertet'); break;
    case 'lp.t.midline': {
      const [lo, hi] = sinRange(v1.eq[2]);
      ok(near6(ans[0], (lo + hi) / 2), 'Mittellinie falsch'); break;
    }
    case 'lp.t.maxTf': ok(saysTrue === near6(sinRange(v1.eq[2])[1], v1.y), 'Maximum-Aussage falsch bewertet'); break;
    case 'lp.t.sinMax': ok(near6(ans[0], sinRange(v1.eq[2])[1]), 'Maximum falsch'); break;
    case 'lp.t.sinRange': {
      const [lo, hi] = sinRange(v1.eq[2]);
      opt.forEach((o, i) => {
        if (o.k !== 'lp.range' || Array.isArray(o.v.lo)) { ok(i !== task.correct, 'Wertebereich falsch markiert'); return; }
        ok((near6(o.v.lo, lo) && near6(o.v.hi, hi)) === (i === task.correct), 'Wertebereich falsch zugeordnet');
      });
      break;
    }
    case 'lp.t.cosAsSin':
      opt.forEach((o, i) => {
        let same = true;
        for (let x = -6; x <= 6; x += 0.31) if (Math.abs(sf(o.eq, x) - Math.cos(x)) > 1e-9) same = false;
        ok(same === (i === task.correct), 'Kosinus als Sinus falsch zugeordnet');
      });
      break;
    case 'lp.t.dirQSin': {
      const c = v1.eq[2].c;
      ok(right.k === (c > 0 ? 'lp.dir.right' : 'lp.dir.left') && near6(right.v.n[1], Math.abs(c)), 'Verschiebungsrichtung (Sinus) falsch'); break;
    }
    default: break;
  }
}

for (const pa of ALL) for (const [si, step] of pa.steps.entries()) {
  step.tasks.forEach((gen, gi) => {
    const tag = `${pa.id} Schritt ${si + 1}, Erzeuger ${gi + 1}`;
    for (let run = 0; run < RUNS; run++) {
      let task;
      try { task = gen(); } catch (e) { expectOnce(false, `${tag}: wirft ${e.message}`); continue; }
      expectOnce(['choice', 'input', 'build'].includes(task?.type), `${tag}: unbekannter Typ ${task?.type}`);
      if (!task) continue;
      const qKey = Array.isArray(task.q) ? task.q[0] : task.q;
      tasksSeen[qKey] = (tasksSeen[qKey] ?? 0) + 1;
      const form = task.form ?? task.graph?.form ?? step.form;
      expectOnce(!!FUNCTIONS[form], `${tag}: Form ${form} unbekannt`);
      if (run < 25) {
        rendered(task.q, form, `${tag} Frage`);
        if (task.explain) rendered(task.explain, form, `${tag} Erklaerung`);
        if (task.solution) rendered(task.solution, form, `${tag} Loesung`);
        for (const w of Object.values(task.why ?? {})) rendered(w, form, `${tag} Begruendung`);
      }
      const view = task.view ?? step.view;

      if (task.graph) {
        const d = FUNCTIONS[task.graph.form];
        for (const p of d.params) expectOnce(inRange(p, task.graph.values[p.id]), `${tag}: Graph-Wert ${p.id} ausserhalb`);
        expectOnce(visibleVertex(task.graph.form, task.graph.values, view),
                   `${tag}: Scheitelpunkt liegt ausserhalb des Ausschnitts (${JSON.stringify(task.graph.values)})`);
        expectOnce(visibleShare(task.graph.form, task.graph.values, view) > 0.15,
                   `${tag}: Graph ist im Ausschnitt kaum zu sehen (${JSON.stringify(task.graph.values)})`);
      }
      semantic(task, qKey, tag, view);

      if (task.type === 'choice') {
        expectOnce(task.options.length >= 2, `${tag}: weniger als zwei Antworten`);
        expectOnce(Number.isInteger(task.correct) && task.correct >= 0 && task.correct < task.options.length,
                   `${tag}: richtige Antwort ausserhalb der Liste`);
        for (const lang of ['de', 'en']) {
          I18N.lang = lang;
          const texts = task.options.map(o => core.optionText(o, form));
          expectOnce(new Set(texts).size === texts.length, `${tag}: zwei Antworten sehen gleich aus (${lang}): ${texts.join(' / ')}`);
          for (const tx of texts) expectOnce(!/\{\w+\}|undefined|NaN/.test(tx), `${tag}: kaputte Antwort (${lang}) "${tx}"`);
        }
        I18N.lang = 'de';
        const eqs = task.options.filter(o => o.eq);
        for (let i = 0; i < eqs.length; i++) {
          const fi = eqs[i].form ?? form;
          for (const p of FUNCTIONS[fi].params) expectOnce(inRange(p, eqs[i].eq[p.id]), `${tag}: Antwortwert ${p.id} ausserhalb`);
          for (let j = i + 1; j < eqs.length; j++) {
            if ((eqs[j].form ?? form) !== fi) continue;          // verschiedene Formen: Texte unterscheiden sich ohnehin
            expectOnce(!kit.sameCurve(fi, eqs[i].eq, eqs[j].eq), `${tag}: zwei Antworten beschreiben denselben Graphen`);
          }
        }
        if (task.kind === 'graphEq') {
          const g = task.graph;
          expectOnce(kit.sameCurve(g.form, g.values, task.options[task.correct].eq), `${tag}: richtige Gleichung passt nicht zum Graphen`);
          task.options.forEach((o, i) => {
            if (i !== task.correct) expectOnce(!kit.sameCurve(g.form, g.values, o.eq), `${tag}: ein Ablenker passt auch zum Graphen`);
          });
        }
        // Inhaltliche Stichproben
        if (qKey === 'lp.t.whichVertex') {
          const p = task.q[1].p;
          const vx = FUNCTIONS.quad_vertex.vertex(task.options[task.correct].eq);
          expectOnce(vx.x === p[1] && vx.y === p[2], `${tag}: richtige Antwort hat nicht den gefragten Scheitelpunkt`);
          task.options.forEach((o, i) => {
            if (i === task.correct) return;
            const w = FUNCTIONS.quad_vertex.vertex(o.eq);
            expectOnce(!(w.x === p[1] && w.y === p[2]), `${tag}: Ablenker hat ebenfalls den gefragten Scheitelpunkt`);
          });
        }
        if (qKey === 'lp.t.rootCount') {
          const v = task.q[1].eq[2];
          const n = MFE.graph.findZeros((x) => FUNCTIONS.quad_vertex.f(x, v), -20, 20).length;
          // findZeros findet eine Beruehrstelle nicht immer - die Rechnung entscheidet.
          const want = v.e === 0 ? 1 : v.a * v.e < 0 ? 2 : 0;
          if (want !== 1) expectOnce(n === want, `${tag}: Nullstellenzahl ${want}, gefunden ${n}`);
          expectOnce(task.options[task.correct].k === 'lp.roots.' + want, `${tag}: falsche Nullstellenzahl als richtig markiert`);
        }
        if (qKey === 'lp.t.widest' || qKey === 'lp.t.narrowest') {
          const as = task.options.map(o => Math.abs(o.eq.a));
          const best = qKey === 'lp.t.widest' ? Math.min(...as) : Math.max(...as);
          expectOnce(as[task.correct] === best && as.filter(a => a === best).length === 1,
                     `${tag}: breiteste/schmalste Parabel nicht eindeutig richtig`);
        }
        if (qKey === 'lp.t.toVertex') {
          const sv = task.q[1].eq[2];
          const vv = task.options[task.correct].eq;
          expectOnce(kit.sameCurve('quad_vertex', vv, { a: sv.a, d: -sv.b / 2, e: sv.c - sv.b * sv.b / 4 }),
                     `${tag}: richtige Scheitelpunktform ist nicht gleichwertig`);
          for (let x = -5; x <= 5; x++) {
            expectOnce(Math.abs(FUNCTIONS.quad_vertex.f(x, vv) - FUNCTIONS.quad_standard.f(x, sv)) < 1e-9,
                       `${tag}: Scheitelpunktform und Normalform weichen ab`);
          }
        }
        // Wahr/Falsch-Aussagen und Beschreibungen unabhaengig nachrechnen
        const v1 = task.q?.[1] ?? {};
        const saysTrue = task.options[task.correct].k === 'lp.true';
        if (qKey === 'lp.t.onNormal') {
          const [, x, y] = v1.p;
          expectOnce(saysTrue === (y === x * x), `${tag}: "liegt auf der Normalparabel" falsch bewertet`);
        }
        if (qKey === 'lp.t.isVertex') {
          const vx = FUNCTIONS.quad_vertex.vertex(v1.eq[2]);
          expectOnce(saysTrue === (vx.x === v1.p[1] && vx.y === v1.p[2]), `${tag}: Scheitelpunkt-Aussage falsch bewertet`);
        }
        if (qKey === 'lp.t.tfDown') expectOnce(saysTrue === (v1.eq[2].a < 0), `${tag}: Oeffnung falsch bewertet`);
        if (qKey === 'lp.t.tfWide') expectOnce(saysTrue === (Math.abs(v1.eq[2].a) < 1), `${tag}: Breite falsch bewertet`);
        if (qKey === 'lp.t.tfVertexX') {
          const sv = v1.eq[2];
          expectOnce(saysTrue === near(v1.xs, -sv.b / (2 * sv.a)), `${tag}: Scheitelstelle falsch bewertet`);
        }
        if (qKey === 'lp.t.notOnNormal') {
          task.options.forEach((o, i) => {
            const [, x, y] = o.v.p;
            expectOnce((y !== x * x) === (i === task.correct), `${tag}: "liegt nicht darauf" falsch zugeordnet`);
          });
        }
        if (qKey === 'lp.t.dirQ') {
          const v = v1.eq[2];
          const key = v.d !== 0 ? (v.d > 0 ? 'lp.dir.right' : 'lp.dir.left') : (v.e > 0 ? 'lp.dir.up' : 'lp.dir.down');
          const amount = v.d !== 0 ? Math.abs(v.d) : Math.abs(v.e);
          const right = task.options[task.correct];
          expectOnce(right.k === key && right.v.n === amount, `${tag}: Verschiebungsrichtung falsch`);
        }
        if (qKey === 'lp.t.describe') {
          const v = v1.eq[2];
          const right = task.options[task.correct].v;
          const w = Math.abs(v.a) > 1 ? 'lp.w.narrow' : Math.abs(v.a) < 1 ? 'lp.w.wide' : 'lp.w.same';
          expectOnce(right.o[1] === (v.a > 0 ? 'lp.open.up' : 'lp.open.down') && right.w[1] === w
                     && right.p[1] === v.d && right.p[2] === v.e, `${tag}: Beschreibung passt nicht zur Gleichung`);
        }
        if (qKey === 'lp.t.oneRoot') {
          task.options.forEach((o, i) => {
            const one = o.eq.e === 0;
            expectOnce(one === (i === task.correct), `${tag}: "genau eine Nullstelle" falsch zugeordnet`);
          });
        }
      }

      if (task.type === 'input') {
        expectOnce(task.fields.length === task.answers.length && task.answers.length > 0, `${tag}: Felder und Antworten passen nicht`);
        expectOnce(task.answers.every(Number.isFinite), `${tag}: Antwort ist keine Zahl`);
        expectOnce(core.gradeInput(task, task.answers), `${tag}: die eigene Loesung wird als falsch gewertet`);
        for (let i = 0; i < task.answers.length; i++) {
          const off = task.answers.slice();
          off[i] += 1;
          // Bei ungeordneten Antworten kann +1 zufaellig die andere treffen.
          const ambiguous = task.unordered && task.answers.some(a => Math.abs(a - off[i]) < 0.3);
          if (!ambiguous) expectOnce(!core.gradeInput(task, off), `${tag}: eine um 1 falsche Antwort gilt als richtig`);
        }
        if (task.unordered) expectOnce(core.gradeInput(task, task.answers.slice().reverse()), `${tag}: vertauschte Reihenfolge wird nicht akzeptiert`);
        expectOnce(!core.gradeInput(task, task.answers.slice(1)), `${tag}: zu wenige Werte gelten als richtig`);
        if (task.unordered && task.answers.length === 2 && task.answers[0] !== task.answers[1]) {
          expectOnce(!core.gradeInput(task, [task.answers[0], task.answers[0]]), `${tag}: zweimal dieselbe Nullstelle gilt als richtig`);
        }
        for (const f of task.fields) if (typeof f !== 'string') rendered(f, form, `${tag} Feld`);
        // Inhaltlich: Nullstellen sind wirklich Nullstellen, Scheitelpunkt ist der Scheitelpunkt
        if (['lp.t.rootsV', 'lp.t.pq', 'lp.t.readRoots'].includes(qKey)) {
          const [ff, vv] = task.graph ? [task.graph.form, task.graph.values] : [task.q[1].eq[1], task.q[1].eq[2]];
          for (const a of task.answers) expectOnce(Math.abs(FUNCTIONS[ff].f(a, vv)) < 1e-9, `${tag}: ${a} ist keine Nullstelle`);
          if (qKey === 'lp.t.readRoots') {
            for (const a of task.answers) expectOnce(a > view.xMin && a < view.xMax, `${tag}: Nullstelle nicht im Bild`);
          }
        }
        if (qKey === 'lp.t.vertex') {
          const [ff, vv] = [task.q[1].eq[1], task.q[1].eq[2]];
          const vx = FUNCTIONS[ff].vertex(vv);
          expectOnce(near(vx.x, task.answers[0]) && near(vx.y, task.answers[1]), `${tag}: Scheitelpunkt falsch berechnet`);
          // unabhaengig: kleinster bzw. groesster Funktionswert
          const f = (x) => FUNCTIONS[ff].f(x, vv);
          expectOnce(Math.abs(f(vx.x + 0.37) - f(vx.x - 0.37)) < 1e-9, `${tag}: Scheitelstelle ist keine Symmetrieachse`);
        }
        /* Jede Eingabeaufgabe wird UNABHAENGIG vom Erzeuger nachgerechnet.
           Ohne das ging eine falsche Musterloesung (x statt -x bei der
           Symmetrie) unbemerkt durch - die Pruefung uebernahm einfach die
           Loesung des Erzeugers. */
        const v1 = task.q?.[1] ?? {};
        if (qKey === 'lp.t.square') expectOnce(near(task.answers[0], v1.x * v1.x), `${tag}: f(x) = x² falsch`);
        if (qKey === 'lp.t.mirror') {
          const [, x, y] = v1.p;
          expectOnce(!near(task.answers[0], x) && near(task.answers[0] ** 2, y), `${tag}: Spiegelpunkt falsch`);
        }
        if (qKey === 'lp.t.findE') {
          const [, x, y] = v1.p;
          expectOnce(near(x * x + task.answers[0], y), `${tag}: e erfuellt die Punktprobe nicht`);
        }
        if (qKey === 'lp.t.findA') {
          const [, x, y] = v1.p;
          expectOnce(near(task.answers[0] * x * x, y), `${tag}: a erfuellt die Punktprobe nicht`);
        }
        if (qKey === 'lp.t.findA2') {
          const [, d, e] = v1.s, [, x, y] = v1.p;
          expectOnce(x !== d && near(task.answers[0] * (x - d) ** 2 + e, y), `${tag}: a erfuellt die Punktprobe nicht`);
        }
        if (qKey === 'lp.t.yint') {
          expectOnce(near(task.answers[0], FUNCTIONS[v1.eq[1]].f(0, v1.eq[2])), `${tag}: y-Achsenabschnitt falsch`);
        }
      }

      if (task.type === 'build') {
        const d = FUNCTIONS[task.form];
        expectOnce(task.free.every(id => d.params.some(p => p.id === id)), `${tag}: freier Parameter unbekannt`);
        for (const p of d.params) {
          const t0 = task.target[p.id], s0 = task.start[p.id];
          expectOnce(inSlider(p, t0), `${tag}: Ziel ${p.id}=${t0} ausserhalb des Reglers`);
          if (!task.free.includes(p.id)) expectOnce(t0 === s0, `${tag}: verborgener Parameter ${p.id} weicht vom Ziel ab - unloesbar`);
          // Erreichbar heisst: ein Rasterwert des Reglers liegt innerhalb der
          // Bewertungstoleranz. pi/2 liegt nicht auf dem 0,1-Raster, 1,6 aber nah genug.
          const k = Math.round((t0 - p.min) / p.step);
          const nearest = p.min + k * p.step;
          expectOnce(Math.abs(nearest - t0) <= MFE.math.tolerance(t0, p.step),
                     `${tag}: Ziel ${p.id}=${t0} ist mit dem Regler nicht genau genug einstellbar`);
        }
        expectOnce(core.gradeBuild(task, task.target), `${tag}: das Ziel selbst gilt nicht als getroffen`);
        expectOnce(!core.gradeBuild(task, task.start), `${tag}: schon der Start gilt als getroffen`);
        expectOnce(visibleVertex(task.form, task.target, view), `${tag}: Ziel-Scheitelpunkt ausserhalb des Ausschnitts`);
      }
    }
  });

  // Eine Uebungsrunde: fuenf Aufgaben, jeder Erzeuger einmal
  for (let r = 0; r < 30; r++) {
    const set = core.buildTasks(step);
    expectOnce(set.length === (step.count ?? 5), `${pa.id} Schritt ${si + 1}: Uebungsrunde hat ${set.length} statt 5 Aufgaben`);
    const kinds = new Set(set.map(t => (Array.isArray(t.q) ? t.q[0] : t.q) + t.type));
    expectOnce(kinds.size >= Math.min(4, step.tasks.length - 1), `${pa.id} Schritt ${si + 1}: zu wenig Abwechslung in einer Runde`);
  }
}
function near(a, b) { return Math.abs(a - b) < 1e-9; }

/* ==========================================================================
   5 · FORTSCHRITT
   ========================================================================== */
const ls = window.localStorage;
ls.removeItem(core.STORE_KEY);
const n = path_.steps.length;
const st = (i) => core.stepState('quadratic', i);

expect(st(0) === 'open' && [...Array(n - 1)].every((_, i) => st(i + 1) === 'locked'), 'leer: nur Schritt 1 offen');
expect(core.nextOpen('quadratic') === 0, 'leer: es geht mit Schritt 1 los');
core.recordPass('quadratic', 0, 4.5, 5);
expect(st(0) === 'done' && st(1) === 'open' && st(2) === 'locked', 'Schritt 1 bestanden: Schritt 2 frei');
core.recordPass('quadratic', 0, 4, 5);
expect(core.loadStore().quadratic.q1.best === 4.5, 'schlechteres Wiederholen ueberschreibt das Bestergebnis nicht');
core.recordPass('quadratic', 0, 5, 5);
expect(core.loadStore().quadratic.q1.best === 5, 'besseres Ergebnis wird uebernommen');
core.recordPass('quadratic', 4, 5, 5);
expect(st(1) === 'skipped' && st(2) === 'skipped' && st(3) === 'skipped', 'Test in Schritt 5: Schritte 2-4 gelten als uebersprungen');
expect(st(4) === 'done' && st(5) === 'open' && st(6) === 'locked', 'Test in Schritt 5: Schritt 5 geschafft, 6 frei');
expect(core.countPassed('quadratic') === 5, 'fuenf Schritte zaehlen als geschafft');
core.recordPass('quadratic', 1, 5, 5);
expect(st(1) === 'done', 'ein uebersprungener Schritt kann nachgeholt werden');
expect(!core.recordPass('quadratic', 99, 5, 5) && !core.recordPass('nope', 0, 5, 5), 'unbekannte Schritte werden abgewiesen');
core.resetPath('quadratic');
expect(st(0) === 'open' && st(1) === 'locked' && core.countPassed('quadratic') === 0, 'Zuruecksetzen loescht den Stand');

// Fremde oder kaputte Daten aus dem Speicher
for (const [raw, what] of [
  ['kein json', 'kein JSON'], ['null', 'null'], ['[]', 'Feld statt Objekt'],
  [JSON.stringify({ rev: 999, paths: { quadratic: { q1: { s: 'done', best: 5, n: 5 } } } }), 'fremde Fassung'],
  [JSON.stringify({ rev: 1, paths: { quadratic: { q1: { s: 'hacked', best: 5, n: 5 } } } }), 'unbekannter Zustand'],
  [JSON.stringify({ rev: 1, paths: { evil: { q1: { s: 'done' } } } }), 'unbekannter Pfad'],
  [JSON.stringify({ rev: 1, paths: { quadratic: { qX: { s: 'done' } } } }), 'unbekannter Schritt'],
  [JSON.stringify({ rev: 1, paths: { quadratic: [] } }), 'Feld als Pfad']
]) {
  ls.setItem(core.STORE_KEY, raw);
  const s = core.loadStore();
  expect(Object.keys(s).length === 0, `Speicher bereinigt: ${what}`);
  expect(st(0) === 'open' && st(1) === 'locked', `und der Pfad startet sauber: ${what}`);
}
ls.setItem(core.STORE_KEY, JSON.stringify({ rev: 1, paths: { quadratic: { q1: { s: 'done', best: 1e9, n: 5 }, q2: { s: 'done', best: -3, n: 'x' } } } }));
{
  const s = core.loadStore().quadratic;
  expect(s.q1.best === 5 && s.q2.best === 0 && s.q2.n === 5, 'Punktzahlen werden auf gueltige Werte begrenzt');
}
ls.removeItem(core.STORE_KEY);

/* ==========================================================================
   5b · FORTSETZEN: GESICHERTER SCHRITT
   Der Stand kommt aus dem WebView-Speicher und ist damit fremdes Material.
   Jede Abweichung muss zum Verwerfen fuehren (null) oder bereinigt werden -
   nie zu einem Absturz beim Wiederherstellen.
   ========================================================================== */
{
  const now = Date.now();
  const base = (pid, idx, phase = 'explore', mode = 'learn') => {
    const st = P.paths[pid].steps[idx];
    const d = FUNCTIONS[st.form];
    const raw = {
      rev: 1, at: now - 1000, open: true, pid, idx, mode, phase,
      guess: 1, predictOrder: st.predict.options.map((_, i) => i).reverse(),
      values: { ...Object.fromEntries(d.params.map(p => [p.id, p.value])), ...st.start },
      traceX: st.trace ? st.trace.start : null, memo: { x1: 2 }, mission: 1, trail: []
    };
    if (phase === 'practice') {
      const tasks = core.buildTasks(st);
      Object.assign(raw, { tasks, ti: 2, marks: [true, 'half'], remedies: [], attempt: 0, locked: false,
        order: tasks[2].type === 'choice' ? tasks[2].options.map((_, i) => i) : [], tried: [],
        wrongValues: null, taskValues: tasks[2].type === 'build' ? { ...tasks[2].start } : null,
        inputs: tasks[2].type === 'input' ? tasks[2].answers.map(() => '1,5') : null, fb: { cls: 'ok', text: 'Richtig!' } });
    }
    return raw;
  };
  const clone = (o) => JSON.parse(JSON.stringify(o));
  // Jeder Schritt jedes Pfades: erkunden und ueben muss den Rundlauf ueberstehen.
  for (const pa of ALL) for (let i = 0; i < pa.steps.length; i++) {
    for (const phase of ['predict', 'explore', 'rule', 'practice']) {
      for (let r = 0; r < (phase === 'practice' ? 15 : 1); r++) {
        const raw = clone(base(pa.id, i, phase));
        const st = core.sanitizeLesson(raw, now);
        expectOnce(!!st, `${pa.id} Schritt ${i + 1}/${phase}: gueltiger Stand wird angenommen`);
        if (!st) continue;
        expectOnce(st.phase === phase && st.guess === 1 && st.mission === 1, `${pa.id}/${phase}: Felder bleiben erhalten`);
        if (phase === 'practice') {
          expectOnce(st.score === 1.5 && st.ti === 2 && st.tasks.length === raw.tasks.length, `${pa.id}/${phase}: Punkte aus den Markierungen`);
        }
      }
    }
  }
  const bad = (what, mutate, phase = 'practice') => {
    const raw = clone(base('quadratic', 3, phase));
    mutate(raw);
    let st;
    try { st = core.sanitizeLesson(raw, now); } catch (e) { expect(false, `Fortsetzen: ${what} wirft ${e.message}`); return; }
    expect(st === null, `Fortsetzen: ${what} wird verworfen`);
  };
  bad('fremde Fassung', r => { r.rev = 2; });
  bad('zu alter Stand', r => { r.at = now - 30 * 24 * 3600 * 1000; });
  bad('Stand aus der Zukunft', r => { r.at = now + 3600 * 1000; });
  bad('unbekannter Pfad', r => { r.pid = 'evil'; });
  bad('Schritt ausserhalb', r => { r.idx = 99; });
  bad('Schritt als Text', r => { r.idx = '3'; });
  bad('unbekannte Phase', r => { r.phase = 'hack'; });
  bad('Test ausserhalb der Uebung', r => { r.mode = 'test'; r.phase = 'explore'; }, 'explore');
  bad('Regler als Text', r => { r.values.a = '1'; });
  bad('Regler NaN', r => { r.values.a = NaN; });
  bad('Regler riesig', r => { r.values.d = 1e9; });
  bad('Basis unter der harten Grenze', r => { r.pid = 'exponential'; r.idx = 0; r.values = { a: 1, b: -2, c: 0 }; r.tasks = core.buildTasks(P.paths.exponential.steps[0]); r.order = r.tasks[2].type === 'choice' ? r.tasks[2].options.map((_, i) => i) : []; });
  bad('keine Aufgaben', r => { r.tasks = []; });
  bad('zu viele Aufgaben', r => { r.tasks = Array(25).fill(r.tasks[0]); });
  bad('Aufgabe unbekannten Typs', r => { r.tasks[0].type = 'eval'; });
  bad('Schluessel mit Fremdtext', r => { r.tasks[1].q = '<img src=x onerror=alert(1)>'; });
  bad('Variable mit Objekt', r => { r.tasks[1].q = ['lp.t.vertex', { eq: { toString: 'x' } }]; });
  bad('Gleichung mit unbekannter Form', r => { r.tasks[1].q = ['lp.t.vertex', { eq: ['eq', 'evil', {}] }]; });
  bad('Antwort NaN', r => { const t0 = r.tasks.find(x => x.type === 'input'); if (t0) t0.answers = [NaN]; else r.tasks[0].type = 'x'; });
  bad('Auswahl ohne Optionen', r => { const t0 = r.tasks.find(x => x.type === 'choice'); if (t0) t0.options = [t0.options[0]]; else r.tasks[0].type = 'x'; });
  bad('richtige Antwort ausserhalb', r => { const t0 = r.tasks.find(x => x.type === 'choice'); if (t0) t0.correct = 9; else r.tasks[0].type = 'x'; });
  bad('Nachbau mit fremdem Parameter', r => { const t0 = r.tasks.find(x => x.type === 'build'); if (t0) t0.free = ['zz']; else r.tasks[0].type = 'x'; });
  bad('Aufgabenindex ausserhalb', r => { r.ti = 50; });
  bad('Markierung erfunden', r => { r.marks = ['voll']; });
  bad('Reihenfolge keine Permutation', r => { if (r.tasks[2].type === 'choice') r.order = [0, 0, 0, 0]; else r.ti = 99; });
  {
    // Bereinigt statt verworfen: Punkte, Merker, Rueckverweise, Eingaben, Spur
    const raw = clone(base('quadratic', 3, 'practice'));
    Object.assign(raw, { score: 999, memo: { __proto__x: 1, ok: 2, bad: 'x', ['a'.repeat(30)]: 3 },
      remedies: [0, 1, 7, -1, 'x'], trail: Array(40).fill(raw.values), tried: [0, 99],
      inputs: raw.inputs ? ['x'.repeat(500)] : null });
    raw.memo = JSON.parse('{"__proto__": 5, "ok": 2, "bad": "x"}');
    const st = core.sanitizeLesson(raw, now);
    expect(!!st && st.score === 1.5, 'Fortsetzen: Punktestand wird neu berechnet, nicht uebernommen');
    expect(!!st && Object.keys(st.memo).join() === 'ok' && Object.getPrototypeOf(st.memo) === window.Object.prototype,
           'Fortsetzen: Merker nur mit Zahlen, ohne __proto__');
    expect(!!st && st.remedies.join() === '0,1', 'Fortsetzen: Rueckverweise nur auf fruehere Schritte');
    expect(!!st && st.trail.length <= 8, 'Fortsetzen: Spur begrenzt');
    expect(!!st && (!st.inputs || st.inputs.every(v => v.length <= 40)), 'Fortsetzen: ueberlange Eingaben werden geleert');
  }
}

/* ==========================================================================
   6 · BEWERTUNG
   ========================================================================== */
expect(core.needFor(5) === 4 && core.needFor(10) === 8 && core.needFor(4) === 4, 'Mindestpunktzahl: 80 %');
expect(core.markPoints(true) === 1 && core.markPoints('half') === 0.5 && core.markPoints(false) === 0, 'Punkte je Versuch');
{
  const task = { answers: [2, -3], unordered: true };
  expect(core.gradeInput(task, [-3, 2]), 'ungeordnet: Reihenfolge egal');
  expect(core.gradeInput(task, [2.04, -3.02]), 'kleine Ablesetoleranz');
  expect(!core.gradeInput(task, [2, 2]), 'ungeordnet: dieselbe Zahl zaehlt nicht doppelt');
  expect(!core.gradeInput(task, [2, NaN]), 'NaN ist keine Antwort');
  expect(!core.gradeInput({ answers: [2, -3] }, [-3, 2]), 'geordnet: Reihenfolge zaehlt');
  expect(core.gradeInput({ answers: [0.5] }, [MFE.math.parseLoose('1/2')]), 'Bruch als Eingabe');
}
expect(core.remedyStep(path_, 'shiftX', 5) === 2, 'Rueckverweis: shiftX fuehrt zu Schritt 3');
expect(core.remedyStep(path_, 'shiftX', 2) === -1, 'kein Rueckverweis auf den eigenen Schritt');
expect(core.remedyStep(path_, 'gibtsnicht', 5) === -1, 'unbekannter Begriff: kein Rueckverweis');

// Variablen
I18N.lang = 'de';
expect(core.fmtVar(-2.5) === '−2,5', 'Zahl mit Komma und typografischem Minus');
expect(core.fmtVar(['pt', 1, -2]) === '(1 | −2)', 'Punkt');
expect(core.fmtVar(['eq', 'quad_vertex', { a: 1, d: -2, e: 3 }]) === 'f(x) = (x + 2)² + 3', 'Gleichung');
I18N.lang = 'en';
expect(core.fmtVar(-2.5) === '−2.5', 'englisch mit Punkt');
I18N.lang = 'de';

/* ==========================================================================
   5c · ERGEBNISCODE FUER DIE LEHRKRAFT
   ========================================================================== */
{
  const ALPH = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let codes = 0;
  for (const pa of ALL) {
    const n = pa.steps.length;
    // Alle Kombinationen geschafft / uebersprungen / offen (3^n) mit wechselnden Punkten und Tagen
    for (let combo = 1; combo < 3 ** n; combo++) {
      const done = [], skipped = [];
      for (let i = 0, c = combo; i < n; i++, c = Math.floor(c / 3)) {
        if (c % 3 === 1) done.push(i); else if (c % 3 === 2) skipped.push(i);
      }
      const r = { pid: pa.id, done, skipped, points: (combo % 128) / 2, day: (combo * 37) % 4096, total: n };
      const code = core.encodeResult(r);
      codes++;
      expect(/^[LQET]-[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]$/.test(code), `Codeformat ${code}`);
      const back = core.decodeResult(code);
      expect(back && JSON.stringify(back) === JSON.stringify(r), `Roundtrip ${pa.id} ${combo}: ${code}`);
      // Kleinschreibung, Leerzeichen, ohne Bindestriche: dasselbe Ergebnis
      expect(JSON.stringify(core.decodeResult(' ' + code.toLowerCase().replace(/-/g, ' ') + ' ')) === JSON.stringify(r),
             `Code tolerant gelesen ${code}`);
      if (combo % 97 === 1) {
        // Jeder einzelne Tippfehler muss auffallen
        const raw = code.replace(/-/g, '');
        for (let pos = 0; pos < raw.length; pos++) for (const ch of ALPH) {
          if (ch === raw[pos]) continue;
          const bad = raw.slice(0, pos) + ch + raw.slice(pos + 1);
          const got = core.decodeResult(bad);
          expect(!got, `Tippfehler unbemerkt: ${code} -> ${bad}`);
        }
      }
    }
  }
  expect(codes > 7000, `genug Codes geprueft (${codes})`);
  // Ergebnis aus echtem Speicherstand
  const store = { quadratic: { q1: { s: 'skipped', best: 0, n: 0 }, q2: { s: 'done', best: 4.5, n: 5 } } };
  const r = core.pathResult('quadratic', store, Date.UTC(2026, 10, 25, 12));
  expect(r && r.done.join() === '1' && r.skipped.join() === '0' && r.points === 4.5 && r.total === 8,
         'pathResult liest den Stand');
  expect(r.day === 328, `Tageszahl 25.11.2026 (${r?.day})`);
  expect(core.pathResult('quadratic', {}, Date.now()) === null, 'ohne Fortschritt kein Code');
  expect(core.pathResult('gibtsnicht', store) === null, 'unbekannter Pfad: kein Code');
  expect(core.pathResult('quadratic', store, Date.UTC(2020, 0, 1)).day === 0, 'Datum vor 2026: Tag 0');
  expect(core.pathResult('quadratic', store, Date.UTC(2040, 0, 1)).day === 4095, 'ferne Zukunft: gekappt');
  // Muell und Grenzfaelle
  for (const bad of ['', null, undefined, 42, 'Q', 'Q-0000-0000-0', 'X-1234-5678-9', 'Q-1234-5678', 'Q-12345-678-9',
                     'Q-ÄÖÜ1-2345-6', '<script>', 'Q-ZZZZ-ZZZZ-Z']) {
    expect(core.decodeResult(bad) === null, `ungueltig abgelehnt: ${String(bad)}`);
  }
  // Fremder Buchstabe bei passender Pruefziffer: L-Code als Q ausgegeben
  const lin = core.encodeResult({ pid: 'linear', done: [0], skipped: [], points: 5, day: 3, total: 6 });
  expect(core.decodeResult('Q' + lin.slice(1)) === null, 'Klassenbuchstabe gehoert zur Pruefziffer');
  // Schritt jenseits der Pfadlaenge (Exponential hat 4 Schritte)
  const fake = core.encodeResult({ pid: 'exponential', done: [6], skipped: [], points: 1, day: 3, total: 4 });
  expect(core.decodeResult(fake) === null, 'Schritt, den es nicht gibt, wird abgelehnt');
  const both = core.encodeResult({ pid: 'trig', done: [1], skipped: [1], points: 1, day: 3, total: 6 });
  expect(core.decodeResult(both) === null, 'geschafft und uebersprungen zugleich wird abgelehnt');
  I18N.lang = 'de';
  const sum = core.resultSummary(r);
  expect(sum.includes('2 von 8') && sum.includes('1 per Test') && sum.includes('4,5 Punkte') && sum.includes('25.11.2026'),
         `Zusammenfassung DE: ${sum}`);
  I18N.lang = 'en';
  const sumEn = core.resultSummary(r);
  expect(sumEn.includes('2 of 8') && sumEn.includes('4.5 points') && sumEn.includes('25/11/2026'), `Zusammenfassung EN: ${sumEn}`);
  I18N.lang = 'de';
}

/* ==========================================================================
   ERGEBNIS
   ========================================================================== */
const total = Object.values(tasksSeen).reduce((a, b) => a + b, 0);
console.log(`  ${ALL.length} Pfade, ${ALL.reduce((a, pa) => a + pa.steps.length, 0)} Schritte, `
          + `${ALL.reduce((a, pa) => a + pa.steps.reduce((x, s) => x + s.missions.length, 0), 0)} Auftraege, `
          + `${total} erzeugte Aufgaben aus ${Object.keys(tasksSeen).length} Aufgabenarten geprueft`);
if (errors.length || problems.length) {
  console.error(`${problems.length + errors.length} Befund(e):`);
  for (const p of [...errors, ...problems].slice(0, 60)) console.error('  · ' + p);
  process.exit(1);
}
console.log(`Lernpfade geprueft: ${checks} Pruefungen, keine Fehler.`);
