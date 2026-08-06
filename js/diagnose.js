/* ==========================================================================
   diagnose.js  ·  Fehlvorstellungen und Fehleranalyse
   --------------------------------------------------------------------------
   Das hier ist der eigentliche Unterschied zu einem Funktionenplotter. Ein
   Plotter zeigt, was man eingibt, und beurteilt nichts. Diese Datei weiss,
   WELCHEN Denkfehler jemand gemacht hat, und kann ihn benennen.

   Zwei Teile:

   1. MISCONCEPTIONS - ein Katalog klassischer Fehlvorstellungen. Jeder
      Eintrag baut eine Aufgabe, deren falsche Antworten nicht zufaellig
      sind, sondern GENAU dem jeweiligen Denkfehler entsprechen. Wer eine
      davon waehlt, bekommt nicht "falsch", sondern die Erklaerung, was er
      sich vermutlich gedacht hat.

   2. analyseBuild() - die Auswertung im Nachbau-Modus. Statt "c zu niedrig"
      erkennt sie Vorzeichenfehler, vertauschte Parameter, verdoppelte oder
      halbierte Werte und die Verschieberichtung.

   Bewusst frei von DOM und Sprache: hier entstehen nur Kennungen und Zahlen,
   die Texte stehen in i18n.js. So laesst sich die gesamte Datei ohne Browser
   pruefen (tools/diagnose-test.mjs).
   ========================================================================== */
'use strict';
window.MFE = window.MFE || {};

