/* ==========================================================================
   quiz.js  ·  Eigene Quizze bauen, speichern, abspielen, weitergeben
   --------------------------------------------------------------------------
   Sechs Aufgabentypen, damit ein Quiz nicht nach der dritten Frage
   vorhersehbar wird:

     match      Graph gegeben, welche Gleichung passt?
     build      Graph gegeben, Regler passend einstellen
     value      Funktionswert an einer Stelle berechnen
     readoff    Nullstelle, y-Achsenabschnitt oder Scheitelpunkt ablesen
     truefalse  Aussage zum Graphen beurteilen
     choice     freie Frage mit eigenen Antwortmoeglichkeiten

   Gespeichert wird ausschliesslich lokal (localStorage). Weitergegeben wird
   ueber einen Link mit dem Quiz im Fragment - der Hash geht nicht an einen
   Server. Alles, was ueber einen Link hereinkommt, laeuft durch
   sanitizeQuiz(): fremde Daten werden nie ungeprueft uebernommen.
   ========================================================================== */
'use strict';
window.MFE = window.MFE || {};

MFE.quiz = (() => {
const { $, $$, toast, renderSliderGroup } = MFE.ui;
const { clamp, tolerance, fmt, mfmt, parseLoose, FUNCTIONS, CATEGORY_FORMS } = MFE.math;
const { Graph, drawScene, findZeros } = MFE.graph;
const licence = MFE.licence;
const t = (k, v) => MFE.i18n.t(k, v);

const STORE_KEY   = 'mfe:quizzes';
const MAX_QUIZZES = 40;
const MAX_TASKS   = 30;
const MAX_TITLE   = 80;
const MAX_TEXT    = 200;
const MAX_OPTIONS = 6;
const MAX_LINK    = 12000;        // Zeichen; darueber weigert sich mancher Browser

/* ACHTUNG: TYPES ist Teil des Binaerformats fuer Links (der Index steht im
   Code). Nur HINTEN anhaengen - eine Umsortierung macht jeden bereits
   verteilten Link unlesbar. */
const TYPES = ['match', 'build', 'value', 'readoff', 'truefalse', 'choice',
               'tableToEq', 'graphToTable', 'pointsToEq'];

/** Aufgaben mit Funktion und Parametern (alles ausser der freien Frage). */
const GRAPH_TYPES = new Set(['match', 'build', 'value', 'readoff', 'truefalse',
                             'tableToEq', 'graphToTable', 'pointsToEq']);

/** Aufgaben, bei denen tatsaechlich ein Koordinatensystem gezeichnet wird.
    Beim Darstellungswechsel ist genau das der Punkt: aus der TABELLE oder
    aus PUNKTEN auf die Gleichung schliessen - ohne den Graphen zu sehen. */
const CANVAS_TYPES = new Set(['match', 'build', 'value', 'readoff', 'truefalse', 'graphToTable']);

/* Von aussen gesetzt (app.js), damit quiz.js nichts ueber den Rest der App
   wissen muss. */
let host = {
  showScreen: () => {},
  explorer: () => null,      // { form, values } der aktiven Explorer-Kurve
  symbolOf: (id) => id,
  view: () => ({ xMin: -10, xMax: 10, yMin: -10, yMax: 10, piAxis: false }),
  scale: () => 1
};

const uid = () => 'q' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const pick = (a) => a[Math.floor(Math.random() * a.length)];

/* ==========================================================================
   1 · PRUEFUNG
   Jede Struktur, die aus localStorage oder aus einem Link kommt, ist
   unbekanntes Fremdmaterial. Nichts davon wird uebernommen, ohne dass Typ,
   Wertebereich und Laenge geprueft sind.
   ========================================================================== */
function cleanText(v, max) {
  if (typeof v !== 'string') return '';
  // Steuerzeichen entfernen, sie haben in Aufgabentexten nichts zu suchen.
  return v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
}

function sanitizeValues(form, raw) {
  const d = FUNCTIONS[form];
  if (!d || !raw || typeof raw !== 'object') return null;
  const out = {};
  for (const p of d.params) {
    const n = Number(raw[p.id]);
    if (!Number.isFinite(n)) return null;
    out[p.id] = clamp(n, p.hardMin ?? -1e6, p.hardMax ?? 1e6);
  }
  return out;
}

function sanitizeTask(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const type = TYPES.includes(raw.type) ? raw.type : null;
  if (!type) return null;

  if (type === 'choice') {
    const question = cleanText(raw.question, MAX_TEXT);
    const options = Array.isArray(raw.options)
      ? raw.options.map(o => cleanText(o, MAX_TEXT)).filter(Boolean).slice(0, MAX_OPTIONS)
      : [];
    if (!question || options.length < 2) return null;
    const correct = Number.isInteger(raw.correct) ? clamp(raw.correct, 0, options.length - 1) : 0;
    return { type, question, options, correct };
  }

  const form = typeof raw.form === 'string' && FUNCTIONS[raw.form] ? raw.form : null;
  if (!form) return null;
  const values = sanitizeValues(form, raw.values);
  if (!values) return null;

  const task = { type, form, values };

  if (type === 'match') {
    const opts = Array.isArray(raw.options) ? raw.options : [];
    task.options = opts.map(o => sanitizeValues(form, o)).filter(Boolean).slice(0, 3);
    if (task.options.length < 1) task.options = makeDistractors(form, values, 3);
    return task;
  }
  if (type === 'value') {
    const x0 = Number(raw.x0);
    if (!Number.isFinite(x0)) return null;
    task.x0 = clamp(Math.round(x0 * 1e4) / 1e4, -1e4, 1e4);
    if (!Number.isFinite(FUNCTIONS[form].f(task.x0, values))) return null;
    return task;
  }
  if (type === 'readoff') {
    const what = ['root', 'yint', 'vertex'].includes(raw.what) ? raw.what : 'yint';
    if (what === 'vertex' && !FUNCTIONS[form].vertex) return null;
    task.what = what;
    return task;
  }
  if (type === 'tableToEq') {
    const opts = Array.isArray(raw.options) ? raw.options : [];
    task.options = opts.map(o => sanitizeValues(form, o)).filter(Boolean).slice(0, 3);
    if (!task.options.length) task.options = makeDistractors(form, values, 3);
    // Eine Tabellenaufgabe ohne definierte Werte waere leer.
    if (!sampleRows(form, values)) return null;
    return task;
  }
  if (type === 'graphToTable' || type === 'pointsToEq') {
    const want = type === 'pointsToEq' ? 2 : 3;
    const xs = Array.isArray(raw.xs) ? raw.xs.map(Number).filter(Number.isFinite) : [];
    task.xs = xs.slice(0, want).map(x => clamp(Math.round(x * 1e4) / 1e4, -1e4, 1e4));
    if (task.xs.length !== want) return null;
    // Jede genannte Stelle muss auch einen Wert haben.
    if (!task.xs.every(x => Number.isFinite(FUNCTIONS[form].f(x, values)))) return null;
    if (new Set(task.xs).size !== want) return null;      // keine doppelten Stellen
    return task;
  }

  if (type === 'truefalse') {
    task.statement = cleanText(raw.statement, MAX_TEXT);
    if (!task.statement) return null;
    task.answer = raw.answer === true;
    return task;
  }
  // build
  return task;
}

function sanitizeQuiz(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const tasks = Array.isArray(raw.tasks)
    ? raw.tasks.map(sanitizeTask).filter(Boolean).slice(0, MAX_TASKS)
    : [];
  if (!tasks.length) return null;
  return {
    id: typeof raw.id === 'string' && /^[\w-]{1,40}$/.test(raw.id) ? raw.id : uid(),
    title: cleanText(raw.title, MAX_TITLE) || t('quiz.untitled'),
    created: Number.isFinite(Number(raw.created)) ? Number(raw.created) : Date.now(),
    tasks
  };
}

/* ==========================================================================
   2 · SPEICHER
   ========================================================================== */
function loadAll() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
    if (!Array.isArray(raw)) return [];
    return raw.map(sanitizeQuiz).filter(Boolean).slice(0, MAX_QUIZZES);
  } catch { return []; }
}

function saveAll(list) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(list.slice(0, MAX_QUIZZES)));
    return true;
  } catch (err) {
    // QuotaExceededError oder privater Modus. Das ist kein Grund zum
    // Absturz, aber die Nutzerin muss es erfahren - sonst haelt sie das
    // Quiz fuer gespeichert.
    console.warn('[quiz] Speichern nicht moeglich:', err?.name);
    toast(t('quiz.saveFail'));
    return false;
  }
}

