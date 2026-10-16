"""Draws overlay pictures (transparent PNG) for the ticker, logo plate and clock plate.
stdin JSON, "kind":
  plate : {out,w,h,plate:{type,c1,c2,angle,opacity,radius}, text?:{str,font,size,color,align,pad}, logo?:{file,pad}}
  strip : {out,h,W,text,font,size,color,gap}   -> scrolling text on a transparent strip; prints {"cycle":px,"width":px}
"""
import sys, json
import numpy as np
from PIL import Image, ImageDraw, ImageFont

req = json.loads(sys.stdin.buffer.read().decode('utf-8'))


def rgb(h):
    h = h.lstrip('#')
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], dtype=np.float32)


def plate_img(w, h, p):
    if p.get('type') == 'none':
        return Image.new('RGBA', (w, h), (0, 0, 0, 0))
    a, b = rgb(p.get('c1', '#000000')), rgb(p.get('c2', p.get('c1', '#000000')))
    if p.get('type') == 'solid':
        b = a
    ang = np.deg2rad(float(p.get('angle', 90)))
    dx, dy = np.sin(ang), -np.cos(ang)
    ys, xs = np.mgrid[0:h, 0:w].astype(np.float32)
    span = abs(w * dx) + abs(h * dy) or 1.0
    t = np.clip(((xs - w / 2) * dx + (ys - h / 2) * dy) / span + 0.5, 0, 1)[..., None]
    px = a * (1 - t) + b * t
    alpha = np.full((h, w), 255.0 * float(p.get('opacity', 1)), dtype=np.float32)
    r = max(0, min(int(p.get('radius', 0)), min(w, h) // 2))
    if r:
        S = 4
        m = Image.new('L', (w * S, h * S), 0)
        ImageDraw.Draw(m).rounded_rectangle((0, 0, w * S - 1, h * S - 1), r * S, fill=255)
        alpha *= np.array(m.resize((w, h), Image.LANCZOS), dtype=np.float32) / 255.0
    arr = np.dstack([px, alpha[..., None]]).astype(np.uint8)
    return Image.fromarray(arr, 'RGBA')


if req['kind'] == 'plate':
    w, h = int(req['w']), int(req['h'])
    if w <= 0 and req.get('text'):                                   # width from the text (label boxes)
        tf = ImageFont.truetype(req['text']['font'], int(req['text']['size']))
        w = int(tf.getlength(req['text']['str']) + 2 * int(req['text'].get('pad', 20)))
    im = plate_img(w, h, req.get('plate', {}))
    lg = req.get('logo')
    if lg:
        src = Image.open(lg['file']).convert('RGBA')
        pad = int(h * float(lg.get('pad', 0.14)))
        bw, bh = max(1, w - 2 * pad), max(1, h - 2 * pad)
        s = min(bw / src.width, bh / src.height)
        src = src.resize((max(1, round(src.width * s)), max(1, round(src.height * s))), Image.LANCZOS)
        im.alpha_composite(src, ((w - src.width) // 2, (h - src.height) // 2))
    t = req.get('text')
    if t:
        f = ImageFont.truetype(t['font'], int(t['size']))
        d = ImageDraw.Draw(im)
        col = tuple(int(x) for x in rgb(t.get('color', '#ffffff'))) + (255,)
        d.text((w / 2, h / 2), t['str'], font=f, fill=col, anchor='mm')
    im.save(req['out'])
    print(json.dumps({'width': w, 'height': h}))
elif req['kind'] == 'strip':
    h, W = int(req['h']), int(req['W'])
    f = ImageFont.truetype(req['font'], int(req['size']))
    unit_txt = req['text'].strip() + ' ' * 0
    gap = int(req.get('gap', 160))
    tw = int(f.getlength(unit_txt))
    unit = max(40, tw + gap)
    k = max(1, -(-W // unit))                       # copies per cycle so one cycle is at least a frame wide
    cycle = unit * k
    width = cycle + W
    im = Image.new('RGBA', (width, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    col = tuple(int(x) for x in rgb(req.get('color', '#ffffff'))) + (255,)
    x = 0
    while x < width:
        d.text((x, h / 2), unit_txt, font=f, fill=col, anchor='lm')
        x += unit
    im.save(req['out'])
    print(json.dumps({'cycle': cycle, 'width': width}))
