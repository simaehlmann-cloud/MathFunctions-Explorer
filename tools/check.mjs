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
/* Kommentare vorher entfernen. Sonst zieht der Selektor-Ausdruck den davor
   stehenden Kommentarblock mit in den Selektor, und ":root" wird nicht mehr
   als solcher erkannt - genau daran ist die Farbpruefung stillschweigend
   an der halben Palette vorbeigelaufen. */
const cssClean = css.replace(/\/\*[\s\S]*?\*\//g, '');
for (const m of cssClean.matchAll(/(:root[^{]*)\{([^}]*)\}/g)) {
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

/* Bloecke einsammeln. Wichtig: Selektoren koennen zusammengesetzt sein -
   ":root, :root[data-theme=\"light\"]". Eine frueherer Fassung suchte nach dem
   genauen Selektor und uebersah diesen Block komplett; die Farbpruefung lief
   damit auf einer halben Palette. */
function cssBlocks() {
  const out = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(cssClean))) {
    const sels = m[1].split(',').map(x => x.trim()).filter(Boolean);
    const vars = Object.fromEntries(
      [...m[2].matchAll(/(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{6})/g)].map(x => [x[1], x[2]]));
    if (Object.keys(vars).length) out.push({ sels, vars });
  }
  return out;
}
const BLOCKS = cssBlocks();

/** Palette fuer eine Kombination aus Farbschema und Darstellung. */
function paletteFor({ theme = 'light', display = 'normal' } = {}) {
  const wanted = new Set([':root', `:root[data-theme="${theme}"]`]);
  if (display === 'beamer') {
    wanted.add(':root[data-display="beamer"]');
    wanted.add(`:root[data-display="beamer"][data-theme="${theme}"]`);
  }
  const pal = {};
  for (const b of BLOCKS) {
    if (b.sels.some(sel => wanted.has(sel))) Object.assign(pal, b.vars);
  }
  return pal;
}
const lightPal = paletteFor({ theme: 'light' });
const darkPal = paletteFor({ theme: 'dark' });
const beamerLight = paletteFor({ theme: 'light', display: 'beamer' });
const beamerDark = paletteFor({ theme: 'dark', display: 'beamer' });