function upsert(quiz) {
  const list = loadAll();
  const i = list.findIndex(q => q.id === quiz.id);
  if (i >= 0) list[i] = quiz; else list.unshift(quiz);
  return saveAll(list);
}
function removeQuiz(id) { return saveAll(loadAll().filter(q => q.id !== id)); }
function getQuiz(id) { return loadAll().find(q => q.id === id) || null; }

/* ==========================================================================
   3 · WEITERGEBEN
   Base64url ueber UTF-8, damit Umlaute im Titel den Link nicht zerlegen.
   ========================================================================== */
/* --------------------------------------------------------------------------
   Kompaktes Binaerformat
   JSON -> UTF-8 -> Base64 blaeht die Nutzlast auf: aus einem Wert wie
   "m":1.5 werden acht Zeichen, aus 100 Zeichen Nutzlast 134 Zeichen Base64.
   Ein Quiz mit zehn Aufgaben landete damit bei QR-Version 21 und mehr - vom
   Handydisplay abgescannt ist das unzuverlaessig.

   Hier steht deshalb ein festes Binaerformat:
     u8   0x4D   Kennung
     u8   1      Formatfassung
     str  Titel
     u8   Anzahl Aufgaben
     je Aufgabe: u8 Typ, dann typabhaengige Felder

   Zahlen als Zickzack-Varint von runden(v * 10000): exakt auf vier
   Nachkommastellen - genau die Genauigkeit, mit der die App ohnehin
   rechnet - und typisch drei statt acht bis zehn Bytes.

   ACHTUNG: FORM_ORDER und TYPES sind Teil des Formats. Wer sie umsortiert,
   macht jeden bereits verteilten Link unlesbar. Nur hinten anhaengen.
   -------------------------------------------------------------------------- */
const MAGIC = 0x4d;
const FORMAT = 1;
const FORM_ORDER = [
  'linear', 'quad_standard', 'quad_vertex', 'quad_factored', 'exponential',
  'sinus', 'cubic', 'root', 'absolute', 'logarithm', 'rational', 'tangens'
];
const READOFF_ORDER = ['yint', 'root', 'vertex'];
const SCALE = 10000;

class Writer {
  constructor() { this.b = []; }
  u8(v) { this.b.push(v & 0xff); }
  varint(v) {
    let n = v >>> 0;
    while (n >= 0x80) { this.b.push((n & 0x7f) | 0x80); n >>>= 7; }
    this.b.push(n);
  }
  num(v) {
    const n = Math.round(v * SCALE);
    this.varint((n << 1) ^ (n >> 31));          // Zickzack: kleine negative Zahlen bleiben kurz
  }
  str(text) {
    const bytes = new TextEncoder().encode(text ?? '');
    this.varint(bytes.length);
    for (const x of bytes) this.b.push(x);
  }
  bytes() { return Uint8Array.from(this.b); }
}

class Reader {
  constructor(bytes) { this.a = bytes; this.i = 0; }
  get done() { return this.i >= this.a.length; }
  u8() { if (this.i >= this.a.length) throw new RangeError('zu kurz'); return this.a[this.i++]; }
  varint() {
    let n = 0, shift = 0;
    for (let k = 0; k < 5; k++) {
      const b = this.u8();
      n |= (b & 0x7f) << shift;
      if (!(b & 0x80)) return n >>> 0;
      shift += 7;
    }
    throw new RangeError('Varint zu lang');
  }
  num() { const z = this.varint(); return ((z >>> 1) ^ -(z & 1)) / SCALE; }
  str(max) {
    const len = this.varint();
    if (len > 4096 || this.i + len > this.a.length) throw new RangeError('Zeichenkette zu lang');
    const out = new TextDecoder().decode(this.a.subarray(this.i, this.i + len));
    this.i += len;
    return max ? out.slice(0, max) : out;
  }
}

const writeValues = (w, form, values) => {
  for (const prm of FUNCTIONS[form].params) w.num(values[prm.id]);
};
const readValues = (r, form) => {
  const out = {};
  for (const prm of FUNCTIONS[form].params) out[prm.id] = r.num();
  return out;
};

function packQuiz(quiz) {
  const w = new Writer();
  w.u8(MAGIC); w.u8(FORMAT);
  w.str(quiz.title);
  w.u8(Math.min(quiz.tasks.length, 255));
  for (const task of quiz.tasks.slice(0, 255)) {
    const ti = TYPES.indexOf(task.type);
    if (ti < 0) throw new Error('unbekannter Aufgabentyp: ' + task.type);
    w.u8(ti);
    if (task.type === 'choice') {
      w.str(task.question);
      w.u8(task.options.length);
      for (const o of task.options) w.str(o);
      w.u8(task.correct);
      continue;
    }
    const fi = FORM_ORDER.indexOf(task.form);
    if (fi < 0) throw new Error('unbekannte Darstellungsform: ' + task.form);
    w.u8(fi);
    writeValues(w, task.form, task.values);
    if (task.type === 'match' || task.type === 'tableToEq') {
      const opts = task.options ?? [];
      w.u8(opts.length);
      for (const o of opts) writeValues(w, task.form, o);
    } else if (task.type === 'graphToTable' || task.type === 'pointsToEq') {
      w.u8(task.xs.length);
      for (const x of task.xs) w.num(x);
    } else if (task.type === 'value') {
      w.num(task.x0);
    } else if (task.type === 'readoff') {
      w.u8(Math.max(0, READOFF_ORDER.indexOf(task.what)));
    } else if (task.type === 'truefalse') {
      w.str(task.statement);
      w.u8(task.answer ? 1 : 0);
    }
  }
  return w.bytes();
}

/** Liest das Binaerformat. Alles Gelesene geht anschliessend durch
 *  sanitizeQuiz() - dieser Leser prueft nur so weit, dass er nicht selbst
 *  ueber die Daten stolpert. */
function unpackQuiz(bytes) {
  const r = new Reader(bytes);
  if (r.u8() !== MAGIC) return null;
  const format = r.u8();
  if (format !== FORMAT) return null;
  const title = r.str(MAX_TITLE);
  const count = r.u8();
  if (count > MAX_TASKS) return null;
  const tasks = [];
  for (let i = 0; i < count; i++) {
    const type = TYPES[r.u8()];
    if (!type) return null;
    if (type === 'choice') {
      const question = r.str(MAX_TEXT);
      const n = r.u8();
      if (n > MAX_OPTIONS) return null;
      const options = [];
      for (let k = 0; k < n; k++) options.push(r.str(MAX_TEXT));
      tasks.push({ type, question, options, correct: r.u8() });
      continue;
    }
    const form = FORM_ORDER[r.u8()];
    if (!form || !FUNCTIONS[form]) return null;
    const task = { type, form, values: readValues(r, form) };
    if (type === 'match' || type === 'tableToEq') {
      const n = r.u8();
      if (n > 8) return null;
      task.options = [];
      for (let k = 0; k < n; k++) task.options.push(readValues(r, form));
    } else if (type === 'graphToTable' || type === 'pointsToEq') {
      const n = r.u8();
      if (n > 8) return null;
      task.xs = [];
      for (let k = 0; k < n; k++) task.xs.push(r.num());
    } else if (type === 'value') {
      task.x0 = r.num();
    } else if (type === 'readoff') {
      task.what = READOFF_ORDER[r.u8()] ?? 'yint';
    } else if (type === 'truefalse') {
      task.statement = r.str(MAX_TEXT);
      task.answer = r.u8() === 1;
    }
    tasks.push(task);
  }
  return { title, tasks };
}

