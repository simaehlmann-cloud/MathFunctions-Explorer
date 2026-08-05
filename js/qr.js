/* ==========================================================================
   qr.js  ·  QR-Code erzeugen
   --------------------------------------------------------------------------
   Warum ueberhaupt: Ein Quiz-Link ist mehrere hundert Zeichen lang. Im
   Klassenraum tippt den niemand ab. Ein QR-Code an der Tafel ist der
   Unterschied zwischen "funktioniert" und "funktioniert nicht".

   Umfang: Byte-Modus (UTF-8), Fehlerkorrektur L und M, Versionen 1 bis 40,
   alle acht Masken mit Bewertung nach ISO/IEC 18004. Keine Abhaengigkeit,
   kein Netzzugriff - der Code entsteht auf dem Geraet.

   Pruefstand: tools/qr-verify.mjs vergleicht ganze Modulmatrizen mit einer
   unabhaengigen Referenz. Ergebnis ueber alle 40 Versionen und beide
   Fehlerkorrekturstufen: bei gleicher Maske stimmen alle Matrizen modulweise
   ueberein. Die Blocktabellen unten sind aus dieser Referenz abgeleitet und
   nicht von Hand getippt.

   Eine bewusste Abweichung: Bei der Maskenwahl bewertet diese Umsetzung das
   Symbol MIT eingetragener Formatinformation, so wie es ISO/IEC 18004
   verlangt. Manche verbreitete Bibliothek bewertet ohne sie und waehlt
   deshalb gelegentlich eine andere Maske. Beide Ergebnisse sind gueltige,
   lesbare Codes - die Maske beeinflusst nur, wie gleichmaessig das Muster
   aussieht, nicht den Inhalt.

   Aufbau je Version: [ecCodewordsProBlock, [blockAnzahl, datenCodewords], ...]
   ========================================================================== */
'use strict';
window.MFE = window.MFE || {};

