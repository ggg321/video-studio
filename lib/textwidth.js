// Text widths for caption plates (one Python call per render; results cached).
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..'), fonts = require('./fonts');
const cache = new Map();
function fontFile(label) {
  const f = fonts.list().find(x => x.label === label || x.family === label);
  const p = f && path.join(fonts.CACHE, f.file);
  return p && fs.existsSync(p) ? p : null;
}
// returns { line, w(s) } ; falls back to an estimate when the font or Python is missing
function measure(label, size, strings) {
  const est = s => s.length * size * 0.6, key = `${label}|${size}`;
  const file = fontFile(label), py = path.join(ROOT, '.venv', 'Scripts', 'python.exe');
  const uniq = [...new Set(strings)].filter(s => !cache.has(key + '|' + s));
  let line = size * 1.5;
  if (file && fs.existsSync(py) && (uniq.length || !cache.has(key + '|#line'))) {
    try {
      const out = JSON.parse(execFileSync(py, [path.join(ROOT, 'tools', 'measure.py')], { input: JSON.stringify({ font: file, size, strings: uniq.length ? uniq : ['x'] }), timeout: 20000, windowsHide: true }).toString());
      for (const s of uniq) cache.set(key + '|' + s, out.w[s]); cache.set(key + '|#line', out.line);
    } catch (e) { console.error('measure:', e.message); }
  }
  if (cache.has(key + '|#line')) line = cache.get(key + '|#line');
  return { line, w: s => (cache.has(key + '|' + s) ? cache.get(key + '|' + s) : est(s)) };
}
module.exports = { measure, fontFile };
