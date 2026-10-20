import os, json, sys
from fontTools.ttLib import TTFont
root = os.path.join(os.path.dirname(__file__), '..')
out = []
def scan(path, source):
    f = TTFont(path, lazy=True)
    n = f['name']
    fam = n.getDebugName(16) or n.getDebugName(1)
    sub = n.getDebugName(17) or n.getDebugName(2)
    cmap = f.getBestCmap() or {}
    has = lambda lo, hi: sum(1 for c in range(lo, hi) if c in cmap) > (hi - lo) * 0.6
    out.append({'file': os.path.basename(path), 'source': source, 'family': fam, 'style': sub, 'variable': 'fvar' in f,
                'latin': has(0x41, 0x7B), 'latinExt': has(0x100, 0x17F), 'cyrillic': has(0x410, 0x450), 'greek': has(0x391, 0x3CA)})
for d, src in ((os.path.join(root, 'fonts'), 'bundled'),):
    for fn in sorted(os.listdir(d)):
        if fn.lower().endswith(('.ttf', '.otf')): scan(os.path.join(d, fn), src)
for fn in ('arialbd.ttf', 'impact.ttf', 'segoeuib.ttf', 'Roboto-Bold_2.ttf', 'Roboto-Medium.ttf'):
    for dd in ['C:/Windows/Fonts', '/System/Library/Fonts/Supplemental', '/Library/Fonts']:
        p = os.path.join(dd, fn)
        if os.path.exists(p): scan(p, 'windows'); break
json.dump(out, open(os.path.join(root, 'data', 'fonts_scan.json'), 'w'), indent=1)
for o in out: print(o['file'].ljust(26), (o['family'] or '').ljust(18), (o['style'] or '').ljust(12), 'var' if o['variable'] else '   ', 'lat' if o['latin'] else '---', 'ext' if o['latinExt'] else '---', 'cyr' if o['cyrillic'] else '---', 'gr' if o['greek'] else '--')
