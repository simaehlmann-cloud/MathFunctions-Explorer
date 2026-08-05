/* ==========================================================================
   app.js  ·  Zustand und Oberflaeche
   --------------------------------------------------------------------------
   Reglergruppe: js/ui.js · Quiz-Baukasten: js/quiz.js · Zeichnen: js/graph.js
   Hier bleibt: Zustand, Explorer, Ansichtssteuerung, Wertetabelle, der
   eingebaute Uebungsteil, Navigation und die Weiche Lite/Pro.
   ========================================================================== */
'use strict';

(() => {
const { clamp, tolerance, fmt, mfmt, parseLoose, FUNCTIONS, CATEGORY_FORMS } = MFE.math;
const { Graph, drawScene, normalizeView, zoomView, panView, fitY, DEFAULT_VIEW,
        CURVE_COLORS } = MFE.graph;
const { $, $$, debounce, toast, renderSliderGroup, setValue: uiSetValue, setSnap } = MFE.ui;
const licence = MFE.licence;
const t = (k, v) => MFE.i18n.t(k, v);
const C = (n) => MFE.colors.get(n);

const REDUCED_MOTION = matchMedia('(prefers-reduced-motion: reduce)').matches;
const SYMBOL_RE = /^[A-Za-z\u03b1-\u03c9][0-9\u2081-\u2089]{0,2}$/u;
const STORAGE_KEY = 'mfe:v3';
const SESSION_KEY = 'mfe:session';
const SESSION_MAX_AGE = 30 * 24 * 3600 * 1000;   // 30 Tage
const CURVE_NAMES = ['f', 'g'];
const SCREENS = ['home', 'app', 'quizzes', 'builder', 'play', 'info'];
const BEAMER_SCALE = 1.55;
/* Wird von tools/build-www.mjs aus package.json gesetzt; tools/check.mjs
   prueft, dass beide uebereinstimmen. Damit laesst sich an der App ablesen,
   welcher Stand tatsaechlich installiert ist - bisher liess sich das nur
   raten. */
const APP_VERSION = '6.5.1';

/** Voreinstellungen fuer den Ausschnitt. "Wachstum" ist der Fall, der vorher
 *  gar nicht darstellbar war: die App erklaert a = 100 bei einer
 *  Bakterienkultur, die y-Achse ging aber nur bis 50. */
const PRESETS = {
  standard:      { xMin: -10, xMax: 10, yMin: -10, yMax: 10, piAxis: false },
  trig:          { xMin: -2 * Math.PI, xMax: 2 * Math.PI, yMin: -4, yMax: 4, piAxis: true },
  growth:        { xMin: 0, xMax: 10, yMin: 0, yMax: 1000, piAxis: false },
  firstQuadrant: { xMin: 0, xMax: 20, yMin: 0, yMax: 20, piAxis: false },
  fine:          { xMin: -1, xMax: 1, yMin: -1, yMax: 1, piAxis: false }
};

/* ==========================================================================
   1 · ZUSTAND
   ========================================================================== */
const state = {
  curves: [],
  active: 0,
  symbols: {},
  theme: 'light',
  display: 'normal',              // 'normal' oder 'beamer'
  snap: true,
  split: true,          // Wertetabelle neben dem Graphen, wenn Platz ist
  view: { ...DEFAULT_VIEW },
  piAxis: false,
  tangentX: 1,
  traceX: null,
  table: { diff: false, quot: false },
  opts: {
    helpers: true, roots: false, yint: false, vertex: false,
    drag: false, intersections: false, derivative: false, tangent: false, trace: false
  }
};

function makeCurve(form) {
  const d = FUNCTIONS[form];
  return {
    form,
    values: Object.fromEntries(d.params.map(p => [p.id, p.value])),
    bounds: Object.fromEntries(d.params.map(p => [p.id, { min: p.min, max: p.max }]))
  };
}
function ensureSymbols(form) {
  state.symbols[form] ??= Object.fromEntries(FUNCTIONS[form].params.map(p => [p.id, p.symbol]));
}

const curve = (i = state.active) => state.curves[i];
const def = (i = state.active) => FUNCTIONS[curve(i).form];
const values = (i = state.active) => curve(i).values;
const paramDef = (id, i = state.active) => def(i).params.find(p => p.id === id);
const boundsOf = (id, i = state.active) => curve(i).bounds[id];
const symbolOf = (id, form = curve().form) => state.symbols[form]?.[id] ?? id;
const curveName = (i) => CURVE_NAMES[i] ?? 'h';
const viewOf = () => ({ ...state.view, piAxis: state.piAxis });

state.curves = [makeCurve('linear')];
Object.keys(FUNCTIONS).forEach(ensureSymbols);

function firstAllowedCategory() {
  return Object.keys(CATEGORY_FORMS).find(cat => licence.has('cat.' + cat)) ?? 'linear';
}

/* --- Einstellungen (Sprache, Theme, Darstellung, Buchstaben) --- */
function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (!s) return;
    if (MFE.i18n.has(s.lang)) MFE.i18n.lang = s.lang;
    if (s.theme === 'dark' || s.theme === 'light') state.theme = s.theme;
    if (s.display === 'beamer' || s.display === 'normal') state.display = s.display;
    if (typeof s.snap === 'boolean') state.snap = s.snap;
    if (typeof s.split === 'boolean') state.split = s.split;
    for (const [form, map] of Object.entries(s.symbols || {})) {
      if (!FUNCTIONS[form]) continue;
      ensureSymbols(form);
      for (const [id, sym] of Object.entries(map)) {
        if (id in state.symbols[form] && SYMBOL_RE.test(sym)) state.symbols[form][id] = sym;
      }
    }
  } catch { /* privater Modus: Standardwerte sind in Ordnung */ }
}
const saveSettings = debounce(() => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      lang: MFE.i18n.lang, theme: state.theme, display: state.display,
      snap: state.snap, split: state.split, symbols: state.symbols
    }));
  } catch {}
}, 400);

/* --------------------------------------------------------------------------
   Arbeitsstand
   Bisher ueberlebten nur Sprache, Farbschema und die Buchstaben einen
   Neustart. Kurve, Parameter und Ausschnitt waren weg - wer die App im
   Unterricht kurz verliess, fing von vorn an. Der Stand liegt in einem
   eigenen Schluessel, damit ein beschaedigter Eintrag nicht auch die
   Einstellungen mitreisst.
   -------------------------------------------------------------------------- */
const saveSession = debounce(() => {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify({
      at: Date.now(),
      curves: state.curves,
      active: state.active,
      view: state.view,
      piAxis: state.piAxis,
      opts: state.opts,
      table: state.table,
      tangentX: state.tangentX,
      inApp: lastScreen === 'app',
      tab: currentTab
    }));
  } catch { /* Speicher voll oder gesperrt: der Stand ist ein Komfort, kein Muss */ }
}, 800);

/** Liest den Stand zurueck. Jeder Wert wird geprueft: der Eintrag kann von
 *  einer aelteren Fassung stammen, von Hand veraendert oder halb geschrieben
 *  worden sein. Im Zweifel wird er verworfen, nicht repariert. */