const toBase64Url = (bytes) => {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

function encodeQuiz(quiz) {
  try {
    return toBase64Url(packQuiz(quiz));
  } catch (err) {
    // Ein neuer Aufgabentyp, der hier noch nicht eingetragen ist, darf die
    // Weitergabe nicht verhindern - dann eben im alten, laengeren Format.
    console.warn('[quiz] kompaktes Format nicht moeglich:', err?.message);
    return toBase64Url(new TextEncoder().encode(
      JSON.stringify({ title: quiz.title, tasks: quiz.tasks })));
  }
}

function decodeQuiz(code) {
  if (typeof code !== 'string' || !code || code.length > MAX_LINK) return null;
  if (!/^[A-Za-z0-9\-_]+$/.test(code)) return null;
  let bytes;
  try {
    const b64 = code.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
    bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
  } catch { return null; }
  if (!bytes.length) return null;

  // 0x7B ist '{' - ein Link aus Fassung 4 im alten JSON-Format. Verteilte
  // Links muessen weiter funktionieren.
  try {
    if (bytes[0] === 0x7b) return sanitizeQuiz(JSON.parse(new TextDecoder().decode(bytes)));
    if (bytes[0] === MAGIC) return sanitizeQuiz(unpackQuiz(bytes));
  } catch { return null; }
  return null;
}

function linkFor(quiz) {
  return location.origin + location.pathname + '#quiz=' + encodeQuiz(quiz);
}

/* ==========================================================================
   4 · AUFGABEN ERZEUGEN
   ========================================================================== */
function randomValues(form) {
  const out = {};
  for (const p of FUNCTIONS[form].params) {
    out[p.id] = p.pool ? pick(p.pool) : Math.round((Math.random() * (p.max - p.min) + p.min) * 2) / 2;
  }
  return out;
}

/** Falsche Antworten fuer den Zuordnungstyp. Sie muessen sich sichtbar
 *  unterscheiden, sonst raet man richtig, ohne etwas zu koennen. */
function makeDistractors(form, correct, n = 3) {
  const d = FUNCTIONS[form];
  const seen = new Set([d.rhs(correct)]);
  const out = [];
  let guard = 0;
  while (out.length < n && guard++ < 120) {
    const cand = { ...correct };
    const p = pick(d.params);
    const alt = (p.pool ?? [p.min, p.max]).filter(x => x !== correct[p.id]);
    if (!alt.length) continue;
    cand[p.id] = pick(alt);
    if (Math.random() < 0.4) {
      const q = pick(d.params);
      const alt2 = (q.pool ?? []).filter(x => x !== cand[q.id]);
      if (alt2.length) cand[q.id] = pick(alt2);
    }
    const key = d.rhs(cand);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cand);
  }
  return out;
}

/** Tabellenzeilen fuer die Darstellungswechsel-Aufgaben. Liegt in
 *  js/diagnose.js, weil dort auch sichergestellt wird, dass nur definierte
 *  Werte herauskommen (Wurzel, Logarithmus, Polstellen). */
const sampleRows = (form, values, n = 5) => MFE.diagnose.sampleTable(form, values, n, -2, 1);

const eqText = (form, v, name = 'f') => `${name}(x) = ${FUNCTIONS[form].rhs(v)}`;

/** Kurzbeschreibung einer Aufgabe fuer die Liste im Editor. */
function taskLabel(task) {
  if (task.type === 'choice') return task.question;
  if (task.type === 'truefalse') return task.statement;
  if (task.type === 'value') return `${t('type.value')}: f(${mfmt(task.x0)})`;
  if (task.type === 'graphToTable' || task.type === 'pointsToEq') {
    return `${t('type.' + task.type)}: x = ${task.xs.map(x => mfmt(x)).join(', ')}`;
  }
  if (task.type === 'readoff') return `${t('type.readoff')}: ${t('poi.' + (task.what === 'yint' ? 'yint' : task.what))}`;
  return `${t('type.' + task.type)}: ${eqText(task.form, task.values)}`;
}

/* ==========================================================================
   5 · GEMEINSAME BAUSTEINE FUER EDITOR UND ABSPIELER
   ========================================================================== */
function makeBounds(form) {
  return Object.fromEntries(FUNCTIONS[form].params.map(p => [p.id, { min: p.min, max: p.max }]));
}
function defaultValues(form) {
  return Object.fromEntries(FUNCTIONS[form].params.map(p => [p.id, p.value]));
}

/** Achsenausschnitt fuer eine Aufgabe. Die Klasse bestimmt ihn mit: eine
 *  Exponentialkurve im Bereich -10 bis 10 ist nur ein senkrechter Strich,
 *  eine Sinuskurve braucht die pi-Teilung. */
const TASK_VIEW = {
  trig:        { xMin: -2 * Math.PI, xMax: 2 * Math.PI, yMin: -4, yMax: 4, piAxis: true },
  exponential: { xMin: -3, xMax: 5, yMin: -2, yMax: 12 },
  logarithm:   { xMin: -2, xMax: 10, yMin: -5, yMax: 5 },
  root:        { xMin: -3, xMax: 12, yMin: -3, yMax: 8 },
  rational:    { xMin: -8, xMax: 8, yMin: -8, yMax: 8 }
};
function viewFor(form) {
  const cat = FUNCTIONS[form]?.category;
  const base = TASK_VIEW[cat] ?? { xMin: -10, xMax: 10, yMin: -10, yMax: 10 };
  return { ...base, piAxis: !!FUNCTIONS[form]?.piAxis || !!base.piAxis };
}

const BLANK_OPTS = { helpers: false, roots: false, yint: false, vertex: false,
                     drag: false, intersections: false, derivative: false, tangent: false, trace: false };

function drawTaskGraph(graph, task, attempt) {
  if (!graph.measure()) return false;
  const curves = [];
  if (attempt) curves.push({ form: task.form, values: attempt, color: '--graph' });
  const scene = {
    curves: curves.length ? curves : [{ form: task.form, values: task.values, color: '--graph' }],
    activeIndex: 0,
    view: viewFor(task.form),
    opts: BLANK_OPTS,
    scale: host.scale()
  };
  if (attempt) scene.ghost = { form: task.form, values: task.values };
  drawScene(graph, scene);
  return true;
}

/* Die Formen, die in der aktuellen Ausgabe zur Verfuegung stehen. */
function allowedForms() {
  const out = [];
  for (const [cat, forms] of Object.entries(CATEGORY_FORMS)) {
    if (!licence.has('cat.' + cat)) continue;
    out.push(...forms);
  }
  return out;
}

/* ==========================================================================
   6 · EDITOR
   ========================================================================== */
const builder = { quiz: null, editing: -1, draft: null, ctx: null, graph: null };

function newQuiz() {
  return { id: uid(), title: '', created: Date.now(), tasks: [] };
}

function openBuilder(id) {
  if (!licence.has('quizBuilder')) { proHint(); return; }
  builder.quiz = id ? getQuiz(id) : newQuiz();
  if (!builder.quiz) builder.quiz = newQuiz();
  builder.editing = -1;
  builder.draft = null;
  $('#builder-title').value = builder.quiz.title;
  renderBuilder();
  host.showScreen('builder');
}

function renderBuilder() {
  const list = $('#builder-tasks');
  list.replaceChildren();

  if (!builder.quiz.tasks.length) {
    const p = document.createElement('p');
    p.className = 'empty-note';
    p.textContent = t('quiz.noTasks');
    list.append(p);
  }

  builder.quiz.tasks.forEach((task, i) => {
    const row = document.createElement('div');
    row.className = 'task-row';

    const n = document.createElement('span');
    n.className = 'task-no';
    n.textContent = String(i + 1);

    const label = document.createElement('span');
    label.className = 'task-label';
    label.textContent = taskLabel(task);

    const kind = document.createElement('span');
    kind.className = 'task-kind';
    kind.textContent = t('type.' + task.type);

    const actions = document.createElement('div');
    actions.className = 'task-actions';
    for (const [act, glyph, key] of [
      ['up', '\u2191', 'quiz.moveUp'], ['down', '\u2193', 'quiz.moveDown'],
      ['edit', '\u270e', 'quiz.editTask'], ['del', '\u2715', 'quiz.delTask']
    ]) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'icon-btn small';
      b.dataset.act = act;
      b.dataset.index = String(i);
      b.textContent = glyph;
      b.setAttribute('aria-label', t(key));
      actions.append(b);
    }

    const main = document.createElement('div');
    main.className = 'task-main';
    main.append(kind, label);
    row.append(n, main, actions);
    list.append(row);
  });

  $('#builder-count').textContent = t('quiz.taskCount', { n: builder.quiz.tasks.length });
  $('#builder-editor').hidden = builder.draft === null;
  $('#btn-builder-save').disabled = builder.quiz.tasks.length === 0;
}

/** Startwerte einer neuen Aufgabe: was gerade im Explorer steht, sofern die
 *  Ausgabe diese Funktionsklasse ueberhaupt erlaubt. */
function draftDefaults(type) {
  const ex = host.explorer();
  const forms = allowedForms();
  const form = ex && forms.includes(ex.form) ? ex.form : (forms[0] || 'linear');
  const values = ex && form === ex.form ? { ...ex.values } : defaultValues(form);
  const draft = { type, form, values };
  if (type === 'value') draft.x0 = 2;
  if (type === 'readoff') draft.what = FUNCTIONS[form].vertex ? 'vertex' : 'yint';
  if (type === 'graphToTable') draft.xs = [-1, 0, 2];
  if (type === 'pointsToEq') draft.xs = [-1, 2];
  if (type === 'truefalse') { draft.statement = ''; draft.answer = true; }
  if (type === 'choice') { draft.question = ''; draft.options = ['', '']; draft.correct = 0; }
  return draft;
}

