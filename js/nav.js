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
let depth = 0;          // wie viele eigene Eintraege ueber der Startseite liegen

const isNative = () => !!window.cordova;

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
  try { history.pushState(markOf(mark), '', here()); depth++; } catch { /* file:// */ }
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
  try { history.pushState(markOf({ ...current, dialog: el.id }), '', here()); depth++; } catch {}
  try { el.showModal(); } catch { return false; }
  // Schliesst der Nutzer den Dialog anders (ESC, Schaltflaeche), muss der
  // zusaetzliche Verlaufseintrag wieder weg - sonst braucht der naechste
  // Zurueck-Druck einen Leerlauf.
  el.addEventListener('close', () => {
    if (history.state?.[KEY]?.dialog === el.id) history.back();
  }, { once: true });
  return true;
}

/* --------------------------------------------------------------------------
   Ebenen: Ansichten, die wie ein Dialog ueber allem liegen, aber kein
   <dialog> sind - das Vollbild des Graphen. Sie bekommen einen eigenen
   Verlaufseintrag, damit Zurueck (Android-Taste, Browser, Wischgeste) sie
   schliesst, statt den Bildschirm zu verlassen.

   onClose wird NUR aufgerufen, wenn Zurueck die Ebene schliesst. Schliesst
   die App sie selbst (Knopf, Esc), ruft sie closeLayer() - das nimmt den
   Verlaufseintrag wieder heraus, ohne onClose noch einmal auszuloesen.
   -------------------------------------------------------------------------- */
const layers = [];      // [{ id, onClose }], oberste zuletzt

function openLayer(id, onClose) {
  if (layers.some(l => l.id === id)) return false;
  layers.push({ id, onClose });
  try { history.pushState(markOf({ ...current, dialog: 'layer:' + id }), '', here()); depth++; } catch {}
  return true;
}

/** Ebene schliessen, die die App selbst beendet hat. silent: den
 *  Verlaufseintrag nicht anfassen (nur fuer Notfaelle, etwa wenn ein
 *  anderer Weg den Bildschirm schon gewechselt hat). */
function closeLayer(id, { silent = false } = {}) {
  const i = layers.findIndex(l => l.id === id);
  if (i < 0) return;
  layers.splice(i, 1);
  if (!silent && history.state?.[KEY]?.dialog === 'layer:' + id) history.back();
}

function openDialogs() {
  return Array.from(document.querySelectorAll('dialog')).filter(d => d.open);
}

function handlePop(e) {
  const mark = e.state?.[KEY];
  if (depth > 0) depth--;

  // Ein offener Dialog wird zuerst geschlossen - und zwar nur der oberste.
  // Alle auf einmal zu schliessen wuerde die Verlaufseintraege der darunter
  // liegenden stehen lassen; der naechste Zurueck-Druck liefe dann ins Leere.
  // Eine offene Ebene ist das Oberste - ausser ein Dialog liegt darueber
  // (etwa der Parameter-Dialog im Vollbild). Der kommt dann zuerst dran.
  const open = openDialogs();
  // Nur schliessen, wenn wir UNTER den Eintrag der Ebene zurueckgegangen
  // sind. Landet Zurueck genau auf ihm, wurde nur ein Dialog darueber
  // entfernt (etwa der Parameter-Dialog per eigenem Knopf) - die Ebene bleibt.
  const topLayer = layers[layers.length - 1];
  if (topLayer && !open.length && mark?.dialog !== 'layer:' + topLayer.id) {
    const top = layers.pop();
    try { top.onClose?.(); } catch {}
    if (mark) { current = { screen: mark.screen, tab: mark.tab }; apply(current); }
    return;
  }
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

/** Bindet den Hardware-Zurueck-Knopf (nur Android). Cordova meldet ihn als
 *  "backbutton" am document - aber erst nach "deviceready", und nur wenn
 *  jemand lauscht. Sobald ein Lauscher haengt, beendet die WebView die App
 *  nicht mehr von selbst; das Beenden uebernimmt guardExit() unten. */
let backBound = false;
function bindNativeBack() {
  if (backBound || !isNative()) return false;
  backBound = true;
  document.addEventListener('deviceready', () => {
    document.addEventListener('backbutton', (e) => {
      e.preventDefault?.();
      // Nicht canGoBack der WebView auswerten: dort zaehlen auch Eintraege
      // mit, die nicht von uns stammen. Massgeblich ist unsere eigene Tiefe.
      if (openDialogs().length || layers.length || depth > 0) { history.back(); return; }
      if (guardExit()) navigator.app?.exitApp?.();
    }, false);
  }, false);
  return true;
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

return { init, go, replace, openDialog, openLayer, closeLayer,
         get layers() { return layers.map(l => l.id); },
         get current() { return { ...current }; },
         get depth() { return depth; },
         isNative };
})();
