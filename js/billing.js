/* ==========================================================================
   billing.js  ·  Kauf der Pro-Ausgabe ueber Google Play
   --------------------------------------------------------------------------
   BERICHTIGUNG GEGENUEBER FRUEHEREN FASSUNGEN
   Hier stand einmal die Anweisung, `@capacitor-community/in-app-purchases`
   zu installieren. Dieses Paket EXISTIERT NICHT. Wer der Anleitung folgte,
   bekam von npm einen 404 und stand ratlos da. Verwendet wird stattdessen
   `cordova-plugin-purchase` - seit Jahren gepflegt, laeuft unter Capacitor
   und bedient Google Play Billing.

   EINRICHTUNG (einmalig, lokal, mit Internet)

     npm install cordova-plugin-purchase
     npx cap sync android

   Danach in der Play Console:
     1. Monetarisierung -> Produkte -> Einmalige Produkte
     2. Produkt mit genau der unten stehenden PRODUCT_ID anlegen
     3. App mindestens in einen geschlossenen Test hochladen - vorher liefert
        Google keine Produktdaten aus, und der Kauf schlaegt ohne sprechende
        Meldung fehl
     4. BILLING_READY hier unten auf true setzen

   Solange BILLING_READY false ist, meldet die App ehrlich "noch nicht
   verfuegbar", statt einen Kaufvorgang zu starten, den Google abweist.

   WAS DIESER CODE NICHT LEISTET
   Er laeuft im Geraet der Nutzerin und ist damit umgehbar. Fuer eine
   Schul-App ist das meist hinnehmbar; wer es belastbar will, laesst den
   purchaseToken von einem eigenen Server gegen die Google Play Developer API
   pruefen (purchases.products.get) und schaltet erst auf dessen signierte
   Antwort hin frei. Anschlusspunkt: verifyWithServer() in licence.js.
   ========================================================================== */
'use strict';
window.MFE = window.MFE || {};

