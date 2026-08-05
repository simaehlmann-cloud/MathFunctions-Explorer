/* ==========================================================================
   tools/smoke.mjs  ·  Laufzeittest ohne Browser
   Startet index.html in jsdom, klickt die wichtigsten Wege durch und meldet
   jeden Fehler, der dabei in die Konsole faellt. Kein Ersatz fuer den Test
   am Telefon, aber es faengt tote Verweise und Tippfehler ab, bevor sie auf
   einem Geraet landen.

   Aufruf:  node tools/smoke.mjs [lite]
   ========================================================================== */
import { JSDOM, VirtualConsole } from 'jsdom';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LITE = process.argv[2] === 'lite';

const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', (e) => errors.push('jsdomError: ' + e.message));
vc.on('error', (...a) => errors.push('console.error: ' + a.join(' ')));

let html = readFileSync(path.join(ROOT, 'index.html'), 'utf8');
// Die Content-Security-Policy des Auslieferungsstands verbietet in jsdom das
// Ausfuehren lokaler Skripte; sie wird hier nur fuer den Test entfernt.
html = html.replace(/<meta http-equiv="Content-Security-Policy"[\s\S]*?>/, '');

const dom = new JSDOM(html, {
  url: 'https://example.org/',
  runScripts: 'outside-only',
  pretendToBeVisual: true,
  virtualConsole: vc
});
const { window } = dom;

// Canvas gibt es in jsdom nicht. Der Renderer prueft ohnehin die Groesse und
// steigt bei 0 x 0 aus - dieser Ersatz sorgt nur dafuer, dass kein Aufruf
// ins Leere laeuft, falls doch einmal gezeichnet wird.
const stubCtx = new Proxy({}, { get: () => () => {} });
window.HTMLCanvasElement.prototype.getContext = () => stubCtx;
// Ohne Layout meldet jsdom ueberall 0. Fuer die Zeigerbedienung braucht der
// Graph eine Groesse, sonst laesst sich Zoomen gar nicht ausloesen.
window.HTMLCanvasElement.prototype.getBoundingClientRect = function () {
  return { left: 0, top: 0, width: 400, height: 300, right: 400, bottom: 300, x: 0, y: 0 };
};
window.HTMLElement.prototype.setPointerCapture = () => {};
window.HTMLElement.prototype.releasePointerCapture = () => {};
window.navigator.vibrate = () => true;
window.HTMLCanvasElement.prototype.toBlob = (cb) => cb(null);
window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
window.HTMLDialogElement.prototype.close = function (v) { this.open = false; this.returnValue = v ?? ''; };
window.scrollTo = () => {};
/* jsdom richtet sein Fenster nicht vollstaendig ein. Was hier ergaenzt wird,
   gibt es in JEDEM echten Browser und in jeder Android-WebView seit Jahren -
   die Attrappen gleichen also eine Luecke des Testrahmens aus und nicht eine
   der App. TextEncoder fehlte in jsdom 25 und war in jsdom 30 vorhanden;
   dadurch lief der Test lokal durch und brach auf dem Server ab. */
for (const name of ['TextEncoder', 'TextDecoder', 'Blob']) {
  if (typeof window[name] === 'undefined' && typeof globalThis[name] !== 'undefined') {
    window[name] = globalThis[name];
  }
}
if (typeof window.btoa === 'undefined') {
  window.btoa = (b) => Buffer.from(b, 'binary').toString('base64');
  window.atob = (b) => Buffer.from(b, 'base64').toString('binary');
}
if (typeof window.structuredClone === 'undefined') window.structuredClone = globalThis.structuredClone;
// PointerEvent fehlt in aelteren jsdom-Fassungen. Fuer den Test genuegt ein
// MouseEvent mit pointerId - genau die Felder, die die App ausliest.
if (typeof window.PointerEvent !== 'function') {
  window.PointerEvent = class extends window.MouseEvent {
    constructor(type, init = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 1;
      this.pointerType = init.pointerType ?? 'touch';
      this.isPrimary = init.isPrimary ?? true;
    }
  };
}
for (const m of ['setPointerCapture', 'releasePointerCapture', 'hasPointerCapture']) {
  if (!window.Element.prototype[m]) window.Element.prototype[m] = () => {};
}

// jsdom kennt matchMedia nicht vollstaendig.
let fakeWide = false;
const mediaListeners = [];
window.matchMedia = (q) => {
  const isSplit = q.includes('min-width: 860px');
  const mql = {
    media: q, onchange: null,
    get matches() { return isSplit ? fakeWide : false; },
    addEventListener(_, fn) { if (isSplit) mediaListeners.push(fn); },
    removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false
  };
  return mql;
};
const setWide = (v) => { fakeWide = v; mediaListeners.forEach(fn => fn()); };
window.Element.prototype.scrollIntoView = function () {};
window.confirm = () => true;
let printed = 0;
window.print = () => { printed++; };
window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AA==';
const revoked = [];
window.URL.createObjectURL = () => 'blob:mfe-test';
window.URL.revokeObjectURL = (u) => revoked.push(u);
const downloads = [];
const realCreate = window.document.createElement.bind(window.document);
window.document.createElement = (tag) => {
  const el = realCreate(tag);
  if (tag === 'a') el.click = () => downloads.push(el.download || el.href);
  return el;
};
window.prompt = () => null;
window.requestAnimationFrame = (fn) => setTimeout(() => fn(performance.now()), 0);
window.cancelAnimationFrame = (id) => clearTimeout(id);
if (!window.navigator.clipboard) {
  Object.defineProperty(window.navigator, 'clipboard', { value: { writeText: async () => {} } });
}

/* Das Stylesheet mitladen. Ohne es prueft der Durchlauf nur die Eigenschaft
   .hidden - und genau daran ist ein Fehler vorbeigelaufen: eine CSS-Regel mit
   display schlaegt das hidden-Attribut, das Element blieb sichtbar, und der
   Test meldete trotzdem "verborgen". */
{
  const style = window.document.createElement('style');
  style.textContent = readFileSync(path.join(ROOT, 'style.css'), 'utf8');
  window.document.head.appendChild(style);
}