MFE.qr = (() => {

const RS_BLOCKS = {
  L: [[7,[1,19]],[10,[1,34]],[15,[1,55]],[20,[1,80]],[26,[1,108]],[18,[2,68]],[20,[2,78]],[24,[2,97]],[30,[2,116]],[18,[2,68],[2,69]],[20,[4,81]],[24,[2,92],[2,93]],[26,[4,107]],[30,[3,115],[1,116]],[22,[5,87],[1,88]],[24,[5,98],[1,99]],[28,[1,107],[5,108]],[30,[5,120],[1,121]],[28,[3,113],[4,114]],[28,[3,107],[5,108]],[28,[4,116],[4,117]],[28,[2,111],[7,112]],[30,[4,121],[5,122]],[30,[6,117],[4,118]],[26,[8,106],[4,107]],[28,[10,114],[2,115]],[30,[8,122],[4,123]],[30,[3,117],[10,118]],[30,[7,116],[7,117]],[30,[5,115],[10,116]],[30,[13,115],[3,116]],[30,[17,115]],[30,[17,115],[1,116]],[30,[13,115],[6,116]],[30,[12,121],[7,122]],[30,[6,121],[14,122]],[30,[17,122],[4,123]],[30,[4,122],[18,123]],[30,[20,117],[4,118]],[30,[19,118],[6,119]]],
  M: [[10,[1,16]],[16,[1,28]],[26,[1,44]],[18,[2,32]],[24,[2,43]],[16,[4,27]],[18,[4,31]],[22,[2,38],[2,39]],[22,[3,36],[2,37]],[26,[4,43],[1,44]],[30,[1,50],[4,51]],[22,[6,36],[2,37]],[22,[8,37],[1,38]],[24,[4,40],[5,41]],[24,[5,41],[5,42]],[28,[7,45],[3,46]],[28,[10,46],[1,47]],[26,[9,43],[4,44]],[26,[3,44],[11,45]],[26,[3,41],[13,42]],[26,[17,42]],[28,[17,46]],[28,[4,47],[14,48]],[28,[6,45],[14,46]],[28,[8,47],[13,48]],[28,[19,46],[4,47]],[28,[22,45],[3,46]],[28,[3,45],[23,46]],[28,[21,45],[7,46]],[28,[19,47],[10,48]],[28,[2,46],[29,47]],[28,[10,46],[23,47]],[28,[14,46],[21,47]],[28,[14,46],[23,47]],[28,[12,47],[26,48]],[28,[6,47],[34,48]],[28,[29,46],[14,47]],[28,[13,46],[32,47]],[28,[40,47],[7,48]],[28,[18,47],[31,48]]],
  Q: [[13,[1,13]],[22,[1,22]],[18,[2,17]],[26,[2,24]],[18,[2,15],[2,16]],[24,[4,19]],[18,[2,14],[4,15]],[22,[4,18],[2,19]],[20,[4,16],[4,17]],[24,[6,19],[2,20]],[28,[4,22],[4,23]],[26,[4,20],[6,21]],[24,[8,20],[4,21]],[20,[11,16],[5,17]],[30,[5,24],[7,25]],[24,[15,19],[2,20]],[28,[1,22],[15,23]],[28,[17,22],[1,23]],[26,[17,21],[4,22]],[30,[15,24],[5,25]],[28,[17,22],[6,23]],[30,[7,24],[16,25]],[30,[11,24],[14,25]],[30,[11,24],[16,25]],[30,[7,24],[22,25]],[28,[28,22],[6,23]],[30,[8,23],[26,24]],[30,[4,24],[31,25]],[30,[1,23],[37,24]],[30,[15,24],[25,25]],[30,[42,24],[1,25]],[30,[10,24],[35,25]],[30,[29,24],[19,25]],[30,[44,24],[7,25]],[30,[39,24],[14,25]],[30,[46,24],[10,25]],[30,[49,24],[10,25]],[30,[48,24],[14,25]],[30,[43,24],[22,25]],[30,[34,24],[34,25]]],
  H: [[17,[1,9]],[28,[1,16]],[22,[2,13]],[16,[4,9]],[22,[2,11],[2,12]],[28,[4,15]],[26,[4,13],[1,14]],[26,[4,14],[2,15]],[24,[4,12],[4,13]],[28,[6,15],[2,16]],[24,[3,12],[8,13]],[28,[7,14],[4,15]],[22,[12,11],[4,12]],[24,[11,12],[5,13]],[24,[11,12],[7,13]],[30,[3,15],[13,16]],[28,[2,14],[17,15]],[28,[2,14],[19,15]],[26,[9,13],[16,14]],[28,[15,15],[10,16]],[30,[19,16],[6,17]],[24,[34,13]],[30,[16,15],[14,16]],[30,[30,16],[2,17]],[30,[22,15],[13,16]],[30,[33,16],[4,17]],[30,[12,15],[28,16]],[30,[11,15],[31,16]],[30,[19,15],[26,16]],[30,[23,15],[25,16]],[30,[23,15],[28,16]],[30,[19,15],[35,16]],[30,[11,15],[46,16]],[30,[59,16],[1,17]],[30,[22,15],[41,16]],[30,[2,15],[64,16]],[30,[24,15],[46,16]],[30,[42,15],[32,16]],[30,[10,15],[67,16]],[30,[20,15],[61,16]]]
};

/* Ausrichtungsmuster: Mittelkoordinaten je Version (Version 1 hat keine). */
const ALIGN = [
  [], [], [6,18], [6,22], [6,26], [6,30], [6,34],
  [6,22,38], [6,24,42], [6,26,46], [6,28,50], [6,30,54], [6,32,58], [6,34,62],
  [6,26,46,66], [6,26,48,70], [6,26,50,74], [6,30,54,78], [6,30,56,82], [6,30,58,86], [6,34,62,90],
  [6,28,50,72,94], [6,26,50,74,98], [6,30,54,78,102], [6,28,54,80,106], [6,32,58,84,110],
  [6,30,58,86,114], [6,34,62,90,118],
  [6,26,50,74,98,122], [6,30,54,78,102,126], [6,26,52,78,104,130], [6,30,56,82,108,134],
  [6,34,60,86,112,138], [6,30,58,86,114,142], [6,34,62,90,118,146],
  [6,30,54,78,102,126,150], [6,24,50,76,102,128,154], [6,28,54,80,106,132,158],
  [6,32,58,84,110,136,162], [6,26,54,82,110,138,166], [6,30,58,86,114,142,170]
];

/* Vorberechnete BCH-Werte fuer die Versionsinformation (Version 7 bis 40). */
const VERSION_BITS = [
  0x07C94,0x085BC,0x09A99,0x0A4D3,0x0BBF6,0x0C762,0x0D847,0x0E60D,0x0F928,0x10B78,
  0x1145D,0x12A17,0x13532,0x149A6,0x15683,0x168C9,0x177EC,0x18EC4,0x191E1,0x1AFAB,
  0x1B08E,0x1CC1A,0x1D33F,0x1ED75,0x1F250,0x209D5,0x216F0,0x228BA,0x2379F,0x24B0B,
  0x2542E,0x26A64,0x27541,0x28C69
];

/* Formatinformation. Die Reihenfolge ist NICHT L,M,Q,H - die Norm ordnet
   M=00, L=01, H=10, Q=11 zu. Ein Zahlendreher hier macht jeden Code
   unlesbar, ohne dass die Matrix falsch aussieht. */
const EC_BITS = { M: 0b00, L: 0b01, H: 0b10, Q: 0b11 };

/* --- Galois-Feld GF(256), Generator 0x11d --- */
const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x; LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();

const gmul = (a, b) => (a === 0 || b === 0) ? 0 : EXP[LOG[a] + LOG[b]];

/** Generatorpolynom vom Grad n. */
function rsGenerator(n) {
  let poly = [1];
  for (let i = 0; i < n; i++) {
    const next = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= gmul(poly[j], EXP[i]);
      next[j + 1] ^= poly[j];
    }
    poly = next;
  }
  // Der Aufbau oben liefert die Koeffizienten in aufsteigender Gradfolge
  // (poly[0] = konstantes Glied). Die Division in rsEncode() erwartet den
  // Leitkoeffizienten an Position 0.
  return poly.reverse();
}

/** Fehlerkorrektur-Codewoerter zu einem Datenblock. */
function rsEncode(data, ecLen) {
  const gen = rsGenerator(ecLen);
  const res = new Uint8Array(data.length + ecLen);
  res.set(data);
  for (let i = 0; i < data.length; i++) {
    const factor = res[i];
    if (factor === 0) continue;
    for (let j = 0; j < gen.length; j++) res[i + j] ^= gmul(gen[j], factor);
  }
  return Array.from(res.slice(data.length));
}

/* --- Bitpuffer --- */
class Bits {
  constructor() { this.arr = []; }
  put(value, len) { for (let i = len - 1; i >= 0; i--) this.arr.push((value >>> i) & 1); }
  get length() { return this.arr.length; }
}

const capacityBits = (ver, ec) => {
  const row = RS_BLOCKS[ec][ver - 1];
  let n = 0;
  for (let i = 1; i < row.length; i++) n += row[i][0] * row[i][1];
  return n * 8;
};

const charCountBits = (ver) => (ver <= 9 ? 8 : 16);

/* --- Bitstrom aufbauen --- */
function buildData(bytes, ver, ec) {
  const bits = new Bits();
  bits.put(0b0100, 4);                       // Byte-Modus
  bits.put(bytes.length, charCountBits(ver));
  for (const b of bytes) bits.put(b, 8);

  const cap = capacityBits(ver, ec);
  if (bits.length > cap) return null;

  for (let i = 0; i < 4 && bits.length < cap; i++) bits.arr.push(0);   // Abschluss
  while (bits.length % 8) bits.arr.push(0);
  const codewords = [];
  for (let i = 0; i < bits.length; i += 8) {
    let v = 0;
    for (let j = 0; j < 8; j++) v = (v << 1) | bits.arr[i + j];
    codewords.push(v);
  }
  const total = cap / 8;
  const PAD = [0xEC, 0x11];
  for (let i = 0; codewords.length < total; i++) codewords.push(PAD[i % 2]);
  return codewords;
}

/** Datenbloecke bilden, Fehlerkorrektur rechnen, beides verschraenken. */
function interleave(codewords, ver, ec) {
  const row = RS_BLOCKS[ec][ver - 1];
  const ecLen = row[0];
  const blocks = [];
  let pos = 0;
  for (let i = 1; i < row.length; i++) {
    const [count, dataLen] = row[i];
    for (let k = 0; k < count; k++) {
      const data = codewords.slice(pos, pos + dataLen);
      pos += dataLen;
      blocks.push({ data, ec: rsEncode(data, ecLen) });
    }
  }
  const out = [];
  const maxData = Math.max(...blocks.map(b => b.data.length));
  for (let i = 0; i < maxData; i++) for (const b of blocks) if (i < b.data.length) out.push(b.data[i]);
  for (let i = 0; i < ecLen; i++) for (const b of blocks) out.push(b.ec[i]);
  return out;
}

/* --- Matrix --- */
const size = (ver) => ver * 4 + 17;

function emptyMatrix(ver) {
  const n = size(ver);
  return {
    n,
    m: Array.from({ length: n }, () => new Int8Array(n).fill(-1)),   // -1 = frei
    reserved: Array.from({ length: n }, () => new Uint8Array(n))
  };
}

function setF(mx, r, c, v) { mx.m[r][c] = v; mx.reserved[r][c] = 1; }

function placeFinder(mx, r0, c0) {
  for (let r = -1; r <= 7; r++) {
    for (let c = -1; c <= 7; c++) {
      const rr = r0 + r, cc = c0 + c;
      if (rr < 0 || cc < 0 || rr >= mx.n || cc >= mx.n) continue;
      const inRing = (r >= 0 && r <= 6 && (c === 0 || c === 6)) ||
                     (c >= 0 && c <= 6 && (r === 0 || r === 6));
      const inCore = r >= 2 && r <= 4 && c >= 2 && c <= 4;
      setF(mx, rr, cc, (inRing || inCore) ? 1 : 0);
    }
  }
}

function placeFunctionPatterns(mx, ver) {
  const n = mx.n;
  placeFinder(mx, 0, 0);
  placeFinder(mx, 0, n - 7);
  placeFinder(mx, n - 7, 0);

  for (let i = 8; i < n - 8; i++) {
    const v = i % 2 === 0 ? 1 : 0;
    setF(mx, 6, i, v);
    setF(mx, i, 6, v);
  }

  for (const r of ALIGN[ver]) {
    for (const c of ALIGN[ver]) {
      // Nicht ueber die Suchmuster legen
      if ((r <= 8 && c <= 8) || (r <= 8 && c >= n - 9) || (r >= n - 9 && c <= 8)) continue;
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const ring = Math.max(Math.abs(dr), Math.abs(dc));
          setF(mx, r + dr, c + dc, (ring === 1) ? 0 : 1);
        }
      }
    }
  }

  setF(mx, n - 8, 8, 1);                       // immer dunkles Modul

  // Plaetze der Formatinformation freihalten
  for (let i = 0; i < 9; i++) {
    if (mx.reserved[8][i] === 0) setF(mx, 8, i, 0);
    if (mx.reserved[i][8] === 0) setF(mx, i, 8, 0);
  }
  for (let i = 0; i < 8; i++) {
    if (mx.reserved[8][n - 1 - i] === 0) setF(mx, 8, n - 1 - i, 0);
    if (mx.reserved[n - 1 - i][8] === 0) setF(mx, n - 1 - i, 8, 0);
  }

  if (ver >= 7) {
    const bits = VERSION_BITS[ver - 7];
    for (let i = 0; i < 18; i++) {
      const bit = (bits >> i) & 1;
      setF(mx, Math.floor(i / 3), n - 11 + (i % 3), bit);
      setF(mx, n - 11 + (i % 3), Math.floor(i / 3), bit);
    }
  }
}

