// Subtitle Studio: a separate small site (port 4318) for burning styled subtitles into any video, in many languages.
// Reuses the caption engine of the main platform (lib/ass.js, lib/transcribe.js, lib/fonts.js).
const express = require('express'), multer = require('multer'), fs = require('fs'), path = require('path');
const { spawn, execFile } = require('child_process');
const ROOT = path.join(__dirname, '..'), WORK = path.join(__dirname, 'work');
const { buildAss, autoCues, TEMPLATES } = require(path.join(ROOT, 'lib', 'ass'));
const { transcribe } = require(path.join(ROOT, 'lib', 'transcribe'));
const fonts = require(path.join(ROOT, 'lib', 'fonts'));
const { LANGS, scriptOf, fontFor } = require('./langs');
fs.mkdirSync(WORK, { recursive: true });

const app = express();
app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/shared', express.static(path.join(ROOT, 'public')));          // ui.css and theme.js of the main site
const upload = multer({ dest: path.join(WORK, '_tmp'), limits: { fileSize: 8 * 1024 ** 3 } });
const wrap = f => (req, res) => Promise.resolve(f(req, res)).catch(e => { console.error(e); res.status(500).json({ error: String(e.message || e).slice(0, 400) }); });
const dirOf = id => { if (!/^[a-z0-9]{6,20}$/.test(id)) throw new Error('bad id'); return path.join(WORK, id); };
const rd = id => JSON.parse(fs.readFileSync(path.join(dirOf(id), 'job.json'), 'utf8'));
const wr = (id, j) => fs.writeFileSync(path.join(dirOf(id), 'job.json'), JSON.stringify(j));
const run = (cmd, args, opt = {}) => new Promise((ok, no) => execFile(cmd, args, { maxBuffer: 64 << 20, ...opt }, (e, so, se) => e ? no(new Error((se || e.message).slice(-400))) : ok(so)));
const TASKS = new Map();     // id -> { kind, pct, state, error }

// ---------- upload ----------
app.post('/api/upload', upload.single('file'), wrap(async (req, res) => {
  if (!req.file) throw new Error('No file');
  const id = Math.random().toString(36).slice(2, 10), dir = dirOf(id);
  fs.mkdirSync(dir, { recursive: true });
  const ext = (path.extname(req.file.originalname) || '.mp4').toLowerCase().replace(/[^.a-z0-9]/g, '');
  const src = path.join(dir, 'src' + ext);
  fs.renameSync(req.file.path, src);
  const pr = JSON.parse(await run('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', src]));
  const v = (pr.streams || []).find(s => s.codec_type === 'video');
  if (!v) throw new Error('This file has no video track');
  const rot = Math.abs(+((v.side_data_list || []).find(x => x.rotation !== undefined) || {}).rotation || +(v.tags && v.tags.rotate) || 0) % 180 === 90;
  const W = rot ? v.height : v.width, H = rot ? v.width : v.height, duration = +pr.format.duration || +v.duration || 0;
  const hasAudio = (pr.streams || []).some(s => s.codec_type === 'audio');
  await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', src, '-ss', '0.2', '-frames:v', '1', '-vf', 'scale=-2:min(720\\,ih)', '-q:v', '4', path.join(dir, 'poster.jpg')]).catch(() => {});
  wr(id, { id, name: req.file.originalname, src: path.basename(src), W, H, duration, hasAudio, words: null, cues: null, edited: false, lang: '' });
  res.json(rd(id));
}));

app.get('/api/:id/job', wrap((req, res) => res.json(rd(req.params.id))));
app.get('/api/:id/poster', (req, res) => { try { res.sendFile(path.join(dirOf(req.params.id), 'poster.jpg')); } catch { res.status(404).end(); } });
app.get('/api/:id/video', (req, res) => { try { const j = rd(req.params.id); res.sendFile(path.join(dirOf(j.id), j.src)); } catch { res.status(404).end(); } });