MFE.diagnose = (() => {
const { FUNCTIONS, tolerance, mfmt } = MFE.math;

const r = (v, n = 4) => Math.round(v * 10 ** n) / 10 ** n;
const near = (a, b, tol) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tol;

/* ==========================================================================
   1 · KATALOG DER FEHLVORSTELLUNGEN
   --------------------------------------------------------------------------
   Jeder Eintrag liefert:
     id      Kennung, zugleich Schluessel fuer die Erklaerung in i18n.js
     forms   fuer welche Darstellungsformen er gilt
     needs   optionale Bedingung an die Parameterwerte (damit die Falle
             ueberhaupt zuschnappen KANN - bei b = 0 gibt es keine
             Verwechslung von b und c)
     make    baut aus den Werten die Frage und die Antworten

   make() gibt zurueck:
     { promptKey, promptVars, answers: [{ key, label, correct, mis }] }
   `mis` benennt die Fehlvorstellung hinter einer falschen Antwort - genau
   die wird der Nutzerin anschliessend erklaert.
   ========================================================================== */

/** Antworten mischen, aber immer dieselbe Menge behalten. */
function shuffle(list) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Doppelte Antworten entfernen - zwei gleich beschriftete Knoepfe waeren
 *  nicht nur haesslich, sondern unbeantwortbar. */
function unique(answers) {
  const seen = new Set();
  return answers.filter(a => {
    if (seen.has(a.label)) return false;
    seen.add(a.label);
    return true;
  });
}

const pt = (x, y) => `(${mfmt(x)} | ${mfmt(y)})`;

const MISCONCEPTIONS = [
  /* ---- Quadratisch, Normalform: b fuer den y-Achsenabschnitt halten ---- */
  {
    id: 'quad.bIsYint',
    forms: ['quad_standard'],
    needs: (v) => Math.abs(v.b - v.c) > 0.4 && Math.abs(v.b) > 0.2,
    make: (v) => ({
      promptKey: 'mis.q.yint',
      answers: unique([
        { label: pt(0, v.c), correct: true },
        { label: pt(0, v.b), mis: 'quad.bIsYint' },
        { label: pt(0, v.a), mis: 'quad.aIsYint' },
        { label: pt(v.c, 0), mis: 'general.axesSwapped' }
      ])
    })
  },

  /* ---- Scheitelpunktform: Vorzeichen von d ---- */
  {
    id: 'quad.vertexSign',
    forms: ['quad_vertex'],
    needs: (v) => Math.abs(v.d) > 0.4,
    make: (v) => ({
      promptKey: 'mis.q.vertex',
      answers: unique([
        { label: pt(v.d, v.e), correct: true },
        { label: pt(-v.d, v.e), mis: 'quad.vertexSign' },
        { label: pt(v.e, v.d), mis: 'general.axesSwapped' },
        { label: pt(-v.d, -v.e), mis: 'quad.vertexBothSigns' }
      ])
    })
  },

  /* ---- Linear: m und b vertauschen ---- */
  {
    id: 'linear.swapped',
    forms: ['linear'],
    needs: (v) => Math.abs(v.m - v.b) > 0.4 && Math.abs(v.m) > 0.2,
    make: (v) => ({
      promptKey: 'mis.lin.equation',
      answers: unique([
        { label: `f(x) = ${mfmt(v.m)}\u00b7x + ${mfmt(v.b)}`, correct: true },
        { label: `f(x) = ${mfmt(v.b)}\u00b7x + ${mfmt(v.m)}`, mis: 'linear.swapped' },
        { label: `f(x) = ${mfmt(-v.m)}\u00b7x + ${mfmt(v.b)}`, mis: 'linear.slopeSign' },
        { label: `f(x) = ${mfmt(v.m)}\u00b7x \u2212 ${mfmt(Math.abs(v.b))}`, mis: 'linear.interceptSign' }
      ])
    })
  },

  /* ---- Linear: "steiler" mit negativer Steigung ---- */
  {
    id: 'linear.steeperNegative',
    forms: ['linear'],
    needs: (v) => v.m < -0.6,
    make: (v) => {
      const flat = r(v.m / 2);
      return {
        promptKey: 'mis.lin.steeper',
        promptVars: { a: mfmt(v.m), b: mfmt(flat) },
        answers: unique([
          { label: `f(x) = ${mfmt(v.m)}\u00b7x`, correct: true },
          { label: `f(x) = ${mfmt(flat)}\u00b7x`, mis: 'linear.steeperNegative' },
          { label: 'mis.answer.equal', mis: 'linear.slopeMagnitude', raw: true }
        ])
      };
    }
  },

  /* ---- Exponentiell: a ist nicht der y-Achsenabschnitt, wenn c da ist ---- */
  {
    id: 'exp.startForgetsC',
    forms: ['exponential'],
    needs: (v) => Math.abs(v.c) > 0.4,
    make: (v) => ({
      promptKey: 'mis.exp.start',
      answers: unique([
        { label: mfmt(v.a + v.c), correct: true },
        { label: mfmt(v.a), mis: 'exp.startForgetsC' },
        { label: mfmt(v.b + v.c), mis: 'exp.baseIsStart' },
        { label: mfmt(v.a * v.b + v.c), mis: 'exp.oneStepAhead' }
      ])
    })
  },

  /* ---- Exponentiell: Wachstum linear gedacht ---- */
  {
    id: 'exp.linearThinking',
    forms: ['exponential'],
    needs: (v) => v.b > 1.2 && Math.abs(v.a) > 0.4,
    make: (v) => {
      const f = (x) => v.a * v.b ** x + v.c;
      return {
        promptKey: 'mis.exp.doubling',
        promptVars: { x: '2', y: mfmt(r(f(2))) },
        answers: unique([
          { label: mfmt(r(f(4))), correct: true },
          { label: mfmt(r(2 * f(2))), mis: 'exp.linearThinking' },
          { label: mfmt(r(f(2) + (f(2) - f(0)))), mis: 'exp.constantDifference' }
        ])
      };
    }
  },

  /* ---- Sinus: Periode mit b verwechseln ---- */
  {
    id: 'sin.periodIsB',
    forms: ['sinus'],
    needs: (v) => Math.abs(v.b - 1) > 0.2 && v.b > 0,
    make: (v) => ({
      promptKey: 'mis.sin.period',
      answers: unique([
        { label: mfmt(r(2 * Math.PI / v.b)), correct: true },
        { label: mfmt(v.b), mis: 'sin.periodIsB' },
        { label: mfmt(r(2 * Math.PI * v.b)), mis: 'sin.periodTimesB' },
        { label: mfmt(r(2 * Math.PI)), mis: 'sin.periodAlways2Pi' }
      ])
    })
  },

  /* ---- Sinus: Verschieberichtung bei (x \u2212 c) ---- */
  {
    id: 'sin.shiftDirection',
    forms: ['sinus'],
    needs: (v) => Math.abs(v.c) > 0.3,
    make: (v) => ({
      promptKey: 'mis.sin.shift',
      promptVars: { c: mfmt(v.c) },
      answers: unique([
        { label: v.c > 0 ? 'mis.answer.right' : 'mis.answer.left', correct: true, raw: true },
        { label: v.c > 0 ? 'mis.answer.left' : 'mis.answer.right', mis: 'shift.direction', raw: true },
        { label: 'mis.answer.up', mis: 'shift.axisConfusion', raw: true }
      ])
    })
  },

  /* ---- Wurzel und Logarithmus: Definitionsbereich ---- */
  {
    id: 'domain.ignored',
    forms: ['root', 'logarithm'],
    needs: () => true,
    make: (v, form) => {
      const start = v.b;
      return {
        promptKey: form === 'root' ? 'mis.root.domain' : 'mis.log.domain',
        promptVars: { b: mfmt(start) },
        answers: unique([
          { label: form === 'root' ? `x \u2265 ${mfmt(start)}` : `x > ${mfmt(start)}`, correct: true },
          { label: `x \u2264 ${mfmt(start)}`, mis: 'domain.reversed' },
          { label: 'mis.answer.allX', mis: 'domain.ignored', raw: true }
        ])
      };
    }
  },

  /* ---- Gebrochenrational: Polstelle als Nullstelle ---- */
  {
    id: 'rational.poleIsRoot',
    forms: ['rational'],
    needs: (v) => Math.abs(v.a) > 0.2,
    make: (v) => ({
      promptKey: 'mis.rat.pole',
      promptVars: { b: mfmt(v.b) },
      answers: unique([
        { label: 'mis.answer.noValue', correct: true, raw: true },
        { label: mfmt(0), mis: 'rational.poleIsRoot' },
        { label: mfmt(v.c), mis: 'rational.poleIsAsymptote' }
      ])
    })
  },

  /* ---- Betrag: Knickstelle ---- */
  {
    id: 'abs.kinkSign',
    forms: ['absolute'],
    needs: (v) => Math.abs(v.b) > 0.4,
    make: (v) => ({
      promptKey: 'mis.abs.kink',
      answers: unique([
        { label: pt(v.b, v.c), correct: true },
        { label: pt(-v.b, v.c), mis: 'quad.vertexSign' },
        { label: pt(0, v.c), mis: 'abs.kinkAtZero' }
      ])
    })
  }
];

/** Welche Fehlvorstellungen passen zu dieser Darstellungsform? */
const forForm = (form) => MISCONCEPTIONS.filter(m => m.forms.includes(form));

/**
 * Baut eine Fallenaufgabe. Gibt null zurueck, wenn zu dieser Form keine
 * passende Falle existiert oder die Werte sie nicht zuschnappen lassen -
 * der Aufrufer wuerfelt dann neue Werte.
 */
function makeTrap(form, values) {
  const candidates = forForm(form).filter(m => {
    try { return m.needs(values, form); } catch { return false; }
  });
  if (!candidates.length) return null;
  const m = candidates[Math.floor(Math.random() * candidates.length)];

  let built;
  try { built = m.make(values, form); } catch { return null; }
  if (!built?.answers?.length) return null;

  const answers = built.answers.filter(a => a.label);
  if (!answers.some(a => a.correct)) return null;
  // Ohne mindestens eine falsche Antwort waere es keine Aufgabe.
  if (!answers.some(a => !a.correct)) return null;

  return {
    trap: m.id,
    form,
    values: { ...values },
    promptKey: built.promptKey,
    promptVars: built.promptVars ?? {},
    answers: shuffle(answers)
  };
}

/* ==========================================================================
   2 · FEHLERANALYSE BEIM NACHBAUEN
   --------------------------------------------------------------------------
   Reihenfolge ist Absicht: erst die Befunde, die eine VORSTELLUNG betreffen
   (Vorzeichen, Richtung, Vertauschung), dann die rein numerischen. Wer d und
   e vertauscht hat, dem hilft "d zu hoch, e zu niedrig" nicht weiter.
   ========================================================================== */

/**
 * @param {string} form
 * @param {object} target   die gesuchten Werte
 * @param {object} attempt  die eingestellten Werte
 * @returns {{ solved: boolean, hits: number, total: number, findings: Array }}
 *   findings: [{ kind, ids, vars }] - kind ist der i18n-Schluessel-Stamm
 */
function analyseBuild(form, target, attempt) {
  const d = FUNCTIONS[form];
  if (!d) return { solved: false, hits: 0, total: 0, findings: [] };

  const params = d.params;
  const tol = (p) => tolerance(target[p.id], p.step);
  const ok = (p) => near(attempt[p.id], target[p.id], tol(p));

  const hits = params.filter(ok).length;
  if (hits === params.length) {
    return { solved: true, hits, total: params.length, findings: [] };
  }

  const findings = [];
  const wrong = params.filter(p => !ok(p));
  const used = new Set();

  /* --- a) Zwei Parameter vertauscht ---------------------------------------
     Klassiker bei m/b und bei d/e. Wird zuerst geprueft, weil es alle
     anderen Befunde erklaert. */
  for (let i = 0; i < wrong.length; i++) {
    for (let j = i + 1; j < wrong.length; j++) {
      const p = wrong[i], q = wrong[j];
      if (used.has(p.id) || used.has(q.id)) continue;
      const swapped = near(attempt[p.id], target[q.id], tol(q))
                   && near(attempt[q.id], target[p.id], tol(p));
      // Nur melden, wenn die Werte sich ueberhaupt unterscheiden.
      if (swapped && Math.abs(target[p.id] - target[q.id]) > tol(p) + tol(q)) {
        findings.push({ kind: 'swapped', ids: [p.id, q.id], vars: {} });
        used.add(p.id); used.add(q.id);
      }
    }
  }

  for (const p of wrong) {
    if (used.has(p.id)) continue;
    const got = attempt[p.id], want = target[p.id];
    const T = tol(p);

    /* --- b) Vorzeichen gedreht ------------------------------------------ */
    if (Math.abs(want) > T * 2 && near(got, -want, T)) {
      // Bei Verschiebeparametern ist die Ursache fast immer das Minus in
      // (x \u2212 c) - dafuer gibt es eine eigene, konkretere Erklaerung.
      const isShift = !!d.shiftParams?.includes(p.id);
      findings.push({
        kind: isShift ? 'shiftDirection' : 'sign',
        ids: [p.id],
        vars: { want: mfmt(want), got: mfmt(got) }
      });
      used.add(p.id);
      continue;
    }

    /* --- c) Verdoppelt oder halbiert ------------------------------------- */
    if (Math.abs(want) > T * 2) {
      if (near(got, want * 2, T * 2)) {
        findings.push({ kind: 'doubled', ids: [p.id], vars: {} });
        used.add(p.id); continue;
      }
      if (near(got, want / 2, T)) {
        findings.push({ kind: 'halved', ids: [p.id], vars: {} });
        used.add(p.id); continue;
      }
    }

    /* --- d) Kehrwert ------------------------------------------------------ */
    if (Math.abs(want) > 0.2 && Math.abs(got) > 0.2 && near(got, 1 / want, T)) {
      findings.push({ kind: 'reciprocal', ids: [p.id], vars: {} });
      used.add(p.id); continue;
    }

    /* --- e) Sonst: zu hoch oder zu niedrig, mit Groessenordnung ---------- */
    const off = got - want;
    findings.push({
      kind: off > 0 ? 'tooHigh' : 'tooLow',
      ids: [p.id],
      vars: { by: mfmt(Math.abs(r(off, 2))) },
      // Fast richtig heisst: hoechstens die doppelte Toleranz daneben.
      close: Math.abs(off) <= T * 3
    });
    used.add(p.id);
  }

  return { solved: false, hits, total: params.length, findings };
}

/* ==========================================================================
   3 · WERTETABELLEN
   Fuer den Darstellungswechsel gebraucht - und bewusst hier, weil die
   Erzeugung sicherstellen muss, dass ueberhaupt definierte Werte
   herauskommen (Wurzel, Logarithmus, Polstellen).
   ========================================================================== */

/**
 * Sucht `count` x-Werte, an denen die Funktion definiert und der Wert
 * halbwegs handlich ist. Gibt null zurueck, wenn das nicht gelingt - dann
 * taugt die Kombination nicht fuer eine Tabellenaufgabe.
 */
function sampleTable(form, values, count = 5, from = -3, step = 1) {
  const d = FUNCTIONS[form];
  if (!d) return null;
  const rows = [];
  for (let i = 0; rows.length < count && i < count * 6; i++) {
    const x = r(from + i * step, 4);
    const y = d.f(x, values);
    if (!Number.isFinite(y) || Math.abs(y) > 1e5) continue;
    rows.push({ x, y: r(y, 3) });
  }
  return rows.length === count ? rows : null;
}

return {
  MISCONCEPTIONS, forForm, makeTrap, analyseBuild, sampleTable,
  // fuer Tests
  _shuffle: shuffle
};
})();
