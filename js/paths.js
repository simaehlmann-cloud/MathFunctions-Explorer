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

/* Fertige Aufgabenbausteine, die jede Inhaltsdatei braucht. */
function matchEqTask(form, values, free, extra = [], view) {
  const { options, correct } = eqOptions(form, values, free, 3, extra);
  const task = { type: 'choice', q: 'lp.t.matchEq', form, graph: { form, values }, options, correct, kind: 'graphEq' };
  if (view) task.view = view;
  return task;
}
function buildTask(form, target, start, free, view) {
  const task = { type: 'build', q: 'lp.t.build', form, target, start, free };
  if (view) task.view = view;
  return task;
}
/** Wahr/Falsch. whyIfWrong: Erklaerung fuer die falsch gewaehlte Antwort. */
function trueFalseTask(q, truth, form, whyIfWrong, explain) {
  return { type: 'choice', q, form, options: [{ k: 'lp.true' }, { k: 'lp.false' }],
           correct: truth ? 0 : 1, why: whyIfWrong ? { [truth ? 1 : 0]: whyIfWrong } : {}, explain };
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
     ['eqg', form, values]   -> g(x) = ... (zweite Gerade)
     ['pi', x]               -> x in pi-Schreibweise (pi/2, 3pi/2 ...)
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
    if (v[0] === 'eqg') return `g(x) = ${FUNCTIONS[v[1]].rhs(v[2])}`;
    if (v[0] === 'pi') return MFE.math.piLabel(v[1]);
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
/* Kostprobe ohne Pro: ein ganzer Pfad und Schritt 1 jedes anderen. Wer nie
   einen Lernpfad erlebt hat, kauft ihn nicht - und die App-Pruefung sieht in
   der kostenlosen Fassung mehr als gesperrte Karten. Aendern: nur hier. */
const FREE_PATHS = new Set(['linear']);
const FREE_FIRST_STEP = true;

/** Darf dieser Schritt ohne Kauf geoeffnet werden? */
function stepFree(pid, i) {
  return licence.has('learnPaths') || FREE_PATHS.has(pid) || (FREE_FIRST_STEP && i === 0);
}
/* Zuletzt gewaehlte Klasse; ohne Wahl die erste vorhandene in der
   Reihenfolge der Startseite (siehe openOverview). */
let overviewPath = null;

function openOverview(pid) {
  if (pid && PATHS[pid]) overviewPath = pid;
  host.showScreen('learn');          // zeichnet ueber onShow()
}

function renderOverview() {
  const box = $('#lp-classes');
  if (!box) return;
  if (!PATHS[overviewPath]) overviewPath = CLASS_ORDER.find(c => PATHS[c]) ?? Object.keys(PATHS)[0];
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
    const free = stepFree(path.id, i);
    if (!free) {
      // Gehoert zu Pro: derselbe Knopf, aber mit PRO-Abzeichen und Kaufhinweis.
      go.className = 'btn-ghost is-locked';
      go.dataset.act = 'pro';
      go.textContent = t(state === 'locked' ? 'lp.testOut' : 'lp.open');
      go.setAttribute('aria-disabled', 'true');
      go.addEventListener('click', () => host.proHint('path'));
    } else if (state === 'locked') {
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

  // Unterbrochener Schritt (egal in welchem Pfad): Fortsetzen anbieten.
  const pend = pendingLesson();
  const resumeBox = $('#lp-resume');
  if (resumeBox) {
    resumeBox.hidden = !pend;
    if (pend) {
      const ps = PATHS[pend.pid];
      const st = ps.steps[pend.idx];
      $('#lp-resume-text').textContent = t('lp.resumeText', {
        path: t(ps.title), i: pend.idx + 1, title: txt(st.title, st.form),
        phase: t('lp.phase.' + (pend.mode === 'test' ? 'test' : pend.phase))
      });
    }
  }

  const next = nextOpen(path.id, store);
  const cont = $('#btn-lp-continue');
  cont.hidden = next < 0;
  cont.textContent = done === 0 ? t('lp.start') : t('lp.continue');
  cont.classList.toggle('is-locked', next >= 0 && !stepFree(path.id, next));
  $('#lp-all-done').hidden = done < total;
  $('#btn-lp-code').disabled = done === 0;
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
  if (!stepFree(pid, idx)) { host.proHint('path'); return; }
  mode = mode === 'test' ? 'test' : 'learn';
  // Derselbe Schritt war unterbrochen: dort weitermachen statt neu beginnen.
  const saved = loadLesson();
  if (saved && saved.pid === pid && saved.idx === idx && saved.mode === mode && restoreLesson(saved)) {
    host.showScreen('lesson');
    return;
  }
  L.pid = pid; L.idx = idx; L.mode = mode;
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
    onChange: () => { drawStage(); updateEquation(); saveLesson(); },
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
  if (stepOf()) saveLesson();
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
    if (a.locked) b.classList.add('is-locked');      // PRO-Abzeichen
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
  saveLesson();
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
/** Antworttext ohne Schlusspunkt - er steht in Anfuehrungszeichen mitten im
 *  Satz, sonst hiesse es „Er ist fallend.“. */
const unpoint = (s) => s.replace(/[.!]\s*$/, '');

function guessText() {
  const step = stepOf();
  return L.guess >= 0 ? unpoint(txt(step.predict.options[L.guess], step.form)) : '';
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
  // Bei Sinus und Kosinus in pi: 1,57 sagt im Unterricht niemand.
  const paint = () => { out.textContent = tr.pi ? MFE.math.piLabel(L.traceX) : fmt(L.traceX, 2); };
  paint();
  input.addEventListener('input', () => {
    L.traceX = parseFloat(input.value);
    paint();
    drawStage();
    saveLesson();
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
  saveLesson();
}

function finishExplore() {
  const step = stepOf();
  if (L.guess < 0) { setFeedback('ok', t('lp.exploreDone')); return; }
  const right = L.guess === step.predict.correct;
  const r = unpoint(txt(step.predict.options[step.predict.correct], step.form));
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
      onChange: () => { drawStage(); updateEquation(); saveLesson(); }
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
      input.addEventListener('input', saveLesson);
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
  clearLesson();
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
    acts.push({ act: 'next-step', label: t('lp.nextStep', { i: L.idx + 2 }), locked: !stepFree(path.id, L.idx + 1),
                fn: () => openLesson(path.id, L.idx + 1, 'learn') });
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
      opts: { ...BLANK, vertex: !!show.vertex, roots: !!show.roots, yint: !!show.yint, helpers: !!show.helpers,
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
   7b · UNTERBROCHENE SCHRITTE FORTSETZEN
   --------------------------------------------------------------------------
   Am Telefon wird die App staendig unterbrochen: Nachricht, Anruf, Wechsel
   in eine andere App. iOS beendet die WebView im Hintergrund ohne Vorwarnung.
   Bisher begann der Schritt dann von vorn - fuer Schuelerinnen fuehlt sich
   das wie eine Strafe an.

   Jetzt wird der Zustand des laufenden Schritts laufend gesichert
   (mfe:lesson). Beim naechsten Oeffnen geht es an derselben Stelle weiter:
   gleiche Aufgaben, gleicher Punktestand, gleiche Reglerstellung, sogar der
   halb getippte Wert im Eingabefeld.

   Was aus dem Speicher kommt, ist fremdes Material (jeder kann den
   WebView-Speicher veraendern). sanitizeLesson() prueft deshalb jedes Feld;
   passt etwas nicht, wird der Stand verworfen - lieber von vorn als ein
   Absturz mitten im Schritt.
   ========================================================================== */
const LESSON_KEY = 'mfe:lesson';
const LESSON_REV = 1;
const LESSON_MAX_AGE = 14 * 24 * 3600 * 1000;
const LESSON_PHASES = new Set(['predict', 'explore', 'rule', 'practice']);
const MAX_STR = 400;

const isObj = (o) => !!o && typeof o === 'object' && !Array.isArray(o);
const isInt = (n, lo, hi) => Number.isInteger(n) && n >= lo && n <= hi;
const isStr = (s, max = MAX_STR) => typeof s === 'string' && s.length <= max;
const isKey = (s) => isStr(s, 60) && /^(lp|quiz|btn)\.[\w.]+$/.test(s);

/** Wertesatz einer Form: jeder Parameter eine endliche Zahl in seinen harten
 *  Grenzen (dieselben Grenzen wie beim Eintippen). */
function cleanValues(form, raw) {
  const d = FUNCTIONS[form];
  if (!d || !isObj(raw)) return null;
  const out = {};
  for (const p of d.params) {
    const v = raw[p.id];
    if (typeof v !== 'number' || !Number.isFinite(v) || Math.abs(v) > 1e4) return null;
    if (v < (p.hardMin ?? -1e4) || v > (p.hardMax ?? 1e4)) return null;
    out[p.id] = v;
  }
  return out;
}

/** Variable in einem Text (siehe fmtVar). */
function cleanVar(v, depth = 0) {
  if (typeof v === 'number') return Number.isFinite(v);
  if (typeof v === 'string') return isStr(v, 80);
  if (!Array.isArray(v) || depth > 1) return false;
  const [kind, a, b] = v;
  if (['eq', 'eqg', 'rhs'].includes(kind)) return v.length === 3 && !!cleanValues(a, b);
  if (kind === 'pt') return v.length === 3 && Number.isFinite(a) && Number.isFinite(b);
  if (kind === 'pi' || kind === 'br') return v.length === 2 && Number.isFinite(a);
  if (kind === 't') return v.length === 2 && isKey(a);
  return false;
}
/** Textangabe: Schluessel oder [Schluessel, Variablen]. */
function cleanSpec(spec) {
  if (isKey(spec)) return true;
  if (!Array.isArray(spec) || spec.length !== 2 || !isKey(spec[0]) || !isObj(spec[1])) return false;
  const vars = Object.entries(spec[1]);
  return vars.length <= 12 && vars.every(([k, v]) => /^\w{1,12}$/.test(k) && cleanVar(v));
}

function cleanTask(t0, stepForm) {
  if (!isObj(t0) || !TASK_TYPES.has(t0.type) || !cleanSpec(t0.q)) return false;
  if (t0.form != null && !FUNCTIONS[t0.form]) return false;
  if (t0.graph != null && !(isObj(t0.graph) && cleanValues(t0.graph.form, t0.graph.values))) return false;
  if (t0.ref != null && !(isObj(t0.ref) && cleanValues(t0.ref.form, t0.ref.values))) return false;
  if (t0.view != null && !(isObj(t0.view) && ['xMin', 'xMax', 'yMin', 'yMax'].every(k => Number.isFinite(t0.view[k])))) return false;
  for (const k of ['explain', 'solution']) if (t0[k] != null && !cleanSpec(t0[k])) return false;
  if (t0.why != null && !(isObj(t0.why) && Object.values(t0.why).every(cleanSpec))) return false;
  if (t0.remedy != null && !(isObj(t0.remedy) && Object.values(t0.remedy).every(c => isStr(c, 30)))) return false;
  if (t0.concept != null && !isStr(t0.concept, 30)) return false;
  const form = t0.form ?? t0.graph?.form ?? stepForm;
  if (t0.type === 'choice') {
    if (!Array.isArray(t0.options) || t0.options.length < 2 || t0.options.length > 6) return false;
    if (!isInt(t0.correct, 0, t0.options.length - 1)) return false;
    return t0.options.every(o => isObj(o) && (
      (o.eq != null && !!cleanValues(o.form ?? form, o.eq) && (o.form == null || !!FUNCTIONS[o.form])) ||
      (o.text != null && isStr(o.text, 40)) ||
      (o.k != null && isKey(o.k) && (o.v == null || cleanSpec([o.k, o.v])))));
  }
  if (t0.type === 'input') {
    return Array.isArray(t0.answers) && t0.answers.length >= 1 && t0.answers.length <= 4
      && t0.answers.every(Number.isFinite) && Array.isArray(t0.fields)
      && t0.fields.length === t0.answers.length
      && t0.fields.every(f => isStr(f, 20) || cleanSpec(f));
  }
  // build
  const d = FUNCTIONS[t0.form];
  return !!d && !!cleanValues(t0.form, t0.target) && !!cleanValues(t0.form, t0.start)
    && Array.isArray(t0.free) && t0.free.length >= 1
    && t0.free.every(id => d.params.some(p => p.id === id));
}

/** Gesicherten Stand pruefen. Rueckgabe: bereinigter Stand oder null. */
function sanitizeLesson(raw, now = Date.now()) {
  if (!isObj(raw) || raw.rev !== LESSON_REV) return null;
  if (!Number.isFinite(raw.at) || now - raw.at > LESSON_MAX_AGE || raw.at > now + 60000) return null;
  const path = PATHS[raw.pid];
  const step = path?.steps[raw.idx];
  if (!step || !isInt(raw.idx, 0, path.steps.length - 1)) return null;
  if (!['learn', 'test'].includes(raw.mode) || !LESSON_PHASES.has(raw.phase)) return null;
  if (raw.mode === 'test' && raw.phase !== 'practice') return null;
  const nOpt = step.predict.options.length;
  const perm = (a, n) => Array.isArray(a) && a.length === n && [...a].sort((x, y) => x - y).every((v, i) => v === i);

  const out = {
    pid: raw.pid, idx: raw.idx, mode: raw.mode, phase: raw.phase,
    open: raw.open === true,
    guess: isInt(raw.guess, -1, nOpt - 1) ? raw.guess : -1,
    predictOrder: perm(raw.predictOrder, nOpt) ? raw.predictOrder.slice() : null,
    values: cleanValues(step.form, raw.values),
    traceX: null,
    memo: {},
    mission: isInt(raw.mission, 0, step.missions.length) ? raw.mission : 0,
    trail: []
  };
  if (!out.values) return null;
  if (step.trace) {
    const x = raw.traceX;
    out.traceX = Number.isFinite(x) && x >= step.trace.min - 1e-9 && x <= step.trace.max + 1e-9 ? x : (step.trace.start ?? step.trace.min);
  }
  if (isObj(raw.memo)) {
    for (const [k, v] of Object.entries(raw.memo).slice(0, 8)) {
      if (/^\w{1,12}$/.test(k) && k !== '__proto__' && Number.isFinite(v)) out.memo[k] = v;
    }
  }
  if (Array.isArray(raw.trail)) {
    out.trail = raw.trail.slice(-TRAIL_MAX).map(v => cleanValues(step.form, v)).filter(Boolean);
  }
  if (raw.phase !== 'practice') return out;

  // Uebungsrunde
  const tasks = raw.tasks;
  if (!Array.isArray(tasks) || tasks.length < 1 || tasks.length > 20) return null;
  if (!tasks.every(t0 => cleanTask(t0, step.form))) return null;
  if (!isInt(raw.ti, 0, tasks.length - 1)) return null;
  const task = tasks[raw.ti];
  const marks = Array.isArray(raw.marks) ? raw.marks.slice(0, raw.ti + 1) : [];
  if (!marks.every(m => m === true || m === false || m === 'half' || m == null)) return null;
  // Der Punktestand wird aus den Markierungen neu berechnet, nicht uebernommen.
  const score = marks.reduce((a, m) => a + markPoints(m), 0);
  const nOptT = task.type === 'choice' ? task.options.length : 0;
  Object.assign(out, {
    tasks: tasks.map(t0 => JSON.parse(JSON.stringify(t0))),
    ti: raw.ti, marks, score,
    remedies: Array.isArray(raw.remedies) ? raw.remedies.filter(i => isInt(i, 0, raw.idx - 1)) : [],
    attempt: raw.attempt === 1 ? 1 : 0,
    locked: raw.locked === true && marks[raw.ti] != null,
    order: task.type === 'choice' ? (perm(raw.order, nOptT) ? raw.order.slice() : null) : [],
    tried: Array.isArray(raw.tried) ? raw.tried.filter(i => isInt(i, 0, nOptT - 1)) : [],
    wrongValues: task.graph && raw.wrongValues ? cleanValues(task.graph.form, raw.wrongValues) : null,
    taskValues: task.type === 'build' ? cleanValues(task.form, raw.taskValues) : null,
    inputs: task.type === 'input' && Array.isArray(raw.inputs)
      ? raw.inputs.slice(0, task.answers.length).map(v => (isStr(v, 40) ? v : '')) : null,
    fb: isObj(raw.fb) && ['', 'ok', 'err'].includes(raw.fb.cls) && isStr(raw.fb.text, 1200) ? { cls: raw.fb.cls, text: raw.fb.text } : null
  });
  if (out.order === null) return null;
  // Eine abgeschlossene Aufgabe ohne Markierung waere nicht bewertet worden.
  if (out.locked && marks[raw.ti] == null) out.locked = false;
  return out;
}

/** Aktuellen Stand als reines Datenobjekt. */
function snapshotLesson(open) {
  if (!stepOf() || L.phase === 'result') return null;
  const snap = {
    rev: LESSON_REV, at: Date.now(), open: !!open,
    pid: L.pid, idx: L.idx, mode: L.mode, phase: L.phase,
    guess: L.guess, predictOrder: L.predictOrder,
    values: { ...L.ctx.values }, traceX: L.traceX, memo: { ...L.memo },
    mission: L.mission, trail: L.trail
  };
  if (L.phase === 'practice') {
    Object.assign(snap, {
      tasks: L.tasks, ti: L.ti, marks: L.marks, remedies: [...L.remedies],
      attempt: L.attempt, locked: L.locked, order: L.order, tried: [...L.tried],
      wrongValues: L.wrongValues, taskValues: L.taskCtx ? { ...L.taskCtx.values } : null,
      inputs: L.inputs ? L.inputs.map(i => String(i.value ?? '')) : null,
      fb: L.fb && typeof L.fb.text === 'string' ? { cls: L.fb.cls || '', text: L.fb.text } : null
    });
  }
  return snap;
}

let lessonOpen = false;
let saveTimer = 0;
function saveLessonNow() {
  clearTimeout(saveTimer);
  const snap = snapshotLesson(lessonOpen);
  try {
    if (snap) localStorage.setItem(LESSON_KEY, JSON.stringify(snap));
    else localStorage.removeItem(LESSON_KEY);
  } catch { /* Speicher voll oder privater Modus: dann eben ohne Fortsetzen */ }
}
/** Sichern, aber nicht bei jeder Reglerbewegung sofort. */
function saveLesson() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveLessonNow, 250);
}
function clearLesson() {
  clearTimeout(saveTimer);
  try { localStorage.removeItem(LESSON_KEY); } catch {}
}
function loadLesson() {
  try { return sanitizeLesson(JSON.parse(localStorage.getItem(LESSON_KEY) || 'null')); }
  catch { return null; }
}

/** Gesicherten Stand in L uebernehmen. Rueckgabe: hat es geklappt? */
function restoreLesson(st) {
  if (!st || !stepFree(st.pid, st.idx)) return false;
  L.pid = st.pid; L.idx = st.idx; L.mode = st.mode;
  L.guess = st.guess;
  L.predictOrder = st.predictOrder ?? shuffle(stepOf().predict.options.map((_, i) => i));
  resetExplore();
  L.ctx.values = { ...st.values };
  L.traceX = st.traceX;
  L.memo = { ...st.memo };
  L.mission = st.mission;
  L.trail = st.trail.map(v => ({ ...v }));
  L.result = null;
  L.phase = st.phase;
  if (st.phase === 'practice') {
    L.tasks = st.tasks; L.ti = st.ti; L.marks = st.marks; L.score = st.score;
    L.remedies = new Set(st.remedies);
    prepareTask();
    L.attempt = st.attempt; L.locked = st.locked;
    L.order = st.order; L.tried = new Set(st.tried); L.wrongValues = st.wrongValues;
    if (L.taskCtx && st.taskValues) L.taskCtx.values = { ...st.taskValues };
    L.inputs = st.inputs ? st.inputs.map(value => ({ value })) : null;
    L.fb = st.fb;
  }
  return true;
}

/** Fuer die Uebersicht: gibt es einen unterbrochenen Schritt? */
function pendingLesson() {
  const st = loadLesson();
  return st && stepFree(st.pid, st.idx) ? st : null;
}

/** App-Start: War die App mitten in einem Schritt, als sie beendet wurde,
 *  geht es direkt dort weiter. Rueckgabe: wurde fortgesetzt? */
function resumeOnStart() {
  const st = pendingLesson();
  if (!st?.open) return false;
  return resumePending();
}
function resumePending() {
  const st = pendingLesson();
  if (!st || !restoreLesson(st)) { clearLesson(); return false; }
  host.showScreen('lesson');
  return true;
}


/* ==========================================================================
   7c · ERGEBNISCODE FUER DIE LEHRKRAFT
   --------------------------------------------------------------------------
   Wie beim Wettkampf: kein Server, kein Konto. Die Schuelerin zeigt einen
   kurzen Code (oder laesst den QR-Code abscannen); die Lehrkraft gibt ihn in
   der eigenen App unter "Code pruefen" ein und sieht, welche Schritte
   geschafft sind.

   Aufbau (37 Bit, Basis 36):  Pfad (2) | geschafft (8) | per Test (8) |
                               Punkte in Halben (7) | Tag seit 1.1.2026 (12)
   Geschrieben als  Q-XXXX-XXXX-P  - der Buchstabe vorn nennt die Klasse,
   P ist eine Pruefziffer gegen Tippfehler. Faelschungssicher ist das nicht
   (die App liegt offen auf dem Geraet) und soll es nicht sein: es ist ein
   Lernnachweis, keine Pruefung.
   ========================================================================== */
const CODE_PATHS = ['linear', 'quadratic', 'exponential', 'trig'];
const CODE_LETTER = { linear: 'L', quadratic: 'Q', exponential: 'E', trig: 'T' };
const DAY0 = Date.UTC(2026, 0, 1);
const DAY_MS = 24 * 3600 * 1000;

/* Luhn mod 36: erkennt jeden einzelnen vertippten Buchstaben und fast jeden
   Dreher zweier Nachbarn - die typischen Fehler beim Abtippen von der Tafel. */
function checkChar(body) {
  let sum = 0, factor = 2;
  for (let i = body.length - 1; i >= 0; i--) {
    let add = parseInt(body[i], 36) * factor;
    add = Math.floor(add / 36) + (add % 36);
    sum += add;
    factor = factor === 2 ? 1 : 2;
  }
  return ((36 - (sum % 36)) % 36).toString(36).toUpperCase();
}

/** Stand eines Pfades als Ergebnis. null, wenn noch nichts geschafft ist. */
function pathResult(pid, store = loadStore(), now = Date.now()) {
  const path = PATHS[pid];
  if (!path || !CODE_PATHS.includes(pid)) return null;
  const entry = store[pid] ?? {};
  const done = [], skipped = [];
  let halves = 0;
  path.steps.forEach((s, i) => {
    const e = entry[s.id];
    if (e?.s === 'done') { done.push(i); halves += Math.round(e.best * 2); }
    if (e?.s === 'skipped') skipped.push(i);
  });
  if (!done.length && !skipped.length) return null;
  const day = Math.max(0, Math.min(4095, Math.floor((now - DAY0) / DAY_MS)));
  return { pid, done, skipped, points: Math.min(halves, 127) / 2, day, total: path.steps.length };
}

function encodeResult(r) {
  const mask = (list) => list.reduce((m, i) => m | (1 << i), 0);
  const value = ((((CODE_PATHS.indexOf(r.pid) * 256 + mask(r.done)) * 256 + mask(r.skipped)) * 128
                + Math.round(r.points * 2)) * 4096) + r.day;
  const body = value.toString(36).toUpperCase().padStart(8, '0');
  return `${CODE_LETTER[r.pid]}-${body.slice(0, 4)}-${body.slice(4)}-${checkChar(CODE_LETTER[r.pid] + body)}`;
}

/** Code -> Ergebnis oder null (Tippfehler, fremder Code). Grossschreibung,
 *  Leerzeichen und fehlende Bindestriche sind egal - abgetippt wird von Hand. */
function decodeResult(raw) {
  const s = String(raw ?? '').toUpperCase().replace(/[\s‐-―-]/g, '');
  const m = s.match(/^([LQET])([0-9A-Z]{8})([0-9A-Z])$/);
  if (!m) return null;
  const [, letter, body, check] = m;
  if (checkChar(letter + body) !== check) return null;
  let v = parseInt(body, 36);
  if (!Number.isSafeInteger(v)) return null;
  const day = v % 4096; v = Math.floor(v / 4096);
  const halves = v % 128; v = Math.floor(v / 128);
  const skipM = v % 256; v = Math.floor(v / 256);
  const doneM = v % 256; v = Math.floor(v / 256);
  const pid = CODE_PATHS[v];
  if (!pid || CODE_LETTER[pid] !== letter || !PATHS[pid]) return null;
  const n = PATHS[pid].steps.length;
  const bits = (mask) => [...Array(8).keys()].filter(i => mask & (1 << i));
  const done = bits(doneM), skipped = bits(skipM);
  // Schritte, die es nicht gibt, oder beides zugleich: kein echter Code.
  if (done.some(i => i >= n) || skipped.some(i => i >= n) || done.some(i => skipped.includes(i))) return null;
  if (!done.length && !skipped.length) return null;
  return { pid, done, skipped, points: halves / 2, day, total: n };
}

const dateOf = (day) => new Date(DAY0 + day * DAY_MS).toLocaleDateString(MFE.i18n.lang === 'de' ? 'de-DE' : 'en-GB',
  { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });

function resultSummary(r) {
  const skip = r.skipped.length ? t('lp.code.skip', { k: r.skipped.length }) : '';
  return t('lp.code.summary', { path: t(PATHS[r.pid].title), n: r.done.length + r.skipped.length, m: r.total,
                                skip, p: fmt(r.points, 1), date: dateOf(r.day) });
}

function showResultCode() {
  const r = pathResult(overviewPath);
  if (!r) { toast(t('lp.code.none')); return; }
  const code = encodeResult(r);
  const text = `${resultSummary(r)} [${code}]`;
  $('#lp-code').textContent = code;
  $('#lp-code-summary').textContent = resultSummary(r);
  const dlg = $('#lp-code-dialog');
  if (!dlg?.showModal) { toast(text); return; }
  dlg.dataset.text = text;
  if (!MFE.nav.openDialog(dlg)) return;
  requestAnimationFrame(() => MFE.qr?.draw($('#lp-code-qr'), text, { ec: 'M', dark: '#000000', light: '#ffffff' }));
}

function checkResultCode() {
  const out = $('#lp-check-out');
  const r = decodeResult($('#lp-check-input').value);
  if (!r) { out.className = 'feedback err'; out.textContent = t('lp.check.bad'); return; }
  const name = (i) => `${i + 1}`;
  out.className = 'feedback ok';
  out.textContent = `${resultSummary(r)} ${t('lp.check.steps', {
    done: r.done.map(name).join(', ') || '–', skip: r.skipped.map(name).join(', ') || '–' })}`;
}

/* ==========================================================================
   8 · ANBINDUNG
   ========================================================================== */
function onShow(which) {
  if (which === 'learn') renderOverview();
  if (which === 'lesson') {
    if (!stepOf()) { openOverview(); return; }
    lessonOpen = true;
    renderLesson();
  }
}

/** Jeder Bildschirmwechsel (app.js). Verlaesst die Nutzerin den Schritt
 *  selbst, ist er nicht mehr "offen" - beim naechsten Start geht es dann
 *  nicht automatisch hinein, nur die Uebersicht bietet das Fortsetzen an. */
function onScreen(which) {
  if (which === 'lesson') return;
  if (lessonOpen) { lessonOpen = false; saveLessonNow(); }
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
  $('#btn-lp-resume')?.addEventListener('click', () => { if (!resumePending()) renderOverview(); });
  $('#btn-lp-code')?.addEventListener('click', showResultCode);
  $('#btn-lp-code-close')?.addEventListener('click', () => $('#lp-code-dialog').close());
  $('#btn-lp-code-copy')?.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('#lp-code-dialog').dataset.text || ''); toast(t('msg.copied')); }
    catch { toast($('#lp-code-dialog').dataset.text || ''); }
  });
  $('#btn-lp-check')?.addEventListener('click', checkResultCode);
  $('#lp-check-input')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); checkResultCode(); } });
  $('#btn-lp-discard')?.addEventListener('click', () => { clearLesson(); renderOverview(); });
  // Beim Wegschalten der App sofort sichern - danach kann iOS sie beenden.
  document.addEventListener('visibilitychange', () => { if (document.hidden && stepOf()) saveLessonNow(); });
  addEventListener('pagehide', () => { if (stepOf()) saveLessonNow(); });
  $('#btn-lp-reset')?.addEventListener('click', () => {
    if (!confirm(t('lp.resetConfirm'))) return;
    resetPath(overviewPath);
    renderOverview();
    toast(t('lp.resetDone'));
  });
}

return {
  init, register, openOverview, openLesson, onShow, onScreen, relabel, redraw, resumeOnStart,
  /* Baukasten fuer die Inhaltsdateien */
  kit: { pick, shuffle, near, round4, eqOptions, variants, sameCurve, matchEqTask, buildTask, trueFalseTask },
  /* Fuer tools/paths-test.mjs und tools/smoke.mjs */
  core: { sanitizeStore, loadStore, saveStore, stepState, recordPass, resetPath, stepFree,
          countPassed, nextOpen, needFor, gradeInput, gradeBuild, markPoints,
          remedyStep, buildTasks, optionText, txt, fmtVar, STORE_KEY, PASS_SHARE,
          sanitizeLesson, snapshotLesson, saveLessonNow, LESSON_KEY,
          pathResult, encodeResult, decodeResult, resultSummary },
  get paths() { return PATHS; },
  get lesson() {
    return { pid: L.pid, idx: L.idx, mode: L.mode, phase: L.phase, mission: L.mission, memo: { ...L.memo },
             guess: L.guess, ti: L.ti, score: L.score, order: L.order.slice(),
             task: L.tasks[L.ti] ?? null, count: L.tasks.length, result: L.result,
             remedies: [...L.remedies] };
  }
};
})();
