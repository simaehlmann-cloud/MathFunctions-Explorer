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
                 'js/nav.js', 'js/ui.js', 'js/qr.js', 'js/quiz.js', 'js/paths.js', 'js/paths-quadratic.js']) {
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

const src = read('js/paths.js') + '\n' + read('js/paths-quadratic.js');
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

// Jeder Begriff, auf den ein Rueckverweis zeigen kann, wird von einem Schritt eingefuehrt.
for (const map of Object.values(path_.concepts)) {
  for (const c of Object.values(map)) {
    expect(path_.steps.some(s => s.concepts.includes(c)), `Begriff "${c}" wird von keinem Schritt eingefuehrt`);
  }
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

for (const [si, step] of path_.steps.entries()) {
  const tag = `Schritt ${si + 1} (${step.id})`;
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
    let hit = null, count = 0;
    for (const s of states(step)) {
      if (m.check(s, memo)) { count++; hit ??= s; }
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

for (const [si, step] of path_.steps.entries()) {
  step.tasks.forEach((gen, gi) => {
    const tag = `Schritt ${si + 1}, Erzeuger ${gi + 1}`;
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
      }

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
          const k = (t0 - p.min) / p.step;
          expectOnce(Math.abs(k - Math.round(k)) < 1e-6, `${tag}: Ziel ${p.id}=${t0} liegt nicht auf dem Reglerraster`);
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
    expectOnce(set.length === (step.count ?? 5), `Schritt ${si + 1}: Uebungsrunde hat ${set.length} statt 5 Aufgaben`);
    const kinds = new Set(set.map(t => (Array.isArray(t.q) ? t.q[0] : t.q) + t.type));
    expectOnce(kinds.size >= Math.min(4, step.tasks.length - 1), `Schritt ${si + 1}: zu wenig Abwechslung in einer Runde`);
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
   ERGEBNIS
   ========================================================================== */
const total = Object.values(tasksSeen).reduce((a, b) => a + b, 0);
console.log(`  ${path_.steps.length} Schritte, ${path_.steps.reduce((a, s) => a + s.missions.length, 0)} Auftraege, `
          + `${total} erzeugte Aufgaben aus ${Object.keys(tasksSeen).length} Aufgabenarten geprueft`);
if (errors.length || problems.length) {
  console.error(`${problems.length + errors.length} Befund(e):`);
  for (const p of [...errors, ...problems].slice(0, 60)) console.error('  · ' + p);
  process.exit(1);
}
console.log(`Lernpfade geprueft: ${checks} Pruefungen, keine Fehler.`);
