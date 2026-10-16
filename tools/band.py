"""Draw the caption band as a transparent PNG: gradient / solid / picture, rounded corners, opacity.
stdin: {"out","w","h","type","c1","c2","angle","opacity","radius","image"}"""
import sys, json
import numpy as np
from PIL import Image, ImageDraw

req = json.loads(sys.stdin.buffer.read().decode('utf-8'))
w, h = int(req['w']), int(req['h'])
op = max(0.0, min(1.0, float(req.get('opacity', 1))))
radius = max(0, min(int(req.get('radius', 0)), min(w, h) // 2))


def rgb(hexs):
    hexs = hexs.lstrip('#')
    return np.array([int(hexs[i:i + 2], 16) for i in (0, 2, 4)], dtype=np.float32)


if req.get('type') == 'image' and req.get('image'):
    src = Image.open(req['image']).convert('RGBA')
    # trim plain white / transparent margins around the picture (common in exported banners)
    rgbm = np.array(src.convert('RGB')).min(axis=2) < 245
    solid = rgbm & (np.array(src.getchannel('A')) > 10)
    if solid.any() and not solid.all():
        ys_, xs_ = np.where(solid)
        if (ys_.max() - ys_.min()) > 8 and (xs_.max() - xs_.min()) > 8:
            src = src.crop((int(xs_.min()), int(ys_.min()), int(xs_.max()) + 1, int(ys_.max()) + 1))
    s = max(w / src.width, h / src.height)
    src = src.resize((max(w, round(src.width * s)), max(h, round(src.height * s))), Image.LANCZOS)
    l, t = (src.width - w) // 2, (src.height - h) // 2
    img = src.crop((l, t, l + w, t + h))
else:
    a, b = rgb(req.get('c1', '#000000')), rgb(req.get('c2', req.get('c1', '#000000')))
    if req.get('type') == 'solid':
        b = a
    ang = np.deg2rad(float(req.get('angle', 90)))                    # CSS angle: 0 = towards the top, 90 = towards the right
    dx, dy = np.sin(ang), -np.cos(ang)
    ys, xs = np.mgrid[0:h, 0:w].astype(np.float32)
    span = abs(w * dx) + abs(h * dy) or 1.0
    tt = np.clip(((xs - w / 2) * dx + (ys - h / 2) * dy) / span + 0.5, 0, 1)[..., None]
    px = a * (1 - tt) + b * tt
    img = Image.fromarray(np.dstack([px, np.full((h, w, 1), 255, dtype=np.float32)]).astype(np.uint8), 'RGBA')

bright = float(req.get('bright', 1))
if abs(bright - 1) > 0.01:
    rgbv = np.array(img.convert('RGB'), dtype=np.float32) * bright
    a0 = img.getchannel('A')
    img = Image.fromarray(np.clip(rgbv, 0, 255).astype(np.uint8), 'RGB').convert('RGBA')
    img.putalpha(a0)
alpha = np.array(img.getchannel('A'), dtype=np.float32) / 255.0 * op
if radius:
    S = 4
    m = Image.new('L', (w * S, h * S), 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, w * S - 1, h * S - 1), radius * S, fill=255)
    alpha *= np.array(m.resize((w, h), Image.LANCZOS), dtype=np.float32) / 255.0
img.putalpha(Image.fromarray((alpha * 255).astype(np.uint8), 'L'))
img.save(req['out'])