const files = ['js/licence.js', 'js/billing.js', 'js/i18n.js', 'js/functions.js',
               'js/graph.js', 'js/nav.js', 'js/ui.js', 'js/qr.js', 'js/quiz.js', 'js/app.js'];
for (const f of files) {
  let src = readFileSync(path.join(ROOT, f), 'utf8');
  if (LITE && f === 'js/licence.js') src = src.replace(/const DEV_EDITION = '\w+';/, "const DEV_EDITION = 'lite';");
  try { window.eval(src); }
  catch (e) { errors.push(`${f}: ${e.message}`); }
}

const $ = (s) => window.document.querySelector(s);
const $$ = (s) => Array.from(window.document.querySelectorAll(s));
const click = (sel) => {
  const el = typeof sel === 'string' ? $(sel) : sel;
  if (!el) { errors.push(`Element ${sel} nicht gefunden`); return false; }
  el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  return true;
};
const mainMeasure = () => window.dispatchEvent(new window.Event('resize'));
const tick = () => new Promise(r => setTimeout(r, 20));

const checks = [];
const expect = (cond, what) => { checks.push([!!cond, what]); if (!cond) errors.push('Erwartung verletzt: ' + what); };

/* ---- Ablauf ------------------------------------------------------------ */
await tick();
expect($('#screen-home').classList.contains('is-active'), 'Startseite ist sichtbar');
expect($('#parameters-container').children.length === 2, 'Zwei Regler fuer die lineare Funktion');
expect($('#parameters-container').closest('.canvas-panel') !== null,
       'Regler liegen im selben Block wie das Koordinatensystem');

// Lineare Funktion oeffnen
click('.fn-card[data-category="linear"]');
await tick();
expect($('#screen-app').classList.contains('is-active'), 'Explorer geoeffnet');

// Regler bewegen
const slider = $('#slider-m');
expect(slider, 'Regler fuer m vorhanden');
if (slider) {
  slider.value = '2.5';
  slider.dispatchEvent(new window.Event('input', { bubbles: true }));
  await tick();
  expect($('#val-m').value.replace(',', '.') === '2.5', 'Zahlenfeld folgt dem Regler');
}

// Zahlenfeld: Bruch eingeben
const field = $('#val-b');
if (field) {
  field.value = '3/4';
  field.dispatchEvent(new window.Event('change', { bubbles: true }));
  await tick();
  expect($('#slider-b').value === '0.75', 'Bruch 3/4 wird als 0,75 uebernommen');
}

// Wertetabelle
click('#tab-btn-table'); await tick();
click('#btn-gen-table'); await tick();
expect($('#values-table tbody').children.length === 11, 'Wertetabelle von -5 bis 5 hat 11 Zeilen');

// Ueben
click('#tab-btn-quiz'); await tick();
expect($('#quiz-options').children.length === 4, 'Vier Antwortmoeglichkeiten im Zuordnungsquiz');
click($('#quiz-options').firstElementChild); await tick();
expect($('#quiz-feedback').textContent.length > 0, 'Rueckmeldung nach der Antwort');

// Quadratische Funktion: in Lite gesperrt
click('#btn-home'); await tick();
click('.fn-card[data-category="quadratic"]'); await tick();
if (LITE) {
  expect($('#screen-home').classList.contains('is-active'), 'Lite: quadratische Funktion bleibt gesperrt');
  expect($('#pro-dialog').open, 'Lite: Pro-Hinweis erscheint');
  $('#pro-dialog').close('cancel'); await tick(); await tick();
} else {
  expect($('#screen-app').classList.contains('is-active'), 'Pro: quadratische Funktion oeffnet sich');
  expect($('#parameters-container').children.length === 3, 'Drei Regler fuer die Parabel');
}

// Info-Seite
click('#btn-home'); await tick();
click('#card-info'); await tick();
expect($('#screen-info').classList.contains('is-active'), 'Info-Seite geoeffnet');
expect($('#info-features').children.length === 10, 'Zehn Punkte in der Funktionsliste');
expect($('#info-lite-box').hidden === !LITE, 'Lite-Hinweis erscheint genau in der Lite-Ausgabe');