function loadSession() {
  let s;
  try { s = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch { return null; }
  if (!s || !Array.isArray(s.curves) || !s.curves.length) return null;
  if (!Number.isFinite(s.at) || Date.now() - s.at > SESSION_MAX_AGE) return null;

  const curves = [];
  for (const raw of s.curves.slice(0, 2)) {
    const d = FUNCTIONS[raw?.form];
    if (!d) return null;
    // Eine gesperrte Klasse darf ueber den Arbeitsstand nicht zurueckkommen.
    if (!licence.has('cat.' + d.category)) return null;
    const cu = makeCurve(raw.form);
    for (const prm of d.params) {
      const v = Number(raw.values?.[prm.id]);
      if (!Number.isFinite(v)) return null;
      cu.values[prm.id] = clamp(v, prm.hardMin ?? -1e9, prm.hardMax ?? 1e9);
      const b = raw.bounds?.[prm.id];
      if (b && Number.isFinite(b.min) && Number.isFinite(b.max) && b.min < b.max) {
        cu.bounds[prm.id] = { min: b.min, max: b.max };
      }
      if (cu.values[prm.id] < cu.bounds[prm.id].min) cu.bounds[prm.id].min = Math.floor(cu.values[prm.id]);
      if (cu.values[prm.id] > cu.bounds[prm.id].max) cu.bounds[prm.id].max = Math.ceil(cu.values[prm.id]);
    }
    curves.push(cu);
  }
  if (curves.length === 2 && !licence.has('secondCurve')) curves.length = 1;

  const opts = { ...state.opts };
  for (const k of Object.keys(opts)) if (typeof s.opts?.[k] === 'boolean') opts[k] = s.opts[k];
  if (!licence.has('drag')) opts.drag = false;
  if (!licence.has('calculus')) { opts.derivative = false; opts.tangent = false; }
  if (curves.length < 2) opts.intersections = false;

  return {
    curves, opts,
    active: curves[s.active] ? s.active : 0,
    view: normalizeView(s.view),
    piAxis: !!s.piAxis,
    table: { diff: !!s.table?.diff, quot: !!s.table?.quot },
    tangentX: Number.isFinite(s.tangentX) ? s.tangentX : 1,
    inApp: !!s.inApp,
    tab: ['explorer', 'table', 'quiz'].includes(s.tab) ? s.tab : 'explorer'
  };
}

/* ==========================================================================
   2 · DEEP LINKS
   Der Zustand steht im location.hash. Der Hash wird vom Browser NICHT an
   einen Server uebertragen - fuer eine Schul-App der relevante Unterschied
   zum Query-String.
   ========================================================================== */
const r4 = (n) => Math.round(n * 1e4) / 1e4;

function buildHash() {
  const q = new URLSearchParams();
  state.curves.forEach((cu, i) => {
    const pre = i === 0 ? '' : 'g';
    q.set(pre + 'f', cu.form);
    for (const p of FUNCTIONS[cu.form].params) {
      q.set(pre + p.id, String(cu.values[p.id]));
      if (symbolOf(p.id, cu.form) !== p.symbol) q.set(pre + 's.' + p.id, symbolOf(p.id, cu.form));
    }
  });
  q.set('vx', `${r4(state.view.xMin)},${r4(state.view.xMax)}`);
  q.set('vy', `${r4(state.view.yMin)},${r4(state.view.yMax)}`);
  if (state.piAxis) q.set('pi', '1');
  return '#' + q.toString();
}

/** "a,b" einlesen. Faellt auf null zurueck, wenn irgendetwas nicht stimmt -
 *  der Wert kommt von aussen. */
function pair(raw) {
  if (!raw) return null;
  const parts = String(raw).split(',');
  if (parts.length !== 2) return null;
  const a = parseLoose(parts[0], NaN), b = parseLoose(parts[1], NaN);
  return Number.isFinite(a) && Number.isFinite(b) ? [a, b] : null;
}

function readHash() {
  if (!location.hash.length) return false;
  const q = new URLSearchParams(location.hash.slice(1));
  const form0 = q.get('f');
  if (!form0 || !FUNCTIONS[form0]) return false;
  // Ein Link auf eine gesperrte Funktionsklasse darf die Sperre nicht
  // aushebeln - sonst waere die Lite-Ausgabe mit einer URL umgangen.
  if (!licence.has('cat.' + FUNCTIONS[form0].category)) { proHint('cat'); return false; }

  const curves = [];
  for (const pre of ['', 'g']) {
    const form = q.get(pre + 'f');
    if (!form || !FUNCTIONS[form]) continue;
    if (!licence.has('cat.' + FUNCTIONS[form].category)) continue;
    if (pre === 'g' && !licence.has('secondCurve')) continue;
    ensureSymbols(form);
    const cu = makeCurve(form);
    for (const p of FUNCTIONS[form].params) {
      const raw = parseLoose(q.get(pre + p.id), NaN);
      if (Number.isFinite(raw)) {
        const v = clamp(raw, p.hardMin ?? -Infinity, p.hardMax ?? Infinity);
        if (v < cu.bounds[p.id].min) cu.bounds[p.id].min = Math.floor(v);
        if (v > cu.bounds[p.id].max) cu.bounds[p.id].max = Math.ceil(v);
        cu.values[p.id] = v;
      }
      const sym = q.get(pre + 's.' + p.id);
      if (sym && SYMBOL_RE.test(sym)) state.symbols[form][p.id] = sym;   // validiert!
    }
    curves.push(cu);
  }
  if (!curves.length) return false;
  state.curves = curves.slice(0, 2);
  state.active = 0;

  const vx = pair(q.get('vx')), vy = pair(q.get('vy'));
  if (vx && vy) {
    state.view = normalizeView({ xMin: vx[0], xMax: vx[1], yMin: vy[0], yMax: vy[1] });
  } else {
    // Links aus Fassung 4 trugen nur zwei Halbweiten.
    const xs = parseLoose(q.get('xs'), NaN), ys = parseLoose(q.get('ys'), NaN);
    if (Number.isFinite(xs) || Number.isFinite(ys)) {
      const sx = Number.isFinite(xs) ? clamp(xs, 1, 50) : 10;
      const sy = Number.isFinite(ys) ? clamp(ys, 1, 50) : 10;
      state.view = normalizeView({ xMin: -sx, xMax: sx, yMin: -sy, yMax: sy });
    }
  }
  state.piAxis = q.get('pi') === '1';
  if (state.curves.length === 2) state.opts.intersections = true;
  return true;
}

const syncHash = debounce(() => {
  // Solange ein Quiz-Link im Hash steht, nicht ueberschreiben - sonst waere
  // er weg, bevor die Nutzerin ihn weitergeben konnte.
  if (location.hash.startsWith('#quiz=')) return;
  // history.state weiterreichen: darin liegt die Wegmarke von nav.js. Ein
  // replaceState(null, ...) wuerde sie loeschen und den Zurueck-Knopf brechen.
  try { history.replaceState(history.state, '', buildHash()); } catch {}
}, 300);

/* ==========================================================================
   3 · UNDO / REDO
   ========================================================================== */
const history_ = { stack: [], index: -1, max: 40, muted: false };

const snapshot = () => JSON.stringify({
  curves: state.curves, active: state.active, symbols: state.symbols,
  view: state.view, piAxis: state.piAxis, opts: state.opts,
  tangentX: state.tangentX
});

const pushHistory = debounce(() => {
  if (history_.muted) return;
  const snap = snapshot();
  if (history_.stack[history_.index] === snap) return;
  history_.stack.splice(history_.index + 1);
  history_.stack.push(snap);
  if (history_.stack.length > history_.max) history_.stack.shift();
  history_.index = history_.stack.length - 1;
  updateUndoButtons();
  saveSession();
}, 600);

function applySnapshot(json) {
  let s;
  try { s = JSON.parse(json); } catch { return; }
  state.curves = s.curves; state.active = s.active; state.symbols = s.symbols;
  state.view = normalizeView(s.view); state.piAxis = s.piAxis;
  state.opts = s.opts;
  state.tangentX = Number.isFinite(s.tangentX) ? s.tangentX : 1;
  history_.muted = true;
  syncViewInputs(); syncOptionInputs();
  updateExplorer();
  history_.muted = false;
  updateUndoButtons();
}
function undo() {
  if (history_.index <= 0) { toast(t('msg.nothingUndo')); return; }
  history_.index--; applySnapshot(history_.stack[history_.index]); toast(t('msg.undo'));
}
function redo() {
  if (history_.index >= history_.stack.length - 1) return;
  history_.index++; applySnapshot(history_.stack[history_.index]); toast(t('msg.redo'));
}
function updateUndoButtons() {
  $('#btn-undo').disabled = history_.index <= 0;
  $('#btn-redo').disabled = history_.index >= history_.stack.length - 1;
}

/* ==========================================================================
   4 · REGLERKONTEXT
   ========================================================================== */
function explorerCtx() {
  const cu = curve();
  return {
    form: cu.form, values: cu.values, bounds: cu.bounds, prefix: '', play: true,
    symbolOf,
    onChange: () => { render(); syncHash(); },
    onCommit: () => pushHistory()
  };
}
const setValue = (ctx, id, v) => uiSetValue(ctx, id, v);

/* ==========================================================================
   5 · EXPLORER-DARSTELLUNG
   ========================================================================== */
let mainGraph, quizGraph, practiceGraph, frameRequested = false;
const thumbs = [];

const sceneScale = () => (state.display === 'beamer' ? BEAMER_SCALE : 1);

function scene() {
  return {
    curves: state.curves.map((cu, i) => ({ form: cu.form, values: cu.values, color: CURVE_COLORS[i] })),
    activeIndex: state.active,
    view: viewOf(),
    opts: state.opts,
    tangentX: state.tangentX,
    traceX: state.traceX,
    scale: sceneScale()
  };
}

function render() {
  if (frameRequested) return;
  frameRequested = true;
  requestAnimationFrame(() => {
    frameRequested = false;
    if (!mainGraph.measure()) return;
    const sc = scene();
    drawScene(mainGraph, sc);
    updateReadout(sc);
    describeGraph();
  });
}

/** Der Ablesetext unter dem Graphen. Reihenfolge nach Dringlichkeit: was die
 *  Nutzerin gerade anfasst, steht vorn. */
function updateReadout(sc) {
  const parts = [];
  if (sc.traceInfo) parts.push(`(${mfmt(sc.traceInfo.x)} | ${mfmt(sc.traceInfo.y)})`);
  if (sc.tangentInfo) {
    parts.push(`${t('poi.slope')} ${mfmt(sc.tangentInfo.m)} ${t('poi.at')} x = ${mfmt(sc.tangentInfo.x)}`);
  }
  if (state.opts.intersections && state.curves.length === 2) {
    parts.push(sc.intersections.length
      ? sc.intersections.map(p => `${t('poi.intersection')} (${mfmt(p.x)} | ${mfmt(p.y)})`).join('   ')
      : t('msg.noIntersection'));
  }
  $('#readout').textContent = parts.join('   ·   ');
}

/** Formel als DOM-Knoten. Kein innerHTML mit Nutzerdaten: der frei waehlbare
 *  Buchstabe kommt ueber textContent in die Seite und kann damit keinen Code
 *  ausfuehren - wichtig, weil Symbole ueber Deep Links von aussen stammen. */
function renderEquation(container, i, { interactive = true } = {}) {
  const cu = state.curves[i];
  const d = FUNCTIONS[cu.form];
  container.replaceChildren();
  container.append(document.createTextNode(`${curveName(i)}(x) = `));

  for (const tok of d.tokens()) {
    if (tok.text !== undefined) {
      container.append(document.createTextNode(tok.text));
    } else if (tok.sup !== undefined) {
      const s = document.createElement('sup');
      s.textContent = tok.sup;
      container.append(s);
    } else {
      const p = d.params.find(x => x.id === tok.param);
      const el = document.createElement(interactive ? 'button' : 'span');
      if (interactive) { el.type = 'button'; el.dataset.param = p.id; }
      el.className = `param-chip c${p.color}`;
      el.textContent = symbolOf(p.id, cu.form);
      if (interactive) el.setAttribute('aria-label', `${symbolOf(p.id, cu.form)} \u2013 ${t('lbl.meaning')}`);
      container.append(el);
    }
  }
}

function renderCurveSwitcher() {
  const box = $('#curve-switch');
  box.replaceChildren();
  state.curves.forEach((cu, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'curve-chip' + (i === state.active ? ' is-active' : '');
    b.dataset.curve = String(i);
    b.style.setProperty('--chip-color', C(CURVE_COLORS[i]));
    b.textContent = `${curveName(i)}(x)`;
    box.append(b);
  });

  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'curve-add';
  if (state.curves.length === 1) {
    add.textContent = t('curve.add');
    add.dataset.action = 'add';
    if (!licence.has('secondCurve')) add.classList.add('is-locked');
  } else {
    add.textContent = t('curve.remove');
    add.dataset.action = 'remove';
  }
  box.append(add);
}

/**
 * Die Auswahlliste fuehrt jetzt alle Funktionsklassen, nach Klasse gruppiert.
 * Vorher zeigte sie nur die Darstellungsformen der aktuellen Klasse - um von
 * einer Parabel zu einer Sinuskurve zu kommen, musste man zurueck zur
 * Startseite. Gesperrte Klassen bleiben sichtbar und auswaehlbar; die Auswahl
 * fuehrt dann zum Hinweis auf die Pro-Ausgabe statt sie stillschweigend zu
 * verschlucken.
 */
function renderFormSelect() {
  const sel = $('#function-form');
  sel.replaceChildren();

  for (const [cat, forms] of Object.entries(CATEGORY_FORMS)) {
    const allowed = licence.has('cat.' + cat);
    const group = document.createElement('optgroup');
    group.label = t('cat.' + cat) + (allowed ? '' : '  \u2013 PRO');
    for (const f of forms) {
      const o = document.createElement('option');
      o.value = f;
      // Bei Klassen mit nur einer Form waere die Gruppenzeile sonst
      // doppelt beschriftet.
      o.textContent = forms.length > 1 ? t('form.' + f) : t('cat.' + cat);
      if (!allowed) o.textContent += '  \u2013 PRO';
      o.selected = f === curve().form;
      o.dataset.cat = cat;
      group.append(o);
    }
    sel.append(group);
  }
  sel.closest('.form-row').hidden = false;
  $('#btn-transform').hidden = !def().transform || !licence.has('transform');
}

function updateOptionAvailability() {
  $('#opt-vertex').closest('.chip').hidden = !def().vertex;
  $('#opt-drag').closest('.chip').hidden = !def().handles;
  $('#opt-intersections').closest('.chip').hidden = state.curves.length < 2;
}

function updateExplorer() {
  renderCurveSwitcher();
  renderFormSelect();
  const eqBox = $('#equations');
  eqBox.replaceChildren();
  state.curves.forEach((cu, i) => {
    const line = document.createElement('div');
    line.className = 'equation-display' + (i === state.active ? ' is-active' : '');
    line.dataset.curve = String(i);
    renderEquation(line, i, { interactive: i === state.active });
    eqBox.append(line);
  });

  renderSliderGroup($('#parameters-container'), explorerCtx());
  renderTableHead();
  invalidateTable();
  updateOptionAvailability();
  markProFeatures();
  render();
  syncHash();
}

/* ==========================================================================
   6 · ANSICHT: ZOOMEN, VERSCHIEBEN, PASSEND MACHEN
   ========================================================================== */
function setView(v, { push = true } = {}) {
  state.view = normalizeView(v);
  syncViewInputs();
  render();
  syncHash();
  if (push) pushHistory();
}

function zoomBy(factor, ax, ay) {
  const v = state.view;
  setView(zoomView(v, factor,
    Number.isFinite(ax) ? ax : (v.xMin + v.xMax) / 2,
    Number.isFinite(ay) ? ay : (v.yMin + v.yMax) / 2));
}

/** Passend zoomen: x-Bereich behalten, y aus den tatsaechlichen Werten
 *  bestimmen. Genau das loest den Fall "a = 100" bei der Exponentialfunktion. */
function fitView() {
  const v = state.view;
  const { yMin, yMax } = fitY(state.curves, v.xMin, v.xMax);
  setView({ ...v, yMin, yMax });
  toast(t('msg.fitted'));
}

function applyPreset(name) {
  const p = PRESETS[name];
  if (!p) return;
  state.piAxis = !!p.piAxis;
  $('#opt-piAxis').checked = state.piAxis;
  setView(p);
}

function syncViewInputs() {
  const v = state.view;
  const digits = Math.abs(v.xMax - v.xMin) < 2 || Math.abs(v.yMax - v.yMin) < 2 ? 4 : 2;
  const set = (id, val) => { const el = $(id); if (el && document.activeElement !== el) el.value = fmt(val, digits); };
  set('#view-x0', v.xMin); set('#view-x1', v.xMax);
  set('#view-y0', v.yMin); set('#view-y1', v.yMax);
}

function commitViewInputs() {
  const g = (id, fb) => parseLoose($(id).value, fb);
  const v = normalizeView({
    xMin: g('#view-x0', state.view.xMin), xMax: g('#view-x1', state.view.xMax),
    yMin: g('#view-y0', state.view.yMin), yMax: g('#view-y1', state.view.yMax)
  });
  setView(v);
}

/* --------------------------------------------------------------------------
   Zeigerbedienung am Koordinatensystem
   Ein Zeiger: je nach Modus Ziehpunkt, Tangente, Trace oder Verschieben.
   Zwei Zeiger: Zoomen und Verschieben zugleich.
   -------------------------------------------------------------------------- */
const pointers = new Map();
let gesture = null;         // { mode, ... }

const canvasPoint = (e) => {
  const r = mainGraph.canvas.getBoundingClientRect();
  return { px: e.clientX - r.left, py: e.clientY - r.top };
};

function hitHandle(px, py) {
  const d = def();
  if (!d.handles) return null;
  const list = d.handles(values());
  const tol = 24 * (state.display === 'beamer' ? 1.3 : 1);
  for (let i = 0; i < list.length; i++) {
    const dx = mainGraph.x2px(list[i].x) - px, dy = mainGraph.y2px(list[i].y) - py;
    if (dx * dx + dy * dy <= tol * tol) return i;
  }
  return null;
}

function hitTangent(px) {
  if (!state.opts.tangent || !Number.isFinite(state.tangentX)) return false;
  return Math.abs(mainGraph.x2px(state.tangentX) - px) <= 26;
}

function twoPointerState() {
  const [a, b] = [...pointers.values()];
  const dx = a.px - b.px, dy = a.py - b.py;
  return {
    dist: Math.hypot(dx, dy) || 1,
    cx: (a.px + b.px) / 2,
    cy: (a.py + b.py) / 2
  };
}

function onPointerDown(e) {
  if (!mainGraph.ready && !mainGraph.measure()) return;
  const pt = canvasPoint(e);
  pointers.set(e.pointerId, pt);
  try { mainGraph.canvas.setPointerCapture(e.pointerId); } catch {}

  if (pointers.size === 2) {
    const s = twoPointerState();
    gesture = { mode: 'pinch', startDist: s.dist, startView: { ...state.view },
                anchorX: mainGraph.px2x(s.cx), anchorY: mainGraph.py2y(s.cy),
                lastCx: s.cx, lastCy: s.cy };
    stopPlay();
    e.preventDefault();
    return;
  }
  if (pointers.size > 2) return;

  const handle = state.opts.drag ? hitHandle(pt.px, pt.py) : null;
  if (handle !== null) {
    gesture = { mode: 'handle', index: handle };
    stopPlay();
  } else if (hitTangent(pt.px)) {
    gesture = { mode: 'tangent' };
  } else if (state.opts.trace) {
    gesture = { mode: 'trace' };
    state.traceX = mainGraph.px2x(pt.px);
    render();
  } else {
    gesture = { mode: 'pan', startView: { ...state.view }, startPx: pt.px, startPy: pt.py, moved: false };
  }
  mainGraph.canvas.classList.add('is-dragging');
  e.preventDefault();
}

function onPointerMove(e) {
  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, canvasPoint(e));

  if (gesture?.mode === 'pinch' && pointers.size >= 2) {
    const s = twoPointerState();
    const factor = clamp(gesture.startDist / s.dist, 0.02, 50);
    let v = zoomView(gesture.startView, factor, gesture.anchorX, gesture.anchorY);
    // Zusaetzlich das Verschieben der Fingermitte auswerten.
    const dxPx = s.cx - gesture.lastCx, dyPx = s.cy - gesture.lastCy;
    const upx = (v.xMax - v.xMin) / Math.max(mainGraph.w, 1);
    const upy = (v.yMax - v.yMin) / Math.max(mainGraph.h, 1);
    v = panView(v, -dxPx * upx, dyPx * upy);
    state.view = normalizeView(v);
    syncViewInputs();
    render();
    e.preventDefault();
    return;
  }

  const pt = pointers.get(e.pointerId);
  switch (gesture?.mode) {
    case 'handle': {
      const list = def().handles?.(values());
      const hd = list?.[gesture.index];
      if (!hd) return;
      const patch = hd.set(mainGraph.px2x(pt.px), mainGraph.py2y(pt.py));
      const ctx = explorerCtx();
      for (const [id, val] of Object.entries(patch)) {
        const p = paramDef(id);
        if (!p) continue;
        setValue(ctx, id, Math.round(val / p.step) * p.step);
      }
      break;
    }
    case 'tangent':
      state.tangentX = mainGraph.px2x(pt.px);
      render();
      break;
    case 'trace':
      state.traceX = mainGraph.px2x(pt.px);
      render();
      break;
    case 'pan': {
      const dx = pt.px - gesture.startPx, dy = pt.py - gesture.startPy;
      if (Math.hypot(dx, dy) > 3) gesture.moved = true;
      const v0 = gesture.startView;
      const upx = (v0.xMax - v0.xMin) / Math.max(mainGraph.w, 1);
      const upy = (v0.yMax - v0.yMin) / Math.max(mainGraph.h, 1);
      state.view = panView(v0, -dx * upx, dy * upy);
      syncViewInputs();
      render();
      break;
    }
    default: return;
  }
  e.preventDefault();
}

