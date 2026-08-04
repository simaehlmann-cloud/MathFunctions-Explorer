/* ==========================================================================
   app.js  ·  Zustand und Oberflaeche
   ========================================================================== */
'use strict';

(() => {
const { clamp, fmt, mfmt, parseLoose, FUNCTIONS, CATEGORY_FORMS } = MFE.math;
const { Graph, drawScene, findZeros, CURVE_COLORS } = MFE.graph;
const licence = MFE.licence;
const t = (k, v) => MFE.i18n.t(k, v);
const C = (n) => MFE.colors.get(n);

const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const REDUCED_MOTION = matchMedia('(prefers-reduced-motion: reduce)').matches;
const SYMBOL_RE = /^[A-Za-z\u03b1-\u03c9][0-9\u2081-\u2089]{0,2}$/u;
const STORAGE_KEY = 'mfe:v3';
const CURVE_NAMES = ['f', 'g'];

function debounce(fn, ms) { let id = 0; return (...a) => { clearTimeout(id); id = setTimeout(() => fn(...a), ms); }; }

let toastTimer = 0;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg; el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2800);
}

/* ==========================================================================
   1 · ZUSTAND
   Eine Kurve ist {form, values, bounds}. Der Explorer haelt eine oder zwei
   davon; die Buchstaben (symbols) gelten formuebergreifend, damit f und g
   derselben Schulbuch-Schreibweise folgen.
   ========================================================================== */
const state = {
  curves: [],
  active: 0,
  symbols: {},
  xScale: 10, yScale: 10,
  piAxis: false,
  opts: { helpers: true, roots: false, yint: false, vertex: false, drag: false, intersections: false }
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

state.curves = [makeCurve('linear')];
Object.keys(FUNCTIONS).forEach(ensureSymbols);

/* --- Einstellungen (nur Sprache, Theme, Buchstaben) --- */
function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (!s) return;
    if (MFE.i18n.has(s.lang)) MFE.i18n.lang = s.lang;
    if (s.theme === 'dark' || s.theme === 'light') state.theme = s.theme;
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
      lang: MFE.i18n.lang, theme: state.theme, symbols: state.symbols
    }));
  } catch {}
}, 400);

/* ==========================================================================
   2 · DEEP LINKS
   Der Zustand steht im location.hash. Der Hash wird vom Browser NICHT an
   einen Server uebertragen - fuer eine Schul-App der relevante Unterschied
   zum Query-String.
   ========================================================================== */
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
  q.set('xs', String(state.xScale));
  q.set('ys', String(state.yScale));
  if (state.piAxis) q.set('pi', '1');
  return '#' + q.toString();
}