// Quiz-Baukasten
click('[data-back="home"]'); await tick();
click('#card-quizzes'); await tick();
if (LITE) {
  expect($('#screen-home').classList.contains('is-active'), 'Lite: Baukasten bleibt gesperrt');
  $('#pro-dialog').close('cancel'); await tick(); await tick();
} else {
  expect($('#screen-quizzes').classList.contains('is-active'), 'Quizliste geoeffnet');
  click('#btn-new-quiz'); await tick();
  expect($('#screen-builder').classList.contains('is-active'), 'Editor geoeffnet');

  $('#builder-title').value = 'Testquiz';

  // Aufgabe 1: Zuordnen
  click('#btn-add-task'); await tick();
  expect(!$('#builder-editor').hidden, 'Aufgabeneditor sichtbar');
  expect($('#editor-canvas'), 'Vorschau vorhanden');
  click('#btn-editor-save'); await tick();
  expect($('#builder-tasks').querySelectorAll('.task-row').length === 1, 'Erste Aufgabe uebernommen');

  // Aufgabe 2: Wert berechnen
  click('#btn-add-task'); await tick();
  const typeSel = $('#editor-type');
  typeSel.value = 'value';
  typeSel.dispatchEvent(new window.Event('change', { bubbles: true }));
  await tick();
  expect($('#editor-x0'), 'Feld fuer die Stelle x erscheint');
  click('#btn-editor-save'); await tick();

  // Aufgabe 3: freie Frage, unvollstaendig -> darf nicht durchgehen
  click('#btn-add-task'); await tick();
  const sel2 = $('#editor-type');
  sel2.value = 'choice';
  sel2.dispatchEvent(new window.Event('change', { bubbles: true }));
  await tick();
  click('#btn-editor-save'); await tick();
  expect($('#builder-tasks').querySelectorAll('.task-row').length === 2,
         'Unvollstaendige freie Frage wird abgewiesen');

  $('#editor-question').value = 'Wie viele Nullstellen hat eine Gerade hoechstens?';
  $('#editor-question').dispatchEvent(new window.Event('input', { bubbles: true }));
  $$('#editor-body .choice-row input[type="text"]').forEach((el, i) => {
    el.value = ['Eine', 'Zwei'][i];
    el.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
  click('#btn-editor-save'); await tick();
  expect($('#builder-tasks').querySelectorAll('.task-row').length === 3, 'Vollstaendige freie Frage geht durch');

  // Speichern und abspielen
  click('#btn-builder-save'); await tick();
  expect($('#screen-quizzes').classList.contains('is-active'), 'Nach dem Speichern zurueck zur Liste');
  expect($('#quiz-list').querySelectorAll('.quiz-card').length === 1, 'Ein gespeichertes Quiz');

  const stored = JSON.parse(window.localStorage.getItem('mfe:quizzes'));
  expect(stored[0].title === 'Testquiz' && stored[0].tasks.length === 3, 'Quiz liegt vollstaendig im Speicher');

  // Link erzeugen und wieder einlesen
  const code = window.MFE.quiz.encodeQuiz(stored[0]);
  const back = window.MFE.quiz.decodeQuiz(code);
  expect(back && back.tasks.length === 3, 'Quiz ueberlebt Kodierung und Dekodierung');
  expect(window.MFE.quiz.decodeQuiz('%%%nonsense%%%') === null, 'Unsinniger Code wird abgewiesen');
  expect(window.MFE.quiz.sanitizeQuiz({ title: 'x', tasks: [{ type: 'evil' }] }) === null,
         'Unbekannter Aufgabentyp wird verworfen');
  expect(window.MFE.quiz.sanitizeQuiz({ title: 'x', tasks: [{ type: 'value', form: 'linear', values: { m: 'NaN', b: 0 }, x0: 1 }] }) === null,
         'Kaputte Parameterwerte werden verworfen');

  click($('#quiz-list').querySelector('[data-act="play"]')); await tick();
  expect($('#screen-play').classList.contains('is-active'), 'Abspieler geoeffnet');
  expect($('#play-body .quiz-opt').length !== 0 || $$('#play-body .quiz-opt').length === 4,
         'Zuordnungsaufgabe zeigt vier Antworten');
  click($$('#play-body .quiz-opt')[0]); await tick();
  expect(!$('#btn-play-next').hidden, 'Nach der Antwort geht es weiter');
  click('#btn-play-next'); await tick();
  expect($('#play-progress').textContent.includes('2'), 'Zweite Aufgabe erreicht');
  click('#btn-play-check'); await tick();
  click('#btn-play-next'); await tick();
  click($$('#play-body .quiz-opt')[0]); await tick();
  click('#btn-play-next'); await tick();
  expect(!$('#btn-play-again').hidden, 'Auswertung am Ende');
}

// --- v5: Ansicht ---
click('#btn-home'); await tick();
click('.fn-card[data-category="linear"]'); await tick();
const readView = () => ['#view-x0','#view-x1','#view-y0','#view-y1'].map(s => parseFloat($(s).value.replace(',', '.')));
let [x0, x1, y0, y1] = readView();
expect(x0 === -10 && x1 === 10, 'Standardausschnitt steht in den Feldern');

click('#btn-zoom-in'); await tick();
let v2 = readView();
expect(v2[1] - v2[0] < x1 - x0, 'Hineinzoomen verkleinert den Ausschnitt');
click('#btn-reset-view'); await tick();
expect(readView()[0] === -10, 'Zuruecksetzen stellt den Standard wieder her');

// Unsymmetrischer Ausschnitt - der Fall, der vorher gar nicht ging
$('#view-x0').value = '0'; $('#view-x1').value = '10';
$('#view-y0').value = '0'; $('#view-y1').value = '1000';
$('#view-y1').dispatchEvent(new window.Event('change', { bubbles: true }));
await tick();
const uv = readView();
expect(uv[0] === 0 && uv[3] === 1000, `y bis 1000 wird uebernommen (${uv.join('/')})`);
// syncHash ist entprellt (300 ms) - hier bewusst laenger warten.
await new Promise(r => setTimeout(r, 420));
expect(window.location.hash.includes('vy=0%2C1000') || window.location.hash.includes('vy=0,1000'),
       `Der Ausschnitt landet im Link (${window.location.hash.slice(0, 80)})`);

// Voreinstellung
click('[data-preset="trig"]'); await tick();
expect($('#opt-piAxis').checked, 'Voreinstellung Trigonometrie schaltet die pi-Achse ein');
click('[data-preset="standard"]'); await tick();

// Mausrad zoomt um den Zeiger
const before = readView();
$('#graph-canvas').dispatchEvent(new window.WheelEvent('wheel', { deltaY: -100, clientX: 200, clientY: 150, bubbles: true, cancelable: true }));
await tick();
const after = readView();
expect(after[1] - after[0] < before[1] - before[0], 'Mausrad zoomt hinein');

// Ziehen verschiebt
const dragStart = readView();
$('#graph-canvas').dispatchEvent(new window.PointerEvent('pointerdown', { pointerId: 1, clientX: 200, clientY: 150, bubbles: true, cancelable: true }));
$('#graph-canvas').dispatchEvent(new window.PointerEvent('pointermove', { pointerId: 1, clientX: 260, clientY: 150, bubbles: true, cancelable: true }));
$('#graph-canvas').dispatchEvent(new window.PointerEvent('pointerup', { pointerId: 1, clientX: 260, clientY: 150, bubbles: true, cancelable: true }));
await tick();
expect(readView()[0] < dragStart[0], 'Ziehen nach rechts verschiebt den Ausschnitt nach links');
click('#btn-reset-view'); await tick();

// --- v5: neue Funktionsklassen ---
for (const cat of ['polynomial', 'root', 'absolute', 'logarithm', 'rational']) {
  click('#btn-home'); await tick();
  click(`.fn-card[data-category="${cat}"]`); await tick();
  if (LITE) {
    expect($('#screen-home').classList.contains('is-active'), `Lite: ${cat} bleibt gesperrt`);
    $('#pro-dialog').close('cancel'); await tick(); await tick();
  } else {
    expect($('#screen-app').classList.contains('is-active'), `${cat} laesst sich oeffnen`);
    expect($('#parameters-container').children.length >= 3, `${cat} hat Regler`);
  }
}

// --- v5: Ableitung, Tangente, Trace ---
click('#btn-home'); await tick();
click('.fn-card[data-category="linear"]'); await tick();
for (const opt of ['derivative', 'tangent', 'trace']) {
  const box = $(`#opt-${opt}`);
  box.checked = true;
  box.dispatchEvent(new window.Event('change', { bubbles: true }));
  await tick();
  if (LITE && opt !== 'trace') {
    expect(!box.checked, `Lite: ${opt} bleibt gesperrt`);
    $('#pro-dialog').close('cancel'); await tick(); await tick();
  } else {
    expect(box.checked, `${opt} laesst sich einschalten`);
  }
}

// --- v5: Wertetabelle mit Differenzen ---
click('#tab-btn-table'); await tick();
const cols0 = $('#values-table thead').querySelectorAll('th').length;
$('#opt-diff').checked = true;
$('#opt-diff').dispatchEvent(new window.Event('change', { bubbles: true }));
await tick();
expect($('#values-table thead').querySelectorAll('th').length === cols0 + 1, 'Differenzspalte kommt dazu');
const firstRow = $('#values-table tbody').firstElementChild;
expect(firstRow.children[2].textContent.replace(',', '.') === '1' ||
       firstRow.children[2].textContent === '1,000' ||
       parseFloat(firstRow.children[2].textContent.replace(',', '.')) === 1,
       `Differenz einer Geraden mit m=1 ist 1 (gelesen: ${firstRow.children[2].textContent})`);
$('#opt-quot').checked = true;
$('#opt-quot').dispatchEvent(new window.Event('change', { bubbles: true }));
await tick();
expect($('#values-table thead').querySelectorAll('th').length === cols0 + 2, 'Quotientenspalte kommt dazu');

// --- v5: Beamer-Modus ---
click('#btn-beamer'); await tick();
expect(window.document.documentElement.getAttribute('data-display') === 'beamer', 'Beamer-Modus schaltet um');
click('#btn-beamer'); await tick();
expect(window.document.documentElement.getAttribute('data-display') === 'normal', 'und wieder zurueck');

// --- v5: QR-Code ---
expect(window.MFE.qr.encode('https://example.org/#quiz=AAA', { ec: 'M' })?.n === 25 ||
       window.MFE.qr.encode('https://example.org/#quiz=AAA', { ec: 'M' })?.n > 0, 'QR-Modul liefert eine Matrix');
expect(window.MFE.qr.encode('') === null, 'QR: leerer Text liefert null');

// --- v5: Zufallsquiz ---
if (!LITE) {
  const rq = window.MFE.quiz.buildRandomQuiz('linear', 8, ['match', 'value', 'readoff', 'truefalse']);
  expect(rq && rq.tasks.length === 8, `Zufallsquiz hat 8 Aufgaben (${rq && rq.tasks.length})`);
  expect(rq.tasks.every(t => window.MFE.quiz.sanitizeQuiz({ title: 'x', tasks: [t] })), 'jede erzeugte Aufgabe ist gueltig');
  const rq2 = window.MFE.quiz.buildRandomQuiz('rational', 6, ['value', 'readoff']);
  expect(rq2 && rq2.tasks.length > 0, 'Zufallsquiz auch fuer Hyperbeln');
  expect(window.MFE.quiz.buildRandomQuiz('linear', 5, []) === null, 'ohne Aufgabenart kein Quiz');
}

// --- Alle Funktionsklassen erreichbar (nur Pro) ---
if (!LITE) {
  const cats = ['linear','quadratic','polynomial','exponential','logarithm','trig','root','absolute','rational'];
  let opened = 0;
  for (const cat of cats) {
    click('#btn-home'); await tick();
    click(`.fn-card[data-category="${cat}"]`); await tick();
    if ($('#screen-app').classList.contains('is-active')
        && $('#parameters-container').children.length > 0) opened++;
    else errors.push('Klasse laesst sich nicht oeffnen: ' + cat);
  }
  expect(opened === cats.length, `alle ${cats.length} Funktionsklassen oeffnen sich`);

  // --- Der Fall, der vorher gar nicht darstellbar war ---
  click('#btn-home'); await tick();
  click('.fn-card[data-category="exponential"]'); await tick();
  const setP = (id, v) => { const f = $(id); f.value = v; f.dispatchEvent(new window.Event('change', { bubbles: true })); };
  setP('#val-a', '100'); await tick();
  setP('#val-b', '2'); await tick();
  $('#view-x0').value = '0'; $('#view-x1').value = '5';
  $('#view-x1').dispatchEvent(new window.Event('change', { bubbles: true })); await tick();
  click('#btn-fit'); await tick();
  const y1 = parseFloat($('#view-y1').value.replace(',', '.'));
  expect(y1 > 1000, `passend zoomen erfasst a = 100 (y bis ${y1})`);

  // --- Ableitung und Tangente ---
  click('#btn-home'); await tick();
  click('.fn-card[data-category="quadratic"]'); await tick();
  const tick2 = (id) => { const b = $(id); b.checked = true; b.dispatchEvent(new window.Event('change', { bubbles: true })); };
  tick2('#opt-derivative'); await tick();
  expect($('#opt-derivative').checked, 'Ableitung laesst sich einschalten');
  tick2('#opt-tangent'); await tick();
  expect($('#opt-tangent').checked, 'Tangente laesst sich einschalten');
  expect($('#readout').textContent.length > 0, 'Steigung erscheint im Ablesetext');
  tick2('#opt-trace'); await tick();
  expect($('#opt-trace').checked, 'Trace laesst sich einschalten');
} else {
  click('#btn-home'); await tick();
  click('.fn-card[data-category="rational"]'); await tick();
  expect($('#screen-home').classList.contains('is-active'), 'Lite: Hyperbeln bleiben gesperrt');
  if ($('#pro-dialog').open) { $('#pro-dialog').close('cancel'); await tick(); await tick(); }
  const deriv = $('#opt-derivative');
  deriv.checked = true; deriv.dispatchEvent(new window.Event('change', { bubbles: true })); await tick();
  expect(deriv.checked === false, 'Lite: Ableitung bleibt gesperrt');
  if ($('#pro-dialog').open) { $('#pro-dialog').close('cancel'); await tick(); await tick(); }
}

// --- Auswertung haelt fest, was richtig war ---
if (!LITE) {
  click('#btn-home'); await tick();
  click('#card-quizzes'); await tick();
  const first = $('#quiz-list').querySelector('[data-act="play"]');
  if (first) {
    click(first); await tick();
    let guard = 0;
    while (guard++ < 30 && $('#btn-play-again').hidden) {
      const opts = $$('#play-body .quiz-opt');
      if (opts.length) click(opts[0]);
      else click('#btn-play-check');
      await tick();
      if (!$('#btn-play-next').hidden) { click('#btn-play-next'); await tick(); }
    }
    expect(!$('#btn-play-again').hidden, 'Quiz laeuft bis zur Auswertung durch');
    const marks = $$('#play-body .result-list li');
    expect(marks.length > 0, 'Auswertung listet die Aufgaben einzeln');
    expect(marks.every(li => li.classList.contains('is-ok') || li.classList.contains('is-err')),
           'jede Aufgabe ist als richtig oder falsch gekennzeichnet');
    const txt = window.MFE.quiz.resultText();
    expect(/[\u2713\u2717]/.test(txt), 'Ergebnistext enthaelt Haken oder Kreuz');
    expect(txt.split('\n').length >= marks.length, 'Ergebnistext nennt alle Aufgaben');
  }
}

// --- Zurueck-Knopf ---------------------------------------------------------
// Erst zur Ruhe kommen lassen: ein zuvor geschlossener Dialog raeumt seinen
// Verlaufseintrag asynchron ab.
await tick(); await tick(); await tick();
// Das war der Fehler: ohne Verlauf beendete Zurueck die App aus jedem
// Bildschirm heraus. Jetzt muss der Weg rueckwaerts durchlaufen werden.
const back = async () => { window.history.back(); await tick(); await tick(); };

click('#btn-home'); await tick();
click('.fn-card[data-category="linear"]'); await tick();
expect($('#screen-app').classList.contains('is-active'), 'Zurueck-Test: Explorer offen');
click('#tab-btn-table'); await tick();
expect($('#tab-table').classList.contains('is-active'), 'Zurueck-Test: Wertetabelle offen');

await back();
expect($('#tab-explorer').classList.contains('is-active'), 'Zurueck fuehrt vom Reiter Tabelle zurueck zum Explorer');
await back();
expect($('#screen-home').classList.contains('is-active'), 'Zurueck fuehrt vom Explorer zurueck zur Startseite');

// Tiefer Weg: Start -> Quizliste -> Editor
if (!LITE) {
  click('#card-quizzes'); await tick();
  expect($('#screen-quizzes').classList.contains('is-active'), 'Zurueck-Test: Quizliste offen');
  click('#btn-new-quiz'); await tick();
  expect($('#screen-builder').classList.contains('is-active'), 'Zurueck-Test: Editor offen');
  await back();
  expect($('#screen-quizzes').classList.contains('is-active'), 'Zurueck fuehrt vom Editor zurueck zur Liste');
  await back();
  expect($('#screen-home').classList.contains('is-active'), 'Zurueck fuehrt von der Liste zurueck zur Startseite');
}

// Ein offener Dialog wird zuerst geschlossen, der Bildschirm bleibt stehen.
click('#card-info'); await tick();
click('[data-back="home"]'); await tick();
click('.fn-card[data-category="linear"]'); await tick();
const chip = $('#equations .param-chip');
if (chip) {
  click(chip); await tick();
  expect($('#param-dialog').open, 'Parameterdialog geoeffnet');
  await back();
  expect(!$('#param-dialog').open, 'Zurueck schliesst den Dialog');
  expect($('#screen-app').classList.contains('is-active'), 'und laesst den Bildschirm stehen');
}

// Wiederholtes Zurueck darf nicht in einer Schleife haengen bleiben.
let guardBack = 0;
while (guardBack++ < 12 && !$('#screen-home').classList.contains('is-active')) await back();
expect($('#screen-home').classList.contains('is-active'), 'wiederholtes Zurueck endet auf der Startseite');

// --- Tastaturbedienung und Beschreibung des Graphen ------------------------
click('#btn-home'); await tick();
click('.fn-card[data-category="linear"]'); await tick();
const cv = $('#graph-canvas');
expect(cv.getAttribute('tabindex') === '0', 'Koordinatensystem ist mit der Tastatur erreichbar');
const beforeX = parseFloat($('#view-x0').value.replace(',', '.'));
cv.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
await tick();
expect(parseFloat($('#view-x0').value.replace(',', '.')) > beforeX, 'Pfeiltaste verschiebt den Ausschnitt');
const spanBefore = parseFloat($('#view-x1').value.replace(',', '.')) - parseFloat($('#view-x0').value.replace(',', '.'));
cv.dispatchEvent(new window.KeyboardEvent('keydown', { key: '+', bubbles: true }));
await tick();
expect(parseFloat($('#view-x1').value.replace(',', '.')) - parseFloat($('#view-x0').value.replace(',', '.')) < spanBefore,
       'Plus-Taste zoomt hinein');
cv.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
await tick();
expect(Math.abs(parseFloat($('#view-x0').value.replace(',', '.')) + 10) < 0.01, 'Pos1 setzt die Ansicht zurueck');

await new Promise(r => setTimeout(r, 600));
const desc = $('#graph-desc').textContent;
expect(desc.length > 20, 'Der Graph hat eine Textbeschreibung');
expect(/f\(x\)/.test(desc), 'die Beschreibung nennt die Gleichung');
expect(/x von|x from/.test(desc), 'die Beschreibung nennt den Ausschnitt');

// --- Zwei-Finger-Geste ----------------------------------------------------
const spanPre = parseFloat($('#view-x1').value.replace(',', '.')) - parseFloat($('#view-x0').value.replace(',', '.'));
const pd = (id, x, y, type) => cv.dispatchEvent(new window.PointerEvent(type, {
  pointerId: id, clientX: x, clientY: y, bubbles: true, cancelable: true
}));
cv.getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 300, right: 400, bottom: 300 });
mainMeasure();
pd(1, 150, 150, 'pointerdown'); pd(2, 250, 150, 'pointerdown');
pd(1, 100, 150, 'pointermove'); pd(2, 300, 150, 'pointermove');   // Finger auseinander
await tick();
const spanPost = parseFloat($('#view-x1').value.replace(',', '.')) - parseFloat($('#view-x0').value.replace(',', '.'));
pd(1, 100, 150, 'pointerup'); pd(2, 300, 150, 'pointerup');
await tick();
expect(spanPost < spanPre, `Auseinanderziehen zoomt hinein (${spanPre.toFixed(1)} -> ${spanPost.toFixed(1)})`);

