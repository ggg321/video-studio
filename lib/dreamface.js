// DreamFace manual path: build a package (audio + script + manifest) for manual lip-sync processing, then receive the finished
// videos (watch folder / upload), match them to creatives, check them and import them as the creative's presenter video.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { spawnSync } = require('child_process');
const multer = require('multer');
const { run, probe, FORMATS } = require('./render');
const { parseBlocks } = require('./script');
const workfolder = require('./workfolder');

const ROOT = path.join(__dirname, '..');
const BASE = path.join(ROOT, 'data', 'dreamface'), STORE = path.join(BASE, 'store'), INBOX = path.join(BASE, 'inbox'), QFILE = path.join(BASE, 'queue.json');
[STORE, INBOX].forEach(d => fs.mkdirSync(d, { recursive: true }));
const EXT = /\.(mp4|mov|m4v|webm)$/i;
const slug = s => String(s || 'creative').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'creative';
const keyOf = p => `${String(p.creativeNo || 0).padStart(2, '0')}_${slug(p.name)}_${p.id.slice(-6)}`;

const loadQ = () => { try { return JSON.parse(fs.readFileSync(QFILE, 'utf8')); } catch { return []; } };
const saveQ = q => fs.writeFileSync(QFILE, JSON.stringify(q, null, 1));

// ---- audio: mp3 + optional split at pauses ----
function silences(file) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-vn', '-af', 'silencedetect=n=-38dB:d=0.25', '-f', 'null', '-'], { encoding: 'utf8' }).stderr || '';
  const out = []; let st = null;
  for (const m of r.matchAll(/silence_(start|end): (-?[\d.]+)/g)) { if (m[1] === 'start') st = +m[2]; else if (st != null) { out.push((st + +m[2]) / 2); st = null; } }
  return out;
}
function planParts(total, maxSec, pauses) {
  if (!maxSec || total <= maxSec + 1) return [{ start: 0, end: total }];
  const parts = []; let s = 0;
  while (total - s > maxSec + 1) {
    const cand = pauses.filter(t => t > s + maxSec * 0.5 && t <= s + maxSec);
    const cut = cand.length ? cand[cand.length - 1] : s + maxSec;
    parts.push({ start: +s.toFixed(3), end: +cut.toFixed(3) }); s = cut;
  }
  parts.push({ start: +s.toFixed(3), end: +total.toFixed(3) });
  return parts;
}

// projects: array of project objects (with voiceFile); getDir(id) -> project dir; task: task object|null
async function buildPackage(projects, getDir, task, opts = {}) {
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
  const root = path.join(workfolder.EXPORTS, workfolder.safe(task ? task.title : 'Standalone creatives'), 'DreamFace_' + stamp);
  fs.mkdirSync(root, { recursive: true });
  const manifest = [], skipped = [];
  for (const p of projects) {
    const dir = getDir(p.id), voice = p.voiceFile && path.join(dir, p.voiceFile);
    if (!voice || !fs.existsSync(voice)) { skipped.push({ name: p.name, why: 'no voice file' }); continue; }
    const key = keyOf(p), d = path.join(root, key); fs.mkdirSync(d, { recursive: true });
    const total = await probe(voice), parts = planParts(total, +opts.maxSeconds || 0, +opts.maxSeconds ? silences(voice) : []);
    const files = [];
    for (let i = 0; i < parts.length; i++) {
      const name = parts.length > 1 ? `${key}_p${i + 1}.mp3` : `${key}.mp3`;
      await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', voice, '-ss', String(parts[i].start), '-t', String(parts[i].end - parts[i].start), '-vn', '-ac', '1', '-ar', '44100', '-b:a', '128k', path.join(d, name)]);
      files.push({ file: name, start: parts[i].start, end: parts[i].end, seconds: +(parts[i].end - parts[i].start).toFixed(2) });
    }
    fs.writeFileSync(path.join(d, 'script.txt'), parseBlocks(p.script || '').join('\n\n'));
    let face = null;
    if (opts.includeVideo && p.presenterFile && fs.existsSync(path.join(dir, p.presenterFile))) { face = `${key}_face_reference.mp4`; fs.copyFileSync(path.join(dir, p.presenterFile), path.join(d, face)); }
    const entry = { key, projectId: p.id, name: p.name, audio: files, totalSeconds: +total.toFixed(2), script: 'script.txt', faceReference: face, expectInResult: files.map(f => f.file.replace(/\.mp3$/, '')) };
    fs.writeFileSync(path.join(d, 'manifest.json'), JSON.stringify(entry, null, 1)); manifest.push(entry);
    p._df = { status: 'packaged', key, parts: files.map(f => ({ file: f.file, start: f.start, end: f.end })), packagedAt: Date.now(), dir: d };
  }
  fs.writeFileSync(path.join(root, 'manifest.json'), JSON.stringify(manifest, null, 1));
  fs.writeFileSync(path.join(root, 'README.txt'), [
    'Video Studio: package for manual lip-sync (DreamFace)', '',
    'Each folder is one creative. For each audio file (.mp3):',
    '  1. Open DreamFace and create a lip-sync video from your face/avatar and that audio.',
    '  2. Download the finished video and keep a file name that contains the folder name (key),',
    '     for example "' + (manifest[0] ? manifest[0].key : '01_name_abc123') + '" (parts: "..._p1", "..._p2").',
    '  3. Put the finished videos into the Video Studio inbox folder (or drag them onto the Tasks page > DreamFace).', '',
    'Video Studio matches them by name, checks them and imports them after you confirm.',
    'If a name was lost, assign the clip to a creative by hand in the import queue.'].join('\n'));
  let zip = null;
  const zp = root + '.zip';
  const t = spawnSync('tar', ['-a', '-c', '-f', zp, '-C', root, '.'], { encoding: 'utf8' });
  if (t.status === 0 && fs.existsSync(zp)) zip = zp;
  return { dir: root, zip, items: manifest.map(m => ({ key: m.key, name: m.name, projectId: m.projectId, parts: m.audio.length, seconds: m.totalSeconds })), skipped, dfByProject: Object.fromEntries(projects.filter(p => p._df).map(p => [p.id, p._df])) };
}

