/* ==========================================================================
   billing.js  ·  In-App-Kauf "Pro" (App Store, StoreKit 2)
   --------------------------------------------------------------------------
   Duenner Adapter um das eigene Plugin plugins-src/cordova-plugin-mfe-store
   (global: window.MFEStore). Aufbau wie bei FairSeat.

   EINRICHTUNG (einmalig, App Store Connect)
     1. Vertrag "Kostenpflichtige Apps" aktiv (Steuer- und Bankdaten)
     2. App -> Monetarisierung -> In-App-Kaeufe -> + -> "Nicht verbrauchbar"
        Produkt-ID exakt: de.wisdompeak.mathfunctions.pro
     3. Den ersten Kauf zusammen mit einer App-Version einreichen

   Ohne Plugin (Browser, Android) tut diese Datei nichts; licence.js gibt
   dort ohnehin alles frei. Ist das Produkt noch nicht angelegt, meldet die
   App "Kauf zurzeit nicht moeglich" statt eines leeren Dialogs.

   Ereignis fuer die Oberflaeche:
     mfe:licence-changed  detail: { owned: true|false }
   ========================================================================== */
'use strict';
window.MFE = window.MFE || {};

MFE.billing = (() => {

const L = () => MFE.licence;
const plugin = () => {
  const s = window.MFEStore;
  return s && typeof s.buy === 'function' && typeof s.status === 'function' ? s : null;
};

let price = '';
let busy = false;

function announce(owned) {
  window.dispatchEvent(new CustomEvent('mfe:licence-changed', { detail: { owned } }));
}

function apply(owned) {
  if (L().setOwned(owned === true)) announce(owned === true);
}

/** Zustand fuer die Oberflaeche. */
function status() {
  if (!L().storeApp()) return 'web';
  if (L().owned()) return 'owned';
  if (!plugin()) return 'missing';
  return 'ready';
}

/** Kaufstand und Preis mit StoreKit abgleichen. Fehler: letzten bekannten
 *  Stand behalten - offline soll ein gekauftes Pro nicht verfallen. */
function refresh() {
  const S = plugin();
  if (!S || !L().storeApp()) return;
  S.status(L().PRODUCT_ID, r => apply(r && r.owned === true), () => {});
  if (!price && typeof S.product === 'function') {
    S.product(L().PRODUCT_ID, r => {
      if (r && typeof r.price === 'string' && r.price.trim()) {
        price = r.price.trim().slice(0, 24);
        window.dispatchEvent(new CustomEvent('mfe:price'));
      }
    }, () => {});
  }
}

/** Kauf starten. Rueckgabe: { ok, reason }
 *  reason: purchased | pending | cancelled | busy | missing | web | owned | error */
function purchase() {
  const st = status();
  if (st === 'owned') return Promise.resolve({ ok: true, reason: 'owned' });
  if (st !== 'ready') return Promise.resolve({ ok: false, reason: st });
  if (busy) return Promise.resolve({ ok: false, reason: 'busy' });
  busy = true;
  return new Promise(resolve => {
    plugin().buy(L().PRODUCT_ID, r => {
      busy = false;
      const res = r && r.result;
      if (res === 'purchased') { apply(true); resolve({ ok: true, reason: 'purchased' }); }
      else if (res === 'pending') resolve({ ok: false, reason: 'pending' });
      else resolve({ ok: false, reason: 'cancelled' });
    }, () => { busy = false; resolve({ ok: false, reason: 'error' }); });
  });
}

/** Kaeufe wiederherstellen (Apple verlangt den Knopf).
 *  Rueckgabe: { owned, reason }  reason: restored | none | cancelled | error | missing | web | busy */
function restore() {
  if (!L().storeApp()) return Promise.resolve({ owned: L().isFull(), reason: 'web' });
  const S = plugin();
  if (!S || typeof S.restore !== 'function') return Promise.resolve({ owned: L().owned(), reason: 'missing' });
  if (busy) return Promise.resolve({ owned: L().owned(), reason: 'busy' });
  busy = true;
  return new Promise(resolve => {
    S.restore(L().PRODUCT_ID, r => {
      busy = false;
      const owned = !!(r && r.owned === true);
      // Nur auf "gekauft" umschalten. Ein abgebrochener Abgleich ohne Treffer
      // nimmt einen bekannten Kauf nicht weg; das erledigt refresh() ueber
      // die aktuellen Berechtigungen.
      if (owned) apply(true);
      const reason = owned ? 'restored' : r && r.cancelled ? 'cancelled' : r && r.error ? 'error' : 'none';
      resolve({ owned, reason });
    }, () => { busy = false; resolve({ owned: L().owned(), reason: 'error' }); });
  });
}

document.addEventListener('deviceready', () => {
  const S = plugin();
  if (!S || !L().storeApp()) return;
  // Spaeter bestaetigte Kaeufe ("Kaufen anfragen"), andere Geraete, Erstattungen
  if (typeof S.watch === 'function') S.watch(() => refresh());
  refresh();
}, false);
document.addEventListener('resume', refresh, false);

return { status, refresh, purchase, restore, price: () => price };
})();
