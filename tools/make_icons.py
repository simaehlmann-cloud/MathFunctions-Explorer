"""
Erzeugt alle App-Icons aus einer Quelle.

    pip install pillow
    python3 tools/make_icons.py          # aus dem Projektwurzelverzeichnis

Motiv: die vier Funktionsklassen der App in den vier Parameterfarben.
Farben und Kurvenformen stehen als Konstanten weiter unten - wer die Palette
in style.css aendert, sollte sie hier mitziehen.
"""
from PIL import Image, ImageDraw
import math, pathlib

SS = 4                     # Supersampling: PIL zeichnet ohne Kantenglaettung
BG      = (15, 26, 51)     # tiefes Nachtblau, hebt alle vier Farben gleich gut ab
GRID    = (255, 255, 255, 20)
C_LIN   = (96, 165, 250)   # linear      - blau
C_QUAD  = (232, 121, 249)  # quadratisch - magenta
C_EXP   = (45, 212, 191)   # exponentiell- tuerkis
C_SIN   = (251, 191, 36)   # sinus       - amber

def thick(d, pts, width, fill):
    """Dicke Linie als Polygon. PILs line(width=) hinterlaesst an
    Segmentgrenzen Kerben, die auch nach dem Verkleinern sichtbar bleiben."""
    left, right = [], []
    n = len(pts)
    for i, (x, y) in enumerate(pts):
        if i == 0:            dx, dy = pts[1][0]-x, pts[1][1]-y
        elif i == n-1:        dx, dy = x-pts[-2][0], y-pts[-2][1]
        else:                 dx, dy = pts[i+1][0]-pts[i-1][0], pts[i+1][1]-pts[i-1][1]
        L = math.hypot(dx, dy) or 1
        nx, ny = -dy/L*width/2, dx/L*width/2
        left.append((x+nx, y+ny)); right.append((x-nx, y-ny))
    d.polygon(left + right[::-1], fill=fill)
    for p in (pts[0], pts[-1]):
        d.ellipse([p[0]-width/2, p[1]-width/2, p[0]+width/2, p[1]+width/2], fill=fill)

def build(size, maskable=False, store=False):
    """store=True: App-Store-Icon. Volles Quadrat ohne Rundung und ohne
    Alphakanal - iOS rundet selbst, und App Store Connect weist Icons mit
    Transparenz zurueck (erst nach der Verarbeitung, Build-Nummer verbraucht)."""
    S = size*SS
    img = Image.new('RGBA', (S, S), (0,0,0,0))
    d = ImageDraw.Draw(img, 'RGBA')
    d.rounded_rectangle([0,0,S-1,S-1], radius=0 if (maskable or store) else int(S*0.225), fill=BG)

    # Sicherer Bereich: maskable-Icons werden von Android beschnitten
    pad = S*0.205 if maskable else S*0.155
    W = S - 2*pad
    cx, cy = S/2, S/2
    ux = W/2 / 3.2            # Einheiten pro Pixel, x in [-3.2, 3.2]
    uy = W/2 / 3.2

    # Raster nur angedeutet, Achsen etwas kraeftiger
    gw = max(1, int(S*0.005))
    for k in (-2, -1, 1, 2):
        d.line([cx+k*ux*1.5, cy-W/2, cx+k*ux*1.5, cy+W/2], fill=GRID, width=gw)
        d.line([cx-W/2, cy+k*uy*1.5, cx+W/2, cy+k*uy*1.5], fill=GRID, width=gw)
    d.line([cx-W/2, cy, cx+W/2, cy], fill=(255,255,255,80), width=int(gw*1.8))
    d.line([cx, cy-W/2, cx, cy+W/2], fill=(255,255,255,80), width=int(gw*1.8))

    lw = max(3, int(S*0.047))
    def points(f, x0, x1, n=260):
        out = []
        for i in range(n+1):
            x = x0 + (x1-x0)*i/n
            y = f(x)
            if abs(y) > 3.3: continue
            out.append((cx + x*ux, cy - y*uy))
        return out

    # Erst alle Saeume in Hintergrundfarbe, dann die Farben darueber: so
    # bleiben die vier Kurven auch dort unterscheidbar, wo sie sich kreuzen.
    curves = [
        (points(lambda x: 0.92*x + 0.15, -3.1, 3.1),        C_LIN),
        (points(lambda x: 0.58*x*x - 2.55, -3.1, 3.1),      C_QUAD),
        (points(lambda x: 0.5*2.15**x - 2.75, -3.1, 2.75),  C_EXP),
        (points(lambda x: 2.0*math.sin(1.05*x), -3.1, 3.1), C_SIN),
    ]
    for pts, _ in curves:
        if len(pts) > 1: thick(d, pts, lw*1.75, BG + (255,))
    for pts, col in curves:
        if len(pts) > 1: thick(d, pts, lw, col)

    out = img.resize((size, size), Image.LANCZOS)
    if store:
        flat = Image.new('RGB', out.size, BG)
        flat.paste(out, (0, 0), out)
        out = flat
    return out

out = pathlib.Path('icons')
out.mkdir(exist_ok=True)
# Die Web-Icons (192/512/maskable) werden nur auf ausdruecklichen Wunsch neu
# erzeugt: die eingecheckten Dateien weichen leicht von dieser Quelle ab
# (deutlicheres Raster), und ein stilles Ueberschreiben veraendert das Icon
# der installierten PWA.  ->  python3 tools/make_icons.py --web
import sys
jobs = [('icon-1024.png', 1024, False, True)]
if '--web' in sys.argv:
    jobs += [
        ('icon-192.png',          192, False, False),
        ('icon-512.png',          512, False, False),
        ('icon-maskable-512.png', 512, True,  False),
    ]
for name, size, mask, store in jobs:
    build(size, mask, store).save(out/name)
print("erzeugt:", ", ".join(j[0] for j in jobs))