function onPointerUp(e) {
  pointers.delete(e.pointerId);
  try { mainGraph.canvas.releasePointerCapture?.(e.pointerId); } catch {}
  if (pointers.size >= 2) return;

  if (gesture?.mode === 'pinch') {
    // Ein Finger liegt noch auf: nahtlos ins Verschieben wechseln.
    const rest = [...pointers.values()][0];
    gesture = rest
      ? { mode: 'pan', startView: { ...state.view }, startPx: rest.px, startPy: rest.py, moved: true }
      : null;
    if (!rest) { syncHash(); pushHistory(); }
    return;
  }

  const mode = gesture?.mode;
  gesture = null;
  mainGraph.canvas.classList.remove('is-dragging');

  if (mode === 'trace') { state.traceX = null; render(); return; }
  if (mode === 'pan') { syncHash(); pushHistory(); return; }
  if (mode === 'handle' || mode === 'tangent') { syncHash(); pushHistory(); }
}

function onWheel(e) {
  if (!mainGraph.ready && !mainGraph.measure()) return;
  e.preventDefault();
  const pt = canvasPoint(e);
  // Shift = nur waagerecht, Alt = nur senkrecht. Am Rechner sehr praktisch,
  // am Telefon ohne Bedeutung.
  const axis = e.shiftKey ? 'x' : e.altKey ? 'y' : 'both';
  const factor = e.deltaY > 0 ? 1.12 : 1 / 1.12;
  state.view = zoomView(state.view, factor, mainGraph.px2x(pt.px), mainGraph.py2y(pt.py), axis);
  syncViewInputs();
  render();
  syncHash();
  pushHistory();
}

function onDoubleClick(e) {
  if (!mainGraph.ready) return;
  const pt = canvasPoint(e);
  zoomBy(e.shiftKey ? 1.6 : 0.625, mainGraph.px2x(pt.px), mainGraph.py2y(pt.py));
  e.preventDefault();
}

/* ==========================================================================
   7 · PARAMETER-DIALOG
   ========================================================================== */
