# MathFunctions Explorer v3

Interaktiver Funktionenplotter für den Mathematikunterricht. Läuft vollständig
im Browser — ohne Server, ohne Konto, ohne Verbindung zu einer fremden Domain.

## Starten

```
python3 -m http.server 8000
```

und `http://localhost:8000` öffnen. Ein einfacher Doppelklick auf
`index.html` funktioniert auch, aber unter `file://` fehlen drei Dinge, die
der Browser dort grundsätzlich sperrt: Service Worker (Offline-Betrieb),
Zwischenablage und Installation als App.

## Aufbau

```
index.html                Struktur, CSP, Einbindung
package.json              Skripte und Capacitor-Abhaengigkeiten
capacitor.config.json     App-ID und Name fuer die Android-App
style.css                 Gestaltung, alle Farben als CSS-Variablen
manifest.webmanifest      PWA-Metadaten
sw.js                     Service Worker (Offline-Cache)
icons/                    App-Icons, lokal erzeugt
js/licence.js             Lite/Pro-Weiche  ← vor dem Store-Release lesen
js/billing.js             Play-Store-Kauf (im Browser wirkungslos)
js/i18n.js                Deutsch und Englisch
js/functions.js           Zahleneingabe, Formatierung, Funktionskatalog
js/graph.js               Renderer, Achsen, Nullstellen, Schnittpunkte
js/app.js                 Zustand, Bedienung, Undo, Übungsmodi
tools/build-www.mjs       sammelt die Web-Dateien nach www/ (Voll oder Lite)
tools/make_icons.py       erzeugt alle sechs App-Icons
.github/workflows/        Pages-Veröffentlichung und Android-Build
```

Die Aufteilung ist bewusst ohne ES-Module gemacht (klassische `<script>`-Tags
mit einem `MFE`-Namensraum), damit die App auch von einem USB-Stick über
`file://` startet. Der Katalog in `js/functions.js` beschreibt jede Funktion
an genau einer Stelle — Parameter, Term, Schreibweise, Hilfslinien, markante
Punkte, Ziehpunkte. Eine neue Funktionsklasse braucht genau einen neuen
Eintrag und keine Änderung an Renderer, Tabelle oder Quiz.

## Funktionsumfang

**Explorer** — vier Funktionsklassen, sechs Darstellungsformen (bei
quadratischen Funktionen allgemeine Form, Scheitelpunktform und
Nullstellenform). Parameter über Schieberegler *oder* Eingabefeld, Buchstaben
frei umbenennbar samt Erklärung und Beispiel.

**Zwei Kurven.** `+ g(x) hinzufügen` legt eine zweite Funktion an, die
Schnittpunkte werden numerisch bestimmt und mit Koordinaten beschriftet — die
visuelle Kontrolle zum Gleichsetzungsverfahren. Gibt es im sichtbaren
Ausschnitt keinen Schnittpunkt, steht das auch dort.

**Hilfslinien und markante Punkte** je Funktionstyp: Steigungsdreieck,
Symmetrieachse, Scheitelpunkt, Asymptote, Mittellinie und Periode beim Sinus;
zuschaltbar Nullstellen und y-Achsenabschnitt.

**π-Achse.** Bei trigonometrischen Funktionen ist die x-Achse in Vielfachen
von π geteilt — `π/2`, `3π/2`, `2π` statt 1,57 / 4,71 / 6,28. Auch die
Gleichung schreibt die Phasenverschiebung als `sin(2·(x − π/2))`.

**Wertetabelle** mit beiden Kurven, als TSV kopierbar (Excel, Numbers,
LibreOffice).

**Üben** in zwei Richtungen:
* *Zuordnen* — Graph vorgegeben, passende Gleichung aus vier wählen.
* *Nachbauen* — Zielkurve grau im Hintergrund, die Regler müssen passend
  eingestellt werden. Geprüft wird parameterweise mit Toleranz, die Rückmeldung
  nennt also, **welcher** Parameter noch zu groß oder zu klein ist.

