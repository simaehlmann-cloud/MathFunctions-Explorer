/* Vergleicht js/qr.js modulweise mit einer unabhaengigen Referenz.
   Aufruf:  node tools/qr-verify.mjs > /tmp/qr-js.json  */
import { readFileSync } from 'node:fs';
global.window = { devicePixelRatio: 1 };
global.MFE = global.window.MFE = {};
eval(readFileSync('js/qr.js', 'utf8').replace('window.MFE = window.MFE || {};', ''));

const cases = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const out = cases.map(({ text, ec }) => {
  const c = MFE.qr.encode(text, { ec });
  return c ? { version: c.version, mask: c.mask, n: c.n,
               rows: c.modules.map(r => Array.from(r).join('')) } : null;
});
console.log(JSON.stringify(out));
