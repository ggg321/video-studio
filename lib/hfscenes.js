// Carousels from the HyperFrames catalog. A block is an HTML page with variables (image1..N, background, speed, texts).
// We fill it with the user's pictures, render it, and cut the middle square out of the wide picture so it fits a vertical video.
const fs = require('fs'), path = require('path'), crypto = require('crypto'), { spawn, spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const HF = path.join(ROOT, 'hyperframes');
const CATALOG = path.join(HF, 'trial', 'compositions');
const CLI = path.join(HF, 'node_modules', 'hyperframes', 'bin', 'hyperframes.mjs');

const BLOCKS = [
  { id: 'carousel-circle-1', label: 'Circle carousel', slots: 12, dur: 6 },
  { id: 'carousel-orbit-1', label: 'Orbit (cards on a sphere)', slots: 24, dur: 6 },
  { id: 'carousel-vision-1', label: 'Vision ring', slots: 12, dur: 6 },
  { id: 'carousel-path-1', label: 'Path (cards ride a curve)', slots: 24, dur: 6 },
  { id: 'carousel-text-circle-1', label: 'Headline + circle carousel', slots: 12, dur: 5, texts: ['line1', 'line2'] }
];
const get = id => BLOCKS.find(b => b.id === id);
const list = () => (fs.existsSync(CLI) ? BLOCKS.filter(b => fs.existsSync(path.join(CATALOG, b.id + '.html'))) : []).map(b => ({ id: b.id, label: b.label, dur: b.dur, texts: b.texts || [] }));

// opts: { block, images:[absolute paths], bg:'#rrggbb', speed, lines:[...] } -> path of a square mp4 (1080x1080, no sound)
function render(dir, opts) {
  return new Promise((resolve, reject) => {
    const b = get(opts.block), src = b && path.join(CATALOG, b.id + '.html');
    if (!b || !fs.existsSync(src) || !fs.existsSync(CLI)) return reject(new Error('This carousel is not installed.'));
    const imgs = (opts.images || []).filter(f => fs.existsSync(f));
    if (!imgs.length) return reject(new Error('Add pictures for the carousel first.'));
    const bg = /^#[0-9a-f]{6}$/i.test(opts.bg || '') ? opts.bg : '#06100f', speed = +opts.speed > 0 ? +opts.speed : 1;
    const vars = { background: bg, speed };
    if (b.texts) b.texts.forEach((k, i) => { if ((opts.lines || [])[i]) vars[k] = String(opts.lines[i]).slice(0, 60); });
    const sig = JSON.stringify([b.id, !!opts.wide, imgs.map(f => [f, fs.statSync(f).mtimeMs]), vars]);
    const key = crypto.createHash('sha1').update(sig).digest('hex').slice(0, 12);
    const pd = path.join(dir, 'hf_scene_' + key), out = path.join(dir, 'hf_scene_' + key + '.mp4');
    if (fs.existsSync(out)) return resolve({ file: out, dur: b.dur });
    fs.mkdirSync(path.join(pd, 'assets', 'user'), { recursive: true });
    imgs.forEach((f, i) => fs.copyFileSync(f, path.join(pd, 'assets', 'user', 'p' + i + path.extname(f))));
    for (let i = 0; i < b.slots; i++) vars['image' + (i + 1)] = 'assets/user/p' + (i % imgs.length) + path.extname(imgs[i % imgs.length]);
    fs.copyFileSync(src, path.join(pd, 'index.html'));
    fs.writeFileSync(path.join(pd, 'vars.json'), JSON.stringify(vars));
    fs.writeFileSync(path.join(pd, 'hyperframes.json'), fs.readFileSync(path.join(HF, 'trial', 'hyperframes.json')));
    fs.writeFileSync(path.join(pd, 'package.json'), '{"name":"scene","private":true}');
    const wide = path.join(pd, 'wide.mp4');
    const ch = spawn(process.execPath, [CLI, 'render', pd, '--variables-file', path.join(pd, 'vars.json'), '-o', wide, '--quiet'], { cwd: pd, windowsHide: true, env: { ...process.env, HYPERFRAMES_SKIP_SKILLS: '1', HYPERFRAMES_NO_TELEMETRY: '1' } });
    let err = '';
    ch.stdout.on('data', d => { err += d; if (err.length > 6000) err = err.slice(-6000); });
    ch.stderr.on('data', d => { err += d; if (err.length > 6000) err = err.slice(-6000); });
    ch.on('error', reject);
    ch.on('close', code => {
      if (code !== 0 || !fs.existsSync(wide)) return reject(new Error('The carousel did not render: ' + err.slice(-300)));
      const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', wide, '-vf', opts.wide ? 'setsar=1' : 'crop=1080:1080:420:0,setsar=1', '-an', '-c:v', 'libx264', '-crf', '17', '-pix_fmt', 'yuv420p', out], { encoding: 'utf8' });
      try { fs.rmSync(pd, { recursive: true, force: true }); } catch {}
      r.status === 0 && fs.existsSync(out) ? resolve({ file: out, dur: b.dur }) : reject(new Error('Could not crop the carousel: ' + (r.stderr || '').slice(-200)));
    });
  });
}
module.exports = { BLOCKS, list, get, render };