function startTask(type, index = -1) {
  builder.editing = index;
  builder.draft = index >= 0
    ? JSON.parse(JSON.stringify(builder.quiz.tasks[index]))
    : draftDefaults(type);
  renderEditor();
  renderBuilder();
  $('#builder-editor').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function renderEditor() {
  const d = builder.draft;
  const box = $('#editor-body');
  box.replaceChildren();
  if (!d) return;

  $('#editor-heading').textContent =
    builder.editing >= 0 ? t('quiz.editTask') : t('quiz.newTask');

  // Typ
  box.append(field(t('quiz.taskType'), selectEl(
    'editor-type',
    TYPES.map(ty => [ty, t('type.' + ty)]),
    d.type,
    (v) => { builder.draft = draftDefaults(v); renderEditor(); }
  )));

  if (GRAPH_TYPES.has(d.type)) {
    const forms = allowedForms();
    box.append(field(t('lbl.form'), selectEl(
      'editor-form',
      forms.map(f => [f, t('form.' + f)]),
      d.form,
      (v) => {
        d.form = v;
        d.values = defaultValues(v);
        if (d.type === 'readoff' && d.what === 'vertex' && !FUNCTIONS[v].vertex) d.what = 'yint';
        renderEditor();
      }
    )));

    // Vorschau
    const stage = document.createElement('div');
    stage.className = 'editor-preview';
    const cv = document.createElement('canvas');
    cv.id = 'editor-canvas';
    cv.className = 'graph-canvas short';
    cv.setAttribute('role', 'img');
    cv.setAttribute('aria-label', t('a11y.previewCanvas'));
    stage.append(cv);
    box.append(stage);

    const eq = document.createElement('p');
    eq.className = 'editor-eq';
    eq.id = 'editor-eq';
    eq.textContent = eqText(d.form, d.values);
    box.append(eq);

    // Regler
    const sliders = document.createElement('div');
    sliders.className = 'sliders compact';
    sliders.id = 'editor-sliders';
    box.append(sliders);

    builder.ctx = {
      form: d.form, values: d.values, bounds: makeBounds(d.form),
      prefix: 'ed-', play: false,
      symbolOf: host.symbolOf,
      onChange: () => {
        $('#editor-eq').textContent = eqText(d.form, d.values);
        drawEditorPreview();
      }
    };
    renderSliderGroup(sliders, builder.ctx);

    const take = document.createElement('button');
    take.type = 'button';
    take.className = 'btn-ghost';
    take.id = 'btn-take-explorer';
    take.textContent = t('quiz.fromExplorer');
    box.append(take);
  }

  if (d.type === 'value') {
    box.append(field(t('quiz.atX'), textEl('editor-x0', fmt(d.x0, 4), (v) => {
      const n = parseLoose(v, NaN);
      if (Number.isFinite(n)) d.x0 = n;
    })));
  }

  if (d.type === 'graphToTable' || d.type === 'pointsToEq') {
    const want = d.type === 'pointsToEq' ? 2 : 3;
    d.xs = Array.isArray(d.xs) && d.xs.length === want ? d.xs : (d.type === 'pointsToEq' ? [-1, 2] : [-1, 0, 2]);
    const wrap = document.createElement('div');
    wrap.className = 'answer-pair three';
    for (let i = 0; i < want; i++) {
      wrap.append(field(`x${i + 1}`, textEl(`editor-x${i + 1}`, fmt(d.xs[i], 4), (v) => {
        const n = parseLoose(v, NaN);
        if (Number.isFinite(n)) d.xs[i] = n;
      })));
    }
    box.append(field(t(d.type === 'pointsToEq' ? 'quiz.atPoints' : 'quiz.atValues'), wrap));
  }

  if (d.type === 'readoff') {
    const opts = [['yint', t('poi.yint')], ['root', t('poi.root')]];
    if (FUNCTIONS[d.form].vertex) opts.push(['vertex', t('poi.vertex')]);
    box.append(field(t('quiz.readWhat'), selectEl('editor-what', opts, d.what, (v) => { d.what = v; })));
  }

  if (d.type === 'truefalse') {
    box.append(field(t('quiz.statement'), textEl('editor-statement', d.statement, (v) => { d.statement = v; })));
    box.append(field(t('quiz.correctAnswer'), selectEl(
      'editor-tf', [['true', t('quiz.true')], ['false', t('quiz.false')]],
      String(d.answer), (v) => { d.answer = v === 'true'; }
    )));
  }

  if (d.type === 'choice') {
    box.append(field(t('quiz.question'), textEl('editor-question', d.question, (v) => { d.question = v; })));
    const wrap = document.createElement('div');
    wrap.className = 'choice-editor';
    d.options.forEach((opt, i) => {
      const row = document.createElement('div');
      row.className = 'choice-row';
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'editor-correct';
      radio.checked = d.correct === i;
      radio.setAttribute('aria-label', t('quiz.markCorrect'));
      radio.addEventListener('change', () => { d.correct = i; });
      const inp = document.createElement('input');
      inp.type = 'text';
      inp.value = opt;
      inp.maxLength = MAX_TEXT;
      inp.setAttribute('aria-label', t('quiz.option', { n: i + 1 }));
      inp.addEventListener('input', () => { d.options[i] = inp.value; });
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'icon-btn small';
      del.textContent = '\u2715';
      del.setAttribute('aria-label', t('quiz.delOption'));
      del.disabled = d.options.length <= 2;
      del.addEventListener('click', () => {
        d.options.splice(i, 1);
        if (d.correct >= d.options.length) d.correct = d.options.length - 1;
        renderEditor();
      });
      row.append(radio, inp, del);
      wrap.append(row);
    });
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'btn-ghost';
    add.textContent = t('quiz.addOption');
    add.disabled = d.options.length >= MAX_OPTIONS;
    add.addEventListener('click', () => { d.options.push(''); renderEditor(); });
    wrap.append(add);
    box.append(field(t('quiz.answers'), wrap));
  }

  if (GRAPH_TYPES.has(d.type)) requestAnimationFrame(drawEditorPreview);
}

function drawEditorPreview() {
  const cv = $('#editor-canvas');
  if (!cv || !builder.draft) return;
  if (!builder.graph || builder.graph.canvas !== cv) builder.graph = new Graph(cv);
  drawTaskGraph(builder.graph, builder.draft, null);
}

/* Kleine Bauhelfer, damit der Editor nicht in innerHTML endet. */
function field(labelText, control) {
  const row = document.createElement('div');
  row.className = 'form-row';
  const l = document.createElement('label');
  l.textContent = labelText;
  if (control.id) l.htmlFor = control.id;
  row.append(l, control);
  return row;
}
function selectEl(id, pairs, value, onChange) {
  const s = document.createElement('select');
  s.id = id;
  for (const [v, label] of pairs) {
    const o = document.createElement('option');
    o.value = v; o.textContent = label; o.selected = String(v) === String(value);
    s.append(o);
  }
  s.addEventListener('change', () => onChange(s.value));
  return s;
}
function textEl(id, value, onInput) {
  const i = document.createElement('input');
  i.type = 'text';
  i.id = id;
  i.value = value ?? '';
  i.maxLength = MAX_TEXT;
  i.autocomplete = 'off';
  i.addEventListener('input', () => onInput(i.value));
  return i;
}

function commitTask() {
  const d = builder.draft;
  if (!d) return;
  // Haeufigster Stolperstein: eine Stelle ausserhalb des Definitionsbereichs.
  // Vorher wurde die Aufgabe kommentarlos abgelehnt und niemand wusste,
  // warum - bei Wurzel, Logarithmus, Hyperbel und Tangens passiert das leicht.
  if (d.type === 'value' && !Number.isFinite(FUNCTIONS[d.form]?.f(d.x0, d.values))) {
    toast(t('quiz.xOutside', { x: mfmt(d.x0) }));
    return;
  }
  const prepared = { ...d };
  if (d.type === 'match' || d.type === 'tableToEq') {
    prepared.options = makeDistractors(d.form, d.values, 3);
  }
  // Stellen ausserhalb des Definitionsbereichs kommentarlos abzulehnen war
  // frueher der haeufigste Stolperstein - hier dieselbe konkrete Meldung.
  if ((d.type === 'graphToTable' || d.type === 'pointsToEq')
      && !d.xs.every(x => Number.isFinite(FUNCTIONS[d.form]?.f(x, d.values)))) {
    toast(t('quiz.xOutside', { x: d.xs.map(x => mfmt(x)).join(', ') }));
    return;
  }
  const clean = sanitizeTask(prepared);
  if (!clean) { toast(t('quiz.taskIncomplete')); return; }
  if (builder.editing >= 0) builder.quiz.tasks[builder.editing] = clean;
  else {
    if (builder.quiz.tasks.length >= MAX_TASKS) { toast(t('quiz.taskLimit', { n: MAX_TASKS })); return; }
    builder.quiz.tasks.push(clean);
  }
  builder.draft = null;
  builder.editing = -1;
  renderBuilder();
}

function saveQuiz() {
  builder.quiz.title = $('#builder-title').value.trim().slice(0, MAX_TITLE) || t('quiz.untitled');
  const clean = sanitizeQuiz(builder.quiz);
  if (!clean) { toast(t('quiz.needTask')); return; }
  clean.id = builder.quiz.id;
  if (upsert(clean)) {
    toast(t('quiz.saved'));
    openList();
  }
}

/* ==========================================================================
   7 · LISTE
   ========================================================================== */
function openList() {
  $('#random-panel').hidden = true;
  host.showScreen('quizzes');
  renderList();
}

function renderList() {
  const box = $('#quiz-list');
  box.replaceChildren();
  const list = loadAll();

  if (!list.length) {
    const p = document.createElement('p');
    p.className = 'empty-note';
    p.textContent = t('quiz.noQuizzes');
    box.append(p);
    return;
  }

  for (const q of list) {
    const card = document.createElement('article');
    card.className = 'quiz-card';

    const h = document.createElement('h3');
    h.textContent = q.title;

    const meta = document.createElement('p');
    meta.className = 'quiz-meta';
    meta.textContent = t('quiz.taskCount', { n: q.tasks.length });

    const row = document.createElement('div');
    row.className = 'action-row';
    for (const [act, key, cls] of [
      ['play', 'quiz.start', 'btn-primary'],
      ['edit', 'quiz.edit', 'btn-secondary'],
      ['share', 'quiz.share', 'btn-secondary'],
      ['del', 'quiz.delete', 'btn-ghost']
    ]) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = cls;
      b.dataset.act = act;
      b.dataset.id = q.id;
      b.textContent = t(key);
      row.append(b);
    }

    card.append(h, meta, row);
    box.append(card);
  }
}

