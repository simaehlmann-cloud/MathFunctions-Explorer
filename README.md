# MathFunctions Explorer v6.3

Interaktiver Funktionenplotter für den Mathematikunterricht ab Klasse 7.
Läuft vollständig im Browser oder als Android-App — ohne Server, ohne Konto,
ohne einen einzigen Netzwerkzugriff im laufenden Betrieb.

---

## Schnellstart

```bash
python3 -m http.server 8000     # oder: npm run serve
```

Dann `http://localhost:8000` öffnen. Ein Doppelklick auf `index.html`
funktioniert auch (`file://`), nur ohne Service Worker.

---

## Was in v6.3 berichtigt wurde

**Das empfohlene Billing-Plugin existiert nicht.** In `billing.js` und in
dieser Datei stand `npm install @capacitor-community/in-app-purchases` — dieses
Paket gibt es auf npm nicht, der Befehl endet in einem 404. Der Adapter ist auf
**`cordova-plugin-purchase`** umgebaut, das es wirklich gibt, gepflegt wird und
unter Capacitor läuft. Die API (`CdvPurchase.store`) ist eine andere, deshalb
ist die Datei neu geschrieben statt umbenannt.

**Der Store-Verweis führte auf eine Fehlerseite.** Solange die Pro-Ausgabe
nicht veröffentlicht ist, landete jeder Klick auf „Pro-Ausgabe ansehen" bei
Google im Nichts — und die App wirkte kaputt. Neu: `STORE_LIVE` in
`licence.js` und `BILLING_READY` in `billing.js`. Beide stehen auf `false`;
die App sagt dann ehrlich, dass es die Pro-Ausgabe noch nicht gibt.

> **Vor der Veröffentlichung beide auf `true` setzen.** Sonst kann niemand
> kaufen, obwohl alles andere bereit ist.

**In Lite stand Gesperrtes vor Nutzbarem.** Sieben von neun Klassen sind dort
gesperrt; man scrollte an lauter PRO-Karten vorbei, bevor etwas Anklickbares
kam. Die Startseite sortiert jetzt Freigeschaltetes nach oben, getrennt durch
eine Zeile „In der Pro-Ausgabe enthalten". Die fachliche Reihenfolge innerhalb
beider Gruppen bleibt erhalten.

**Fachjargon in den Parametertexten.** „Formfaktor", „Linearer Koeffizient",
„Frequenz" sind meine Wörter, nicht die eines Schulbuchs. Ersetzt durch
Formulierungen, die sagen, was passiert. Nebenbei Minuszeichen und π
vereinheitlicht.

**Beamer-Modus:** Gitter und Achsen sind jetzt deutlich stärker (Gitter von
1,2:1 auf 1,8:1 im hellen, 2,2:1 im dunklen Modus; Achse von 10,4:1 auf
18,7:1). Ein Gitter mit 1,2:1 ist am Bildschirm angenehm zurückhaltend und auf
einer Leinwand schlicht nicht vorhanden.

**Die Farbprüfung lief auf einer halben Palette.** `tools/check.mjs` suchte
nach dem Selektor `:root` — das Stylesheet schreibt aber
`:root, :root[data-theme="light"]`, und der davorstehende Kommentarblock wurde
mit in den Selektor gezogen. Der Prüfer sah die hellen Kurvenfarben nie. Jetzt
werden Kommentare entfernt, zusammengesetzte Selektoren aufgelöst und **alle
vier Kombinationen** geprüft (hell/dunkel × normal/Beamer), zusätzlich der
Kontrast jeder Linie gegen den Zeichenuntergrund.

---

## Was in v6.2 berichtigt wurde

**Die deutschen Texte hatten keine Umlaute.** Auf dem Telefon stand „Ueber
MathFunctions Explorer", „fuer wen sie gedacht ist", „Spaeter", „Laeuft". Die
Ursache lag nicht im Code, sondern in meinen Bearbeitungsskripten: ich hatte
die Texte ASCII-sicher eingefügt und nie zurückgewandelt. 94 Zeilen berichtigt
— über eine geprüfte Wortliste, nicht per pauschalem Suchen-und-Ersetzen, denn
„Klasse", „dass", „muss", „Fassung" und vor allem „Koeffizient" werden im
Deutschen wirklich so geschrieben. Das Englische blieb unberührt.