/** Daten im Zickzack von rechts unten nach oben einfuellen. */
function placeData(mx, bytes) {
  const n = mx.n;
  let bitIndex = 0;
  const nextBit = () => {
    const byteI = bitIndex >> 3;
    if (byteI >= bytes.length) { bitIndex++; return 0; }   // Restbits
    const b = (bytes[byteI] >> (7 - (bitIndex & 7))) & 1;
    bitIndex++;
    return b;
  };
  let upward = true;
  for (let col = n - 1; col > 0; col -= 2) {
    if (col === 6) col--;                     // Spalte 6 ist Taktmuster
    for (let i = 0; i < n; i++) {
      const row = upward ? n - 1 - i : i;
      for (const c of [col, col - 1]) {
        if (mx.reserved[row][c]) continue;
        mx.m[row][c] = nextBit();
      }
    }
    upward = !upward;
  }
}

const MASKS = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (_, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0
];

function applyMask(mx, maskIndex) {
  const fn = MASKS[maskIndex];
  const out = mx.m.map(row => Int8Array.from(row));
  for (let r = 0; r < mx.n; r++) {
    for (let c = 0; c < mx.n; c++) {
      if (mx.reserved[r][c]) continue;
      if (fn(r, c)) out[r][c] ^= 1;
    }
  }
  return out;
}

