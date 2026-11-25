/* ==========================================================================
   tools/smoke.mjs  ·  Laufzeittest ohne Browser
   Startet index.html in jsdom, klickt die wichtigsten Wege durch und meldet
   jeden Fehler, der dabei in die Konsole faellt. Kein Ersatz fuer den Test
   am Telefon, aber es faengt tote Verweise und Tippfehler ab, bevor sie auf
   einem Geraet landen.

   Aufruf:  node tools/smoke.mjs            Browser: voller Umfang
            node tools/smoke.mjs locked     iOS-App ohne Kauf: Sperren,
                                            dann Kauf und Wiederherstellen
                                            mit nachgebautem StoreKit-Plugin
   ========================================================================== */
import { JSDOM, VirtualConsole } from 'jsdom';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/* LITE heisst hier: iOS-App, Pro noch nicht gekauft. Der Name ist aus der
   Zeit der zwei Ausgaben geblieben; die Pruefungen dahinter gelten weiter. */
const LITE = process.argv[2] === 'locked';

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
// measureText liefert in jedem echten Browser ein Mass - die Achsenbeschriftung
// rechnet damit, ob eine Zahl noch ganz ins Bild passt.
const stubCtx = new Proxy({}, {
  get: (_, k) => (k === 'measureText' ? (s) => ({ width: String(s).length * 6 }) : () => {})
});
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

/* iOS-App nachstellen: build-www.mjs laedt cordova.js vor licence.js, das
   window.cordova synchron anlegt. Die Plugins kommen erst mit deviceready -
   genau wie auf dem Geraet. */
const storeCalls = [];
let storeOwned = false;
if (LITE) {
  window.cordova = { platformId: 'ios' };
  try { window.localStorage.removeItem('mfe:pro'); } catch {}
}

/* Bestehende Installation aus 7.0 nachstellen: Tabelle daneben an, im
   Arbeitsstand Hilfslinien und Nullstellen an. 7.1 muss das EINMAL auf die
   neuen Voreinstellungen setzen, Sprache und Farbschema aber behalten. */
try {
  window.localStorage.setItem('mfe:v3', JSON.stringify({
    lang: 'de', theme: 'light', display: 'normal', snap: true, split: true, symbols: {}
  }));
  const lin = { form: 'linear', values: { m: 1, b: 0 }, bounds: {} };
  window.localStorage.setItem('mfe:session', JSON.stringify({
    at: Date.now(), curves: [lin], active: 0,
    view: { xMin: -10, xMax: 10, yMin: -10, yMax: 10 }, piAxis: false,
    opts: { helpers: true, roots: true, showTerm: true }, table: { diff: false, quot: false },
    tangentX: 1, secantH: 2, frozen: null, inApp: false, tab: 'explorer'
  }));
} catch {}

const files = ['js/licence.js', 'js/billing.js', 'js/i18n.js', 'js/functions.js',
               'js/graph.js', 'js/diagnose.js', 'js/nav.js', 'js/ui.js', 'js/qr.js', 'js/quiz.js',
               'js/paths.js', 'js/paths-quadratic.js', 'js/app.js'];