`npm run check` prüft das jetzt dauerhaft: jedes Wort im deutschen Wörterbuch,
das nach umschriebenem Umlaut aussieht und nicht in der Ausnahmeliste steht,
lässt den Selbsttest fehlschlagen.

---

## Was in v6.1 berichtigt wurde

Vier Befunde aus dem Test auf einem echten Gerät:

**Der Zurück-Knopf beendete die App weiterhin.** `js/nav.js` war fertig, aber
`@capacitor/app` fehlte in den Abhängigkeiten — ohne dieses Plugin gibt es gar
kein `backButton`-Ereignis, und die WebView beendet die App beim ersten Druck.
Plugin ergänzt; die Entscheidung hängt jetzt an der selbst gezählten
Verlaufstiefe statt an `canGoBack` der WebView, denn dort zählen auch fremde
Einträge mit. Fehlt das Plugin, steht künftig eine Warnung in der Konsole.

**Die installierte App trug das Capacitor-Logo.** Die PNGs in `icons/` landen
ausschließlich im Web-Manifest; das Launcher-Icon kommt aus
`android/app/src/main/res/mipmap-*`, und diesen Ordner legt `npx cap add
android` mit den Standardicons an. `tools/make_android_icons.py` erzeugt
vollständige Sätze (fünf Dichten, rund, adaptiv mit Vordergrund und
Hintergrundfarbe) nach `android-res/pro` und `android-res/lite`; der Workflow
kopiert sie nach dem Anlegen des Projekts darüber. Bewusst vorab erzeugt und
mitgeliefert — so braucht der Server kein Bildwerkzeug.

**„Eine neue Fassung steht bereit" erschien in der installierten App.** Der
Service Worker ist dort sinnlos, weil die Dateien ohnehin im Paket liegen —
und jede App-Aktualisierung brachte eine neue `sw.js` mit, die wartete. Auf
nativen Plattformen wird er nicht mehr registriert.

**Die Auswahlliste führt jetzt alle neun Funktionsklassen**, nach Klasse
gruppiert. Vorher zeigte sie nur die Darstellungsformen der aktuellen Klasse;
um von einer Parabel zu einer Sinuskurve zu kommen, musste man zurück zur
Startseite. Gesperrte Klassen bleiben sichtbar, tragen `– PRO` und führen bei
Auswahl zum Hinweis, statt stillschweigend verschluckt zu werden.

---

## Was in v6 neu ist

**Der Zurück-Knopf beendet nicht mehr die App.** Das war ein echter Fehler:
es gab überhaupt keine Verlaufsverwaltung, nur `replaceState()` für den
Zustand im Hash. Auf Android schloss Zurück die App — aus dem Quiz-Abspieler,
aus dem Editor, aus dem Impressum. Jetzt liegt jeder Bildschirm als eigener
Eintrag im Verlauf (`js/nav.js`), ein offener Dialog wird zuerst geschlossen,
und erst auf der Startseite beendet Zurück die App — nativ nach zweimaligem
Drücken.

> Wer später an `syncHash()` arbeitet: `history.replaceState()` **muss**
> `history.state` weiterreichen. Darin liegt die Wegmarke von `nav.js`.

**Der Arbeitsstand überlebt einen Neustart.** Kurve, Parameter, Ausschnitt,
Anzeigeoptionen und der zuletzt offene Reiter liegen in einem eigenen
Speicherschlüssel (30 Tage). Ein Deep Link schlägt den gespeicherten Stand —
wer einen Link öffnet, will das Verlinkte sehen.

**Quiz-Sicherung als Datei.** Selbst gebaute Quizze lagen ausschließlich im
`localStorage`. Jetzt: *Alle Quizze sichern* schreibt eine JSON-Datei,
*Sicherung einlesen* holt sie zurück — jedes Quiz einzeln geprüft, neue
Kennungen, Bestehendes bleibt.

**QR-Codes sind ein Drittel so groß.** Statt JSON → UTF-8 → Base64 jetzt ein
festes Binärformat mit Zickzack-Varints. Gemessen an 400 Zufallsquizzen: 69 %
kürzer. In QR-Versionen:

| Aufgaben | vorher | jetzt |
|---|---|---|
| 3 | v17 | **v8** |
| 10 | v26 | **v13** |
| 20 | v36 | **v17** |
| 30 | passte nicht | **v22** |