let dialogParam = null;
function openParamDialog(id) {
  const p = paramDef(id);
  if (!p) return;
  dialogParam = id;
  $('#dialog-title').textContent = symbolOf(id);
  $('#dialog-symbol').value = symbolOf(id);
  $('#dialog-description').textContent = t(p.desc);
  const ex = t(p.desc + '.ex');
  $('#dialog-example').textContent = ex === p.desc + '.ex' ? '' : ex;
  $('#dialog-symbol-error').hidden = true;
  MFE.nav.openDialog($('#param-dialog'));
}

function saveParamDialog() {
  const input = $('#dialog-symbol');
  const val = input.value.trim();
  if (!SYMBOL_RE.test(val)) { $('#dialog-symbol-error').hidden = false; return false; }
  state.symbols[curve().form][dialogParam] = val;
  saveSettings();
  updateExplorer();
  pushHistory();
  return true;
}

/* ==========================================================================
   8 · ANIMATION
   ========================================================================== */
let playing = null;
function stopPlay() {
  if (!playing) return;
  cancelAnimationFrame(playing.raf);
  $(`.play-btn[data-play="${playing.id}"]`)?.setAttribute('aria-pressed', 'false');
  playing = null;
}
function togglePlay(id) {
  const was = playing?.id === id;
  stopPlay();
  if (was) { pushHistory(); return; }
  const ctx = explorerCtx();
  const b = boundsOf(id);
  if (!b || b.max <= b.min) return;
  $(`.play-btn[data-play="${id}"]`)?.setAttribute('aria-pressed', 'true');
  const perMs = (b.max - b.min) / (REDUCED_MOTION ? 12000 : 4500);
  let dir = 1, last = performance.now();
  const tick = (now) => {
    if (!playing) return;
    const dt = Math.min(now - last, 100);   // nach einem Tabwechsel nicht springen
    last = now;
    let v = values()[id] + dir * perMs * dt;
    if (v >= b.max) { v = b.max; dir = -1; }
    if (v <= b.min) { v = b.min; dir = 1; }
    setValue(ctx, id, v, { snap: false });
    playing.raf = requestAnimationFrame(tick);
  };
  playing = { id, raf: requestAnimationFrame(tick) };
}

function tween(ctx, id, to, ms) {
  return new Promise(res => {
    const from = ctx.values[id], t0 = performance.now();
    const step = (now) => {
      const k = clamp((now - t0) / ms, 0, 1);
      const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
      setValue(ctx, id, from + (to - from) * e, { snap: false });
      if (k < 1) requestAnimationFrame(step); else res();
    };
    requestAnimationFrame(step);
  });
}

async function playTransformation() {
  if (!def().transform) return;
  if (!licence.has('transform')) { proHint(); return; }
  stopPlay();
  const ctx = explorerCtx();
  const target = { ...values() };
  const out = $('#readout');
  const dur = REDUCED_MOTION ? 300 : 1100;
  setValue(ctx, 'a', 1, { snap: false });
  setValue(ctx, 'd', 0, { snap: false });
  setValue(ctx, 'e', 0, { snap: false });
  out.textContent = t('tf.step0');
  await new Promise(r => setTimeout(r, dur / 2));
  out.textContent = t('tf.step1'); await tween(ctx, 'd', target.d, dur);
  out.textContent = t('tf.step2'); await tween(ctx, 'a', target.a, dur);
  out.textContent = t('tf.step3'); await tween(ctx, 'e', target.e, dur);
  setTimeout(() => { out.textContent = ''; }, 1500);
  pushHistory();
}

/* ==========================================================================
   9 · WERTETABELLE
   ========================================================================== */
const MAX_ROWS = 500;

function renderTableHead() {
  const tr = $('#values-table thead tr');
  tr.replaceChildren();
  const th0 = document.createElement('th'); th0.scope = 'col'; th0.textContent = 'x';
  tr.append(th0);
  state.curves.forEach((cu, i) => {
    const th = document.createElement('th'); th.scope = 'col';
    th.textContent = `${curveName(i)}(x)`;
    th.style.color = C(CURVE_COLORS[i]);
    tr.append(th);
    if (state.table.diff) {
      const d = document.createElement('th'); d.scope = 'col';
      d.className = 'col-extra';
      d.textContent = `\u0394${curveName(i)}`;
      tr.append(d);
    }
    if (state.table.quot) {
      const q = document.createElement('th'); q.scope = 'col';
      q.className = 'col-extra';
      q.textContent = `${curveName(i)}\u2099\u208a\u2081 / ${curveName(i)}\u2099`;
      tr.append(q);
    }
  });
}

/* Die Tabelle kostet bei 500 Zeilen und vier Spalten je Kurve spuerbar Zeit.
   Sie wird deshalb nur noch als "schmutzig" vermerkt und erst gerechnet,
   wenn ihr Reiter wirklich sichtbar ist. Beim Halten von Strg+Z war das
   vorher der Flaschenhals. */
let tableDirty = true;
function invalidateTable() {
  tableDirty = true;
  if (currentTab === 'table' && $('#screen-app')?.classList.contains('is-active')) generateTable();
}

function generateTable() {
  tableDirty = false;
  const msg = $('#table-msg');
  msg.textContent = '';
  let start = parseLoose($('#tbl-start').value, -5);
  let end = parseLoose($('#tbl-end').value, 5);
  let step = parseLoose($('#tbl-step').value, 1);

  if (start > end) { [start, end] = [end, start]; msg.textContent = t('msg.rangeSwapped'); }
  if (!(step > 0)) { step = 1; msg.textContent = t('msg.stepInvalid'); }

  /* Ueber einen Index multiplizieren statt x += step zu akkumulieren:
     sonst faellt je nach Bereich die letzte Zeile weg (0 bis 0,3 in
     0,1er-Schritten endet bei 0.30000000000000004 > 0.3). */
  let count = Math.floor((end - start) / step + 1e-9) + 1;
  if (!Number.isFinite(count) || count < 1) count = 1;
  if (count > MAX_ROWS) { count = MAX_ROWS; msg.textContent = t('msg.rowLimit', { n: MAX_ROWS }); }

  // Erst rechnen, dann zeichnen: fuer Differenzen und Quotienten wird der
  // jeweils naechste Wert gebraucht.
  const xs = [];
  const ys = state.curves.map(() => []);
  for (let i = 0; i < count; i++) {
    const x = Math.round((start + i * step) * 1e6) / 1e6;
    xs.push(x);
    state.curves.forEach((cu, c) => { ys[c].push(FUNCTIONS[cu.form].f(x, cu.values)); });
  }

  const frag = document.createDocumentFragment();
  const cell = (text, cls) => {
    const td = document.createElement('td');
    td.textContent = text;
    if (cls) td.className = cls;
    return td;
  };

  for (let i = 0; i < count; i++) {
    const tr = document.createElement('tr');
    tr.append(cell(fmt(xs[i], 3)));
    state.curves.forEach((cu, c) => {
      const y = ys[c][i];
      tr.append(cell(Number.isFinite(y) ? fmt(y, 3) : t('msg.undefined')));

      if (state.table.diff) {
        const nx = ys[c][i + 1];
        tr.append(cell(Number.isFinite(y) && Number.isFinite(nx) ? fmt(nx - y, 3) : '\u2013', 'col-extra'));
      }
      if (state.table.quot) {
        const nx = ys[c][i + 1];
        const ok = Number.isFinite(y) && Number.isFinite(nx) && Math.abs(y) > 1e-12;
        tr.append(cell(ok ? fmt(nx / y, 3) : '\u2013', 'col-extra'));
      }
    });
    frag.append(tr);
  }
  $('#values-table tbody').replaceChildren(frag);
}

async function copyTable() {
  const head = Array.from($$('#values-table thead th')).map(th => th.textContent).join('\t');
  const rows = $$('#values-table tbody tr').map(tr =>
    Array.from(tr.children).map(td => td.textContent).join('\t'));
  if (!rows.length) return;
  try { await navigator.clipboard.writeText([head, ...rows].join('\n')); toast(t('msg.copied')); }
  catch { toast(t('msg.copyFail')); }
}

/* ==========================================================================
   10 · UEBEN - Modus "Zuordnen"
   ========================================================================== */
const quiz = { answer: null, options: [], score: 0, total: 0, locked: false, form: 'linear' };

function quizView(form) {
  return { ...state.view, piAxis: FUNCTIONS[form].piAxis || state.piAxis };
}

function newQuizQuestion(fromExplorer = false) {
  quiz.form = curve(0).form;
  quiz.answer = fromExplorer ? { ...values(0) } : MFE.quiz.randomValues(quiz.form);
  quiz.locked = false;
  quiz.options = [quiz.answer, ...MFE.quiz.makeDistractors(quiz.form, quiz.answer, 3)]
    .sort(() => Math.random() - 0.5);
  const fb = $('#quiz-feedback'); fb.textContent = ''; fb.className = 'feedback';
  renderQuizOptions();
  drawQuiz();
}

function renderQuizOptions() {
  const box = $('#quiz-options');
  box.replaceChildren();
  quiz.options.forEach((v, i) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'quiz-opt'; b.dataset.index = String(i);
    b.textContent = `${String.fromCharCode(65 + i)})  ${MFE.quiz.eqText(quiz.form, v)}`;
    box.append(b);
  });
}

const BLANK_OPTS = { helpers: false, roots: false, yint: false, vertex: false,
                     drag: false, intersections: false, derivative: false, tangent: false, trace: false };

function drawQuiz() {
  if (!quiz.answer || !quizGraph || !quizGraph.measure()) return;
  drawScene(quizGraph, {
    curves: [{ form: quiz.form, values: quiz.answer, color: '--graph' }],
    activeIndex: 0,
    view: quizView(quiz.form),
    opts: BLANK_OPTS,
    scale: sceneScale()
  });
}

function answerQuiz(index) {
  if (quiz.locked) return;
  quiz.locked = true; quiz.total++;
  const correctIndex = quiz.options.indexOf(quiz.answer);
  const ok = index === correctIndex;
  if (ok) quiz.score++;
  $$('#quiz-options .quiz-opt').forEach((b, i) => {
    b.disabled = true;
    if (i === correctIndex) b.classList.add('is-correct');
    else if (i === index) b.classList.add('is-wrong');
  });
  const fb = $('#quiz-feedback');
  fb.className = 'feedback ' + (ok ? 'ok' : 'err');
  fb.textContent = ok ? t('quiz.right') : `${t('quiz.wrong')} ${MFE.quiz.eqText(quiz.form, quiz.answer)}`;
  $('#quiz-score').textContent = String(quiz.score);
  $('#quiz-total').textContent = String(quiz.total);
}

/* ==========================================================================
   11 · UEBEN - Modus "Nachbauen"
   ========================================================================== */
const practice = { form: 'linear', target: null, ctx: null };