function readHash() {
  if (!location.hash.length) return false;
  const q = new URLSearchParams(location.hash.slice(1));
  if (!FUNCTIONS[q.get('f')]) return false;

  const curves = [];
  for (const pre of ['', 'g']) {
    const form = q.get(pre + 'f');
    if (!FUNCTIONS[form]) continue;
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

  const xs = parseLoose(q.get('xs'), NaN), ys = parseLoose(q.get('ys'), NaN);
  if (Number.isFinite(xs)) state.xScale = clamp(xs, 1, 50);
  if (Number.isFinite(ys)) state.yScale = clamp(ys, 1, 50);
  state.piAxis = q.get('pi') === '1';
  if (state.curves.length === 2) state.opts.intersections = true;
  return true;
}
const syncHash = debounce(() => history.replaceState(null, '', buildHash()), 300);

/* ==========================================================================
   3 · UNDO / REDO
   Aufgenommen wird ein Schnappschuss, nachdem eine Aenderung zur Ruhe
   gekommen ist - sonst laege nach einer Reglerfahrt der halbe Speicher voll.
   ========================================================================== */
const history_ = { stack: [], index: -1, max: 40, muted: false };

const snapshot = () => JSON.stringify({
  curves: state.curves, active: state.active, symbols: state.symbols,
  xScale: state.xScale, yScale: state.yScale, piAxis: state.piAxis, opts: state.opts
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
}, 600);

function applySnapshot(json) {
  const s = JSON.parse(json);
  state.curves = s.curves; state.active = s.active; state.symbols = s.symbols;
  state.xScale = s.xScale; state.yScale = s.yScale; state.piAxis = s.piAxis;
  state.opts = s.opts;
  history_.muted = true;
  syncScaleInputs(); syncOptionInputs();
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
   4 · REGLERGRUPPE
   Wird dreifach gebraucht: Explorer, Nachbau-Modus und (spaeter) weitere
   Kurven. Deshalb generisch ueber einen Kontext statt fest verdrahtet.
   ========================================================================== */
function renderSliderGroup(container, ctx) {
  container.replaceChildren();
  const d = FUNCTIONS[ctx.form];

  for (const p of d.params) {
    const row = document.createElement('div');
    row.className = 'slider-row';

    const head = document.createElement('div');
    head.className = 'slider-head';
    const sym = document.createElement('span');
    sym.className = `sym c${p.color}`;
    sym.textContent = symbolOf(p.id, ctx.form);

    // Eingabefeld statt reiner Anzeige: ein Regler mit Schrittweite 0,1
    // trifft weder 1/3 noch pi/2. type="text" + inputmode, weil
    // type="number" bei Komma je nach Browser-Locale einen leeren String
    // zurueckliefert.
    const field = document.createElement('input');
    field.type = 'text';
    field.inputMode = 'decimal';
    field.className = 'value-input';
    field.id = `${ctx.prefix}val-${p.id}`;
    field.value = fmt(ctx.values[p.id], 4);
    field.autocomplete = 'off';
    field.setAttribute('aria-label', `${symbolOf(p.id, ctx.form)} ${t('a11y.valueField')}`);
    field.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); field.blur(); } });
    field.addEventListener('change', () => commitTyped(ctx, p.id));
    field.addEventListener('blur', () => commitTyped(ctx, p.id));
    head.append(sym, field);

    const track = document.createElement('div');
    track.className = 'slider-track';

    const b = ctx.bounds[p.id];
    const input = document.createElement('input');
    input.type = 'range';
    input.className = `s${p.color}`;
    input.id = `${ctx.prefix}slider-${p.id}`;
    input.min = b.min; input.max = b.max; input.step = p.step;
    input.value = ctx.values[p.id];
    input.setAttribute('aria-label', `${symbolOf(p.id, ctx.form)}: ${t(p.desc).split('.')[0]}`);
    input.addEventListener('input', () => setValue(ctx, p.id, parseFloat(input.value)));

    /* Tastatur: Pfeiltasten und Pos1/Ende kann der Browser selbst. Was fehlt,
       ist der grosse Schritt - wichtig, wenn die Lehrkraft am Beamer steht
       und nicht mit der Maus zielen will. */
    input.addEventListener('keydown', (e) => {
      const big = p.step * 10;
      const dir = (e.key === 'ArrowRight' || e.key === 'ArrowUp') ? 1
                : (e.key === 'ArrowLeft' || e.key === 'ArrowDown') ? -1 : 0;
      if (dir && e.shiftKey) {
        setValue(ctx, p.id, ctx.values[p.id] + dir * big);
        input.value = ctx.values[p.id];
        e.preventDefault();
      }
    });

    track.append(input);

    if (ctx.play) {
      const play = document.createElement('button');
      play.type = 'button';
      play.className = 'play-btn';
      play.dataset.play = p.id;
      play.setAttribute('aria-pressed', 'false');
      play.setAttribute('aria-label', `${symbolOf(p.id, ctx.form)} ${t('btn.transform')}`);
      play.textContent = '\u25b6';
      track.append(play);
    }

    row.append(head, track);
    container.append(row);
  }
}

function setValue(ctx, id, value) {
  const p = FUNCTIONS[ctx.form].params.find(x => x.id === id);
  const b = ctx.bounds[id];
  const v = clamp(Number.isFinite(value) ? value : p.value, b.min, b.max);
  ctx.values[id] = Math.round(v * 1e4) / 1e4;

  const slider = $(`#${ctx.prefix}slider-${id}`);
  if (slider && parseFloat(slider.value) !== ctx.values[id]) slider.value = ctx.values[id];
  const field = $(`#${ctx.prefix}val-${id}`);
  if (field && document.activeElement !== field) field.value = fmt(ctx.values[id], 4);

  ctx.onChange?.();
}