**Weiteres:** Play-Button je Regler, Transformation der Scheitelpunktform
Schritt für Schritt, Ziehen am Graphen, Undo/Redo mit Strg+Z, PNG-Export auf
weißem Grund, Deep Links, Dark Mode, Deutsch/Englisch.

## Zahleneingabe

Komma und Punkt gelten beide als Dezimaltrennzeichen:

| Eingabe | Ergebnis |
|---|---|
| `0,5` · `0.5` · `,5` | 0,5 |
| `−3,25` (typografisches Minus aus kopierten Arbeitsblättern) | −3,25 |
| `1 000,5` · `1'000.5` | 1000,5 |
| `3/4` | 0,75 |
| `pi/2` · `π` · `2pi` | 1,5708 … |

Abgelehnt werden `1,2,3`, `1/0`, `--3` und Buchstaben: Das Feld färbt sich
rot und springt auf den letzten gültigen Wert zurück. Die Auswertung läuft
ohne `eval` — Werte können über Deep Links von außen kommen und dürfen
niemals als Code ausgeführt werden.

Wird ein Wert außerhalb des Reglerbereichs getippt, wächst der Bereich mit,
statt den Wert abzuschneiden. Ausgenommen sind mathematisch harte Grenzen wie
die Basis einer Exponentialfunktion.

## Tastatur

| Taste | Wirkung |
|---|---|
| ←/→ auf einem Regler | ein Schritt |
| Umschalt + ←/→ | zehn Schritte |
| Pos1 / Ende | Minimum / Maximum |
| Strg+Z / Strg+Umschalt+Z | Rückgängig / Wiederherstellen |
| ←/→ auf den Reitern | Ansicht wechseln |

## Offline und Installation

`sw.js` legt den eigenen Dateibestand in einen Cache und bedient ihn ohne
Verbindung. Er spricht mit keiner fremden Domain und speichert keine
Nutzungsdaten. Bei einer neuen Version die Konstante `CACHE` hochzählen —
alte Caches werden dann automatisch entfernt.

Über `manifest.webmanifest` lässt sich die App auf dem Homescreen ablegen und
startet dann ohne Browserleiste. Für die Lite-Version ist das der Weg ganz
ohne Store.

## Icons

`icons/` enthält zwei Sätze. Beide zeigen dieselben vier Funktionsgraphen in
den vier Parameterfarben der App — Gerade blau, Parabel magenta,
Exponentialkurve türkis, Sinuswelle amber — auf dunklem Grund. Wo sich Kurven
kreuzen, trennt ein Saum in Hintergrundfarbe sie voneinander, sonst wären sie
bei 48 px nicht mehr auseinanderzuhalten.

| Datei | Verwendung |
|---|---|
| `icon-192.png`, `icon-512.png` | Vollversion |
| `icon-maskable-512.png` | Android, `purpose: maskable` |
| `icon-lite-*.png` | dieselben Motive mit LITE-Abzeichen |

Die maskable-Varianten halten die inneren 80 % frei, weil Android das Icon
auf einen Kreis beschneidet.

Neu erzeugen lassen sich alle sechs mit `tools/make_icons.py` (Pillow
erforderlich). Farben und Kurvenformen stehen dort als Konstanten am
Dateianfang.

## Lite-Ausgabe

```bash
npm run build:lite      # erzeugt www/ mit Lite-Weiche, Lite-Icons, Lite-Namen
npm run build           # Vollversion
```

Es gibt bewusst keinen zweiten Quellcodezweig — zwei Zweige laufen
erfahrungsgemäß innerhalb weniger Wochen auseinander. Das Skript nimmt genau
drei Textersetzungen vor und tauscht die Icons.

## Lite und Pro — bitte vor dem Release lesen

In `js/licence.js`:

