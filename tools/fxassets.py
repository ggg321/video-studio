"""Soft light pictures for the light transitions (transparent PNG). stdin: {"name","W","H","out"}  names: glow sweep leak flare"""
import sys, json
import numpy as np
from PIL import Image, ImageFilter

req = json.loads(sys.stdin.buffer.read().decode('utf-8'))
name, W, H = req['name'], int(req['W']), int(req['H'])
ys, xs = np.mgrid[0:H, 0:W].astype(np.float32)


def rgba(r, g, b, a):
    return np.dstack([np.full((H, W), r, np.float32), np.full((H, W), g, np.float32), np.full((H, W), b, np.float32), np.clip(a, 0, 1) * 255]).astype(np.uint8)


if name == 'glow':                                   # warm radial bloom, strongest in the middle
    d = np.hypot((xs - W / 2) / (0.62 * max(W, H)), (ys - H / 2) / (0.62 * max(W, H)))
    a = np.clip(1 - d, 0, 1) ** 1.5
    img = Image.fromarray(rgba(255, 244, 214, a * 0.95), 'RGBA')
elif name == 'sweep':                                # slanted bright band, soft edges; the picture is as wide as the frame, the band is drawn in its middle
    shear = 0.28
    xp = xs - (ys - H / 2) * shear
    sig = 0.12 * W
    a = np.exp(-((xp - W / 2) / sig) ** 2)
    core = np.exp(-((xp - W / 2) / (sig * 0.28)) ** 2)
    arr = rgba(255, 255, 255, np.clip(a * 0.55 + core * 0.45, 0, 1))
    img = Image.fromarray(arr, 'RGBA')
elif name == 'leak':                                 # film light leak: orange to pink from the right edge, uneven
    rng = np.random.default_rng(3)
    base = np.clip((xs / W) ** 1.6, 0, 1)
    blobs = np.zeros((H, W), np.float32)
    for _ in range(6):
        cx, cy, r = rng.uniform(0.55 * W, W), rng.uniform(0, H), rng.uniform(0.25, 0.6) * max(W, H)
        blobs += np.exp(-(((xs - cx) ** 2 + (ys - cy) ** 2) / (r * r)))
    a = np.clip(base * 0.55 + np.clip(blobs, 0, 1) * 0.5, 0, 1)
    t = np.clip(xs / W, 0, 1)
    r_, g_, b_ = 255, 150 - 80 * t, 60 + 60 * t
    arr = np.dstack([np.full((H, W), r_, np.float32), g_.astype(np.float32), b_.astype(np.float32), a * 255]).astype(np.uint8)
    img = Image.fromarray(arr, 'RGBA')
else:                                                # flare: horizontal streak with a hot core
    sy = 0.018 * H
    streak = np.exp(-(((ys - H / 2) / sy) ** 2)) * np.clip(1 - np.abs(xs - W / 2) / (W / 2) * 0.35, 0, 1)
    core = np.exp(-((((xs - W / 2) / (0.12 * W)) ** 2) + (((ys - H / 2) / (0.05 * H)) ** 2)))
    a = np.clip(streak * 0.85 + core, 0, 1)
    arr = np.dstack([200 + 55 * core, 225 + 30 * core, np.full((H, W), 255, np.float32), a * 255]).astype(np.uint8)
    img = Image.fromarray(arr, 'RGBA')
img.filter(ImageFilter.GaussianBlur(2)).save(req['out'])