function widenBounds(ctx, id, v) {
  const b = ctx.bounds[id];
  const p = FUNCTIONS[ctx.form].params.find(x => x.id === id);
  if (v < b.min) b.min = Math.max(Math.floor(v), p.hardMin ?? -Infinity);
  if (v > b.max) b.max = Math.min(Math.ceil(v), p.hardMax ?? Infinity);
  const slider = $(`#${ctx.prefix}slider-${id}`);
  if (slider) { slider.min = b.min; slider.max = b.max; }
}

function commitTyped(ctx, id) {
  const field = $(`#${ctx.prefix}val-${id}`);
  if (!field) return;
  const p = FUNCTIONS[ctx.form].params.find(x => x.id === id);
  const v = parseLoose(field.value, NaN);
  if (!Number.isFinite(v)) {
    field.classList.add('is-invalid');
    field.value = fmt(ctx.values[id], 4);
    toast(t('msg.numFormat'));
    return;
  }
  field.classList.remove('is-invalid');
  const hard = clamp(v, p.hardMin ?? -Infinity, p.hardMax ?? Infinity);
  if (hard !== v) toast(t('msg.hardLimit'));
  widenBounds(ctx, id, hard);
  setValue(ctx, id, hard);
  field.value = fmt(ctx.values[id], 4);
}

/* Kontext fuer die aktive Explorer-Kurve */
function explorerCtx() {
  const cu = curve();
  return {
    form: cu.form, values: cu.values, bounds: cu.bounds, prefix: '', play: true,
    onChange: () => { render(); syncHash(); pushHistory(); }
  };
}

/* ==========================================================================
   5 · EXPLORER-DARSTELLUNG
   ========================================================================== */
let mainGraph, quizGraph, practiceGraph, frameRequested = false;

function scene() {
  return {
    curves: state.curves.map((cu, i) => ({ form: cu.form, values: cu.values, color: CURVE_COLORS[i] })),
    activeIndex: state.active,
    view: { xScale: state.xScale, yScale: state.yScale, piAxis: state.piAxis },
    opts: state.opts
  };
}

function render() {
  if (frameRequested) return;
  frameRequested = true;
  requestAnimationFrame(() => {
    frameRequested = false;
    if (!mainGraph.ready && !mainGraph.measure()) return;
    const sc = scene();
    drawScene(mainGraph, sc);
    // Schnittpunkte in Worten, damit sie auch vorgelesen werden koennen
    if (state.opts.intersections && state.curves.length === 2) {
      $('#readout').textContent = sc.intersections.length
        ? sc.intersections.map(p => `${t('poi.intersection')} (${mfmt(p.x)} | ${mfmt(p.y)})`).join('   ')
        : t('msg.noIntersection');
    }
  });
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
    if (!licence.has('secondCurve')) add.classList.add('is-locked');   // PRO-Abzeichen
  } else {
    add.textContent = t('curve.remove');
    add.dataset.action = 'remove';
  }
  box.append(add);
}

function renderFormSelect() {
  const sel = $('#function-form');
  const forms = CATEGORY_FORMS[def().category];
  sel.replaceChildren();
  for (const f of forms) {
    const o = document.createElement('option');
    o.value = f; o.textContent = t('form.' + f); o.selected = f === curve().form;
    sel.append(o);
  }
  sel.closest('.form-row').hidden = forms.length < 2;
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
  // Die Tabelle muss mitwandern: kommt g(x) dazu oder wechselt die Form,
  // passen sonst Kopfzeile und Inhalt nicht mehr zusammen.
  generateTable();
  updateOptionAvailability();
  render();
  syncHash();
}