```js
const DEV_EDITION = 'pro';     // fürs Release auf 'lite'
const PRO_FEATURES = new Set([
  'export', 'share', 'drag', 'ownQuiz', 'transform', 'secondCurve', 'practice'
]);
```

**Diese Datei ist die Weiche für die Oberfläche, kein Kopierschutz.** Alles
darin läuft im Browser der Nutzerin; wer die Entwicklerkonsole öffnet, ruft
`MFE.licence.setEdition('pro')` auf und hat Pro. Belastbar wird die Prüfung
erst an einer Stelle, die der Nutzer nicht kontrolliert:

* **iOS** — StoreKit-Quittung an den eigenen Server, dort gegen die App Store
  Server API prüfen
* **Android** — Play-Billing-Purchase-Token gegen die Google Play Developer
  API prüfen
* **Web** — eigenes Konto, kurzlebiges signiertes Token, Signaturprüfung
  serverseitig

`verifyWithServer()` in `licence.js` ist als Anschlusspunkt vorbereitet, aber
absichtlich nicht mit einem erfundenen Endpunkt gefüllt. Sobald sie benutzt
wird, muss in `index.html` bei `connect-src` genau eine Domain ergänzt
werden — das ist dann der einzige ausgehende Verbindungspunkt der App und
gehört genau so in die Datenschutzerklärung.

Gesperrte Bedienelemente bleiben in der Lite-Version sichtbar und tragen ein
PRO-Abzeichen. Das ist ehrlicher als sie zu verstecken und funktioniert
zugleich als Werbefläche.

## Datenschutz

Gespeichert wird ausschließlich lokal (`localStorage`): Sprache, Theme und die
selbst gewählten Parameter-Buchstaben. Keine Kennungen, keine Analytik, keine
Schriften von fremden Servern. Der Zustand für Deep Links steht im
`location.hash` — der Hash wird vom Browser nicht an einen Server übertragen.

Die Content-Security-Policy in `index.html` erlaubt `connect-src 'self'`,
also ausschließlich die eigenen Dateien für den Offline-Cache. Damit ist die
Aussage „keine Datenübertragung" technisch erzwungen und nicht nur
versprochen.

## Was noch offen ist

* **QR-Code.** Ohne Drittanbieter heißt: eigener Encoder oder eine
  MIT-lizenzierte Bibliothek, die lokal mitgeliefert wird. Eine
  CDN-Einbindung wäre der einzige Punkt, an dem doch Daten nach außen gingen.
  Die Zustands-URL liefert „Link kopieren" bereits.
* **Mehr als zwei Kurven.** `state.curves` ist ein Array, die Grenze steht nur
  in `CURVE_NAMES` und im Deep-Link-Format.
* **Aufgabensammlung für Lehrkräfte** — mehrere Deep Links als Arbeitsblatt.


## Repository und Veröffentlichung

`.github/workflows/pages.yml` veröffentlicht das Repo bei jedem Push auf
`main` als statische Website über GitHub Pages. Es wird nichts gebaut und
nichts installiert — die App besteht ausschließlich aus HTML, CSS und
JavaScript. Einmalig nötig: **Settings → Pages → Source: GitHub Actions**.

Danach läuft die App unter
`https://<benutzername>.github.io/<repo-name>/` — mit HTTPS, also inklusive
Service Worker, Zwischenablage und Installation auf dem Homescreen.

### Weg in den Play Store

Der Play Store nimmt keine Website an, sondern ein Android App Bundle. Die
App wird dafür mit **Capacitor** in ein natives Projekt verpackt: Die
Web-Dateien landen in der App selbst, es gibt keinen Ladevorgang aus dem
Netz, und die App startet auch ohne Verbindung.

Alles dafür Nötige liegt bei — bis auf den Ordner `android/`, der einmalig
lokal erzeugt werden muss, weil dabei Pakete heruntergeladen werden:

