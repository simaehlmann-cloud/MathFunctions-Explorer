/* ==========================================================================
   tools/audit.mjs  ·  Belastungsprobe fuer die reinen Bausteine
   --------------------------------------------------------------------------
   Aufruf:  npm run audit
   Prueft nicht die Oberflaeche (das macht smoke.mjs), sondern die Logik
   dahinter - und zwar ueber ALLE Funktionsklassen und mit vielen zufaelligen
   Wertesaetzen. Genau dort sitzen die Fehler, die ein einzelner Durchlauf
   durch die Oberflaeche nie trifft:

     1. Ablenker    - immer drei, immer sichtbar verschieden, immer im Bereich
     2. Diagnose    - nie ein roher Schluessel, nie ein Platzhalter im Text
     3. Fallen      - Frage, Antworten und Merksatz vollstaendig uebersetzt
     4. Grenzwerte  - Toleranz und Ziehpunkte bleiben endlich

   Der Zufall ist Absicht: laeuft das Skript in der CI taeglich, faellt eine
   Luecke auf, die bei festen Beispielwerten unsichtbar bliebe.
   ========================================================================== */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM, VirtualConsole } from 'jsdom';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(path.join(ROOT, f), 'utf8');

const html = read('index.html').replace(/<meta http-equiv="Content-Security-Policy"[\s\S]*?>/,'');
const dom = new JSDOM(html,{url:'https://example.org/',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:new VirtualConsole()});
dom.window.matchMedia = () => ({matches:false,addEventListener(){},addListener(){}});
for (const f of ['js/licence.js','js/billing.js','js/i18n.js','js/functions.js','js/graph.js','js/diagnose.js','js/nav.js','js/ui.js','js/qr.js','js/quiz.js'])
  dom.window.eval(read(f));
const W = dom.window, M = W.MFE;

let bad = 0;
const ok = (c,m) => { if(!c){ console.log('  FEHLER:', m); bad++; } };

// 1) Ablenker: fuer JEDE Form und viele Zufallswerte drei brauchbare Antworten
for (const form of Object.keys(M.math.FUNCTIONS)) {
  for (let i=0;i<60;i++){
    const v = M.quiz.randomValues(form);
    const d = M.quiz.makeDistractors(form, v, 3);
    ok(d.length===3, `${form}: nur ${d.length} Ablenker`);
    const texts = new Set([M.quiz.eqText(form,v), ...d.map(x=>M.quiz.eqText(form,x))]);
    ok(texts.size===4, `${form}: Ablenker sehen gleich aus -> ${[...texts].join(' | ')}`);
    for (const x of d) for (const p of M.math.FUNCTIONS[form].params) {
      ok(Number.isFinite(x[p.id]), `${form}: Ablenker hat ${p.id}=${x[p.id]}`);
      const hi = p.hardMax ?? Infinity, lo = p.hardMin ?? -Infinity;
      ok(x[p.id] <= hi && x[p.id] >= lo, `${form}: Ablenker ${p.id}=${x[p.id]} ausserhalb [${lo};${hi}]`);
    }
  }
}
console.log('1) Ablenker fuer', Object.keys(M.math.FUNCTIONS).length, 'Formen geprueft');

// 2) Diagnose: nie ein roher Schluessel, nie leer bei echtem Unterschied
for (const form of Object.keys(M.math.FUNCTIONS)) {
  for (let i=0;i<40;i++){
    const a = M.quiz.randomValues(form), b = M.quiz.randomValues(form);
    const txt = M.quiz.diagnose(form,b,a);
    ok(typeof txt==='string', `${form}: Diagnose liefert keinen Text`);
    ok(!/^(find|why|diag)\./.test(txt), `${form}: roher Schluessel "${txt}"`);
    ok(!txt.includes('{'), `${form}: unersetzter Platzhalter in "${txt}"`);
  }
  ok(M.quiz.diagnose(form, M.quiz.randomValues(form), null)==='', `${form}: null wird nicht abgefangen`);
}
console.log('2) Diagnose geprueft');

// 3) Fallen: Aufgabe, Frage, Antworten, Merksatz - alles uebersetzt
let traps=0;
for (const form of Object.keys(M.math.FUNCTIONS)) {
  for (let i=0;i<80;i++){
    const t = M.diagnose.makeTrap(form, M.quiz.randomValues(form));
    if (!t) continue;
    traps++;
    ok(M.i18n.t(t.promptKey,t.promptVars)!==t.promptKey, `${t.trap}: Frage ohne Text`);
    ok(!M.i18n.t(t.promptKey,t.promptVars).includes('{'), `${t.trap}: Platzhalter in der Frage`);
    ok(M.i18n.t('note.'+t.trap)!=='note.'+t.trap, `${t.trap}: Merksatz fehlt`);
    ok(t.answers.filter(a=>a.correct).length===1, `${t.trap}: nicht genau eine richtige Antwort`);
    for (const a of t.answers) {
      const label = a.raw ? M.i18n.t(a.label) : a.label;
      ok(label && !label.startsWith('mis.'), `${t.trap}: Antwort ohne Text (${a.label})`);
      if (!a.correct) ok(a.mis && M.i18n.t('why.'+a.mis)!=='why.'+a.mis, `${t.trap}: Erklaerung fehlt (${a.mis})`);
    }
  }
}
console.log('3)', traps, 'Fallen geprueft');

// 4) Toleranz und Ziehpunkte
const tol = M.math.tolerance;
for (const v of [0,0.5,-3,120,1e6]) for (const s of [0.1,0.5,1,undefined])
  ok(Number.isFinite(tol(v,s)) && tol(v,s)>0, `Toleranz(${v},${s}) = ${tol(v,s)}`);
ok(Number.isFinite(tol(NaN,NaN)) && tol(NaN,NaN)>0, 'Toleranz(NaN) muss brauchbar bleiben');
for (const form of Object.keys(M.math.FUNCTIONS)) {
  const d = M.math.FUNCTIONS[form];
  if (!d.handles) continue;
  for (const u of [0,0.001,0.05,0.5,NaN,undefined]) {
    const hs = d.handles(M.quiz.randomValues(form), u);
    for (const h of hs) ok(Number.isFinite(h.x)&&Number.isFinite(h.y), `${form}: Ziehpunkt NaN bei u=${u}`);
  }
}
console.log('4) Toleranz und Ziehpunkte geprueft');

if (bad) { console.error(`Belastungsprobe: ${bad} Befund(e)`); process.exit(1); }
console.log('Belastungsprobe bestanden.');
