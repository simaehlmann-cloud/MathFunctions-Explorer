#!/usr/bin/env python3
"""Erzeugt aus icons/icon-1024.png den vollstaendigen iOS-Satz nach res/ios/.

    python3 tools/make_ios_icons.py      (aus dem Wurzelverzeichnis)

Uebernommen aus FairSeat. Laeuft im iOS-Workflow vor dem Build; die
erzeugten Dateien werden nicht eingecheckt.

Warum ueberhaupt ein eigenes Skript und nicht dieselben Dateien wie bei
Android:

1. iOS-App-Icons duerfen keinen Alphakanal haben. App Store Connect weist
   Uploads mit transparenten Icons zurueck – und zwar erst nach der
   Verarbeitung, wenn die Build-Nummer schon verbraucht ist. Das Skript
   legt den Kanal deshalb auf eine feste Flaeche.

2. iOS rundet die Ecken selbst. Die Quelle muss ein volles Quadrat sein;
   selbst gerundete Ecken erzeugen einen sichtbaren Rand.

3. Der Startbildschirm entsteht bei cordova-ios 6+ aus einem Storyboard.
   Ein quadratisches Bild in der Groesse 2732x2732 deckt jedes Geraet und
   beide Lagen ab; das Icon sitzt darin mittig auf der Hintergrundfarbe.

Voraussetzung: Pillow  (pip install Pillow)
Quelle:        icons/icon-1024.png (python3 tools/make_icons.py), 1024x1024
"""

import os
import sys

try:
    from PIL import Image
except ImportError:
    sys.exit("Pillow fehlt.  Abhilfe:  python3 -m pip install Pillow")

QUELLE = os.path.join("icons", "icon-1024.png")
ZIEL = os.path.join("res", "ios")

# Nachtblau des Icons (tools/make_icons.py -> BG). Dieselbe Flaeche wie
# hinter dem adaptiven Android-Icon, so sehen beide Stores gleich aus.
HINTERGRUND = (15, 26, 51)

# Startbildschirm: dieselbe Farbe - das Icon geht nahtlos in die Flaeche ueber.
SPLASH_HINTERGRUND = HINTERGRUND
SPLASH_KANTE = 2732
SPLASH_ICON_ANTEIL = 0.22   # Icon-Breite gemessen an der kuerzeren Kante

# Der von cordova-ios erwartete Satz. Mehrfach genutzte Pixelgroessen
# (40 ist 20@2x und 40@1x) stehen nur einmal drin.
GROESSEN = [20, 29, 40, 58, 60, 76, 80, 87, 120, 152, 167, 180, 1024]


def ohne_alpha(bild, farbe):
    """Legt das Bild auf eine deckende Flaeche und entfernt den Alphakanal."""
    if bild.mode != "RGBA":
        bild = bild.convert("RGBA")
    flaeche = Image.new("RGB", bild.size, farbe)
    flaeche.paste(bild, mask=bild.split()[3])
    return flaeche


def main():
    if not os.path.exists(QUELLE):
        sys.exit("%s fehlt. Abhilfe: python3 tools/make_icons.py" % QUELLE)
    print("Quelle: %s" % QUELLE)

    quelle = Image.open(QUELLE)
    if quelle.width != quelle.height:
        sys.exit(
            "%s ist %dx%d und damit nicht quadratisch. iOS verlangt "
            "quadratische Icons." % (QUELLE, quelle.width, quelle.height)
        )
    if quelle.width < 1024:
        sys.exit("%s ist nur %dpx breit; Apple verlangt 1024px." % (QUELLE, quelle.width))

    os.makedirs(ZIEL, exist_ok=True)
    basis = ohne_alpha(quelle, HINTERGRUND)

    for kante in GROESSEN:
        ziel = os.path.join(ZIEL, "icon-%d.png" % kante)
        basis.resize((kante, kante), Image.LANCZOS).save(ziel, "PNG")
        print("  %s  (%dx%d)" % (ziel, kante, kante))

    # ---- Startbildschirm ----
    splash = Image.new("RGB", (SPLASH_KANTE, SPLASH_KANTE), SPLASH_HINTERGRUND)
    icon_kante = int(SPLASH_KANTE * SPLASH_ICON_ANTEIL)
    # Fuer den Splash bleibt die Transparenz erhalten, damit das Icon auf dem
    # dunklen Grund freigestellt wirkt statt auf einer hellen Kachel zu sitzen.
    icon = quelle.convert("RGBA").resize((icon_kante, icon_kante), Image.LANCZOS)
    versatz = (SPLASH_KANTE - icon_kante) // 2
    splash.paste(icon, (versatz, versatz), icon)

    splash_ziel = os.path.join(ZIEL, "Default@2x~universal~anyany.png")
    splash.save(splash_ziel, "PNG")
    print("  %s  (%dx%d)" % (splash_ziel, SPLASH_KANTE, SPLASH_KANTE))

    # ---- Kontrolle ----
    fehler = []
    for kante in GROESSEN:
        pruef = Image.open(os.path.join(ZIEL, "icon-%d.png" % kante))
        if pruef.mode not in ("RGB", "L"):
            fehler.append("icon-%d.png hat Modus %s" % (kante, pruef.mode))
        if pruef.size != (kante, kante):
            fehler.append("icon-%d.png ist %dx%d" % (kante, pruef.width, pruef.height))
    if fehler:
        sys.exit("Kontrolle fehlgeschlagen:\n  " + "\n  ".join(fehler))

    print("\n%d Icons und 1 Startbild geschrieben, alle ohne Alphakanal."
          % len(GROESSEN))


if __name__ == "__main__":
    main()
