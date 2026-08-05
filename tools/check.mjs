/* ==========================================================================
   tools/check.mjs  ·  Selbsttest ohne Browser
   --------------------------------------------------------------------------
   Prueft die drei Fehlerarten, die sich in dieser App am haeufigsten
   einschleichen und im Browser erst beim Klicken auffallen:

     1. Ein Skript sucht eine Element-ID, die es im HTML nicht (mehr) gibt.
     2. Ein Uebersetzungsschluessel fehlt in einer der beiden Sprachen.
     3. Eine Datei steht im Service Worker oder im Build-Skript, existiert
        aber nicht - dann scheitert die gesamte Offline-Installation.

   Aufruf:  npm run check
   ========================================================================== */
import { readFile, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFile(path.join(ROOT, f), 'utf8');
const exists = (f) => access(path.join(ROOT, f), constants.R_OK).then(() => true, () => false);

const problems = [];
const note = (msg) => problems.push(msg);

const SCRIPTS = ['js/licence.js', 'js/billing.js', 'js/i18n.js', 'js/functions.js',
                 'js/graph.js', 'js/nav.js', 'js/ui.js', 'js/qr.js', 'js/quiz.js', 'js/app.js'];

const html = await read('index.html');
const htmlIds = new Set([...html.matchAll(/id="([^"]+)"/g)].map(m => m[1]));

/* --- 1 · Element-IDs ---------------------------------------------------- */
let js = '';
for (const f of SCRIPTS) js += await read(f) + '\n';

// Nur woertliche Selektoren; alles Zusammengesetzte wird zur Laufzeit gebaut.
const wanted = new Set([...js.matchAll(/\$\('#([A-Za-z][\w-]*)'/g)].map(m => m[1]));
// IDs, die die Skripte selbst erzeugen (Regler, Editorfelder, Abspieler).
const generated = /^(ed-|pl-|pr-|slider-|val-|editor-|play-answer|play-canvas)/;
for (const id of [...wanted].sort()) {
  if (htmlIds.has(id) || generated.test(id)) continue;
  note(`ID "#${id}" wird im JavaScript gesucht, steht aber nicht in index.html`);
}

/* --- 2 · Uebersetzungen -------------------------------------------------- */
const i18n = await read('js/i18n.js');
function dictKeys(name, next) {
  const start = i18n.indexOf(`const ${name} = {`);
  const end = next ? i18n.indexOf(`const ${next} = {`) : i18n.indexOf('const dicts');
  const body = i18n.slice(start, end === -1 ? undefined : end);
  return new Set([...body.matchAll(/^\s{2}'([^']+)':/gm)].map(m => m[1]));
}
const de = dictKeys('de', 'en');
const en = dictKeys('en', null);
for (const k of [...de].filter(k => !en.has(k)).sort()) note(`Schluessel "${k}" fehlt auf Englisch`);
for (const k of [...en].filter(k => !de.has(k)).sort()) note(`Schluessel "${k}" fehlt auf Deutsch`);

// data-i18n-Attribute im HTML
for (const attr of ['data-i18n', 'data-i18n-title', 'data-i18n-aria']) {
  for (const m of html.matchAll(new RegExp(`${attr}="([^"]+)"`, 'g'))) {
    if (!de.has(m[1])) note(`HTML nutzt "${m[1]}" (${attr}), das Woerterbuch kennt den Schluessel nicht`);
  }
}

// Schluessel, die im JavaScript woertlich verlangt werden
// Nur vollstaendige Schluessel; t('type.' + x) wird zur Laufzeit gebaut.
for (const m of js.matchAll(/\bt\('([A-Za-z][\w.]*)'\s*[,)]/g)) {
  if (!de.has(m[1])) note(`JavaScript verlangt den Schluessel "${m[1]}", der nicht im Woerterbuch steht`);
}

// Parameterbeschreibungen aus dem Funktionskatalog
const fn = await read('js/functions.js');
for (const m of fn.matchAll(/desc: '([^']+)'/g)) {
  if (!de.has(m[1])) note(`Beschreibung "${m[1]}" fehlt im Woerterbuch`);
  if (!de.has(m[1] + '.ex')) note(`Beispiel "${m[1]}.ex" fehlt im Woerterbuch`);
}

/* --- 3 · Dateilisten ----------------------------------------------------- */
const sw = await read('sw.js');
for (const m of sw.matchAll(/'\.\/([^']+)'/g)) {
  if (!(await exists(m[1]))) note(`sw.js listet "${m[1]}", die Datei fehlt`);
}
const build = await read('tools/build-www.mjs');
const listBlock = build.slice(build.indexOf('const FILES'), build.indexOf('const exists'));
for (const m of listBlock.matchAll(/'([\w./-]+\.(?:html|css|js|png))'/g)) {
  if (!(await exists(m[1]))) note(`build-www.mjs listet "${m[1]}", die Datei fehlt`);
}
// Jedes im HTML eingebundene Skript muss auch ausgeliefert werden.
for (const m of html.matchAll(/<script src="([^"]+)"/g)) {
  if (!listBlock.includes(`'${m[1]}'`)) note(`index.html laedt "${m[1]}", build-www.mjs kopiert die Datei nicht`);
  if (!sw.includes(`'./${m[1]}'`)) note(`index.html laedt "${m[1]}", sw.js haelt die Datei nicht vor`);
}

/* --- 4 · CSS-Variablen ----------------------------------------------------
   Wird dieselbe Variable in einem Block zweimal gesetzt, gewinnt lautlos die
   letzte. Genau so blieb der Farbkonflikt im Dunkelmodus unbemerkt bestehen,
   obwohl die neuen Werte im selben Block darueberstanden. */
const css = await read('style.css');
for (const m of css.matchAll(/(:root[^{]*)\{([^}]*)\}/g)) {
  const sel = m[1].trim();
  const names = [...m[2].matchAll(/(--[\w-]+)\s*:/g)].map(x => x[1]);
  const seen = new Set(), dupes = new Set();
  for (const n of names) (seen.has(n) ? dupes : seen).add(n);
  for (const d of dupes) note(`CSS: "${d}" wird in ${sel} mehrfach gesetzt - die spaetere Zeile gewinnt`);
}

// Jede im JavaScript geholte Farbe muss im Stylesheet auch existieren.
for (const m of js.matchAll(/C\('(--[\w-]+)'\)/g)) {
  if (!css.includes(m[1] + ':')) note(`CSS: Farbe "${m[1]}" wird im JavaScript geholt, ist aber nirgends definiert`);
}
for (const m of js.matchAll(/'(--(?:graph2?|p[1-4]|deriv|tangent|trace|accent|muted|axis|grid|surface))'/g)) {
  if (!css.includes(m[1] + ':')) note(`CSS: Farbe "${m[1]}" fehlt im Stylesheet`);
}

/* --- 5 · Farbabstaende ----------------------------------------------------
   Alle Linien liegen im selben Koordinatensystem uebereinander. Zwei zu
   aehnliche Farben sind auf einem Beamer nicht mehr auseinanderzuhalten.
   Geprueft wird der Abstand nach CIE76; unter 25 gilt als verwechselbar. */
const LINE_COLORS = ['--graph', '--graph2', '--p1', '--p2', '--p3', '--p4', '--deriv', '--tangent'];
const MIN_DELTA_E = 25;

const rgbOf = (hex) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
function labOf(hex) {
  const [r, g, b] = rgbOf(hex).map(c => (c > 0.04045 ? ((c + 0.055) / 1.055) ** 2.4 : c / 12.92));
  const X = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
  const Y = r * 0.2126 + g * 0.7152 + b * 0.0722;
  const Z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const [fx, fy, fz] = [f(X), f(Y), f(Z)];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
const deltaE = (a, b) => Math.hypot(...labOf(a).map((v, i) => v - labOf(b)[i]));

function paletteOf(selector) {
  const m = css.match(new RegExp(selector.replace(/[[\]"]/g, '\\$&') + '\\s*\\{([^}]*)\\}'));
  if (!m) return {};
  return Object.fromEntries([...m[1].matchAll(/(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{6})/g)].map(x => [x[1], x[2]]));
}
const lightPal = paletteOf(':root');
const darkPal = { ...lightPal, ...paletteOf(':root\\[data-theme="dark"\\]') };

for (const [themeName, pal] of [['hell', lightPal], ['dunkel', darkPal]]) {
  for (const c of LINE_COLORS) {
    if (!pal[c]) { note(`CSS: "${c}" fehlt im Modus ${themeName}`); continue; }
  }
  for (let i = 0; i < LINE_COLORS.length; i++) {
    for (let j = i + 1; j < LINE_COLORS.length; j++) {
      const [a, b] = [LINE_COLORS[i], LINE_COLORS[j]];
      if (!pal[a] || !pal[b]) continue;
      const d = deltaE(pal[a], pal[b]);
      if (d < MIN_DELTA_E) {
        note(`Farben: ${a} und ${b} sind im Modus ${themeName} zu aehnlich (dE ${d.toFixed(1)} < ${MIN_DELTA_E})`);
      }
    }
  }
}

/* --- 6 · Workflows -------------------------------------------------------
   Zwei Fehler, die den Android-Build zuverlaessig zum Absturz bringen und
   beide schon einmal passiert sind:

   a) `cache: gradle` bei actions/setup-java. Die Action bildet den
      Cache-Schluessel aus vorhandenen Gradle-Dateien und BRICHT AB, wenn sie
      keine findet. Der Ordner android/ ist bei uns aber erzeugt, nicht
      eingecheckt - zum Zeitpunkt von setup-java gibt es ihn noch nicht.
   b) Actions, die noch auf Node 20 laufen. Node 20 wurde im Juni 2026
      abgeloest und faellt im Herbst 2026 weg. */
const MIN_MAJOR = {
  'actions/checkout': 5, 'actions/setup-node': 5, 'actions/setup-java': 5,
  'actions/cache': 5, 'actions/upload-artifact': 6, 'actions/download-artifact': 7
};

for (const wf of ['.github/workflows/android.yml', '.github/workflows/pages.yml']) {
  if (!(await exists(wf))) continue;
  const lines = (await read(wf)).split('\n');
  let currentUses = null, currentIndent = 0;
  for (const line of lines) {
    const uses = line.match(/^(\s*)-?\s*uses:\s*([\w./-]+)@v(\d+)/);
    if (uses) {
      currentUses = uses[2];
      currentIndent = uses[1].length;
      const min = MIN_MAJOR[uses[2]];
      if (min && Number(uses[3]) < min) {
        note(`${wf}: ${uses[2]}@v${uses[3]} laeuft noch auf Node 20 - mindestens v${min} verwenden`);
      }
      continue;
    }
    // Ein Schritt endet, sobald die Einrueckung wieder abnimmt.
    if (line.trim() && line.search(/\S/) <= currentIndent) { currentUses = null; continue; }
    if (currentUses?.startsWith('actions/setup-') && /^\s*cache:\s*\S/.test(line)) {
      note(`${wf}: ${currentUses} mit "${line.trim()}" - bricht ab, wenn die Dateien erst im Lauf entstehen`);
    }
  }
}

/* --- Ergebnis ------------------------------------------------------------ */
if (problems.length) {
  console.error(`${problems.length} Befund(e):`);
  for (const p of problems) console.error('  · ' + p);
  process.exit(1);
}
console.log(`Selbsttest bestanden. ${de.size} Schluessel je Sprache, ${htmlIds.size} Element-IDs.`);