for (const [themeName, pal] of [['hell', lightPal], ['dunkel', darkPal],
                                ['Beamer hell', beamerLight], ['Beamer dunkel', beamerDark]]) {
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

/* Kontrast gegen den Zeichenuntergrund. Eine Linie mit weniger als 3:1 ist
   auf einer Projektionsflaeche nicht mehr sicher zu sehen. */
const MIN_CONTRAST = 3.0;
function relLum(hex) {
  const [r, g, b] = rgbOf(hex).map(c => (c > 0.04045 ? ((c + 0.055) / 1.055) ** 2.4 : c / 12.92));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a, b) {
  const [hi, lo] = [relLum(a), relLum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
for (const [themeName, pal] of [['hell', lightPal], ['dunkel', darkPal],
                                ['Beamer hell', beamerLight], ['Beamer dunkel', beamerDark]]) {
  const bg = pal['--surface'];
  if (!bg) { note(`CSS: "--surface" fehlt im Modus ${themeName}`); continue; }
  for (const c of LINE_COLORS) {
    if (!pal[c]) continue;
    const k = contrast(pal[c], bg);
    if (k < MIN_CONTRAST) {
      note(`Farben: ${c} hat im Modus ${themeName} nur ${k.toFixed(1)}:1 Kontrast zum Untergrund`);
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

/* --- 7 · Sperrdatei -------------------------------------------------------
   Ohne package-lock.json loest npm auf dem Server andere Fassungen auf als
   auf dem eigenen Rechner. Genau daran ist der Selbsttest einmal gescheitert:
   lokal jsdom 30 (mit TextEncoder im Fenster), auf dem Server jsdom 25 (ohne).
   Der Testrahmen ist inzwischen gegen beides gewappnet - die Sperrdatei sorgt
   trotzdem dafuer, dass beide Seiten dasselbe installieren. */
if (!(await exists('package-lock.json'))) {
  note('package-lock.json fehlt - der Server installiert dann andere Fassungen als du testest');
} else {
  const lock = JSON.parse(await read('package-lock.json'));
  const pkg = JSON.parse(await read('package.json'));
  for (const dep of Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })) {
    if (!lock.packages?.[`node_modules/${dep}`]) {
      note(`package-lock.json kennt "${dep}" nicht - Sperrdatei mit "npm install" erneuern`);
    }
  }
}

/* --- 8 · Umlaute ---------------------------------------------------------
   Die deutschen Texte sind einmal mit umschriebenen Umlauten in die Datei
   geraten - auf dem Telefon stand dann "Ueber", "fuer" und "Spaeter". In
   Kommentaren und Bezeichnern ist die Umschreibung in Ordnung, in
   Anzeigetexten nicht. Woerter, die im Deutschen wirklich so geschrieben
   werden, stehen in der Ausnahmeliste. */
const UMLAUT_OK = new Set([
  'Aktuelle', 'aktueller', 'Achsenausschnitt', 'anfassen', 'Anfassen', 'angepasst',
  'Aussage', 'Ausschnitt', 'bauen', 'dass', 'Fassung', 'Frequenz', 'Funktionsklasse',
  'grauen', 'Impressum', 'Klasse', 'Klassenarbeiten', 'Koeffizient', 'muss',
  'Nachbauen', 'neue', 'Neue', 'Neues', 'Passend', 'passt', 'smaehlmann'
]);

{
  const dictStart = i18n.indexOf('const de = {');
  const dictEnd = i18n.indexOf('const en = {');
  const german = i18n.slice(dictStart, dictEnd);
  const seen = new Set();
  for (const line of german.matchAll(/^\s*'[\w.]+':\s*'((?:[^'\\]|\\.)*)'/gm)) {
    for (const word of line[1].match(/[A-Za-zÄÖÜäöüß]+/g) ?? []) {
      if (!/ae|oe|ue/i.test(word) || UMLAUT_OK.has(word) || seen.has(word)) continue;
      seen.add(word);
      note(`Deutscher Text: "${word}" sieht nach umschriebenem Umlaut aus - bitte ä, ö, ü schreiben`);
    }
  }
}

/* --- 9 · Fassungsnummern -------------------------------------------------
   package.json, sw.js und js/app.js muessen dieselbe Nummer tragen. Laufen
   sie auseinander, zeigt die App eine andere Fassung an, als installiert
   ist - und die Fehlersuche beginnt mit einer falschen Annahme. */
{
  const pkgVersion = JSON.parse(await read('package.json')).version;
  const appVersion = (await read('js/app.js')).match(/const APP_VERSION = '([^']*)'/)?.[1];
  const swVersion = (await read('sw.js')).match(/const CACHE = 'mfe-v([\d.]+)'/)?.[1];
  if (appVersion !== pkgVersion) {
    note(`APP_VERSION in js/app.js ist "${appVersion}", package.json sagt "${pkgVersion}"`);
  }
  if (swVersion !== pkgVersion) {
    note(`Cache-Name in sw.js ist "mfe-v${swVersion}", package.json sagt "${pkgVersion}"`);
  }
}

/* --- 10 · Feste Breiten --------------------------------------------------
   Die Kopfzeile war einmal breiter als ein Telefon: die ganze Seite liess
   sich seitlich verschieben, links fehlten Zeichen. Eine echte Pruefung
   braeuchte ein Browser-Layout, das hier nicht zur Verfuegung steht. Was
   sich statisch sagen laesst: eine feste Breite oberhalb der schmalsten
   ueblichen Geraetebreite ist fast immer ein Fehler.

   360 CSS-Pixel ist die Breite gaengiger Android-Telefone; alles darueber
   in width/min-width ausserhalb einer Medienabfrage wird gemeldet. */
const NARROWEST_DEVICE = 360;
{
  let inMedia = 0;
  for (const raw of css.split('\n')) {
    const line = raw.replace(/\/\*.*?\*\//g, '');
    if (/@media/.test(line)) inMedia++;
    if (inMedia && /^\s*\}/.test(line) && !/\{/.test(line)) inMedia = Math.max(0, inMedia - 1);
    if (inMedia) continue;
    const m = line.match(/(?:^|[;{\s])(min-width|width)\s*:\s*(\d+)px/);
    if (!m) continue;
    const px = Number(m[2]);
    // In minmax()/clamp() steht die Zahl als Untergrenze - dort ist sie
    // beabsichtigt und harmlos, weil der Browser weiter verkleinert.
    if (/minmax\(|clamp\(|min\(/.test(line)) continue;
    if (px > NARROWEST_DEVICE) {
      note(`CSS: feste ${m[1]} von ${px}px ausserhalb einer Medienabfrage - passt nicht auf ein ${NARROWEST_DEVICE}px breites Telefon: ${line.trim().slice(0, 70)}`);
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