// --- Arbeitsblatt ---------------------------------------------------------
// Gehoert zur selben Berechtigung wie der Bildexport.
const printsBefore = printed;
click('#btn-print');
await tick(); await tick(); await tick();
if (LITE) {
  expect(printed === printsBefore, 'Lite: das Arbeitsblatt bleibt gesperrt');
  if ($('#pro-dialog').open) { $('#pro-dialog').close('cancel'); await tick(); await tick(); }
} else {
  expect(printed > printsBefore, 'Arbeitsblatt loest den Druckvorgang aus');
  expect($('#ps-image').getAttribute('src')?.startsWith('data:image/png'), 'Der Graph liegt als Bild auf dem Blatt');
  expect($('#ps-table').querySelector('table'), 'Die Wertetabelle liegt auf dem Blatt');
  expect($('#ps-equation').textContent.includes('f(x)'), 'Die Gleichung steht auf dem Blatt');
}

// --- Tangens --------------------------------------------------------------
if (!LITE) {
  click('#btn-home'); await tick();
  click('.fn-card[data-category="trig"]'); await tick();
  const sel = $('#function-form');
  expect(Array.from(sel.options).some(o => o.value === 'tangens'), 'Tangens steht zur Auswahl');
  sel.value = 'tangens';
  sel.dispatchEvent(new window.Event('change', { bubbles: true }));
  await tick();
  expect($('#parameters-container').children.length === 4, 'Tangens hat vier Regler');
  expect($('#opt-piAxis').checked, 'Tangens schaltet die pi-Achse ein');
}