// ---------- transcription ----------
app.post('/api/:id/transcribe', wrap(async (req, res) => {
  const j = rd(req.params.id), dir = dirOf(j.id), lang = (req.body.lang || '').trim();
  if (!j.hasAudio) throw new Error('This video has no sound');
  TASKS.set(j.id, { kind: 'transcribe', state: 'run', pct: 5 });
  res.json({ ok: true });
  (async () => {
    try {
      await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', path.join(dir, j.src), '-vn', '-ac', '1', '-ar', '16000', path.join(dir, 'voice.wav')]);
      TASKS.set(j.id, { kind: 'transcribe', state: 'run', pct: 20 });
      const raw = await transcribe(path.join(dir, 'voice.wav'), dir, lang);
      const words = raw.map(w => ({ w: String(w.text || w.word || '').trim(), start: +w.start, end: +w.end })).filter(w => w.w);
      if (!words.length) throw new Error('No speech found');
      const k = rd(j.id);
      k.words = words; k.lang = lang; k.edited = false; k.orig = null;
      k.cues = autoCues(words, { style: 'classic' });
      wr(j.id, k);
      TASKS.set(j.id, { kind: 'transcribe', state: 'done', pct: 100 });
    } catch (e) { TASKS.set(j.id, { kind: 'transcribe', state: 'error', error: String(e.message).slice(0, 300) }); }
  })();
}));
app.get('/api/:id/task', (req, res) => res.json(TASKS.get(req.params.id) || { state: 'idle' }));

// import an existing .srt instead of recognising speech
const tcs = s => { const m = /(\d+):(\d+):(\d+)[,.](\d+)/.exec(s); return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] + +('0.' + m[4]) : 0; };
app.post('/api/:id/import-srt', wrap(async (req, res) => {
  const j = rd(req.params.id), cues = [];
  String(req.body.text || '').replace(/\r/g, '').split(/\n\s*\n/).forEach(b => {
    const l = b.trim().split('\n'), i = l.findIndex(x => x.includes('-->')); if (i < 0) return;
    const [a, c] = l[i].split('-->'), text = l.slice(i + 1).join(' ').replace(/<[^>]+>/g, '').trim();
    if (text) cues.push({ start: tcs(a), end: tcs(c), text });
  });
  if (!cues.length) throw new Error('No subtitles found in this text');
  j.cues = cues; j.edited = true; j.words = null; wr(j.id, j); res.json(j);
}));

// ---------- edit cues ----------
app.post('/api/:id/cues', wrap(async (req, res) => {
  const j = rd(req.params.id);
  j.cues = (req.body.cues || []).map(c => ({ start: +c.start, end: +c.end, text: String(c.text || '').replace(/\s+/g, ' ').trim() })).filter(c => c.text && c.end > c.start);
  j.edited = true; wr(j.id, j); res.json({ ok: true, n: j.cues.length });
}));
app.post('/api/:id/regroup', wrap(async (req, res) => {          // back to the automatic grouping of the chosen style
  const j = rd(req.params.id); if (!j.words) throw new Error('Nothing to regroup (subtitles were imported)');
  j.cues = autoCues(j.words, { style: req.body.style, capLines: req.body.capLines }); j.edited = false; wr(j.id, j); res.json(j);
}));