/* ==========================================================================
   8 · ABSPIELER
   ========================================================================== */
const player = { quiz: null, index: 0, score: 0, marks: [], locked: false, order: [], ctx: null, graph: null };

function startQuiz(quiz) {
  if (!quiz || !quiz.tasks.length) { toast(t('quiz.needTask')); return; }
  player.quiz = quiz;
  player.index = 0;
  player.score = 0;
  player.marks = [];        // pro Aufgabe: true = richtig
  for (const id of ['#btn-play-again', '#btn-play-wrong', '#btn-play-copy']) {
    const b = $(id); if (b) b.hidden = true;
  }
  $('#btn-play-again').hidden = true;
  $('#btn-play-copy').hidden = true;
  host.showScreen('play');
  $('#play-title').textContent = quiz.title;
  renderTask();
}

function renderTask() {
  const task = player.quiz.tasks[player.index];
  const body = $('#play-body');
  body.replaceChildren();
  player.locked = false;
  player.ctx = null;

  $('#play-progress').textContent =
    t('quiz.progress', { i: player.index + 1, n: player.quiz.tasks.length });
  $('#play-score').textContent = String(player.score);
  const fb = $('#play-feedback');
  fb.textContent = ''; fb.className = 'feedback';
  $('#btn-play-check').hidden = false;
  $('#btn-play-check').disabled = false;
  $('#btn-play-next').hidden = true;
  $('#btn-play-next').textContent =
    player.index + 1 < player.quiz.tasks.length ? t('btn.nextQuiz') : t('quiz.finish');

  const prompt = document.createElement('p');
  prompt.className = 'play-prompt';
  body.append(prompt);

  if (CANVAS_TYPES.has(task.type)) {
    const cv = document.createElement('canvas');
    cv.id = 'play-canvas';
    cv.className = 'graph-canvas short';
    cv.setAttribute('role', 'img');
    cv.setAttribute('aria-label', t('a11y.quizCanvas'));
    body.append(cv);
  }

  if (task.type === 'match' || task.type === 'tableToEq') {
    // Darstellungswechsel: dieselbe Frage, aber die Vorlage ist eine
    // Wertetabelle statt eines Graphen. Genau dieser Wechsel zwischen
    // Gleichung, Graph und Tabelle steht in jedem Kerncurriculum.
    prompt.textContent = t(task.type === 'match' ? 'quiz.title' : 'rep.fromTable');
    if (task.type === 'tableToEq') body.append(buildTable(task));
    // Reihenfolge pro Durchgang mischen, aber die richtige Antwort merken.
    const all = [task.values, ...task.options];
    player.order = all.map((_, i) => i).sort(() => Math.random() - 0.5);
    const grid = document.createElement('div');
    grid.className = 'options-grid';
    player.order.forEach((srcIndex, pos) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'quiz-opt';
      b.dataset.pos = String(pos);
      b.textContent = `${String.fromCharCode(65 + pos)})  ${eqText(task.form, all[srcIndex])}`;
      grid.append(b);
    });
    body.append(grid);
    $('#btn-play-check').hidden = true;      // Antwort ist der Klick selbst
  }

  if (task.type === 'build') {
    prompt.textContent = t('build.title');
    const sliders = document.createElement('div');
    sliders.className = 'sliders compact';
    body.append(sliders);
    player.ctx = {
      form: task.form, values: defaultValues(task.form), bounds: makeBounds(task.form),
      prefix: 'pl-', play: false, symbolOf: host.symbolOf,
      onChange: () => drawPlayGraph()
    };
    renderSliderGroup(sliders, player.ctx);
  }

  if (task.type === 'graphToTable') {
    prompt.textContent = t('rep.toTable');
    const wrap = document.createElement('div');
    wrap.className = 'answer-pair three';
    task.xs.forEach((x, i) => wrap.append(answerField('play-answer' + (i ? '-' + (i + 1) : ''), `f(${mfmt(x)})`)));
    body.append(wrap);
  }

  if (task.type === 'pointsToEq') {
    const d = FUNCTIONS[task.form];
    prompt.textContent = t('rep.fromPoints', {
      pts: task.xs.map(x => `(${mfmt(x)} | ${mfmt(d.f(x, task.values))})`).join('  ')
    });
    const eq = document.createElement('p');
    eq.className = 'editor-eq';
    eq.textContent = `f(x) = ${d.rhsPattern ? d.rhsPattern() : eqPattern(task.form)}`;
    body.append(eq);
    const wrap = document.createElement('div');
    wrap.className = 'answer-pair three';
    d.params.forEach((prm, i) => {
      wrap.append(answerField('play-answer' + (i ? '-' + (i + 1) : ''), host.symbolOf(prm.id, task.form)));
    });
    body.append(wrap);
  }

  if (task.type === 'value') {
    prompt.textContent = `${eqText(task.form, task.values)} \u2014 ${t('quiz.computeAt', { x: mfmt(task.x0) })}`;
    body.append(answerField('play-answer', t('quiz.yourAnswer')));
  }

  if (task.type === 'readoff') {
    prompt.textContent = t('quiz.readPrompt', { what: t('poi.' + task.what) });
    if (task.what === 'vertex') {
      const pair = document.createElement('div');
      pair.className = 'answer-pair';
      pair.append(answerField('play-answer', 'x'), answerField('play-answer-2', 'y'));
      body.append(pair);
    } else {
      body.append(answerField('play-answer', t('quiz.yourAnswer')));
    }
  }

  if (task.type === 'truefalse') {
    prompt.textContent = task.statement;
    const grid = document.createElement('div');
    grid.className = 'options-grid two';
    for (const [val, key] of [['true', 'quiz.true'], ['false', 'quiz.false']]) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'quiz-opt';
      b.dataset.tf = val;
      b.textContent = t(key);
      grid.append(b);
    }
    body.append(grid);
    $('#btn-play-check').hidden = true;
  }

  if (task.type === 'choice') {
    prompt.textContent = task.question;
    player.order = task.options.map((_, i) => i).sort(() => Math.random() - 0.5);
    const grid = document.createElement('div');
    grid.className = 'options-grid';
    player.order.forEach((srcIndex, pos) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'quiz-opt';
      b.dataset.pos = String(pos);
      b.textContent = `${String.fromCharCode(65 + pos)})  ${task.options[srcIndex]}`;
      grid.append(b);
    });
    body.append(grid);
    $('#btn-play-check').hidden = true;
  }

  if (CANVAS_TYPES.has(task.type)) requestAnimationFrame(drawPlayGraph);
}

/** Wertetabelle als DOM - fuer die Aufgabe "welche Gleichung passt zu dieser
 *  Tabelle?". */
