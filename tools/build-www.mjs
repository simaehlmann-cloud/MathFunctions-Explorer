/**
 * tools/build-www.mjs
 * --------------------------------------------------------------------------
 * Sammelt die Web-Dateien in ./www - das ist der Ordner, den Capacitor in die
 * Android-App kopiert. Das Repo selbst bleibt flach, damit GitHub Pages
 * weiterhin direkt von der Wurzel ausliefern kann.
 *
 *     node tools/build-www.mjs          -> Vollversion
 *     node tools/build-www.mjs lite     -> Lite-Ausgabe
 *
 * Die Lite-Ausgabe entsteht durch genau drei Textersetzungen. Es gibt bewusst
 * keinen zweiten Quellcodezweig: zwei Zweige laufen erfahrungsgemaess
 * innerhalb weniger Wochen auseinander.
 *
 * Keine Abhaengigkeiten - laeuft mit blossem Node ab Version 18.
 */
import { cp, rm, mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'www');
const flavour = process.argv[2] === 'lite' ? 'lite' : 'full';

/** Was in die App gehoert. Alles andere (README, .github, tools, node_modules)
 *  bleibt aussen vor. */
const ASSETS = [
  'index.html',
  'style.css',
  'sw.js',
  'js',
  'icons'
];

async function main() {
  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });

  for (const asset of ASSETS) {
    const from = path.join(ROOT, asset);
    if (!existsSync(from)) throw new Error(`Fehlt: ${asset}`);
    await cp(from, path.join(OUT, asset), { recursive: true });
  }

  const manifestSrc = flavour === 'lite' ? 'manifest-lite.webmanifest' : 'manifest.webmanifest';
  await cp(path.join(ROOT, manifestSrc), path.join(OUT, 'manifest.webmanifest'));

  if (flavour === 'lite') {
    // 1) Lizenzweiche umstellen
    const lic = path.join(OUT, 'js/licence.js');
    let src = await readFile(lic, 'utf8');
    const before = src;
    src = src.replace(/const DEV_EDITION = '(pro|lite)';/, "const DEV_EDITION = 'lite';");
    if (src === before) throw new Error('DEV_EDITION nicht gefunden - js/licence.js geaendert?');
    await writeFile(lic, src);

    // 2) Icons der Lite-Ausgabe auf die Standardnamen ziehen, damit
    //    index.html und Manifest unveraendert bleiben koennen
    for (const size of ['192', '512']) {
      await cp(path.join(ROOT, `icons/icon-lite-${size}.png`), path.join(OUT, `icons/icon-${size}.png`));
    }
    await cp(path.join(ROOT, 'icons/icon-lite-maskable-512.png'),
             path.join(OUT, 'icons/icon-maskable-512.png'));

    // 3) Anwendungsnamen im Manifest anpassen (steht dort schon, aber die
    //    Datei heisst jetzt manifest.webmanifest - sicherheitshalber pruefen)
    const man = JSON.parse(await readFile(path.join(OUT, 'manifest.webmanifest'), 'utf8'));
    if (!man.name.includes('Lite')) {
      man.name += ' Lite';
      await writeFile(path.join(OUT, 'manifest.webmanifest'), JSON.stringify(man, null, 2));
    }
  }

  // Der Service Worker laedt in der App aus dem Cache derselben Herkunft.
  // Die Cache-Version bekommt die Ausgabe angehaengt, damit ein Wechsel
  // zwischen Lite und Voll nicht auf altem Bestand sitzen bleibt.
  const swPath = path.join(OUT, 'sw.js');
  let sw = await readFile(swPath, 'utf8');
  sw = sw.replace(/const CACHE = '([^']+)';/, (_, v) => `const CACHE = '${v}-${flavour}';`);
  // In www liegt nur ein Manifest, der zweite Eintrag wuerde 404 liefern und
  // die gesamte Installation des Service Workers scheitern lassen.
  sw = sw.replace(/\n\s*'\.\/manifest-lite\.webmanifest',/, '');
  sw = sw.replace(/,\n\s*'\.\/icons\/icon-lite-[^']+'/g, '');
  await writeFile(swPath, sw);

  console.log(`www/ erzeugt (${flavour}).`);
}

main().catch(err => { console.error(err.message); process.exit(1); });