```bash
npm install
npm run android:add          # legt android/ an
git add android && git commit -m "Android-Projekt"
git push
```

Danach baut `.github/workflows/android.yml` bei jedem Tag `v*` ein signiertes
AAB:

```bash
git tag v3.0.0 && git push --tags
```

Vorher einmalig einen Signaturschlüssel erzeugen und als GitHub Secrets
hinterlegen:

```bash
keytool -genkey -v -keystore upload-keystore.jks \
        -keyalg RSA -keysize 2048 -validity 10000 -alias upload
base64 -w0 upload-keystore.jks          # Ausgabe als Secret einfügen
```

| Secret | Inhalt |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | Ausgabe des base64-Befehls |
| `ANDROID_KEYSTORE_PASSWORD` | Passwort des Keystores |
| `ANDROID_KEY_ALIAS` | `upload` |
| `ANDROID_KEY_PASSWORD` | Passwort des Schlüssels |

**Der Schlüssel gehört nie ins Repo.** Geht er verloren, lässt sich die App
im Play Store nicht mehr aktualisieren. Eine Sicherungskopie außerhalb von
GitHub anlegen.

Vor der Veröffentlichung in der Play Console noch zu erledigen:

* **App-ID festlegen.** In `capacitor.config.json` steht `de.example.mathfunctions`
  als Platzhalter. Sie lässt sich nach der Veröffentlichung nie wieder ändern.
* **Datensicherheit.** Das Formular fragt, welche Daten erhoben werden. Bei
  dieser App: keine. Das ist eine seltene und angenehme Antwort — die
  Content-Security-Policy in `index.html` belegt sie technisch.
* **Inhaltsangemessenheit.** Bildungs-App ohne Nutzerinhalte, damit die
  niedrigste Altersfreigabe.
* **Zielgruppe.** Sobald Kinder unter 13 zur Zielgruppe gehören, greifen die
  Regeln für Familien-Apps: keine Werbung, keine Datenerhebung. Beides trifft
  hier ohnehin zu.
* **Zielsystem.** Google verlangt jedes Jahr ein neueres `targetSdkVersion`.
  Capacitor liefert einen aktuellen Wert mit, aber die App braucht deshalb
  mindestens einmal jährlich ein Update.

### Lite und Pro im Store

Zwei Wege, beide gängig:

1. **Eine App mit In-App-Kauf** (empfohlen). Eine Store-Seite, eine
   Bewertungsliste, ein Update-Kanal. `js/billing.js` ist als Adapter dafür
   vorbereitet — Plugin installieren, Produkt-ID in der Play Console anlegen,
   fertig. Wichtig: Bereits gekaufte Pro-Versionen müssen sich
   wiederherstellen lassen, sonst steht die Nutzerin nach einem Gerätewechsel
   wieder vor der Lite-Fassung. `restore()` erledigt das beim Start.
2. **Zwei getrennte Apps.** `npm run build:lite` erzeugt die reduzierte
   Fassung mit eigenem Icon. Braucht eine zweite App-ID und doppelte Pflege
   — nur sinnvoll, wenn die Lite-Fassung bewusst deutlich schmaler sein soll.

### Trusted Web Activity als Alternative

Mit **Bubblewrap** lässt sich stattdessen die GitHub-Pages-Adresse als App
verpacken. Deutlich weniger Aufwand, aber: Die App holt ihre Inhalte beim
ersten Start aus dem Netz, und In-App-Käufe sind damit umständlicher. Für den
Anfang trotzdem ein legitimer Weg, um die App überhaupt im Store zu haben.

### Lizenz

Es liegt bewusst keine `LICENSE` bei — das ist eine Entscheidung, die du
treffen solltest. Für Unterrichtsmaterial ist MIT verbreitet; wenn
Weiterverkauf ausgeschlossen sein soll, eher CC BY-NC-SA. GitHub bietet die
Auswahl beim Anlegen der Datei direkt an.