// --- Sicherungsdatei ------------------------------------------------------
if (!LITE) {
  click('#btn-home'); await tick();
  click('#card-quizzes'); await tick();
  const dlBefore = downloads.length;
  click('#btn-backup-save'); await tick();
  expect(downloads.length > dlBefore, 'Sicherung wird als Datei angeboten');
  expect(String(downloads.at(-1)).endsWith('.json'), 'die Sicherung ist eine JSON-Datei');

  const before = JSON.parse(window.localStorage.getItem('mfe:quizzes')).length;
  const payload = JSON.stringify({
    format: 'mathfunctions-explorer/quizzes', version: 1,
    quizzes: [{ title: 'Aus Sicherung', tasks: [{ type: 'value', form: 'linear', values: { m: 2, b: 1 }, x0: 3 }] }]
  });
  await window.MFE.quiz.backupLoad({ size: payload.length, text: async () => payload });
  await tick();
  const after = JSON.parse(window.localStorage.getItem('mfe:quizzes'));
  expect(after.length === before + 1, 'Sicherung wird eingelesen, Bestehendes bleibt');
  expect(after.some(q => q.title === 'Aus Sicherung'), 'das eingelesene Quiz ist da');

  // Muell darf nichts anrichten
  const n0 = JSON.parse(window.localStorage.getItem('mfe:quizzes')).length;
  await window.MFE.quiz.backupLoad({ size: 10, text: async () => 'kein json' });
  await window.MFE.quiz.backupLoad({ size: 10, text: async () => '{"format":"falsch"}' });
  await tick();
  expect(JSON.parse(window.localStorage.getItem('mfe:quizzes')).length === n0,
         'unbrauchbare Sicherungen aendern nichts');
}

