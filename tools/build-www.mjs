/* ==========================================================================
   tools/build-www.mjs
   --------------------------------------------------------------------------
   Sammelt die Web-Dateien nach dist/ - von dort kopieren die Workflows sie
   nach build/www/ im Cordova-Projekt (ios.yml, android.yml).

   ACHTUNG, bewusst NICHT www/: Cordova sucht sein Projekt, indem es vom
   Arbeitsordner aufwaerts geht, und nimmt den HOECHSTEN Ordner, der
   config.xml und www/ enthaelt. Laege www/ im Repo neben config.xml, landeten
   Plattform und Plugins im Repo statt in build/ - genau so beim Probelauf
   fuer 7.0.0 passiert. Es gibt nur noch EINE
   Ausgabe; der Umfang haengt vom In-App-Kauf ab (js/licence.js).

   Eingriffe gegenueber dem Quellstand:
     1. index.html -> <script src="cordova.js"> VOR js/licence.js. Nur in der
                      App: im Browser (GitHub Pages) gaebe es einen 404.
                      licence.js erkennt die iOS-App an window.cordova.
     2. js/app.js  -> APP_VERSION aus package.json
     3. sw.js      -> Baukennung im Cache-Namen

   Aufruf:  node tools/build-www.mjs
   ========================================================================== */
import { readFile, writeFile, mkdir, rm, cp, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'dist');

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
  'js/diagnose.js',
  'js/nav.js',
  'js/ui.js',
  'js/qr.js',
  'js/quiz.js',
  'js/app.js'
];

const ICONS = [
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png'
];

const exists = (p) => access(p, constants.R_OK).then(() => true, () => false);

async function main() {
  if (process.argv[2]) {
    throw new Error(`Unbekanntes Argument "${process.argv[2]}". Lite/Pro gibt es nicht mehr - einfach ohne Argument aufrufen.`);
  }

  // Fehlende Quelldatei ist ein Abbruchgrund. Ein dist/ mit Loechern faellt
  // sonst erst auf dem Geraet auf.
  const manifest = 'manifest.webmanifest';
  const missing = [];
  for (const f of [...FILES, ...ICONS, manifest]) {
    if (!(await exists(path.join(ROOT, f)))) missing.push(f);
  }
  if (missing.length) throw new Error('Diese Dateien fehlen:\n  ' + missing.join('\n  '));

  await rm(OUT, { recursive: true, force: true });
  await mkdir(path.join(OUT, 'js'), { recursive: true });
  await mkdir(path.join(OUT, 'icons'), { recursive: true });

  for (const f of [...FILES, ...ICONS, manifest]) await cp(path.join(ROOT, f), path.join(OUT, f));

  // 1 · cordova.js vor licence.js. Die Datei selbst legt Cordova beim Bauen
  //     in build/www/ ab; sie gehoert nicht ins Repo und nicht in sw.js.
  const htmlPath = path.join(OUT, 'index.html');
  let html = await readFile(htmlPath, 'utf8');
  const LIC = '<script src="js/licence.js"></script>';
  if (html.split(LIC).length !== 2) throw new Error('Einbindung von js/licence.js nicht eindeutig gefunden - index.html geaendert?');
  html = html.replace(LIC, '<script src="cordova.js"></script>\n' + LIC);
  await writeFile(htmlPath, html);

  // 2 · Fassungsnummer aus package.json in die App schreiben. Von Hand
  //      gepflegt liefe sie frueher oder spaeter auseinander - und dann
  //      zeigt die App eine Nummer an, die es nie gab.
  const pkg = JSON.parse(await readFile(path.join(ROOT, 'package.json'), 'utf8'));
  const appPath = path.join(OUT, 'js/app.js');
  let app = await readFile(appPath, 'utf8');
  const VER_RE = /const APP_VERSION = '[^']*';/;
  if (!VER_RE.test(app)) throw new Error('APP_VERSION nicht gefunden - js/app.js geaendert?');
  app = app.replace(VER_RE, `const APP_VERSION = '${pkg.version}';`);
  await writeFile(appPath, app);

  // 3 · Baukennung
  const swPath = path.join(OUT, 'sw.js');
  let sw = await readFile(swPath, 'utf8');
  /* Baukennung einsetzen. Jede Auslieferung bekommt damit einen eigenen
     Zwischenspeicher; sw.js loescht beim Aktivieren alle anderen. Ohne das
     behielten Nutzerinnen mit installierter PWA ihre alte Fassung, solange
     die Versionsnummer gleich blieb - genau so ist es zwischen 6.6.0 und der
     Berichtigung passiert.

     Vorrang hat der Git-Commit: gleicher Stand, gleicher Name, also kein
     unnoetiger Neubau des Zwischenspeichers bei einem zweiten Lauf. Ohne Git
     (etwa in einem entpackten Archiv) tritt der Zeitstempel an seine Stelle. */
  let stamp = '';
  try {
    stamp = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString().trim();
  } catch { /* kein Git - dann eben die Uhr */ }
  if (!/^[0-9a-f]{7,40}$/.test(stamp)) {
    stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  }
  sw = sw.replace('__BUILD__', stamp);
  if (sw.includes('__BUILD__')) throw new Error('Baukennung nicht ersetzt - Muster in sw.js geaendert?');
  await writeFile(swPath, sw);

  // Gegenprobe: jede Datei, die der Service Worker vorhaelt, muss auch da
  // sein. Ein einziger 404 laesst die gesamte Installation scheitern.
  const listed = [...sw.matchAll(/'\.\/([^']*)'/g)].map(m => m[1]).filter(Boolean);
  const broken = [];
  for (const f of listed) {
    if (!(await exists(path.join(OUT, f)))) broken.push(f);
  }
  if (broken.length) throw new Error('Im Service Worker gelistet, aber nicht in dist/:\n  ' + broken.join('\n  '));

  console.log(`dist/ erzeugt, ${FILES.length + ICONS.length + 1} Dateien.`);
}

main().catch(err => { console.error('Build abgebrochen: ' + err.message); process.exit(1); });
