/* ==========================================================================
   paths.js  ·  Lernpfade zum selbststaendigen Lernen
   --------------------------------------------------------------------------
   Ein Lernpfad fuehrt durch eine Funktionsklasse in der Reihenfolge des
   Schulbuchs. Jeder Schritt fuehrt GENAU EINEN neuen Gedanken ein und laeuft
   in vier Phasen ab:

     1. Vermuten   Frage vor dem Ausprobieren (Predict-Observe-Explain).
                   Wer sich festlegt, bemerkt den Widerspruch, wenn der
                   Graph etwas anderes tut.
     2. Entdecken  Nur der neue Parameter ist frei. Auftraege werden beim
                   LOSLASSEN des Reglers geprueft, nicht beim Vorbeiziehen -
                   sonst waere "S(0 | 3)" schon erledigt, wenn man von -8 nach
                   +8 durchzieht.
     3. Merken     Merkkasten im Stil des Schulbuchs.
     4. Ueben      Gemischte Aufgaben mit Mindestanforderung. Eine falsche
                   Antwort, hinter der eine bekannte Fehlvorstellung steckt,
                   verweist auf den Schritt, der genau diesen Parameter
                   eingefuehrt hat.

   Inhalte stehen NICHT hier, sondern in je einer Datei pro Klasse
   (js/paths-quadratic.js ...). Diese melden sich ueber register() an. Ein
   neuer Pfad ist damit reine Inhaltsarbeit.

   Fortschritt bleibt auf dem Geraet (localStorage), ohne Namen und Konto.
   Alles, was von dort zurueckkommt, wird geprueft - wie bei den Quizzen.
   ========================================================================== */
'use strict';
window.MFE = window.MFE || {};

MFE.paths = (() => {
const { $, toast, renderSliderGroup, setMath, cssId } = MFE.ui;
const { tolerance, fmt, mfmt, parseLoose, FUNCTIONS } = MFE.math;
const { Graph, drawScene } = MFE.graph;
const licence = MFE.licence;
const t = (k, v) => MFE.i18n.t(k, v);

const STORE_KEY = 'mfe:paths';
const STORE_REV = 1;
/** Anteil der Punkte, ab dem ein Schritt als geschafft gilt (4 von 5). */
const PASS_SHARE = 0.8;
const TRAIL_MAX = 8;
const DEFAULT_COUNT = 5;
/** Reihenfolge der Klassen in der Auswahl - dieselbe wie auf der Startseite. */
const CLASS_ORDER = ['linear', 'quadratic', 'exponential', 'trig'];
const PHASES = ['predict', 'explore', 'rule', 'practice'];
const TASK_TYPES = new Set(['choice', 'input', 'build']);

/* Von aussen gesetzt (app.js). */
let host = {
  showScreen: () => {},
  symbolOf: (id) => id,
  scale: () => 1,
  proHint: () => {}
};

/* ==========================================================================
   1 · REGISTER
   ========================================================================== */
const PATHS = {};

/** Ein Pfad meldet sich an. Grobe Formfehler fallen sofort auf - und nicht
 *  erst, wenn eine Schuelerin bei Schritt 6 haengen bleibt. */
function register(def) {
  if (!def || typeof def.id !== 'string' || !Array.isArray(def.steps) || !def.steps.length) {
    throw new Error('paths.register: Pfad ohne id oder ohne Schritte');
  }
  const ids = new Set();
  for (const s of def.steps) {
    if (!s.id || ids.has(s.id)) throw new Error(`paths.register: Schritt-ID "${s.id}" fehlt oder ist doppelt`);
    ids.add(s.id);
    if (!FUNCTIONS[s.form]) throw new Error(`paths.register: unbekannte Form "${s.form}" in ${s.id}`);
    for (const id of s.free) {
      if (!FUNCTIONS[s.form].params.some(p => p.id === id)) {
        throw new Error(`paths.register: Parameter "${id}" gibt es in ${s.form} nicht (${s.id})`);
      }
    }
    if (!Array.isArray(s.tasks) || !s.tasks.length) throw new Error(`paths.register: ${s.id} hat keine Aufgaben`);
  }
  PATHS[def.id] = def;
  return def;
}

/* ==========================================================================
   2 · BAUKASTEN FUER DIE INHALTSDATEIEN
   Bewusst frei von DOM: tools/paths-test.mjs erzeugt damit tausende
   Aufgaben und prueft jede einzelne.
   ========================================================================== */
const pick = (a) => a[Math.floor(Math.random() * a.length)];
function shuffle(list) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const near = (a, b, tol = 1e-6) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tol;
const round4 = (v) => Math.round(v * 1e4) / 1e4;

/** Liefern zwei Wertesaetze denselben Graphen? 41 Stuetzstellen in -10..10. */
function sameCurve(form, a, b) {
  const d = FUNCTIONS[form];
  let checked = 0;
  for (let i = 0; i <= 40; i++) {
    const x = -10 + i * 0.5;
    const ya = d.f(x, a), yb = d.f(x, b);
    if (!Number.isFinite(ya) || !Number.isFinite(yb)) continue;
    checked++;
    if (Math.abs(ya - yb) > 1e-6 * Math.max(1, Math.abs(ya))) return false;
  }
  return checked > 0;
}

const paramDef = (form, id) => FUNCTIONS[form].params.find(p => p.id === id);
const inSlider = (p, v) => v >= p.min - 1e-9 && v <= p.max + 1e-9;

/**
 * Typische Verwechslungen fuer die freien Parameter. Nur die FREIEN - in
 * Schritt 2 soll keine falsche Antwort an a drehen, das kommt erst in
 * Schritt 5. Rueckgabe: [{ values, mis }]; mis ist eine Kennung der
 * Fehlvorstellung, ueber die ein Rueckverweis entstehen kann.
 */
function variants(form, correct, free) {
  const out = [];
  const add = (values, mis) => {
    for (const id of free) {
      const p = paramDef(form, id);
      if (!inSlider(p, values[id])) return;
    }
    out.push({ values, mis });
  };
  for (const id of free) {
    const p = paramDef(form, id);
    const v = correct[id];
    if (v !== 0) add({ ...correct, [id]: -v }, 'sign');
    for (const delta of [1, -1, 2, -2]) add({ ...correct, [id]: round4(v + delta) }, 'off');
    if (p.role === 'stretch' && v !== 0 && Math.abs(Math.abs(v) - 1) > 1e-9) {
      add({ ...correct, [id]: round4(1 / v) }, 'reciprocal');
    }
  }
  for (let i = 0; i < free.length; i++) {
    for (let j = i + 1; j < free.length; j++) {
      const [p, q] = [free[i], free[j]];
      if (correct[p] !== correct[q]) add({ ...correct, [p]: correct[q], [q]: correct[p] }, 'swap');
    }
  }
  return out;
}

/**
 * Antwortmoeglichkeiten "welche Gleichung gehoert zum Graphen".
 * extra: Ablenker, die der Inhalt selbst vorgibt (stehen vorn).
 * Rueckgabe: { options: [{ eq }], correct: 0 } - gemischt wird beim Anzeigen.
 */
function eqOptions(form, correct, free, n = 3, extra = []) {
  const d = FUNCTIONS[form];
  const chosen = [];
  const seen = new Set([d.rhs(correct)]);
  const take = (values) => {
    if (chosen.length >= n) return;
    const key = d.rhs(values);
    if (seen.has(key) || sameCurve(form, values, correct)) return;
    if (chosen.some(c => sameCurve(form, c, values))) return;
    seen.add(key);
    chosen.push(values);
  };
  for (const v of extra) take(v);
  for (const c of shuffle(variants(form, correct, free))) take(c.values);
  // Auffuellen mit zufaelligen Werten aus den Pools der freien Parameter.
  let guard = 0;
  while (chosen.length < n && guard++ < 200) {
    const cand = { ...correct };
    for (const id of free) {
      const p = paramDef(form, id);
      cand[id] = pick(p.pool ?? [p.min, p.max]);
    }
    take(cand);
  }
  return { options: [{ eq: correct }, ...chosen.map(v => ({ eq: v }))], correct: 0 };
}

/* ==========================================================================
   3 · FORTSCHRITT
   ========================================================================== */
const STATES = new Set(['done', 'skipped']);

function sanitizeStore(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [pid, entry] of Object.entries(raw)) {
    const path = PATHS[pid];
    if (!path || !entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const clean = {};
    for (const s of path.steps) {
      const e = entry[s.id];
      if (!e || typeof e !== 'object' || !STATES.has(e.s)) continue;
      const n = Number.isInteger(e.n) && e.n > 0 && e.n <= 50 ? e.n : DEFAULT_COUNT;
      const best = Number.isFinite(e.best) ? Math.min(Math.max(e.best, 0), n) : 0;
      clean[s.id] = { s: e.s, best, n };
    }
    if (Object.keys(clean).length) out[pid] = clean;
  }
  return out;
}

function loadStore() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
    return sanitizeStore(raw?.rev === STORE_REV ? raw.paths : null);
  } catch { return {}; }
}
function saveStore(data) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify({ rev: STORE_REV, paths: data })); return true; }
  catch { return false; }
}

