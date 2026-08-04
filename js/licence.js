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
     · iOS      -> StoreKit-Quittung an den eigenen Server, dort gegen
                   Apples verifyReceipt bzw. die App Store Server API pruefen
     · Android  -> Play Billing Purchase-Token gegen die Google Play
                   Developer API pruefen
     · Web      -> eigenes Konto, signiertes Token (z. B. JWT) mit kurzer
                   Laufzeit, Signaturpruefung serverseitig

   Der Server antwortet mit einem signierten Token, das die App nur noch
   zwischenspeichert. Erst dann ist `edition === 'pro'` mehr als Kosmetik.

   Achtung CSP: sobald verifyWithServer() wirklich benutzt wird, muss in
   index.html `connect-src` die Lizenz-Domain erlauben. Das ist dann der
   einzige ausgehende Verbindungspunkt der App und gehoert genau so in die
   Datenschutzerklaerung.
   ========================================================================== */
'use strict';
window.MFE = window.MFE || {};

MFE.licence = (() => {

  /** Beim Entwickeln auf 'pro' stellen, um alle Funktionen zu sehen.
   *  Fuer den Release auf 'lite' setzen - die echte Freischaltung kommt dann
   *  ueber verifyWithServer(). */
  const DEV_EDITION = 'pro';

  const PRO_FEATURES = new Set([
    'export',       // PNG-Export
    'share',        // Deep Link kopieren
    'drag',         // Graph anfassen
    'ownQuiz',      // eigene Quizaufgabe aus dem Explorer
    'transform',    // Transformation abspielen
    'secondCurve',  // zweite Funktion g(x)
    'practice'      // Nachbau-Modus
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

  load();

  return {
    /** Einzige Stelle, an der die Oberflaeche nach Berechtigungen fragt. */
    has: (feature) => edition === 'pro' || !PRO_FEATURES.has(feature),
    isPro: () => edition === 'pro',
    edition: () => edition,
    /** Nur fuer Entwicklung und Tests. */
    setEdition(v) { edition = v === 'pro' ? 'pro' : 'lite'; },
    verifyWithServer,
    PRO_FEATURES
  };
})();
