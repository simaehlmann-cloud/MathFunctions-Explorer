/* ==========================================================================
   tools/diagnose-test.mjs  ·  Fehlvorstellungen und Fehleranalyse
   Prueft ohne Browser:
     1. Jede Falle im Katalog laesst sich bauen, hat genau eine richtige
        Antwort, keine doppelten Beschriftungen und nur bekannte Kennungen.
     2. Die Fehleranalyse erkennt Vorzeichenfehler, Vertauschungen,
        Verdopplung, Halbierung und Kehrwert - und meldet nichts davon,
        wenn alles stimmt.
     3. sampleTable liefert nur definierte Werte, auch bei Wurzel,
        Logarithmus und Polstellen.
   ========================================================================== */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
global.window = { devicePixelRatio: 1 };
global.MFE = global.window.MFE = {};
global.MFE.i18n = { lang: 'de', t: (k) => k };
const load = (f) => eval(readFileSync(path.join(ROOT, f), 'utf8').replace('window.MFE = window.MFE || {};', ''));
load('js/functions.js');
load('js/diagnose.js');

const D = MFE.diagnose;
const { FUNCTIONS } = MFE.math;
let bad = 0;
const check = (ok, what) => { if (!ok) { console.log('  FEHLER: ' + what); bad++; } };
const vals = (form) => Object.fromEntries(FUNCTIONS[form].params.map(p => [p.id, p.value]));

/* ---- 1 · Katalog -------------------------------------------------------- */
const ids = new Set();
for (const m of D.MISCONCEPTIONS) {
  check(!ids.has(m.id), `Kennung doppelt vergeben: ${m.id}`);
  ids.add(m.id);
  check(Array.isArray(m.forms) && m.forms.length > 0, `${m.id}: keine Darstellungsform`);
  for (const f of m.forms) check(!!FUNCTIONS[f], `${m.id}: unbekannte Form "${f}"`);
  check(typeof m.needs === 'function' && typeof m.make === 'function', `${m.id}: unvollstaendig`);
}
console.log(`  ${D.MISCONCEPTIONS.length} Fehlvorstellungen im Katalog, ${ids.size} verschiedene Kennungen`);

/* Jede Form, fuer die es Fallen gibt, muss sich auch bauen lassen. */
const covered = new Set(D.MISCONCEPTIONS.flatMap(m => m.forms));
const misKeys = new Set();
for (const form of covered) {
  let built = 0;
  for (let i = 0; i < 400; i++) {
    const v = {};
    for (const p of FUNCTIONS[form].params) {
      v[p.id] = p.pool ? p.pool[Math.floor(Math.random() * p.pool.length)]
                       : Math.round((Math.random() * (p.max - p.min) + p.min) * 2) / 2;
    }
    const trap = D.makeTrap(form, v);
    if (!trap) continue;
    built++;
    const correct = trap.answers.filter(a => a.correct);
    check(correct.length === 1, `${form}/${trap.trap}: ${correct.length} richtige Antworten`);
    check(trap.answers.length >= 2, `${form}/${trap.trap}: zu wenige Antworten`);
    const labels = trap.answers.map(a => a.label);
    check(new Set(labels).size === labels.length, `${form}/${trap.trap}: doppelte Antwort`);
    check(typeof trap.promptKey === 'string' && trap.promptKey.startsWith('mis.'),
          `${form}/${trap.trap}: Frageschluessel fehlt`);
    for (const a of trap.answers) {
      check(typeof a.label === 'string' && a.label.length > 0, `${form}: leere Antwort`);
      if (!a.correct) check(typeof a.mis === 'string' && a.mis.length > 0,
                            `${form}/${trap.trap}: falsche Antwort ohne Erklaerung`);
      if (a.mis) misKeys.add(a.mis);
      if (a.raw) misKeys.add(a.label);
    }
  }
  check(built > 0, `Fuer "${form}" laesst sich in 400 Versuchen keine Falle bauen`);
}
console.log(`  ${covered.size} Darstellungsformen abgedeckt, ${misKeys.size} Erklaerungsschluessel verwendet`);

/* Formen ohne Falle sind erlaubt, aber makeTrap muss sauber null liefern. */
for (const form of Object.keys(FUNCTIONS)) {
  if (covered.has(form)) continue;
  check(D.makeTrap(form, vals(form)) === null, `${form}: makeTrap muesste null liefern`);
}

/* ---- 2 · Fehleranalyse -------------------------------------------------- */
const A = (form, target, attempt) => D.analyseBuild(form, target, attempt);
const kinds = (res) => res.findings.map(f => f.kind);

// Alles richtig
let res = A('linear', { m: 2, b: 1 }, { m: 2, b: 1 });
check(res.solved && res.findings.length === 0, 'exakte Loesung wird als geloest erkannt');

// Innerhalb der Toleranz gilt als richtig
res = A('linear', { m: 2, b: 1 }, { m: 2.005, b: 1 });
check(res.solved, 'kleine Abweichung innerhalb der Toleranz zaehlt als richtig');