const passedState = (e) => !!e && STATES.has(e.s);

/** Zustand eines Schritts: done | skipped | open | locked. */
function stepState(pid, i, store = loadStore()) {
  const path = PATHS[pid];
  const step = path?.steps[i];
  if (!step) return 'locked';
  const e = store[pid]?.[step.id];
  if (passedState(e)) return e.s;
  if (i === 0) return 'open';
  return passedState(store[pid]?.[path.steps[i - 1].id]) ? 'open' : 'locked';
}

/** Ergebnis eintragen. Ein bestandener Test auf einem gesperrten Schritt
 *  traegt alle Schritte davor als "uebersprungen" ein. */
function recordPass(pid, i, points, n) {
  const path = PATHS[pid];
  if (!path?.steps[i]) return false;
  const store = loadStore();
  const entry = store[pid] ?? (store[pid] = {});
  const id = path.steps[i].id;
  // Bestanden ist bestanden - ob gelernt oder direkt getestet. Noch nicht
  // bestandene Schritte DAVOR kann es nur nach einem Test geben; sie heissen
  // dann "skipped" und schalten den Weg frei, ohne als gelernt zu gelten.
  entry[id] = { s: 'done', best: Math.max(entry[id]?.best ?? 0, points), n };
  for (let k = 0; k < i; k++) {
    const sid = path.steps[k].id;
    if (!passedState(entry[sid])) entry[sid] = { s: 'skipped', best: 0, n: DEFAULT_COUNT };
  }
  return saveStore(store);
}

function resetPath(pid) {
  const store = loadStore();
  delete store[pid];
  saveStore(store);
}

/** Wie viele Schritte gelten als geschafft? */
function countPassed(pid, store = loadStore()) {
  const path = PATHS[pid];
  if (!path) return 0;
  return path.steps.filter(s => passedState(store[pid]?.[s.id])).length;
}

/** Index des Schritts, mit dem es weitergeht, oder -1 (alles geschafft). */
function nextOpen(pid, store = loadStore()) {
  const path = PATHS[pid];
  if (!path) return -1;
  return path.steps.findIndex((_, i) => stepState(pid, i, store) === 'open');
}

const needFor = (n) => Math.ceil(n * PASS_SHARE - 1e-9);

/* ==========================================================================
   4 · TEXTE
   Variablen in den Aufgaben bleiben bis zur Anzeige roh, damit ein
   Sprachwechsel mitten in der Aufgabe Komma und Punkt richtig setzt.
     Zahl                    -> 2,5 bzw. 2.5 mit typografischem Minus
     ['eq', form, values]    -> f(x) = ...
     ['rhs', form, values]   -> nur die rechte Seite
     ['pt', x, y]            -> (x | y)
     ['br', d]               -> (x - d) bzw. (x + d)
     ['t', key]              -> uebersetzter Text
   Dazu kommen immer die Buchstaben der Parameter ({a}, {d}, {e} ...): wer in
   den Einstellungen andere Buchstaben gewaehlt hat (wie im eigenen
   Schulbuch), findet sie auch im Lernpfad wieder.
   ========================================================================== */