Links im alten Format bleiben lesbar (Kennbyte `{` gegen `0x4D`).

**Tangens** als zweite trigonometrische Form, mit Polstellen im sichtbaren
Bereich — der Renderer setzt dort den Stift ab, statt eine senkrechte Linie
zu ziehen.

**Der Graph ist bedienbar ohne Zeiger und beschreibbar ohne Augen.**
Pfeiltasten verschieben, `+`/`−` zoomen, `F` passt an, `Pos1` setzt zurück,
`Alt`+Pfeil bewegt die Tangente. Dazu eine mitlaufende Textbeschreibung für
Screenreader: Gleichung, Verlauf, Nullstellen, y-Achsenabschnitt,
Scheitelpunkt, Ausschnitt.

**Arbeitsblatt drucken**: Graph als Bild, Wertetabelle, Namensfeld und
Linien für den Rechenweg. Eigenes Druck-Stylesheet, alles andere wird
ausgeblendet.

**Falsche Aufgaben wiederholen** nach der Auswertung, und der Ergebnistext
nennt jede Aufgabe mit ✓ oder ✗.

**Aktualisierungen übernehmen nicht mehr mitten in der Sitzung.** Der Service
Worker wartet auf Zustimmung, statt `skipWaiting()` sofort auszuführen.

**Toleranz beim Prüfen** von 2 % auf 1 % relativ, an einer Stelle
(`MFE.math.tolerance`) statt in drei Kopien. Bei einer Wachstumsaufgabe mit
y = 1000 hieß 2 % eine erlaubte Abweichung von 20.

**Die Wertetabelle wird nur noch gerechnet, wenn ihr Reiter sichtbar ist.**
Bei 500 Zeilen und gedrücktem Strg+Z war sie der Flaschenhals.

---

## Was in v5 neu war

**Der Ausschnitt ist frei einstellbar.** Vorher gab es nur ±a auf beiden
Achsen, y höchstens ±50. Damit war das Beispiel, das die App selbst erklärt —
*„a = 100 bei einer Bakterienkultur"* — schlicht nicht darstellbar. Jetzt ist
der Ausschnitt ein Rechteck aus vier Zahlen, dazu:

- Zwei Finger zum Zoomen, Ziehen zum Verschieben, Doppeltipp, Mausrad
  (mit `Shift` nur waagerecht, mit `Alt` nur senkrecht), `+` und `−`
- **Passend zoomen** rechnet den y-Bereich aus den tatsächlichen Werten aus.
  Ausreißer an Polstellen fallen über Quantile heraus, damit eine Hyperbel
  den Bereich nicht sprengt.
- Voreinstellungen: Standard, Trigonometrie (−2π…2π), Wachstum (0…1000),
  Nur positiv, Feinbereich
- Achsenpfeile und die Beschriftungen *x* und *y*, Nachkommastellen der
  Achsenteilung passen sich dem Zoom an

**Fünf neue Funktionsklassen**: ganzrational dritten Grades, Wurzel, Betrag,
Logarithmus, gebrochenrational. Neun statt vier. Der Renderer setzt an
Polstellen und Definitionslücken den Stift ab, statt eine senkrechte Linie zu
ziehen; die Nullstellensuche unterscheidet einen Vorzeichenwechsel *durch*
null von einem Sprung *über* null.

**Ableitung und Tangente.** f′ als gestrichelte Kurve, dazu ein verschiebbarer
Tangentenpunkt, der die Steigung anzeigt. Numerischer zentraler
Differenzenquotient — analytische Ableitungen für jede Form zu pflegen liefe
über kurz oder lang auseinander.

**Trace**: mit dem Finger am Graphen entlang, Koordinaten werden angezeigt.

**Wertetabelle mit Δy und Quotienten.** Konstante Differenz heißt linear,
konstanter Quotient heißt exponentiell — das sieht man jetzt in der Tabelle,
statt es glauben zu müssen.

**Quiz**: Zufallsquiz auf Knopfdruck (Klasse, Anzahl, Aufgabentypen wählbar),
**QR-Code** zum Weitergeben im Klassenraum, Auswertung mit ✓/✗ je Aufgabe und
als kopierbarer Text.

