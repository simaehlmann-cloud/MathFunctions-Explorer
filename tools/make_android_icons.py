#!/usr/bin/env python3
"""
tools/make_android_icons.py  ·  Launcher-Icons fuer die Android-App (Cordova)

Erzeugt res/android/ im Aufbau, den config.xml erwartet (wie bei FairSeat):
  icon_<dichte>.png      klassisches Icon, Ecken gerundet (aeltere Android-Fassungen)
  icon_fg_<dichte>.png   Vordergrund des adaptiven Icons, Motif im Sicherheitsbereich
  colors.xml             Hintergrundfarbe des adaptiven Icons

Quelle: icons/icon-1024.png (python3 tools/make_icons.py). Die Dateien werden
eingecheckt, damit der Build-Laeufer kein Bildwerkzeug braucht.

Aufruf:  python3 tools/make_android_icons.py      (aus dem Wurzelverzeichnis)
"""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'icons' / 'icon-1024.png'
OUT = ROOT / 'res' / 'android'

# Kantenlaenge je Dichte (klassisch / adaptiver Vordergrund)
DENSITIES = {
    'ldpi': (36, 81), 'mdpi': (48, 108), 'hdpi': (72, 162),
    'xhdpi': (96, 216), 'xxhdpi': (144, 324), 'xxxhdpi': (192, 432),
}
BACKGROUND = '#0f1a33'   # = BG in tools/make_icons.py


def rounded(img: Image.Image, radius_ratio: float = 0.22) -> Image.Image:
    img = img.convert('RGBA')
    mask = Image.new('L', img.size, 0)
    r = int(min(img.size) * radius_ratio)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, img.size[0] - 1, img.size[1] - 1], radius=r, fill=255)
    out = Image.new('RGBA', img.size, (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    return out


def foreground(src: Image.Image, size: int) -> Image.Image:
    """Motiv auf 72 % der Flaeche, ringsum durchsichtig. Damit bleibt es im
    Sicherheitsbereich, egal welche Maske der Hersteller anlegt."""
    canvas = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    inner = int(size * 0.72)
    motif = src.convert('RGBA').resize((inner, inner), Image.LANCZOS)
    off = (size - inner) // 2
    canvas.paste(motif, (off, off), motif)
    return canvas


def main() -> None:
    if not SRC.exists():
        raise SystemExit(f'{SRC} fehlt. Abhilfe: python3 tools/make_icons.py')
    src = Image.open(SRC)
    OUT.mkdir(parents=True, exist_ok=True)
    for d, (px, fg) in DENSITIES.items():
        rounded(src.resize((px, px), Image.LANCZOS)).save(OUT / f'icon_{d}.png')
        foreground(src, fg).save(OUT / f'icon_fg_{d}.png')
    (OUT / 'colors.xml').write_text(
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<resources>\n'
        '    <!-- Hintergrundfarbe des adaptiven App-Icons (= Nachtblau des Motivs) -->\n'
        f'    <color name="mfe_icon_background">{BACKGROUND}</color>\n'
        '</resources>\n', encoding='utf-8')
    print(f'{len(DENSITIES) * 2 + 1} Dateien in res/android/')


if __name__ == '__main__':
    main()