function buildTable(task) {
  const rows = sampleRows(task.form, task.values) ?? [];
  const wrap = document.createElement('div');
  wrap.className = 'table-wrapper compact';
  const table = document.createElement('table');
  const thead = document.createElement('thead');
  const trh = document.createElement('tr');
  for (const label of ['x', 'f(x)']) {
    const th = document.createElement('th');
    th.scope = 'col';
    th.textContent = label;
    trh.append(th);
  }
  thead.append(trh);
  const tbody = document.createElement('tbody');
  for (const row of rows) {
    const tr = document.createElement('tr');
    for (const v of [row.x, row.y]) {
      const td = document.createElement('td');
      td.textContent = mfmt(v);
      tr.append(td);
    }
    tbody.append(tr);
  }
  table.append(thead, tbody);
  wrap.append(table);
  return wrap;
}

/** Gleichung mit Platzhaltern statt Zahlen - zeigt, was gesucht ist. */
function eqPattern(form) {
  const d = FUNCTIONS[form];
  return d.tokens().map(tok => {
    if (tok.text !== undefined) return tok.text;
    if (tok.sup !== undefined) return '^' + tok.sup;
    return host.symbolOf(tok.param, form);
  }).join('');
}

function answerField(id, label) {
  const wrap = document.createElement('div');
  wrap.className = 'form-row';
  const l = document.createElement('label');
  l.htmlFor = id;
  l.textContent = label;
  const i = document.createElement('input');
  i.type = 'text';
  i.inputMode = 'decimal';
  i.id = id;
  i.autocomplete = 'off';
  i.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !player.locked) { e.preventDefault(); checkAnswer(); }
  });
  wrap.append(l, i);
  return wrap;
}

function drawPlayGraph() {
  const cv = $('#play-canvas');
  if (!cv || !player.quiz) return;
  const task = player.quiz.tasks[player.index];
  if (!player.graph || player.graph.canvas !== cv) player.graph = new Graph(cv);
  drawTaskGraph(player.graph, task, task.type === 'build' ? player.ctx?.values : null);
}

/** Toleranz beim Ablesen: grosszuegig genug fuer den Blick auf den Graphen,
 *  eng genug, dass Raten nicht reicht. */
const readTol = (target) => MFE.math.tolerance(target);

function checkAnswer() {
  if (player.locked) return;
  const task = player.quiz.tasks[player.index];
  let ok = false;
  let solution = '';

  if (task.type === 'value') {
    const target = FUNCTIONS[task.form].f(task.x0, task.values);
    const given = parseLoose($('#play-answer')?.value, NaN);
    ok = Number.isFinite(given) && Math.abs(given - target) <= readTol(target);
    solution = `f(${mfmt(task.x0)}) = ${mfmt(target)}`;
  }

  if (task.type === 'readoff') {
    const d = FUNCTIONS[task.form];
    if (task.what === 'yint') {
      const target = d.f(0, task.values);
      const given = parseLoose($('#play-answer')?.value, NaN);
      ok = Number.isFinite(given) && Math.abs(given - target) <= readTol(target);
      solution = `${t('poi.yint')}: ${mfmt(target)}`;
    } else if (task.what === 'root') {
      const v = viewFor(task.form);
      const roots = findZeros((x) => d.f(x, task.values), v.xMin, v.xMax);
      const given = parseLoose($('#play-answer')?.value, NaN);
      ok = Number.isFinite(given) && roots.some(r => Math.abs(given - r) <= readTol(r));
      solution = roots.length
        ? `${t('poi.root')}: ${roots.map(r => mfmt(r)).join(', ')}`
        : t('quiz.noRoot');
      if (!roots.length) ok = false;
    } else {
      const vx = d.vertex?.(task.values);
      const gx = parseLoose($('#play-answer')?.value, NaN);
      const gy = parseLoose($('#play-answer-2')?.value, NaN);
      ok = !!vx && Number.isFinite(gx) && Number.isFinite(gy)
        && Math.abs(gx - vx.x) <= readTol(vx.x) && Math.abs(gy - vx.y) <= readTol(vx.y);
      solution = vx ? `${t('poi.vertex')}: (${mfmt(vx.x)} | ${mfmt(vx.y)})` : '';
    }
  }

  if (task.type === 'graphToTable') {
    const d = FUNCTIONS[task.form];
    const wrong = [];
    let allOk = true;
    task.xs.forEach((x, i) => {
      const want = d.f(x, task.values);
      const given = parseLoose($('#play-answer' + (i ? '-' + (i + 1) : ''))?.value, NaN);
      if (!(Number.isFinite(given) && Math.abs(given - want) <= readTol(want))) {
        allOk = false;
        wrong.push(`f(${mfmt(x)}) = ${mfmt(want)}`);
      }
    });
    ok = allOk;
    solution = wrong.join(', ');
  }

  if (task.type === 'pointsToEq') {
    // Geprueft werden die Parameter, nicht die Kurve: gesucht ist die
    // Gleichung, und die soll auch hingeschrieben werden.
    const d = FUNCTIONS[task.form];
    let allOk = true;
    d.params.forEach((prm, i) => {
      const want = task.values[prm.id];
      const given = parseLoose($('#play-answer' + (i ? '-' + (i + 1) : ''))?.value, NaN);
      if (!(Number.isFinite(given) && Math.abs(given - want) <= tolerance(want, prm.step))) allOk = false;
    });
    ok = allOk;
    solution = eqText(task.form, task.values);
  }

  if (task.type === 'build') {
    // Dieselbe Analyse wie im Uebungsteil - nicht zwei Auswertungen, die
    // frueher oder spaeter auseinanderlaufen.
    const res = MFE.diagnose.analyseBuild(task.form, task.values, player.ctx.values);
    ok = res.solved;
    solution = ok
      ? eqText(task.form, task.values)
      : res.findings
          .map(f => t('find.' + f.kind, {
            ...f.vars,
            a: host.symbolOf(f.ids[0], task.form),
            b: f.ids[1] ? host.symbolOf(f.ids[1], task.form) : ''
          }))
          .join(' \u00b7 ');
  }

  finish(ok, solution);
}

function answerByClick(correct, solution, clickedEl, correctEl) {
  if (player.locked) return;
  $$('#play-body .quiz-opt').forEach(b => { b.disabled = true; });
  correctEl?.classList.add('is-correct');
  if (!correct) clickedEl?.classList.add('is-wrong');
  finish(correct, solution);
}

function finish(ok, solution) {
  player.locked = true;
  // Erst hier eintragen, nicht beim Rendern: eine Aufgabe kann uebersprungen
  // werden, dann darf sie auch keinen Eintrag bekommen.
  player.marks[player.index] = !!ok;
  if (ok) player.score++;
  $('#play-score').textContent = String(player.score);
  const fb = $('#play-feedback');
  fb.className = 'feedback ' + (ok ? 'ok' : 'err');
  fb.textContent = ok ? t('quiz.right') : `${t('quiz.wrong')} ${solution}`.trim();
  $('#btn-play-check').hidden = true;
  $('#btn-play-next').hidden = false;
  $('#btn-play-next').focus();
}

function nextTask() {
  if (player.index + 1 < player.quiz.tasks.length) {
    player.index++;
    renderTask();
  } else {
    showSummary();
  }
}

function showSummary() {
  const body = $('#play-body');
  body.replaceChildren();
  const n = player.quiz.tasks.length;
  const h = document.createElement('h3');
  h.textContent = t('quiz.result', { ok: player.score, all: n });
  const list = document.createElement('ul');
  list.className = 'result-list';
  player.quiz.tasks.forEach((task, i) => {
    const li = document.createElement('li');
    const m = player.marks[i];
    li.className = m === true ? 'is-ok' : m === false ? 'is-err' : '';
    li.textContent = `${i + 1}. ${taskLabel(task)}`;
    list.append(li);
  });

  const p = document.createElement('p');
  const share = Math.round((player.score / n) * 100);
  p.className = 'play-prompt';
  p.textContent = share === 100 ? t('quiz.allRight') : t('quiz.keepGoing', { p: share });
  body.append(h, p, list);
  $('#play-progress').textContent = t('quiz.done');
  $('#play-feedback').textContent = '';
  $('#play-feedback').className = 'feedback';
  $('#btn-play-check').hidden = true;
  $('#btn-play-next').hidden = true;
  $('#btn-play-again').hidden = false;
  $('#btn-play-copy').hidden = false;
  // Nur anbieten, wenn es auch etwas zu wiederholen gibt.
  $('#btn-play-wrong').hidden = player.score >= n;
  $('#btn-play-copy').hidden = false;
}


/* ==========================================================================
   8b · ZUFALLSQUIZ
   Der groesste Zeitgewinn fuer Lehrkraefte: "zehn gemischte Aufgaben zu
   linearen Funktionen" auf Knopfdruck. Die freie Frage bleibt aussen vor -
   sie braucht einen selbst geschriebenen Text.
   ========================================================================== */
