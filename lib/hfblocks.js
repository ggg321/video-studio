// Scenes from the HyperFrames catalog (titles, charts, diagrams, phone chats, social cards, lower thirds).
// Every block is an HTML page. What can be changed on it is read from the page itself:
//   1. its declared variables (data-composition-variables),
//   2. the values in its CONFIG object,
//   3. otherwise the plain texts of its markup.
// A block is rendered at its own size (full scenes as MP4, overlays as WebM with transparency) and played as a clip inside the Remotion video.
const fs = require('fs'), path = require('path'), crypto = require('crypto'), { spawn, spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const HF = path.join(ROOT, 'hyperframes');
const CATALOG = path.join(HF, 'trial', 'compositions');
const CLI = path.join(HF, 'node_modules', 'hyperframes', 'bin', 'hyperframes.mjs');

const BLOCKS = [
  { id: 'weight-wave', cat: 'Titles', label: 'Weight wave (a wave runs through the headline)' },
  { id: 'hw-title', cat: 'Titles', label: 'Handwritten title (word by word)' },
  { id: 'hw-write-title', cat: 'Titles', label: 'Handwritten title (written on)' },
  { id: 'wireframe-portal-title', cat: 'Titles', label: 'Wireframe portal title (3D)' },
  { id: 'glass-shard-title', cat: 'Titles', label: 'Glass shards title (3D)' },
  { id: 'canopy-part-title', cat: 'Titles', label: 'Leaves part to show the headline (3D)' },
  { id: 'logo-outro', cat: 'Titles', label: 'Logo outro' },
  { id: 'mk-progress-stat', cat: 'Charts and numbers', label: 'Big number with a progress bar' },
  { id: 'mk-line-graph', cat: 'Charts and numbers', label: 'Line graph' },
  { id: 'bar-chart-race', cat: 'Charts and numbers', label: 'Bar chart race' },
  { id: 'data-chart', cat: 'Charts and numbers', label: 'Bar and line chart' },
  { id: 'flowchart-vertical', cat: 'Diagrams', label: 'Flowchart (vertical)' },
  { id: 'flowchart', cat: 'Diagrams', label: 'Flowchart (wide)' },
  { id: 'hw-pipeline', cat: 'Diagrams', label: 'Handwritten pipeline' },
  { id: 'message-thread-reveal', cat: 'Phone and chats', label: 'Text conversation on a phone' },
  { id: 'notification-cascade', cat: 'Phone and chats', label: 'Phone notifications piling up' },
  { id: 'ai-chat-reveal', cat: 'Phone and chats', label: 'Question and answer in an AI chat' },
  { id: 'notes-reveal', cat: 'Phone and chats', label: 'A note typed in a notes app' },
  { id: 'instagram-follow', cat: 'Social cards', label: 'Instagram follow card', overlay: true },
  { id: 'tiktok-follow', cat: 'Social cards', label: 'TikTok follow card', overlay: true },
  { id: 'x-post', cat: 'Social cards', label: 'X (Twitter) post', overlay: true },
  { id: 'reddit-post', cat: 'Social cards', label: 'Reddit post', overlay: true },
  { id: 'spotify-card', cat: 'Social cards', label: 'Spotify now playing', overlay: true },
  { id: 'lt-bold-block', cat: 'Lower thirds', label: 'Lower third: bold block', overlay: true },
  { id: 'lt-clean-bar', cat: 'Lower thirds', label: 'Lower third: clean bar', overlay: true },
  { id: 'lt-kicker-name', cat: 'Lower thirds', label: 'Lower third: kicker and name', overlay: true },
  { id: 'lt-soft-pill', cat: 'Lower thirds', label: 'Lower third: soft pill', overlay: true }
];
const get = id => BLOCKS.find(b => b.id === id);
const fileOf = id => { for (const f of [path.join(CATALOG, id + '.html'), path.join(CATALOG, id, id + '.html')]) if (fs.existsSync(f)) return f; return null; };
const installed = () => fs.existsSync(CLI);
const list = () => (installed() ? BLOCKS.filter(b => fileOf(b.id)) : []).map(b => ({ id: b.id, cat: b.cat, label: b.label, overlay: !!b.overlay }));

const decode = s => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
function dims(html) { return { w: +((html.match(/data-width="(\d+)"/) || [])[1]) || 1920, h: +((html.match(/data-height="(\d+)"/) || [])[1]) || 1080, dur: +((html.match(/data-duration="([\d.]+)"/) || [])[1]) || 6 }; }

// the fields that can be edited
function fields(id) {
  const f = fileOf(id); if (!f) return null;
  const html = fs.readFileSync(f, 'utf8'), d = dims(html), out = [];
  const m = html.match(/data-composition-variables='([^']*)'/);
  if (m) {
    try { for (const v of JSON.parse(decode(m[1]))) if (['string', 'number', 'color', 'boolean', 'enum'].includes(v.type) && !/json/i.test(v.id)) out.push({ kind: 'var', key: v.id, label: v.label || v.id, type: v.type, value: v.default, options: v.options || v.values || null, min: v.min, max: v.max }); } catch {}
  }
  if (!out.length) {
    const c = html.match(/var CONFIG = \{([\s\S]*?)\n\s{8,10}\};/);
    if (c) for (const ln of c[1].split('\n')) {
      const k = ln.match(/^\s{10,12}(\w+):\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|-?\d+(?:\.\d+)?|true|false)\s*,?\s*(?:\/\/.*)?$/);
      if (k) { let v = k[2]; const type = /^["']/.test(v) ? 'string' : /^(true|false)$/.test(v) ? 'boolean' : 'number'; v = type === 'string' ? JSON.parse('"' + v.slice(1, -1).replace(/"/g, '\\"') + '"') : type === 'boolean' ? v === 'true' : +v; out.push({ kind: 'cfg', key: k[1], label: k[1], type, value: v }); }
    }
  }
  if (!out.length) {
    const body = (html.split('<body')[1] || '').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, ''), seen = new Set();
    for (const t of body.matchAll(/>([^<>]{2,80})</g)) {
      const s = decode(t[1]).trim();
      if (s.length >= 2 && !/^[\d\s.,:%+\-]*$/.test(s) && !seen.has(s)) { seen.add(s); out.push({ kind: 'text', key: s, label: 'Text', type: 'string', value: s }); }
      if (out.length >= 14) break;
    }
  }
  return { id, w: d.w, h: d.h, dur: d.dur, fields: out };
}