// ---------- translation (local model through Ollama) ----------
const OLLAMA = process.env.OLLAMA_URL || 'http://127.0.0.1:11434', MODEL = process.env.CAP_MODEL || 'gemma3:4b';
async function translateBatch(lines, from, to) {
  const sys = `You are a professional subtitle translator. Translate each numbered line ${from ? 'from ' + from + ' ' : ''}into ${to}. Keep the meaning and the tone, keep every line short, keep numbers and names. Answer with JSON only: {"t":["...","..."]} with exactly ${lines.length} strings in the same order.`;
  const r = await (await fetch(OLLAMA + '/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(300000), body: JSON.stringify({ model: MODEL, stream: false, format: 'json', keep_alive: '5m', options: { temperature: 0.2, num_ctx: 4096 }, messages: [{ role: 'system', content: sys }, { role: 'user', content: lines.map((l, i) => (i + 1) + '. ' + l).join('\n') }] }) })).json();
  const t = JSON.parse(r.message.content).t;
  if (!Array.isArray(t) || t.length !== lines.length) throw new Error('count');
  return t.map(x => String(x).trim());
}
app.post('/api/:id/translate', wrap(async (req, res) => {
  const j = rd(req.params.id), to = (LANGS.find(l => l.code === req.body.to) || {}).name;
  if (!to) throw new Error('Unknown language');
  if (!j.cues || !j.cues.length) throw new Error('Make the subtitles first');
  try { await fetch(OLLAMA + '/api/tags', { signal: AbortSignal.timeout(2000) }); } catch { throw new Error('Ollama is not running (it translates the text). Start Ollama and try again.'); }
  if (!j.orig) j.orig = j.cues;                                        // always translate from the original, so changing the language twice does not degrade the text
  const from = (LANGS.find(l => l.code === j.lang) || {}).name || '';
  TASKS.set(j.id, { kind: 'translate', state: 'run', pct: 3 });
  res.json({ ok: true });
  (async () => {
    try {
      const out = [], src = j.orig, B = 10;
      for (let i = 0; i < src.length; i += B) {
        const part = src.slice(i, i + B).map(c => c.text);
        let t; try { t = await translateBatch(part, from, to); } catch { t = []; for (const p of part) { try { t.push((await translateBatch([p], from, to))[0]); } catch { t.push(p); } } }
        t.forEach((x, k) => out.push({ start: src[i + k].start, end: src[i + k].end, text: x }));
        TASKS.set(j.id, { kind: 'translate', state: 'run', pct: Math.round(100 * (i + B) / src.length) });
      }
      const k = rd(j.id); k.cues = out; k.orig = src; k.edited = true; k.words = null; k.target = req.body.to; wr(j.id, k);
      TASKS.set(j.id, { kind: 'translate', state: 'done', pct: 100 });
    } catch (e) { TASKS.set(j.id, { kind: 'translate', state: 'error', error: String(e.message).slice(0, 300) }); }
  })();
}));
app.post('/api/:id/original', wrap(async (req, res) => { const j = rd(req.params.id); if (j.orig) { j.cues = j.orig; j.orig = null; j.target = null; wr(j.id, j); } res.json(j); }));

// ---------- styles / fonts / languages ----------
app.get('/api/meta', (req, res) => res.json({
  langs: LANGS,
  styles: Object.entries(TEMPLATES).map(([id, t]) => ({ id, label: t.label, accent: t.accent, font: t.font, mode: t.mode, upper: !!t.upper })),
  pexels: !!require('./extras').pexelsKey(),
  fonts: fonts.list().filter(f => f.source === 'bundled' || f.source).map(f => ({ label: f.label, cyr: !!f.cyrillic, greek: !!f.greek }))
}));

// ---------- the ASS file for a job ----------
function assFor(j, o) {
  const text = (j.cues || []).map(c => c.text).join(' '), sc = scriptOf(text);
  const style = TEMPLATES[o.style] ? o.style : 'hormozi';
  const useCues = j.edited || !j.words;
  const font = o.font || fontFor(sc);                                  // other scripts (CJK, Arabic, Thai...) need a font that has the letters
  let cues = useCues ? j.cues : null;
  if (cues && sc === 'cjk') cues = cues.flatMap(c => {      // no spaces inside Chinese / Japanese lines; long lines are cut into pieces of at most 9 characters
    const t = [...c.text.replace(/\s+/g, '')], n = Math.max(1, Math.ceil(t.length / 9)), per = Math.ceil(t.length / n), d = (c.end - c.start) / n;
    return Array.from({ length: n }, (_, i) => ({ start: c.start + d * i, end: c.start + d * (i + 1), text: t.slice(i * per, (i + 1) * per).join('') }));
  });
  const words = !useCues ? j.words : [];
  return buildAss(words, j.W, j.H, [], {
    style, accent: o.accent || undefined, font: font || undefined, capScale: +o.capScale || 1, capLines: +o.capLines || undefined,
    capX: o.capX != null && o.capX !== '' ? +o.capX : undefined, capY: o.capY != null && o.capY !== '' ? +o.capY : undefined,
    cues: cues || undefined, measure: require(path.join(ROOT, 'lib', 'textwidth')).measure
  });
}
const FONTS = fonts.fontsDirOpt();

// exact preview: one frame of the video with the real subtitles
app.post('/api/:id/preview', wrap(async (req, res) => {
  const j = rd(req.params.id), dir = dirOf(j.id), o = req.body || {};
  const t = Math.max(0, Math.min(+o.t || 0, Math.max(0, j.duration - 0.05)));
  const tag = Math.random().toString(36).slice(2, 8), ass = path.join(dir, 'pv_' + tag + '.ass'), out = path.join(dir, 'pv_' + tag + '.jpg');
  const k = Math.min(1, 720 / j.W), pw = Math.round(j.W * k / 2) * 2, ph = Math.round(j.H * k / 2) * 2;     // the subtitles are built for the scaled frame
  fs.writeFileSync(ass, assFor({ ...j, W: pw, H: ph }, o));
  try {
    await run('ffmpeg', ['-y', '-loglevel', 'error', '-ss', String(t), '-copyts', '-i', path.join(dir, j.src), '-vf', `scale=${pw}:${ph},ass=${path.basename(ass)}:fontsdir=${FONTS}`, '-frames:v', '1', '-q:v', '3', path.basename(out)], { cwd: dir });
    res.type('jpg').send(fs.readFileSync(out));
  } finally { fs.rmSync(ass, { force: true }); fs.rmSync(out, { force: true }); }
}));

// ---------- burn ----------
const X = require('./extras');
const photoUp = multer({ dest: path.join(WORK, '_tmp'), limits: { fileSize: 40 * 1024 ** 2 } });
app.post('/api/:id/photo', photoUp.single('file'), wrap(async (req, res) => {          // the user's own photo for the start of the video
  const j = rd(req.params.id), dir = dirOf(j.id); if (!req.file) throw new Error('No file');
  const ext = (path.extname(req.file.originalname) || '.jpg').toLowerCase().replace(/[^.a-z0-9]/g, '');
  if (!/^.(jpe?g|png|webp|gif|bmp|heic)$/.test(ext)) { fs.rmSync(req.file.path, { force: true }); throw new Error('This is not a picture'); }
  for (const f of fs.readdirSync(dir)) if (f.startsWith('photo_user')) fs.rmSync(path.join(dir, f), { force: true });
  fs.renameSync(req.file.path, path.join(dir, 'photo_user' + ext)); res.json({ ok: true, name: req.file.originalname });
}));
app.post('/api/:id/render', wrap(async (req, res) => {
  const j = rd(req.params.id), dir = dirOf(j.id), o = req.body || {};
  fs.writeFileSync(path.join(dir, 'subs.ass'), assFor(j, o));
  const ex = { intro: { on: false }, outro: { on: false } };
  if (o.intro && o.intro.on) {
    let photo = null;
    if (o.intro.source === 'nature') photo = (await X.naturePhoto(dir, j.W, j.H)).file;
    else { const f = fs.readdirSync(dir).find(n => n.startsWith('photo_user')); if (!f) throw new Error('Choose a photo first'); photo = path.join(dir, f); }
    ex.intro = { on: true, sec: o.intro.sec, photo };
  }
  if (o.outro && o.outro.on) { const t = X.parseTime(o.outro.target); if (!t) throw new Error('Write the length like 9:50'); ex.outro = { on: true, target: t, down: !!o.outro.down, bg: o.outro.bg }; }
  const pl = await X.plan(j, dir, ex, FONTS);      // throws a readable message when the target is shorter than the video
  TASKS.set(j.id, { kind: 'render', state: 'run', pct: 1 });
  res.json({ ok: true });
  const p = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-progress', 'pipe:1', ...pl.args, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', 'out.mp4'], { cwd: dir });
  let err = '';
  p.stdout.on('data', d => { const m = /out_time_us=(d+)/.exec(String(d)); if (m && pl.total) TASKS.set(j.id, { kind: 'render', state: 'run', pct: Math.min(99, Math.round(+m[1] / 1e4 / pl.total)) }); });
  p.stderr.on('data', d => { err = (err + d).slice(-600); });
  p.on('close', c => TASKS.set(j.id, c === 0 ? { kind: 'render', state: 'done', pct: 100 } : { kind: 'render', state: 'error', error: err }));
}));
app.get('/api/:id/download', (req, res) => {
  try { const j = rd(req.params.id); res.download(path.join(dirOf(j.id), 'out.mp4'), path.basename(j.name, path.extname(j.name)) + '_subs.mp4'); } catch { res.status(404).end(); }
});