// Vorzeichen gedreht
res = A('linear', { m: 2, b: 3 }, { m: -2, b: 3 });
check(kinds(res).includes('sign'), `Vorzeichenfehler erkannt (${kinds(res)})`);
check(res.findings[0].ids[0] === 'm', 'und dem richtigen Parameter zugeordnet');

// Verschieberichtung: d in (x - d)
res = A('quad_vertex', { a: 1, d: 2, e: 0 }, { a: 1, d: -2, e: 0 });
check(kinds(res).includes('shiftDirection'), `Verschieberichtung erkannt (${kinds(res)})`);

// Vertauscht
res = A('linear', { m: 3, b: -1 }, { m: -1, b: 3 });
check(kinds(res).includes('swapped'), `Vertauschung erkannt (${kinds(res)})`);
check(res.findings.length === 1, 'Vertauschung erzeugt genau einen Befund, nicht zwei');

// Vertauschung darf NICHT gemeldet werden, wenn beide Werte gleich sind
res = A('linear', { m: 2, b: 2 }, { m: 5, b: 5 });
check(!kinds(res).includes('swapped'), 'bei gleichen Zielwerten keine Scheinvertauschung');

// Verdoppelt und halbiert
res = A('linear', { m: 2, b: 0 }, { m: 4, b: 0 });
check(kinds(res).includes('doubled'), `Verdopplung erkannt (${kinds(res)})`);
res = A('linear', { m: 4, b: 0 }, { m: 2, b: 0 });
check(kinds(res).includes('halved'), `Halbierung erkannt (${kinds(res)})`);

// Kehrwert
res = A('linear', { m: 4, b: 0 }, { m: 0.25, b: 0 });
check(kinds(res).includes('reciprocal') || kinds(res).includes('halved'),
      `Kehrwert oder Groessenordnung erkannt (${kinds(res)})`);

// Einfach daneben
res = A('linear', { m: 2, b: 1 }, { m: 2, b: 7 });
check(kinds(res).includes('tooHigh'), `zu hoch erkannt (${kinds(res)})`);
res = A('linear', { m: 2, b: 7 }, { m: 2, b: 1 });
check(kinds(res).includes('tooLow'), `zu niedrig erkannt (${kinds(res)})`);

// Zaehlung stimmt
res = A('sinus', { a: 2, b: 1, c: 0, d: 0 }, { a: 2, b: 1, c: 0, d: 3 });
check(res.hits === 3 && res.total === 4, `Trefferzaehlung (${res.hits}/${res.total})`);

// Unbekannte Form stuerzt nicht ab
res = A('gibtsnicht', { a: 1 }, { a: 2 });
check(!res.solved && res.findings.length === 0, 'unbekannte Form liefert ein leeres Ergebnis');

// Jeder Parameter erscheint hoechstens einmal in den Befunden
for (let i = 0; i < 300; i++) {
  const form = ['linear', 'quad_vertex', 'quad_standard', 'sinus', 'exponential'][i % 5];
  const target = {}, attempt = {};
  for (const p of FUNCTIONS[form].params) {
    target[p.id] = Math.round((Math.random() * 8 - 4) * 2) / 2;
    attempt[p.id] = Math.round((Math.random() * 8 - 4) * 2) / 2;
  }
  const out = A(form, target, attempt);
  const seen = out.findings.flatMap(f => f.ids);
  check(new Set(seen).size === seen.length, `${form}: Parameter mehrfach gemeldet`);
  check(out.findings.every(f => typeof f.kind === 'string'), `${form}: Befund ohne Art`);
  if (out.solved) check(out.findings.length === 0, 'geloest, aber Befunde vorhanden');
}

/* ---- 3 · Wertetabellen -------------------------------------------------- */
for (const form of Object.keys(FUNCTIONS)) {
  let got = 0;
  for (let i = 0; i < 60; i++) {
    const v = {};
    for (const p of FUNCTIONS[form].params) {
      v[p.id] = p.pool ? p.pool[Math.floor(Math.random() * p.pool.length)] : p.value;
    }
    const rows = D.sampleTable(form, v, 5, -3, 1);
    if (!rows) continue;
    got++;
    check(rows.length === 5, `${form}: falsche Zeilenzahl`);
    for (const row of rows) {
      check(Number.isFinite(row.x) && Number.isFinite(row.y), `${form}: undefinierter Wert in der Tabelle`);
      const y = FUNCTIONS[form].f(row.x, v);
      check(Math.abs(y - row.y) < 0.01, `${form}: Tabellenwert weicht von der Funktion ab`);
    }
  }
  check(got > 0, `${form}: in 60 Versuchen keine brauchbare Tabelle`);
}

console.log(bad ? `${bad} Fehler` : 'diagnose.js geprueft: keine Fehler.');
process.exit(bad ? 1 : 0);