/** Formatinformation: 5 Datenbits, BCH(15,5), danach XOR 0x5412. */
function formatBits(ec, maskIndex) {
  const data = (EC_BITS[ec] << 3) | maskIndex;
  let v = data << 10;
  for (let i = 4; i >= 0; i--) if ((v >> (i + 10)) & 1) v ^= 0b10100110111 << i;
  return ((data << 10) | v) ^ 0b101010000010010;
}

function writeFormat(m, n, ec, maskIndex) {
  const bits = formatBits(ec, maskIndex);
  const get = (i) => (bits >> i) & 1;        // i = 0 ist das niederwertigste Bit

  /* Die beiden Kopien laufen gegenlaeufig - das ist keine Schlamperei der
     Norm, sondern Absicht: so bleibt die Formatinformation lesbar, wenn eine
     Ecke des Codes beschaedigt ist. Die Belegung unten ist gegen eine
     unabhaengige Referenz geprueft (tools/qr-verify.mjs). */

  // Kopie 1: waagerecht links von der oberen linken Ecke, dann senkrecht
  for (let c = 0; c <= 5; c++) m[8][c] = get(14 - c);
  m[8][7] = get(8);
  m[8][8] = get(7);
  m[7][8] = get(6);
  for (let r = 0; r <= 5; r++) m[r][8] = get(r);

  // Kopie 2: waagerecht oben rechts, senkrecht unten links
  for (let i = 0; i <= 7; i++) m[8][n - 1 - i] = get(i);
  for (let i = 8; i <= 14; i++) m[n - 15 + i][8] = get(i);

  m[n - 8][8] = 1;                            // dunkles Modul, immer gesetzt
}