// ---- checks ----
function probeClip(file) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file], { encoding: 'utf8' });
  let j = {}; try { j = JSON.parse(r.stdout); } catch {}
  const v = (j.streams || []).find(s => s.codec_type === 'video'), a = (j.streams || []).find(s => s.codec_type === 'audio');
  return { video: !!v, audio: !!a, width: v && v.width, height: v && v.height, duration: +((j.format && j.format.duration) || 0) };
}
function checkClip(info, expected, format) {
  const out = [], [W, H] = FORMATS[format] || FORMATS.square;
  out.push({ status: info.video ? 'pass' : 'fail', title: 'Has a video track', detail: info.video ? `${info.width}×${info.height}` : 'This file has no picture.' });
  if (info.video && expected) {
    const d = Math.abs(info.duration - expected);
    out.push({ status: d > 3 ? 'fail' : d > 1 ? 'warn' : 'pass', title: 'Length matches the audio', detail: `${info.duration.toFixed(1)} s video, ${expected.toFixed(1)} s audio${d > 1 ? ': lip movement may drift or the end may be cut' : ''}` });
  }
  if (info.video) { const portrait = H > W, clipPortrait = info.height > info.width; out.push({ status: portrait === clipPortrait || Math.abs(info.width / info.height - W / H) < 0.15 ? 'pass' : 'warn', title: 'Picture shape fits the video format', detail: `clip ${info.width}×${info.height}, project ${W}×${H} (it will be cropped to fill)` }); }
  out.push({ status: info.audio ? 'pass' : 'warn', title: 'Has sound', detail: info.audio ? '' : 'No sound track: your voice file is used anyway.' });
  return out;
}
const worst = c => c.some(x => x.status === 'fail') ? 'fail' : c.some(x => x.status === 'warn') ? 'warn' : 'pass';