function fmtVar(v) {
  if (typeof v === 'number') return mfmt(v);
  if (Array.isArray(v)) {
    if (v[0] === 'eq') return `f(x) = ${FUNCTIONS[v[1]].rhs(v[2])}`;
    if (v[0] === 'rhs') return FUNCTIONS[v[1]].rhs(v[2]);
    if (v[0] === 'pt') return `(${mfmt(v[1])} | ${mfmt(v[2])})`;
    if (v[0] === 'br') return MFE.math.bracket(v[1]);
    if (v[0] === 't') return t(v[1]);
  }
  return String(v ?? '');
}

function symbolVars(form) {
  const out = {};
  for (const f of new Set([form, 'quad_vertex', 'quad_standard'])) {
    for (const p of FUNCTIONS[f]?.params ?? []) out[p.id] ??= host.symbolOf(p.id, f);
  }
  // Die Buchstaben der eigenen Form haben Vorrang.
  for (const p of FUNCTIONS[form]?.params ?? []) out[p.id] = host.symbolOf(p.id, form);
  return out;
}

/** Terme wie "(x − 2)²" nicht mitten im Ausdruck umbrechen - am Telefon
 *  stand sonst "(x −" am Zeilenende und "2)²" in der naechsten Zeile. */
const keepTerms = (s) => s.replace(/\(x ([\u2212+−]) /g, '(x\u00a0$1\u00a0');

/** [key, vars] -> fertiger Satz. */
function txt(spec, form) {
  if (!spec) return '';
  if (typeof spec === 'string') return keepTerms(t(spec, symbolVars(form)));
  const [key, vars] = spec;
  const out = { ...symbolVars(form) };
  for (const [k, v] of Object.entries(vars ?? {})) out[k] = fmtVar(v);
  return keepTerms(t(key, out));
}

function optionText(opt, form) {
  if (opt.eq) return `f(x) = ${FUNCTIONS[opt.form ?? form].rhs(opt.eq)}`;
  if (opt.text != null) return String(opt.text);
  return txt(opt.k ? [opt.k, opt.v] : '', form);
}

/* ==========================================================================
   5 · AUSWERTUNG (ohne DOM, fuer die Tests herausgereicht)
   ========================================================================== */
/** Eingabefelder: Werte gegen Antworten. Ungeordnet bei Nullstellen, wo
 *  x1 und x2 vertauscht sein duerfen. */
function gradeInput(task, given) {
  if (!Array.isArray(given) || given.length !== task.answers.length) return false;
  if (given.some(v => !Number.isFinite(v))) return false;
  const tol = (target) => tolerance(target, 0.1);
  if (!task.unordered) return task.answers.every((a, i) => Math.abs(given[i] - a) <= tol(a));
  const rest = task.answers.slice();
  for (const g of given) {
    const k = rest.findIndex(a => Math.abs(g - a) <= tol(a));
    if (k < 0) return false;
    rest.splice(k, 1);
  }
  return true;
}

/** Regler: jeder freie Parameter innerhalb der Toleranz seiner Schrittweite. */
function gradeBuild(task, values) {
  return task.free.every(id => {
    const p = paramDef(task.form, id);
    return Math.abs(values[id] - task.target[id]) <= tolerance(task.target[id], p.step);
  });
}

/** Punkte fuer eine Aufgabe: 1 im ersten, 0,5 im zweiten Versuch. */
const markPoints = (mark) => (mark === true ? 1 : mark === 'half' ? 0.5 : 0);

/** Zu welchem Begriff gehoert ein Parameter? Fuer den Rueckverweis. */
function conceptOf(path, form, id) {
  return path?.concepts?.[form]?.[id] ?? null;
}

/** Fruehester Schritt VOR dem aktuellen, der den Begriff einfuehrt. */
function remedyStep(path, concept, before) {
  if (!path || !concept) return -1;
  const i = path.steps.findIndex(s => (s.concepts ?? []).includes(concept));
  return i >= 0 && i < before ? i : -1;
}

/** Aufgaben fuer eine Uebungsrunde. Die Erzeuger werden reihum gemischt,
 *  damit nicht dreimal dieselbe Art hintereinander kommt. */
function buildTasks(step) {
  const n = step.count ?? DEFAULT_COUNT;
  const out = [];
  let pool = [];
  let guard = 0;
  while (out.length < n && guard++ < n * 20) {
    if (!pool.length) pool = shuffle(step.tasks);
    const gen = pool.shift();
    let task = null;
    try { task = gen(); } catch (e) { console.error('[paths] Aufgabe:', e); }
    if (task && TASK_TYPES.has(task.type)) out.push(task);
  }
  return out;
}

/* ==========================================================================
   6 · OBERFLAECHE: UEBERSICHT
   ========================================================================== */
let overviewPath = 'quadratic';

function openOverview(pid) {
  if (!licence.has('learnPaths')) { host.proHint(); return; }
  if (pid && PATHS[pid]) overviewPath = pid;
  host.showScreen('learn');          // zeichnet ueber onShow()
}

function renderOverview() {
  const box = $('#lp-classes');
  if (!box) return;
  box.replaceChildren();
  for (const cat of CLASS_ORDER) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'seg-btn';
    b.dataset.path = cat;
    const has = !!PATHS[cat];
    b.textContent = has ? t('cat.' + cat) : `${t('cat.' + cat)} · ${t('lp.soon')}`;
    b.disabled = !has;
    b.classList.toggle('is-active', cat === overviewPath);
    b.setAttribute('aria-pressed', String(cat === overviewPath));
    b.addEventListener('click', () => { overviewPath = cat; renderOverview(); });
    box.append(b);
  }

  const path = PATHS[overviewPath];
  const list = $('#lp-steps');
  list.replaceChildren();
  if (!path) return;
  $('#screen-learn').dataset.cat = path.category;
  const store = loadStore();
  const done = countPassed(path.id, store);
  const total = path.steps.length;
  $('#lp-path-title').textContent = t(path.title);
  $('#lp-path-meta').textContent = t('lp.progress', { n: done, m: total });
  $('#lp-bar-fill').style.width = `${Math.round((done / total) * 100)}%`;
  $('#lp-bar').setAttribute('aria-valuenow', String(done));
  $('#lp-bar').setAttribute('aria-valuemax', String(total));

  path.steps.forEach((s, i) => {
    const state = stepState(path.id, i, store);
    const li = document.createElement('li');
    // Bewusst NICHT "is-locked": diese Klasse traegt app-weit das
    // PRO-Abzeichen (style.css). Ein noch nicht freigeschalteter Schritt
    // ist aber keine Kauffrage.
    li.className = `lp-step st-${state}`;
    li.dataset.step = s.id;

    const num = document.createElement('span');
    num.className = 'lp-num';
    num.setAttribute('aria-hidden', 'true');
    num.textContent = state === 'done' || state === 'skipped' ? '✓' : String(i + 1);

    const body = document.createElement('div');
    body.className = 'lp-step-body';
    const h = document.createElement('h3');
    h.textContent = `${i + 1}. ${txt(s.title, s.form)}`;
    const goal = document.createElement('p');
    goal.className = 'lp-goal';
    setMath(goal, txt(s.goal, s.form));
    const meta = document.createElement('p');
    meta.className = 'quiz-meta';
    const e = store[path.id]?.[s.id];
    meta.textContent = t('lp.state.' + state)
      + (e?.s === 'done' && e.best > 0 ? ` · ${t('lp.best', { p: fmt(e.best, 1), n: e.n })}` : '');
    body.append(h, goal, meta);

    const acts = document.createElement('div');
    acts.className = 'lp-step-acts';
    const go = document.createElement('button');
    go.type = 'button';
    if (state === 'locked') {
      go.className = 'btn-ghost';
      go.dataset.act = 'test';
      go.textContent = t('lp.testOut');
      go.title = t('lp.locked');
      go.addEventListener('click', () => openLesson(path.id, i, 'test'));
    } else {
      go.className = state === 'open' ? 'btn-primary' : 'btn-secondary';
      go.dataset.act = 'open';
      go.textContent = t(state === 'open' ? 'lp.open' : 'lp.repeat');
      go.addEventListener('click', () => openLesson(path.id, i, 'learn'));
    }
    acts.append(go);
    li.append(num, body, acts);
    list.append(li);
  });

  const next = nextOpen(path.id, store);
  const cont = $('#btn-lp-continue');
  cont.hidden = next < 0;
  cont.textContent = done === 0 ? t('lp.start') : t('lp.continue');
  $('#lp-all-done').hidden = done < total;
}

