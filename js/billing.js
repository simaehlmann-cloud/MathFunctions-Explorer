/* ==========================================================================
   billing.js  ·  Kauf der Pro-Version im Play Store
   --------------------------------------------------------------------------
   Diese Datei ist ein duenner Adapter. Sie tut im Browser nichts und wird
   erst in der Android-App aktiv, wenn ein Billing-Plugin installiert ist.

   Einrichtung (einmalig, lokal mit Internet):

     npm install @capacitor-community/in-app-purchases
     npx cap sync android

   Danach in der Play Console unter "Monetarisierung -> Produkte" ein
   einmaliges Produkt mit der unten stehenden PRODUCT_ID anlegen.

   WICHTIG - und der Grund, warum hier nicht mehr steht:
   Was dieser Code herausfindet, laeuft im Geraet der Nutzerin. Ein
   entschlossener Mensch kann das umgehen. Fuer eine Schul-App ist das in der
   Praxis meist hinnehmbar; wer es sauber will, laesst den purchaseToken von
   einem eigenen Server gegen die Google Play Developer API pruefen
   (purchases.products.get) und schaltet erst auf dessen signierte Antwort
   hin frei. Der Anschlusspunkt dafuer ist verifyWithServer() in licence.js.
   ========================================================================== */
'use strict';
window.MFE = window.MFE || {};

MFE.billing = (() => {

const PRODUCT_ID = 'pro_upgrade';         // muss mit der Play Console uebereinstimmen

const native = () => !!window.Capacitor?.isNativePlatform?.();
const plugin = () => window.Capacitor?.Plugins?.InAppPurchases ?? null;

/** Signalisiert der Oberflaeche, dass sich die Berechtigungen geaendert
 *  haben - app.js horcht darauf und zeichnet die Bedienelemente neu. */
function announce() {
  window.dispatchEvent(new CustomEvent('mfe:licence-changed'));
}

/** Beim Start: bereits getaetigte Kaeufe wiederherstellen. Ohne diesen
 *  Schritt stuende eine Nutzerin nach einem Geraetewechsel wieder vor der
 *  Lite-Version, obwohl sie bezahlt hat. Google verlangt die
 *  Wiederherstellung ausdruecklich. */
async function restore() {
  const p = plugin();
  if (!native() || !p) return false;
  try {
    // Der genaue Methodenname haengt vom Plugin ab - vor dem Release gegen
    // dessen README pruefen. Beide gaengigen Varianten werden abgedeckt.
    const res = await (p.getPurchases?.() ?? p.restorePurchases?.() ?? Promise.resolve(null));
    const list = res?.purchases ?? res?.results ?? [];
    const owned = list.some(x => (x.productId ?? x.productIdentifier) === PRODUCT_ID);
    if (owned) { MFE.licence.setEdition('pro'); announce(); }
    return owned;
  } catch (err) {
    console.warn('[billing] Kaeufe konnten nicht abgefragt werden:', err?.message);
    return false;
  }
}

/** Kaufvorgang starten. Rueckgabe: true, wenn danach Pro aktiv ist. */
async function purchase() {
  const p = plugin();
  if (!native() || !p) return false;
  try {
    const res = await p.purchase({ productId: PRODUCT_ID });
    const ok = res?.responseCode === 0 || res?.success === true || !!res?.purchaseToken;
    if (ok) {
      // Einmalprodukte muessen bestaetigt werden, sonst erstattet Google den
      // Kauf nach drei Tagen automatisch zurueck.
      await p.acknowledgePurchase?.({ purchaseToken: res.purchaseToken }).catch(() => {});
      MFE.licence.setEdition('pro');
      announce();
    }
    return ok;
  } catch (err) {
    console.warn('[billing] Kauf abgebrochen oder fehlgeschlagen:', err?.message);
    return false;
  }
}

/** Steht ein Kauf ueberhaupt zur Verfuegung? Im Browser: nein. */
const available = () => native() && !!plugin();

if (native()) restore();

return { PRODUCT_ID, available, restore, purchase };
})();
