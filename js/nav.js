/* ==========================================================================
   nav.js  ·  Bildschirmverlauf und Zurueck-Knopf
   --------------------------------------------------------------------------
   Vorher gab es gar keine Verlaufsverwaltung: die App rief nur
   history.replaceState() auf, um den Zustand in den Hash zu schreiben. Auf
   Android hiess das - egal wo man war, ein Druck auf Zurueck beendete die
   App. Aus dem Quiz-Abspieler, aus dem Editor, aus dem Impressum.

   Jetzt liegt jeder Bildschirm als eigener Eintrag im Verlauf:

     Start -> Explorer -> Wertetabelle -> Eigene Quizze -> Editor

   Zurueck geht diesen Weg rueckwaerts. Ein offener Dialog wird zuerst
   geschlossen. Erst auf der Startseite beendet Zurueck die App - in der
   nativen Ausgabe nach doppeltem Druecken, damit das nicht versehentlich
   passiert.

   WICHTIG fuer alle, die spaeter daran arbeiten: history.state traegt unsere
   Wegmarke. Wer replaceState() aufruft, MUSS history.state weiterreichen,
   sonst ist die Marke weg und der Verlauf bricht. Siehe syncHash() in app.js.
   ========================================================================== */
'use strict';
window.MFE = window.MFE || {};

MFE.nav = (() => {

const KEY = 'mfe';                 // Feld in history.state
const EXIT_WINDOW = 2000;          // ms fuer den zweiten Druck auf der Startseite

let apply = () => {};              // wird von app.js gesetzt
let onExitBlocked = () => {};      // Rueckmeldung "nochmal druecken"
let counter = 0;
let current = { screen: 'home', tab: 'explorer' };
let lastExitAttempt = 0;
let started = false;

const isNative = () => !!window.Capacitor?.isNativePlatform?.();

/** Der aktuelle Hash bleibt unangetastet - er traegt den Funktionszustand
 *  und hat mit der Navigation nichts zu tun. */
const here = () => location.hash || '';

function markOf(entry) {
  return { ...(history.state || {}), [KEY]: { ...entry, i: ++counter } };
}

/** Vorwaerts: neuer Eintrag im Verlauf. */
function go(entry) {
  const next = { screen: entry.screen ?? current.screen, tab: entry.tab ?? current.tab };
  // Kein Eintrag fuer eine Bewegung, die nichts veraendert - sonst muesste
  // man dreimal Zurueck druecken, um einmal zurueckzukommen.
  if (next.screen === current.screen && next.tab === current.tab && !entry.dialog) {
    current = next;
    return;
  }
  const mark = { ...next, dialog: entry.dialog || null };
  try { history.pushState(markOf(mark), '', here()); } catch { /* file:// */ }
  current = next;
}

/** Denselben Eintrag ueberschreiben - fuer den Start und fuer Wechsel, die
 *  keinen eigenen Schritt verdienen. */
function replace(entry) {
  const next = { screen: entry.screen ?? current.screen, tab: entry.tab ?? current.tab };
  try { history.replaceState(markOf({ ...next, dialog: null }), '', here()); } catch {}
  current = next;
}

/** Modalen Dialog oeffnen. Er bekommt einen eigenen Verlaufseintrag, damit
 *  Zurueck ihn schliesst statt den Bildschirm zu wechseln. */
function openDialog(el) {
  if (!el?.showModal || el.open) return false;
  try { history.pushState(markOf({ ...current, dialog: el.id }), '', here()); } catch {}
  try { el.showModal(); } catch { return false; }
  // Schliesst der Nutzer den Dialog anders (ESC, Schaltflaeche), muss der
  // zusaetzliche Verlaufseintrag wieder weg - sonst braucht der naechste
  // Zurueck-Druck einen Leerlauf.
  el.addEventListener('close', () => {
    if (history.state?.[KEY]?.dialog === el.id) history.back();
  }, { once: true });
  return true;
}

function openDialogs() {
  return Array.from(document.querySelectorAll('dialog')).filter(d => d.open);
}

function handlePop(e) {
  const mark = e.state?.[KEY];

  // Ein offener Dialog wird zuerst geschlossen - und zwar nur der oberste.
  // Alle auf einmal zu schliessen wuerde die Verlaufseintraege der darunter
  // liegenden stehen lassen; der naechste Zurueck-Druck liefe dann ins Leere.
  const open = openDialogs();
  if (open.length) {
    const top = open[open.length - 1];
    try { top.close('back'); } catch {}
    if (mark) { current = { screen: mark.screen, tab: mark.tab }; apply(current); }
    return;
  }

  if (!mark) {
    // Vor unserem ersten Eintrag: die Seite wird verlassen. Im Browser ist
    // das richtig; in der App faengt der Doppeldruck unten es ab.
    return;
  }
  current = { screen: mark.screen, tab: mark.tab };
  apply(current);
}

/** Nur nativ: der letzte Zurueck-Druck auf der Startseite. Zweimal innerhalb
 *  von zwei Sekunden beendet die App, einmal nicht. */
function guardExit() {
  const now = Date.now();
  if (now - lastExitAttempt < EXIT_WINDOW) return true;   // beenden erlaubt
  lastExitAttempt = now;
  onExitBlocked();
  return false;
}

/** Bindet den Hardware-Zurueck-Knopf, sofern das Capacitor-App-Plugin
 *  vorhanden ist. Ohne Plugin uebernimmt die WebView selbst - dann greift
 *  wenigstens der Verlauf oben. */
function bindNativeBack() {
  const App = window.Capacitor?.Plugins?.App;
  if (!App?.addListener) return;
  App.addListener('backButton', ({ canGoBack }) => {
    if (openDialogs().length) { history.back(); return; }
    if (canGoBack && current.screen !== 'home') { history.back(); return; }
    if (current.screen !== 'home') { history.back(); return; }
    if (guardExit()) App.exitApp?.();
  });
}

function init(hooks) {
  if (started) return;
  started = true;
  apply = hooks.apply || apply;
  onExitBlocked = hooks.onExitBlocked || onExitBlocked;
  current = { screen: hooks.screen || 'home', tab: hooks.tab || 'explorer' };
  replace(current);
  addEventListener('popstate', handlePop);
  bindNativeBack();
}

return { init, go, replace, openDialog, get current() { return { ...current }; }, isNative };
})();
