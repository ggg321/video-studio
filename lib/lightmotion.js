// "Light motion": animated key words (with an underline and floating particles if wanted) laid over the normal video.
// Remotion draws them on a transparent background (WebM with alpha); render.js puts that over the picture. The video itself is not rebuilt.
const fs = require('fs'), path = require('path'), crypto = require('crypto'), { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..');
const RDIR = path.join(ROOT, 'remotion');
const typo = require('./typo');
const DEFAULTS = { on: false, anim: 'split', underline: true, particles: false, density: 'low', accent: '' };

const optsOf = p => ({ ...DEFAULTS, ...(p.lightMotion || {}) });

function make(dir, proj, W, H, T) {
  return new Promise((resolve, reject) => {
    const o = optsOf(proj);
    const pl = typo.plan(dir, { ...proj, typo: { opts: { density: o.density, sceneEvery: 0, keywords: true } } }, { density: o.density, sceneEvery: 0, keywords: true });
    if (!pl.keywords.length && !o.particles) return resolve(null);
    const accent = /^#[0-9a-f]{6}$/i.test(o.accent) ? o.accent : (/^#[0-9a-f]{6}$/i.test(proj.accent || '') ? proj.accent : '#ffe600');
    const props = { overlay: true, width: W, height: H, fps: 30, duration: +T.toFixed(2), accent, fontUrl: path.join(ROOT, 'fonts', 'Montserrat-VF.ttf'), fontFamily: 'Montserrat',
      anim: ['blur', 'gsap', 'split'].includes(o.anim) ? o.anim : 'split', fx: { underline: !!o.underline, particles: !!o.particles }, keywords: pl.keywords, scenes: [] };
    const key = crypto.createHash('sha1').update(JSON.stringify(props) + fs.statSync(path.join(RDIR, 'src', 'Typo.jsx')).mtimeMs).digest('hex').slice(0, 12);
    const out = path.join(dir, 'lm_' + key + '.webm');
    if (fs.existsSync(out)) return resolve(out);
    for (const f of fs.readdirSync(dir)) if (/^lm_.*\.webm$/.test(f)) { try { fs.unlinkSync(path.join(dir, f)); } catch {} }
    const pf = path.join(dir, 'lm_props.json');
    fs.writeFileSync(pf, JSON.stringify(props));
    const ch = spawn(process.execPath, [path.join(RDIR, 'render.js'), pf, out, dir, path.join(ROOT, 'fonts')], { cwd: RDIR, windowsHide: true });
    let err = '';
    ch.stdout.on('data', d => { err += d; if (err.length > 6000) err = err.slice(-6000); });
    ch.stderr.on('data', d => { err += d; if (err.length > 6000) err = err.slice(-6000); });
    ch.on('error', reject);
    ch.on('close', code => code === 0 && fs.existsSync(out) ? resolve(out) : reject(new Error((err.match(/ERROR ([^\n]+)/) || [])[1] || 'Light motion did not render: ' + err.slice(-300))));
  });
}
module.exports = { make, optsOf, DEFAULTS };
