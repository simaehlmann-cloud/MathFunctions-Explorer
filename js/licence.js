/* ==========================================================================
   licence.js  ·  Kostenlose Version / Pro (In-App-Kauf)
   --------------------------------------------------------------------------
   Es gibt EINE App. Kostenlos sind lineare und exponentielle Funktionen mit
   den fertigen Quizzen; ein einmaliger In-App-Kauf (kein Abo) schaltet den
   vollen Umfang frei. Aufbau wie bei FairSeat:

   · Gesperrt wird nur in der iOS-App. Im Browser (GitHub Pages) und in der
     Android-App gibt es vorerst keinen Kauf - dort steht alles frei. Vor
     einer Android-Version mit Kauf braucht das Plugin eine Play-Billing-Seite.

   · Ob gekauft wurde, entscheidet StoreKit 2 auf dem Geraet (von Apple
     signierte Transaktion, siehe plugins-src/cordova-plugin-mfe-store).
     Kein eigener Server, nichts verlaesst das Geraet.

   · Hier wird nur der LETZTE BEKANNTE Stand gemerkt, damit die App beim
     Start nicht kurz gesperrt aufblitzt und offline nutzbar bleibt.
     billing.js gleicht ihn nach jedem Start mit StoreKit ab.

   Diese Datei ist die Weiche fuer die Oberflaeche, kein Kopierschutz. Wer an
   den WebView-Speicher kommt, kann sich Pro setzen; fuer eine
   Schul-App ist das hinnehmbar, und StoreKit setzt den Stand beim naechsten
   Start ohnehin wieder richtig.

   Erkennung der iOS-App: build-www.mjs bindet cordova.js VOR dieser Datei
   ein. cordova.js legt window.cordova samt platformId synchron an - die
   Plugins dagegen erst bis "deviceready". Deshalb fragt has() nur nach der
   Plattform und nicht nach dem Plugin: sonst waere beim Start fuer einen
   Moment alles offen, und eine gespeicherte Sitzung mit gesperrter
   Funktionsklasse wuerde wiederhergestellt.
   ========================================================================== */
'use strict';
window.MFE = window.MFE || {};

MFE.licence = (() => {

  /** Muss exakt so in App Store Connect angelegt sein (Typ: nicht verbrauchbar). */
  const PRODUCT_ID = 'de.wisdompeak.mathfunctions.pro';

  /** Eigener Schluessel ausserhalb der Sitzungsdaten. */
  const OWNED_KEY = 'mfe:pro';

  /* Was die kostenlose Version NICHT kann. Eine einzige Liste - die
     Oberflaeche fragt ausschliesslich ueber has(). */
  const LOCKED = new Set([
    // Funktionsklassen. Frei bleiben lineare und exponentielle Funktionen.
    'cat.quadratic',
    'cat.polynomial',
    'cat.logarithm',
    'cat.trig',
    'cat.root',
    'cat.absolute',
    'cat.rational',
    // Werkzeuge
    'calculus',       // Ableitung, Tangente, Sekante
    'quizBuilder',    // eigene Quizze bauen, speichern, weitergeben
    'randomQuiz',     // Quiz per Knopfdruck erzeugen
    'ownQuiz',        // Schnellaufgabe aus dem Explorer
    'practice',       // Nachbau-Modus
    'secondCurve',    // zweite Funktion g(x)
    'export',         // PNG-Export, Arbeitsblatt
    'share',          // Deep Link kopieren
    'drag',           // Graph anfassen
    'transform'       // Transformation abspielen
  ]);

  /** Laeuft die App als iOS-App mit App-Store-Kauf? */
  const storeApp = () => !!window.cordova && window.cordova.platformId === 'ios';

  let owned = false;
  try { owned = localStorage.getItem(OWNED_KEY) === '1'; } catch { /* privater Modus */ }

  /** Setzt den Kaufstand. Rueckgabe: hat er sich geaendert? */
  function setOwned(v) {
    v = v === true;
    if (owned === v) return false;
    owned = v;
    try { localStorage.setItem(OWNED_KEY, v ? '1' : '0'); } catch {}
    return true;
  }

  const isFull = () => !storeApp() || owned;

  return {
    /** Einzige Stelle, an der die Oberflaeche nach Berechtigungen fragt. */
    has: (feature) => isFull() || !LOCKED.has(feature),
    /** Voller Umfang - gekauft oder ohne Kauf (Browser, Android). */
    isFull,
    /** Tatsaechlich gekauft (nur in der iOS-App sinnvoll). */
    owned: () => owned,
    storeApp,
    setOwned,
    PRODUCT_ID,
    LOCKED
  };
})();