**Optik**: Die Startseitenkarten zeichnen echte Miniaturgraphen mit derselben
Routine wie der Explorer. **Beamer-Modus** (▣ in der Kopfzeile) vergrößert
Linien, Schrift und Bedienelemente. Regler rasten leicht auf glatten Werten
ein, mit kurzem Vibrationsimpuls, wo das Gerät es kann.

---

## Was in v4 neu war

**Bedienung am Telefon.** Das war der Auslöser: Wer am Regler zog, sah den
Graphen nicht mehr. Drei Änderungen zusammen lösen das.

1. Koordinatensystem, Gleichung und Regler stehen jetzt in *einem* Block
   (`.canvas-panel`) direkt untereinander.
2. Das Koordinatensystem bleibt beim Scrollen unter der Reiterleiste kleben
   (`position: sticky`). Die Höhe von Kopfzeile und Reitern wird zur Laufzeit
   gemessen und als CSS-Variable gesetzt — feste Pixelwerte gehen bei anderer
   Schriftgröße daneben.
3. Eine Reglerzeile braucht nur noch eine Zeile statt zwei: Buchstabe,
   Regler, Zahlenfeld und Abspielknopf liegen nebeneinander im Raster.
   Auch bei vier Parametern (Sinus) passt alles gleichzeitig ins Bild.

Selten Gebrauchtes — Anzeigeoptionen, Achsen, Export — liegt darunter in
aufklappbaren Abschnitten.

**Quiz-Baukasten** (`js/quiz.js`, eigenes Feld auf der Startseite). Sechs
Aufgabentypen, damit ein Quiz nicht nach der dritten Frage vorhersehbar wird:

| Typ | Aufgabe |
|---|---|
| Zuordnen | Graph gegeben, welche Gleichung passt? |
| Nachbauen | Graph gegeben, Regler passend einstellen |
| Wert berechnen | f(x₀) ausrechnen |
| Ablesen | Nullstelle, y-Achsenabschnitt oder Scheitelpunkt |
| Wahr oder falsch | Aussage über den Graphen beurteilen |
| Freie Frage | eigene Frage mit eigenen Antwortmöglichkeiten |

Quizze liegen im `localStorage` und lassen sich als Link weitergeben (das Quiz
steht im Fragment, geht also nicht an einen Server). Alles, was über einen
Link hereinkommt, läuft durch `sanitizeQuiz()` — Typ, Wertebereich und Länge
werden geprüft, bevor irgendetwas übernommen wird.

**Impressum, Datenschutz und „Über die App"** liegen als eigene Seiten bei
(`impressum.html`, `datenschutz.html`, `ueber.html`, gemeinsames `recht.css`).
Sie werden mit in die App gepackt und funktionieren offline. Zusätzlich gibt
es einen Info-Bildschirm in der App selbst, der die Sprache mitmacht und
anzeigt, welche Ausgabe gerade läuft.

**Lite und Pro** sind jetzt auch bei den Funktionsklassen getrennt.

**Selbsttests** (`npm test`) prüfen ohne Browser, ob Element-IDs,
Übersetzungsschlüssel und Dateilisten zusammenpassen, und klicken die App in
jsdom durch.

---

## Aufbau

```
index.html               Gerüst aller Bildschirme
style.css                sämtliche Farben und das gesamte Layout
recht.css                Stylesheet der Rechtsseiten (bewusst eigenständig)
impressum.html           Anbieterkennzeichnung nach § 5 DDG
datenschutz.html         Datenschutzerklärung, deutsch und englisch
ueber.html               ausführliche Fassung von „Über die App"
sw.js                    Service Worker für den Offline-Betrieb
manifest.webmanifest     PWA-Manifest (Pro)
manifest-lite.webmanifest        dasselbe für Lite

js/licence.js            Weiche Lite/Pro, Verweis in den Play Store
js/billing.js            Adapter für den Kauf über Google Play
js/i18n.js               alle Texte, deutsch und englisch
js/functions.js          Zahleneingabe und Funktionskatalog
js/graph.js              Renderer, Ausschnitt, Ableitung, Nullstellensuche
js/nav.js                Bildschirmverlauf und Zurück-Knopf
js/qr.js                 QR-Erzeugung, gegen eine Referenzbibliothek geprüft
js/ui.js                 DOM-Helfer, Kurzmeldung, Reglergruppe
js/quiz.js               Quiz-Baukasten: Speicher, Editor, Abspieler
js/app.js                Zustand, Explorer, Wertetabelle, Navigation

tools/build-www.mjs      erzeugt www/ in der Ausgabe pro oder lite
tools/check.mjs          statischer Abgleich (IDs, Sprachen, Dateilisten)
tools/smoke.mjs          Klickdurchlauf in jsdom
tools/qr-selftest.mjs    QR gegen hinterlegte Referenzcodes
tools/qr-verify.mjs      QR modulweise gegen eine fremde Bibliothek
tools/quiz-codec.mjs     Quiz-Kodierung: verlustfrei, kompakt, robust
tools/make_icons.py      erzeugt die Web-Icons neu (braucht Pillow)
tools/make_android_icons.py  erzeugt die Launcher-Icons nach android-res/
android-res/             fertige Launcher-Icons, vom Workflow übernommen
```