/* ==========================================================================
   7 · OBERFLAECHE: EIN SCHRITT
   ========================================================================== */
const L = {
  pid: null, idx: 0, mode: 'learn', phase: 'predict',
  // Vermuten
  predictOrder: [], guess: -1,
  // Entdecken
  ctx: null, traceX: null, memo: {}, mission: 0, trail: [],
  // Ueben
  tasks: [], ti: 0, score: 0, marks: [], remedies: new Set(),
  attempt: 0, locked: false, order: [], tried: new Set(), wrongValues: null,
  fb: null, inputs: null, result: null, taskCtx: null, missionList: null
};
let lessonGraph = null;

const pathOf = () => PATHS[L.pid];
const stepOf = () => pathOf()?.steps[L.idx];
const formOf = () => stepOf()?.form;

function openLesson(pid, idx, mode = 'learn') {
  const path = PATHS[pid];
  if (!path?.steps[idx]) return;
  if (!licence.has('learnPaths') || (path.feature && !licence.has(path.feature))) { host.proHint(); return; }
  L.pid = pid; L.idx = idx; L.mode = mode === 'test' ? 'test' : 'learn';
  L.guess = -1;
  L.predictOrder = shuffle(path.steps[idx].predict.options.map((_, i) => i));
  resetExplore();
  if (L.mode === 'test') preparePractice();
  else { L.phase = 'predict'; L.result = null; }
  // Erst den Zustand vollstaendig setzen, DANN den Bildschirm wechseln:
  // showScreen zeichnet ueber onShow(). Umgekehrt stuende fuer einen
  // Augenblick die Aufgabe aus dem vorigen Schritt da.
  host.showScreen('lesson');
}

function resetExplore() {
  const step = stepOf();
  const d = FUNCTIONS[step.form];
  L.ctx = {
    form: step.form,
    values: { ...Object.fromEntries(d.params.map(p => [p.id, p.value])), ...step.start },
    bounds: Object.fromEntries(d.params.map(p => [p.id, { min: p.min, max: p.max }])),
    prefix: 'lp-', play: false,
    symbolOf: host.symbolOf,
    onChange: () => { drawStage(); updateEquation(); },
    onCommit: onExploreCommit
  };
  L.traceX = step.trace ? step.trace.start ?? step.trace.min : null;
  L.memo = {};
  L.mission = 0;
  L.trail = [];
  L.fb = null;
}

/* ---------- Bausteine ---------- */
function setFeedback(cls, text) {
  L.fb = text ? { cls, text } : null;
  paintFeedback();
}
function paintFeedback() {
  const el = $('#lesson-feedback');
  if (!el) return;
  const text = typeof L.fb?.text === 'function' ? L.fb.text() : L.fb?.text;
  el.className = 'feedback' + (L.fb?.cls ? ' ' + L.fb.cls : '');
  setMath(el, text || '');
}

/** Knoepfe unter dem Schritt. Jede Phase setzt ihre eigenen. */
function setActions(list) {
  const row = $('#lesson-actions');
  row.replaceChildren();
  for (const a of list) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = a.kind === 'secondary' ? 'btn-secondary' : a.kind === 'ghost' ? 'btn-ghost' : 'btn-primary';
    b.dataset.act = a.act;
    b.textContent = a.label;
    b.addEventListener('click', a.fn);
    row.append(b);
  }
}

function renderHead() {
  const path = pathOf();
  const step = stepOf();
  $('#screen-lesson').dataset.cat = path.category;
  $('#lesson-kicker').textContent = `${t(path.title)} · ${t('lp.stepN', { i: L.idx + 1, n: path.steps.length })}`;
  $('#lesson-title').textContent = txt(step.title, step.form);
  const ol = $('#lesson-phases');
  ol.replaceChildren();
  const phases = L.mode === 'test' ? ['test'] : PHASES;
  const cur = L.mode === 'test' ? 'test' : (L.phase === 'result' ? 'practice' : L.phase);
  const curIdx = phases.indexOf(cur);
  phases.forEach((p, i) => {
    const li = document.createElement('li');
    li.textContent = t('lp.phase.' + p);
    li.className = i < curIdx ? 'is-done' : i === curIdx ? 'is-current' : '';
    if (i === curIdx) li.setAttribute('aria-current', 'step');
    ol.append(li);
  });
}