function newPracticeTask() {
  practice.form = curve(0).form;
  practice.target = MFE.quiz.randomValues(practice.form);
  const fresh = makeCurve(practice.form);
  practice.ctx = {
    form: practice.form, values: fresh.values, bounds: fresh.bounds, prefix: 'pr-', play: false,
    symbolOf,
    onChange: () => drawPractice()
  };
  renderSliderGroup($('#practice-params'), practice.ctx);
  const fb = $('#practice-feedback'); fb.textContent = ''; fb.className = 'feedback';
  drawPractice();
}

function drawPractice() {
  if (!practice.target || !practiceGraph || !practiceGraph.measure()) return;
  drawScene(practiceGraph, {
    curves: [{ form: practice.form, values: practice.ctx.values, color: '--graph' }],
    ghost: { form: practice.form, values: practice.target },
    activeIndex: 0,
    view: quizView(practice.form),
    opts: BLANK_OPTS,
    scale: sceneScale()
  });
}

function checkPractice() {
  if (!practice.target) return;
  const d = FUNCTIONS[practice.form];
  const wrong = [];
  let ok = 0;
  for (const p of d.params) {
    const diff = practice.ctx.values[p.id] - practice.target[p.id];
    const tol = MFE.math.tolerance(practice.target[p.id], p.step);
    if (Math.abs(diff) <= tol) ok++;
    else wrong.push(`${symbolOf(p.id, practice.form)} ${t(diff > 0 ? 'build.tooHigh' : 'build.tooLow')}`);
  }
  const fb = $('#practice-feedback');
  if (!wrong.length) {
    fb.className = 'feedback ok';
    fb.textContent = `${t('build.done')} ${MFE.quiz.eqText(practice.form, practice.target)}`;
  } else {
    fb.className = 'feedback err';
    fb.textContent = `${t('build.hitCount', { ok, all: d.params.length })} ${t('build.close')} ${wrong.join(', ')}`;
  }
}

function setQuizMode(mode) {
  $$('#quiz-modes .seg-btn').forEach(b => {
    const on = b.dataset.mode === mode;
    b.classList.toggle('is-active', on);
    b.setAttribute('aria-pressed', String(on));
  });
  $('#mode-match').hidden = mode !== 'match';
  $('#mode-build').hidden = mode !== 'build';
  requestAnimationFrame(() => {
    if (mode === 'match') { if (!quiz.answer) newQuizQuestion(); else drawQuiz(); }
    else { if (!practice.target) newPracticeTask(); else drawPractice(); }
  });
}

/* ==========================================================================
   12 · MINIATURGRAPHEN AUF DER STARTSEITE
   Statt starrer SVG-Pfade zeichnet jede Karte eine echte Instanz ihrer
   Klasse - dieselbe Zeichenroutine wie im Explorer.
   ========================================================================== */
const THUMB_VIEW = {
  standard:      { xMin: -6, xMax: 6, yMin: -4, yMax: 4 },
  trig:          { xMin: -6.5, xMax: 6.5, yMin: -3, yMax: 3 },
  exponential:   { xMin: -3, xMax: 4, yMin: -1, yMax: 8 },
  logarithm:     { xMin: -1, xMax: 8, yMin: -3, yMax: 3 },
  root:          { xMin: -2, xMax: 9, yMin: -1, yMax: 4 },
  rational:      { xMin: -5, xMax: 5, yMin: -5, yMax: 5 }
};
const THUMB_VALUES = {
  linear:      ['linear',      { m: 1.2, b: -1 }],
  quadratic:   ['quad_vertex', { a: 1, d: 0.5, e: -2 }],
  polynomial:  ['cubic',       { a: 0.35, b: 0, c: -2, d: 0 }],
  exponential: ['exponential', { a: 1, b: 1.8, c: 0 }],
  logarithm:   ['logarithm',   { a: 1.2, b: 0, c: 0 }],
  trig:        ['sinus',       { a: 2, b: 1, c: 0, d: 0 }],
  root:        ['root',        { a: 1.2, b: 0, c: 0 }],
  absolute:    ['absolute',    { a: 1, b: 0, c: -2 }],
  rational:    ['rational',    { a: 2, b: 0, c: 0 }]
};

function initThumbs() {
  thumbs.length = 0;
  for (const cv of $$('.fn-thumb')) {
    const cat = cv.dataset.thumb;
    const entry = THUMB_VALUES[cat];
    if (!entry) continue;
    thumbs.push({ graph: new Graph(cv), cat, form: entry[0], values: entry[1] });
  }
}

function drawThumbs() {
  for (const th of thumbs) {
    if (!th.graph.measure()) continue;
    drawScene(th.graph, {
      curves: [{ form: th.form, values: th.values, color: '--graph' }],
      activeIndex: 0,
      view: THUMB_VIEW[th.cat] ?? THUMB_VIEW.standard,
      opts: BLANK_OPTS,
      scale: 0.8
    });
  }
}

/* ==========================================================================
   12b · BESCHREIBUNG FUER SCREENREADER
   Der Graph war bisher ein Bild mit festem aria-label - fuer eine blinde
   Nutzerin also gar nichts. Die Werte liegen ohnehin vor; sie in Worte zu
   fassen kostet fast nichts.
   ========================================================================== */
const describeGraph = debounce(() => {
  const el = $('#graph-desc');
  if (!el) return;
  const d = def(), v = state.view;
  const parts = [`${curveName(state.active)}(x) = ${d.rhs(values())}`, t('form.' + curve().form)];

  // Verlauf aus wenigen Stuetzstellen. Mehr braucht es fuer eine Beschreibung
  // nicht, und es haelt die Sache billig genug fuer jeden Reglerzug.
  const ys = [];
  for (let i = 0; i <= 8; i++) ys.push(d.f(v.xMin + ((v.xMax - v.xMin) * i) / 8, values()));
  const usable = ys.filter(Number.isFinite);
  if (usable.length >= 2) {
    let up = 0, down = 0;
    for (let i = 1; i < ys.length; i++) {
      if (!Number.isFinite(ys[i]) || !Number.isFinite(ys[i - 1])) continue;
      if (ys[i] > ys[i - 1]) up++; else if (ys[i] < ys[i - 1]) down++;
    }
    parts.push(t(up && down ? 'a11y.wavy' : up ? 'a11y.rising' : down ? 'a11y.falling' : 'a11y.flat'));
  }

  const y0 = d.f(0, values());
  if (Number.isFinite(y0) && v.xMin <= 0 && v.xMax >= 0) {
    parts.push(`${t('poi.yint')} ${mfmt(y0)}`);
  }
  const roots = MFE.graph.findZeros((x) => d.f(x, values()), v.xMin, v.xMax, 400, 6);
  parts.push(roots.length
    ? `${t('poi.root')} ${roots.map(r => mfmt(r)).join(', ')}`
    : t('a11y.noRoot'));

  const vx = d.vertex?.(values());
  if (vx && Number.isFinite(vx.x)) parts.push(`${t('poi.vertex')} (${mfmt(vx.x)} | ${mfmt(vx.y)})`);

  parts.push(t('a11y.range', {
    x0: mfmt(v.xMin), x1: mfmt(v.xMax), y0: mfmt(v.yMin), y1: mfmt(v.yMax)
  }));
  parts.push(t('a11y.canvasKeys'));
  el.textContent = parts.join('. ') + '.';
}, 500);

/* --------------------------------------------------------------------------
   Tastaturbedienung des Koordinatensystems
   Verschieben, zoomen und die Tangente setzen ging bisher nur mit Zeiger.
   -------------------------------------------------------------------------- */
function onCanvasKey(e) {
  const v = state.view;
  const stepX = (v.xMax - v.xMin) * (e.shiftKey ? 0.25 : 0.08);
  const stepY = (v.yMax - v.yMin) * (e.shiftKey ? 0.25 : 0.08);
  let handled = true;

  // Mit gedruecktem Alt wandert die Tangente statt des Ausschnitts.
  if (e.altKey && state.opts.tangent && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
    state.tangentX = clamp(state.tangentX + (e.key === 'ArrowRight' ? 1 : -1) * stepX * 0.4, v.xMin, v.xMax);
    render(); pushHistory();
    e.preventDefault();
    return;
  }

  switch (e.key) {
    case 'ArrowLeft':  setView(panView(v, -stepX, 0)); break;
    case 'ArrowRight': setView(panView(v,  stepX, 0)); break;
    case 'ArrowUp':    setView(panView(v, 0,  stepY)); break;
    case 'ArrowDown':  setView(panView(v, 0, -stepY)); break;
    case '+': case '=': zoomBy(0.7); break;
    case '-': case '_': zoomBy(1 / 0.7); break;
    case 'Home': case '0': applyPreset('standard'); break;
    case 'f': case 'F': fitView(); break;
    default: handled = false;
  }
  if (handled) e.preventDefault();
}

/* ==========================================================================
   13 · EXPORT UND TEILEN
   ========================================================================== */
