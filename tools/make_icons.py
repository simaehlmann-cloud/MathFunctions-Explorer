"""
Erzeugt alle App-Icons aus einer Quelle.

    pip install pillow
    python3 tools/make_icons.py          # aus dem Projektwurzelverzeichnis

Motiv: die vier Funktionsklassen der App in den vier Parameterfarben.
Farben und Kurvenformen stehen als Konstanten weiter unten - wer die Palette
in style.css aendert, sollte sie hier mitziehen.
"""
from PIL import Image, ImageDraw, ImageFont
import math, pathlib

SS = 4                     # Supersampling: PIL zeichnet ohne Kantenglaettung
BG      = (15, 26, 51)     # tiefes Nachtblau, hebt alle vier Farben gleich gut ab
GRID    = (255, 255, 255, 20)
C_LIN   = (96, 165, 250)   # linear      - blau
C_QUAD  = (232, 121, 249)  # quadratisch - magenta
C_EXP   = (45, 212, 191)   # exponentiell- tuerkis
C_SIN   = (251, 191, 36)   # sinus       - amber
BADGE   = (255, 255, 255)

FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"

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

def build(size, maskable=False, lite=False):
    S = size*SS
    img = Image.new('RGBA', (S, S), (0,0,0,0))
    d = ImageDraw.Draw(img, 'RGBA')
    d.rounded_rectangle([0,0,S-1,S-1], radius=0 if maskable else int(S*0.225), fill=BG)

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

    if lite:
        # Abzeichen unten rechts, im maskable-Icon weiter nach innen
        bw, bh = (S*0.34, S*0.125) if maskable else (S*0.40, S*0.155)
        m = S*0.215 if maskable else S*0.085
        box = [S-m-bw, S-m-bh, S-m, S-m]
        d.rounded_rectangle(box, radius=bh/2, fill=BADGE)
        try:
            f = ImageFont.truetype(FONT, int(bh*0.62))
        except OSError:
            f = ImageFont.load_default()
        text = "LITE"
        l, t, r, b = d.textbbox((0,0), text, font=f)
        d.text((box[0]+(bw-(r-l))/2 - l, box[1]+(bh-(b-t))/2 - t), text, font=f, fill=BG)

    return img.resize((size, size), Image.LANCZOS)

out = pathlib.Path('icons')
out.mkdir(exist_ok=True)
jobs = [
    ('icon-192.png',              192, False, False),
    ('icon-512.png',              512, False, False),
    ('icon-maskable-512.png',     512, True,  False),
    ('icon-lite-192.png',         192, False, True),
    ('icon-lite-512.png',         512, False, True),
    ('icon-lite-maskable-512.png',512, True,  True),
]
for name, size, mask, lite in jobs:
    build(size, mask, lite).save(out/name)
print("erzeugt:", ", ".join(j[0] for j in jobs))
