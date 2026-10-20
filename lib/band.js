// Caption band: a strip (gradient, solid colour or picture) that sits behind the subtitles.
const fs = require('fs'), path = require('path'), crypto = require('crypto'), { execFile } = require('child_process');
const ROOT = path.join(__dirname, '..');
const DEF = { on: false, type: 'gradient', c1: '#001a6e', c2: '#0a5fd0', angle: 90, opacity: 1, auto: true, h: 0.14, w: 1, dy: 0, dx: 0, radius: 0, aspect: 0, bright: 1, image: '' };
const hex = (v, d) => (/^#[0-9a-f]{6}$/i.test(String(v)) ? String(v).toLowerCase() : d);
const num = (v, a, b, d) => { v = +v; return Number.isFinite(v) ? Math.min(b, Math.max(a, v)) : d; };
function norm(b = {}) {
  return {
    on: !!b.on, type: ['gradient', 'solid', 'image'].includes(b.type) ? b.type : 'gradient', c1: hex(b.c1, DEF.c1), c2: hex(b.c2, DEF.c2),
    angle: num(b.angle, 0, 360, 90), opacity: num(b.opacity, 0, 1, 1), auto: b.auto !== false, h: num(b.h, 0.03, 0.6, DEF.h), w: num(b.w, 0.3, 1, 1),
    dy: num(b.dy, -0.7, 0.7, 0), dx: num(b.dx, -0.5, 0.5, 0), radius: Math.round(num(b.radius, 0, 80, 0)), aspect: num(b.aspect, 0, 20, 0), bright: num(b.bright, 0.4, 1.6, 1), image: /^(band_src\.[a-z0-9]{2,5}|builtin_[a-z0-9]+)$/i.test(String(b.image || '')) ? String(b.image) : ''
  };
}
// where the band goes, in pixels, from the caption block geometry
function rect(W, H, geo, b) {
  const w = Math.max(40, Math.round(b.w * W / 2) * 2);
  let h = b.aspect > 0 ? w / b.aspect : b.auto ? (geo.bottom - geo.top) + geo.fs * 1.1 : b.h * H; h = Math.max(24, Math.round(h / 2) * 2);
  const cy = (geo.top + geo.bottom) / 2 + b.dy * H;
  return { w, h, x: Math.round(Math.min(W - w, Math.max(0, geo.cx + b.dx * W - w / 2))), y: Math.round(Math.min(H - h, Math.max(0, cy - h / 2))) };
}
// makes (or reuses) the PNG; returns { file, x, y } or null
function make(dir, proj, W, H, geo) {
  const b = norm(proj.band); if (!b.on) return Promise.resolve(null);
  const r = rect(W, H, geo, b), img = b.type === 'image' && b.image ? (b.image.startsWith('builtin_') ? path.join(ROOT, 'data', 'bands', b.image.slice(8) + '.png') : path.join(dir, b.image)) : '';
  if (b.type === 'image' && !fs.existsSync(img)) b.type = 'gradient';
  const key = crypto.createHash('md5').update(JSON.stringify([r.w, r.h, b, img && fs.statSync(img).mtimeMs])).digest('hex').slice(0, 10);
  const out = path.join(dir, `band_${key}.png`);
  const py = require('./platform').PY;
  if (fs.existsSync(out)) return Promise.resolve({ file: out, x: r.x, y: r.y });
  if (!fs.existsSync(py)) return Promise.resolve(null);
  return new Promise(res => {
    const p = execFile(py, [path.join(ROOT, 'tools', 'band.py')], { timeout: 30000, windowsHide: true }, err => res(err || !fs.existsSync(out) ? null : { file: out, x: r.x, y: r.y }));
    p.stdin.end(JSON.stringify({ out, w: r.w, h: r.h, type: b.type, c1: b.c1, c2: b.c2, angle: b.angle, opacity: b.opacity, radius: b.radius, bright: b.bright, image: img }));
  });
}
module.exports = { norm, rect, make, DEF };