/* --- Bewertung der Masken nach ISO/IEC 18004, Abschnitt 8.8.2 --- */
function penalty(m, n) {
  let score = 0;

  // Regel 1: fuenf oder mehr gleiche Module in Folge
  for (let i = 0; i < n; i++) {
    for (const horizontal of [true, false]) {
      let run = 1;
      for (let j = 1; j < n; j++) {
        const a = horizontal ? m[i][j] : m[j][i];
        const b = horizontal ? m[i][j - 1] : m[j - 1][i];
        if (a === b) run++;
        else { if (run >= 5) score += 3 + (run - 5); run = 1; }
      }
      if (run >= 5) score += 3 + (run - 5);
    }
  }

  // Regel 2: gleichfarbige 2x2-Bloecke
  for (let r = 0; r < n - 1; r++) {
    for (let c = 0; c < n - 1; c++) {
      const v = m[r][c];
      if (v === m[r][c + 1] && v === m[r + 1][c] && v === m[r + 1][c + 1]) score += 3;
    }
  }

  // Regel 3: Muster 1:1:3:1:1 mit vier hellen Modulen daneben
  const PAT_A = [1,0,1,1,1,0,1,0,0,0,0];
  const PAT_B = [0,0,0,0,1,0,1,1,1,0,1];
  for (let i = 0; i < n; i++) {
    for (let j = 0; j + 11 <= n; j++) {
      for (const horizontal of [true, false]) {
        let a = true, b = true;
        for (let k = 0; k < 11; k++) {
          const v = horizontal ? m[i][j + k] : m[j + k][i];
          if (v !== PAT_A[k]) a = false;
          if (v !== PAT_B[k]) b = false;
          if (!a && !b) break;
        }
        if (a) score += 40;
        if (b) score += 40;
      }
    }
  }

  // Regel 4: Abweichung vom Verhaeltnis 50 Prozent dunkel
  let dark = 0;
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) dark += m[r][c];
  const percent = (dark * 100) / (n * n);
  score += Math.floor(Math.abs(percent - 50) / 5) * 10;
  return score;
}