for (const f of files) {
  let src = readFileSync(path.join(ROOT, f), 'utf8');
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

// --- Einmaliger Wechsel auf die Voreinstellungen von 7.1 -------------------
{
  await new Promise(r => setTimeout(r, 450));      // saveSettings ist entprellt
  let saved = null;
  try { saved = JSON.parse(window.localStorage.getItem('mfe:v3')); } catch {}
  expect(saved?.rev === 2, `Migration: die Einstellungen tragen jetzt die Fassung 2 (${saved?.rev})`);
  expect(saved?.split === false, 'Migration: die Tabelle daneben ist aus');
  expect(saved?.lang === 'de' && saved?.theme === 'light', 'Migration: Sprache und Farbschema bleiben');
  expect(!$('#opt-helpers').checked, 'Migration: Hilfslinien aus dem alten Arbeitsstand sind aus');
  expect(!$('#opt-roots').checked, 'Migration: auch die Nullstellen');
  expect($('#opt-showTerm').checked, 'Migration: die Gleichung mit Zahlen bleibt an');
}

// --- Startseite: vier Klassen, "Weitere", feste Reihenfolge ---------------
{
  const main = Array.from($('.fn-grid-main').children);
  const order = main.map(c => c.dataset.category || c.id);
  expect(order.join(',') === 'linear,quadratic,exponential,trig,btn-more-fns',
         `Startseite: feste Reihenfolge der grossen Karten (${order.join(',')})`);
  expect(main.every(c => c.dataset.cat), 'jede grosse Karte hat eine Klassenfarbe');
  expect(!$('#home-select'), 'das Auswahlmenue ist entfernt');
  expect(!$$('.grid-sep').length, 'keine Trennzeile mehr');
  expect($('.eyebrow').textContent.includes('7 bis 13'), 'Zielgruppe: Klasse 7 bis 13');
  const more = $('#more-fns');
  expect(more.hidden && $('#btn-more-fns').getAttribute('aria-expanded') === 'false',
         'weitere Klassen sind zu Beginn zugeklappt');
  expect(window.getComputedStyle(more).display === 'none', 'und wirklich unsichtbar');
  expect(more.querySelectorAll('.fn-card[data-category]').length === 5, 'darin fuenf weitere Klassen');
  click('#btn-more-fns'); await tick();
  expect(!more.hidden && $('#btn-more-fns').getAttribute('aria-expanded') === 'true', 'Klick klappt sie auf');
  click('#btn-more-fns'); await tick();
  expect(more.hidden, 'zweiter Klick klappt sie wieder zu');
  if (LITE) {
    const locked = main.filter(c => c.classList.contains('is-locked')).map(c => c.dataset.category);
    expect(locked.join(',') === 'quadratic,trig', `Lite: quadratisch und trigonometrisch tragen das Pro-Abzeichen (${locked})`);
  }
  expect($('#card-practice-desc').textContent.includes('Lineare'), 'Uebungskarte nennt die geuebte Klasse');
}
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
expect($('#info-features').children.length === 13, 'Dreizehn Punkte in der Funktionsliste (mit Lernpfaden)');
expect([...$('#info-features').children].every(li => li.textContent && !li.textContent.startsWith('info.')),
       'Kein unuebersetzter Schluessel in der Funktionsliste');
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
  /* Neu ab v6.6: der erste Fehlversuch schliesst die Aufgabe NICHT ab. Es
     gibt einen Hinweis und einen zweiten Versuch. War der erste Klick
     zufaellig richtig, geht es sofort weiter. */
  if ($('#btn-play-next').hidden) {
    expect($('#play-feedback').textContent.length > 0, 'Erster Fehlversuch bringt einen Hinweis');
    expect($$('#play-body .quiz-opt').filter(b => b.disabled).length === 1,
           'Nur die falsch gewaehlte Kachel ist gesperrt');
    const open = $$('#play-body .quiz-opt').find(b => !b.disabled);
    click(open); await tick();
  }
  expect(!$('#btn-play-next').hidden, 'Nach dem zweiten Versuch geht es weiter');
  expect($$('#play-body .quiz-opt').every(b => b.disabled), 'Danach sind alle Kacheln gesperrt');
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

/* ==========================================================================
   v6.6: Spur, Vergleichskurve, Sekante, Wertestreifen, Tabelle <-> Graph,
   Fehlvorstellungen, Wettkampf
   ========================================================================== */
click('#btn-home'); await tick();
click('.fn-card[data-category="linear"]'); await tick();

// --- Konkreter Term unter der Gleichung ---
const termLine = () => $('#equations [data-value="0"]');
expect(termLine(), 'Zweite Zeile mit dem Term steht da');
expect(/f\(x\)\s*=/.test(termLine().textContent), 'Term nennt die Funktion');
{
  const before = termLine().textContent;
  const sl = $('#slider-m');
  sl.value = '3';
  sl.dispatchEvent(new window.Event('input', { bubbles: true }));
  await tick(); await tick();
  expect(termLine().textContent !== before, 'Term folgt dem Regler sofort');
}
click('#opt-showTerm'); await tick();
expect(termLine().hidden, 'Ausgeschaltet verschwindet nur die Zahlenzeile');
expect(!$('#equations [data-curve="0"]').hidden, 'Die Struktur mit den Buchstaben bleibt stehen');
click('#opt-showTerm'); await tick();

// --- Kurve festhalten ---
click('#btn-freeze'); await tick();
expect($('#btn-freeze').getAttribute('aria-pressed') === 'true', 'Vergleichskurve ist festgehalten');
click('#btn-freeze'); await tick();
expect($('#btn-freeze').getAttribute('aria-pressed') === 'false', 'Vergleich laesst sich wieder loesen');

// --- Spur ---
click('#opt-trail'); await tick();
{
  const sl = $('#slider-b');
  for (const v of ['1', '2', '3']) {
    sl.value = v;
    sl.dispatchEvent(new window.Event('input', { bubbles: true }));
    await tick();
  }
  expect(!$('#btn-clear-trail').hidden, 'Die Spur meldet sich mit dem Loeschknopf');
  click('#btn-clear-trail'); await tick();
  expect($('#btn-clear-trail').hidden, 'Spur laesst sich loeschen');
}
click('#opt-trail'); await tick();

// --- Sekante ---
expect($('#secant-row').hidden, 'Sekantenregler ist zunaechst verborgen');
click('#opt-secant'); await tick();
if (LITE) {
  expect($('#secant-row').hidden, 'Lite: Sekante bleibt gesperrt');
  expect(!$('#opt-secant').checked, 'Lite: der Schalter springt zurueck');
  expect($('#pro-dialog').open, 'Lite: Pro-Hinweis erscheint zur Sekante');
  $('#pro-dialog').close('cancel'); await tick();
} else {
  expect(!$('#secant-row').hidden, 'Pro: Sekantenregler erscheint');
  const h = $('#secant-h');
  h.value = '1.5';
  h.dispatchEvent(new window.Event('input', { bubbles: true }));
  await tick();
  expect($('#secant-value').textContent.includes('1,5') || $('#secant-value').textContent.includes('1.5'),
         'Der Wert von h wird angezeigt');
  expect($('#readout').textContent.length > 0, 'Der Differenzenquotient steht im Ablesefeld');
  click('#btn-h-zero'); await tick();
  click('#opt-secant'); await tick();
  expect($('#secant-row').hidden, 'Ausgeschaltet verschwindet der Regler wieder');
}

// --- Tabelle und Graph verkoppeln ---
click('#tab-btn-table'); await tick();
click('#btn-gen-table'); await tick();
{
  const rows = $$('#values-table tbody tr');
  expect(rows.length > 3, 'Wertetabelle ist gefuellt');
  click(rows[2]); await tick();
  expect($('#opt-trace').checked, 'Ein Tippen auf die Zeile schaltet das Verfolgen ein');
  expect($$('#values-table tbody tr').filter(r => r.classList.contains('is-marked')).length === 1,
         'Genau eine Zeile ist markiert');
  expect(!$('#value-strip').hidden, 'Der Wertestreifen erscheint');
  expect($('#value-strip').children.length === 5, 'Fuenf Werte im Streifen');
  click('#opt-trace'); await tick();
  expect($('#value-strip').hidden, 'Ohne Verfolgen kein Streifen');
  expect($$('#values-table tbody tr').every(r => !r.classList.contains('is-marked')),
         'Und keine markierte Zeile mehr');
}
click('#tab-btn-explorer'); await tick();

// --- Ziehpunkte: der naechstliegende gewinnt ---
{
  const list = window.MFE.math.FUNCTIONS.linear.handles({ m: 1, b: 0 }, 0.05);
  expect(list[1].x >= 2.5, 'Der Einheitspunkt rueckt bei grobem Massstab weiter weg');
  const patch = list[1].set(list[1].x, 5.2);
  expect(Math.abs(patch.m - 5.2 / list[1].x) < 1e-9, 'Die Steigung wird an der neuen Stelle richtig berechnet');
  const nah = window.MFE.math.FUNCTIONS.linear.handles({ m: 1, b: 0 }, 0);
  expect(nah[1].x === 1, 'Ohne Massstabsangabe bleibt es beim Einheitspunkt x = 1');
}

// --- Fehlvorstellungen: Ablenker und Diagnose ---
{
  const correct = { m: 2, b: 3 };
  const dis = window.MFE.quiz.makeDistractors('linear', correct, 3);
  expect(dis.length === 3, 'Drei Ablenker');
  expect(dis.every(d => d.m !== correct.m || d.b !== correct.b), 'Kein Ablenker ist die richtige Antwort');
  const texts = new Set(dis.map(d => window.MFE.quiz.eqText('linear', d)));
  expect(texts.size === 3, 'Die Ablenker unterscheiden sich sichtbar voneinander');

  const dg = window.MFE.quiz.diagnose('linear', { m: 2, b: -3 }, correct);
  expect(dg.length > 0, 'Vorzeichenfehler wird benannt');
  const swap = window.MFE.quiz.diagnose('linear', { m: 3, b: 2 }, correct);
  expect(swap.length > 0, 'Vertauschung wird benannt');
  expect(window.MFE.quiz.diagnose('linear', correct, correct) === '',
         'Die richtige Antwort erzeugt keine Fehlermeldung');
}

// --- Ueben: zweiter Versuch und halbe Punkte ---
click('#tab-btn-quiz'); await tick();
{
  const tiles = $$('#quiz-options .quiz-opt');
  expect(tiles.length === 4, 'Vier Antwortkacheln');
  expect(tiles.every(b => b.querySelector('.opt-shape')), 'Jede Kachel traegt eine Form');
  expect(tiles.every(b => (b.getAttribute('aria-label') || '').length > 2),
         'Jede Kachel hat eine vorlesbare Beschriftung');
  click(tiles[0]); await tick();
  if (!tiles[1].disabled) {
    // Erster Versuch war falsch: es geht weiter.
    expect($('#quiz-feedback').textContent.length > 0, 'Der erste Fehlversuch bringt einen Hinweis');
    click($$('#quiz-options .quiz-opt').find(b => !b.disabled)); await tick();
  }
  expect($$('#quiz-options .quiz-opt').every(b => b.disabled), 'Nach dem zweiten Versuch ist gesperrt');
  expect($('#quiz-total').textContent === '1', 'Genau eine Aufgabe gezaehlt');
}

// --- Wettkampf ---
click('#quiz-modes [data-mode="race"]'); await tick();
expect(!$('#mode-race').hidden, 'Wettkampf ist offen');
expect($('#mode-match').hidden && $('#mode-build').hidden, 'Die anderen Modi sind zu');
click('#btn-race-start'); await tick();
expect(!$('#race-run').hidden, 'Der Wettkampf laeuft');
expect($$('#race-options .quiz-opt').length === 4, 'Vier Kacheln im Wettkampf');
expect($('#race-progress').textContent.length > 0, 'Der Fortschritt steht da');
click($$('#race-options .quiz-opt')[0]); await tick();
expect($$('#race-options .quiz-opt').every(b => b.disabled), 'Im Wettkampf gibt es keinen zweiten Versuch');
expect($('#race-feedback').textContent.length > 0, 'Rueckmeldung auch im Wettkampf');
click('#btn-race-stop'); await tick();
expect($('#race-run').hidden, 'Abbrechen beendet den Wettkampf');
expect(!$('#race-start-box').hidden, 'Danach steht der Startknopf wieder da');

// Ein neuer Durchgang darf nicht mit dem Nachlauf des alten kollidieren.
click('#btn-race-start'); await tick();
click('#btn-race-stop'); await tick();
click('#btn-race-start'); await tick();
await new Promise(r => setTimeout(r, 60));
expect($('#race-progress').textContent.includes('1'), 'Ein neuer Wettkampf beginnt bei Aufgabe 1');

// Ein laufender Wettkampf darf beim Verlassen nicht weiterlaufen.
click('#btn-home'); await tick();
expect($('#race-run').hidden, 'Der Wettkampf endet beim Verlassen des Bildschirms');

// --- Stand pro Funktionsklasse ---
{
  const prog = JSON.parse(window.localStorage.getItem('mfe:progress') || '{}');
  expect(prog.linear && prog.linear.n > 0, 'Der Stand wird mitgeschrieben');
  expect(prog.linear.ok <= prog.linear.n, 'Nie mehr richtige als gestellte Aufgaben');
}

click('.fn-card[data-category="linear"]'); await tick();
click('#tab-btn-quiz'); await tick();
click('#btn-progress-reset'); await tick();
expect(window.localStorage.getItem('mfe:progress') === null, 'Der Stand laesst sich zuruecksetzen');
click('#tab-btn-explorer'); await tick();

/* ==========================================================================
   diagnose.js: Einbindung, Fehleranalyse, Fehlersuch-Modus
   --------------------------------------------------------------------------
   Diese Pruefungen gibt es, weil die Datei einmal komplett abgehaengt war -
   nicht geladen, ohne Texte, nicht im Service Worker, nicht im Build. Kein
   einziger Test hat das gemerkt.
   ========================================================================== */
expect(typeof window.MFE.diagnose === 'object', 'diagnose.js ist geladen');
for (const fn of ['makeTrap', 'analyseBuild', 'sampleTable', 'forForm']) {
  expect(typeof window.MFE.diagnose[fn] === 'function', `diagnose.${fn}() vorhanden`);
}

// Die Helfer, die diagnose.js aus MFE.math bezieht
expect(typeof window.MFE.math.tolerance === 'function', 'MFE.math.tolerance() vorhanden');
{
  const tol = window.MFE.math.tolerance;
  expect(tol(0, 0.5) > 0, 'Toleranz ist immer positiv');
  expect(tol(3, 0.5) >= 0.25, 'Toleranz mindestens eine halbe Schrittweite');
  expect(tol(120, 1) <= 1, 'Toleranz bleibt gedeckelt');
  expect(Number.isFinite(tol(2)), 'Toleranz auch ohne Schrittweite');
}
{
  const F = window.MFE.math.FUNCTIONS;
  expect(Array.isArray(F.linear.shiftParams), 'shiftParams sind gesetzt');
  expect(F.quad_vertex.shiftParams.includes('d'), 'd verschiebt bei der Scheitelpunktform');
  expect(!F.quad_vertex.shiftParams.includes('a'), 'a verschiebt nicht');
  // Jeder Eintrag muss ein echter Parameter der Form sein.
  for (const [name, d] of Object.entries(F)) {
    const ids = d.params.map(p => p.id);
    expect(d.shiftParams.every(id => ids.includes(id)), `shiftParams von ${name} sind echte Parameter`);
  }
}

// Jede Fehlvorstellung im Katalog braucht einen Erklaerungstext.
{
  const src = readFileSync(path.join(ROOT, 'js/diagnose.js'), 'utf8');
  const ids = [...new Set([...src.matchAll(/mis: '([\w.]+)'/g)].map(m => m[1]))];
  expect(ids.length > 10, 'Der Fehlvorstellungskatalog ist gefuellt');
  const fehlend = ids.filter(id => window.MFE.i18n.t('why.' + id) === 'why.' + id);
  expect(fehlend.length === 0, 'Jede Fehlvorstellung hat eine Erklaerung: ' + fehlend.join(', '));
  // Und jeder Befund der Nachbau-Analyse ebenso.
  const kinds = ['swapped', 'sign', 'shiftDirection', 'doubled', 'halved', 'reciprocal', 'tooHigh', 'tooLow'];
  const fehlend2 = kinds.filter(k => window.MFE.i18n.t('find.' + k) === 'find.' + k);
  expect(fehlend2.length === 0, 'Jeder Befund hat einen Text: ' + fehlend2.join(', '));
}

// analyseBuild erkennt die klassischen Fehler
{
  const A = window.MFE.diagnose.analyseBuild;
  expect(A('linear', { m: 2, b: 3 }, { m: 3, b: 2 }).findings[0].kind === 'swapped',
         'Vertauschte Parameter werden erkannt');
  expect(A('linear', { m: 2, b: 3 }, { m: 2, b: -3 }).findings[0].kind === 'shiftDirection',
         'Falsche Verschieberichtung wird als solche erkannt, nicht nur als Vorzeichenfehler');
  expect(A('linear', { m: 2, b: 3 }, { m: -2, b: 3 }).findings[0].kind === 'sign',
         'Vorzeichenfehler bei der Steigung');
  expect(A('linear', { m: 2, b: 3 }, { m: 4, b: 3 }).findings[0].kind === 'doubled',
         'Verdoppelter Wert');
  expect(A('linear', { m: 2, b: 3 }, { m: 2, b: 3 }).solved, 'Richtiger Nachbau gilt als geloest');
}

// Der Fehlersuch-Modus haengt an der Oberflaeche
click('#btn-home'); await tick();
// Bewusst eine Klasse, die es in beiden Ausgaben gibt - sonst haengt der
// Test an der Lizenzabfrage statt am Fehlersuch-Modus.
click('.fn-card[data-category="linear"]'); await tick();
click('#tab-btn-quiz'); await tick();
click('#quiz-modes [data-mode="trap"]'); await tick();
expect(!$('#mode-trap').hidden, 'Fehlersuche ist offen');
expect($('#mode-match').hidden && $('#mode-race').hidden, 'Die anderen Modi sind zu');
expect($('#trap-prompt').textContent.length > 0, 'Es steht eine Frage da');
expect(!$('#trap-prompt').textContent.startsWith('mis.'), 'Die Frage ist uebersetzt');
{
  const tiles = $$('#trap-options .quiz-opt');
  expect(tiles.length >= 2, 'Es gibt Antwortmoeglichkeiten');
  expect(tiles.every(b => !b.textContent.startsWith('mis.')), 'Alle Antworten sind uebersetzt');
  click(tiles[0]); await tick();
  expect(tiles.every(b => b.disabled), 'Nach der Antwort ist gesperrt');
  const fb = $('#trap-feedback').textContent;
  expect(fb.length > 0, 'Es gibt eine Rueckmeldung');
  expect(!fb.startsWith('why.'), 'Die Erklaerung ist uebersetzt, kein roher Schluessel');
}
expect(!$('#trap-note').hidden, 'Der Merksatz erscheint nach der Antwort');
expect(!$('#trap-note').textContent.startsWith('note.'), 'Der Merksatz ist uebersetzt');
expect($('#trap-note').getAttribute('aria-live') === 'polite', 'Der Merksatz wird vorgelesen');
click('#btn-trap-new'); await tick();
expect($$('#trap-options .quiz-opt').every(b => !b.disabled), 'Die naechste Aufgabe ist wieder anklickbar');
expect($('#trap-note').hidden, 'Bei der neuen Aufgabe ist der Merksatz wieder weg');


/* --- Ausschnitt im Ueben-Reiter (Variante C) ------------------------------
   Anlass: Zuordnen und Nachbauen benutzten den Ausschnitt des Explorers.
   Wer dort hineingezoomt hatte, bekam die Aufgabe unbrauchbar vorgesetzt.
   Unbehandelte Ausnahmen lassen den Lauf ohnehin fehlschlagen - hier wird
   deshalb geprueft, was sich tatsaechlich beobachten laesst. */

// Die reine Rechnung zuerst, ohne Oberflaeche.
{
  const { zoomView } = window.MFE.graph;
  const v0 = window.MFE.quiz.viewFor('linear');
  expect(v0.xMax > v0.xMin && v0.yMax > v0.yMin, 'Der Standardausschnitt ist gueltig');

  const nah = zoomView(v0, 0.8, 0, 0);
  expect(nah.xMax - nah.xMin < v0.xMax - v0.xMin, 'Hineinzoomen verkleinert die Spannweite');
  const weit = zoomView(v0, 1.25, 0, 0);
  expect(weit.xMax - weit.xMin > v0.xMax - v0.xMin, 'Herauszoomen vergroessert sie');

  // Der Mittelpunkt bleibt stehen, es wird nicht verschoben.
  const mitte = (v) => (v.xMin + v.xMax) / 2;
  expect(Math.abs(mitte(zoomView(v0, 0.8, mitte(v0), 0)) - mitte(v0)) < 1e-9,
         'Zoomen um die Mitte verschiebt den Ausschnitt nicht');

  // Beliebig oft klicken darf den Ausschnitt nicht unbrauchbar machen.
  let eng = v0, weit2 = v0;
  for (let i = 0; i < 40; i++) {
    eng = zoomView(eng, 0.8, 0, 0);
    weit2 = zoomView(weit2, 1.25, 0, 0);
  }
  expect(eng.xMax - eng.xMin > 0, 'Auch nach 40 Klicks bleibt eine Spannweite uebrig');
  expect(Number.isFinite(weit2.xMin) && Number.isFinite(weit2.xMax), 'Und sie bleibt endlich');

  // Der Massstab gegenueber dem Standard - Grundlage der Zoomgrenzen im Quiz.
  const { zoomFactorOf } = window.MFE.graph;
  expect(Math.abs(zoomFactorOf(v0, v0) - 1) < 1e-9, 'Der Standard hat den Massstab 1');
  expect(zoomFactorOf(v0, weit) > 1, 'Herausgezoomt ist der Massstab groesser als 1');
  expect(zoomFactorOf(v0, nah) < 1, 'Hineingezoomt kleiner als 1');
  expect(zoomFactorOf({ xMin: 0, xMax: 0 }, v0) === 1, 'Entarteter Ausschnitt liefert 1 statt Unendlich');
  expect(zoomFactorOf(v0, zoomView(v0, 2, 0, 0)) > 1.9, 'Der Massstab folgt dem Zoomfaktor');
  expect(!!zoomView(window.MFE.quiz.viewFor('sinus'), 0.8, 0, 0).piAxis,
         'Die pi-Teilung ueberlebt das Zoomen');
}

// Und jetzt an der Oberflaeche: der Explorer darf die Aufgabe nicht mehr verstellen.
click('#btn-home'); await tick();
click('.fn-card[data-category="linear"]'); await tick();
for (let i = 0; i < 6; i++) { click('#btn-zoom-in'); await tick(); }
click('#tab-btn-quiz'); await tick();
click('#quiz-modes [data-mode="match"]'); await tick();

expect($$('#mode-match .view-mini [data-act]').length === 3, 'Drei Knoepfe: hinein, heraus, zurueck');
expect(!$('#mode-race').querySelector('.view-mini'), 'Im Wettkampf bewusst keine Zoomknoepfe');
for (const m of ['match', 'build', 'trap']) {
  expect($(`#mode-${m} .view-mini`), `Ausschnitt-Bedienung im Modus ${m}`);
  expect($(`#mode-${m} .view-mini`).dataset.mode === m, `Der Baustein in ${m} kennt seinen Modus`);
}
// Jeder Knopf muss vorlesbar sein - es sind reine Symbole.
for (const b of $$('#mode-match .view-mini [data-act]')) {
  expect((b.getAttribute('aria-label') || '').length > 1, 'Zoomknopf hat eine Beschriftung');
}

click('#mode-match .view-mini [data-act="in"]'); await tick();
click('#mode-match .view-mini [data-act="home"]'); await tick();
click('#quiz-modes [data-mode="build"]'); await tick();
click('#mode-build .view-mini [data-act="in"]'); await tick();
click('#btn-new-task'); await tick();
click('#quiz-modes [data-mode="trap"]'); await tick();
click('#mode-trap .view-mini [data-act="out"]'); await tick();
click('#btn-trap-new'); await tick();
click('#quiz-modes [data-mode="match"]'); await tick();

/* --- Ausschnitt-Bedienung: Baustein, Finger, Abspieler, Editor ------------
   Der Baustein aus graph.js wird an vier Stellen benutzt. Geprueft wird er
   hier direkt - mit einem Ausschnitt, den der Test selbst haelt. */
{
  const { bindViewControl } = window.MFE.graph;
  const base = window.MFE.quiz.viewFor('linear');
  let view = null;
  const cv = window.document.createElement('canvas');
  window.document.body.append(cv);
  // Ein Graph, der so tut, als sei er vermessen.
  const fakeGraph = { ready: true, px2x: (px) => px / 10, py2y: (py) => -py / 10 };
  const ctl = bindViewControl(cv, {
    graph: () => fakeGraph, base: () => base,
    get: () => view, set: (v) => { view = v; }, min: 0.2, max: 4
  });

  expect(typeof ctl.apply === 'function' && typeof ctl.destroy === 'function',
         'Der Baustein liefert apply() und destroy()');
  expect(cv.getAttribute('tabindex') === '0', 'Das Canvas wird tastaturbedienbar gemacht');

  const span = (v) => (v ? v.xMax - v.xMin : base.xMax - base.xMin);
  const start = span(base);
  ctl.apply('in');
  expect(span(view) < start, 'Knopf hinein verkleinert den Ausschnitt');
  ctl.apply('out'); ctl.apply('out');
  expect(span(view) > start, 'Knopf heraus vergroessert ihn');
  ctl.apply('home');
  expect(view === null, 'Der Haus-Knopf stellt den Standard wieder her');

  // Grenzen: beliebig oft druecken darf nicht aus dem Bereich fuehren.
  for (let i = 0; i < 30; i++) ctl.apply('in');
  expect(span(view) / start >= 0.2 - 1e-9, 'Die untere Zoomgrenze haelt');
  ctl.apply('home');
  for (let i = 0; i < 30; i++) ctl.apply('out');
  expect(span(view) / start <= 4 + 1e-9, 'Die obere Zoomgrenze haelt');
  ctl.apply('home');

  // Tastatur
  const key = (k) => cv.dispatchEvent(new window.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
  key('+');
  expect(span(view) < start, 'Plus auf der Tastatur zoomt hinein');
  key('0');
  expect(view === null, 'Die Null stellt den Standard her');

  // Zwei Finger: aufsetzen, auseinanderziehen, absetzen
  const touch = (type, id, x, y) => cv.dispatchEvent(new window.PointerEvent(type, {
    pointerId: id, pointerType: 'touch', clientX: x, clientY: y, bubbles: true, cancelable: true
  }));
  touch('pointerdown', 1, 100, 100);
  touch('pointerdown', 2, 140, 100);
  touch('pointermove', 2, 220, 100);          // Finger weiter auseinander
  expect(view && span(view) < start, 'Zwei Finger auseinander zoomt hinein');
  touch('pointerup', 1, 100, 100);
  touch('pointerup', 2, 220, 100);

  // Nach dem Abmelden darf nichts mehr passieren.
  ctl.apply('home');
  ctl.destroy();
  const vorher = view;
  key('+');
  expect(view === vorher, 'Nach destroy() reagiert die Tastatur nicht mehr');
  cv.remove();
}

// Eigene Quizze: Abspieler und Editor haben dieselbe Bedienung.
// In Lite ist der Editor gesperrt - dann faellt dieser Abschnitt aus.
click('#btn-home'); await tick();
click('#card-quizzes'); await tick();
if (LITE) {
  expect($('#pro-dialog').open, 'Lite: der Quiz-Editor ist gesperrt');
  $('#pro-dialog').close('cancel'); await tick();
} else {
{
  const quizzes = window.MFE.quiz.loadAll();
  expect(Array.isArray(quizzes), 'Quizliste ist lesbar');
}
click('#btn-new-quiz'); await tick();
click('#btn-add-task'); await tick();
expect($('#editor-canvas'), 'Der Editor zeigt eine Vorschau');
expect($('#editor-canvas').closest('.canvas-with-view'), 'Die Vorschau steckt im Rahmen mit Bedienung');
expect($$('#editor-canvas ~ .view-mini [data-act]').length === 3
       || $$('.canvas-with-view .view-mini [data-act]').length >= 3,
       'Der Editor hat die drei Knoepfe');
click('#btn-editor-save'); await tick();
}

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
  expect(cards.length === 9, `dazu Quiz-Baukasten und Lernpfade, also neun Sperren insgesamt (${cards.length})`);
  expect(cards.every(c => c.classList.contains('is-locked')), 'alle gesperrten Karten tragen die Kennzeichnung');
  expect(cards.every(c => c.getAttribute('aria-disabled') === 'true'), 'und sind als gesperrt ausgezeichnet');
  expect($$('.fn-card:not([data-feature])').length === 5,
         'frei bleiben zwei Funktionsklassen, "Weitere", Ueben und die Info-Karte');
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

// --- Startseite: feste Reihenfolge, auch nach Sprachwechsel ----------------
click('#btn-home'); await tick();
{
  click('#btn-lang-en'); await tick();
  click('#btn-lang-de'); await tick();
  const cats = Array.from($('.fn-grid-main').children).map(c => c.dataset.category || c.id);
  expect(cats.join(',') === 'linear,quadratic,exponential,trig,btn-more-fns',
         'die Reihenfolge bleibt fachlich, gesperrte Karten werden nicht umsortiert');
  const cards = $$('.fn-card[data-category]');
  if (LITE) {
    expect(cards.filter(c => c.classList.contains('is-locked')).length === 7, 'Lite: sieben Karten mit Pro-Abzeichen');
  } else {
    expect(cards.every(c => !c.classList.contains('is-locked')), 'Pro: nichts ist gesperrt');
  }
}

// --- Kaufzustand vor deviceready -------------------------------------------
if (LITE) {
  expect(window.MFE.billing.status() === 'missing', 'iOS ohne geladenes Plugin: Kauf noch nicht bereit');
  expect(!window.MFE.licence.isFull(), 'iOS ohne Kauf: kostenloser Umfang');
} else {
  expect(window.MFE.billing.status() === 'web', 'Browser: kein Kauf, Status "web"');
  expect(window.MFE.licence.isFull(), 'Browser: voller Umfang ohne Kauf');
}

// --- Fassungsnummer sichtbar ----------------------------------------------
click('#btn-home'); await tick();
click('#card-info'); await tick();
{
  const line = $('#info-version').textContent;
  expect(/\d+\.\d+\.\d+/.test(line), `die Info-Seite nennt die Fassung ("${line}")`);
  expect(line.includes(LITE ? 'kostenlos' : 'voller Umfang'), `und den Umfang ("${line}")`);
  expect($('#info-lite-box').hidden === !LITE, 'Kaufen/Wiederherstellen nur in der App ohne Kauf');
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
  const prevCordova = window.cordova;
  window.cordova = prevCordova || { platformId: 'android' };
  window.MFE.app?.registerServiceWorker?.();
  await new Promise(r => setTimeout(r, 30));
  expect(unregistered.length === 1, 'ein vorhandener Service Worker wird in der App abgemeldet');
  window.cordova = prevCordova;
}

// --- Weitere Klassen und Uebungskarte ------------------------------------
click('#btn-home'); await tick();
{
  click('#btn-more-fns'); await tick();
  click('.fn-card[data-category="absolute"]'); await tick();
  if (LITE) {
    expect($('#pro-dialog').open, 'Lite: weitere Klasse zeigt den Pro-Hinweis');
    $('#pro-dialog').close('cancel'); await tick(); await tick();
  } else {
    expect($('#screen-app').classList.contains('is-active'), 'eine weitere Klasse oeffnet den Explorer');
    expect($('#screen-app').dataset.cat === 'more', 'und traegt die Farbe der weiteren Klassen');
    expect($('#cat-badge').textContent === 'Betragsfunktionen', 'das Abzeichen nennt die Klasse');
    click('#btn-home'); await tick();
  }
  click('.fn-card[data-category="exponential"]'); await tick();
  expect($('#screen-app').dataset.cat === 'exponential', 'Exponentialfunktion: eigene Klassenfarbe');
  {
    const ev = $('.equation-value');
    expect(ev.querySelector('sup')?.textContent === 'x', 'Gleichung mit Zahlen: x steht hochgestellt, kein Dach-Zeichen');
    expect(!ev.querySelector('[aria-hidden="true"]').textContent.includes('^'), 'sichtbar steht kein "^"');
    expect(ev.querySelector('.sr-only').textContent.includes('^x'), 'vorgelesen wird weiter "hoch x"');
  }
  click('#btn-home'); await tick();
  expect($('#card-practice-desc').textContent.includes('Exponential'), 'die Uebungskarte folgt der Klasse');
  click('#card-practice'); await tick();
  expect($('#screen-app').classList.contains('is-active') && $('#tab-quiz').classList.contains('is-active'),
         'die Uebungskarte oeffnet den Uebungsteil');
  click('#btn-home'); await tick();
  click('.fn-card[data-category="linear"]'); await tick();
}

// --- Wertetabelle: farbiger Knopf unter dem Graphen ----------------------
{
  const app = $('#screen-app');
  const btn = $('#btn-table-toggle');
  expect(!app.classList.contains('is-split'), 'schmal: kein geteiltes Layout');
  expect(btn && btn.dataset.mode === 'tab', 'schmal: der Knopf fuehrt zum Reiter');
  expect(!btn.hasAttribute('aria-pressed'), 'schmal: kein Umschalter, also kein aria-pressed');
  click(btn); await tick();
  expect($('#tab-table').classList.contains('is-active'), 'schmal: Klick oeffnet den Reiter Wertetabelle');
  click('#tab-btn-explorer'); await tick();

  setWide(true); await tick();
  expect(!app.classList.contains('is-split'), 'breit: zu Beginn steht die Tabelle NICHT daneben');
  expect(btn.dataset.mode === 'toggle' && btn.getAttribute('aria-pressed') === 'false', 'breit: der Knopf ist ein Umschalter, aus');
  expect(!$('#tab-btn-table').hidden, 'breit, Tabelle aus: der Reiter bleibt');

  click(btn); await tick();
  expect(app.classList.contains('is-split'), 'Knopf: Graph und Tabelle stehen nebeneinander');
  expect(btn.getAttribute('aria-pressed') === 'true' && btn.classList.contains('is-on'), 'und der Knopf zeigt "an"');
  expect($('#values-table tbody').children.length > 0, 'und die Tabelle ist gefuellt');
  expect($('#tab-btn-table').hidden, 'der doppelte Reiter verschwindet, solange die Tabelle daneben steht');

  // Im Uebungsreiter ergibt die Tabelle daneben keinen Sinn
  click('#tab-btn-quiz'); await tick();
  expect(!app.classList.contains('is-split'), 'im Uebungsteil kein geteiltes Layout');
  expect(!$('#tab-btn-table').hidden, 'und der Reiter Wertetabelle ist wieder da');
  click('#tab-btn-explorer'); await tick();
  expect(app.classList.contains('is-split'), 'zurueck im Explorer wieder geteilt');

  // Gemerkt wird es
  await new Promise(r => setTimeout(r, 450));
  expect(JSON.parse(window.localStorage.getItem('mfe:v3')).split === true, 'die Wahl wird gespeichert');

  click(btn); await tick();
  expect(!app.classList.contains('is-split'), 'zweiter Klick: wieder einspaltig');
  click(btn); await tick();
  setWide(false); await tick();
  expect(!app.classList.contains('is-split'), 'wird der Bildschirm schmal, klappt es zusammen');
  expect(!$('#tab-btn-table').hidden, 'und der Reiter ist wieder erreichbar');
  click(btn); await tick();                 // zurueck auf aus fuer die folgenden Pruefungen
  click('#tab-btn-explorer'); await tick();
}

// --- Vollbild --------------------------------------------------------------
{
  const panel = $('#tab-explorer .canvas-panel');
  const d0 = window.MFE.nav.depth;
  click('#btn-fs-label'); await tick();
  expect(panel.classList.contains('is-fullscreen'), 'Vollbild: der Graph legt sich ueber alles');
  expect(window.document.documentElement.classList.contains('is-fs'), 'und die Seite scrollt nicht mehr');
  expect(window.MFE.nav.depth === d0 + 1, 'Vollbild hat einen eigenen Verlaufseintrag');
  expect($('#btn-fs-text').textContent === 'Vollbild beenden', 'der Knopf heisst jetzt "Vollbild beenden"');
  expect($('#btn-fs').getAttribute('aria-pressed') === 'true', 'auch das Symbol am Graphen zeigt "an"');
  expect(!$('#btn-fs-panel').hidden, 'im Vollbild gibt es den Knopf fuer Gleichung und Regler');

  click('#btn-fs-panel'); await tick();
  expect(panel.classList.contains('fs-panel-hidden'), 'Regler lassen sich wegklappen');
  expect(window.getComputedStyle($('#tab-explorer .live-panel')).display === 'none', 'und sind dann weg');
  click('#btn-fs-panel'); await tick();
  expect(!panel.classList.contains('fs-panel-hidden'), 'und wieder einblenden');

  // Zurueck schliesst das Vollbild, nicht den Explorer
  await back();
  expect(!panel.classList.contains('is-fullscreen'), 'Zurueck beendet das Vollbild');
  expect($('#screen-app').classList.contains('is-active'), 'und bleibt im Explorer');
  expect(window.MFE.nav.depth === d0, 'ohne einen Eintrag zu verschlucken');

  // Esc
  click('#btn-fs'); await tick();
  window.document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await tick(); await tick();
  expect(!panel.classList.contains('is-fullscreen'), 'Esc beendet das Vollbild');
  expect(window.MFE.nav.depth === d0, 'Esc nimmt den Verlaufseintrag mit heraus');

  // Ein Dialog ueber dem Vollbild: Zurueck schliesst zuerst den Dialog
  click('#btn-fs'); await tick();
  click('#equations [data-param]'); await tick();
  expect($('#param-dialog').open, 'im Vollbild laesst sich der Parameter-Dialog oeffnen');
  await back();
  expect(!$('#param-dialog').open && panel.classList.contains('is-fullscreen'),
         'Zurueck schliesst erst den Dialog, das Vollbild bleibt');
  // Dialog ueber seinen eigenen Knopf schliessen: wie im Browser feuert dabei
  // "close", und nav.js nimmt den Dialog-Eintrag per history.back() heraus.
  // Das darf das Vollbild darunter NICHT mitreissen.
  click('#equations [data-param]'); await tick();
  expect($('#param-dialog').open, 'Dialog im Vollbild ein zweites Mal geoeffnet');
  $('#param-dialog').close('cancel');
  $('#param-dialog').dispatchEvent(new window.Event('close'));
  await tick(); await tick();
  expect(panel.classList.contains('is-fullscreen'), 'Dialog per Knopf geschlossen: das Vollbild bleibt');
  expect(window.MFE.nav.layers.join() === 'fullscreen', 'und seine Ebene ebenso');

  click('#btn-fs'); await tick(); await tick();
  expect(!panel.classList.contains('is-fullscreen'), 'Symbol am Graphen beendet das Vollbild');
  expect(window.MFE.nav.depth === d0, 'Verlaufstiefe stimmt nach allem wieder');

  // Bildschirmwechsel waehrend des Vollbilds darf nichts haengen lassen
  click('#btn-fs'); await tick();
  click('#btn-home'); await tick();
  expect(!panel.classList.contains('is-fullscreen') && !window.document.documentElement.classList.contains('is-fs'),
         'beim Verlassen des Explorers endet das Vollbild');
  expect(!window.MFE.nav.layers.length, 'und keine Ebene bleibt offen');
  click('.fn-card[data-category="linear"]'); await tick();
}

// --- Voreinstellungen beim Oeffnen einer Klasse ----------------------------
{
  for (const id of ['#opt-helpers', '#opt-roots', '#opt-trace']) {
    const el = $(id);
    el.checked = true;
    el.dispatchEvent(new window.Event('change', { bubbles: true }));
  }
  $('#opt-showTerm').checked = false;
  $('#opt-showTerm').dispatchEvent(new window.Event('change', { bubbles: true }));
  await tick();
  click('#btn-home'); await tick();
  click('.fn-card[data-category="exponential"]'); await tick();
  const on = Object.keys({ helpers: 1, roots: 1, yint: 1, vertex: 1, drag: 1, intersections: 1,
    derivative: 1, tangent: 1, trace: 1, secant: 1, trail: 1, locus: 1 }).filter(k => $('#opt-' + k).checked);
  expect(!on.length, `neue Klasse von der Startseite: alle Anzeigen aus (${on.join(',') || 'keine an'})`);
  expect($('#opt-showTerm').checked, 'ausser der Gleichung mit Zahlen');
  expect(!$('.equation-value').hidden, 'die Gleichung mit Zahlen ist sichtbar');
  // Leere Gruppen bleiben nicht als Ueberschrift stehen
  const groups = $$('.chip-group');
  expect(groups.length === 4, `vier Schaltergruppen (${groups.length})`);
  expect(groups.every(g => g.hidden || g.querySelector('.chip:not([hidden])')), 'keine sichtbare Gruppe ist leer');
  click('#btn-home'); await tick();
  click('.fn-card[data-category="linear"]'); await tick();
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
  const mustHide = ['#update-bar', '#btn-fs-panel', '#more-fns', '#info-lite-box', '#backup-file',
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

/* ---- Lernpfade -----------------------------------------------------------
   Der ganze Weg, so wie eine Schuelerin ihn geht: Uebersicht, Vermutung,
   Auftraege mit dem Regler, Merkkasten, Uebungsrunde, Ergebnis. Dazu Test
   statt Lernen, Rueckverweis nach Fehlern, Sprachwechsel mitten im Schritt
   und der Zurueck-Knopf. Geklickt wird ueber die Oberflaeche, nicht ueber
   die Schnittstelle - nur so faellt ein toter Knopf auf. */
const LP = window.MFE.paths;
const lesson = () => LP.lesson;
const act = (name) => $(`#lesson-actions [data-act="${name}"]`);
const lessonActive = () => $('#screen-lesson').classList.contains('is-active');
const learnActive = () => $('#screen-learn').classList.contains('is-active');

/** Wert in das Zahlenfeld eines Reglers tippen und bestaetigen. */
function typeParam(id, v) {
  const f = $('#lp-val-' + id);
  if (!f) { errors.push(`Regler ${id} im Lernpfad fehlt`); return; }
  f.value = String(v).replace('.', ',');
  f.dispatchEvent(new window.Event('change', { bubbles: true }));
}

/** Aktuelle Uebungsaufgabe beantworten. wrongFirst: erst falsch, dann richtig. */
async function answer({ right = true, wrongFirst = false } = {}) {
  const L0 = lesson();
  const task = L0.task;
  if (task.type === 'choice') {
    const btns = $$('#lesson-panel .quiz-opt');
    const good = btns.find(b => Number(b.dataset.src) === task.correct);
    const bad = btns.filter(b => Number(b.dataset.src) !== task.correct);
    if (wrongFirst && btns.length > 2) { click(bad[0]); await tick(); }
    if (right) click($$('#lesson-panel .quiz-opt').find(b => Number(b.dataset.src) === task.correct));
    else {
      click($$('#lesson-panel .quiz-opt').find(b => Number(b.dataset.src) !== task.correct && !b.disabled)); await tick();
      const left = $$('#lesson-panel .quiz-opt').find(b => Number(b.dataset.src) !== task.correct && !b.disabled);
      if (left && !lesson().result && act('next') === null) click(left);
    }
    expect(good, 'richtige Antwort ist als Knopf vorhanden');
  } else if (task.type === 'input') {
    const fields = $$('#lesson-panel input[type="text"]');
    const fill = (vals) => fields.forEach((f, i) => { f.value = String(vals[i]).replace('.', ','); });
    if (wrongFirst || !right) { fill(task.answers.map(a => a + 100)); click(act('check')); await tick(); }
    if (right) fill(task.answers);
    click(act('check'));
  } else if (task.type === 'build') {
    if (wrongFirst || !right) { click(act('check')); await tick(); }   // Start ist nie das Ziel
    if (right) for (const id of task.free) typeParam(id, task.target[id]);
    click(act('check'));
  }
  await tick();
}

async function runPractice(opts) {
  const n = lesson().count;
  for (let i = 0; i < n; i++) {
    await answer(typeof opts === 'function' ? opts(i) : opts);
    expect(act('next'), `Aufgabe ${i + 1}: nach der Antwort gibt es "Weiter"`);
    click(act('next')); await tick();
  }
}

if (LITE) {
  click('#btn-home'); await tick();
  expect($('#card-learn').classList.contains('is-locked'), 'iOS ohne Kauf: Lernpfade tragen das Pro-Abzeichen');
  click('#card-learn'); await tick();
  expect($('#pro-dialog').open, 'iOS ohne Kauf: Lernpfade oeffnen den Kauf-Dialog');
  expect(!learnActive(), 'iOS ohne Kauf: die Uebersicht bleibt zu');
  if ($('#pro-dialog').open) { $('#pro-dialog').close('cancel'); await tick(); await tick(); }
  LP.openLesson('quadratic', 0);
  await tick();
  expect(!lessonActive(), 'iOS ohne Kauf: auch der direkte Aufruf eines Schritts ist gesperrt');
  if ($('#pro-dialog').open) { $('#pro-dialog').close('cancel'); await tick(); await tick(); }
} else {
  window.localStorage.removeItem('mfe:paths');
  click('#btn-home'); await tick();
  expect(!$('#card-learn').classList.contains('is-locked'), 'Lernpfade sind im Browser frei');
  click('#card-learn'); await tick();
  expect(learnActive(), 'Lernpfade: Uebersicht geoeffnet');
  const segs = $$('#lp-classes .seg-btn');
  expect(segs.length === 4, `vier Klassen in der Auswahl (${segs.length})`);
  expect(segs.filter(b => !b.disabled).map(b => b.dataset.path).join() === 'quadratic', 'nur die quadratischen Funktionen sind schon da');
  let items = $$('#lp-steps .lp-step');
  expect(items.length === 8, `acht Schritte in der Liste (${items.length})`);
  expect(items[0].classList.contains('st-open') && items.slice(1).every(li => li.classList.contains('st-locked')),
         'am Anfang ist nur Schritt 1 frei');
  // Gesperrte Schritte sind keine Kauffrage: kein PRO-Abzeichen (is-locked)
  expect(!$$('#lp-steps .is-locked').length, 'gesperrte Schritte tragen kein PRO-Abzeichen');
  expect(!$('#btn-lp-continue').hidden && $('#btn-lp-continue').textContent === 'Lernpfad beginnen', 'Knopf "Lernpfad beginnen"');
  expect($('#lp-path-meta').textContent === '0 von 8 Schritten geschafft', `Fortschrittszeile ("${$('#lp-path-meta').textContent}")`);

  // --- Schritt 1: Vermuten -------------------------------------------------
  click('#btn-lp-continue'); await tick();
  expect(lessonActive() && lesson().idx === 0 && lesson().phase === 'predict', 'Schritt 1 beginnt mit der Vermutung');
  expect($('#lesson-stage').hidden, 'beim Vermuten ist der Graph noch verborgen');
  expect($$('#lesson-phases li').length === 4 && $('#lesson-phases li.is-current')?.textContent === 'Vermuten', 'Ablaufleiste mit vier Phasen');
  const step1 = LP.paths.quadratic.steps[0];
  const wrongGuess = $$('#lesson-panel .quiz-opt').find(b =>
    b.querySelector('.opt-text').textContent !== LP.core.txt(step1.predict.options[step1.predict.correct], step1.form));
  click(wrongGuess); await tick();

  // --- Entdecken: Auftraege beim Loslassen --------------------------------
  expect(lesson().phase === 'explore' && !$('#lesson-stage').hidden, 'nach der Vermutung: Entdecken mit Graph');
  expect($('.lp-guess')?.textContent.startsWith('Deine Vermutung'), 'die Vermutung steht ueber dem Graphen');
  const trace = $('#lp-trace');
  expect(trace, 'Schritt 1 hat einen x-Regler fuer den Punkt');
  expect($$('#lesson-sliders .slider-row:not([hidden])').length === 1, 'nur der x-Regler ist sichtbar (keine Parameter)');
  expect($$('.lp-missions li').length === 3 && $('.lp-missions li.is-current'), 'drei Auftraege, der erste ist dran');
  click(act('hint')); await tick();
  expect($('#lesson-feedback').textContent.includes('mit sich selbst'), 'Tipp zum ersten Auftrag erscheint');
  // Ziehen ueber das Ziel hinweg (nur input) zaehlt nicht ...
  trace.value = '2'; trace.dispatchEvent(new window.Event('input', { bubbles: true })); await tick();
  expect(lesson().mission === 0, 'Vorbeiziehen am Ziel erledigt den Auftrag noch nicht');
  // ... erst das Loslassen
  trace.dispatchEvent(new window.Event('change', { bubbles: true })); await tick();
  expect(lesson().mission === 1, 'Loslassen auf dem Ziel erledigt Auftrag 1');
  trace.value = '2'; trace.dispatchEvent(new window.Event('change', { bubbles: true })); await tick();
  expect(lesson().mission === 1, 'dieselbe Stelle zaehlt nicht als "zweite Stelle"');
  trace.value = '-2'; trace.dispatchEvent(new window.Event('input', { bubbles: true }));
  trace.dispatchEvent(new window.Event('change', { bubbles: true })); await tick();
  expect(lesson().mission === 2, 'die gespiegelte Stelle erledigt Auftrag 2');
  trace.value = '0'; trace.dispatchEvent(new window.Event('input', { bubbles: true }));
  trace.dispatchEvent(new window.Event('change', { bubbles: true })); await tick();
  expect(lesson().mission === 3 && act('to-rule'), 'alle Auftraege erledigt: weiter zum Merken');
  expect($('#lesson-feedback').classList.contains('err') && $('#lesson-feedback').textContent.includes('Richtig ist'),
         'falsche Vermutung wird am Ende aufgeloest');
  expect($$('.lp-missions li.is-done').length === 3, 'drei Haken in der Liste');

  // --- Merken -------------------------------------------------------------
  click(act('to-rule')); await tick();
  expect(lesson().phase === 'rule' && $$('.lp-rule li').length === 4, 'Merkkasten mit vier Saetzen');
  expect($('#lesson-stage').hidden, 'beim Merken kein Graph');
  click(act('to-explore')); await tick();
  expect(lesson().phase === 'explore' && lesson().mission === 3, 'zurueck zum Entdecken behaelt die erledigten Auftraege');
  click(act('to-rule')); await tick();

  // --- Ueben: die erste Aufgabe erst falsch, dann richtig -------------------
  click(act('to-practice')); await tick();
  expect(lesson().phase === 'practice' && lesson().count === 5, 'Uebungsrunde mit fuenf Aufgaben');
  expect($('.lp-progress')?.textContent.startsWith('Aufgabe 1 von 5'), 'Fortschritt der Runde wird angezeigt');
  // Bei Wahr/Falsch gibt es keinen zweiten Versuch (wie im Quiz) - dort
  // bleibt es bei der vollen Punktzahl, sonst wird es ein halber Punkt.
  const first = lesson().task;
  const retryable = !(first.type === 'choice' && first.options.length === 2);
  await runPractice((i) => ({ right: true, wrongFirst: i === 0 }));
  expect(lesson().phase === 'result' && lesson().result.passed && lesson().result.score === (retryable ? 4.5 : 5),
         `zweiter Versuch zaehlt halb: ${retryable ? '4,5' : '5'} Punkte (${lesson().result?.score})`);
  expect($('.lp-result.is-pass'), 'Ergebnis "geschafft" sichtbar');
  expect(window.MFE.paths.core.loadStore().quadratic?.q1?.s === 'done', 'Schritt 1 ist gespeichert');
  expect(window.MFE.quiz.loadProgress().quadratic?.n > 0, 'die Lernpfad-Aufgaben zaehlen im Stand der Klasse mit');

  // --- Schritt 2 und Sprachwechsel mitten im Entdecken -----------------------
  click(act('next-step')); await tick();
  expect(lesson().idx === 1 && lesson().phase === 'predict', 'weiter zu Schritt 2');
  click($$('#lesson-panel .quiz-opt')[0]); await tick();
  expect($$('#lesson-sliders .slider-row:not([hidden])').length === 1 && $('#lp-val-e'),
         'Schritt 2: nur der Regler fuer e ist sichtbar');
  typeParam('e', 3); await tick();
  expect(lesson().mission === 1, 'getippter Wert erledigt den Auftrag wie der Regler');
  expect($('#lesson-eq').textContent.includes('x² + 3'), `Gleichung laeuft mit ("${$('#lesson-eq').textContent}")`);
  click('#btn-lang-en'); await tick();
  expect($('#lesson-title').textContent === 'Shifting up and down' && lesson().mission === 1,
         'Sprachwechsel: Titel englisch, erledigte Auftraege bleiben');
  expect($('#lp-val-e')?.value === '3', 'Sprachwechsel: der Regler behaelt seinen Wert');
  click('#btn-lang-de'); await tick();

  // --- Zurueck-Knopf -----------------------------------------------------------
  window.history.back(); await tick(); await tick();
  expect(learnActive(), 'Zurueck fuehrt vom Schritt in die Uebersicht');
  items = $$('#lp-steps .lp-step');
  expect(items[0].classList.contains('st-done') && items[1].classList.contains('st-open'), 'Uebersicht: 1 geschafft, 2 frei');
  expect($('#lp-path-meta').textContent === '1 von 8 Schritten geschafft', 'Fortschrittszeile zaehlt mit');

  // --- Test statt Lernen, nicht bestanden -> Rueckverweis ------------------------
  click(items[3].querySelector('[data-act="test"]')); await tick();
  expect(lessonActive() && lesson().mode === 'test' && lesson().phase === 'practice' && lesson().idx === 3,
         'gesperrter Schritt 4: direkt zum Test');
  expect($$('#lesson-phases li').length === 1, 'im Test nur eine Phase');
  await runPractice({ right: false });
  expect(lesson().phase === 'result' && !lesson().result.passed, 'alles falsch: Test nicht bestanden');
  expect(window.MFE.paths.core.stepState('quadratic', 3) === 'locked', 'nicht bestandener Test schaltet nichts frei');
  const remedyBtns = $$('#lesson-panel [data-act="remedy"]');
  expect(lesson().remedies.length > 0 && remedyBtns.length === lesson().remedies.length,
         `Fehler verweisen auf fruehere Schritte (${lesson().remedies.join(',')})`);
  expect(lesson().remedies.every(i => i < 3), 'Rueckverweise zeigen nur nach vorn im Pfad, nicht auf spaeter');
  expect(act('learn') && act('again'), 'nach dem Test: noch einmal oder den Schritt lernen');
  if (remedyBtns[0]) {
    const target = Math.min(...lesson().remedies);     // Knoepfe stehen aufsteigend
    click(remedyBtns[0]); await tick();
    expect(lesson().idx === target && lesson().mode === 'learn' && lesson().phase === 'predict', 'Rueckverweis oeffnet den Schritt zum Lernen');
  }

  // --- Test bestanden -> Schritte davor uebersprungen ------------------------------
  click('#btn-lesson-back'); await tick();
  expect(learnActive(), '"Zur Uebersicht" fuehrt in die Uebersicht');
  click($$('#lp-steps .lp-step')[4].querySelector('[data-act="test"]')); await tick();
  await runPractice({ right: true });
  expect(lesson().result?.passed && lesson().result.score === 5, 'Test in Schritt 5 mit 5 Punkten bestanden');
  click(act('overview')); await tick();
  items = $$('#lp-steps .lp-step');
  expect(['st-done', 'st-skipped', 'st-skipped', 'st-skipped', 'st-done', 'st-open', 'st-locked', 'st-locked']
         .every((c, i) => items[i].classList.contains(c)), 'nach dem Test: 2-4 uebersprungen, 5 geschafft, 6 frei');
  expect(items[1].querySelector('.quiz-meta').textContent === 'per Test übersprungen', 'Zustand steht im Klartext da');

  // --- Letzter Schritt: Pfad abgeschlossen -----------------------------------------
  click(items[7].querySelector('[data-act="test"]')); await tick();
  await runPractice({ right: true });
  expect(lesson().result?.passed && $('.lp-done'), 'letzter Schritt: "Lernpfad geschafft"');
  expect(!act('next-step') && act('overview'), 'nach dem letzten Schritt kein "Weiter zu Schritt 9"');
  click(act('overview')); await tick();
  // Ein bestandener Test auf dem letzten Schritt ist eine Einstufung: alles
  // davor gilt als uebersprungen, der Pfad als abgeschlossen.
  expect(window.MFE.paths.core.countPassed('quadratic') === 8 && $('#btn-lp-continue').hidden && !$('#lp-all-done').hidden,
         'Test im letzten Schritt bestanden: Pfad abgeschlossen, kein "Weiterlernen" mehr');
  expect($$('#lp-steps .lp-step.st-skipped').length === 5, `davor uebersprungen: 2-4 sowie 6 und 7 (${$$('#lp-steps .lp-step.st-skipped').length})`);

  // --- Englische Uebersicht, Zuruecksetzen --------------------------------------------
  click('#btn-lang-en'); await tick();
  expect($('#lp-path-title').textContent === window.MFE.i18n.t('cat.quadratic') && window.MFE.i18n.lang === 'en',
         `Uebersicht auf Englisch ("${$('#lp-path-title').textContent}")`);
  expect($$('#lp-steps h3')[0].textContent === '1. The basic parabola', 'Schritttitel auf Englisch');
  click('#btn-lang-de'); await tick();
  click('#btn-lp-reset'); await tick();
  items = $$('#lp-steps .lp-step');
  expect(items[0].classList.contains('st-open') && items[1].classList.contains('st-locked'), 'Zuruecksetzen: wieder am Anfang');
  expect($('#lp-path-meta').textContent === '0 von 8 Schritten geschafft', 'Zuruecksetzen: Zaehler auf 0');

  // --- Jeden Schritt einmal durchspielen: Vermutung, Auftraege, Merken, Ueben ----------
  // Die Auftraege werden mit der Loesung aus dem Rasterdurchlauf erfuellt -
  // so ist jeder Auftrag jedes Schritts einmal ueber die Oberflaeche gelaufen.
  for (let si = 0; si < 8; si++) {
    LP.openLesson('quadratic', si, 'learn'); await tick();
    const step = LP.paths.quadratic.steps[si];
    click($$('#lesson-panel .quiz-opt')[0]); await tick();
    const d = window.MFE.math.FUNCTIONS[step.form];
    const axes = step.free.map(id => { const p = d.params.find(q => q.id === id); const out = [];
      for (let k = 0; k <= Math.round((p.max - p.min) / p.step); k++) out.push(Math.round((p.min + k * p.step) * 1e4) / 1e4);
      return out; });
    const xs = step.trace ? [-3, -2.5, -2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2, 2.5, 3] : [null];
    let guard = 0;
    // Solange Auftraege offen sind: Loesung fuer den AKTUELLEN suchen. Ein
    // Zwischenstand beim Tippen kann einen Auftrag schon vorher erfuellen -
    // dann geht es einfach mit dem naechsten weiter.
    while (lesson().mission < step.missions.length && guard++ < 10) {
      const m = step.missions[lesson().mission];
      const memo = lesson().memo;
      const base = { ...Object.fromEntries(d.params.map(p => [p.id, p.value])), ...step.start };
      let sol = null;
      const rec = (i, v) => {
        if (sol) return;
        if (i === axes.length) {
          for (const x of xs) {
            const st = { v: { ...v }, x, y: x == null ? NaN : d.f(x, v), f: (xx) => d.f(xx, v) };
            if (m.check(st, memo)) { sol = st; return; }
          }
          return;
        }
        for (const a of axes[i]) { v[step.free[i]] = a; rec(i + 1, v); if (sol) return; }
      };
      rec(0, { ...base });
      if (!sol) { errors.push(`Schritt ${si + 1}, Auftrag ${lesson().mission + 1}: keine Loesung gefunden`); break; }
      for (const id of step.free) typeParam(id, sol.v[id]);
      if (step.trace) {
        const tr = $('#lp-trace');
        tr.value = String(sol.x); tr.dispatchEvent(new window.Event('input', { bubbles: true }));
        tr.dispatchEvent(new window.Event('change', { bubbles: true }));
      }
      await tick();
    }
    expect(lesson().mission === step.missions.length, `Schritt ${si + 1}: alle Auftraege ueber die Oberflaeche erledigt (${lesson().mission}/${step.missions.length})`);
    click(act('to-rule')); await tick();
    click(act('to-practice')); await tick();
    await runPractice({ right: true });
    expect(lesson().result?.passed, `Schritt ${si + 1}: Uebungsrunde bestanden`);
  }
  click(act('overview')); await tick();
  expect(!$('#lp-all-done').hidden && $('#btn-lp-continue').hidden, 'alle acht Schritte geschafft: Abschlussmeldung');
  expect(!errors.some(e => e.includes('console.error')), 'kein Fehler in der Konsole waehrend der Lernpfade');
  window.localStorage.removeItem('mfe:paths');
  click('#btn-home'); await tick();
}

/* ---- In-App-Kauf (nur iOS-App) -------------------------------------------
   Nachgebautes Plugin mit derselben Schnittstelle wie
   plugins-src/cordova-plugin-mfe-store/www/mfe-store.js. */
if (LITE) {
  const PID = window.MFE.licence.PRODUCT_ID;
  let watcher = null, buyResult = 'purchased', restoreOwned = false;
  window.MFEStore = {
    status(id, ok) { storeCalls.push(['status', id]); ok({ owned: storeOwned }); },
    product(id, ok) { storeCalls.push(['product', id]); ok({ id, price: '3,99 €' }); },
    buy(id, ok) {
      storeCalls.push(['buy', id]);
      if (buyResult === 'purchased') storeOwned = true;
      ok({ result: buyResult });
    },
    restore(id, ok) { storeCalls.push(['restore', id]); ok({ owned: restoreOwned, error: '', cancelled: false }); },
    watch(cb) { watcher = cb; }
  };
  window.document.dispatchEvent(new window.Event('deviceready'));
  await tick();
  expect(storeCalls.some(c => c[0] === 'status' && c[1] === PID), 'deviceready: Kaufstand wird bei StoreKit erfragt');
  expect(watcher !== null, 'deviceready: Aenderungen (Erstattung, Kaufen anfragen) werden beobachtet');
  expect(window.MFE.billing.price() === '3,99 €', 'Preis kommt aus dem App Store');
  expect(!window.MFE.licence.isFull(), 'nicht gekauft: weiterhin gesperrt');

  // Gesperrte Funktion -> Dialog mit Preis
  click('#btn-home'); await tick();
  click('.fn-card[data-category="quadratic"]'); await tick();
  expect($('#pro-dialog').open, 'gesperrte Klasse oeffnet den Kauf-Dialog');
  expect($('#btn-pro-store').textContent.includes('3,99 €'), `Kaufknopf nennt den Preis ("${$('#btn-pro-store').textContent}")`);

  // Kauf abgebrochen -> bleibt gesperrt, keine Fehlermeldung
  buyResult = 'cancelled';
  $('#pro-dialog').close('store'); await tick(); await tick();
  expect(!window.MFE.licence.isFull(), 'abgebrochener Kauf schaltet nichts frei');

  // Wiederherstellen ohne Kauf -> Hinweis, bleibt gesperrt
  click('#btn-home'); await tick();
  click('#card-info'); await tick();
  click('#btn-info-restore'); await tick(); await tick();
  expect(!window.MFE.licence.isFull(), 'Wiederherstellen ohne Kauf schaltet nichts frei');
  expect($('#toast').textContent.length > 0, 'und sagt es');

  // Kauf -> frei, Startseite ohne Sperren, gemerkt fuer den naechsten Start
  buyResult = 'purchased';
  click('#btn-info-store'); await tick(); await tick();
  expect(window.MFE.licence.isFull() && window.MFE.licence.owned(), 'Kauf schaltet Pro frei');
  expect(window.localStorage.getItem('mfe:pro') === '1', 'der Kaufstand wird fuer den Start gemerkt');
  expect($('#info-lite-box').hidden, 'nach dem Kauf verschwinden Kaufen/Wiederherstellen');
  click('#btn-home'); await tick();
  expect(!$$('.fn-card.is-locked').length, `nach dem Kauf ist keine Karte mehr gesperrt (${$$('.fn-card.is-locked').length})`);
  expect(Array.from($('.fn-grid-main').children).map(c => c.dataset.category || c.id).join(',')
         === 'linear,quadratic,exponential,trig,btn-more-fns', 'nach dem Kauf unveraenderte Reihenfolge');
  click('.fn-card[data-category="quadratic"]'); await tick();
  expect($('#screen-app').classList.contains('is-active') && !$('#pro-dialog').open, 'quadratische Funktion jetzt erreichbar');
  click('#btn-home'); await tick();
  expect(!$('#card-learn').classList.contains('is-locked'), 'nach dem Kauf: Lernpfade ohne Pro-Abzeichen');
  click('#card-learn'); await tick();
  expect($('#screen-learn').classList.contains('is-active') && !$('#pro-dialog').open, 'nach dem Kauf: Lernpfade oeffnen sich');
  click($$('#lp-steps [data-act="open"]')[0]); await tick();
  expect($('#screen-lesson').classList.contains('is-active') && window.MFE.paths.lesson.phase === 'predict',
         'nach dem Kauf: Schritt 1 startet');
  click('#btn-home'); await tick();

  // Erstattung: StoreKit meldet "nicht mehr gekauft" ueber watch()
  storeOwned = false;
  watcher({ productId: PID }); await tick();
  expect(!window.MFE.licence.isFull(), 'nach einer Erstattung ist Pro wieder gesperrt');
  expect(window.localStorage.getItem('mfe:pro') === '0', 'und der gemerkte Stand ebenso');

  // Wiederherstellen mit Kauf
  restoreOwned = true; storeOwned = true;
  click('#btn-home'); await tick();
  click('#card-info'); await tick();
  click('#btn-info-restore'); await tick(); await tick();
  expect(window.MFE.licence.isFull(), 'Wiederherstellen schaltet einen vorhandenen Kauf frei');

  // Fehler beim Abgleich: letzten bekannten Stand behalten (offline)
  window.MFEStore.status = (id, ok, fail) => fail({ error: 'offline' });
  window.MFE.billing.refresh(); await tick();
  expect(window.MFE.licence.isFull(), 'App Store nicht erreichbar: Pro bleibt erhalten');

  // Links aus der App zeigen ins Web, nicht auf app://localhost
  expect(window.MFE.ui.publicBase().startsWith('https://'), 'Links aus der App zeigen auf die Web-Fassung');
  expect($('#btn-print').hidden, 'Drucken ist in der App verborgen (WKWebView druckt nicht)');
} else {
  expect(window.MFE.ui.publicBase() === 'https://example.org/', 'im Browser zeigen Links auf die eigene Adresse');
  expect(!$('#btn-print').hidden, 'Drucken ist im Browser sichtbar');
}

/* ---- Ergebnis ---------------------------------------------------------- */
const failed = checks.filter(([ok]) => !ok);
console.log(`${LITE ? 'iOS ohne Kauf' : 'Browser      '}: ${checks.length - failed.length}/${checks.length} Pruefungen bestanden`);
if (errors.length) {
  console.error('Fehler:');
  for (const e of [...new Set(errors)]) console.error('  · ' + e);
  process.exit(1);
}