function showStage(on, { sliders = false, equation = false } = {}) {
  $('#lesson-stage').hidden = !on;
  $('#lesson-sliders').hidden = !sliders;
  $('#lesson-eq').hidden = !equation;
}

function renderLesson() {
  if (!stepOf()) return;
  renderHead();
  $('#lesson-body').replaceChildren();
  $('#lesson-panel').replaceChildren();
  if (L.phase === 'predict') renderPredict();
  else if (L.phase === 'explore') renderExplore();
  else if (L.phase === 'rule') renderRule();
  else if (L.phase === 'practice') renderTask();
  else if (L.phase === 'result') renderResult();
  paintFeedback();
}

function para(cls, text, parent = $('#lesson-body')) {
  const p = document.createElement('p');
  if (cls) p.className = cls;
  setMath(p, text);
  parent.append(p);
  return p;
}

/* ---------- Phase 1: Vermuten ---------- */
function renderPredict() {
  const step = stepOf();
  showStage(false);
  para('page-lead', t('lp.predictLead'));
  para('play-prompt', txt(step.predict.q, step.form));
  const grid = document.createElement('div');
  grid.className = 'options-grid';
  L.predictOrder.forEach((src, pos) => {
    const b = MFE.quiz.optionButton(pos, txt(step.predict.options[src], step.form));
    b.addEventListener('click', () => {
      L.guess = src;
      L.phase = 'explore';
      L.fb = null;
      renderLesson();
    });
    grid.append(b);
  });
  $('#lesson-panel').append(grid);
  setActions([]);
}

/* ---------- Phase 2: Entdecken ---------- */
function guessText() {
  const step = stepOf();
  return L.guess >= 0 ? txt(step.predict.options[L.guess], step.form) : '';
}

function renderExplore() {
  const step = stepOf();
  showStage(true, { sliders: true, equation: true });
  if (L.guess >= 0) para('lp-guess', t('lp.yourGuess', { g: guessText() }));
  if (step.exploreLead) para('page-lead', txt(step.exploreLead, step.form));

  // Regler: nur die freien Parameter sind sichtbar.
  const box = $('#lesson-sliders');
  renderSliderGroup(box, L.ctx);
  for (const p of FUNCTIONS[step.form].params) {
    if (step.free.includes(p.id)) continue;
    const row = box.querySelector(`#${cssId('lp-slider-' + p.id)}`)?.closest('.slider-row');
    if (row) row.hidden = true;
  }
  if (step.trace) box.append(traceRow(step.trace));

  // Auftraege
  const h = document.createElement('h2');
  h.className = 'lp-sub';
  h.textContent = t('lp.missions');
  const ul = document.createElement('ol');
  ul.className = 'lp-missions';
  L.missionList = ul;
  $('#lesson-panel').append(h, ul);
  renderMissions();
  updateEquation();
  requestAnimationFrame(drawStage);
  exploreActions();
}

function exploreActions() {
  const step = stepOf();
  const done = L.mission >= step.missions.length;
  const acts = [];
  if (done) acts.push({ act: 'to-rule', label: t('lp.toRule'), fn: () => { L.phase = 'rule'; L.fb = null; renderLesson(); } });
  else acts.push({ act: 'hint', kind: 'secondary', label: t('lp.hint'), fn: showHint });
  setActions(acts);
}

function showHint() {
  const m = stepOf().missions[L.mission];
  if (m) setFeedback('', txt(m.hint, formOf()));
}

function traceRow(tr) {
  const row = document.createElement('div');
  row.className = 'slider-row lp-trace-row';
  const sym = document.createElement('label');
  sym.className = 'sym';
  sym.htmlFor = 'lp-trace';
  sym.textContent = 'x';
  const input = document.createElement('input');
  input.type = 'range';
  input.id = 'lp-trace';
  input.min = tr.min; input.max = tr.max; input.step = tr.step;
  input.value = L.traceX;
  input.setAttribute('aria-label', t('lp.trace'));
  const out = document.createElement('output');
  out.className = 'value-input lp-trace-out';
  out.htmlFor = 'lp-trace';
  const paint = () => { out.textContent = fmt(L.traceX, 2); };
  paint();
  input.addEventListener('input', () => {
    L.traceX = parseFloat(input.value);
    paint();
    drawStage();
  });
  input.addEventListener('change', onExploreCommit);
  row.append(sym, input, out);
  return row;
}

function renderMissions() {
  const ul = L.missionList;
  if (!ul?.isConnected) return;
  const step = stepOf();
  ul.replaceChildren();
  step.missions.forEach((m, i) => {
    const li = document.createElement('li');
    const state = i < L.mission ? 'done' : i === L.mission ? 'current' : 'todo';
    li.className = 'is-' + state;
    if (state === 'current') li.setAttribute('aria-current', 'step');
    const mark = document.createElement('span');
    mark.className = 'lp-mark';
    mark.setAttribute('aria-hidden', 'true');
    mark.textContent = state === 'done' ? '✓' : String(i + 1);
    const text = document.createElement('span');
    setMath(text, txt(m.text, step.form));
    li.append(mark, text);
    if (state === 'done') {
      const sr = document.createElement('span');
      sr.className = 'sr-only';
      sr.textContent = ` (${t('lp.missionDone')})`;
      li.append(sr);
    }
    ul.append(li);
  });
}

/** Zustand, gegen den ein Auftrag geprueft wird. */
function exploreState() {
  const d = FUNCTIONS[formOf()];
  const v = { ...L.ctx.values };
  const x = L.traceX;
  return { v, x, y: x == null ? NaN : d.f(x, v), f: (xx) => d.f(xx, v) };
}