/* ==========================================================================
   6 · PARAMETER-DIALOG
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
  $('#param-dialog').showModal();
}

function saveParamDialog() {
  const input = $('#dialog-symbol');
  const val = input.value.trim();
  // Es gibt keinen Server - diese Pruefung ist die einzige. maxlength allein
  // reicht nicht, sie laesst sich im Browser aushebeln.
  if (!SYMBOL_RE.test(val)) { $('#dialog-symbol-error').hidden = false; return false; }
  state.symbols[curve().form][dialogParam] = val;
  saveSettings();
  updateExplorer();
  pushHistory();
  return true;
}

/* ==========================================================================
   7 · ANIMATION
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
  if (was) return;
  const p = paramDef(id), ctx = explorerCtx();
  const b = boundsOf(id);
  $(`.play-btn[data-play="${id}"]`)?.setAttribute('aria-pressed', 'true');
  const perMs = (b.max - b.min) / (REDUCED_MOTION ? 12000 : 4500);
  let dir = 1, last = performance.now();
  const tick = (now) => {
    const dt = now - last; last = now;
    let v = values()[id] + dir * perMs * dt;
    if (v >= b.max) { v = b.max; dir = -1; }
    if (v <= b.min) { v = b.min; dir = 1; }
    setValue(ctx, id, v);
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
      setValue(ctx, id, from + (to - from) * e);
      if (k < 1) requestAnimationFrame(step); else res();
    };
    requestAnimationFrame(step);
  });
}

async function playTransformation() {
  if (!def().transform) return;
  if (!licence.has('transform')) { toast(t('msg.pro')); return; }
  stopPlay();
  const ctx = explorerCtx();
  const target = { ...values() };
  const out = $('#readout');
  const dur = REDUCED_MOTION ? 300 : 1100;
  setValue(ctx, 'a', 1); setValue(ctx, 'd', 0); setValue(ctx, 'e', 0);
  out.textContent = t('tf.step0');
  await new Promise(r => setTimeout(r, dur / 2));
  out.textContent = t('tf.step1'); await tween(ctx, 'd', target.d, dur);
  out.textContent = t('tf.step2'); await tween(ctx, 'a', target.a, dur);
  out.textContent = t('tf.step3'); await tween(ctx, 'e', target.e, dur);
  setTimeout(() => { out.textContent = ''; }, 1500);
}

/* ==========================================================================
   8 · GRAPH ANFASSEN
   ========================================================================== */
let dragIndex = null;
function hitHandle(px, py) {
  const d = def();
  if (!d.handles) return null;
  const list = d.handles(values());
  for (let i = 0; i < list.length; i++) {
    const dx = mainGraph.x2px(list[i].x) - px, dy = mainGraph.y2px(list[i].y) - py;
    if (dx * dx + dy * dy <= 24 * 24) return i;
  }
  return null;
}
function onPointerDown(e) {
  if (!state.opts.drag || !mainGraph.ready) return;
  const r = mainGraph.canvas.getBoundingClientRect();
  const hit = hitHandle(e.clientX - r.left, e.clientY - r.top);
  if (hit === null) return;
  dragIndex = hit; stopPlay();
  mainGraph.canvas.setPointerCapture(e.pointerId);
  mainGraph.canvas.classList.add('is-dragging');
  e.preventDefault();
}
function onPointerMove(e) {
  if (dragIndex === null) return;
  const r = mainGraph.canvas.getBoundingClientRect();
  const hd = def().handles(values())[dragIndex];
  if (!hd) return;
  const patch = hd.set(mainGraph.px2x(e.clientX - r.left), mainGraph.py2y(e.clientY - r.top));
  const ctx = explorerCtx();
  for (const [id, val] of Object.entries(patch)) {
    const p = paramDef(id);
    setValue(ctx, id, Math.round(val / p.step) * p.step);
  }
  $('#readout').textContent = t(hd.hint).split('.')[0];
}
function onPointerUp(e) {
  if (dragIndex === null) return;
  dragIndex = null;
  mainGraph.canvas.classList.remove('is-dragging');
  mainGraph.canvas.releasePointerCapture?.(e.pointerId);
  $('#readout').textContent = '';
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
  });
}

