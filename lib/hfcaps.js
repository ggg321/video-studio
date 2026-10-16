// Subtitle templates from the HyperFrames catalog. A template is an HTML page with a words list; we put the words of the project into it,
// resize it to the video, render a transparent WebM and render.js lays it over the picture instead of the ASS subtitles.
const fs = require('fs'), path = require('path'), crypto = require('crypto'), { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..');
const HF = path.join(ROOT, 'hyperframes');
const CATALOG = path.join(HF, 'trial', 'compositions', 'components');
const CLI = path.join(HF, 'node_modules', 'hyperframes', 'bin', 'hyperframes.mjs');

const TEMPLATES = [
  { id: 'kinetic-slam', label: 'Kinetic Slam (one big word at a time)', comp: 'caption-kinetic-slam', center: true },
  { id: 'pill-karaoke', label: 'Pill Karaoke (words on a pill)', comp: 'caption-pill-karaoke' },
  { id: 'neon-glow', label: 'Neon Glow', comp: 'caption-neon-glow' },
  { id: 'highlight', label: 'Highlight (marker sweep)', comp: 'caption-highlight' },
  { id: 'clip-wipe', label: 'Clip Wipe', comp: 'caption-clip-wipe' },
  { id: 'glitch-rgb', label: 'Glitch RGB', comp: 'caption-glitch-rgb' },
  { id: 'gradient-fill', label: 'Gradient Fill', comp: 'caption-gradient-fill' },
  { id: 'matrix-decode', label: 'Matrix Decode (letters scramble in)', comp: 'caption-matrix-decode' },
  { id: 'neon-accent', label: 'Neon Accent', comp: 'caption-neon-accent' },
  { id: 'emoji-pop', label: 'Emoji Pop', comp: 'caption-emoji-pop' },
  { id: 'particle-burst', label: 'Particle Burst', comp: 'caption-particle-burst' },
  { id: 'weight-shift', label: 'Weight Shift (minimal)', comp: 'caption-weight-shift' }
];
const get = id => TEMPLATES.find(t => t.id === id);
const available = () => fs.existsSync(CLI) && TEMPLATES.filter(t => fs.existsSync(path.join(CATALOG, t.comp + '.html')));
const list = () => (available() || []).map(t => ({ id: t.id, label: t.label }));

// groups of up to four words: a group ends at the end of a sentence, at a pause or when the line gets long
function groupsOf(words) {
  const g = []; let a = 0, chars = 0;
  words.forEach((w, i) => {
    chars += w.text.length + 1;
    const gap = i + 1 < words.length ? words[i + 1].start - w.end : 0;
    if (/[.!?]$/.test(w.text) || gap > 0.28 || chars > 24 || i - a >= 3 || i === words.length - 1) { g.push([a, i]); a = i + 1; chars = 0; }
  });
  return g;
}

function adapt(html, tpl, words, keys, W, H, T) {
  const wide = W > H * 1.2, k = W / 1920, fs_ = Math.max(0.3, k * (wide ? 1 : tpl.center ? 1.4 : 1.85)), wMax = Math.round(W * (wide ? 0.9 : tpl.center ? 0.86 : 0.92));
  const arr = v => JSON.stringify(v);
  const gr = groupsOf(words);
  let h = html, n = 0;
  const sub = (re, fn) => { h = h.replace(re, (...a) => { n++; return fn(...a); }); };
  sub(/var (WORDS|TRANSCRIPT) = \[[\s\S]*?\n\s*\];/, (m, name) => `var ${name} = ${arr(words)};`);
  sub(/var RAW_GROUPS = \[\s*\[[\s\S]*?\n\s*\];/, () => `var RAW_GROUPS = ${arr(gr)};`);
  sub(/var GROUPS = \[\s*\{[\s\S]*?\n\s*\];/, () => `var GROUPS = ${arr(gr.map(([a, b], i) => ({ wordStart: a, wordEnd: b, start: words[a].start, end: Math.min(words[b].end + 0.5, i + 1 < gr.length ? words[gr[i + 1][0]].start - 0.04 : T) })))};`);
  sub(/var KEYWORDS = new Set\(\[[^\]]*\]\);/, m => (/"/.test(m) ? `var KEYWORDS = new Set(${arr(keys.map(i => words[i].text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')))});` : `var KEYWORDS = new Set(${arr(keys)});`));
  h = h.replace(/: 8\.0;/g, `: ${T.toFixed(2)};`);
  // size of the picture
  h = h.replace(/width=1920, height=1080/g, `width=${W}, height=${H}`).replace(/width: 1920px;/g, `width: ${W}px;`).replace(/height: 1080px;/g, `height: ${H}px;`)
    .replace(/data-width="1920"/, `data-width="${W}"`).replace(/data-height="1080"/, `data-height="${H}"`).replace(/data-duration="8"/, `data-duration="${T.toFixed(2)}"`);
  // type size, line width and the distance from the bottom edge
  h = h.replace(/font-size: (\d+)px;/g, (m, s) => `font-size: ${Math.round(s * fs_)}px;`);
  h = h.replace(/fitFontSize\(([^,]+), (\d+), ("[^"]*"), ([^,]+), (\d+)\)/g, (m, a, s, w, f) => `fitFontSize(${a}, ${Math.round(s * fs_)}, ${w}, ${f}, ${wMax})`);
  h = h.replace(/(var BASE_FONT(?:_SIZE)?) = (\d+);/, (m, v, s) => `${v} = ${Math.round(s * fs_)};`);
  h = h.replace(/var (SAFE_ZONE_WIDTH|PILL_MAX_WIDTH) = \d+;/g, (m, v) => `var ${v} = ${wMax};`);
  h = h.replace(/var (PILL_M\w+_PADDING_X) = (\d+);/g, (m, v, s) => `var ${v} = ${Math.round(s * Math.max(0.5, k * (wide ? 1 : 1.4)))};`);
  if (!tpl.center) h = h.replace(/bottom: \d+px;/g, `bottom: ${Math.round(H * (wide ? 0.11 : 0.2))}px;`);
  return h;
}

// returns the path of the transparent overlay (cached by content)
function make(dir, proj, W, H, T, span) {
  return new Promise((resolve, reject) => {
    const tpl = get(proj.hfCaption), file = tpl && path.join(CATALOG, tpl.comp + '.html');
    if (!tpl || !fs.existsSync(file) || !fs.existsSync(CLI)) return reject(new Error('This subtitle template is not installed.'));
    const fr = span && span.to > span.from ? span : null;      // a fragment of the video: its own time starts at 0
    const words = (proj.words || []).filter(w => w.end > w.start && (!fr || (w.end > fr.from && w.start < fr.to))).map(w => ({ text: String(w.w), start: +Math.max(0, w.start - (fr ? fr.from : 0)).toFixed(2), end: +(w.end - (fr ? fr.from : 0)).toFixed(2) }));
    if (fr) T = +(fr.to - fr.from).toFixed(2);
    if (!words.length) return reject(new Error('No words to show.'));
    // key words: the same picks as the typographic video
    let keys = [];
    try { const kw = require('./typo').plan(dir, { ...proj, typo: {} }).keywords; keys = words.map((w, i) => (kw.some(x => Math.abs(x.start - w.start) < 0.2) ? i : -1)).filter(i => i >= 0); } catch {}
    const html = adapt(fs.readFileSync(file, 'utf8'), tpl, words, keys, W, H, T);
    const key = crypto.createHash('sha1').update(html).digest('hex').slice(0, 12);
    const pd = path.join(dir, 'hf_' + tpl.id), out = path.join(pd, 'out_' + key + '.webm');
    if (fs.existsSync(out)) return resolve(out);
    fs.mkdirSync(pd, { recursive: true });
    for (const f of fs.readdirSync(pd)) if (/^out_.*\.webm$/.test(f)) { try { fs.unlinkSync(path.join(pd, f)); } catch {} }
    fs.writeFileSync(path.join(pd, 'index.html'), html);
    fs.writeFileSync(path.join(pd, 'hyperframes.json'), fs.readFileSync(path.join(HF, 'trial', 'hyperframes.json')));
    fs.writeFileSync(path.join(pd, 'package.json'), '{"name":"cap","private":true}');
    const ch = spawn(process.execPath, [CLI, 'render', pd, '--format', 'webm', '-o', out, '--quiet'], { cwd: pd, windowsHide: true, env: { ...process.env, HYPERFRAMES_SKIP_SKILLS: '1', HYPERFRAMES_NO_TELEMETRY: '1' } });
    let err = '';
    ch.stdout.on('data', d => { err += d; if (err.length > 6000) err = err.slice(-6000); });
    ch.stderr.on('data', d => { err += d; if (err.length > 6000) err = err.slice(-6000); });
    ch.on('error', reject);
    ch.on('close', code => code === 0 && fs.existsSync(out) ? resolve(out) : reject(new Error('The subtitle template did not render: ' + err.slice(-300))));
  });
}
module.exports = { TEMPLATES, list, get, make, adapt };