// ---- matching ----
// part number "_p2" / "-p2" / " p2" after the creative key was removed from the name (the key itself may contain "_p123")
function partOf(name, token) {
  const rest = name.split(token).join(' ');
  const all = [...rest.matchAll(/(?:^|[_\-\s(\[])(?:p|part)[ _-]?(\d{1,3})(?!\d)/g)];
  return all.length ? +all[all.length - 1][1] : 1;
}
function matchProject(filename, candidates) {
  const n = filename.toLowerCase().replace(/\.[^.]+$/, '');
  for (const c of candidates) { const k = c.df.key.toLowerCase(); if (n.includes(k)) return { projectId: c.id, part: partOf(n, k) }; }
  for (const c of candidates) { const id6 = c.id.slice(-6).toLowerCase(); if (n.includes(id6)) return { projectId: c.id, part: partOf(n, id6) }; }
  return null;
}

function mount(app, c) {
  const { load, save, pdir, wrap, settings, creativesOf, taskslib, allProjects } = c;
  const upload = multer({ storage: multer.diskStorage({ destination: STORE, filename: (req, f, cb) => cb(null, Date.now().toString(36) + '_' + crypto.randomBytes(2).toString('hex') + '_' + f.originalname.replace(/[^A-Za-z0-9._-]/g, '_')) }) });
  const candidates = () => allProjects().filter(p => p.dreamface && p.dreamface.key).map(p => ({ id: p.id, df: p.dreamface }));
  const inboxDir = () => { const d = settings().dreamfaceInbox; return d && fs.existsSync(d) ? d : INBOX; };

  function enqueue(file, orig) {
    const q = loadQ(), info = probeClip(file), m = matchProject(orig, candidates());
    const e = { id: crypto.randomBytes(6).toString('hex'), file: path.basename(file), name: orig, size: fs.statSync(file).size, info, addedAt: Date.now(), projectId: m && m.projectId, part: m ? m.part : 1, status: 'new' };
    q.push(e); saveQ(q); return e;
  }
  const seen = new Map(), doneKeys = () => new Set(loadQ().map(e => e.src).filter(Boolean));
  function scan() {
    const dir = inboxDir(); let added = 0; const done = doneKeys();
    for (const name of fs.readdirSync(dir)) {
      if (!EXT.test(name)) continue; const full = path.join(dir, name); let st; try { st = fs.statSync(full); } catch { continue; }
      if (!st.isFile() || st.size < 50000) continue;
      const key = name + '|' + st.size + '|' + Math.round(st.mtimeMs); if (done.has(key)) continue;
      const prev = seen.get(full); seen.set(full, st.size); if (prev !== st.size) continue;       // wait until the download is finished
      const dst = path.join(STORE, Date.now().toString(36) + '_' + name.replace(/[^A-Za-z0-9._-]/g, '_')); fs.copyFileSync(full, dst);
      const e = enqueue(dst, name); const q = loadQ(), t = q.find(x => x.id === e.id); t.src = key; saveQ(q); added++;
    }
    return added;
  }
  setInterval(() => { try { scan(); } catch (e) { console.error('dreamface scan', e.message); } }, 15000);

  const view = () => {
    const projs = new Map(allProjects().map(p => [p.id, p]));
    return loadQ().filter(e => e.status !== 'ignored').map(e => {
      const p = e.projectId && projs.get(e.projectId), parts = p && p.dreamface && p.dreamface.parts;
      const expected = parts ? (parts[(e.part || 1) - 1] ? parts[(e.part || 1) - 1].end - parts[(e.part || 1) - 1].start : null) : null;
      const checks = e.status === 'imported' ? e.checks : checkClip(e.info, expected, p && p.format);
      return { ...e, projectName: p ? p.name : null, parts: parts ? parts.length : 0, checks, result: worst(checks || []) };
    });
  };
  app.get('/api/dreamface/queue', wrap((req, res) => res.json({ inbox: inboxDir(), items: view() })));
  app.post('/api/dreamface/scan', wrap((req, res) => res.json({ added: scan(), items: view() })));
  app.post('/api/dreamface/upload', upload.array('files', 40), wrap((req, res) => { (req.files || []).forEach(f => enqueue(f.path, f.originalname)); res.json({ items: view() }); }));
  app.post('/api/dreamface/:qid/assign', wrap((req, res) => { const q = loadQ(), e = q.find(x => x.id === req.params.qid); if (!e) return res.status(404).json({ error: 'Not in the queue.' }); e.projectId = req.body.projectId || null; e.part = Math.max(1, +req.body.part || 1); saveQ(q); res.json({ items: view() }); }));
  app.post('/api/dreamface/:qid/ignore', wrap((req, res) => { const q = loadQ(), e = q.find(x => x.id === req.params.qid); if (e) { e.status = 'ignored'; saveQ(q); } res.json({ items: view() }); }));

  async function concatParts(dir, p, files, W, H) {
    const norm = [];
    for (let i = 0; i < files.length; i++) {
      const out = path.join(dir, `df_norm_${i}.mp4`);
      await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', path.join(dir, files[i]), '-vf', `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fps=30,format=yuv420p,setsar=1`, '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', out]); norm.push(out);
    }
    fs.writeFileSync(path.join(dir, 'df_list.txt'), norm.map(f => "file '" + path.basename(f) + "'").join('\n') + '\n');
    await run('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', 'df_list.txt', '-c', 'copy', 'presenter.mp4'], { cwd: dir });
    norm.forEach(f => { try { fs.unlinkSync(f); } catch {} }); try { fs.unlinkSync(path.join(dir, 'df_list.txt')); } catch {}
  }
  app.post('/api/dreamface/:qid/import', wrap(async (req, res) => {
    const q = loadQ(), e = q.find(x => x.id === req.params.qid);
    if (!e || !e.projectId) return res.status(400).json({ error: 'Choose a creative for this clip first.' });
    const p = load(e.projectId), df = p.dreamface || { parts: [{ start: 0, end: 0 }], key: '' }, dir = pdir(p.id), n = Math.max(1, df.parts.length);
    const checks = checkClip(probeClip(path.join(STORE, e.file)), df.parts[(e.part || 1) - 1] ? df.parts[(e.part || 1) - 1].end - df.parts[(e.part || 1) - 1].start : null, p.format);
    if (worst(checks) === 'fail') return res.status(400).json({ error: 'The clip failed the check: ' + checks.filter(c => c.status === 'fail').map(c => c.title).join('; ') });
    const part = Math.min(n, e.part || 1), pf = `df_part${part}.mp4`;
    fs.copyFileSync(path.join(STORE, e.file), path.join(dir, pf));
    const got = new Set(df.got || []); got.add(part);
    const [W, H] = FORMATS[p.format] || FORMATS.square;
    let status = 'partial';
    if (got.size >= n) {
      if (n === 1) fs.copyFileSync(path.join(dir, pf), path.join(dir, 'presenter.mp4'));
      else await concatParts(dir, p, Array.from({ length: n }, (_, i) => `df_part${i + 1}.mp4`), W, H);
      status = 'imported';
    }
    const r = load(p.id);
    r.dreamface = { ...(r.dreamface || {}), key: df.key, parts: df.parts, got: [...got], status, importedAt: Date.now(), checks: worst(checks) };
    if (status === 'imported') { r.presenterFile = 'presenter.mp4'; r.lipsyncSource = 'dreamface'; if (!['analyzing', 'rendering', 'queued', 'assembling'].includes(r.status)) r.status = r.words ? 'planned' : 'media'; for (const f of fs.readdirSync(dir)) if (/^preview_.*\.jpg$/.test(f)) { try { fs.unlinkSync(path.join(dir, f)); } catch {} } }
    r.updated = Date.now(); save(r);
    e.status = 'imported'; e.checks = checks; saveQ(q);
    res.json({ ok: true, status, got: got.size, of: n, items: view() });
  }));

  app.post('/api/dreamface/package', wrap(async (req, res) => {
    const ids = (req.body.ids || []).filter(Boolean); if (!ids.length) return res.status(400).json({ error: 'Choose at least one creative.' });
    const projs = ids.map(id => load(id)), task = projs[0].taskId ? taskslib.get(projs[0].taskId) : null;
    const r = await buildPackage(projs, pdir, task, { includeVideo: !!req.body.includeVideo, maxSeconds: +req.body.maxSeconds || 0 });
    for (const [id, df] of Object.entries(r.dfByProject)) { const p = load(id); p.dreamface = df; p.updated = Date.now(); save(p); }
    delete r.dfByProject; res.json(r);
  }));
  app.get('/api/dreamface/eligible', wrap((req, res) => res.json(allProjects().filter(p => p.voiceFile && (!req.query.task || p.taskId === req.query.task)).map(p => ({ id: p.id, name: p.name, no: p.creativeNo, taskId: p.taskId || null, df: p.dreamface ? { status: p.dreamface.status, got: (p.dreamface.got || []).length, parts: (p.dreamface.parts || []).length } : null, hasVideo: !!p.presenterFile })))));
}
module.exports = { mount, buildPackage, matchProject, checkClip, planParts, keyOf };