function exportImage() {
  if (!licence.has('export')) { proHint(); return; }
  const off = document.createElement('canvas');
  const g = new Graph(off);
  g.bg = '#ffffff';
  g.setSize(Math.max(mainGraph.w || 0, 900), Math.max(mainGraph.h || 0, 520), 2);

  // Fuer die Dauer des Zeichnens auf das helle Theme: der Export landet in
  // digitalen Heften auf weissem Papier.
  const prevTheme = document.documentElement.getAttribute('data-theme') || 'light';
  document.documentElement.setAttribute('data-theme', 'light');
  MFE.colors.clear();
  try {
    drawScene(g, { ...scene(), scale: 1.15 });
  } finally {
    document.documentElement.setAttribute('data-theme', prevTheme);
    MFE.colors.clear();
  }

  off.toBlob((blob) => {
    if (!blob) { toast(t('msg.copyFail')); return; }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `graph_${curve(0).form}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast(t('msg.saved'));
  }, 'image/png');
}

/** Arbeitsblatt. Der Graph wird als Bild eingebettet und die Wertetabelle
 *  mitgenommen - beides ist im Unterricht das, was auf dem Papier gebraucht
 *  wird. Gedruckt wird ueber das Drucken-Fenster des Systems; ob daraus
 *  Papier oder ein PDF wird, entscheidet die Nutzerin dort. */
function printWorksheet() {
  // Gleiche Berechtigung wie der Bildexport: beides erzeugt etwas, das die
  // App verlaesst. Wer das in Lite freigeben will, aendert hier 'export' in
  // etwas, das licence.has() immer bejaht.
  if (!licence.has('export')) { proHint(); return; }
  if (tableDirty) generateTable();

  // Weisser Hintergrund und etwas groesser: das Blatt ist Papier, kein Bildschirm.
  const off = document.createElement('canvas');
  const g = new Graph(off);
  g.bg = '#ffffff';
  g.setSize(1000, 620, 2);
  const prevTheme = document.documentElement.getAttribute('data-theme') || 'light';
  document.documentElement.setAttribute('data-theme', 'light');
  MFE.colors.clear();
  try {
    drawScene(g, { ...scene(), traceX: null, scale: 1.25 });
  } finally {
    document.documentElement.setAttribute('data-theme', prevTheme);
    MFE.colors.clear();
  }

  $('#ps-title').textContent = t('print.title');
  $('#ps-meta').textContent = `${t('print.name')} ______________________   ${t('print.date')} ____________`;

  const eq = $('#ps-equation');
  eq.replaceChildren();
  state.curves.forEach((cu, i) => {
    const line = document.createElement('div');
    renderEquation(line, i, { interactive: false });
    eq.append(line);
  });

  $('#ps-image').src = off.toDataURL('image/png');
  $('#ps-image').alt = t('a11y.canvas');

  // Kopie der Tabelle: das Original bleibt im Reiter stehen.
  const clone = $('#values-table').cloneNode(true);
  clone.removeAttribute('id');
  $('#ps-table').replaceChildren(clone);

  $('#ps-notes-label').textContent = t('print.notes');
  $('#ps-foot').textContent = t('print.foot');

  // Erst zeichnen lassen, dann drucken - sonst fehlt das Bild auf dem Blatt.
  requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
}

async function shareLink() {
  if (!licence.has('share')) { proHint(); return; }
  const url = location.origin + location.pathname + buildHash();
  try { await navigator.clipboard.writeText(url); toast(t('msg.copied')); }
  catch { toast(t('msg.copyFail')); }
}

/* ==========================================================================
   14 · LITE / PRO
   ========================================================================== */
function proHint(kind) {
  toast(t(kind === 'cat' ? 'msg.proCat' : 'msg.pro'));
  MFE.nav.openDialog($('#pro-dialog'));
}

function markProFeatures() {
  const map = {
    '#btn-export': 'export', '#btn-share': 'share', '#btn-print': 'export',
    '#btn-own-quiz': 'ownQuiz', '#btn-transform': 'transform',
    '#btn-goto-quizzes': 'quizBuilder'
  };
  const lock = (el, feat) => { if (el) el.classList.toggle('is-locked', !licence.has(feat)); };
  for (const [sel, feat] of Object.entries(map)) lock($(sel), feat);
  lock($('#opt-drag')?.closest('.chip'), 'drag');
  lock($('#opt-derivative')?.closest('.chip'), 'calculus');
  lock($('#opt-tangent')?.closest('.chip'), 'calculus');
  lock($('#quiz-modes [data-mode="build"]'), 'practice');
  lock($('#curve-switch .curve-add'), 'secondCurve');
  $$('[data-feature]').forEach(el => {
    const ok = licence.has(el.dataset.feature);
    el.classList.toggle('is-locked', !ok);
    el.setAttribute('aria-disabled', String(!ok));
  });
}

/**
 * Startseite sortieren: was in dieser Ausgabe nutzbar ist, kommt nach oben.
 * In der Lite-Ausgabe sind sieben von neun Klassen gesperrt - ungeordnet
 * scrollt man an lauter Gesperrtem vorbei, bevor etwas Anklickbares kommt.
 * Die Reihenfolge innerhalb der beiden Gruppen bleibt die des HTML, damit
 * die fachliche Ordnung (linear, quadratisch, ganzrational, ...) erhalten
 * bleibt.
 */
function sortHomeCards() {
  for (const grid of $$('.fn-grid')) {
    const cards = Array.from(grid.children);
    const open = cards.filter(c => !c.dataset.feature || licence.has(c.dataset.feature));
    const locked = cards.filter(c => c.dataset.feature && !licence.has(c.dataset.feature));
    if (!locked.length) continue;
    grid.append(...open, ...locked);
    // Trennlinie vor dem gesperrten Teil - sonst wirkt der Bruch willkuerlich.
    let sep = grid.querySelector('.grid-sep');
    if (!sep) {
      sep = document.createElement('p');
      sep.className = 'grid-sep';
      grid.insertBefore(sep, locked[0]);
    } else {
      grid.insertBefore(sep, locked[0]);
    }
    sep.textContent = t('home.inPro');
  }
}

/**
 * Schnellwahl auf der Startseite. Die Karten bleiben der Hauptweg - ein Bild
 * der Kurve erkennt man schneller als einen Listeneintrag, und darum geht es
 * in dieser App. Die Liste ist fuer die, die schon wissen, wohin sie wollen,
 * und fuer alle, denen neun Karten zu viel Scrollen sind.
 */
function renderHomeSelect() {
  const sel = $('#home-select');
  if (!sel) return;
  sel.replaceChildren();

  const hint = document.createElement('option');
  hint.value = '';
  hint.textContent = t('home.quickPickHint');
  hint.selected = true;
  sel.append(hint);

  for (const [cat, forms] of Object.entries(CATEGORY_FORMS)) {
    const allowed = licence.has('cat.' + cat);
    const o = document.createElement('option');
    o.value = cat;
    o.textContent = t('cat.' + cat) + (allowed ? '' : '  \u2013 PRO');
    sel.append(o);
  }
}

/* ==========================================================================
   15 · INFO-BILDSCHIRM
   ========================================================================== */
function renderInfo() {
  const ul = $('#info-features');
  ul.replaceChildren();
  for (let i = 1; i <= 10; i++) {
    const li = document.createElement('li');
    li.textContent = t('info.f' + i);
    ul.append(li);
  }
  const pro = licence.isPro();
  $('#info-edition').textContent = t(pro ? 'info.edition.pro' : 'info.edition.lite');
  $('#info-version').textContent = t('info.version', {
    v: APP_VERSION,
    e: pro ? 'Pro' : 'Lite',
    p: window.Capacitor?.isNativePlatform?.() ? t('info.platform.app') : t('info.platform.web')
  });
  $('#info-lite-box').hidden = pro;
}

/* ==========================================================================
   15b · WERTETABELLE NEBEN DEM GRAPHEN
   Am Telefon im Hochformat ist dafuer kein Platz - dort bleibt es bei den
   Reitern. Sobald der Bildschirm breit genug ist (Tablet, Querformat,
   Rechner), stehen Graph und Tabelle nebeneinander. Das spart genau das
   Hin- und Herschalten, das beim Ablesen von Werten am meisten stoert.
   ========================================================================== */
const SPLIT_QUERY = '(min-width: 860px), (orientation: landscape) and (min-width: 700px) and (min-height: 380px)';
let splitMedia = null;

/** Passt genug Platz? Reine Abfrage, ohne Nebenwirkung. */
const splitFits = () => !!splitMedia?.matches;

function updateSplit() {
  const chip = $('#chip-split');
  if (chip) chip.hidden = !splitFits();

  const app = $('#screen-app');
  const on = splitFits() && state.split && currentTab === 'explorer';
  app.classList.toggle('is-split', on);
  // Die Tabelle wird im geteilten Layout dauerhaft gezeigt, also muss sie
  // auch gerechnet sein - sonst steht dort eine leere Huelse.
  if (on && tableDirty) generateTable();
  $('#tab-btn-table').setAttribute('aria-disabled', String(on));
  requestAnimationFrame(() => { if (mainGraph.measure()) render(); });
}

/* ==========================================================================
   16 · SPRACHE, DARSTELLUNG, NAVIGATION
   ========================================================================== */
function applyLanguage() {
  document.documentElement.lang = MFE.i18n.lang;
  $$('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  $$('[data-i18n-title]').forEach(el => { el.title = t(el.dataset.i18nTitle); });
  $$('[data-i18n-aria]').forEach(el => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
  $('#btn-lang-de').classList.toggle('is-active', MFE.i18n.lang === 'de');
  $('#btn-lang-en').classList.toggle('is-active', MFE.i18n.lang === 'en');
  $('#btn-lang-de').setAttribute('aria-pressed', String(MFE.i18n.lang === 'de'));
  $('#btn-lang-en').setAttribute('aria-pressed', String(MFE.i18n.lang === 'en'));
  updateExplorer();
  renderInfo();
  sortHomeCards();
  renderHomeSelect();
  MFE.quiz.relabel();
  if (quiz.answer) renderQuizOptions();
  if (practice.ctx) renderSliderGroup($('#practice-params'), practice.ctx);
}

function applyTheme() {
  document.documentElement.setAttribute('data-theme', state.theme);
  MFE.colors.clear();          // sonst zeichnet der Graph mit den alten Farben
  renderCurveSwitcher();
  renderTableHead();
  invalidateTable();
  render();
  drawQuiz(); drawPractice(); drawThumbs();
}

function applyDisplay() {
  document.documentElement.setAttribute('data-display', state.display);
  $('#btn-beamer').setAttribute('aria-pressed', String(state.display === 'beamer'));
  MFE.colors.clear();
  requestAnimationFrame(() => {
    measureChrome();
    mainGraph.measure(); render();
    drawQuiz(); drawPractice(); drawThumbs();
  });
}

let lastScreen = 'home';
let currentTab = 'explorer';

/** Zeigt einen Bildschirm an, OHNE den Verlauf anzufassen. Wird auch beim
 *  Druck auf Zurueck aufgerufen - deshalb darf hier kein pushState stehen. */
function applyScreen(which) {
  if (!SCREENS.includes(which)) which = 'home';
  lastScreen = which;
  // Damit das Stylesheet weiss, wo wir sind - auf der Startseite haben
  // Rueckgaengig und Wiederherstellen nichts zu suchen und nehmen in der
  // Kopfzeile nur Platz weg.
  document.documentElement.dataset.screen = which;
  for (const s of SCREENS) {
    const el = $(`#screen-${s}`);
    if (el) el.classList.toggle('is-active', s === which);
  }
  if (which !== 'app') stopPlay();
  if (which === 'app') requestAnimationFrame(() => { measureChrome(); mainGraph.measure(); render(); });
  if (which === 'home') requestAnimationFrame(drawThumbs);
  if (which === 'info') renderInfo();
  window.scrollTo({ top: 0, behavior: 'auto' });
}

/** Wechselt den Reiter, ohne den Verlauf anzufassen. */
function applyTab(name) {
  if (!['explorer', 'table', 'quiz'].includes(name)) name = 'explorer';
  currentTab = name;
  $$('.tab-btn').forEach(b => {
    const on = b.dataset.tab === name;
    b.classList.toggle('is-active', on);
    b.setAttribute('aria-selected', String(on));
    b.tabIndex = on ? 0 : -1;
  });
  $$('.tab-panel').forEach(p => p.classList.toggle('is-active', p.id === `tab-${name}`));
  $('#screen-app').dataset.tab = name;
  updateSplit();
  if (name !== 'explorer') stopPlay();
  requestAnimationFrame(() => {
    if (name === 'explorer') { mainGraph.measure(); render(); }
    if (name === 'table' && tableDirty) generateTable();
    if (name === 'quiz') setQuizMode($('#mode-build').hidden ? 'match' : 'build');
  });
}

/* Die beiden Fassungen mit Verlaufseintrag. Alles ausserhalb dieser Datei
   ruft ausschliesslich diese hier auf. */
/**
 * Bildschirm wechseln und dabei EINEN Verlaufseintrag anlegen.
 * Der Reiter muss mit uebergeben werden, wenn er sich ebenfalls aendert -
 * zwei getrennte Aufrufe erzeugten sonst zwei Eintraege, und der
 * Zurueck-Knopf haette zweimal gedrueckt werden muessen, um einmal
 * zurueckzukommen.
 */
function showScreen(which, tab) {
  if (!SCREENS.includes(which)) which = 'home';
  MFE.nav.go({ screen: which, tab });
  applyScreen(which);
  if (tab) applyTab(tab);
}
function activateTab(name) {
  MFE.nav.go({ tab: name });
  applyTab(name);
}

function syncOptionInputs() {
  for (const k of Object.keys(state.opts)) {
    const el = $(`#opt-${k}`);
    if (el) el.checked = state.opts[k];
  }
  $('#opt-piAxis').checked = state.piAxis;
  $('#opt-snap').checked = state.snap;
  $('#opt-split').checked = state.split;
  $('#opt-diff').checked = state.table.diff;
  $('#opt-quot').checked = state.table.quot;
  mainGraph.canvas.classList.toggle('is-draggable', state.opts.drag);
}

/** Hoehe von Kopfzeile und Reiterleiste als CSS-Variable, damit das
 *  Koordinatensystem beim Scrollen exakt darunter stehenbleibt. */
function measureChrome() {
  const h = $('.app-header')?.offsetHeight || 56;
  const tabs = $('.tabs')?.offsetHeight || 44;
  document.documentElement.style.setProperty('--header-h', h + 'px');
  document.documentElement.style.setProperty('--stick-top', (h + tabs) + 'px');
}

/* ==========================================================================
   17 · EREIGNISSE
   ========================================================================== */
function openCategory(cat) {
  const forms = CATEGORY_FORMS[cat];
  if (!forms) return;
  if (!licence.has('cat.' + cat)) { proHint('cat'); return; }
  const form = forms[0];
  state.curves = [makeCurve(form)];
  state.active = 0;
  state.opts.intersections = false;
  state.piAxis = !!FUNCTIONS[form].piAxis;
  // Passender Ausschnitt je Klasse - eine Exponentialkurve im Bereich
  // ±10 ist nur ein senkrechter Strich.
  if (cat === 'trig') applyPresetSilently('trig');
  else if (cat === 'exponential' || cat === 'logarithm' || cat === 'root') applyPresetSilently('standard');
  syncOptionInputs();
  updateExplorer();
  showScreen('app', 'explorer');
  requestAnimationFrame(() => { if (cat === 'exponential') fitViewSilently(); });
  pushHistory();
}

function applyPresetSilently(name) {
  const p = PRESETS[name];
  if (!p) return;
  state.piAxis = !!p.piAxis;
  state.view = normalizeView(p);
}
function fitViewSilently() {
  const v = state.view;
  const { yMin, yMax } = fitY(state.curves, v.xMin, v.xMax);
  state.view = normalizeView({ ...v, yMin, yMax });
  syncViewInputs();
  render();
}

function bindEvents() {
  $$('.fn-card[data-category]').forEach(card =>
    card.addEventListener('click', () => openCategory(card.dataset.category)));

  $('#home-select').addEventListener('change', (e) => {
    const cat = e.target.value;
    e.target.selectedIndex = 0;          // wieder auf den Hinweis zuruecksetzen
    if (cat) openCategory(cat);
  });

  $('#opt-split').addEventListener('change', (e) => {
    state.split = e.target.checked;
    saveSettings();
    updateSplit();
  });

  $('#card-quizzes').addEventListener('click', () => {
    if (!licence.has('quizBuilder')) { proHint(); return; }
    MFE.quiz.openList();
  });
  $('#card-info').addEventListener('click', () => showScreen('info'));
  $('#btn-goto-quizzes').addEventListener('click', () => {
    if (!licence.has('quizBuilder')) { proHint(); return; }
    MFE.quiz.openList();
  });
  $$('[data-back]').forEach(b => b.addEventListener('click', () => showScreen(b.dataset.back)));

  $('#btn-home').addEventListener('click', () => { stopPlay(); showScreen('home'); });

  $('#btn-theme').addEventListener('click', () => {
    state.theme = state.theme === 'light' ? 'dark' : 'light';
    applyTheme(); saveSettings();
  });
  $('#btn-beamer').addEventListener('click', () => {
    state.display = state.display === 'beamer' ? 'normal' : 'beamer';
    applyDisplay(); saveSettings();
    toast(t(state.display === 'beamer' ? 'msg.beamerOn' : 'msg.beamerOff'));
  });
  $('#btn-lang-de').addEventListener('click', () => { MFE.i18n.lang = 'de'; applyLanguage(); saveSettings(); });
  $('#btn-lang-en').addEventListener('click', () => { MFE.i18n.lang = 'en'; applyLanguage(); saveSettings(); });

  const tabs = $$('.tab-btn');
  tabs.forEach(btn => {
    btn.addEventListener('click', () => activateTab(btn.dataset.tab));
    btn.addEventListener('keydown', (e) => {
      const i = tabs.indexOf(btn);
      const n = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : -1;
      if (n < 0) return;
      const target = tabs[(n + tabs.length) % tabs.length];
      target.focus(); activateTab(target.dataset.tab); e.preventDefault();
    });
  });

  // Kurven wechseln, hinzufuegen, entfernen
  $('#curve-switch').addEventListener('click', (e) => {
    const chip = e.target.closest('[data-curve]');
    if (chip) { state.active = Number(chip.dataset.curve); stopPlay(); updateExplorer(); return; }
    const act = e.target.closest('[data-action]');
    if (!act) return;
    if (act.dataset.action === 'add') {
      if (!licence.has('secondCurve')) { proHint(); return; }
      state.curves.push(makeCurve(curve(0).form));
      state.active = 1;
      state.opts.intersections = true;
      syncOptionInputs();
    } else {
      state.curves.length = 1;
      state.active = 0;
      state.opts.intersections = false;
      syncOptionInputs();
      $('#readout').textContent = '';
    }
    stopPlay(); updateExplorer(); pushHistory();
  });

  $('#function-form').addEventListener('change', (e) => {
    stopPlay();
    const form = e.target.value;
    if (!FUNCTIONS[form]) return;
    const cat = FUNCTIONS[form].category;
    if (!licence.has('cat.' + cat)) {
      // Auswahl zuruecknehmen, sonst zeigt die Liste eine Klasse an, die
      // gar nicht geladen wurde.
      e.target.value = curve().form;
      proHint('cat');
      return;
    }
    ensureSymbols(form);
    // Beim Wechsel der Klasse passt der bisherige Ausschnitt selten.
    if (cat !== def().category) {
      state.piAxis = !!FUNCTIONS[form].piAxis;
      if (cat === 'trig') applyPresetSilently('trig');
    }
    state.curves[state.active] = makeCurve(form);
    state.piAxis = !!FUNCTIONS[form].piAxis;
    syncOptionInputs();
    updateExplorer(); pushHistory();
  });

  $('#equations').addEventListener('click', (e) => {
    const chip = e.target.closest('[data-param]');
    if (chip) { openParamDialog(chip.dataset.param); return; }
    const line = e.target.closest('[data-curve]');
    if (line) { state.active = Number(line.dataset.curve); updateExplorer(); }
  });

  $('#parameters-container').addEventListener('click', (e) => {
    const play = e.target.closest('[data-play]');
    if (play) togglePlay(play.dataset.play);
  });

  // --- Ansicht ---
  $('#btn-zoom-in').addEventListener('click', () => zoomBy(0.7));
  $('#btn-zoom-out').addEventListener('click', () => zoomBy(1 / 0.7));
  $('#btn-fit').addEventListener('click', fitView);
  $('#btn-reset-view').addEventListener('click', () => applyPreset('standard'));
  $$('.preset-btn').forEach(b => b.addEventListener('click', () => applyPreset(b.dataset.preset)));
  ['#view-x0', '#view-x1', '#view-y0', '#view-y1'].forEach(sel => {
    const el = $(sel);
    el.addEventListener('change', commitViewInputs);
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); el.blur(); } });
  });

  for (const key of Object.keys(state.opts)) {
    const el = $(`#opt-${key}`);
    if (!el) continue;
    el.addEventListener('change', () => {
      if (key === 'drag' && !licence.has('drag')) { el.checked = false; proHint(); return; }
      if ((key === 'derivative' || key === 'tangent') && !licence.has('calculus')) { el.checked = false; proHint(); return; }
      state.opts[key] = el.checked;
      mainGraph.canvas.classList.toggle('is-draggable', state.opts.drag);
      // Die Tangente braucht eine Stelle. Ohne diese Vorgabe stuende sie
      // beim Einschalten unsichtbar irgendwo ausserhalb.
      if (key === 'tangent' && el.checked) {
        const v = state.view;
        if (!Number.isFinite(state.tangentX) || state.tangentX < v.xMin || state.tangentX > v.xMax) {
          state.tangentX = (v.xMin + v.xMax) / 2;
        }
      }
      if (key === 'intersections' && !el.checked) $('#readout').textContent = '';
      render(); pushHistory();
    });
  }
  $('#opt-piAxis').addEventListener('change', (e) => {
    state.piAxis = e.target.checked; render(); syncHash(); pushHistory();
  });
  $('#opt-snap').addEventListener('change', (e) => {
    state.snap = e.target.checked; setSnap(state.snap); saveSettings();
  });
  ['diff', 'quot'].forEach(k => {
    $(`#opt-${k}`).addEventListener('change', (e) => {
      state.table[k] = e.target.checked;
      renderTableHead(); generateTable();
    });
  });

  $('#btn-transform').addEventListener('click', playTransformation);
  $('#btn-export').addEventListener('click', exportImage);
  $('#btn-share').addEventListener('click', shareLink);
  $('#btn-print').addEventListener('click', printWorksheet);
  $('#btn-undo').addEventListener('click', undo);
  $('#btn-redo').addEventListener('click', redo);

  const cv = mainGraph.canvas;
  cv.addEventListener('pointerdown', onPointerDown);
  cv.addEventListener('pointermove', onPointerMove);
  cv.addEventListener('pointerup', onPointerUp);
  cv.addEventListener('pointercancel', onPointerUp);
  cv.addEventListener('wheel', onWheel, { passive: false });
  cv.addEventListener('dblclick', onDoubleClick);
  cv.addEventListener('keydown', onCanvasKey);
  // Kontextmenue beim langen Druecken stoert die Zwei-Finger-Geste.
  cv.addEventListener('contextmenu', (e) => e.preventDefault());

  $('#dialog-save').addEventListener('click', (e) => { if (!saveParamDialog()) e.preventDefault(); });

  // Drei Faelle, drei Meldungen: noch nicht veroeffentlicht, Oeffnen
  // gescheitert, oder es hat geklappt. Frueher gab es nur "ging nicht".
  const toStore = () => {
    const r = licence.openStore();
    if (r === 'notyet') toast(t('msg.storeNotYet'));
    else if (!r) toast(t('msg.storeFail'));
  };
  $('#pro-dialog').addEventListener('close', (e) => {
    if (e.target.returnValue === 'store') toStore();
  });
  $('#btn-info-store').addEventListener('click', toStore);

  $('#btn-gen-table').addEventListener('click', generateTable);
  $('#btn-copy-table').addEventListener('click', copyTable);

  $$('#quiz-modes .seg-btn').forEach(b => b.addEventListener('click', () => {
    if (b.dataset.mode === 'build' && !licence.has('practice')) { proHint(); return; }
    setQuizMode(b.dataset.mode);
  }));
  $('#btn-next-quiz').addEventListener('click', () => newQuizQuestion(false));
  $('#btn-own-quiz').addEventListener('click', () => {
    if (!licence.has('ownQuiz')) { proHint(); return; }
    newQuizQuestion(true); activateTab('quiz'); setQuizMode('match'); toast(t('quiz.own'));
  });
  $('#quiz-options').addEventListener('click', (e) => {
    const b = e.target.closest('.quiz-opt');
    if (b) answerQuiz(Number(b.dataset.index));
  });
  $('#btn-check').addEventListener('click', checkPractice);
  $('#btn-new-task').addEventListener('click', newPracticeTask);

  document.addEventListener('keydown', (e) => {
    const inText = /^(INPUT|TEXTAREA)$/.test(e.target.tagName) && e.target.type !== 'range';
    if (inText) return;
    // Zoomen mit + und -, wenn der Explorer sichtbar ist.
    if (!e.ctrlKey && !e.metaKey && $('#screen-app').classList.contains('is-active')
        && $('#tab-explorer').classList.contains('is-active')) {
      if (e.key === '+') { zoomBy(0.7); e.preventDefault(); return; }
      if (e.key === '-') { zoomBy(1 / 0.7); e.preventDefault(); return; }
    }
    if (!(e.ctrlKey || e.metaKey)) return;
    const k = e.key.toLowerCase();
    if (k === 'z' && !e.shiftKey) { undo(); e.preventDefault(); }
    else if ((k === 'z' && e.shiftKey) || k === 'y') { redo(); e.preventDefault(); }
  });

  const onResize = debounce(() => {
    measureChrome();
    if (mainGraph.measure()) render();
    drawQuiz(); drawPractice(); drawThumbs();
  }, 100);

  if ('ResizeObserver' in window) {
    const ro = new ResizeObserver(onResize);
    ['#graph-canvas', '#quiz-canvas', '#practice-canvas', '.app-header'].forEach(s => {
      const el = $(s);
      if (el) ro.observe(el);
    });
  }
  addEventListener('resize', onResize);
  addEventListener('orientationchange', onResize);

  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (localStorage.getItem(STORAGE_KEY)) return;
    state.theme = e.matches ? 'dark' : 'light';
    applyTheme();
  });

  document.addEventListener('visibilitychange', () => { if (document.hidden) stopPlay(); });

  addEventListener('mfe:licence-changed', () => {
    markProFeatures();
    sortHomeCards();
    updateExplorer();
    renderInfo();
    toast(t('msg.proUnlocked'));
  });
}