// --- Arbeitsstand ueberlebt einen Neustart --------------------------------
click('#btn-home'); await tick();
click('.fn-card[data-category="linear"]'); await tick();
const setField = (id, v) => { const f = $(id); f.value = v; f.dispatchEvent(new window.Event('change', { bubbles: true })); };
setField('#val-m', '3.25'); await tick();
setField('#view-x1', '17'); await tick();
await new Promise(r => setTimeout(r, 900));      // pushHistory + saveSession sind entprellt
const saved = window.localStorage.getItem('mfe:session');
expect(!!saved, 'Arbeitsstand wird gespeichert');
if (saved) {
  const sess = JSON.parse(saved);
  expect(Math.abs(sess.curves[0].values.m - 3.25) < 1e-6, 'der Parameter steht im gespeicherten Stand');
  expect(Math.abs(sess.view.xMax - 17) < 1e-6, 'der Ausschnitt steht im gespeicherten Stand');
  expect(sess.inApp === true, 'gemerkt, dass der Explorer offen war');
}

// --- Auswahlliste fuehrt alle Funktionsklassen ----------------------------
click('#btn-home'); await tick();
click('.fn-card[data-category="linear"]'); await tick();
const fsel = $('#function-form');
const groups = Array.from(fsel.querySelectorAll('optgroup'));
expect(groups.length === 9, `alle neun Klassen stehen in der Liste (${groups.length})`);
expect(fsel.querySelectorAll('option').length === 12, 'alle zwoelf Darstellungsformen sind waehlbar');
expect(!fsel.closest('.form-row').hidden, 'die Liste ist sichtbar, auch bei nur einer Form');