function generateTable() {
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
  if (count > MAX_ROWS) { count = MAX_ROWS; msg.textContent = t('msg.rowLimit', { n: MAX_ROWS }); }

  const frag = document.createDocumentFragment();
  for (let i = 0; i < count; i++) {
    const x = Math.round((start + i * step) * 1e6) / 1e6;
    const tr = document.createElement('tr');
    const tdX = document.createElement('td');
    tdX.textContent = fmt(x, 3);
    tr.append(tdX);
    for (const cu of state.curves) {
      const y = FUNCTIONS[cu.form].f(x, cu.values);
      const td = document.createElement('td');
      td.textContent = Number.isFinite(y) ? fmt(y, 3) : t('msg.undefined');
      tr.append(td);
    }
    frag.append(tr);
  }
  // DocumentFragment statt innerHTML += in der Schleife (quadratische Laufzeit)
  $('#values-table tbody').replaceChildren(frag);
}

async function copyTable() {
  const head = ['x', ...state.curves.map((c, i) => `${curveName(i)}(x)`)].join('\t');
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
const pick = (a) => a[Math.floor(Math.random() * a.length)];

function randomValues(form) {
  const out = {};
  for (const p of FUNCTIONS[form].params) {
    out[p.id] = p.pool ? pick(p.pool) : Math.round((Math.random() * (p.max - p.min) + p.min) * 2) / 2;
  }
  return out;
}

function eqText(form, v, name = 'f') { return `${name}(x) = ${FUNCTIONS[form].rhs(v)}`; }

function makeDistractors(form, correct, n = 3) {
  const d = FUNCTIONS[form];
  const seen = new Set([d.rhs(correct)]);
  const out = [];
  let guard = 0;
  while (out.length < n && guard++ < 80) {
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
    seen.add(key); out.push(cand);
  }
  return out;
}

function newQuizQuestion(fromExplorer = false) {
  quiz.form = curve(0).form;
  quiz.answer = fromExplorer ? { ...values(0) } : randomValues(quiz.form);
  quiz.locked = false;
  quiz.options = [quiz.answer, ...makeDistractors(quiz.form, quiz.answer)].sort(() => Math.random() - 0.5);
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
    b.textContent = `${String.fromCharCode(65 + i)})  ${eqText(quiz.form, v)}`;
    box.append(b);
  });
}

