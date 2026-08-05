/* ==========================================================================
   tools/qr-selftest.mjs
   Haelt das QR-Modul auf dem Stand, der gegen eine unabhaengige Referenz
   geprueft wurde. Die Pruefsummen unten stammen aus genau diesem Lauf
   (tools/qr-verify.mjs). Aendert sich das Ergebnis, ist etwas kaputt.
   ========================================================================== */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
global.window = { devicePixelRatio: 1 };
global.MFE = global.window.MFE = {};
eval(readFileSync(new URL('../js/qr.js', import.meta.url), 'utf8')
  .replace('window.MFE = window.MFE || {};', ''));

const GOLD = JSON.parse(readFileSync(new URL('qr-gold.json', import.meta.url), 'utf8'));
let bad = 0;
const hash = (c) => createHash('sha256')
  .update(c.modules.map(r => Array.from(r).join('')).join('\n')).digest('hex').slice(0, 16);

for (const g of GOLD) {
  const c = MFE.qr.encode(g.text, { ec: g.ec });
  if (!c) { console.error(`  kein Code fuer "${g.text.slice(0, 20)}..."`); bad++; continue; }
  if (c.version !== g.version || c.mask !== g.mask || hash(c) !== g.hash) {
    console.error(`  Abweichung: V${c.version}/${g.version} Maske ${c.mask}/${g.mask} ${hash(c)}/${g.hash}`);
    bad++;
  }
}

// Grenzfaelle
const edge = [
  [MFE.qr.encode('', { ec: 'M' }) === null, 'leerer Text liefert null'],
  [MFE.qr.encode(null) === null, 'null liefert null'],
  [MFE.qr.encode('x'.repeat(3000), { ec: 'L' }) === null, 'zu langer Text liefert null statt Absturz'],
  [MFE.qr.encode('abc', { ec: 'Q' })?.ec === 'Q', 'Stufe Q wird auch wirklich verwendet'],
  [MFE.qr.encode('abc', { ec: 'H' })?.ec === 'H', 'Stufe H wird auch wirklich verwendet'],
  // Frueher stand hier die Erwartung, dass Q auf M zurueckfaellt. Damit war
  // ein Fehler als Sollverhalten festgeschrieben; Q und H waren gar nicht
  // implementiert. Jetzt wird das Gegenteil geprueft.
  [MFE.qr.encode('abc', { ec: 'Z' })?.ec === 'M', 'nur eine WIRKLICH unbekannte Stufe faellt auf M zurueck'],
  [MFE.qr.encode('x'.repeat(20), { ec: 'H' }).version
     > MFE.qr.encode('x'.repeat(20), { ec: 'L' }).version, 'H braucht mehr Platz als L'],
  [MFE.qr.encode('äöü')?.n === 21, 'Umlaute werden als UTF-8 kodiert']
];
for (const [ok, what] of edge) if (!ok) { console.error('  ' + what); bad++; }

console.log(bad ? `QR: ${bad} Fehler` : `QR: ${GOLD.length} Referenzcodes und ${edge.length} Grenzfaelle in Ordnung.`);
process.exit(bad ? 1 : 0);