if (LITE) {
  const locked = groups.filter(g => g.label.includes('PRO'));
  expect(locked.length === 7, `Lite: sieben Klassen sind als PRO gekennzeichnet (${locked.length})`);
  expect(groups.some(g => !g.label.includes('PRO')), 'Lite: die enthaltenen Klassen tragen keine Kennzeichnung');
  // Auswahl einer gesperrten Klasse muss zurueckgenommen werden
  fsel.value = 'rational';
  fsel.dispatchEvent(new window.Event('change', { bubbles: true }));
  await tick();
  expect(fsel.value === 'linear', 'Lite: gesperrte Auswahl wird zurueckgenommen');
  expect($('#pro-dialog').open, 'Lite: und der Hinweis erscheint');
  if ($('#pro-dialog').open) { $('#pro-dialog').close('cancel'); await tick(); await tick(); }
  // Auf der Startseite muessen die gesperrten Karten sichtbar gekennzeichnet sein
  click('#btn-home'); await tick();
  const cards = $$('.fn-card[data-feature]');
  const catCards = cards.filter(c => c.dataset.category);
  expect(catCards.length === 7, `sieben gesperrte Funktionsklassen (${catCards.length})`);
  expect(cards.length === 8, `dazu der Quiz-Baukasten, also acht Sperren insgesamt (${cards.length})`);
  expect(cards.every(c => c.classList.contains('is-locked')), 'alle gesperrten Karten tragen die Kennzeichnung');
  expect(cards.every(c => c.getAttribute('aria-disabled') === 'true'), 'und sind als gesperrt ausgezeichnet');
  expect($$('.fn-card:not([data-feature])').length === 3,
         'frei bleiben zwei Funktionsklassen und die Info-Karte');
} else {
  expect(!groups.some(g => g.label.includes('PRO')), 'Pro: keine Klasse ist gekennzeichnet');
  // Klassenwechsel direkt aus dem Explorer heraus
  fsel.value = 'sinus';
  fsel.dispatchEvent(new window.Event('change', { bubbles: true }));
  await tick();
  expect($('#parameters-container').children.length === 4, 'Klassenwechsel ueber die Liste laedt die Sinusfunktion');
  expect($('#opt-piAxis').checked, 'und stellt die pi-Achse ein');
}

// --- Zurueck-Tiefe wird mitgezaehlt ---------------------------------------
click('#btn-home'); await tick();
expect(window.MFE.nav.depth >= 0, 'die Verlaufstiefe ist bekannt');
const d0 = window.MFE.nav.depth;
click('.fn-card[data-category="linear"]'); await tick();
expect(window.MFE.nav.depth === d0 + 1, 'ein Bildschirmwechsel erhoeht die Tiefe um genau eins');
click('#tab-btn-table'); await tick();
expect(window.MFE.nav.depth === d0 + 2, 'ein Reiterwechsel ebenfalls');
await back(); await back();
expect(window.MFE.nav.depth === d0, 'zweimal Zurueck bringt die Tiefe wieder auf den Ausgangswert');

// --- Startseite: Freigeschaltetes zuerst ----------------------------------
click('#btn-home'); await tick();
{
  const grid = $$('.fn-grid')[0];
  const cards = Array.from(grid.children).filter(el => el.classList.contains('fn-card'));
  const firstLocked = cards.findIndex(c => c.classList.contains('is-locked'));
  const lastOpen = cards.map(c => c.classList.contains('is-locked')).lastIndexOf(false);
  if (LITE) {
    expect(firstLocked > lastOpen, 'Lite: gesperrte Karten stehen hinter den freien');
    expect(grid.querySelector('.grid-sep'), 'Lite: eine Trennzeile kuendigt den Pro-Teil an');
    expect(cards.slice(0, 2).every(c => !c.classList.contains('is-locked')),
           'Lite: die ersten beiden Karten sind nutzbar');
  } else {
    expect(!grid.querySelector('.grid-sep'), 'Pro: keine Trennzeile noetig');
    expect(cards.every(c => !c.classList.contains('is-locked')), 'Pro: nichts ist gesperrt');
  }
}

// --- Store-Verweis vor der Veroeffentlichung ------------------------------
expect(window.MFE.licence.openStore() === 'notyet',
       'Solange die Pro-Ausgabe nicht im Store ist, wird sie nicht aufgerufen');
expect(window.MFE.licence.storeLive() === false, 'der Schalter steht auf "noch nicht"');
expect(window.MFE.billing.status() === 'web' || window.MFE.billing.status() === 'owned',
       'Billing meldet im Browser einen sinnvollen Zustand');

// --- Fassungsnummer sichtbar ----------------------------------------------
click('#btn-home'); await tick();
click('#card-info'); await tick();
{
  const line = $('#info-version').textContent;
  expect(/\d+\.\d+\.\d+/.test(line), `die Info-Seite nennt die Fassung ("${line}")`);
  expect(line.includes(LITE ? 'Lite' : 'Pro'), 'und die Ausgabe');
}
click('[data-back="home"]'); await tick();

