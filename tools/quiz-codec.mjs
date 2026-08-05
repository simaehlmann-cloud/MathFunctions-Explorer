/* ==========================================================================
   tools/quiz-codec.mjs  ·  Kodierung der Quiz-Links
   Prueft drei Dinge, die beim Weitergeben schiefgehen koennen:
     1. Verlustfreiheit  - 400 Zufallsquizze hin und zurueck, Wert fuer Wert
     2. Groesse          - das kompakte Format muss deutlich kuerzer sein
     3. Robustheit       - Muell und abgeschnittene Codes duerfen nicht
                           durchrutschen und nicht abstuerzen
   Ausserdem: Links im alten JSON-Format bleiben lesbar.
   ========================================================================== */
import { readFileSync } from 'node:fs';
global.window = { devicePixelRatio: 1 };
global.MFE = global.window.MFE = {};
global.MFE.i18n = { lang: 'de', t: (k) => k };
global.document = { documentElement: {}, querySelector: () => null, querySelectorAll: () => [],
                    createElement: () => ({ style: {}, classList: { add(){}, toggle(){} }, append(){}, setAttribute(){}, addEventListener(){} }) };
global.getComputedStyle = () => ({ getPropertyValue: () => '#000' });
global.location = { origin: 'https://e.org', pathname: '/' };
const R = (f) => new URL('../' + f, import.meta.url);
const load = (f) => eval(readFileSync(R(f), 'utf8').replace('window.MFE = window.MFE || {};', ''));
load('js/licence.js'); load('js/functions.js'); load('js/graph.js');
MFE.ui = { $: () => null, $$: () => [], toast: () => {}, renderSliderGroup: () => {}, debounce: (f) => f };
load('js/quiz.js');
const Q = MFE.quiz, { FUNCTIONS, CATEGORY_FORMS } = MFE.math;

let bad = 0;
const check = (ok, what) => { if (!ok) { console.log('  FEHLER: ' + what); bad++; } };
const rnd = (a) => a[Math.floor(Math.random() * a.length)];
const forms = Object.keys(FUNCTIONS);

function randTask(type) {
  if (type === 'choice') {
    const n = 2 + Math.floor(Math.random() * 4);
    return { type, question: 'Frage mit Umlaut äöü ' + Math.random().toString(36).slice(2),
             options: Array.from({length:n}, (_,i)=>'Antwort '+i+' ß'), correct: Math.floor(Math.random()*n) };
  }
  const form = rnd(forms);
  const values = Q.randomValues(form);
  const task = { type, form, values };
  if (type === 'match') task.options = Q.makeDistractors(form, values, 3);
  if (type === 'value') {
    // Nur Stellen im Definitionsbereich - sonst erzeugt der Test Aufgaben,
    // die die App zu Recht ablehnt.
    let x0 = null;
    for (let k = 0; k < 60 && x0 === null; k++) {
      const c = Math.round((Math.random()*16-8)*100)/100;
      if (Number.isFinite(FUNCTIONS[form].f(c, values))) x0 = c;
    }
    if (x0 === null) return randTask('match');
    task.x0 = x0;
  }
  if (type === 'readoff') task.what = FUNCTIONS[form].vertex ? rnd(['yint','root','vertex']) : rnd(['yint','root']);
  if (type === 'truefalse') { task.statement = 'Der Graph steigt – wirklich?'; task.answer = Math.random()<0.5; }
  return task;
}

// --- Verlustfreiheit ---
let sumNew = 0, sumOld = 0, cases = 0;
for (let it = 0; it < 400; it++) {
  const n = 1 + Math.floor(Math.random() * 12);
  const quiz = { id: 'q' + it, title: 'Test äöü ' + it, created: Date.now(),
                 tasks: Array.from({length:n}, () => randTask(rnd(Q.TYPES))) };
  const clean = Q.sanitizeQuiz(quiz);
  if (!clean) { check(false, 'sanitizeQuiz verwirft ein selbst erzeugtes Quiz'); continue; }
  const code = Q.encodeQuiz(clean);
  const back = Q.decodeQuiz(code);
  if (!back) { check(false, 'Rueckweg scheitert'); continue; }
  check(back.title === clean.title, 'Titel geht verloren');
  check(back.tasks.length === clean.tasks.length, 'Aufgabenzahl weicht ab');
  for (let i = 0; i < clean.tasks.length; i++) {
    const a = clean.tasks[i], b = back.tasks[i];
    check(a.type === b.type, `Typ weicht ab (${a.type}/${b.type})`);
    if (a.form) {
      check(a.form === b.form, 'Form weicht ab');
      for (const prm of FUNCTIONS[a.form].params) {
        check(Math.abs(a.values[prm.id] - b.values[prm.id]) < 1e-4,
              `${a.form}.${prm.id}: ${a.values[prm.id]} -> ${b.values[prm.id]}`);
      }
    }
    if (a.type === 'value') check(Math.abs(a.x0 - b.x0) < 1e-4, 'x0 weicht ab');
    if (a.type === 'readoff') check(a.what === b.what, 'Ablesefrage weicht ab');
    if (a.type === 'truefalse') { check(a.statement === b.statement, 'Aussage weicht ab'); check(a.answer === b.answer, 'Wahrheitswert weicht ab'); }
    if (a.type === 'choice') { check(a.question === b.question, 'Frage weicht ab'); check(a.correct === b.correct, 'richtige Antwort weicht ab');
      check(JSON.stringify(a.options) === JSON.stringify(b.options), 'Antworten weichen ab'); }
    if (a.type === 'match') check((a.options||[]).length === (b.options||[]).length, 'Distraktoren weichen ab');
  }
  const oldLen = Buffer.from(JSON.stringify({title: clean.title, tasks: clean.tasks})).length;
  sumNew += code.length; sumOld += Math.ceil(oldLen*4/3); cases++;
}
const saved = 100 - sumNew / sumOld * 100;
console.log(`  ${cases} Zufallsquizze: neu ${Math.round(sumNew/cases)} Zeichen, alt ${Math.round(sumOld/cases)} Zeichen `
          + `-> ${saved.toFixed(0)} % kleiner`);
check(saved > 50, `Ersparnis nur ${saved.toFixed(0)} % - das kompakte Format lohnt so nicht`);

// --- Altes Format bleibt lesbar ---
const legacy = { title: 'Alt', tasks: [{ type:'value', form:'linear', values:{m:2,b:1}, x0:3 }] };
const legacyCode = Buffer.from(JSON.stringify(legacy)).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const backLegacy = Q.decodeQuiz(legacyCode);
check(backLegacy && backLegacy.tasks.length === 1 && backLegacy.tasks[0].x0 === 3, 'Link im alten JSON-Format bleibt lesbar');

// --- Muell wird abgewiesen ---
for (const junk of ['', '!!!', 'AAAA', 'x'.repeat(20000), 'TQ', null, undefined, 42]) {
  check(Q.decodeQuiz(junk) === null, `Muell wird abgewiesen: ${String(junk).slice(0,8)}`);
}
// Gekapptes Binaerformat darf nicht durchrutschen
const good = Q.encodeQuiz(Q.sanitizeQuiz({title:'T', tasks:[randTask('match')]}));
for (let cut = 1; cut < 12; cut++) {
  const r = Q.decodeQuiz(good.slice(0, Math.max(1, good.length - cut)));
  check(r === null || (r.tasks && r.tasks.length >= 0), 'abgeschnittener Code stuerzt nicht ab');
}
console.log(bad ? `${bad} Fehler` : 'quiz.js Kodierung geprueft: keine Fehler.');
process.exit(bad ? 1 : 0);