function drawQuiz() {
  if (!quiz.answer || !quizGraph.measure()) return;
  drawScene(quizGraph, {
    curves: [{ form: quiz.form, values: quiz.answer, color: '--graph' }],
    activeIndex: 0,
    view: { xScale: state.xScale, yScale: state.yScale, piAxis: FUNCTIONS[quiz.form].piAxis || state.piAxis },
    opts: { helpers: false, roots: false, yint: false, vertex: false, drag: false, intersections: false }
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
  fb.textContent = ok ? t('quiz.right') : `${t('quiz.wrong')} ${eqText(quiz.form, quiz.answer)}`;
  $('#quiz-score').textContent = String(quiz.score);
  $('#quiz-total').textContent = String(quiz.total);
}

/* ==========================================================================
   11 · UEBEN - Modus "Nachbauen"
   Umkehrung des Zuordnungs-Quiz: Der Graph ist vorgegeben, die Schuelerin
   stellt die Regler ein. Geprueft wird parameterweise mit Toleranz, damit
   die Rueckmeldung sagt, WAS noch nicht stimmt - nicht nur, DASS etwas
   nicht stimmt.
   ========================================================================== */
const practice = { form: 'linear', target: null, ctx: null };

function newPracticeTask() {
  practice.form = curve(0).form;
  practice.target = randomValues(practice.form);
  const fresh = makeCurve(practice.form);
  practice.ctx = {
    form: practice.form, values: fresh.values, bounds: fresh.bounds, prefix: 'pr-', play: false,
    onChange: () => drawPractice()
  };
  renderSliderGroup($('#practice-params'), practice.ctx);
  const fb = $('#practice-feedback'); fb.textContent = ''; fb.className = 'feedback';
  drawPractice();
}

function drawPractice() {
  if (!practice.target || !practiceGraph.measure()) return;
  drawScene(practiceGraph, {
    curves: [{ form: practice.form, values: practice.ctx.values, color: '--graph' }],
    ghost: { form: practice.form, values: practice.target },
    activeIndex: 0,
    view: { xScale: state.xScale, yScale: state.yScale, piAxis: FUNCTIONS[practice.form].piAxis || state.piAxis },
    opts: { helpers: false, roots: false, yint: false, vertex: false, drag: false, intersections: false }
  });
}

function checkPractice() {
  const d = FUNCTIONS[practice.form];
  const wrong = [];
  let ok = 0;
  for (const p of d.params) {
    const diff = practice.ctx.values[p.id] - practice.target[p.id];
    const tol = Math.max(p.step * 1.01, Math.abs(practice.target[p.id]) * 0.02);
    if (Math.abs(diff) <= tol) ok++;
    else wrong.push(`${symbolOf(p.id, practice.form)} ${t(diff > 0 ? 'build.tooHigh' : 'build.tooLow')}`);
  }
  const fb = $('#practice-feedback');
  if (!wrong.length) {
    fb.className = 'feedback ok';
    fb.textContent = `${t('build.done')} ${eqText(practice.form, practice.target)}`;
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
   12 · EXPORT UND TEILEN
   ========================================================================== */
function exportImage() {
  if (!licence.has('export')) { toast(t('msg.pro')); return; }
  const off = document.createElement('canvas');
  const g = new Graph(off);
  g.bg = '#ffffff';
  g.setSize(mainGraph.w || 900, mainGraph.h || 520, 2);

  // Fuer die Dauer des Zeichnens auf das helle Theme: der Export landet in
  // digitalen Heften auf weissem Papier. Passiert innerhalb eines Frames,
  // deshalb ohne sichtbares Flackern.
  const prevTheme = document.documentElement.getAttribute('data-theme');
  document.documentElement.setAttribute('data-theme', 'light');
  MFE.colors.clear();
  drawScene(g, scene());
  document.documentElement.setAttribute('data-theme', prevTheme);
  MFE.colors.clear();

  off.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `graph_${curve(0).form}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);   // sonst bleibt das Bild im Speicher
    toast(t('msg.saved'));
  }, 'image/png');
}

async function shareLink() {
  if (!licence.has('share')) { toast(t('msg.pro')); return; }
  const url = location.origin + location.pathname + buildHash();
  try { await navigator.clipboard.writeText(url); toast(t('msg.copied')); }
  catch { toast(t('msg.copyFail')); }
}

/* ==========================================================================
   13 · SPRACHE, THEME, NAVIGATION
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
  if (quiz.answer) renderQuizOptions();
  if (practice.ctx) renderSliderGroup($('#practice-params'), practice.ctx);
}

function applyTheme() {
  document.documentElement.setAttribute('data-theme', state.theme);
  MFE.colors.clear();          // sonst zeichnet der Graph mit den alten Farben
  renderCurveSwitcher();
  renderTableHead();
  render();
  drawQuiz(); drawPractice();
}

function showScreen(which) {
  $('#screen-home').classList.toggle('is-active', which === 'home');
  $('#screen-app').classList.toggle('is-active', which === 'app');
  if (which === 'app') requestAnimationFrame(() => { mainGraph.measure(); render(); });
}

function activateTab(name) {
  $$('.tab-btn').forEach(b => {
    const on = b.dataset.tab === name;
    b.classList.toggle('is-active', on);
    b.setAttribute('aria-selected', String(on));
    b.tabIndex = on ? 0 : -1;
  });
  $$('.tab-panel').forEach(p => p.classList.toggle('is-active', p.id === `tab-${name}`));
  // rAF statt setTimeout: der Frame nach dem Layout ist der definierte
  // Zeitpunkt, an dem ein Canvas eine Breite hat.
  requestAnimationFrame(() => {
    if (name === 'explorer') { mainGraph.measure(); render(); }
    if (name === 'quiz') setQuizMode($('#mode-build').hidden ? 'match' : 'build');
  });
}

function syncScaleInputs() {
  $('#scale-x').value = state.xScale; $('#val-scale-x').textContent = fmt(state.xScale, 1);
  $('#scale-y').value = state.yScale; $('#val-scale-y').textContent = fmt(state.yScale, 1);
}
function syncOptionInputs() {
  for (const k of Object.keys(state.opts)) {
    const el = $(`#opt-${k}`);
    if (el) el.checked = state.opts[k];
  }
  $('#opt-piAxis').checked = state.piAxis;
  mainGraph.canvas.classList.toggle('is-draggable', state.opts.drag);
}

/* ==========================================================================
   14 · EVENTS
   ========================================================================== */
function bindEvents() {
  $$('.fn-card').forEach(card => card.addEventListener('click', () => {
    const form = CATEGORY_FORMS[card.dataset.category][0];
    state.curves = [makeCurve(form)];
    state.active = 0;
    state.opts.intersections = false;
    state.piAxis = !!FUNCTIONS[form].piAxis;
    syncOptionInputs();
    updateExplorer();
    showScreen('app'); activateTab('explorer');
    pushHistory();
  }));
  $('#btn-home').addEventListener('click', () => { stopPlay(); showScreen('home'); });

  $('#btn-theme').addEventListener('click', () => {
    state.theme = state.theme === 'light' ? 'dark' : 'light';
    applyTheme(); saveSettings();
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
      if (!licence.has('secondCurve')) { toast(t('msg.pro')); return; }
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
    ensureSymbols(form);
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

  ['x', 'y'].forEach(axis => {
    const el = $(`#scale-${axis}`);
    el.addEventListener('input', () => {
      state[`${axis}Scale`] = parseFloat(el.value);
      $(`#val-scale-${axis}`).textContent = el.value;
      render(); syncHash(); pushHistory();
    });
  });
  $('#btn-reset-view').addEventListener('click', () => {
    state.xScale = state.yScale = 10;
    syncScaleInputs(); render(); syncHash(); pushHistory();
  });

  for (const key of Object.keys(state.opts)) {
    const el = $(`#opt-${key}`);
    if (!el) continue;
    el.addEventListener('change', () => {
      if (key === 'drag' && !licence.has('drag')) { el.checked = false; toast(t('msg.pro')); return; }
      state.opts[key] = el.checked;
      mainGraph.canvas.classList.toggle('is-draggable', state.opts.drag);
      if (key === 'intersections' && !el.checked) $('#readout').textContent = '';
      render(); pushHistory();
    });
  }
  $('#opt-piAxis').addEventListener('change', (e) => {
    state.piAxis = e.target.checked; render(); syncHash(); pushHistory();
  });

  $('#btn-transform').addEventListener('click', playTransformation);
  $('#btn-export').addEventListener('click', exportImage);
  $('#btn-share').addEventListener('click', shareLink);
  $('#btn-undo').addEventListener('click', undo);
  $('#btn-redo').addEventListener('click', redo);

  const cv = mainGraph.canvas;
  cv.addEventListener('pointerdown', onPointerDown);
  cv.addEventListener('pointermove', onPointerMove);
  cv.addEventListener('pointerup', onPointerUp);
  cv.addEventListener('pointercancel', onPointerUp);

  $('#dialog-save').addEventListener('click', (e) => { if (!saveParamDialog()) e.preventDefault(); });

  $('#btn-gen-table').addEventListener('click', generateTable);
  $('#btn-copy-table').addEventListener('click', copyTable);

  $$('#quiz-modes .seg-btn').forEach(b => b.addEventListener('click', () => {
    if (b.dataset.mode === 'build' && !licence.has('practice')) { toast(t('msg.pro')); return; }
    setQuizMode(b.dataset.mode);
  }));
  $('#btn-next-quiz').addEventListener('click', () => newQuizQuestion(false));
  $('#btn-own-quiz').addEventListener('click', () => {
    if (!licence.has('ownQuiz')) { toast(t('msg.pro')); return; }
    newQuizQuestion(true); activateTab('quiz'); setQuizMode('match'); toast(t('quiz.own'));
  });
  $('#quiz-options').addEventListener('click', (e) => {
    const b = e.target.closest('.quiz-opt');
    if (b) answerQuiz(Number(b.dataset.index));
  });
  $('#btn-check').addEventListener('click', checkPractice);
  $('#btn-new-task').addEventListener('click', newPracticeTask);

  // Tastatur: Rueckgaengig. In Textfeldern hat der Browser sein eigenes Undo.
  document.addEventListener('keydown', (e) => {
    const inText = /^(INPUT|TEXTAREA)$/.test(e.target.tagName) && e.target.type !== 'range';
    if (inText || !(e.ctrlKey || e.metaKey)) return;
    const k = e.key.toLowerCase();
    if (k === 'z' && !e.shiftKey) { undo(); e.preventDefault(); }
    else if ((k === 'z' && e.shiftKey) || k === 'y') { redo(); e.preventDefault(); }
  });

  if ('ResizeObserver' in window) {
    const ro = new ResizeObserver(debounce(() => {
      if (mainGraph.measure()) render();
      drawQuiz(); drawPractice();
    }, 100));
    [ '#graph-canvas', '#quiz-canvas', '#practice-canvas' ].forEach(s => ro.observe($(s)));
  } else {
    addEventListener('resize', debounce(() => { mainGraph.measure(); render(); }, 150));
  }

  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (localStorage.getItem(STORAGE_KEY)) return;
    state.theme = e.matches ? 'dark' : 'light';
    applyTheme();
  });

  document.addEventListener('visibilitychange', () => { if (document.hidden) stopPlay(); });

  // Wird ausgeloest, wenn ein Kauf wiederhergestellt oder abgeschlossen wurde
  // (siehe js/billing.js). Die Sperren muessen dann sofort verschwinden.
  addEventListener('mfe:licence-changed', () => {
    markProFeatures();
    updateExplorer();
    toast(t('msg.proUnlocked'));
  });
}

/** Setzt die PRO-Abzeichen. Wird auch nach einem Kauf erneut aufgerufen,
 *  deshalb werden bestehende Sperren zuerst entfernt - sonst blieben die
 *  Abzeichen nach dem Freischalten stehen. */
function markProFeatures() {
  const map = {
    '#btn-export': 'export', '#btn-share': 'share',
    '#btn-own-quiz': 'ownQuiz', '#btn-transform': 'transform'
  };
  const lock = (el, feat) => {
    if (!el) return;
    el.classList.toggle('is-locked', !licence.has(feat));
  };
  for (const [sel, feat] of Object.entries(map)) lock($(sel), feat);
  lock($('#opt-drag')?.closest('.chip'), 'drag');
  lock($('#quiz-modes [data-mode="build"]'), 'practice');
  lock($('#curve-switch .curve-add'), 'secondCurve');
}

/* ==========================================================================
   15 · START
   ========================================================================== */
function registerServiceWorker() {
  // Nur ueber http(s). Unter file:// gibt es keine Service Worker - die App
  // laeuft dort trotzdem, nur eben ohne Offline-Speicher.
  if (!('serviceWorker' in navigator) || !location.protocol.startsWith('http')) return;
  navigator.serviceWorker.register('sw.js').then(reg => {
    reg.addEventListener('updatefound', () => {
      const sw = reg.installing;
      sw?.addEventListener('statechange', () => {
        if (sw.state === 'installed' && !navigator.serviceWorker.controller) toast(t('msg.offlineReady'));
      });
    });
  }).catch(() => { /* Offline-Betrieb ist ein Extra, kein Muss */ });
}

function init() {
  state.theme = 'light';
  loadSettings();
  if (!localStorage.getItem(STORAGE_KEY) && matchMedia('(prefers-color-scheme: dark)').matches) {
    state.theme = 'dark';
  }
  document.documentElement.setAttribute('data-theme', state.theme);

  mainGraph = new Graph($('#graph-canvas'));
  quizGraph = new Graph($('#quiz-canvas'));
  practiceGraph = new Graph($('#practice-canvas'));

  const fromLink = readHash();
  bindEvents();
  markProFeatures();
  syncScaleInputs();
  syncOptionInputs();
  applyLanguage();
  generateTable();

  history_.stack = [snapshot()];
  history_.index = 0;
  updateUndoButtons();

  if (fromLink) { showScreen('app'); activateTab('explorer'); }
  registerServiceWorker();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();

})();