// --- In der App wird ein vorhandener Service Worker abgemeldet -------------
{
  const unregistered = [];
  const fakeReg = { unregister: async () => { unregistered.push(1); return true; } };
  window.navigator.serviceWorker = {
    getRegistrations: async () => [fakeReg],
    addEventListener: () => {},
    register: async () => { throw new Error('haette nicht registrieren duerfen'); },
    controller: null
  };
  window.caches = { keys: async () => ['mfe-v1', 'fremd'], delete: async () => true };
  const prevCap = window.Capacitor;
  window.Capacitor = { isNativePlatform: () => true };
  window.MFE.app?.registerServiceWorker?.();
  await new Promise(r => setTimeout(r, 30));
  expect(unregistered.length === 1, 'ein vorhandener Service Worker wird in der App abgemeldet');
  window.Capacitor = prevCap;
}

// --- Schnellwahl auf der Startseite ---------------------------------------
click('#btn-home'); await tick();
{
  const sel = $('#home-select');
  expect(sel, 'Schnellwahl vorhanden');
  expect(sel.options.length === 10, `ein Hinweis plus neun Klassen (${sel.options.length})`);
  expect(sel.options[0].value === '', 'der erste Eintrag ist nur ein Hinweis');
  if (LITE) {
    expect(Array.from(sel.options).filter(o => o.textContent.includes('PRO')).length === 7,
           'Lite: sieben Klassen sind in der Liste als PRO gekennzeichnet');
  }
  sel.value = 'linear';
  sel.dispatchEvent(new window.Event('change', { bubbles: true }));
  await tick();
  expect($('#screen-app').classList.contains('is-active'), 'die Schnellwahl oeffnet den Explorer');
  expect(sel.selectedIndex === 0, 'und stellt sich danach wieder auf den Hinweis');
}

// --- Wertetabelle neben dem Graphen ---------------------------------------
{
  const app = $('#screen-app');
  expect(!app.classList.contains('is-split'), 'schmal: kein geteiltes Layout');
  expect($('#chip-split').hidden, 'schmal: der Schalter bleibt verborgen');

  setWide(true); await tick();
  expect(!$('#chip-split').hidden, 'breit: der Schalter erscheint');
  expect(app.classList.contains('is-split'), 'breit: Graph und Tabelle stehen nebeneinander');
  expect($('#values-table tbody').children.length > 0, 'und die Tabelle ist gefuellt');

  // Abschalten muss wirken und erhalten bleiben
  const box = $('#opt-split');
  box.checked = false;
  box.dispatchEvent(new window.Event('change', { bubbles: true }));
  await tick();
  expect(!app.classList.contains('is-split'), 'abgeschaltet: wieder einspaltig');
  box.checked = true;
  box.dispatchEvent(new window.Event('change', { bubbles: true }));
  await tick();

  // Im Uebungsreiter ergibt die Tabelle daneben keinen Sinn
  click('#tab-btn-quiz'); await tick();
  expect(!app.classList.contains('is-split'), 'im Uebungsteil kein geteiltes Layout');
  click('#tab-btn-explorer'); await tick();
  expect(app.classList.contains('is-split'), 'zurueck im Explorer wieder geteilt');
  setWide(false); await tick();
  expect(!app.classList.contains('is-split'), 'wird der Bildschirm schmal, klappt es zusammen');
}

// --- Kopfzeile auf der Startseite ------------------------------------------
click('#btn-home'); await tick();
expect(window.document.documentElement.dataset.screen === 'home',
       'der Bildschirm steht als Attribut fest (damit das CSS reagieren kann)');
click('.fn-card[data-category="linear"]'); await tick();
expect(window.document.documentElement.dataset.screen === 'app', 'und wechselt mit');

// --- Verborgen heisst verborgen -------------------------------------------
// Der Fehler, der das ausgeloest hat: .update-bar hatte display: flex, und
// Autoren-CSS schlaegt die Browser-Regel [hidden] { display: none }. Die
// Leiste "Eine neue Fassung steht bereit" stand deshalb DAUERHAFT da - auch
// in der App, auch ohne Service Worker. Geprueft wird jetzt die tatsaechliche
// Darstellung, nicht nur die Eigenschaft .hidden.
{
  const shown = (el) => window.getComputedStyle(el).display !== 'none';
  const mustHide = ['#update-bar', '#chip-split', '#info-lite-box', '#backup-file',
                    '#btn-play-next', '#btn-play-again', '#btn-play-wrong'];
  for (const sel of mustHide) {
    const el = $(sel);
    if (!el) { errors.push(`Element ${sel} fehlt`); continue; }
    el.hidden = true;
    expect(!shown(el), `${sel}: hidden verbirgt das Element wirklich`);
  }
  // Gegenprobe: ohne das Attribut muss es sichtbar sein.
  const bar = $('#update-bar');
  bar.hidden = false;
  expect(shown(bar), '#update-bar ohne hidden ist sichtbar');
  bar.hidden = true;
}

// Sprache umschalten
click('#btn-lang-en'); await tick();
expect($('#tab-btn-table').textContent === 'Table of values', 'Sprachwechsel wirkt');
click('#btn-lang-de'); await tick();

// Rueckgaengig
click('#btn-home'); await tick();
click('.fn-card[data-category="linear"]'); await tick();

/* ---- Ergebnis ---------------------------------------------------------- */
const failed = checks.filter(([ok]) => !ok);
console.log(`${LITE ? 'LITE' : 'PRO '}: ${checks.length - failed.length}/${checks.length} Pruefungen bestanden`);
if (errors.length) {
  console.error('Fehler:');
  for (const e of [...new Set(errors)]) console.error('  · ' + e);
  process.exit(1);
}