/**
 * Erzeugt die Modulmatrix zu einem Text.
 * @returns {{ n, modules, version, ec, mask }} oder null, wenn der Text
 *          selbst in Version 40 nicht hineinpasst.
 */
function encode(text, { ec = 'M', minVersion = 1 } = {}) {
  if (typeof text !== 'string' || !text.length) return null;
  if (!RS_BLOCKS[ec]) {
    // Frueher fiel eine unbekannte Stufe stillschweigend auf M zurueck. Der
    // Aufrufer bekam dann einen Code mit anderer Fehlerkorrektur als
    // angefordert - ohne jeden Hinweis.
    console.warn(`[qr] Unbekannte Fehlerkorrekturstufe "${ec}", verwende M.`);
    ec = 'M';
  }
  const bytes = Array.from(new TextEncoder().encode(text));

  let ver = 0, codewords = null;
  for (let v = Math.max(1, minVersion); v <= 40; v++) {
    const cw = buildData(bytes, v, ec);
    if (cw) { ver = v; codewords = cw; break; }
  }
  if (!ver) return null;

  const final = interleave(codewords, ver, ec);
  const mx = emptyMatrix(ver);
  placeFunctionPatterns(mx, ver);
  placeData(mx, final);

  let best = null;
  for (let mask = 0; mask < 8; mask++) {
    const m = applyMask(mx, mask);
    writeFormat(m, mx.n, ec, mask);
    const p = penalty(m, mx.n);
    if (!best || p < best.penalty) best = { m, mask, penalty: p };
  }
  return { n: mx.n, modules: best.m, version: ver, ec, mask: best.mask };
}

/**
 * Zeichnet den Code in ein Canvas. Ruhezone von vier Modulen ist Pflicht -
 * ohne sie erkennen viele Lesegeraete gar nichts.
 */
function draw(canvas, text, { ec = 'M', quiet = 4, dark = '#000', light = '#fff' } = {}) {
  const code = encode(text, { ec });
  if (!code) return null;
  const total = code.n + quiet * 2;
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const cssSize = canvas.clientWidth || 240;
  // Ganzzahlige Modulgroesse, sonst entstehen unscharfe Kanten.
  const px = Math.max(1, Math.floor((cssSize * dpr) / total));
  const side = px * total;
  canvas.width = side; canvas.height = side;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = light; ctx.fillRect(0, 0, side, side);
  ctx.fillStyle = dark;
  for (let r = 0; r < code.n; r++) {
    for (let c = 0; c < code.n; c++) {
      if (code.modules[r][c]) ctx.fillRect((c + quiet) * px, (r + quiet) * px, px, px);
    }
  }
  return code;
}

return { encode, draw, capacityBits, RS_BLOCKS };
})();