const RANDOM_TYPES = ['match', 'build', 'value', 'readoff', 'truefalse'];

/** Eine Stelle, an der die Funktion definiert ist. Bei Wurzel, Logarithmus
 *  und Hyperbel ist die Null gerade nicht immer brauchbar. */
function safeX(form, vals) {
  const d = FUNCTIONS[form];
  for (const x of [0, 1, 2, 3, 4, -1, -2, 5, 6, 0.5]) {
    const y = d.f(x, vals);
    if (Number.isFinite(y) && Math.abs(y) < 1e5) return x;
  }
  return null;
}

function randomTask(type, form) {
  const vals = randomValues(form);
  const d = FUNCTIONS[form];

  if (type === 'match') return sanitizeTask({ type, form, values: vals, options: makeDistractors(form, vals, 3) });
  if (type === 'tableToEq') return sanitizeTask({ type, form, values: vals, options: makeDistractors(form, vals, 3) });

  if (type === 'graphToTable' || type === 'pointsToEq') {
    const want = type === 'pointsToEq' ? 2 : 3;
    const xs = [];
    for (let k = -4; k <= 4 && xs.length < want; k++) {
      if (Number.isFinite(d.f(k, vals))) xs.push(k);
    }
    return xs.length === want ? sanitizeTask({ type, form, values: vals, xs }) : null;
  }
  if (type === 'build') return sanitizeTask({ type, form, values: vals });

  if (type === 'value') {
    const x0 = safeX(form, vals);
    return x0 === null ? null : sanitizeTask({ type, form, values: vals, x0 });
  }

  if (type === 'readoff') {
    const choices = ['yint'];
    if (d.vertex) choices.push('vertex');
    const v = viewFor(form);
    if (findZeros((x) => d.f(x, vals), v.xMin, v.xMax).length) choices.push('root');
    if (!Number.isFinite(d.f(0, vals))) {
      const i = choices.indexOf('yint');
      if (i >= 0) choices.splice(i, 1);           // ohne y-Achsenabschnitt
    }
    if (!choices.length) return null;
    return sanitizeTask({ type, form, values: vals, what: pick(choices) });
  }

  if (type === 'truefalse') {
    const x0 = safeX(form, vals);
    if (x0 === null) return null;
    const real = d.f(x0, vals);
    const wantTrue = Math.random() < 0.5;
    // Die falsche Behauptung muss deutlich danebenliegen, sonst haengt die
    // Antwort an der Rundung.
    const off = Math.max(1, Math.abs(real) * 0.35) * (Math.random() < 0.5 ? 1 : -1);
    const claim = Math.round((wantTrue ? real : real + off) * 100) / 100;
    return sanitizeTask({
      type, form, values: vals,
      statement: t('quiz.tfValueAt', { f: eqText(form, vals), x: mfmt(x0), y: mfmt(claim) }),
      answer: wantTrue
    });
  }
  return null;
}

function buildRandomQuiz(category, count, types) {
  const forms = (CATEGORY_FORMS[category] ?? []).filter(f => FUNCTIONS[f]);
  if (!forms.length || !types.length) return null;
  const tasks = [];
  let guard = 0;
  while (tasks.length < count && guard++ < count * 25) {
    const task = randomTask(pick(types), pick(forms));
    if (task) tasks.push(task);
  }
  if (!tasks.length) return null;
  return {
    id: uid(),
    title: t('quiz.rndTitle', { cat: t('cat.' + category), n: tasks.length }),
    created: Date.now(),
    tasks
  };
}