function pushTrail() {
  const v = { ...L.ctx.values };
  const last = L.trail[L.trail.length - 1];
  if (last && Object.keys(v).every(k => last[k] === v[k])) return;
  L.trail.push(v);
  if (L.trail.length > TRAIL_MAX) L.trail.shift();
}

/** Beim Loslassen eines Reglers oder nach getippter Eingabe. */
function onExploreCommit() {
  if (L.phase !== 'explore') return;
  pushTrail();
  drawStage();
  const step = stepOf();
  const m = step.missions[L.mission];
  if (!m) return;
  const s = exploreState();
  if (!m.check(s, L.memo)) return;
  m.done?.(s, L.memo);
  L.mission++;
  renderMissions();
  if (L.mission >= step.missions.length) finishExplore();
  else setFeedback('ok', t('lp.missionDone'));
  exploreActions();
}

function finishExplore() {
  const step = stepOf();
  if (L.guess < 0) { setFeedback('ok', t('lp.exploreDone')); return; }
  const right = L.guess === step.predict.correct;
  const r = txt(step.predict.options[step.predict.correct], step.form);
  setFeedback(right ? 'ok' : 'err', right
    ? t('lp.guessRight', { g: guessText() })
    : t('lp.guessWrong', { g: guessText(), r }));
}

function updateEquation() {
  const el = $('#lesson-eq');
  if (!el || el.hidden) return;
  if (L.phase === 'explore') setMath(el, `f(x) = ${FUNCTIONS[formOf()].rhs(L.ctx.values)}`);
  else if (L.phase === 'practice' && L.taskCtx) {
    const task = L.tasks[L.ti];
    setMath(el, `f(x) = ${FUNCTIONS[task.form].rhs(L.taskCtx.values)}`);
  }
}

/* ---------- Phase 3: Merken ---------- */
function renderRule() {
  const step = stepOf();
  showStage(false);
  const box = document.createElement('section');
  box.className = 'lp-rule';
  const h = document.createElement('h2');
  h.textContent = t('lp.rule');
  const ul = document.createElement('ul');
  for (const line of step.rule) {
    const li = document.createElement('li');
    setMath(li, txt(line, step.form));
    ul.append(li);
  }
  box.append(h, ul);
  $('#lesson-body').append(box);
  setActions([
    { act: 'to-practice', label: t('lp.toPractice'), fn: startPractice },
    { act: 'to-explore', kind: 'secondary', label: t('lp.backToExplore'), fn: () => { L.phase = 'explore'; L.fb = null; renderLesson(); } }
  ]);
}

/* ---------- Phase 4: Ueben ---------- */
function preparePractice() {
  L.tasks = buildTasks(stepOf());
  L.ti = 0; L.score = 0; L.marks = []; L.remedies = new Set();
  L.phase = 'practice';
  L.result = null;
  prepareTask();
}
function startPractice() {
  preparePractice();
  renderLesson();
}
function startTask() {
  prepareTask();
  renderLesson();
}

function prepareTask() {
  const task = L.tasks[L.ti];
  L.attempt = 0; L.locked = false; L.tried = new Set(); L.wrongValues = null; L.fb = null;
  L.inputs = null;
  L.order = task.type === 'choice' ? shuffle(task.options.map((_, i) => i)) : [];
  L.taskCtx = null;
  if (task.type === 'build') {
    const d = FUNCTIONS[task.form];
    L.taskCtx = {
      form: task.form,
      values: { ...Object.fromEntries(d.params.map(p => [p.id, p.value])), ...task.start },
      bounds: Object.fromEntries(d.params.map(p => [p.id, { min: p.min, max: p.max }])),
      prefix: 'lp-', play: false, symbolOf: host.symbolOf,
      onChange: () => { drawStage(); updateEquation(); }
    };
  }
}

function renderTask() {
  const step = stepOf();
  const task = L.tasks[L.ti];
  const n = L.tasks.length;
  if (L.ti === 0 && !L.locked && L.attempt === 0) {
    para('page-lead', t(L.mode === 'test' ? 'lp.testLead' : 'lp.practiceLead',
      { p: fmt(needFor(n), 1), n }));
  }
  para('quiz-meta lp-progress', `${t('lp.taskN', { i: L.ti + 1, n })} · ${t('lp.points', { p: fmt(L.score, 1) })}`);
  para('play-prompt', txt(task.q, task.form ?? task.graph?.form ?? step.form));

  const graphic = !!task.graph || task.type === 'build';
  showStage(graphic, { sliders: task.type === 'build', equation: task.type === 'build' });
  const panel = $('#lesson-panel');

  if (task.type === 'choice') {
    const grid = document.createElement('div');
    grid.className = 'options-grid' + (task.options.length === 2 ? ' two' : '');
    L.order.forEach((src, pos) => {
      const b = MFE.quiz.optionButton(pos, optionText(task.options[src], task.graph?.form ?? step.form));
      b.dataset.src = String(src);
      if (L.tried.has(pos)) { b.classList.add('is-wrong', 'is-tried'); b.disabled = true; }
      if (L.locked) {
        b.disabled = true;
        if (src === task.correct) b.classList.add('is-correct');
      }
      b.addEventListener('click', () => answerChoice(pos));
      grid.append(b);
    });
    panel.append(grid);
  }

  if (task.type === 'input') {
    const prev = L.inputs;
    const wrap = document.createElement('div');
    wrap.className = task.fields.length > 1 ? 'answer-pair' : '';
    L.inputs = task.fields.map((label, i) => {
      const row = document.createElement('div');
      row.className = 'form-row';
      const l = document.createElement('label');
      const input = document.createElement('input');
      input.type = 'text';
      input.inputMode = 'decimal';
      input.autocomplete = 'off';
      input.id = 'lp-in-' + i;
      input.value = prev?.[i]?.value ?? '';
      input.disabled = L.locked;
      l.htmlFor = input.id;
      l.textContent = typeof label === 'string' ? label : txt(label, step.form);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !L.locked) { e.preventDefault(); checkTask(); }
      });
      row.append(l, input);
      wrap.append(row);
      return input;
    });
    panel.append(wrap);
  }

  if (task.type === 'build') {
    const box = $('#lesson-sliders');
    renderSliderGroup(box, L.taskCtx);
    for (const p of FUNCTIONS[task.form].params) {
      const s = box.querySelector(`#${cssId('lp-slider-' + p.id)}`);
      if (!task.free.includes(p.id)) s?.closest('.slider-row')?.setAttribute('hidden', '');
      if (L.locked && s) s.disabled = true;
    }
    updateEquation();
  }

  if (graphic) requestAnimationFrame(drawStage);
  taskActions();
}