/* ==========================================================================
   18 · START
   ========================================================================== */
function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || !location.protocol.startsWith('http')) return;

  /* In der installierten App ist der Service Worker sinnlos: die Dateien
     liegen ohnehin im Paket. Schlimmer noch - jede neue App-Fassung bringt
     eine neue sw.js mit, die dann wartet, und die Nutzerin bekaeme im frisch
     aktualisierten Programm die Meldung "Eine neue Fassung steht bereit".

     ACHTUNG, das war ein Fehler in v6.1: hier stand nur ein return. Die
     Registrierung zu unterlassen entfernt aber KEINEN bereits registrierten
     Service Worker - der lief weiter und meldete weiter. Wer die App vorher
     schon einmal offen hatte, sah die Leiste auch nach der Berichtigung.
     Deshalb wird er jetzt aktiv abgemeldet und sein Zwischenspeicher
     geloescht. */
  if (window.Capacitor?.isNativePlatform?.()) {
    navigator.serviceWorker.getRegistrations?.()
      .then(list => Promise.all(list.map(r => r.unregister())))
      .then(async (done) => {
        if (!done.length) return;
        try {
          const keys = await caches.keys();
          await Promise.all(keys.filter(k => k.startsWith('mfe-')).map(k => caches.delete(k)));
        } catch {}
        console.info('[sw] In der App nicht noetig - abgemeldet:', done.length);
      })
      .catch(() => {});
    return;
  }

  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // Nur neu laden, wenn WIR den Wechsel ausgeloest haben. Sonst laedt die
    // Seite auch beim allerersten Start unvermittelt neu.
    if (!reloading) return;
    reloading = false;
    location.reload();
  });

  navigator.serviceWorker.register('sw.js').then(reg => {
    const offer = (worker) => {
      if (!worker) return;
      const bar = $('#update-bar');
      if (!bar) return;
      bar.hidden = false;
      $('#btn-update-now').onclick = () => {
        reloading = true;
        bar.hidden = true;
        worker.postMessage({ type: 'SKIP_WAITING' });
      };
      $('#btn-update-later').onclick = () => { bar.hidden = true; };
    };

    // Eine wartende Fassung kann schon beim Laden bereitstehen.
    if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);

    reg.addEventListener('updatefound', () => {
      const sw = reg.installing;
      sw?.addEventListener('statechange', () => {
        if (sw.state !== 'installed') return;
        if (navigator.serviceWorker.controller) offer(sw);     // Aktualisierung
        else toast(t('msg.offlineReady'));                     // Erstinstallation
      });
    });
  }).catch(() => { /* Offline-Betrieb ist ein Extra, kein Muss */ });
}