// ---------- export text files ----------
const ts = (t, c) => { const h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), s = Math.floor(t % 60), ms = Math.round((t % 1) * 1000); return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0') + c + String(ms).padStart(3, '0'); };
app.get('/api/:id/srt', wrap((req, res) => { const j = rd(req.params.id); res.type('text/plain; charset=utf-8').set('Content-Disposition', 'attachment; filename="subtitles.srt"').send((j.cues || []).map((c, i) => `${i + 1}\n${ts(c.start, ',')} --> ${ts(c.end, ',')}\n${c.text}\n`).join('\n')); }));
app.get('/api/:id/txt', wrap((req, res) => { const j = rd(req.params.id); res.type('text/plain; charset=utf-8').set('Content-Disposition', 'attachment; filename="text.txt"').send((j.cues || []).map(c => c.text).join('\n')); }));

// clean old jobs (older than 3 days)
setInterval(() => { try { for (const d of fs.readdirSync(WORK)) { const p = path.join(WORK, d); if (d !== '_tmp' && Date.now() - fs.statSync(p).mtimeMs > 3 * 864e5) fs.rmSync(p, { recursive: true, force: true }); } } catch {} }, 6 * 3600e3);

const PORT = +process.env.CAP_PORT || 4318;
app.listen(PORT, () => console.log('Subtitle Studio on http://localhost:' + PORT));