function taskActions() {
  const task = L.tasks[L.ti];
  if (L.locked) {
    const last = L.ti + 1 >= L.tasks.length;
    setActions([{ act: 'next', label: t(last ? 'lp.finish' : 'btn.nextQuiz'), fn: nextTask }]);
  } else if (task.type === 'choice') {
    setActions([]);
  } else {
    setActions([{ act: 'check', label: t('btn.check'), fn: checkTask }]);
  }
}

/** Erklaerung zu einer falsch gewaehlten Antwort und Begriff fuer den
 *  Rueckverweis. Vorrang hat, was der Inhalt selbst sagt. */
function explainWrong(task, src) {
  const path = pathOf();
  const form = task.graph?.form ?? formOf();
  const opt = task.options[src];
  let why = task.why?.[src] ? txt(task.why[src], form) : '';
  let concept = task.remedy?.[src] ?? null;
  if (opt?.eq && task.graph) {
    if (!why) why = MFE.quiz.diagnose(form, opt.eq, task.graph.values);
    if (!concept) concept = conceptFromValues(form, opt.eq, task.graph.values);
  }
  return { why, concept };
}

function conceptFromValues(form, attempt, target) {
  const res = MFE.diagnose?.analyseBuild(form, target, attempt);
  const f = res?.findings?.[0];
  return f ? conceptOf(pathOf(), form, f.ids[0]) : null;
}

function remedyText(concept) {
  const i = remedyStep(pathOf(), concept, L.idx);
  if (i < 0) return '';
  L.remedies.add(i);
  const s = pathOf().steps[i];
  return t('lp.remedyHint', { i: i + 1, title: txt(s.title, s.form) });
}

function answerChoice(pos) {
  if (L.locked) return;
  const task = L.tasks[L.ti];
  const src = L.order[pos];
  const ok = src === task.correct;
  if (!ok) {
    const { why, concept } = explainWrong(task, src);
    const remedy = remedyText(concept);
    if (task.options[src]?.eq) L.wrongValues = task.options[src].eq;
    if (L.attempt === 0 && task.options.length > 2) {
      L.attempt = 1;
      L.tried.add(pos);
      setFeedback('err', [t('lp.retry'), why].filter(Boolean).join(' '));
      renderLesson();
      return;
    }
    finishTask(false, [why, remedy]);
    return;
  }
  finishTask(true);
}

function checkTask() {
  if (L.locked) return;
  const task = L.tasks[L.ti];
  if (task.type === 'input') {
    const given = L.inputs.map(i => parseLoose(i.value, NaN));
    if (given.some(v => !Number.isFinite(v))) { setFeedback('err', t('lp.notNum')); return; }
    const ok = gradeInput(task, given);
    if (!ok && L.attempt === 0) {
      L.attempt = 1;
      setFeedback('err', [t('lp.retry'), task.hint ? txt(task.hint, formOf()) : ''].filter(Boolean).join(' '));
      return;
    }
    finishTask(ok, [ok ? '' : remedyText(task.concept)]);
    return;
  }
  if (task.type === 'build') {
    const ok = gradeBuild(task, L.taskCtx.values);
    if (ok) { finishTask(true); return; }
    const why = MFE.quiz.diagnose(task.form, L.taskCtx.values, task.target);
    if (L.attempt === 0) {
      L.attempt = 1;
      setFeedback('err', [t('lp.retry'), why].filter(Boolean).join(' '));
      return;
    }
    finishTask(false, [why, remedyText(conceptFromValues(task.form, L.taskCtx.values, task.target))]);
  }
}

function solutionText(task) {
  const form = task.form ?? task.graph?.form ?? formOf();
  if (task.solution) return txt(task.solution, form);
  if (task.type === 'choice') return optionText(task.options[task.correct], form);
  if (task.type === 'build') return `f(x) = ${FUNCTIONS[task.form].rhs(task.target)}`;
  return task.answers.map((a, i) => {
    const l = task.fields[i];
    return `${typeof l === 'string' ? l : txt(l, form)} = ${mfmt(a)}`;
  }).join(', ');
}

function finishTask(ok, extra = []) {
  const task = L.tasks[L.ti];
  L.locked = true;
  const mark = ok ? (L.attempt === 0 ? true : 'half') : false;
  L.marks[L.ti] = mark;
  L.score += markPoints(mark);
  const form = task.form ?? task.graph?.form;
  if (form) MFE.quiz.noteResult(form, mark);

  const explain = task.explain ? txt(task.explain, form ?? formOf()) : '';
  const parts = ok
    ? [t(mark === 'half' ? 'lp.half' : 'lp.right'), explain]
    : [t('lp.wrong'), t('lp.solution', { s: solutionText(task) }), ...extra, explain];
  setFeedback(ok ? 'ok' : 'err', parts.filter(Boolean).join(' '));
  renderLesson();
  $('#lesson-actions button')?.focus?.();
}

function nextTask() {
  if (L.ti + 1 < L.tasks.length) { L.ti++; startTask(); return; }
  finishPractice();
}

function finishPractice() {
  const n = L.tasks.length;
  const need = needFor(n);
  const passed = L.score >= need - 1e-9;
  if (passed) recordPass(L.pid, L.idx, L.score, n);
  L.result = { passed, score: L.score, n, need };
  L.phase = 'result';
  L.fb = null;
  renderLesson();
}

