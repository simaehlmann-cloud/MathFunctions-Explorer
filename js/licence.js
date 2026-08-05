/* ==========================================================================
   licence.js  ·  Lite / Pro
   --------------------------------------------------------------------------
   WICHTIG, BITTE LESEN, BEVOR DIE APP IN EINEN STORE GEHT:

   Alles in dieser Datei laeuft im Browser der Nutzerin. Wer die
   Entwicklerkonsole oeffnet, kann `MFE.licence.setEdition('pro')` aufrufen und
   hat Pro. Diese Datei ist deshalb ausschliesslich die WEICHE FUER DIE
   OBERFLAECHE - sie ist kein Kopierschutz und kann keiner sein.

   Belastbar wird die Pruefung nur an einer Stelle, die der Nutzer nicht
   kontrolliert:
     · Android  -> Play Billing Purchase-Token gegen die Google Play
                   Developer API pruefen (purchases.products.get)
     · Web      -> eigenes Konto, signiertes Token mit kurzer Laufzeit,
                   Signaturpruefung serverseitig

   Achtung CSP: sobald verifyWithServer() wirklich benutzt wird, muss in
   index.html `connect-src` die Lizenz-Domain erlauben. Das ist dann der
   einzige ausgehende Verbindungspunkt der App und gehoert genau so in die
   Datenschutzerklaerung.
   ========================================================================== */
'use strict';
window.MFE = window.MFE || {};

MFE.licence = (() => {

  /* Wird vom Build-Skript ersetzt: tools/build-www.mjs setzt bei
     `npm run build:lite` hier 'lite' ein. Beim Entwickeln auf 'pro' lassen,
     um alle Funktionen zu sehen. */
  const DEV_EDITION = 'pro';

  /** Anwendungskennung der Pro-Ausgabe im Play Store. Muss mit
   *  capacitor.config.json der Pro-Ausgabe uebereinstimmen. */
  const PRO_APP_ID = 'de.wisdompeak.mathfunctions';
  const STORE_URL  = 'https://play.google.com/store/apps/details?id=' + PRO_APP_ID;

  /** Erst auf true setzen, wenn die Pro-Ausgabe im Play Store TATSAECHLICH
   *  erreichbar ist. Solange sie es nicht ist, fuehrt jeder Klick auf
   *  "Pro-Ausgabe ansehen" auf eine Fehlerseite von Google - und die Nutzerin
   *  haelt die App fuer kaputt. Mit false sagt die App stattdessen ehrlich,
   *  dass es die Pro-Ausgabe noch nicht gibt. */
  const STORE_LIVE = false;

  /* Was die Lite-Ausgabe NICHT kann. Eine einzige Liste - wer hier etwas
     aendert, aendert es ueberall, weil die Oberflaeche ausschliesslich ueber
     has() fragt. */
  const PRO_FEATURES = new Set([
    // Funktionsklassen. Lite behaelt lineare und exponentielle Funktionen.
    'cat.quadratic',
    'cat.polynomial',
    'cat.logarithm',
    'cat.trig',
    'cat.root',
    'cat.absolute',
    'cat.rational',
    // Werkzeuge
    'calculus',       // Ableitung und Tangente
    'quizBuilder',    // eigene Quizze bauen, speichern, weitergeben
    'randomQuiz',     // Quiz per Knopfdruck erzeugen
    'ownQuiz',        // Schnellaufgabe aus dem Explorer
    'practice',       // Nachbau-Modus
    'secondCurve',    // zweite Funktion g(x)
    'export',         // PNG-Export
    'share',          // Deep Link kopieren
    'drag',           // Graph anfassen
    'transform'       // Transformation abspielen
  ]);

  const STORE_KEY = 'mfe:licence';
  let edition = DEV_EDITION;
  let token = null;

  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      // Ablaufdatum lokal pruefen ist nur Komfort. Die Signaturpruefung
      // gehoert auf den Server; hier wird sie bewusst NICHT vorgetaeuscht.
      if (data.expires && Date.now() > data.expires) { localStorage.removeItem(STORE_KEY); return; }
      token = data.token || null;
      if (data.edition === 'pro' && token) edition = 'pro';
    } catch { /* privater Modus: Lite ist der sichere Fallback */ }
  }

  /** Platzhalter fuer die echte Pruefung. Bewusst nicht implementiert -
   *  ein erfundener Endpunkt waere schlimmer als gar keiner. */
  async function verifyWithServer(receipt, endpoint) {
    if (!endpoint) throw new Error('Kein Lizenzserver konfiguriert.');
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ receipt })
    });
    if (!res.ok) throw new Error('Lizenzpruefung fehlgeschlagen: ' + res.status);
    const data = await res.json();          // { edition, token, expires }
    if (data.edition === 'pro' && data.token) {
      edition = 'pro'; token = data.token;
      try { localStorage.setItem(STORE_KEY, JSON.stringify(data)); } catch {}
    }
    return edition;
  }

  /** Fuehrt zur Pro-Ausgabe. In der nativen App uebernimmt Capacitor das
   *  Ziel `_blank` und oeffnet den Play Store; im Browser einen neuen Tab.
   *  Absichtlich `noopener`: die Zielseite darf nicht auf window.opener
   *  zugreifen. */
  function openStore() {
    if (!STORE_LIVE) return 'notyet';
    try {
      const w = window.open(STORE_URL, '_blank', 'noopener,noreferrer');
      if (w) return true;
    } catch { /* Popup-Blocker oder WebView ohne Handler */ }
    try { location.href = STORE_URL; return true; } catch { return false; }
  }

  load();

  return {
    /** Einzige Stelle, an der die Oberflaeche nach Berechtigungen fragt. */
    has: (feature) => edition === 'pro' || !PRO_FEATURES.has(feature),
    isPro: () => edition === 'pro',
    edition: () => edition,
    /** Nur fuer Entwicklung und Tests. */
    setEdition(v) { edition = v === 'pro' ? 'pro' : 'lite'; },
    verifyWithServer,
    openStore,
    storeLive: () => STORE_LIVE,
    STORE_URL,
    PRO_APP_ID,
    PRO_FEATURES
  };
})();
