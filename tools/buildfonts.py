# Builds data/fonts.json (catalog) + data/fontcache (what ffmpeg/libass loads). Run: python tools/buildfonts.py
import os, json, shutil
from fontTools.ttLib import TTFont
root = os.path.join(os.path.dirname(__file__), '..')
cache = os.path.join(root, 'data', 'fontcache')
shutil.rmtree(cache, ignore_errors=True); os.makedirs(cache)
src = []
for d in ('fonts', os.path.join('fonts', 'static')):
    p = os.path.join(root, d)
    for fn in sorted(os.listdir(p)):
        if fn.lower().endswith('.ttf') and not fn.endswith('-VF.ttf'): src.append((os.path.join(p, fn), 'bundled'))
for fn in ('arialbd.ttf', 'arial.ttf', 'impact.ttf', 'segoeuib.ttf', 'segoeui.ttf', 'Roboto-Bold_2.ttf'):
    for dd in ['C:/Windows/Fonts', '/System/Library/Fonts/Supplemental', '/Library/Fonts']:
        p = os.path.join(dd, fn)
        if os.path.exists(p): src.append((p, 'windows')); break
cat, seen = [], set()
for path, source in src:
    f = TTFont(path, lazy=True); n = f['name']
    full = n.getDebugName(4); fam1 = n.getDebugName(1); sub = n.getDebugName(2); cmap = f.getBestCmap() or {}
    has = lambda lo, hi: sum(1 for c in range(lo, hi) if c in cmap) > (hi - lo) * 0.6
    shutil.copy(path, os.path.join(cache, os.path.basename(path)))
    bold = 'Bold' in (sub or '') and fam1 in ('Arial', 'Segoe UI', 'Roboto')
    # ASS font name: family name as libass sees it; weights like "Poppins ExtraBold" are their own families
    label = full if not (fam1 in ('Arial', 'Segoe UI', 'Roboto') and sub == 'Regular') else None
    if not label or full in seen: continue
    seen.add(full)
    cat.append({'id': full.lower().replace(' ', '-'), 'label': full, 'family': fam1, 'bold': 1 if bold or (fam1 in ('Arial','Segoe UI','Roboto') and 'Bold' in (sub or '')) else 0,
                'file': os.path.basename(path), 'source': source, 'cyrillic': has(0x410, 0x450), 'greek': has(0x391, 0x3CA), 'latinExt': has(0x100, 0x17F)})
json.dump(cat, open(os.path.join(root, 'data', 'fonts.json'), 'w'), indent=1, ensure_ascii=False)
for c in cat: print(c['label'].ljust(24), 'fam=' + c['family'].ljust(22), 'bold' if c['bold'] else '    ', 'cyr' if c['cyrillic'] else '---', 'gr' if c['greek'] else '--', c['source'])
