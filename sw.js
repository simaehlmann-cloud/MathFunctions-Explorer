/* ==========================================================================
   sw.js  ·  Service Worker
   Macht die App im Schul-WLAN unabhaengig von der Verbindung. Es wird
   ausschliesslich der eigene Dateibestand zwischengespeichert - der Worker
   spricht mit keiner fremden Domain und speichert keine Nutzungsdaten.

   Strategie:
     · Installation  -> alle Dateien in den Cache legen
     · Navigation    -> Netz zuerst, bei Fehler die gespeicherte index.html
     · uebrige Dateien -> Cache zuerst, im Hintergrund auffrischen
   Bei einer neuen Version CACHE hochzaehlen; alte Caches werden dann
   automatisch geloescht.
   ========================================================================== */
'use strict';

const CACHE = 'mfe-v3.0.0';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './manifest.webmanifest',
  './js/licence.js',
  './js/billing.js',
  './js/i18n.js',
  './js/functions.js',
  './js/graph.js',
  './js/app.js',
  './manifest-lite.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/icon-lite-192.png',
  './icons/icon-lite-512.png',
  './icons/icon-lite-maskable-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
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

  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).catch(() => caches.match('./index.html'))
    );
    return;
  }

  e.respondWith(
    caches.match(req).then(hit => {
      const net = fetch(req).then(res => {
        if (res.ok) caches.open(CACHE).then(c => c.put(req, res.clone()));
        return res;
      }).catch(() => hit);
      return hit || net;
    })
  );
});
