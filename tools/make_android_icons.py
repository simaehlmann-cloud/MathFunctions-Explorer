#!/usr/bin/env python3
"""
tools/make_android_icons.py  ·  Launcher-Icons fuer die installierte App

WARUM ES DIESE DATEI GIBT
Die PNGs in icons/ landen ausschliesslich im Web-Manifest. Das Icon der
installierten Android-App kommt aus android/app/src/main/res/mipmap-*, und
diesen Ordner legt `npx cap add android` mit den STANDARD-Icons von Capacitor
an. Ergebnis: die App traegt auf dem Startbildschirm das Capacitor-Logo.

Erzeugt werden deshalb vollstaendige Icon-Saetze unter android-res/, die der
Workflow nach dem Anlegen des Android-Projekts einfach darueberkopiert.
Bewusst vorab erzeugt und mitgeliefert statt im Lauf gerechnet: so braucht
der Server kein Bildwerkzeug und das Ergebnis ist bei jedem Lauf dasselbe.

Aufruf:  python3 tools/make_android_icons.py
"""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'android-res'

# Kantenlaenge je Bildschirmdichte fuer ic_launcher.png und ic_launcher_round.png
DENSITIES = {
    'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192,
}
# Der Vordergrund einer adaptiven Ikone ist groesser: das System schneidet
# davon bis zu 18 % je Seite weg und animiert den Rest.
FOREGROUND = {
    'mdpi': 108, 'hdpi': 162, 'xhdpi': 216, 'xxhdpi': 324, 'xxxhdpi': 432,
}
# Hintergrundfarbe der adaptiven Ikone - dasselbe Dunkelblau wie im Motiv.
BACKGROUND = '#111a2e'

EDITIONS = {
    'pro':  ('icons/icon-512.png',      'icons/icon-maskable-512.png'),
    'lite': ('icons/icon-lite-512.png', 'icons/icon-lite-maskable-512.png'),
}


def rounded(img: Image.Image, radius_ratio: float = 0.22) -> Image.Image:
    """Ecken abrunden. Aeltere Android-Fassungen zeigen ic_launcher.png
    unveraendert an - ein hartes Quadrat faellt dort unangenehm auf."""
    img = img.convert('RGBA')
    mask = Image.new('L', img.size, 0)
    r = int(min(img.size) * radius_ratio)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, img.size[0] - 1, img.size[1] - 1], radius=r, fill=255)
    out = Image.new('RGBA', img.size, (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    return out


def circular(img: Image.Image) -> Image.Image:
    """Fuer ic_launcher_round.png."""
    img = img.convert('RGBA')
    mask = Image.new('L', img.size, 0)
    ImageDraw.Draw(mask).ellipse([0, 0, img.size[0] - 1, img.size[1] - 1], fill=255)
    out = Image.new('RGBA', img.size, (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    return out


def foreground(src: Image.Image, size: int) -> Image.Image:
    """Vordergrund der adaptiven Ikone: das Motiv auf 72 % der Flaeche in der
    Mitte, ringsum durchsichtig. Damit bleibt es im Sicherheitsbereich, egal
    welche Maske der Hersteller anlegt."""
    canvas = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    inner = int(size * 0.72)
    motif = src.convert('RGBA').resize((inner, inner), Image.LANCZOS)
    off = (size - inner) // 2
    canvas.paste(motif, (off, off), motif)
    return canvas


def build(edition: str, square_path: str, maskable_path: str) -> int:
    square = Image.open(ROOT / square_path)
    maskable = Image.open(ROOT / maskable_path)
    base = OUT / edition
    written = 0

    for density, px in DENSITIES.items():
        d = base / f'mipmap-{density}'
        d.mkdir(parents=True, exist_ok=True)
        rounded(square.resize((px, px), Image.LANCZOS)).save(d / 'ic_launcher.png')
        circular(square.resize((px, px), Image.LANCZOS)).save(d / 'ic_launcher_round.png')
        fg = FOREGROUND[density]
        foreground(maskable, fg).save(d / 'ic_launcher_foreground.png')
        written += 3

    # Adaptive Ikone: Vordergrund plus einfarbiger Hintergrund.
    anydpi = base / 'mipmap-anydpi-v26'
    anydpi.mkdir(parents=True, exist_ok=True)
    adaptive = (
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n'
        '    <background android:drawable="@color/ic_launcher_background"/>\n'
        '    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>\n'
        '    <monochrome android:drawable="@mipmap/ic_launcher_foreground"/>\n'
        '</adaptive-icon>\n'
    )
    (anydpi / 'ic_launcher.xml').write_text(adaptive, encoding='utf-8')
    (anydpi / 'ic_launcher_round.xml').write_text(adaptive, encoding='utf-8')
    written += 2

    values = base / 'values'
    values.mkdir(parents=True, exist_ok=True)
    (values / 'ic_launcher_background.xml').write_text(
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<resources>\n'
        f'    <color name="ic_launcher_background">{BACKGROUND}</color>\n'
        '</resources>\n', encoding='utf-8')
    written += 1
    return written


def main() -> None:
    for edition, (square, maskable) in EDITIONS.items():
        n = build(edition, square, maskable)
        print(f'{edition}: {n} Dateien in android-res/{edition}/')
    print('Der Workflow kopiert diese Ordner nach android/app/src/main/res/.')


if __name__ == '__main__':
    main()
