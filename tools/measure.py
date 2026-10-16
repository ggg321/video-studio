"""Measure text for caption plates the way libass sizes it: ASS "Fontsize" is the height of the line box (ascent + descent), not the em size.
stdin: {"font": path, "size": fontsize, "strings": [...]}   stdout: {"line": px, "w": {string: px}}"""
import sys, json
from PIL import ImageFont

req = json.loads(sys.stdin.buffer.read().decode('utf-8'))
size = float(req['size'])
probe = ImageFont.truetype(req['font'], 1000)
asc, desc = probe.getmetrics()
em = max(1, round(size * 1000 / (asc + desc)))
f = ImageFont.truetype(req['font'], em)
print(json.dumps({'line': size, 'w': {s: f.getlength(s) for s in req['strings']}}))