Bewusst **ohne ES-Module**: Alle Dateien hängen sich an ein gemeinsames
`window.MFE`. So startet die App auch von einem USB-Stick über `file://`, wo
`import` an der CORS-Regel scheitern würde. Die Reihenfolge der `<script>`-Tags
in `index.html` ist damit die Ladereihenfolge und nicht beliebig.

---

## Lite und Pro

Ein Quellcodezweig, zwei Ausgaben:

```bash
npm run build        # Pro
npm run build:lite   # Lite
```

Das Skript nimmt genau vier Eingriffe vor: `DEV_EDITION` in `js/licence.js`,
Manifest und Icon-Verweise in `index.html`, Cache-Name in `sw.js`. Zwei
getrennte Zweige liefen erfahrungsgemäß innerhalb weniger Wochen auseinander.

Was zur Pro-Ausgabe gehört, steht an genau einer Stelle — `PRO_FEATURES` in
`js/licence.js`. Die Oberfläche fragt ausschließlich über `licence.has(...)`:

`cat.quadratic` · `cat.polynomial` · `cat.logarithm` · `cat.trig` ·
`cat.root` · `cat.absolute` · `cat.rational` · `calculus` · `quizBuilder` ·
`randomQuiz` · `ownQuiz` · `practice` · `secondCurve` · `export` · `share` ·
`drag` · `transform`

Gesperrte Bedienelemente tragen ein PRO-Abzeichen; ein Klick öffnet einen
Hinweis mit Verweis auf die Pro-Ausgabe im Play Store.

> **Wichtig und unverändert:** `licence.js` ist eine Weiche für die
> Oberfläche, **kein Kopierschutz**. Wer die Entwicklerkonsole öffnet, ruft
> `MFE.licence.setEdition('pro')` auf und hat Pro. Belastbar wird das erst,
> wenn der Play-Billing-Token serverseitig gegen die Google Play Developer API
> geprüft wird. Der Anschlusspunkt dafür ist `verifyWithServer()`. Für eine
> Schul-App ist die jetzige Lösung meist hinnehmbar — man sollte nur wissen,
> was man hat.

Auch ein Deep Link kann die Sperre nicht umgehen: `readHash()` prüft die
Funktionsklasse, bevor es einen Zustand übernimmt.

---

## Tests

```bash
npm install     # einmalig, zieht jsdom
npm test
```

`tools/check.mjs` findet drei Fehlerarten, die sich hier am häufigsten
einschleichen: eine gesuchte Element-ID, die es im HTML nicht mehr gibt; ein
Übersetzungsschlüssel, der in einer Sprache fehlt; eine Datei, die im Service
Worker steht, aber nicht existiert (ein einziger 404 lässt die gesamte
Offline-Installation scheitern).

`tools/check.mjs` prüft außerdem, dass keine CSS-Variable in einem Block
zweimal gesetzt wird (die spätere gewinnt lautlos) und dass alle acht
Linienfarben in beiden Farbschemata mindestens ΔE 25 auseinanderliegen —
sonst sind sie auf einem Beamer nicht zu unterscheiden.

`tools/qr-selftest.mjs` vergleicht die QR-Matrizen mit hinterlegten
Referenzcodes. Diese stammen aus `tools/qr-verify.mjs`, das modulweise gegen
die Python-Bibliothek `qrcode` abgleicht — 36 Fälle über die Versionen 1 bis
34 und alle vier Fehlerkorrekturstufen, jedes Modul identisch.