/* ---------- Ergebnis ---------- */
function renderResult() {
  const path = pathOf();
  const r = L.result;
  showStage(false);
  const h = document.createElement('h2');
  h.className = 'lp-result ' + (r.passed ? 'is-pass' : 'is-fail');
  h.textContent = r.passed
    ? t('lp.passed', { p: fmt(r.score, 1), n: r.n })
    : t('lp.failed', { p: fmt(r.score, 1), n: r.n, need: r.need });
  $('#lesson-body').append(h);

  const last = L.idx + 1 >= path.steps.length;
  if (r.passed && last) para('lp-done', t('lp.pathDone'));

  if (L.remedies.size) {
    para('', t('lp.remedy'));
    const box = document.createElement('div');
    box.className = 'action-row';
    for (const i of [...L.remedies].sort((a, b) => a - b)) {
      const s = path.steps[i];
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn-secondary';
      b.dataset.act = 'remedy';
      b.textContent = t('lp.remedyGo', { i: i + 1, title: txt(s.title, s.form) });
      b.addEventListener('click', () => openLesson(path.id, i, 'learn'));
      box.append(b);
    }
    $('#lesson-panel').append(box);
  }

  const acts = [];
  if (r.passed && !last) {
    acts.push({ act: 'next-step', label: t('lp.nextStep', { i: L.idx + 2 }), fn: () => openLesson(path.id, L.idx + 1, 'learn') });
  }
  if (!r.passed) acts.push({ act: 'again', label: t('lp.again'), fn: startPractice });
  if (!r.passed && L.mode === 'learn') {
    acts.push({ act: 'to-explore', kind: 'secondary', label: t('lp.backToExplore'), fn: () => { resetExplore(); L.phase = 'explore'; renderLesson(); } });
  }
  if (!r.passed && L.mode === 'test') {
    acts.push({ act: 'learn', kind: 'secondary', label: t('lp.learnStep'), fn: () => openLesson(path.id, L.idx, 'learn') });
  }
  acts.push({ act: 'overview', kind: r.passed && last ? 'primary' : 'ghost', label: t('lp.backToPath'), fn: () => openOverview(path.id) });
  setActions(acts);
}

/* ---------- Zeichnen ---------- */
const BLANK = { helpers: false, roots: false, yint: false, vertex: false, drag: false,
                intersections: false, derivative: false, tangent: false, trace: false };

function drawStage() {
  const cv = $('#lesson-canvas');
  const step = stepOf();
  if (!cv || !step || $('#lesson-stage').hidden || !$('#screen-lesson')?.classList.contains('is-active')) return;
  if (!lessonGraph || lessonGraph.canvas !== cv) lessonGraph = new Graph(cv);
  if (!lessonGraph.measure()) return;

  let scene;
  if (L.phase === 'explore') {
    const show = step.show ?? {};
    scene = {
      curves: [{ form: step.form, values: L.ctx.values, color: '--graph' }],
      activeIndex: 0,
      view: step.view,
      opts: { ...BLANK, vertex: !!show.vertex, roots: !!show.roots, yint: !!show.yint,
              trace: L.traceX != null || show.pointAt != null },
      traceX: L.traceX ?? show.pointAt,
      trail: L.trail.slice(0, -1).map(v => ({ form: step.form, values: v, color: '--graph' })),
      scale: host.scale()
    };
    if (step.ref) { scene.ghost = step.ref; scene.ghostLabel = txt(step.refLabel ?? 'lp.ref', step.form); }
  } else if (L.phase === 'practice') {
    const task = L.tasks[L.ti];
    const view = task.view ?? step.view;
    if (task.type === 'build') {
      scene = {
        curves: [{ form: task.form, values: L.taskCtx.values, color: '--graph' }],
        activeIndex: 0, view, opts: BLANK, scale: host.scale(),
        ghost: { form: task.form, values: task.target }
      };
    } else if (task.graph) {
      scene = {
        curves: [{ form: task.graph.form, values: task.graph.values, color: '--graph' }],
        activeIndex: 0, view, opts: BLANK, scale: host.scale()
      };
      // Nach einer falschen Wahl die gewaehlte Kurve dazu: der Unterschied
      // ist in einer Sekunde gesehen und in keinem Satz so schnell gelesen.
      if (L.wrongValues) {
        scene.ghost = { form: task.graph.form, values: L.wrongValues };
        scene.ghostLabel = t('quiz.yourAnswer');
      } else if (task.ref) {
        scene.ghost = task.ref;
      }
    }
  }
  if (scene) drawScene(lessonGraph, scene);
}

/* ==========================================================================
   8 · ANBINDUNG
   ========================================================================== */
function onShow(which) {
  if (which === 'learn') renderOverview();
  if (which === 'lesson') {
    if (!stepOf()) { openOverview(); return; }
    renderLesson();
  }
}

function relabel() {
  if ($('#screen-learn')?.classList.contains('is-active')) renderOverview();
  if ($('#screen-lesson')?.classList.contains('is-active') && stepOf()) renderLesson();
}

function redraw() {
  if ($('#screen-lesson')?.classList.contains('is-active')) drawStage();
}

function init(hooks) {
  Object.assign(host, hooks);
  $('#btn-lesson-back')?.addEventListener('click', () => openOverview(L.pid ?? overviewPath));
  $('#btn-lp-continue')?.addEventListener('click', () => {
    const i = nextOpen(overviewPath);
    if (i >= 0) openLesson(overviewPath, i, 'learn');
  });
  $('#btn-lp-reset')?.addEventListener('click', () => {
    if (!confirm(t('lp.resetConfirm'))) return;
    resetPath(overviewPath);
    renderOverview();
    toast(t('lp.resetDone'));
  });
}

return {
  init, register, openOverview, openLesson, onShow, relabel, redraw,
  /* Baukasten fuer die Inhaltsdateien */
  kit: { pick, shuffle, near, round4, eqOptions, variants, sameCurve },
  /* Fuer tools/paths-test.mjs und tools/smoke.mjs */
  core: { sanitizeStore, loadStore, saveStore, stepState, recordPass, resetPath,
          countPassed, nextOpen, needFor, gradeInput, gradeBuild, markPoints,
          remedyStep, buildTasks, optionText, txt, fmtVar, STORE_KEY, PASS_SHARE },
  get paths() { return PATHS; },
  get lesson() {
    return { pid: L.pid, idx: L.idx, mode: L.mode, phase: L.phase, mission: L.mission, memo: { ...L.memo },
             guess: L.guess, ti: L.ti, score: L.score, order: L.order.slice(),
             task: L.tasks[L.ti] ?? null, count: L.tasks.length, result: L.result,
             remedies: [...L.remedies] };
  }
};
})();
