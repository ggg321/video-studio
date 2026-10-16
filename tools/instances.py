# Make static weight instances from variable fonts (libass ignores variable weight axes).
import os
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
root = os.path.join(os.path.dirname(__file__), '..', 'fonts')
JOBS = {'Montserrat-VF.ttf': [700, 800, 900], 'OpenSans-VF.ttf': [700, 800], 'Inter-VF.ttf': [700, 800, 900], 'Oswald-VF.ttf': [700],
        'Roboto-VF.ttf': [700, 900], 'Unbounded-VF.ttf': [700, 900]}
NAMES = {700: 'Bold', 800: 'ExtraBold', 900: 'Black'}
os.makedirs(os.path.join(root, 'static'), exist_ok=True)
for fn, ws in JOBS.items():
    for w in ws:
        f = TTFont(os.path.join(root, fn))
        axes = {a.axisTag: (w if a.axisTag == 'wght' else a.defaultValue) for a in f['fvar'].axes}
        inst = instancer.instantiateVariableFont(f, axes, updateFontNames=True)
        fam = (f['name'].getDebugName(16) or f['name'].getDebugName(1)).replace(' Thin', '').replace(' Regular', '')
        out = os.path.join(root, 'static', f"{fam.replace(' ', '')}-{NAMES[w]}.ttf")
        inst.save(out); print('made', os.path.basename(out))
