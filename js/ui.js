/* ==========================================================================
   ui.js  ·  Gemeinsame Bausteine der Oberflaeche
   --------------------------------------------------------------------------
   Vorher lag die Reglergruppe in app.js und war damit fuer den neuen
   Quiz-Baukasten nicht erreichbar. Sie liegt jetzt hier, zusammen mit den
   DOM-Helfern und der Kurzmeldung. app.js, quiz.js und der Nachbau-Modus
   nutzen dieselbe Implementierung - eine Aenderung an der Bedienung wirkt
   damit ueberall gleich.

   Ein Reglerkontext ist:
     { form, values, bounds, prefix, play, symbolOf?, onChange?, onCommit? }
   ========================================================================== */
'use strict';
window.MFE = window.MFE || {};

MFE.ui = (() => {
const { clamp, fmt, parseLoose, FUNCTIONS } = MFE.math;
const t = (k, v) => MFE.i18n.t(k, v);

const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function debounce(fn, ms) {
  let id = 0;
  const wrapped = (...a) => { clearTimeout(id); id = setTimeout(() => fn(...a), ms); };
  wrapped.cancel = () => clearTimeout(id);
  return wrapped;
}

/** CSS-Bezeichner maskieren. Buchstaben kommen aus Deep Links und duerfen
 *  keinen Selektor sprengen. */
const cssId = (s) => (window.CSS?.escape ? CSS.escape(s) : String(s).replace(/[^\w-]/g, '_'));

let toastTimer = 0;
function toast(msg) {
  const el = $('#toast');
  if (!el) return;
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2800);
}

/* --------------------------------------------------------------------------
   Reglergruppe
   -------------------------------------------------------------------------- */
const paramOf = (ctx, id) => FUNCTIONS[ctx.form].params.find(x => x.id === id);
const symOf = (ctx, p) => (ctx.symbolOf ? ctx.symbolOf(p.id, ctx.form) : p.symbol);

function sliderEl(ctx, id) { return $(`#${cssId(ctx.prefix + 'slider-' + id)}`); }
function fieldEl(ctx, id)  { return $(`#${cssId(ctx.prefix + 'val-' + id)}`); }

/* --------------------------------------------------------------------------
   Fangraster
   Am Telefon trifft ein Regler mit Schrittweite 0,1 den Wert 2 praktisch nie.
   Deshalb rasten glatte Werte leicht ein - aber nur, wenn der Regler bewegt
   wird, nicht bei Animation, Tween oder getippter Eingabe.
   -------------------------------------------------------------------------- */
let snapEnabled = true;
const setSnap = (on) => { snapEnabled = !!on; };

let lastSnapValue = null;
function snapValue(p, v) {
  if (!snapEnabled) return v;
  // Kandidaten: ganze Zahlen, Halbe, dazu 0 und die Parametergrenzen.
  const cands = [Math.round(v), Math.round(v * 2) / 2, 0];
  const width = Math.abs((p.hardMax ?? p.max) - (p.hardMin ?? p.min)) || 1;
  const tol = Math.max(p.step * 0.45, width * 0.004);
  let best = v, bestD = Infinity;
  for (const c of cands) {
    if (c < (p.hardMin ?? -Infinity) || c > (p.hardMax ?? Infinity)) continue;
    const d = Math.abs(c - v);
    if (d < bestD) { bestD = d; best = c; }
  }
  if (bestD > tol) { lastSnapValue = null; return v; }
  // Kurzer Impuls, aber nur beim erstmaligen Einrasten - sonst vibriert das
  // Geraet die ganze Reglerfahrt lang.
  if (lastSnapValue !== best) {
    lastSnapValue = best;
    try { navigator.vibrate?.(8); } catch { /* nicht unterstuetzt */ }
  }
  return best;
}

function setValue(ctx, id, value, { snap = false } = {}) {
  const p = paramOf(ctx, id);
  if (!p) return;
  const b = ctx.bounds[id];
  let v = clamp(Number.isFinite(value) ? value : p.value, b.min, b.max);
  if (snap) v = clamp(snapValue(p, v), b.min, b.max);
  ctx.values[id] = Math.round(v * 1e4) / 1e4;

  const slider = sliderEl(ctx, id);
  if (slider && parseFloat(slider.value) !== ctx.values[id]) slider.value = ctx.values[id];
  const field = fieldEl(ctx, id);
  if (field && document.activeElement !== field) field.value = fmt(ctx.values[id], 4);

  ctx.onChange?.();
}

function widenBounds(ctx, id, v) {
  const b = ctx.bounds[id];
  const p = paramOf(ctx, id);
  if (!p) return;
  if (v < b.min) b.min = Math.max(Math.floor(v), p.hardMin ?? -Infinity);
  if (v > b.max) b.max = Math.min(Math.ceil(v), p.hardMax ?? Infinity);
  const slider = sliderEl(ctx, id);
  if (slider) { slider.min = b.min; slider.max = b.max; }
}

function commitTyped(ctx, id) {
  const field = fieldEl(ctx, id);
  if (!field) return;
  const p = paramOf(ctx, id);
  if (!p) return;
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
  ctx.onCommit?.();
}

/**
 * Baut die Regler eines Funktionstyps in einen Container.
 * Kompakt: Buchstabe, Wert und Regler liegen in EINER Zeile, damit unter dem
 * Koordinatensystem auch vier Parameter Platz finden, ohne dass der Graph aus
 * dem Bild scrollt.
 */
function renderSliderGroup(container, ctx) {
  container.replaceChildren();
  const d = FUNCTIONS[ctx.form];
  if (!d) return;

  for (const p of d.params) {
    const row = document.createElement('div');
    row.className = 'slider-row';

    const sym = document.createElement('label');
    sym.className = `sym c${p.color}`;
    sym.htmlFor = ctx.prefix + 'slider-' + p.id;
    sym.textContent = symOf(ctx, p);

    const b = ctx.bounds[p.id];
    const input = document.createElement('input');
    input.type = 'range';
    input.className = `s${p.color}`;
    input.id = ctx.prefix + 'slider-' + p.id;
    input.min = b.min; input.max = b.max; input.step = p.step;
    input.value = ctx.values[p.id];
    input.setAttribute('aria-label', `${symOf(ctx, p)}: ${t(p.desc).split('.')[0]}`);
    input.addEventListener('input', () => {
      setValue(ctx, p.id, parseFloat(input.value), { snap: true });
      // Nach dem Einrasten muss der Regler auf den gefangenen Wert
      // nachgezogen werden, sonst laufen Griff und Zahl auseinander.
      if (parseFloat(input.value) !== ctx.values[p.id]) input.value = ctx.values[p.id];
    });
    input.addEventListener('change', () => { lastSnapValue = null; ctx.onCommit?.(); });

    /* Tastatur: Pfeiltasten und Pos1/Ende kann der Browser selbst. Was fehlt,
       ist der grosse Schritt - wichtig, wenn die Lehrkraft am Beamer steht
       und nicht mit der Maus zielen will. */
    input.addEventListener('keydown', (e) => {
      const dir = (e.key === 'ArrowRight' || e.key === 'ArrowUp') ? 1
                : (e.key === 'ArrowLeft'  || e.key === 'ArrowDown') ? -1 : 0;
      if (dir && e.shiftKey) {
        setValue(ctx, p.id, ctx.values[p.id] + dir * p.step * 10, { snap: true });
        input.value = ctx.values[p.id];
        ctx.onCommit?.();
        e.preventDefault();
      }
    });

    // Eingabefeld statt reiner Anzeige: ein Regler mit Schrittweite 0,1
    // trifft weder 1/3 noch pi/2. type="text" + inputmode, weil
    // type="number" bei Komma je nach Browser-Locale einen leeren String
    // zurueckliefert.
    const field = document.createElement('input');
    field.type = 'text';
    field.inputMode = 'decimal';
    field.className = 'value-input';
    field.id = ctx.prefix + 'val-' + p.id;
    field.value = fmt(ctx.values[p.id], 4);
    field.autocomplete = 'off';
    field.setAttribute('aria-label', `${symOf(ctx, p)} ${t('a11y.valueField')}`);
    field.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); field.blur(); } });
    field.addEventListener('change', () => commitTyped(ctx, p.id));
    field.addEventListener('blur', () => commitTyped(ctx, p.id));

    row.append(sym, input, field);

    if (ctx.play) {
      const play = document.createElement('button');
      play.type = 'button';
      play.className = 'play-btn';
      play.dataset.play = p.id;
      play.setAttribute('aria-pressed', 'false');
      play.setAttribute('aria-label', `${symOf(ctx, p)} ${t('btn.animate')}`);
      play.textContent = '\u25b6';
      row.append(play);
    }

    container.append(row);
  }
}

/** Aktualisiert Regler und Felder, ohne die Zeilen neu zu bauen - noetig
 *  nach Undo, nach dem Laden eines Links und nach jedem Sprung im Quiz. */
function syncSliderGroup(ctx) {
  for (const p of FUNCTIONS[ctx.form]?.params ?? []) {
    const s = sliderEl(ctx, p.id);
    const b = ctx.bounds[p.id];
    if (s) { s.min = b.min; s.max = b.max; s.value = ctx.values[p.id]; }
    const f = fieldEl(ctx, p.id);
    if (f && document.activeElement !== f) f.value = fmt(ctx.values[p.id], 4);
  }
}

return { $, $$, debounce, toast, cssId, renderSliderGroup, syncSliderGroup,
         setValue, widenBounds, commitTyped, setSnap };
})();