// params: { key: value } for the fields above. Returns { file, w, h, dur, alpha, bg } where file is a clip in the project folder.
function render(dir, opts) {
  dir = path.resolve(dir);
  return new Promise((resolve, reject) => {
    const b = get(opts.block), src = b && fileOf(b.id);
    if (!b || !src || !installed()) return reject(new Error('This scene is not installed.'));
    const fl = fields(b.id), params = opts.params || {};
    const alpha = !!b.overlay;
    const sig = JSON.stringify([b.id, params, alpha]);
    const key = crypto.createHash('sha1').update(sig + fs.statSync(src).mtimeMs).digest('hex').slice(0, 12);
    const out = path.join(dir, 'hf_block_' + key + (alpha ? '.webm' : '.mp4'));
    if (fs.existsSync(out)) return resolve({ file: out, w: fl.w, h: fl.h, dur: fl.dur, alpha, bg: bgOf(out) });
    const pd = path.join(dir, 'hf_block_' + key);
    fs.rmSync(pd, { recursive: true, force: true });
    // the block with everything it needs next to it (its own folder for 3D blocks, the shared assets for the others)
    const own = path.dirname(src) !== CATALOG;
    if (own) fs.cpSync(path.dirname(src), pd, { recursive: true }); else { fs.mkdirSync(pd, { recursive: true }); try { fs.cpSync(path.join(HF, 'trial', 'assets'), path.join(pd, 'assets'), { recursive: true }); } catch {} }
    let html = fs.readFileSync(src, 'utf8');
    // the flowcharts read tl.labels, which the renderer's timeline does not have; the label was added 0.2 s after the end of the timeline
    html = html.replace('tl.labels["hold5"]', '(tl.duration() + 0.2)');
    const vars = {};
    for (const f of fl.fields) {
      if (!(f.key in params) || params[f.key] === '' || params[f.key] == null) continue;
      const v = params[f.key];
      if (f.kind === 'var') vars[f.key] = f.type === 'number' ? +v : f.type === 'boolean' ? !!v : String(v);
      else if (f.kind === 'cfg') {
        const lit = f.type === 'string' ? JSON.stringify(String(v)) : f.type === 'boolean' ? String(!!v) : String(+v);
        html = html.replace(new RegExp('(\\n\\s{10,12}' + f.key + ':\\s*)("(?:[^"\\\\]|\\\\.)*"|\'(?:[^\'\\\\]|\\\\.)*\'|-?\\d+(?:\\.\\d+)?|true|false)'), (m0, a) => a + lit);
      } else if (f.kind === 'text') {
        const esc = String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;');
        html = html.split('>' + f.key + '<').join('>' + esc + '<');
      }
    }
    const idx = own ? path.join(pd, path.basename(src)) : path.join(pd, 'index.html');
    fs.writeFileSync(idx, html);
    if (own) fs.copyFileSync(idx, path.join(pd, 'index.html'));
    fs.writeFileSync(path.join(pd, 'vars.json'), JSON.stringify(vars));
    fs.writeFileSync(path.join(pd, 'hyperframes.json'), fs.readFileSync(path.join(HF, 'trial', 'hyperframes.json')));
    fs.writeFileSync(path.join(pd, 'package.json'), '{"name":"scene","private":true}');
    const args = [CLI, 'render', pd, '--variables-file', path.join(pd, 'vars.json'), '-o', out, '--quiet', ...(alpha ? ['--format', 'webm'] : [])];
    const ch = spawn(process.execPath, args, { cwd: pd, windowsHide: true, env: { ...process.env, HYPERFRAMES_SKIP_SKILLS: '1', HYPERFRAMES_NO_TELEMETRY: '1' } });
    let err = '';
    ch.stdout.on('data', d => { err += d; if (err.length > 6000) err = err.slice(-6000); });
    ch.stderr.on('data', d => { err += d; if (err.length > 6000) err = err.slice(-6000); });
    ch.on('error', reject);
    ch.on('close', code => {
      try { fs.rmSync(pd, { recursive: true, force: true }); } catch {}
      code === 0 && fs.existsSync(out) ? resolve({ file: out, w: fl.w, h: fl.h, dur: fl.dur, alpha, bg: bgOf(out) }) : reject(new Error('The scene did not render: ' + err.slice(-300)));
    });
  });
}
// colour of the corner of the first picture: the clip is laid on this colour when its shape does not fit the video
function bgOf(file) {
  try {
    const r = spawnSync('ffmpeg', ['-v', 'error', '-ss', '2.2', '-i', file, '-frames:v', '1', '-vf', 'crop=2:2:2:2', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { encoding: 'buffer' });
    if (r.status === 0 && r.stdout.length >= 3) return '#' + [...r.stdout.subarray(0, 3)].map(x => x.toString(16).padStart(2, '0')).join('');
  } catch {}
  return '#000000';
}
module.exports = { BLOCKS, list, get, fields, render };
