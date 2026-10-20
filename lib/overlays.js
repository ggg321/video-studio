// Extra overlays: scrolling ticker, logo plate, news clock. Pictures are drawn by tools/overlay.py (cached per project);
// the ticker moves in ffmpeg (crop with a time expression), the clock digits are subtitles (see lib/ass.js).
const fs = require('fs'), path = require('path'), crypto = require('crypto'), { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..'), tw = require('./textwidth'), fonts = require('./fonts');
const hex = (v, d) => (/^#[0-9a-f]{6}$/i.test(String(v)) ? String(v).toLowerCase() : d);
const num = (v, a, b, d) => { v = +v; return Number.isFinite(v) ? Math.min(b, Math.max(a, v)) : d; };
const even = n => Math.max(2, Math.round(n / 2) * 2);
const PLATE = { type: 'gradient', c1: '#0a1e4a', c2: '#1a4aa8', angle: 90, opacity: 0.95, radius: 0 };
const normPlate = (p = {}, d = PLATE) => ({ type: ['gradient', 'solid', 'none'].includes(p.type) ? p.type : d.type, c1: hex(p.c1, d.c1), c2: hex(p.c2, d.c2), angle: num(p.angle, 0, 360, d.angle), opacity: num(p.opacity, 0, 1, d.opacity), radius: Math.round(num(p.radius, 0, 60, d.radius)) });
const fontOk = label => (fonts.list().some(f => f.label === label) ? label : 'Roboto Bold');
const RED = { type: 'solid', c1: '#d6121c', c2: '#d6121c', angle: 90, opacity: 1, radius: 0 };
const WHITE = { type: 'solid', c1: '#ffffff', c2: '#ffffff', angle: 90, opacity: 0.95, radius: 14 };

function norm(o = {}) {
  const t = o.ticker || {}, l = o.logo || {}, c = o.clock || {}, lb = t.label || {};
  return {
    ticker: { on: !!t.on, text: String(t.text || '').slice(0, 500), speed: num(t.speed, 30, 500, 140), pos: t.pos === 'top' ? 'top' : 'bottom', edge: num(t.edge, 0, 0.4, 0.08), h: num(t.h, 0.03, 0.14, 0.055), color: hex(t.color, '#ffffff'), font: fontOk(t.font || 'Roboto Bold'), plate: normPlate(t.plate, PLATE),
      label: { on: !!lb.on, text: String(lb.text || '').slice(0, 40), color: hex(lb.color, '#ffffff'), plate: normPlate(lb.plate, RED) } },
    logo: { on: !!l.on, file: /^logo_src\.(png|webp|jpe?g)$/i.test(String(l.file || '')) ? String(l.file) : '', x: num(l.x, 0, 1, 0.84), y: num(l.y, 0, 1, 0.08), w: num(l.w, 0.06, 0.8, 0.24), ratio: num(l.ratio, 0.3, 4, 1.6), pad: num(l.pad, 0, 0.4, 0.14), plate: normPlate(l.plate, WHITE) },
    clock: { on: !!c.on, start: /^\d{1,2}:\d{2}(:\d{2})?$/.test(String(c.start || '')) ? String(c.start) : '12:00', seconds: !!c.seconds, label: String(c.label || '').slice(0, 20), x: num(c.x, 0, 1, 0.2), y: num(c.y, 0, 1, 0.07), size: num(c.size, 0.02, 0.12, 0.055), color: hex(c.color, '#ffffff'), font: fontOk(c.font || 'Roboto Bold'), plate: normPlate(c.plate, PLATE) }
  };
}
// patch from the UI: merge per overlay (and per plate), then normalise
function merge(old = {}, patch = {}) {
  const out = {};
  for (const k of ['ticker', 'logo', 'clock']) {
    const a = old[k] || {}, b = patch[k] || {};
    out[k] = { ...a, ...b, plate: { ...(a.plate || {}), ...(b.plate || {}) } };
    if (k === 'ticker') out[k].label = { ...(a.label || {}), ...(b.label || {}), plate: { ...((a.label || {}).plate || {}), ...(((b.label || {}).plate) || {}) } };
  }
  return norm(out);
}

function py(args) {
  const out = execFileSync(require('./platform').PY, [path.join(ROOT, 'tools', 'overlay.py')], { input: JSON.stringify(args), timeout: 40000, windowsHide: true }).toString().trim();
  return out ? JSON.parse(out) : {};
}
// draws once per parameter set (file name = hash of the parameters), returns {file, ...info}
function cached(dir, args, ext = '.png') {
  const key = crypto.createHash('md5').update(JSON.stringify(args)).digest('hex').slice(0, 10), file = path.join(dir, 'ov_' + key + ext), meta = file + '.json';
  if (fs.existsSync(file) && fs.existsSync(meta)) return { file, ...JSON.parse(fs.readFileSync(meta, 'utf8')) };
  const info = py({ ...args, out: file });
  fs.writeFileSync(meta, JSON.stringify(info));
  return { file, ...info };
}
const toSec = s => { const p = String(s).split(':').map(Number); return (p[0] || 0) * 3600 + (p[1] || 0) * 60 + (p[2] || 0); };   // "14:35" is hours:minutes

// everything the renderer needs: image items to overlay, and clock data for the subtitles
function build(dir, proj, W, H) {
  const o = norm(proj.overlays || {}), items = []; let clock = null;
  if (!fs.existsSync(require('./platform').PY)) return { items, clock };
  try {
    if (o.ticker.on && o.ticker.text.trim()) {
      const t = o.ticker, hp = even(t.h * H), y = t.pos === 'top' ? Math.round(t.edge * H) : H - hp - Math.round(t.edge * H), ff = tw.fontFile(t.font), em = Math.round(hp * 0.58);
      let lx = 0;
      if (t.label.on && t.label.text.trim()) {
        const lf = cached(dir, { kind: 'plate', w: 0, h: hp, plate: t.label.plate, text: { str: t.label.text.toUpperCase(), font: ff, size: em, color: t.label.color, pad: Math.round(hp * 0.5) } });
        lx = lf.width; items.push({ kind: 'static', file: lf.file, x: 0, y, z: 2 });
      }
      const base = cached(dir, { kind: 'plate', w: W, h: hp, plate: t.plate });
      items.unshift({ kind: 'static', file: base.file, x: 0, y, z: 0 });
      const st = cached(dir, { kind: 'strip', h: hp, W: W - lx, text: t.text, font: ff, size: em, color: t.color, gap: Math.round(hp * 3) });
      items.splice(1, 0, { kind: 'scroll', file: st.file, x: lx, y, w: W - lx, h: hp, cycle: st.cycle, speed: Math.round(t.speed * W / 720), z: 1 });
    }
    if (o.logo.on && o.logo.file && fs.existsSync(path.join(dir, o.logo.file))) {
      const l = o.logo, wp = even(l.w * W), hp = even(wp / l.ratio), lf = cached(dir, { kind: 'plate', w: wp, h: hp, plate: l.plate, logo: { file: path.join(dir, l.file), pad: l.pad }, v: fs.statSync(path.join(dir, l.file)).mtimeMs });
      items.push({ kind: 'static', file: lf.file, x: Math.round(Math.min(W - wp, Math.max(0, l.x * W - wp / 2))), y: Math.round(Math.min(H - hp, Math.max(0, l.y * H - hp / 2))), z: 3 });
    }
    if (o.clock.on) {
      const c = o.clock, fs0 = Math.round(c.size * W), sample = (c.label ? c.label + ' ' : '') + (c.seconds ? '00:00:00' : '00:00'), m = tw.measure(c.font, fs0, [sample]);
      const wp = even(m.w(sample) * 1.04 + fs0 * 0.9), hp = even(fs0 * 1.15), cx = c.x * W, cy = c.y * H;
      if (c.plate.type !== 'none') { const pf = cached(dir, { kind: 'plate', w: wp, h: hp, plate: c.plate }); items.push({ kind: 'static', file: pf.file, x: Math.round(Math.min(W - wp, Math.max(0, cx - wp / 2))), y: Math.round(Math.min(H - hp, Math.max(0, cy - hp / 2))), z: 3 }); }
      clock = { cx: Math.round(Math.min(W - wp / 2, Math.max(wp / 2, cx))), cy: Math.round(Math.min(H - hp / 2, Math.max(hp / 2, cy))), fs: fs0, color: c.color, font: c.font, start: toSec(c.start), seconds: c.seconds, label: c.label };
    }
  } catch (e) { console.error('overlays:', e.message); }
  items.sort((a, b) => (a.z || 0) - (b.z || 0));
  return { items, clock };
}
module.exports = { norm, merge, build, toSec };