`tools/smoke.mjs` startet die App in jsdom und klickt sie durch — Explorer,
Regler, Brucheingabe, Wertetabelle, Quiz, Baukasten mit drei Aufgaben,
Speichern, Link-Kodierung, Abspielen, Sprachwechsel. Einmal als Pro, einmal
als Lite, dort mit der Erwartung, dass die Sperren greifen.

---

## Android: APK und AAB

Verpackt wird mit **Capacitor**: Die Web-Dateien liegen *in* der App, es wird
nichts nachgeladen.

### Über GitHub (kein Android Studio nötig)

`.github/workflows/android.yml` läuft bei jedem Push auf `main` und auf Klick
unter *Actions → Android → Run workflow*. Ergebnis: je eine **Debug-APK** für
Pro und Lite, herunterzuladen unter *Artifacts*. Die lässt sich direkt auf ein
Telefon ziehen und installieren — ohne Keystore.

Sobald der Keystore existiert, vier Secrets hinterlegen
(*Settings → Secrets and variables → Actions*):

| Secret | Inhalt |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | `base64 -w0 mein.keystore` |
| `ANDROID_KEYSTORE_PASSWORD` | Passwort des Keystores |
| `ANDROID_KEY_ALIAS` | Alias des Schlüssels |
| `ANDROID_KEY_PASSWORD` | Passwort des Schlüssels |

Ein Tag `v4.0.1` erzeugt dann zusätzlich **signierte APK und signiertes AAB**
und hängt beide an die GitHub-Release. Fehlen die Secrets, läuft der Lauf
trotzdem grün durch und legt die unsignierten Dateien ab.

Keystore erzeugen:

```bash
keytool -genkeypair -v -keystore mein.keystore -alias mathfunctions \
        -keyalg RSA -keysize 4096 -validity 10000
```

> Geht dieser Schlüssel verloren, lässt sich die App im Play Store **nie
> wieder** aktualisieren. Sicherungskopie außerhalb von GitHub aufbewahren.
> `.gitignore` sperrt `*.keystore` und `*.jks` bereits.

### Lokal

```bash
npm install
npm run android:add      # legt android/ an (einmalig)
npm run android:open     # öffnet Android Studio
```

Der Ordner `android/` fehlt absichtlich im Repo — er wird erzeugt. Der
Workflow legt ihn selbst an, wenn er fehlt.

### Anwendungskennung

`capacitor.config.json` steht auf `de.wisdompeak.mathfunctions`. Die
Lite-Ausgabe bekommt im Workflow automatisch `.lite` angehängt, damit beide
nebeneinander im Play Store stehen und gleichzeitig installiert sein können.
Der Verweis in den Store zeigt in beiden Ausgaben auf die **Pro**-Kennung —
das ist Absicht und steht so in `js/licence.js`.

---

## Vor der Veröffentlichung

- [ ] Anwendungskennung prüfen (`capacitor.config.json`, `PRO_APP_ID` in `js/licence.js`)
- [ ] `PRODUCT_ID` in `js/billing.js` gegen die Play Console abgleichen
- [ ] Billing-Plugin installieren: `npm install cordova-plugin-purchase`
- [ ] `STORE_LIVE` in `js/licence.js` und `BILLING_READY` in `js/billing.js` auf `true`
- [ ] Impressum und Datenschutzerklärung von jemandem mit Zulassung durchsehen lassen
- [ ] Datenschutz-Formular der Play Console ausfüllen (Antwort: keine Datenerhebung)
- [ ] Keystore anlegen, sichern, Secrets hinterlegen
- [ ] Auf einem echten Telefon testen — jsdom kann kein Canvas

---

## Datenschutz in einem Satz

Es gibt keinen Server. Einstellungen, Buchstaben und eigene Quizze liegen im
`localStorage` des Geräts. Der einzige Netzwerkzugriff, den die App überhaupt
auslösen kann, ist der Kauf der Pro-Ausgabe über Google Play und der Verweis
in den Store. Einzelheiten in `datenschutz.html`.

## Lizenz

Eigene Inhalte und Code: Simon Mählmann, Wisdompeak Apps.
Fremdbestandteil: Capacitor (MIT).
