/* ==========================================================================
   sw.js  ·  Service Worker
   Macht die App im Schul-WLAN unabhaengig von der Verbindung. Es wird
   ausschliesslich der eigene Dateibestand zwischengespeichert - der Worker
   spricht mit keiner fremden Domain und speichert keine Nutzungsdaten.

   Strategie:
     · Installation    -> alle Dateien in den Cache legen
     · Navigation      -> Netz zuerst, bei Fehler die gespeicherte Seite
     · uebrige Dateien -> Cache zuerst, im Hintergrund auffrischen
   Bei einer neuen Version CACHE hochzaehlen; alte Caches werden dann
   automatisch geloescht. tools/build-www.mjs prueft, dass jede hier
   gelistete Datei auch wirklich in www/ liegt.
   ========================================================================== */
'use strict';

const CACHE = 'mfe-v6.3.0';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './recht.css',
  './impressum.html',
  './datenschutz.html',
  './ueber.html',
  './manifest.webmanifest',
  './js/licence.js',
  './js/billing.js',
  './js/i18n.js',
  './js/functions.js',
  './js/graph.js',
  './js/nav.js',
  './js/ui.js',
  './js/qr.js',
  './js/quiz.js',
  './js/app.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png'
];

/* Frueher stand hier skipWaiting(): eine neue Fassung uebernahm sofort,
   mitten in der Sitzung. Im unguenstigen Fall traf neues HTML auf altes
   JavaScript. Jetzt wartet die neue Fassung, bis die Nutzerin zustimmt -
   app.js schickt dafuer die Nachricht SKIP_WAITING. */
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
});

self.addEventListener('message', (e) => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  // Nur eigene GET-Anfragen. Alles andere geht den Worker nichts an.
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  // Navigationen: Netz zuerst, damit eine neue Fassung ankommt. Faellt das
  // Netz aus, wird die angeforderte Seite aus dem Cache bedient - und nur
  // wenn auch die fehlt, ersatzweise index.html. Vorher landete jeder
  // Aufruf von impressum.html offline auf der Startseite.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then(res => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match(req).then(hit => hit || caches.match('./index.html')))
    );
    return;
  }

  e.respondWith(
    caches.match(req).then(hit => {
      const net = fetch(req).then(res => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        }
        return res;
      }).catch(() => hit);
      return hit || net;
    })
  );
});