MFE.billing = (() => {

/** Muss mit der Play Console uebereinstimmen. */
const PRODUCT_ID = 'mathfunctions_pro';

/** Auf true setzen, sobald das Produkt in der Play Console angelegt UND die
 *  App mindestens in einem geschlossenen Test veroeffentlicht ist. */
const BILLING_READY = false;

const native = () => !!window.Capacitor?.isNativePlatform?.();

/** cordova-plugin-purchase legt sich global unter CdvPurchase ab. */
const store = () => window.CdvPurchase?.store ?? null;
const CDV = () => window.CdvPurchase ?? null;

let ready = false;
let initPromise = null;

/** Signalisiert der Oberflaeche, dass sich die Berechtigungen geaendert
 *  haben - app.js horcht darauf und zeichnet die Bedienelemente neu. */
function announce() {
  window.dispatchEvent(new CustomEvent('mfe:licence-changed'));
}

/** Zustand fuer die Oberflaeche. So kann sie zwischen "geht hier gar nicht"
 *  (Browser), "kommt noch" (vor der Veroeffentlichung) und "bereit"
 *  unterscheiden, statt bei jedem Fall dieselbe Fehlermeldung zu zeigen. */
function status() {
  if (MFE.licence.isPro()) return 'owned';
  if (!native()) return 'web';
  if (!BILLING_READY) return 'notyet';
  if (!store()) return 'missing';
  return ready ? 'ready' : 'loading';
}

/** Einmalige Einrichtung des Plugins. Mehrfachaufrufe liefern dasselbe
 *  Versprechen zurueck - sonst registrierte man bei jedem Kaufversuch neue
 *  Ereignisbehandler. */
function init() {
  if (initPromise) return initPromise;
  const s = store();
  const C = CDV();
  if (!native() || !BILLING_READY || !s || !C) return (initPromise = Promise.resolve(false));

  initPromise = (async () => {
    try {
      s.register([{
        id: PRODUCT_ID,
        type: C.ProductType.NON_CONSUMABLE,
        platform: C.Platform.GOOGLE_PLAY
      }]);

      // Ein bestaetigter Kauf schaltet frei. Das Ereignis kommt auch beim
      // Start fuer bereits getaetigte Kaeufe - das ist zugleich die
      // Wiederherstellung nach einem Geraetewechsel.
      s.when()
        .approved(async (transaction) => {
          try { await transaction.verify(); }
          catch { await transaction.finish(); }      // ohne Pruefserver direkt abschliessen
        })
        .verified(async (receipt) => {
          try { await receipt.finish(); } catch {}
          applyOwnership();
        })
        .finished(() => applyOwnership());

      s.error((err) => console.warn('[billing]', err?.code, err?.message));

      await s.initialize([C.Platform.GOOGLE_PLAY]);
      ready = true;
      applyOwnership();
      return true;
    } catch (err) {
      console.warn('[billing] Einrichtung fehlgeschlagen:', err?.message);
      return false;
    }
  })();
  return initPromise;
}

/** Fragt den Besitzstand ab und schaltet die Oberflaeche um. */
function applyOwnership() {
  const s = store();
  if (!s) return false;
  let owned = false;
  try {
    owned = !!s.owned?.(PRODUCT_ID) || !!s.get?.(PRODUCT_ID)?.owned;
  } catch { owned = false; }
  if (owned && !MFE.licence.isPro()) {
    MFE.licence.setEdition('pro');
    announce();
  }
  return owned;
}

/** Kaeufe wiederherstellen. Google verlangt diese Moeglichkeit ausdruecklich;
 *  ohne sie stuende eine zahlende Nutzerin nach einem Geraetewechsel wieder
 *  vor der Lite-Ausgabe. */
async function restore() {
  if (!(await init())) return false;
  const s = store();
  try { await s.restorePurchases?.(); } catch (err) {
    console.warn('[billing] Wiederherstellung fehlgeschlagen:', err?.message);
  }
  return applyOwnership();
}

/**
 * Kaufvorgang starten.
 * Rueckgabe: { ok, reason } - die Oberflaeche entscheidet anhand von reason,
 * was sie sagt. Ein blosses false liesse sie im Dunkeln.
 */
async function purchase() {
  const state = status();
  if (state === 'owned') return { ok: true, reason: 'owned' };
  if (state === 'web') return { ok: false, reason: 'web' };
  if (state === 'notyet') return { ok: false, reason: 'notyet' };

  if (!(await init())) return { ok: false, reason: 'missing' };
  const s = store();
  const product = s.get?.(PRODUCT_ID);
  const offer = product?.getOffer?.();
  if (!offer) return { ok: false, reason: 'noproduct' };

  try {
    await offer.order();
    // Die Freischaltung kommt ueber die Ereigniskette oben, nicht hier -
    // order() kehrt zurueck, sobald der Dialog geschlossen ist, nicht wenn
    // Google den Kauf bestaetigt hat.
    return { ok: applyOwnership(), reason: 'ordered' };
  } catch (err) {
    console.warn('[billing] Kauf abgebrochen:', err?.message);
    return { ok: false, reason: 'cancelled' };
  }
}

/** Preis fuer die Anzeige, in der Waehrung des Nutzerkontos. */
function price() {
  try { return store()?.get?.(PRODUCT_ID)?.pricing?.price ?? null; } catch { return null; }
}

// Beim Start still versuchen. Schlaegt es fehl, bleibt es bei Lite - kein
// Grund, die App mit einer Fehlermeldung zu begruessen.
if (native() && BILLING_READY) {
  document.addEventListener('deviceready', () => { restore(); }, { once: true });
  // Unter Capacitor kommt deviceready nicht zwingend; nach kurzer Wartezeit
  // ohnehin versuchen.
  setTimeout(() => { if (!ready) restore(); }, 1500);
}

return { purchase, restore, status, price, PRODUCT_ID, BILLING_READY };
})();