function init() {
  loadSettings();
  if (!localStorage.getItem(STORAGE_KEY) && matchMedia('(prefers-color-scheme: dark)').matches) {
    state.theme = 'dark';
  }
  document.documentElement.setAttribute('data-theme', state.theme);
  document.documentElement.setAttribute('data-display', state.display);
  setSnap(state.snap);
  splitMedia = matchMedia(SPLIT_QUERY);
  splitMedia.addEventListener('change', updateSplit);

  mainGraph = new Graph($('#graph-canvas'));
  quizGraph = new Graph($('#quiz-canvas'));
  practiceGraph = new Graph($('#practice-canvas'));
  initThumbs();

  // In der Lite-Ausgabe darf die Startkurve keiner gesperrten Klasse
  // angehoeren, sonst stuende der Explorer sofort vor einer Sperre.
  if (!licence.has('cat.' + FUNCTIONS[curve(0).form].category)) {
    state.curves = [makeCurve(CATEGORY_FORMS[firstAllowedCategory()][0])];
  }

  const quizCode = location.hash.startsWith('#quiz=') ? location.hash.slice(6) : null;
  const fromLink = quizCode ? false : readHash();

  // Ein Link schlaegt den gespeicherten Stand: wer ihn oeffnet, will das
  // Verlinkte sehen und nicht seine letzte Sitzung.
  let session = null;
  if (!quizCode && !fromLink) {
    session = loadSession();
    if (session) {
      state.curves = session.curves;
      state.active = session.active;
      state.view = session.view;
      state.piAxis = session.piAxis;
      state.opts = session.opts;
      state.table = session.table;
      state.tangentX = session.tangentX;
    }
  }

  MFE.quiz.init({
    showScreen,
    explorer: () => ({ form: curve(0).form, values: { ...values(0) } }),
    symbolOf,
    view: viewOf,
    scale: sceneScale
  });

  MFE.nav.init({
    screen: 'home',
    tab: 'explorer',
    // Wird beim Druck auf Zurueck gerufen - stellt den Bildschirm her, ohne
    // einen neuen Verlaufseintrag anzulegen.
    apply: ({ screen, tab }) => { applyScreen(screen); applyTab(tab); },
    onExitBlocked: () => toast(t('msg.pressAgain'))
  });

  bindEvents();
  measureChrome();
  markProFeatures();
  sortHomeCards();
  syncViewInputs();
  syncOptionInputs();
  applyLanguage();          // ruft updateExplorer() und renderInfo() mit auf
  invalidateTable();
  $('#btn-beamer').setAttribute('aria-pressed', String(state.display === 'beamer'));
  renderHomeSelect();
  updateSplit();
  requestAnimationFrame(drawThumbs);

  history_.stack = [snapshot()];
  history_.index = 0;
  updateUndoButtons();

  if (quizCode) {
    if (!licence.has('quizBuilder')) proHint();
    else MFE.quiz.importFromHash(quizCode);
  } else if (fromLink) {
    showScreen('app', 'explorer');
  } else if (session?.inApp) {
    // Dort weitermachen, wo aufgehoert wurde. Die Startseite bleibt der
    // erste Verlaufseintrag, Zurueck fuehrt also dorthin.
    showScreen('app', session.tab);
  }
  registerServiceWorker();
}

/* Nur fuer die Selbsttests nach aussen gereicht. Die App selbst ruft diese
   Funktionen intern auf; ohne diesen Zugang liesse sich das Abmelden des
   Service Workers nicht pruefen. */
MFE.app = { registerServiceWorker, get version() { return APP_VERSION; } };

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();

})();