function openRandomPanel() {
  if (!licence.has('randomQuiz')) { proHint(); return; }
  const sel = $('#rnd-category');
  sel.replaceChildren();
  for (const cat of Object.keys(CATEGORY_FORMS)) {
    if (!licence.has('cat.' + cat)) continue;
    const o = document.createElement('option');
    o.value = cat; o.textContent = t('cat.' + cat);
    sel.append(o);
  }
  const list = $('#rnd-type-list');
  list.replaceChildren();
  for (const ty of RANDOM_TYPES) {
    const label = document.createElement('label');
    label.className = 'chip';
    const box = document.createElement('input');
    box.type = 'checkbox'; box.value = ty; box.checked = true;
    // Nachbauen gehoert zur Pro-Ausgabe; in Lite gaebe es sonst Aufgaben,
    // die sich nicht loesen lassen.
    if (ty === 'build' && !licence.has('practice')) { box.checked = false; box.disabled = true; }
    const span = document.createElement('span');
    span.textContent = t('type.' + ty);
    label.append(box, span);
    list.append(label);
  }
  $('#random-panel').hidden = false;
  $('#random-panel').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function makeRandomQuiz() {
  const cat = $('#rnd-category').value;
  const count = clamp(Math.round(Number($('#rnd-count').value) || 10), 3, MAX_TASKS);
  const types = Array.from($('#rnd-type-list').querySelectorAll('input:checked')).map(b => b.value);
  if (!types.length) { toast(t('quiz.rndNoType')); return; }
  const quiz = buildRandomQuiz(cat, count, types);
  if (!quiz) { toast(t('quiz.rndFail')); return; }
  if (upsert(quiz)) {
    $('#random-panel').hidden = true;
    toast(t('quiz.saved'));
    renderList();
  }
}

/* ==========================================================================
   8c · WEITERGEBEN PER QR-CODE
   Einen 600 Zeichen langen Link tippt im Klassenraum niemand ab.
   ========================================================================== */
let qrUrl = '';

function showQr(quiz) {
  const url = linkFor(quiz);
  if (url.length > MAX_LINK) { toast(t('quiz.tooLong')); return; }
  qrUrl = url;
  const dlg = $('#qr-dialog');
  if (!dlg?.showModal) { shareQuiz(quiz); return; }
  // Ueber nav: der Zurueck-Knopf schliesst den Dialog, statt den Bildschirm
  // zu wechseln.
  if (!MFE.nav.openDialog(dlg)) return;
  // Erst nach dem Oeffnen zeichnen: vorher hat das Canvas keine Breite.
  requestAnimationFrame(() => {
    // Bewusst immer schwarz auf weiss, unabhaengig vom Farbschema - ein
    // dunkler QR-Code auf dunklem Grund ist nicht lesbar.
    const code = MFE.qr?.draw($('#qr-canvas'), url, {
      ec: url.length > 800 ? 'L' : 'M', dark: '#000000', light: '#ffffff'
    });
    const note = $('#qr-note');
    if (!code) { note.textContent = t('quiz.qrTooBig'); return; }
    note.textContent = code.version >= 20
      ? t('quiz.qrDense', { v: code.version })
      : t('quiz.qrOk', { v: code.version });
  });
}

/* ==========================================================================
   8c2 · SICHERUNGSDATEI
   Selbst gebaute Quizze lagen bisher ausschliesslich im localStorage. App
   deinstallieren, Browserdaten loeschen oder Speicher voll - und die Arbeit
   war weg. Eine Datei liegt ausserhalb der App und ueberlebt beides.
   ========================================================================== */
const BACKUP_TAG = 'mathfunctions-explorer/quizzes';

function backupSave() {
  const list = loadAll();
  if (!list.length) { toast(t('quiz.noQuizzes')); return; }
  const payload = JSON.stringify({ format: BACKUP_TAG, version: 1, at: new Date().toISOString(), quizzes: list }, null, 1);
  const blob = new Blob([payload], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const day = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `mathfunctions-quizze-${day}.json`;
  a.click();
  // Ohne das bliebe die Datei im Speicher liegen, solange die Seite offen ist.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast(t('quiz.backupDone', { n: list.length }));
}

/**
 * Liest eine Sicherung ein. Die Datei kommt von aussen - jedes Quiz laeuft
 * einzeln durch sanitizeQuiz(), ein kaputtes reisst die anderen nicht mit.
 * Bestehende Quizze bleiben erhalten; Eingelesenes bekommt neue Kennungen,
 * damit nichts ueberschrieben wird.
 */
async function backupLoad(file) {
  if (!file) return;
  if (file.size > 4 * 1024 * 1024) { toast(t('quiz.backupTooBig')); return; }
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch { toast(t('quiz.backupBad')); return; }

  const raw = Array.isArray(data) ? data
            : (data?.format === BACKUP_TAG && Array.isArray(data.quizzes)) ? data.quizzes
            : null;
  if (!raw) { toast(t('quiz.backupBad')); return; }

  const list = loadAll();
  let added = 0, skipped = 0;
  for (const item of raw.slice(0, MAX_QUIZZES)) {
    const clean = sanitizeQuiz(item);
    if (!clean) { skipped++; continue; }
    if (list.length >= MAX_QUIZZES) { skipped++; continue; }
    clean.id = uid();
    list.unshift(clean);
    added++;
  }
  if (!added) { toast(t('quiz.backupBad')); return; }
  if (saveAll(list)) {
    renderList();
    toast(skipped ? t('quiz.backupPartly', { n: added, k: skipped }) : t('quiz.backupRead', { n: added }));
  }
}

/* ==========================================================================
   8d · ERGEBNIS ALS TEXT
   ========================================================================== */
function resultText() {
  if (!player.quiz) return '';
  const n = player.quiz.tasks.length;
  const lines = [
    player.quiz.title,
    t('quiz.result', { ok: player.score, all: n }),
    new Date().toLocaleDateString(MFE.i18n.lang === 'de' ? 'de-DE' : 'en-GB'),
    ''
  ];
  player.quiz.tasks.forEach((task, i) => {
    const m = player.marks[i];
    const sign = m === true ? '\u2713' : m === false ? '\u2717' : '\u2013';
    lines.push(`${sign} ${i + 1}. ${taskLabel(task)}`);
  });
  return lines.join('\n');
}

async function copyResult() {
  const text = resultText();
  if (!text) return;
  try { await navigator.clipboard.writeText(text); toast(t('msg.copied')); }
  catch { toast(t('msg.copyFail')); }
}

/* ==========================================================================
   9 · VERWEIS AUF DIE PRO-AUSGABE
   ========================================================================== */
function proHint() {
  toast(t('msg.pro'));
  const dlg = $('#pro-dialog');
  if (dlg?.showModal) { try { dlg.showModal(); } catch { /* schon offen */ } }
}

/* ==========================================================================
   10 · EREIGNISSE
   ========================================================================== */
function bind() {
  $('#quiz-list').addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const q = getQuiz(b.dataset.id);
    if (!q) { renderList(); return; }
    switch (b.dataset.act) {
      case 'play': startQuiz(q); break;
      case 'edit': openBuilder(q.id); break;
      case 'share': showQr(q); break;
      case 'del':
        if (confirm(t('quiz.confirmDelete', { title: q.title }))) { removeQuiz(q.id); renderList(); }
        break;
    }
  });

  $('#btn-new-quiz').addEventListener('click', () => openBuilder(null));
  $('#btn-import-quiz').addEventListener('click', importFromPrompt);
  $('#btn-random-quiz').addEventListener('click', openRandomPanel);
  $('#btn-random-make').addEventListener('click', makeRandomQuiz);
  $('#btn-random-cancel').addEventListener('click', () => { $('#random-panel').hidden = true; });
  $('#btn-qr-close').addEventListener('click', () => $('#qr-dialog').close());
  $('#btn-qr-copy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(qrUrl); toast(t('msg.copied')); }
    catch { toast(t('msg.copyFail')); }
  });
  $('#btn-play-copy').addEventListener('click', copyResult);

  $('#builder-tasks').addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const i = Number(b.dataset.index);
    const tasks = builder.quiz.tasks;
    if (!Number.isInteger(i) || i < 0 || i >= tasks.length) return;
    if (b.dataset.act === 'up' && i > 0) { [tasks[i - 1], tasks[i]] = [tasks[i], tasks[i - 1]]; }
    else if (b.dataset.act === 'down' && i < tasks.length - 1) { [tasks[i + 1], tasks[i]] = [tasks[i], tasks[i + 1]]; }
    else if (b.dataset.act === 'del') { tasks.splice(i, 1); if (builder.editing === i) { builder.draft = null; builder.editing = -1; } }
    else if (b.dataset.act === 'edit') { startTask(tasks[i].type, i); return; }
    renderBuilder();
  });

  $('#btn-add-task').addEventListener('click', () => startTask('match', -1));
  $('#btn-editor-save').addEventListener('click', commitTask);
  $('#btn-editor-cancel').addEventListener('click', () => {
    builder.draft = null; builder.editing = -1; renderBuilder();
  });
  $('#editor-body').addEventListener('click', (e) => {
    if (!e.target.closest('#btn-take-explorer')) return;
    const ex = host.explorer();
    if (!ex) return;
    if (!allowedForms().includes(ex.form)) { proHint(); return; }
    builder.draft.form = ex.form;
    builder.draft.values = { ...ex.values };
    renderEditor();
  });

  $('#btn-builder-save').addEventListener('click', saveQuiz);
  $('#btn-builder-back').addEventListener('click', openList);

  $('#play-body').addEventListener('click', (e) => {
    const opt = e.target.closest('.quiz-opt');
    if (!opt || player.locked) return;
    const task = player.quiz.tasks[player.index];
    if (task.type === 'truefalse') {
      const given = opt.dataset.tf === 'true';
      const right = $$('#play-body .quiz-opt').find(b => (b.dataset.tf === 'true') === task.answer);
      answerByClick(given === task.answer, right?.textContent ?? '', opt, right);
      return;
    }
    const pos = Number(opt.dataset.pos);
    const src = player.order[pos];
    if (task.type === 'match' || task.type === 'tableToEq') {
      const rightPos = player.order.indexOf(0);      // 0 = die richtige Kurve
      const rightEl = $(`#play-body .quiz-opt[data-pos="${rightPos}"]`);
      answerByClick(src === 0, eqText(task.form, task.values), opt, rightEl);
    } else if (task.type === 'choice') {
      const rightPos = player.order.indexOf(task.correct);
      const rightEl = $(`#play-body .quiz-opt[data-pos="${rightPos}"]`);
      answerByClick(src === task.correct, task.options[task.correct], opt, rightEl);
    }
  });

  $('#btn-play-check').addEventListener('click', checkAnswer);
  $('#btn-play-next').addEventListener('click', nextTask);
  $('#btn-backup-save').addEventListener('click', backupSave);
  $('#btn-backup-load').addEventListener('click', () => $('#backup-file').click());
  $('#backup-file').addEventListener('change', (e) => {
    backupLoad(e.target.files?.[0]);
    e.target.value = '';         // sonst laesst sich dieselbe Datei nicht erneut waehlen
  });

  $('#btn-play-wrong').addEventListener('click', () => {
    const wrong = player.quiz.tasks.filter((_, i) => player.marks[i] === false);
    if (!wrong.length) return;
    startQuiz({ ...player.quiz, title: t('quiz.wrongOnly', { title: player.quiz.title }), tasks: wrong });
  });

  $('#btn-play-again').addEventListener('click', () => {
    $('#btn-play-again').hidden = true;
    startQuiz(player.quiz);
  });
  $('#btn-play-back').addEventListener('click', () => {
    $('#btn-play-again').hidden = true;
    openList();
  });
}

async function shareQuiz(q) {
  const url = linkFor(q);
  if (url.length > MAX_LINK) { toast(t('quiz.tooLong')); return; }
  try { await navigator.clipboard.writeText(url); toast(t('msg.copied')); }
  catch { toast(t('msg.copyFail')); }
}

function importFromPrompt() {
  const raw = prompt(t('quiz.pasteLink'));
  if (!raw) return;
  const m = String(raw).match(/#quiz=([A-Za-z0-9\-_]+)/) || String(raw).match(/^([A-Za-z0-9\-_]+)$/);
  const q = m && decodeQuiz(m[1]);
  if (!q) { toast(t('quiz.importFail')); return; }
  q.id = uid();
  if (upsert(q)) { toast(t('quiz.imported')); renderList(); }
}

/** Wird von app.js beim Start gerufen, wenn im Hash ein Quiz steht. */
function importFromHash(code) {
  const q = decodeQuiz(code);
  if (!q) { toast(t('quiz.importFail')); return false; }
  q.id = uid();
  upsert(q);
  startQuiz(q);
  return true;
}

function init(hooks) {
  Object.assign(host, hooks);
  bind();
}

/** Nach einem Sprachwechsel muessen die offenen Ansichten neu beschriftet
 *  werden - sonst steht der Editor weiter auf Deutsch. */
function relabel() {
  if (!$('#screen-quizzes')) return;
  if ($('#screen-quizzes').classList.contains('is-active')) renderList();
  if ($('#screen-builder').classList.contains('is-active')) { renderBuilder(); if (builder.draft) renderEditor(); }
  if ($('#screen-play').classList.contains('is-active') && player.quiz) renderTask();
}

return {
  backupSave, backupLoad,
  init, openList, openBuilder, startQuiz, importFromHash, relabel,
  buildRandomQuiz, showQr, resultText,
  loadAll, getQuiz, sanitizeQuiz, decodeQuiz, encodeQuiz, linkFor,
  randomValues, makeDistractors, randomTask, eqText, TYPES
};
})();
