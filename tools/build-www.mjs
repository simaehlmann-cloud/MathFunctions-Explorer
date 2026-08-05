/* ==========================================================================
   tools/build-www.mjs
   --------------------------------------------------------------------------
   Sammelt die Web-Dateien nach www/ - dem Ordner, den Capacitor in die
   Android-App packt. Zwei Ausgaben aus EINEM Quellcodezweig:

     node tools/build-www.mjs          Pro
     node tools/build-www.mjs lite     Lite

   Fuer Lite nimmt das Skript genau vier Eingriffe vor:
     1. js/licence.js  -> DEV_EDITION = 'lite'
     2. index.html     -> Verweis auf manifest-lite.webmanifest
     3. index.html     -> die Icon-Verweise auf icon-lite-*
     4. sw.js          -> Cache-Name bekommt das Suffix, damit ein Wechsel
                          zwischen den Ausgaben nicht auf altem Bestand sitzt

   Es gibt bewusst keinen zweiten Zweig: zwei Zweige laufen erfahrungsgemaess
   innerhalb weniger Wochen auseinander.
   ========================================================================== */
import { readFile, writeFile, mkdir, rm, cp, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'www');

/* Alles, was in die App gehoert. Wer eine Datei ergaenzt, traegt sie HIER
   und in sw.js ein - sonst fehlt sie offline. */
const FILES = [
  'index.html',
  'style.css',
  'recht.css',
  'impressum.html',
  'datenschutz.html',
  'ueber.html',
  'sw.js',
  'js/licence.js',
  'js/billing.js',
  'js/i18n.js',
  'js/functions.js',
  'js/graph.js',
  'js/nav.js',
  'js/ui.js',
  'js/qr.js',
  'js/quiz.js',
  'js/app.js'
];

const ICONS_PRO = [
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png'
];
const ICONS_LITE = [
  'icons/icon-lite-192.png',
  'icons/icon-lite-512.png',
  'icons/icon-lite-maskable-512.png'
];

const exists = (p) => access(p, constants.R_OK).then(() => true, () => false);

async function main() {
  const flavour = (process.argv[2] || 'pro').toLowerCase();
  if (!['pro', 'lite'].includes(flavour)) {
    throw new Error(`Unbekannte Ausgabe "${flavour}". Erlaubt sind pro und lite.`);
  }
  const lite = flavour === 'lite';

  // Fehlende Quelldatei ist ein Abbruchgrund. Ein www/ mit Loechern faellt
  // sonst erst im Emulator auf.
  const icons = lite ? ICONS_LITE : ICONS_PRO;
  const manifest = lite ? 'manifest-lite.webmanifest' : 'manifest.webmanifest';
  const missing = [];
  for (const f of [...FILES, ...icons, manifest]) {
    if (!(await exists(path.join(ROOT, f)))) missing.push(f);
  }
  if (missing.length) throw new Error('Diese Dateien fehlen:\n  ' + missing.join('\n  '));

  await rm(OUT, { recursive: true, force: true });
  await mkdir(path.join(OUT, 'js'), { recursive: true });
  await mkdir(path.join(OUT, 'icons'), { recursive: true });

  for (const f of FILES) await cp(path.join(ROOT, f), path.join(OUT, f));
  for (const f of icons) await cp(path.join(ROOT, f), path.join(OUT, f));

  // In www liegt genau EIN Manifest, immer unter demselben Namen. So muss
  // index.html im Lite-Fall nur einen Namen ersetzen und der Service Worker
  // laedt nie eine Datei, die es nicht gibt.
  await cp(path.join(ROOT, manifest), path.join(OUT, 'manifest.webmanifest'));

  if (lite) {
    // 1 · Lizenzweiche
    const licPath = path.join(OUT, 'js/licence.js');
    let lic = await readFile(licPath, 'utf8');
    const before = lic;
    lic = lic.replace(/const DEV_EDITION = '(?:pro|lite)';/, "const DEV_EDITION = 'lite';");
    if (lic === before) throw new Error('DEV_EDITION nicht gefunden - js/licence.js geaendert?');
    // Die Anwendungskennung der Lite-Ausgabe endet auf .lite; der Verweis in
    // den Store muss aber auf die PRO-Kennung zeigen. Deshalb wird hier
    // absichtlich nichts an PRO_APP_ID geaendert.
    await writeFile(licPath, lic);

    // 2 + 3 · Icons in index.html
    const htmlPath = path.join(OUT, 'index.html');
    let html = await readFile(htmlPath, 'utf8');
    html = html.replace(/icons\/icon-(192|512|maskable-512)\.png/g, 'icons/icon-lite-$1.png');
    html = html.replace(/<title>[^<]*<\/title>/, '<title>MathFunctions Explorer Lite</title>');
    await writeFile(htmlPath, html);
  }

  // 4 · Cache-Name je Ausgabe
  const swPath = path.join(OUT, 'sw.js');
  let sw = await readFile(swPath, 'utf8');
  sw = sw.replace(/const CACHE = '([^']+)';/, (_, v) => `const CACHE = '${v}-${flavour}';`);
  if (lite) sw = sw.replace(/icons\/icon-(192|512|maskable-512)\.png/g, 'icons/icon-lite-$1.png');
  await writeFile(swPath, sw);

  // Gegenprobe: jede Datei, die der Service Worker vorhaelt, muss auch da
  // sein. Ein einziger 404 laesst die gesamte Installation scheitern.
  const listed = [...sw.matchAll(/'\.\/([^']*)'/g)].map(m => m[1]).filter(Boolean);
  const broken = [];
  for (const f of listed) {
    if (!(await exists(path.join(OUT, f)))) broken.push(f);
  }
  if (broken.length) throw new Error('Im Service Worker gelistet, aber nicht in www/:\n  ' + broken.join('\n  '));

  console.log(`www/ erzeugt (${flavour}), ${FILES.length + icons.length + 1} Dateien.`);
}

main().catch(err => { console.error('Build abgebrochen: ' + err.message); process.exit(1); });
