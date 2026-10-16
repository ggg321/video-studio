"""Draws the built-in news lower-third pictures (transparent outside) into data/bands/. Run: python tools/make_news_bands.py
Layout: dark glossy bar on top (flare, light streak, slanted stripes, dotted world map), thin silver strip, light panel for the text,
dark glossy bar below, glowing accent wedge at the right edge."""
import os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

W, H = 2000, 450
TOP, STRIP, BOT = 112, 126, 338           # top bar 0..TOP, silver strip TOP..STRIP, light panel STRIP..BOT, bottom bar BOT..H
OUT = os.path.join(os.path.dirname(__file__), '..', 'data', 'bands')
os.makedirs(OUT, exist_ok=True)
rng = np.random.default_rng(7)


def keyed(w, stops):
    """horizontal colour ramp from [(pos, (r,g,b)), ...]"""
    xs = np.linspace(0, 1, w)
    out = np.zeros((w, 3), np.float32)
    for c in range(3):
        out[:, c] = np.interp(xs, [p for p, _ in stops], [col[c] for _, col in stops])
    return out


def bar(h, stops, outer_dark, flip=False):
    ramp = keyed(W, stops)[None, :, :].repeat(h, 0)
    y = np.linspace(0, 1, h)[:, None, None]
    shade = 1 - outer_dark * ((1 - y) if not flip else y) ** 1.6            # darker on the outer edge, brighter toward the panel
    img = np.clip(ramp * shade, 0, 255).astype(np.uint8)
    return Image.fromarray(img, 'RGB').convert('RGBA')


def glow_layer(items, blur):
    layer = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    for kind, args, col in items:
        if kind == 'e':
            d.ellipse(args, fill=col)
        else:
            d.line(args[0], fill=col, width=args[1])
    return layer.filter(ImageFilter.GaussianBlur(blur))


def dots_map(x0, x1, y0, y1, color):
    """dotted 'world map': random continent-like blobs sampled on a dot grid"""
    blobs = [(rng.uniform(x0, x1), rng.uniform(y0, y1), rng.uniform(40, 110), rng.uniform(25, 60)) for _ in range(9)]
    layer = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    for x in range(x0, x1, 9):
        for y in range(y0, y1, 9):
            v = sum(np.exp(-(((x - bx) / rx) ** 2 + ((y - by) / ry) ** 2)) for bx, by, rx, ry in blobs)
            if v > 0.45:
                a = int(min(1, v) * 150)
                d.ellipse((x - 2.2, y - 2.2, x + 2.2, y + 2.2), fill=color + (a,))
    return layer


def stripes(d, x0, y0, y1, n=3, step=62, wid=26, skew=44):
    for k in range(n):
        xs = x0 + step * k
        d.polygon([(xs + skew, y0), (xs + skew + wid, y0), (xs + wid, y1), (xs, y1)], fill=(236, 240, 246, 235))


def build(name, stops, accent, glow, wedge_light):
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    im.paste(bar(TOP, stops, 0.55), (0, 0))
    im.paste(bar(H - BOT, stops, 0.62, flip=True), (0, BOT))
    # silver strip under the top bar
    sx = keyed(W, [(0, (118, 122, 128)), (0.5, (176, 180, 186)), (1, (205, 208, 212))])[None].repeat(STRIP - TOP, 0)
    im.paste(Image.fromarray(sx.astype(np.uint8), 'RGB').convert('RGBA'), (0, TOP))
    # light panel: white at the top, cool grey at the bottom, soft diagonal sheen on the left, grey wedge on the right
    y = np.linspace(0, 1, BOT - STRIP)[:, None]
    panel = np.dstack([255 - 30 * y ** 1.3, 255 - 20 * y ** 1.3, 255 - 8 * y ** 1.3, np.full((BOT - STRIP, 1), 255.0)]).repeat(W, 1)
    im.paste(Image.fromarray(panel.astype(np.uint8), 'RGBA'), (0, STRIP))
    sheen = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    sd = ImageDraw.Draw(sheen)
    sd.polygon([(0, STRIP), (150, STRIP), (0, BOT)], fill=(226, 232, 240, 150))
    sd.polygon([(1890, STRIP), (2000, STRIP), (2000, 300)], fill=(214, 220, 228, 170))
    im = Image.alpha_composite(im, sheen.filter(ImageFilter.GaussianBlur(16)))
    # map dots on the top bar (right) and a few on the lower bar
    im = Image.alpha_composite(im, dots_map(1150, 1860, 6, 104, (90, 160, 255)))
    # glossy flares and light streaks
    gl = [('e', (470 - 190, 72 - 20, 470 + 190, 72 + 20), glow + (150,)), ('e', (470 - 190, 392 - 20, 470 + 190, 392 + 20), glow + (150,)),
          ('l', ([(0, 72), (1980, 72)], 6), glow + (190,)), ('l', ([(0, 388), (1980, 388)], 6), glow + (190,)),
          ('l', ([(0, TOP - 8), (2000, TOP - 8)], 3), glow + (150,)), ('l', ([(0, BOT + 8), (2000, BOT + 8)], 3), glow + (150,))]
    im = Image.alpha_composite(im, glow_layer(gl, 9))
    cores = glow_layer([('e', (470 - 55, 72 - 5, 470 + 55, 72 + 5), (255, 255, 255, 190)), ('e', (470 - 55, 392 - 5, 470 + 55, 392 + 5), (255, 255, 255, 190)),
                        ('l', ([(0, 72), (1500, 72)], 2), (235, 248, 255, 255)), ('l', ([(0, 388), (1500, 388)], 2), (235, 248, 255, 255))], 1.6)
    im = Image.alpha_composite(im, cores)
    d = ImageDraw.Draw(im)
    stripes(d, 590, 8, TOP - 24)
    stripes(d, 1500, BOT + 18, H - 12)
    # accent wedge at the right edge with its glowing line
    wedge = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    wd = ImageDraw.Draw(wedge)
    wd.polygon([(1846, H), (2000, 208), (2000, H)], fill=accent + (255,))
    wd.polygon([(1884, H), (2000, 256), (2000, 360)], fill=wedge_light + (170,))
    wd.line([(1560, 388), (2000, 388)], fill=accent + (255,), width=3)
    glowl = wedge.filter(ImageFilter.GaussianBlur(7))
    im = Image.alpha_composite(im, glowl)
    im = Image.alpha_composite(im, wedge)
    im.save(os.path.join(OUT, name))


BLUE = [(0, (4, 24, 100)), (0.3, (8, 52, 150)), (0.65, (6, 66, 186)), (1, (10, 84, 206))]
RED = [(0, (96, 4, 16)), (0.3, (150, 8, 24)), (0.65, (186, 14, 30)), (1, (214, 24, 40))]
build('news1.png', BLUE, (222, 18, 28), (70, 160, 255), (255, 120, 120))
build('news2.png', RED, (10, 76, 200), (255, 140, 120), (130, 180, 255))
print('ok')
