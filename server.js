const express = require('express');
const multer = require('multer');
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { parseBlocks, lint, align } = require('./lib/script');
const { plan, coverBad, rank, buildUnits, buildSentences, LIB } = require('./lib/plan');
const embed = require('./lib/embed');
const inbox = require('./lib/inbox');
const srt = require('./lib/srt');
const qc = require('./lib/qc');
const recovery = require('./lib/recovery');
const feedback = require('./lib/feedback');
const { norm: normWord } = require('./lib/script');
const speakers = require('./lib/speakers');
const segments = require('./lib/segments');
const taskslib = require('./lib/tasks');
const asana = require('./lib/asana');
const gdocs = require('./lib/gdocs');
const workfolder = require('./lib/workfolder');
const presets = require('./lib/presets');
const flowprompt = require('./lib/flowprompt');
const { render, run, probe } = require('./lib/render');

const ROOT = __dirname, PROJ = path.join(ROOT, 'projects'), SETTINGS = process.env.SETTINGS_FILE || path.join(ROOT, 'data', 'settings.json');
fs.mkdirSync(PROJ, { recursive: true });
const app = express();
app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(ROOT, 'public')));
app.use('/library', express.static(path.join(ROOT, 'library')));
app.use('/thumbs', express.static(path.join(ROOT, 'data', 'thumbs')));
app.use('/files', express.static(PROJ));
app.use('/audio', express.static(path.join(ROOT, 'data', 'audio')));
const AUDIO_INDEX = () => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'audio', 'index.json'), 'utf8')); } catch { return []; } };
// Automatic SFX placement from the cut list: pop on cards, whoosh on clip inserts, swish on zoom punch-ins.
// Style = which sound categories go on cards / clip inserts / zoom punch-ins (variants cycle through everything available)
const SFX_STYLES = {
  standard: { card: ['pop', 0.45], insert: ['whoosh', 0.5], zoom: ['swish', 0.35] },
  soft: { card: ['click', 0.5], insert: ['swish', 0.4], zoom: ['tick', 0.4] },
  punchy: { card: ['hit', 0.4], insert: ['whoosh', 0.55], zoom: ['drop', 0.3] },
  clean: { card: ['notify', 0.35], insert: ['swish', 0.4], zoom: ['click', 0.35] }
};
// sound that fits each transition: [category, volume, seconds before the cut]
const TR_SFX = { slideleft: ['swish', 0.45, 0.06], slideup: ['swish', 0.45, 0.06], flash: ['hit', 0.5, 0.05], flashwarm: ['hit', 0.45, 0.06], glow: ['sparkle', 0.5, 0.1], sweep: ['whoosh', 0.55, 0.2], leak: ['swish', 0.4, 0.2], flare: ['whoosh', 0.45, 0.1], zoomin: ['whoosh', 0.5, 0.06], zoomout: ['swish', 0.45, 0.06], punch: ['hit', 0.55, 0.04], whip: ['whoosh', 0.6, 0.06], newsblue: ['whoosh', 0.55, 0.04], newsred: ['whoosh', 0.55, 0.04], bars: ['stinger', 0.5, 0.2], glitch: ['glitch', 0.5, 0.02] };
function autoSfx(p, style = 'standard') {
  const S = SFX_STYLES[style] || SFX_STYLES.standard, idx = AUDIO_INDEX(), n = {}, ev = [];
  const pick = cat => { const c = idx.filter(x => x.cat === cat).length || 1; n[cat] = (n[cat] || 0) + 1; return cat + '_' + (1 + ((n[cat] - 1) % c)); };
  const fxm = require('./lib/fx'), trOn = (p.audio || {}).transSfx !== false;
  (p.cuts || []).forEach((x, k) => {
    if (x.clip === 'card') { ev.push({ t: +(x.start).toFixed(2), id: pick(S.card[0]), vol: S.card[1] }); return; }
    const m = trOn ? TR_SFX[fxm.pick(x.tr || p.transition || 'fade', k)] : null;      // a transition with its own sound replaces the generic insert sound
    if (m) ev.push({ t: +Math.max(0, x.start - m[2]).toFixed(2), id: pick(m[0]), vol: m[1], src: 'tr' });
    else ev.push({ t: +Math.max(0, x.start - 0.06).toFixed(2), id: pick(S.insert[0]), vol: S.insert[1] });
  });
  (p.zooms || []).forEach(z => ev.push({ t: +z.start.toFixed(2), id: pick(S.zoom[0]), vol: S.zoom[1] }));
  return ev.sort((a, b) => a.t - b.t);
}

// one heavy job at a time (analyze / render), the rest wait in line
let chain = Promise.resolve();
const enqueue = fn => { chain = chain.then(fn, fn); return chain; };
// journaled job: survives a crash as an entry the app can offer to resume
const JOBS = { cur: null, n: 0 };
const enqueueJob = (kind, projectId, fn) => { const id = crypto.randomBytes(5).toString('hex'); recovery.runAdd({ id, kind, projectId, at: Date.now() }); JOBS.n++; return enqueue(async () => { JOBS.n--; let name = ''; try { name = load(projectId).name; } catch {} JOBS.cur = { kind, projectId, name, since: Date.now() }; try { return await fn(); } finally { JOBS.cur = null; recovery.runRemove(id); } }); };
const pdir = id => path.join(PROJ, id.replace(/[^\w-]/g, ''));
const load = id => JSON.parse(fs.readFileSync(path.join(pdir(id), 'project.json'), 'utf8'));
const save = p => fs.writeFileSync(path.join(pdir(p.id), 'project.json'), JSON.stringify(p, null, 1));
const settings = () => { try { return JSON.parse(fs.readFileSync(SETTINGS, 'utf8')); } catch { return {}; } };
const wrap = fn => (req, res) => Promise.resolve(fn(req, res)).catch(e => { console.error(e); res.status(500).json({ error: e.message }); });
const set = (p, patch) => { Object.assign(p, patch); save(p); };
// the niche of a project together with the other libraries it may use (p.libs: 'all' or a list of niche ids)
const nicheOf = p => niches.get(p.niche, { libs: p.libs });

const upload = multer({ storage: multer.diskStorage({
  destination: (req, f, cb) => cb(null, pdir(req.params.id)),
  filename: (req, f, cb) => cb(null, (f.fieldname === 'presenter' ? 'presenter' : 'voice_in') + path.extname(f.originalname || '.bin').toLowerCase())
}) });

app.get('/api/audio', (req, res) => res.json(AUDIO_INDEX()));
app.get('/api/projects/:id/music-suggest', wrap((req, res) => {
  const p = load(req.params.id), labels = Object.fromEntries(AUDIO_INDEX().filter(a => a.cat === 'music').map(a => [a.id, a.label]));
  res.json(require('./lib/mood').suggest(p, nicheOf(p), labels));
}));
app.post('/api/projects/:id/audio', wrap((req, res) => {
  const p = load(req.params.id), a = req.body || {};
  p.audio = { sfxStyle: a.sfxStyle || 'standard', musicOn: a.musicOn !== false, sfxOn: a.sfxOn !== false, music: a.music || null, musicVol: Math.min(1, Math.max(0, +a.musicVol || 0.18)),
    transSfx: a.transSfx !== false,
    sfx: (a.sfx || []).map(e => ({ t: +e.t, id: String(e.id).replace(/[^\w-]/g, ''), vol: Math.min(1, Math.max(0, +e.vol || 0.5)), ...(e.src === 'tr' ? { src: 'tr' } : {}) })) };
  p.updated = Date.now(); save(p); res.json(p.audio);
}));
app.post('/api/projects/:id/autosfx', wrap((req, res) => {
  const p = load(req.params.id);
  p.audio = { musicOn: (p.audio || {}).musicOn !== false, sfxOn: (p.audio || {}).sfxOn !== false, music: (p.audio || {}).music || null, musicVol: (p.audio || {}).musicVol ?? 0.18, sfxStyle: SFX_STYLES[req.body.style] ? req.body.style : ((p.audio || {}).sfxStyle || 'standard'), transSfx: (p.audio || {}).transSfx !== false, sfx: [] };
  p.audio.sfx = autoSfx(p, p.audio.sfxStyle);
  save(p); res.json(p.audio);
}));
app.get('/api/styles', (req, res) => res.json(Object.entries(require('./lib/ass').TEMPLATES).map(([id, t]) => ({ id, label: t.label, accent: t.accent, font: t.font, bold: t.bold, size: t.size, pos: t.pos, upper: !!t.upper, box: !!t.box, glow: !!t.glow, soft: !!t.soft, italic: !!t.italic, pal: t.pal || null, lines: t.lines || 1, mode: t.mode, words: t.words }))));
// one frame of the presenter video, used as background in the caption preview
app.get('/api/projects/:id/frame', wrap(async (req, res) => {
  const p = load(req.params.id), dir = pdir(p.id);
  if (!p.presenterFile) return res.status(404).end();
  const [W, H] = require('./lib/render').FORMATS[req.query.f] || require('./lib/render').FORMATS.square;
  const out = path.join(dir, 'preview_' + (req.query.f || 'square').replace(/[^\w]/g, '') + '.jpg');
  if (!fs.existsSync(out)) await run('ffmpeg', ['-y', '-loglevel', 'error', '-ss', '2', '-i', path.join(dir, p.presenterFile), '-frames:v', '1', '-vf', `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}`, '-q:v', '4', out]);
  res.sendFile(out);
}));
const stock = require('./lib/stock');
const niches = require('./lib/niches');
const fonts = require('./lib/fonts');
app.use('/fontfiles', express.static(fonts.CACHE));
app.get('/api/fonts', (req, res) => res.json(fonts.list()));
const { transcribe, whisperAvailable } = require('./lib/transcribe');
app.use('/niche', express.static(path.join(ROOT, 'data', 'niches')));
const withUrls = n => n.items.map(c => ({ ...c, thumb: c.thumbUrl || n.thumbsUrl + c.id + '.jpg', url: c.fileUrl || n.filesUrl + c.file }));
app.get('/api/niches', (req, res) => res.json(niches.list({ all: !!req.query.all })));
app.post('/api/niches', wrap((req, res) => { const id = niches.create(String(req.body.name || 'New niche').slice(0, 60), req.body.defaults || {}); res.json({ id }); }));
app.post('/api/niches/:id', wrap((req, res) => { niches.setDefaults(req.params.id.replace(/[^\w-]/g, ''), req.body.defaults || {}, req.body.name); res.json({ ok: true }); }));
app.get('/api/niches/:id/library', wrap((req, res) => res.json(withUrls(niches.get(req.params.id, { own: true })))));
const nicheUpload = multer({ storage: multer.diskStorage({
  destination: (req, f, cb) => { const n = niches.get(req.params.id); fs.mkdirSync(n.files, { recursive: true }); cb(null, n.files); },
  filename: (req, f, cb) => cb(null, Date.now().toString(36) + '_' + f.originalname.replace(/[^\w.-]/g, '_'))
}) });
app.post('/api/niches/:id/upload', nicheUpload.array('files', 300), wrap((req, res) => {
  const tags = String(req.body.tags || '').split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
  const dupes = require('./lib/dupes'), nid = niches.get(req.params.id, { own: true }).id, ids = [], skipped = [];
  for (const f of (req.files || [])) {
    let d = null; try { d = req.body.allowDupes ? null : dupes.checkFile(nid, path.join(niches.get(nid, { own: true }).files, f.filename)); } catch (e) { console.error('duplicate check skipped:', e.message); }
    if (d) { try { fs.unlinkSync(path.join(niches.get(nid, { own: true }).files, f.filename)); } catch {} skipped.push({ name: f.originalname, of: d.of }); continue; }
    ids.push(niches.addClip(nid, f.filename, tags, f.originalname));
  }
  res.json({ added: ids.length, skipped });
}));
app.post('/api/niches/:id/clip/:cid', wrap((req, res) => res.json({ ok: niches.updateClip(req.params.id, req.params.cid, req.body || {}) })));
app.get('/api/settings', wrap(async (req, res) => { const s = settings(); res.json({ spentToday: require('./lib/spend').today(), rateElevenPer1k: s.rateElevenPer1k !== undefined ? +s.rateElevenPer1k : 0.3, rateHeygenPerMin: +s.rateHeygenPerMin || 0, autofillOn: !!s.autofillOn, autofillPerDay: +s.autofillPerDay || 5, autoApproveDays: +s.autoApproveDays || 0, dailyBudgetUsd: +s.dailyBudgetUsd || 0, asanaWatch: s.asanaWatch !== false, asanaBuyers: s.asanaBuyers || '', asanaTeam: s.asanaTeam || '', publicUrl: s.publicUrl || '', multiSpeaker: !!s.multiSpeaker, dreamfaceInbox: s.dreamfaceInbox || '', eleven: !!s.elevenKey, heygen: !!s.heygenKey, xai: !!s.xaiKey, asana: !!s.asanaToken, google: !!s.googleKey, openai: !!s.openaiKey, pexels: !!s.pexelsKey, pixabay: !!s.pixabayKey, upscaler: require('./lib/enhance').available(), whisper: whisperAvailable(), semantic: await embed.available() }); }));
app.get('/api/stock/search', wrap(async (req, res) => {
  try { res.json(await stock.search(String(req.query.q || ''), settings(), req.query.portrait === '1')); }
  catch (e) { res.status(400).json({ error: e.message }); }
}));
async function useStock(p, i, item) {
  const file = await stock.download(item, path.join(pdir(p.id), 'stock'));
  const sdur = await probe(path.join(pdir(p.id), 'stock', file));
  Object.assign(p.cuts[i], { clip: 'stock', file, sdur: +sdur.toFixed(2), page: item.page, src: item.source });
}
app.post('/api/projects/:id/stock/use', wrap(async (req, res) => {
  const p = load(req.params.id); await useStock(p, +req.body.i, req.body.item); save(p); res.json(p.cuts[+req.body.i]);
}));
app.post('/api/projects/:id/autostock', wrap(async (req, res) => {
  const p = load(req.params.id), vert = p.format && p.format.startsWith('vertical'); let n = 0;
  for (let i = 0; i < p.cuts.length; i++) {
    const c = p.cuts[i]; if (c.clip !== 'card' || !c.card) continue;
    try {
      const r = await stock.search(c.card.toLowerCase(), settings(), vert);
      const pick = r.find(x => x.dur >= (c.end - c.start)) || r[0];
      if (pick) { await useStock(p, i, pick); n++; }
    } catch (e) { return res.status(400).json({ error: e.message, replaced: n }); }
  }
  save(p); res.json({ replaced: n, cuts: p.cuts });
}));
// ---- Flow intake: prompts for moments without a clip, drop-in of generated clips, inbox folder ----
app.get('/api/projects/:id/flow/prompts', wrap((req, res) => {
  const p = load(req.params.id), n = nicheOf(p);
  res.json({ niche: n.id, style: (n.defaults || {}).promptStyle || flowprompt.DEFAULT_STYLE, inbox: inbox.inboxDir(n), items: flowprompt.build(p, n) });
}));
const flowUpload = multer({ storage: multer.diskStorage({
  destination: (req, f, cb) => { const n = niches.get(load(req.params.id).niche); fs.mkdirSync(n.files, { recursive: true }); cb(null, n.files); },
  filename: (req, f, cb) => cb(null, Date.now().toString(36) + '_' + f.originalname.replace(/[^\w.-]/g, '_'))
}) });
app.post('/api/projects/:id/flow/attach', flowUpload.single('file'), wrap((req, res) => {
  const p = load(req.params.id), i = +req.body.i, n = nicheOf(p);
  if (!req.file || !p.cuts || !p.cuts[i]) return res.status(400).json({ error: 'No file or unknown insert.' });
  const c = p.cuts[i];
  const tags = String(req.body.tags || '').split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
  const cid = niches.addClip(n.id, req.file.filename, ['flow', 'generated', ...tags], req.file.originalname);
  niches.updateClip(n.id, cid, { desc: c.text || c.card || '' });
  Object.assign(c, { clip: cid, sim: 1 }); delete c.card; delete c.file; delete c.src; delete c.page;
  p.updated = Date.now(); save(p);
  res.json({ cut: c, clip: cid });
}));
app.post('/api/niches/:id/scan', wrap((req, res) => res.json({ added: inbox.scan(req.params.id.replace(/[^\w-]/g, '')) })));
app.get('/api/niches/:id/inbox', wrap((req, res) => { const n = niches.get(req.params.id); res.json({ dir: inbox.inboxDir(n) }); }));
// ---- subtitles as editable cues / SRT ----
const cuesOf = p => (p.subs && p.subs.length) ? p.subs : (p.words ? require('./lib/ass').autoCues(p.words.map(w => ({ w: w.w, start: w.start, end: w.end })), { style: p.subStyle, capLines: p.capLines }) : []);
app.get('/api/projects/:id/subtitles', wrap((req, res) => { const p = load(req.params.id); res.json({ custom: !!(p.subs && p.subs.length), cues: cuesOf(p) }); }));
app.get('/api/projects/:id/subtitles.srt', wrap((req, res) => {
  const p = load(req.params.id);
  res.set({ 'Content-Type': 'application/x-subrip; charset=utf-8', 'Content-Disposition': 'attachment; filename="' + String(p.name || 'subtitles').replace(/[^A-Za-z0-9._-]+/g, '_') + '.srt"' });
  res.send('﻿' + srt.toSrt(cuesOf(p)));
}));
app.post('/api/projects/:id/subtitles', wrap((req, res) => {
  const p = load(req.params.id), b = req.body || {};
  if (b.reset) delete p.subs;
  else {
    const cues = Array.isArray(b.cues) ? b.cues.map(c => ({ start: +c.start, end: +c.end, text: String(c.text || '').trim() })) : srt.parseSrt(String(b.srt || ''));
    const ok = cues.filter(c => isFinite(c.start) && isFinite(c.end) && c.end > c.start && c.text).sort((x, y) => x.start - y.start);
    if (!ok.length) return res.status(400).json({ error: 'No valid subtitle cues found.' });
    p.subs = ok;
  }
  p.updated = Date.now(); save(p);
  res.json({ custom: !!p.subs, cues: cuesOf(p) });
}));
// ---- quality checks ----
app.post('/api/projects/:id/qc/pre', wrap((req, res) => {
  const p = load(req.params.id); p.qcPre = qc.pre(p, nicheOf(p), p.duration); save(p); res.json(p.qcPre);
}));
app.get('/api/projects/:id/qc', wrap((req, res) => { const p = load(req.params.id); res.json({ pre: p.qcPre || null, post: p.qcPost || null }); }));
app.post('/api/projects/:id/qc/post', wrap((req, res) => {
  const p = load(req.params.id), rep = qc.post(pdir(p.id), p); p.qcPost = rep; save(p);
  fs.writeFileSync(path.join(pdir(p.id), 'qc_report.json'), JSON.stringify(rep, null, 1)); res.json(rep);
}));
// ---- timeline: waveform + exact fragment preview ----
app.get('/api/projects/:id/waveform', wrap(async (req, res) => {
  const p = load(req.params.id), dir = pdir(p.id), src = p.voiceFile || p.presenterFile;
  if (!src) return res.json({ rate: 20, peaks: [] });
  const cache = path.join(dir, 'waveform.json');
  if (fs.existsSync(cache) && fs.statSync(cache).mtimeMs > fs.statSync(path.join(dir, src)).mtimeMs) return res.sendFile(cache);
  const buf = await new Promise((ok, no) => { const ch = []; const c = require('child_process').spawn('ffmpeg', ['-v', 'error', '-i', path.join(dir, src), '-vn', '-ac', '1', '-ar', '8000', '-f', 's16le', '-']);
    c.stdout.on('data', d => ch.push(d)); c.on('close', () => ok(Buffer.concat(ch))); c.on('error', no); });
  const n = Math.floor(buf.length / 2), step = 400, peaks = [];   // 8000 Hz / 400 = 20 peaks per second
  for (let i = 0; i < n; i += step) { let m = 0; for (let k = i; k < Math.min(n, i + step); k++) m = Math.max(m, Math.abs(buf.readInt16LE(k * 2))); peaks.push(+(m / 32768).toFixed(3)); }
  const out = { rate: 20, peaks }; fs.writeFileSync(cache, JSON.stringify(out)); res.json(out);
}));
app.post('/api/projects/:id/preview', wrap(async (req, res) => {
  const p = load(req.params.id), dir = pdir(p.id);
  if (!p.words) return res.status(400).json({ error: 'Run the analysis first.' });
  // without a time: six seconds of speech from a sentence about a third into the video
  let from = req.body.from != null ? Math.max(0, +req.body.from || 0) : null;
  if (from == null) { const ss = p.sentences || [], s = ss[Math.min(ss.length - 1, Math.floor(ss.length / 3))]; from = s ? Math.max(0, s.start - 0.2) : 0; }
  const to = Math.max(from + 0.5, +req.body.to || from + 6);
  const clean = { ...p, ...(req.body.cuts ? { cuts: req.body.cuts } : {}), range: { from, to: Math.min(to, from + 30), w: +req.body.w || 360 } };
  await enqueue(() => render(dir, clean, () => {}));
  res.json({ url: '/files/' + p.id + '/preview.mp4?v=' + Date.now(), from, to });
}));
// ---- speakers (local, reusable) ----
app.get('/api/speakers', (req, res) => res.json(speakers.list()));
app.post('/api/speakers', wrap((req, res) => res.json(speakers.upsert(req.body || {}))));
app.post('/api/speakers/:id/delete', wrap((req, res) => res.json({ ok: speakers.remove(req.params.id.replace(/[^\w-]/g, '')) })));
const spUpload = multer({ storage: multer.diskStorage({ destination: (req, f, cb) => cb(null, speakers.FILES),
  filename: (req, f, cb) => cb(null, req.params.id.replace(/[^\w-]/g, '') + '_' + Date.now().toString(36) + path.extname(f.originalname || '.mp4').toLowerCase()) }) });
app.post('/api/speakers/:id/video', spUpload.single('video'), wrap((req, res) => { const s = req.file && speakers.setVideo(req.params.id.replace(/[^\w-]/g, ''), req.file.filename); res.json(s || { error: 'No file or unknown speaker.' }); }));
app.get('/speaker-files/:f', (req, res) => res.sendFile(path.join(speakers.FILES, path.basename(req.params.f))));

// ---- per-segment recordings ----
const segList = p => require('./lib/script').parseBlocks(p.script || '');
const segPayload = p => {
  const ex = require('./lib/script').parseBlocksEx(p.script || ''), labels = [...new Set(ex.map(b => b.label).filter(Boolean))];
  return { mode: p.segMode || 'single', times: p.segTimes || null, problems: segments.segmentProblems(p, ex.length),
    labels: labels.map(l => ({ label: l, speakerId: ((p.speakerMap || {})[l]) || (speakers.list().find(s => String(s.name || '').toLowerCase().replace(/\s+/g, ' ').trim() === l) || {}).id || '' })),
    blocks: ex.map((b, i) => { const sp = segments.speakerOf(p, i, ex); return { i, text: b.text, label: b.label, effectiveSpeakerId: sp ? sp.id : '', ...((p.seg || [])[i] || {}) }; }) };
};
app.post('/api/projects/:id/speakers-from-labels', wrap((req, res) => {
  const p = load(req.params.id), ex = require('./lib/script').parseBlocksEx(p.script || ''), labels = [...new Set(ex.map(b => b.label).filter(Boolean))];
  if (!labels.length) return res.status(400).json({ error: 'The script has no speaker names.' });
  const norm = s => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
  p.speakerMap = { ...(p.speakerMap || {}) };
  for (const l of labels) {
    if (p.speakerMap[l] && speakers.get(p.speakerMap[l])) continue;
    let sp = speakers.list().find(s => norm(s.name) === l);
    if (!sp) sp = speakers.upsert({ name: l.charAt(0).toUpperCase() + l.slice(1) });
    p.speakerMap[l] = sp.id;
  }
  p.updated = Date.now(); save(p); res.json(segPayload(p));
}));
app.post('/api/projects/:id/speaker-map', wrap((req, res) => {
  const p = load(req.params.id), label = String(req.body.label || '').toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 40); if (!label) return res.status(400).json({ error: 'No label.' });
  p.speakerMap = { ...(p.speakerMap || {}) }; if (req.body.speakerId) p.speakerMap[label] = String(req.body.speakerId); else delete p.speakerMap[label];
  p.updated = Date.now(); save(p); res.json(segPayload(p));
}));
app.get('/api/projects/:id/segments', wrap((req, res) => res.json(segPayload(load(req.params.id)))));
app.post('/api/projects/:id/segments/:i', wrap((req, res) => {
  const p = load(req.params.id), i = +req.params.i; p.seg = p.seg || []; const o = p.seg[i] = p.seg[i] || {}, b = req.body || {};
  if (b.speakerId !== undefined) o.speakerId = String(b.speakerId);
  if (b.tagOn !== undefined) o.tagOn = !!b.tagOn;
  if (b.tagText !== undefined) o.tagText = String(b.tagText).slice(0, 60);
  if (b.clear) { for (const k of b.clear) { if (['videoFile', 'voiceFile'].includes(k)) delete o[k]; } }
  p.updated = Date.now(); save(p); res.json(segPayload(p));
}));
const segUpload = multer({ storage: multer.diskStorage({ destination: (req, f, cb) => cb(null, pdir(req.params.id)),
  filename: (req, f, cb) => cb(null, 'seg' + (+req.params.i) + '_' + f.fieldname + path.extname(f.originalname || '.bin').toLowerCase()) }) });
app.post('/api/projects/:id/segments/:i/media', segUpload.fields([{ name: 'video', maxCount: 1 }, { name: 'voice', maxCount: 1 }]), wrap((req, res) => {
  const p = load(req.params.id), i = +req.params.i; p.seg = p.seg || []; const o = p.seg[i] = p.seg[i] || {}, f = req.files || {};
  if (f.video) o.videoFile = f.video[0].filename;
  if (f.voice) o.voiceFile = f.voice[0].filename;
  p.updated = Date.now(); save(p); res.json(segPayload(p));
}));
app.post('/api/projects/:id/segments-assemble', wrap(async (req, res) => {
  const p = load(req.params.id), bl = segList(p);
  if (!bl.length) return res.status(400).json({ error: 'The script has no segments.' });
  const prob = segments.segmentProblems(p, bl.length);
  if (prob.length) return res.status(400).json({ error: prob.join(' ') });
  set(p, { status: 'assembling', error: null });
  try {
    const r = await enqueueJob('assemble', p.id, () => segments.assemble(pdir(p.id), p, bl.length));
    const q = load(p.id);
    Object.assign(q, { segMode: 'segments', segTimes: r.segTimes, presenterFile: r.presenterFile, voiceFile: r.voiceFile, status: 'media', error: null, duration: r.duration, updated: Date.now() });
    delete q.words; delete q.cuts; delete q.qcPre; delete q.qcPost; delete q.subs;
    try { fs.unlinkSync(path.join(pdir(p.id), 'waveform.json')); } catch {}
    for (const f of fs.readdirSync(pdir(p.id))) if (/^preview_.*\.jpg$/.test(f)) { try { fs.unlinkSync(path.join(pdir(p.id), f)); } catch {} }
    save(q); res.json(segPayload(q));
  } catch (e) { set(load(p.id), { status: 'error', error: e.message }); res.status(400).json({ error: e.message }); }
}));
// ---- tasks and creatives ----
const allProjects = () => fs.readdirSync(PROJ).filter(d => fs.existsSync(path.join(PROJ, d, 'project.json'))).map(d => load(d));
const creativesOf = tid => allProjects().filter(p => p.taskId === tid).sort((a, b) => (a.creativeNo || 0) - (b.creativeNo || 0) || a.created - b.created);
const nextNo = tid => Math.max(0, ...creativesOf(tid).map(c => c.creativeNo || 0)) + 1;
const brief = p => ({ id: p.id, name: p.name, creativeNo: p.creativeNo || null, variantOf: p.variantOf || null, format: p.format, status: p.status, updated: p.updated, hasVideo: !!p.outFile, workFolder: p.workFolder || null, progress: p.progress || 0, auto: !!p.autoRun, exportNow: p.exportNow || null, exports: p.exports || [], life: require('./lib/lifecycle').state(p), lifeDaysLeft: require('./lib/lifecycle').daysLeft(p, +settings().autoApproveDays || 0), ...taskslib.summarize(p) });
function taskView(t) {
  const cs = creativesOf(t.id).map(brief), by = {};
  cs.forEach(c => { by[c.state] = (by[c.state] || 0) + 1; });
  return { task: t, creatives: cs, summary: { total: cs.length, byState: by, finished: by.done || 0,
    attention: cs.filter(c => c.attention.length).map(c => ({ id: c.id, name: c.name, items: c.attention })),
    next: cs.filter(c => c.state !== 'done').map(c => ({ id: c.id, name: c.name, next: c.next })) } };
}
app.get('/api/tasks', wrap((req, res) => res.json(taskslib.list().map(t => { const v = taskView(t); return { ...t, count: v.summary.total, finished: v.summary.finished, problems: v.summary.attention.length }; }).sort((a, b) => b.updated - a.updated))));
app.post('/api/tasks', wrap((req, res) => res.json(taskslib.upsert(req.body || {}))));
app.get('/api/tasks/:id', wrap((req, res) => { const t = taskslib.get(req.params.id); if (!t) return res.status(404).json({ error: 'Unknown task.' }); res.json(taskView(t)); }));
app.post('/api/tasks/:id/delete', wrap((req, res) => { creativesOf(req.params.id).forEach(p => { delete p.taskId; delete p.creativeNo; save(p); }); res.json({ ok: taskslib.remove(req.params.id) }); }));
// Candidate creatives from every source of the task: description, Google Docs, comments, Asana subtasks.
app.post('/api/tasks/:id/split', wrap((req, res) => {
  const t = taskslib.get(req.params.id) || {};
  if (req.body.text) return res.json({ items: taskslib.splitCreatives(req.body.text).map(x => ({ ...x, from: 'text', use: true })) });
  const sources = [{ label: 'Description', text: t.description, doc: false }, ...(t.docs || []).filter(d => d.status === 'ok' && d.text).map(d => ({ label: d.title, text: d.text, doc: true })), { label: 'Comments', text: t.comments, doc: false }].filter(x => x.text && x.text.trim());
  let items = [];
  for (const sx of sources) {
    const part = taskslib.splitCreatives(sx.text);
    part.forEach(p => items.push({ ...p, name: part.length === 1 && /^Creative \d+$/.test(p.name) && sx.doc ? sx.label : p.name, from: sx.label, use: sx.doc || part.length > 1 }));
  }
  if (!items.some(x => x.use) && t.asana && (t.asana.subtasks || []).length) {
    const sub = t.asana.subtasks.filter(x => x.notes);
    items = sub.map(x => ({ name: x.name, script: x.notes, blocks: 1, words: x.notes.split(/\s+/).length, from: 'Asana subtask', use: true })).concat(items);
  }
  res.json({ items });
}));
// ---- Asana import + Google Docs ----
async function resolveDocs(t, extra) {
  const urls = [...new Set([...(t.links || []), ...asana.urlsIn(t.description), ...asana.urlsIn(t.comments), ...(extra ? [extra] : [])])];
  return gdocs.resolve(urls, settings().googleKey);
}
app.post('/api/asana/import', wrap(async (req, res) => {
  const st = settings();
  if (!st.asanaToken) return res.status(400).json({ error: 'Asana token not set (Settings).' });
  const gid = asana.parseRef(req.body.ref);
  if (!gid) return res.status(400).json({ error: 'Paste an Asana task link or its numeric ID.' });
  let a; try { a = await asana.fetchTask(st.asanaToken, gid); } catch (e) { return res.status(400).json({ error: e.message }); }
  const existing = taskslib.list().find(t => t.sourceRef === gid);
  const comments = a.comments.map(c => (c.by ? c.by + ': ' : '') + c.text).join('\n\n');
  const t = taskslib.upsert({ id: existing && existing.id, title: a.name, description: a.notes, comments, links: a.links, source: 'asana', sourceRef: gid });
  taskslib.patch(t.id, { asana: { gid, url: a.url, assignee: a.assignee, due: a.due, project: a.project, subtasks: a.subtasks, attachments: a.attachments, importedAt: Date.now() } });
  taskslib.patch(t.id, { docs: await resolveDocs(taskslib.get(t.id)) });
  res.json({ id: t.id, updated: !!existing, view: taskView(taskslib.get(t.id)) });
}));
app.post('/api/tasks/:id/docs', wrap(async (req, res) => {
  let t = taskslib.get(req.params.id); if (!t) return res.status(404).json({ error: 'Unknown task.' });
  const add = String(req.body.add || '').trim();
  if (add) t = taskslib.upsert({ id: t.id, links: [...(t.links || []), add] });
  taskslib.patch(t.id, { docs: await resolveDocs(taskslib.get(t.id)) });
  res.json(taskView(taskslib.get(t.id)));
}));
function newProject(name, script, t) {
  const id = Date.now().toString(36) + crypto.randomBytes(2).toString('hex');
  fs.mkdirSync(pdir(id), { recursive: true });
  const p = { id, name: String(name || 'New creative').slice(0, 100), script: script || '', format: (t && t.format) || 'square', status: 'draft', created: Date.now(), updated: Date.now(), feedback: [] };
  if (t) {
    p.taskId = t.id; p.creativeNo = nextNo(t.id);
    if (t.niche) { p.niche = t.niche; presets.apply(p, presets.ofNiche(niches.get(t.niche)), { keep: t.format ? ['format'] : [] }); }
    if (Array.isArray(t.exports)) p.exports = t.exports.slice();
  }
  save(p); return p;
}
app.post('/api/tasks/:id/creatives', wrap((req, res) => {
  const t = taskslib.get(req.params.id); if (!t) return res.status(404).json({ error: 'Unknown task.' });
  const items = (req.body.items || []).filter(x => x && String(x.script || '').trim());
  if (!items.length) return res.status(400).json({ error: 'No creatives to add.' });
  res.json({ created: items.map(it => newProject(it.name, it.script, t).id) });
}));
function duplicateProject(srcId, name) {
  const src = load(srcId), id = Date.now().toString(36) + crypto.randomBytes(2).toString('hex');
  const sibs = src.taskId ? creativesOf(src.taskId) : [];   // count before the copy exists
  workfolder.duplicateDir(pdir(src.id), pdir(id));
  const p = JSON.parse(fs.readFileSync(path.join(pdir(id), 'project.json'), 'utf8'));
  Object.assign(p, { id, name: String(name || src.name + ' (variant)').slice(0, 100), variantOf: src.variantOf || src.id, created: Date.now(), updated: Date.now(), feedback: [] });
  if (src.taskId) p.creativeNo = Math.max(0, ...sibs.map(c => c.creativeNo || 0)) + 1; else delete p.creativeNo;
  for (const k of ['outFile', 'rendered', 'qcPost', 'workFolder', 'extraOuts', 'autoRun']) delete p[k];
  if (['done', 'error', 'analyzing', 'rendering', 'queued', 'assembling'].includes(p.status)) p.status = p.words ? 'planned' : (p.presenterFile || p.voiceFile ? 'media' : 'draft');
  save(p); return p;
}
app.post('/api/projects/:id/duplicate', wrap((req, res) => res.json(brief(duplicateProject(req.params.id, req.body.name)))));
app.post('/api/projects/:id/workfolder', wrap((req, res) => {
  const p = load(req.params.id), t = p.taskId ? taskslib.get(p.taskId) : null, n = nicheOf(p);
  const srtText = (p.words || p.subs) ? srt.toSrt(cuesOf(p)) : '';
  const r = workfolder.build(p, t, n, srtText, pdir(p.id), p.creativeNo);
  p.workFolder = r.dir; save(p); res.json(r);
}));
app.post('/api/projects/:id/open-video', wrap((req, res) => {
  const p = load(req.params.id), f = String(req.body.file || p.outFile || ''), known = [p.outFile, ...Object.values(p.extraOuts || {}).map(o => o.file)].filter(Boolean);
  if (!known.includes(f)) return res.status(400).json({ error: 'Render the video first.' });
  const t = path.join(pdir(p.id), f); if (!fs.existsSync(t)) return res.status(400).json({ error: 'The video file is missing: render again.' });
  require('child_process').spawn('cmd.exe', ['/c', 'start', '', t], { detached: true, stdio: 'ignore', windowsHide: true }).unref(); res.json({ ok: true });
}));
app.post('/api/open', wrap((req, res) => {
  const t = path.resolve(String(req.body.path || '')), ok = [workfolder.EXPORTS, PROJ].some(r => t.toLowerCase().startsWith(path.resolve(r).toLowerCase()));
  if (!ok || !fs.existsSync(t)) return res.status(400).json({ error: 'Folder not found.' });
  require('child_process').spawn('explorer.exe', [t], { detached: true, stdio: 'ignore' }).unref(); res.json({ ok: true });
}));
app.post('/api/tasks/:id/batch', wrap(async (req, res) => {
  const act = req.body.action === 'render' ? 'render' : 'analyze', force = !!req.body.force, out = { started: [], skipped: [] };
  for (const p of creativesOf(req.params.id)) {
    const sm = taskslib.summarize(p), nm = p.name;
    if (['analyzing', 'rendering', 'queued', 'assembling'].includes(p.status)) { out.skipped.push({ name: nm, why: 'already working' }); continue; }
    if (act === 'analyze') {
      if (!sm.done.script || !sm.done.media) { out.skipped.push({ name: nm, why: 'needs script and voice/video' }); continue; }
      if (sm.done.analysis && !force) { out.skipped.push({ name: nm, why: 'already analyzed' }); continue; }
    } else {
      if (!sm.done.analysis) { out.skipped.push({ name: nm, why: 'run the analysis first' }); continue; }
      if (sm.done.render && !force) { out.skipped.push({ name: nm, why: 'already rendered' }); continue; }
    }
    const r = await (await fetch('http://127.0.0.1:' + (process.env.PORT || 4317) + '/api/projects/' + p.id + '/' + act, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ format: p.format }) })).json();
    if (r.error) out.skipped.push({ name: nm, why: r.error }); else out.started.push(nm);
  }
  res.json(out);
}));
// ---- recovery of interrupted jobs ----
const selfUrl = () => 'http://127.0.0.1:' + (process.env.PORT || 4317);
async function resumeJob(j) {
  const p = load(j.projectId), post = (u, b) => fetch(selfUrl() + u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b || {}) }).then(r => r.json());
  const r = j.kind === 'render' ? await post('/api/projects/' + p.id + '/render', { format: p.format }) : j.kind === 'assemble' ? await post('/api/projects/' + p.id + '/segments-assemble') : await post('/api/projects/' + p.id + '/analyze');
  return r;
}
app.get('/api/recovery', wrap((req, res) => res.json({ items: recovery.list().filter(j => { try { load(j.projectId); return true; } catch { return false; } }) })));
app.post('/api/recovery/:id/resume', wrap(async (req, res) => { const j = recovery.remove(req.params.id); if (!j) return res.status(404).json({ error: 'Already handled.' }); const r = await resumeJob(j); res.json(r.error ? { error: r.error } : { ok: true }); }));
app.post('/api/recovery/:id/skip', wrap((req, res) => { recovery.remove(req.params.id); res.json({ ok: true }); }));
app.post('/api/recovery/resume-all', wrap(async (req, res) => { const out = { started: 0, failed: [] }; for (const j of recovery.list()) { recovery.remove(j.id); try { const r = await resumeJob(j); if (r.error) out.failed.push({ name: j.projectName, why: r.error }); else out.started++; } catch (e) { out.failed.push({ name: j.projectName, why: e.message }); } } res.json(out); }));
// ---- learning from decisions + ranked candidates ----
app.post('/api/projects/:id/feedback', wrap((req, res) => {
  const p = load(req.params.id), n = nicheOf(p), b = req.body || {}, inLib = id => n.items.some(x => x.id === id);
  const base = { text: b.text, project: p.id, start: b.start };
  if (b.kind === 'swap') { if (inLib(b.from)) feedback.record(n.id, { ...base, clip: b.from, kind: 'reject', src: 'swap' }); if (inLib(b.to)) feedback.record(n.id, { ...base, clip: b.to, kind: 'accept', src: 'swap' }); }
  else if (b.kind === 'delete') { if (inLib(b.from)) feedback.record(n.id, { ...base, clip: b.from, kind: 'reject', src: 'delete' }); }
  else if (b.kind === 'rate') { if (inLib(b.clip)) feedback.record(n.id, { ...base, clip: b.clip, kind: b.rating === 'up' ? 'accept' : 'reject', src: 'rate' }); }
  res.json(feedback.stats(n.id));
}));
app.post('/api/projects/:id/candidates', wrap(async (req, res) => {
  const p = load(req.params.id), n = nicheOf(p), c = (p.cuts || [])[+req.body.i];
  if (!c) return res.status(400).json({ error: 'Unknown insert.' });
  const text = String(c.text || c.card || ''), words = text.split(/\s+/).map(normWord).filter(Boolean);
  let sem = null;
  if (p.matching !== 'keywords' && n.items.length && await embed.available()) { try { sem = await embed.context(n.id, n.items); await sem.ensure([text, ...feedback.list(n.id).map(e => e.text)]); } catch { sem = null; } }
  const st = feedback.stats(n.id), ranked = rank(text, words, n.items, { sem, fb: feedback.build(n.id, sem) });
  res.json({ text, current: c.clip, semantic: !!sem, items: ranked.slice(0, 90).map(r => ({ id: r.clip.id, thumb: n.thumbsUrl + r.clip.id + '.jpg', tags: r.clip.tags.slice(0, 4), watermark: !!r.clip.watermark, score: +r.s.toFixed(2), sim: r.sim ? +r.sim.toFixed(2) : null, fb: +r.fb.toFixed(1), up: (st.perClip[r.clip.id] || {}).up || 0, down: (st.perClip[r.clip.id] || {}).down || 0 })) });
}));
app.get('/api/niches/:id/learning', wrap((req, res) => res.json(feedback.stats(niches.get(req.params.id).id))));
app.post('/api/niches/:id/learning/reset', wrap((req, res) => { feedback.reset(niches.get(req.params.id).id); res.json({ ok: true }); }));
app.get('/api/library', (req, res) => { let libs; if (req.query.project) { try { libs = load(String(req.query.project)).libs; } catch {} } res.json(withUrls(niches.get(req.query.niche, { libs }))); });

app.get('/api/projects', (req, res) => {
  const list = fs.readdirSync(PROJ).filter(d => fs.existsSync(path.join(PROJ, d, 'project.json'))).map(d => load(d))
    .map(p => ({ id: p.id, name: p.name, status: p.status, updated: p.updated, hasVideo: !!p.outFile, taskId: p.taskId || null, creativeNo: p.creativeNo || null,
      presenter: !!p.presenterFile, analyzed: !!(p.words && p.sentences), typo: p.typo && p.typo.status ? { status: p.typo.status, progress: p.typo.progress || 0, file: p.typo.file || null, rendered: p.typo.rendered || null } : null }));
  res.json(list.sort((a, b) => b.updated - a.updated));
});

app.post('/api/projects', wrap((req, res) => {
  const id = Date.now().toString(36) + crypto.randomBytes(2).toString('hex');
  fs.mkdirSync(pdir(id), { recursive: true });
  const p = { id, name: req.body.name || 'New project', script: req.body.script || '', format: 'square', status: 'draft', created: Date.now(), updated: Date.now(), feedback: [] };
  save(p); res.json(p);
}));

app.get('/api/projects/:id', wrap((req, res) => {
  const p = load(req.params.id);
  res.json({ ...p, lint: lint(p.script || ''), blocks: parseBlocks(p.script || '') });
}));

app.post('/api/projects/:id', wrap((req, res) => {
  const p = load(req.params.id);
  const { name, script, format, consent, taskId, segMode, niche, lang, font, matching, capX, capY, capScale, capLines, capPx, capReset, clips, lipsyncMode, cutsMode, subStyle, accent, transition, enhance, upscale, exports: exportList, emojiOn, emojiScale, emojiPos, emojis, band: bandIn, overlays: ovIn, fx: fxIn, transDur } = req.body;
  if (fxIn && typeof fxIn === 'object') p.fx = require('./lib/fx').mergeFx(p.fx || {}, fxIn);
  if (transDur !== undefined) p.transDur = Math.min(0.9, Math.max(0.15, +transDur || 0.35));
  if (ovIn && typeof ovIn === 'object') p.overlays = require('./lib/overlays').merge(p.overlays || {}, ovIn);
  if (bandIn && typeof bandIn === 'object') p.band = require('./lib/band').norm({ ...(p.band || {}), ...bandIn });
  if (emojiPos !== undefined) p.emojiPos = emojiPos === 'below' ? 'below' : 'above';
  if (emojiOn !== undefined) p.emojiOn = !!emojiOn;
  if (emojiScale !== undefined) p.emojiScale = Math.min(2, Math.max(0.5, +emojiScale || 1));
  if (Array.isArray(emojis)) p.emojis = emojis.map(m => ({ start: +m.start, end: +m.end, emoji: String(m.emoji || '').slice(0, 12) })).filter(m => m.emoji && m.end > m.start && m.start >= 0).slice(0, 80);
  if (exportList !== undefined) p.exports = (Array.isArray(exportList) ? exportList : []).map(String).filter(x => require('./lib/render').FORMATS[x]).slice(0, 8);
  if (['off', 'notify', 'cover'].includes(lipsyncMode)) p.lipsyncMode = lipsyncMode;
  if (['off', 'notify', 'cover'].includes(cutsMode)) p.cutsMode = cutsMode;
  if (req.body.autoHook !== undefined) p.autoHook = !!req.body.autoHook;
  if (req.body.libs !== undefined) p.libs = req.body.libs === 'all' ? 'all' : Array.isArray(req.body.libs) ? req.body.libs.map(x => String(x).replace(/[^\w-]/g, '')).slice(0, 40) : undefined;
  if (req.body.cardsOn !== undefined) p.cardsOn = !!req.body.cardsOn;
  if (enhance !== undefined) p.enhance = !!enhance;
  if (upscale !== undefined) p.upscale = !!upscale;
  if (subStyle) { p.subStyle = String(subStyle).replace(/[^\w-]/g, ''); const tb = (require('./lib/ass').TEMPLATES[p.subStyle] || {}).band; if (tb) p.band = require('./lib/band').norm({ ...tb, on: true }); }
  if (accent !== undefined) p.accent = /^#[0-9a-f]{6}$/i.test(accent) ? accent : null;
  if (transition && require('./lib/fx').valid(String(transition))) p.transition = String(transition);
  const cl = (v, a, b) => Math.min(b, Math.max(a, +v));
  if (capReset) { delete p.capX; delete p.capY; delete p.capScale; delete p.capPx; }
  if (capPx !== undefined) { if (capPx === null) delete p.capPx; else p.capPx = Math.round(Math.min(400, Math.max(10, +capPx))); }
  if (capLines !== undefined && capLines !== null) p.capLines = Math.min(4, Math.max(1, Math.round(+capLines) || 1));
  if (capX !== undefined && capX !== null) p.capX = cl(capX, 0, 1);
  if (capY !== undefined && capY !== null) p.capY = cl(capY, 0, 1);
  if (capScale !== undefined && capScale !== null) p.capScale = cl(capScale, 0.5, 1.8);
  if (taskId !== undefined) { if (taskId && taskslib.get(taskId)) { if (p.taskId !== taskId) { p.taskId = taskId; p.creativeNo = nextNo(taskId); } } else { delete p.taskId; delete p.creativeNo; } }
  if (segMode !== undefined) p.segMode = segMode === 'segments' ? 'segments' : 'single';
  if (matching !== undefined) p.matching = matching === 'keywords' ? 'keywords' : 'semantic';
  if (font !== undefined) p.font = fonts.has(font) ? font : '';
  if (lang !== undefined) p.lang = /^[a-z][a-z]$/.test(lang) ? lang : '';
  if (clips !== undefined) p.clips = !!clips;
  if (niche && niche !== p.niche) { p.niche = String(niche).replace(/[^\w-]/g, ''); p.audio = { ...(p.audio || { sfx: [], musicVol: 0.18 }), music: null }; presets.apply(p, presets.ofNiche(nicheOf(p)), { keep: ['format'] }); }
  if (name !== undefined) p.name = name;
  if (script !== undefined) p.script = script;
  // a script of several speakers written in the Simple mode switches the creative to "different speakers" by itself
  if (script !== undefined && req.body.auto === 'segments' && p.segMode !== 'segments' && require('./lib/script').parseBlocksEx(p.script || '').some(b => b.label)) p.segMode = 'segments';
  if (format) p.format = format;
  if (consent) p.consent = { speaker: String(consent.speaker || ''), confirmed: !!consent.confirmed, at: Date.now() };
  p.updated = Date.now(); save(p);
  res.json({ ...p, lint: lint(p.script || ''), blocks: parseBlocks(p.script || '') });
}));

app.post('/api/projects/:id/media', upload.fields([{ name: 'presenter', maxCount: 1 }, { name: 'voice', maxCount: 1 }]), wrap(async (req, res) => {
  const p = load(req.params.id), dir = pdir(p.id);
  const f = req.files || {};
  if (f.presenter) p.presenterFile = f.presenter[0].filename;
  if (f.voice) {
    const src = f.voice[0].filename;
    await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', src, '-vn', '-ac', '1', '-ar', '44100', 'voice.wav'], { cwd: dir });
    p.voiceFile = 'voice.wav';
  }
  if (f.presenter && !f.voice) delete p.voiceFile;
  p.status = 'media'; p.updated = Date.now(); save(p); res.json(p);
}));

app.post('/api/projects/:id/settings', wrap((req, res) => {
  const s = settings(); for (const k of ['openaiKey', 'pexelsKey', 'pixabayKey', 'asanaToken', 'googleKey', 'elevenKey', 'heygenKey', 'xaiKey', 'dreamfaceInbox']) if (req.body[k]) s[k] = String(req.body[k]).trim();
  if (req.body.multiSpeaker !== undefined) s.multiSpeaker = !!req.body.multiSpeaker;
  if (req.body.autoApproveDays !== undefined) s.autoApproveDays = Math.min(60, Math.max(0, Math.round(+req.body.autoApproveDays || 0)));
  if (req.body.dailyBudgetUsd !== undefined) s.dailyBudgetUsd = Math.min(10000, Math.max(0, +req.body.dailyBudgetUsd || 0));
  if (req.body.asanaWatch !== undefined) s.asanaWatch = !!req.body.asanaWatch;
  if (req.body.autofillOn !== undefined) s.autofillOn = !!req.body.autofillOn;
  for (const k of ['rateElevenPer1k', 'rateHeygenPerMin']) if (req.body[k] !== undefined) s[k] = Math.min(1000, Math.max(0, +req.body[k] || 0));
  if (req.body.autofillPerDay !== undefined) s.autofillPerDay = Math.min(20, Math.max(1, Math.round(+req.body.autofillPerDay || 5)));
  for (const k of ['asanaBuyers', 'asanaTeam']) if (req.body[k] !== undefined) s[k] = String(req.body[k]).slice(0, 500);
  if (req.body.publicUrl !== undefined) s.publicUrl = /^https?:\/\/[^\s]+$/.test(String(req.body.publicUrl).trim()) ? String(req.body.publicUrl).trim().slice(0, 200) : '';
  fs.writeFileSync(SETTINGS, JSON.stringify(s)); res.json({ ok: true, multiSpeaker: !!s.multiSpeaker, openai: !!s.openaiKey, pexels: !!s.pexelsKey, pixabay: !!s.pixabayKey });
}));

app.post('/api/projects/:id/tts', wrap(async (req, res) => {
  const p = load(req.params.id), s = settings();
  if (!s.openaiKey) return res.status(400).json({ error: 'No OpenAI API key set (Settings).' });
  const text = parseBlocks(p.script).join(' ');
  const r = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST', headers: { Authorization: 'Bearer ' + s.openaiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-4o-mini-tts', voice: req.body.voice || 'onyx', input: text, response_format: 'mp3',
      instructions: 'Spreek in rustig, warm, natuurlijk Nederlands, als een vriendelijke adviseur. Niet overdreven verkopend.' })
  });
  if (!r.ok) return res.status(502).json({ error: 'TTS error: ' + (await r.text()).slice(0, 300) });
  const dir = pdir(p.id);
  fs.writeFileSync(path.join(dir, 'voice_in.mp3'), Buffer.from(await r.arrayBuffer()));
  await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', 'voice_in.mp3', '-ac', '1', '-ar', '44100', 'voice.wav'], { cwd: dir });
  p.voiceFile = 'voice.wav'; p.voiceSource = 'tts'; p.updated = Date.now(); save(p); res.json(p);
}));

// Analyze: transcribe -> align to script -> propose cuts
app.post('/api/projects/:id/analyze', wrap(async (req, res) => {
  const p = load(req.params.id), dir = pdir(p.id);
  if (p.segMode === 'segments') { const prob = segments.segmentProblems(p, segList(p).length); if (prob.length) return res.status(400).json({ error: prob.join(' ') }); }
  const src = p.voiceFile || p.presenterFile;
  if (!src) return res.status(400).json({ error: 'Upload a voice or video first.' });
  set(p, { status: 'analyzing', progress: 0.05, error: null });
  set(p, { status: 'queued' }); res.json({ ok: true });
  enqueueJob('analyze', p.id, async () => { try {
    set(p, { status: 'analyzing', progress: 0.05 });
    const wav = path.join(dir, 'ana.wav');
    await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', path.join(dir, src), '-vn', '-ac', '1', '-ar', '16000', wav]);
    set(p, { progress: 0.2 });
    const tw = await transcribe(wav, dir, p.lang || '', m => console.error(m));
    const blocks = parseBlocks(p.script);
    const al = align(blocks, tw);
    const total = await probe(path.join(dir, src));
    const libAll = nicheOf(p).items, lib = libAll.filter(c => !c.hookOnly);   // the shared hooks are used for the opening insert only
    // semantic matching (local embedding model); falls back to keywords if the model is not available
    let sem = null;
    if (p.matching !== 'keywords' && p.clips !== false && lib.length && await embed.available()) {
      try {
        sem = await embed.context(nicheOf(p).id, libAll);
        await sem.ensure([...buildUnits(al).map(u => u.text), ...buildSentences(al).map(s => s.text)]);
      } catch (e) { console.error('semantic matching skipped:', e.message); sem = null; }
    }
    const nid = nicheOf(p).id;
    if (sem) { try { await sem.ensure(feedback.list(nid).map(e => e.text)); } catch {} }
    const fb = feedback.build(nid, sem);
    // rhythm from a sample video (Inserts step): where the inserts go and how long they last
    let template = null, refHook = 0, refNoHook = false;
    p.referenceReport = null;
    let segTemplate = null;
    if (p.reference) {
      const ref = require('./lib/reference').get(p.reference);
      if (ref) {
        try {
          const sents = buildSentences(al).map(x => ({ start: x.start, end: x.end, text: x.text }));
          if (sem) await sem.ensure([...ref.sentences.map(x => x.text), ...sents.map(x => x.text)]);
          const R = require('./lib/reference'), wtext = sl => al.words.filter(w => w.end > sl.start && w.start < sl.end).map(w => w.w).join(' ');
          if (p.presenterFile) {
            const m = R.map(ref, sents, total, sem);
            template = m.slots; refHook = m.hookDur; refNoHook = !ref.hook;
            if (sem) await sem.ensure(template.map(wtext));
            p.referenceReport = { id: ref.id, name: ref.name, mode: 'inserts', slots: m.slots.length, hook: refHook, report: m.report.slice(0, 40) };
          } else {
            segTemplate = R.mapSegments(ref, al.words, total);
            if (sem) await sem.ensure(segTemplate.map(wtext));
            p.referenceReport = { id: ref.id, name: ref.name, mode: 'cuts', slots: segTemplate.length, report: segTemplate.slice(0, 40).map(x => ({ at: x.start, text: wtext(x).slice(0, 70) })) };
          }
        } catch (e) { console.error('reference skipped:', e.message); template = null; }
      }
    }
    const pl = plan(al, { presenter: !!p.presenterFile, total, clips: p.clips !== false, cards: p.cardsOn !== false, lib, sem, fb, template, segTemplate });
    // optional presenter-footage checks: lip-sync + jump cuts. Modes: off | notify | cover
    const lm = p.lipsyncMode || 'notify', cm = p.cutsMode || 'notify';
    let lip = null;
    const py = path.join(ROOT, '.venv', 'Scripts', 'python.exe');
    if (p.presenterFile && (lm !== 'off' || cm !== 'off')) {
      set(p, { progress: 0.7 });
      const found = [], toCover = []; let meanScore = null;
      let pyJumps = [];
      if ((lm !== 'off' || cm !== 'off') && fs.existsSync(py)) {
        try {
          await new Promise((ok, no) => require('child_process').execFile(py, [path.join(ROOT, 'tools', 'lipsync.py'), path.join(dir, p.presenterFile), path.join(dir, 'lipsync.json')], { timeout: 600000 }, e => e ? no(e) : ok()));
          const lj = JSON.parse(fs.readFileSync(path.join(dir, 'lipsync.json'), 'utf8'));
          meanScore = lj.meanScore; pyJumps = lj.jumps || [];
          if (lm !== 'off') { found.push(...lj.bad); if (lm === 'cover') toCover.push(...lj.bad); }
        } catch (e) { console.error('lipsync skipped:', e.message); }
      }
      if (cm !== 'off') {
        try {
          const jumps = await new Promise(ok => require('child_process').execFile('ffmpeg', ['-hide_banner', '-i', path.join(dir, p.presenterFile), '-vf', "select='gt(scene,0.12)',showinfo", '-vsync', 'vfr', '-f', 'null', '-'], { maxBuffer: 1e7 }, (e, so, se) => ok([...String(se).matchAll(/pts_time:([0-9.]+)/g)].map(m => +m[1]))));
          const jb = [...jumps, ...pyJumps].sort((a, b) => a - b).filter((t, i, a) => t > 0.5 && (i === 0 || t - a[i - 1] > 0.6)).map(t => ({ start: Math.max(0, t - 0.3), end: t + 0.9, reason: 'jump cut' }));
          found.push(...jb); if (cm === 'cover') toCover.push(...jb);
        } catch (e) { console.error('cut detection skipped:', e.message); }
      }
      found.sort((x, y) => x.start - y.start);
      lip = { meanScore, bad: found };
      if (toCover.length) pl.cuts = await coverBad(pl.cuts, toCover, al, { clips: p.clips !== false, cards: p.cardsOn !== false, lib, sem, fb });
    }
    if (p.autoHook !== false && !refNoHook) {              // opening insert (a sample without a hook gets none): keep the one chosen before, else pick the best clip for the first line
      try {
        const prev = (p.cuts || []).find(c => c.hook), tmp = { sentences: pl.sentences, cuts: pl.cuts, hookDur: refHook || undefined };
        if (sem) await sem.ensure([require('./lib/hook').text(tmp)]).catch(() => {});
        const id = prev && libAll.some(x => x.id === prev.clip) ? prev.clip : require('./lib/hook').pick(tmp, libAll, { sem, fb }, rank, normWord);
        if (id) { require('./lib/hook').set(tmp, id); pl.cuts = tmp.cuts; }
      } catch (e) { console.error('auto hook skipped:', e.message); }
    }
    set(p, { status: 'planned', progress: 1, semantic: !!sem, words: al.words.map(w => ({ w: w.w, start: +w.start.toFixed(2), end: +w.end.toFixed(2) })), sentences: pl.sentences, cuts: pl.cuts, zooms: pl.zooms, lipsync: lip, audio: { ...(p.audio || {}), music: (p.audio && p.audio.music) || null, musicVol: (p.audio && p.audio.musicVol) || 0.18, sfx: autoSfx({ cuts: pl.cuts, zooms: pl.zooms, transition: p.transition, audio: p.audio }, (p.audio && p.audio.sfxStyle) || 'standard') }, matchRatio: +al.matchRatio.toFixed(2), duration: +total.toFixed(2) });
    await autoNext(p.id, 'analyzed');
  } catch (e) { console.error(e); set(p, { status: 'error', error: e.message, autoRun: undefined }); tg.failed('analyze', p, e.message); } });
}));

// manual marks: cover any seconds the user flags as bad (e.g. "7.9-9.1, 12.8-13.8")
app.post('/api/projects/:id/cover', wrap(async (req, res) => {
  const p = load(req.params.id);
  if (!p.words) return res.status(400).json({ error: 'Run the analysis first.' });
  const marks = String(req.body.marks || '').split(',').map(t => t.trim().match(/^([0-9.]+)s*[-–]s*([0-9.]+)$/)).filter(Boolean)
    .map(m => ({ start: +m[1], end: +m[2], reason: 'marked by you' })).filter(b => b.end > b.start);
  if (!marks.length) return res.status(400).json({ error: 'Use the format 7.9-9.1, 12.8-13.8' });
  const aligned = { words: p.words.map(w => ({ ...w, n: require('./lib/script').norm(w.w) })) };
  const lib2 = nicheOf(p).items.filter(c => !c.hookOnly);
  let sem2 = null; try { if (p.matching !== 'keywords' && lib2.length && await embed.available()) sem2 = await embed.context(nicheOf(p).id, lib2); } catch {}
  p.cuts = await coverBad(p.cuts || [], marks, aligned, { clips: p.clips !== false, cards: p.cardsOn !== false, lib: lib2, sem: sem2, fb: feedback.build(nicheOf(p).id, sem2) });
  p.lipsync = { ...(p.lipsync || { meanScore: null, bad: [] }), bad: [...((p.lipsync || {}).bad || []), ...marks].sort((a, b) => a.start - b.start) };
  p.updated = Date.now(); save(p); res.json({ cuts: p.cuts, lipsync: p.lipsync });
}));
// ---- sample videos from your own archive: their rhythm is applied to a new script ----
const refLib = require('./lib/reference'), REFJOBS = new Map();
const refUpload = multer({ storage: multer.diskStorage({ destination: (req, f, cb) => { const d = path.join(ROOT, 'data', 'references', '_up'); fs.mkdirSync(d, { recursive: true }); cb(null, d); }, filename: (req, f, cb) => cb(null, Date.now().toString(36) + path.extname(f.originalname || '.bin').toLowerCase().replace(/[^.a-z0-9]/g, '')) }), limits: { fileSize: 3 * 1024 * 1024 * 1024 } });
app.get('/api/references', wrap((req, res) => res.json({ items: refLib.list(), jobs: [...REFJOBS.values()].filter(j => j.status !== 'done') })));
app.post('/api/references', refUpload.single('file'), wrap((req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Choose a video or audio file.' });
  const job = { id: 'j' + Date.now().toString(36), name: String(req.body.name || req.file.originalname).slice(0, 80), status: 'queued', pct: 0 }; REFJOBS.set(job.id, job);
  const lang = /^[a-z]{2}$/.test(req.body.lang || '') ? req.body.lang : '';
  res.json({ job: job.id });
  enqueue(async () => {
    job.status = 'working';
    try { const r = await refLib.analyze({ file: req.file.path, name: job.name, lang, log: m => console.error(m), progress: v => { job.pct = v; } }); job.status = 'done'; job.refId = r.id; }
    catch (e) { console.error('reference:', e.message); job.status = 'error'; job.error = String(e.message).slice(0, 200); }
    finally { try { fs.unlinkSync(req.file.path); } catch {} setTimeout(() => REFJOBS.delete(job.id), 600000); }
  });
}));
app.post('/api/references/:id/delete', wrap((req, res) => res.json({ ok: refLib.remove(req.params.id) })));
app.get('/api/references/:id', wrap((req, res) => { const r = refLib.get(req.params.id); r ? res.json(r) : res.status(404).json({ error: 'Sample not found.' }); }));
app.post('/api/projects/:id/reference', wrap((req, res) => {
  const p = load(req.params.id), id = req.body.id ? String(req.body.id) : null;
  if (id && !refLib.get(id)) return res.status(400).json({ error: 'Sample not found.' });
  p.reference = id; p.referenceReport = null; p.updated = Date.now(); save(p); res.json({ reference: p.reference });
}));
// background music like the one in the sample (tempo of the sample's music against our beds)
app.get('/api/projects/:id/reference/music', wrap((req, res) => {
  const p = load(req.params.id), ref = p.reference && refLib.get(p.reference);
  if (!ref) return res.status(400).json({ error: 'Choose a sample first.' });
  const mu = ref.music || null;
  const beds = AUDIO_INDEX().filter(x => x.cat === 'music').map(x => ({ id: x.id, label: x.label, bpm: Number(x.label.split(' bpm')[0].split(' ').pop().replace(/[^0-9]/g, '')) || 0 }));
  const moods = require('./lib/mood').BEDS, items = refLib.musicMatch(mu, beds).slice(0, 3).map(m => ({ id: m.id, label: (beds.find(b => b.id === m.id) || {}).label, mood: (moods[m.id] || {}).mood || '', bpm: m.bpm, how: m.how }));
  res.json({ sample: ref.name, has: !!(mu && mu.has), bpm: mu ? mu.bpm : 0, conf: mu ? mu.conf : 0, items });
}));
// what the sample's rhythm would do to this script (uses the current analysis, no re-run)
app.get('/api/projects/:id/reference/preview', wrap(async (req, res) => {
  const p = load(req.params.id), ref = p.reference && refLib.get(p.reference);
  if (!ref) return res.status(400).json({ error: 'Choose a sample first.' });
  if (!p.sentences || !p.sentences.length) return res.status(400).json({ error: 'Run the analysis first.' });
  const total = p.duration || p.sentences[p.sentences.length - 1].end; let sem = null;
  if (!p.presenterFile) {                                   // voice-over only: the picture changes where the sample's did
    const sg = refLib.mapSegments(ref, p.words || [], total), txt = x => (p.words || []).filter(w => w.end > x.start && w.start < x.end).map(w => w.w).join(' ').slice(0, 70);
    return res.json({ name: ref.name, stats: ref.stats, hook: null, mode: 'cuts', mine: { inserts: (p.cuts || []).length, duration: +total.toFixed(1) }, slots: sg.length, semantic: false, report: sg.slice(0, 40).map(x => ({ at: x.start, text: txt(x) })) });
  }
  try { if (p.matching !== 'keywords' && await embed.available()) { sem = await embed.context(nicheOf(p).id, nicheOf(p).items); await sem.ensure([...ref.sentences.map(x => x.text), ...p.sentences.map(x => x.text)]); } } catch { sem = null; }
  const m = refLib.map(ref, p.sentences, total, sem);
  res.json({ name: ref.name, stats: ref.stats, hook: ref.hook, mine: { inserts: (p.cuts || []).filter(c => !c.hook).length, duration: +total.toFixed(1) }, slots: m.slots.length, semantic: !!sem, report: m.report });
}));
// optional A/B test: copies of the project that differ only in the hook clip (the project itself stays variant A)
app.post('/api/projects/:id/hook-variants', wrap(async (req, res) => {
  const hk = require('./lib/hook'), p = load(req.params.id), count = Math.min(4, Math.max(1, +req.body.count || 2));
  if (!p.cuts || !p.sentences) return res.status(400).json({ error: 'Run the analysis first.' });
  const n = nicheOf(p), lib = n.items; if (!lib.length) return res.status(400).json({ error: 'The library of this niche is empty.' });
  let sem = null; try { if (p.matching !== 'keywords' && await embed.available()) { sem = await embed.context(n.id, lib); await sem.ensure([hk.text(p), ...feedback.list(n.id).map(e => e.text)]); } } catch { sem = null; }
  const ctx = { sem, fb: feedback.build(n.id, sem) }, cur = p.cuts.find(c => c.hook);
  const ids = hk.pickMany(p, lib, ctx, rank, normWord, count + (cur ? 0 : 1), cur ? [cur.clip] : []);
  if (!cur) { const first = ids.shift(); if (first) { hk.set(p, first); p.hookVariant = 'A'; } } else p.hookVariant = 'A';
  if (!ids.length) return res.status(400).json({ error: 'No other clip fits the opening line well enough.' });
  p.updated = Date.now(); save(p);
  const made = [];
  ids.slice(0, count).forEach((clip, i) => {
    const letter = String.fromCharCode(66 + i), q = duplicateProject(p.id, String(p.name).replace(/ · hook [A-D]$/, '') + ' · hook ' + letter);
    const c = load(q.id); hk.set(c, clip); c.hookVariant = letter; c.autoHook = false; c.updated = Date.now(); save(c); made.push(brief(c));
  });
  res.json({ made, source: { id: p.id, name: p.name } });
}));
// the next best clip for the opening line (quick change in Simple mode)
app.post('/api/projects/:id/hook-next', wrap(async (req, res) => {
  const hk = require('./lib/hook'), p = load(req.params.id);
  if (!p.cuts || !p.sentences) return res.status(400).json({ error: 'Run the analysis first.' });
  const n = nicheOf(p), lib = n.items; if (!lib.length) return res.status(400).json({ error: 'The library of this niche is empty.' });
  let sem = null; try { if (p.matching !== 'keywords' && await embed.available()) { sem = await embed.context(n.id, lib); await sem.ensure([hk.text(p), ...feedback.list(n.id).map(e => e.text)]); } } catch { sem = null; }
  const cur = p.cuts.find(c => c.hook), tried = p.hookTried || [];
  const ids = hk.pickMany(p, lib, { sem, fb: feedback.build(n.id, sem) }, rank, normWord, 1, [...(cur ? [cur.clip] : []), ...tried]);
  if (!ids.length) return res.status(400).json({ error: 'No other clip fits the opening line well enough.' });
  hk.set(p, ids[0]); p.hookTried = [...tried, ids[0]].slice(-20); p.updated = Date.now(); save(p);
  res.json({ clip: ids[0], dur: +(p.cuts[0].end - p.cuts[0].start).toFixed(1) });
}));
app.post('/api/projects/:id/hook', wrap((req, res) => {
  const hk = require('./lib/hook'), p = load(req.params.id); if (!p.cuts || !p.sentences) return res.status(400).json({ error: 'Run the analysis first.' });
  const cur = p.cuts.find(c => c.hook), d = req.body.dur != null ? Math.max(1.5, Math.min(5, +req.body.dur || 0)) : null;
  if (req.body.remove) hk.clear(p);
  else if (req.body.add) { if (!cur) hk.set(p, (p.cuts[0] || {}).clip && p.cuts[0].clip !== 'card' && p.cuts[0].clip !== 'stock' ? p.cuts[0].clip : (nicheOf(p).items[0] || {}).id); }
  else if (d && cur) hk.set(p, cur.clip, +d.toFixed(2));
  p.updated = Date.now(); save(p); res.json({ cuts: p.cuts });
}));
app.post('/api/projects/:id/cuts', wrap((req, res) => {
  const p = load(req.params.id);
  p.cuts = (req.body.cuts || []).map(c => ({ start: +c.start, end: +c.end, clip: c.clip, text: c.text || '', ...(c.bad ? { bad: String(c.bad) } : {}), ...(c.hook ? { hook: true } : {}), ...(c.tr && require('./lib/fx').valid(String(c.tr)) ? { tr: String(c.tr) } : {}), ...(c.sim ? { sim: +c.sim } : {}), ...(c.file ? { file: String(c.file), sdur: +c.sdur || 8, page: c.page || '', src: c.src || '' } : {}), ...(c.card ? { card: String(c.card).slice(0, 60), variant: c.variant ? 1 : 0 } : {}) })).sort((a, b) => a.start - b.start);
  p.updated = Date.now(); save(p); res.json({ ok: true });
}));

app.post('/api/projects/:id/render', wrap(async (req, res) => {
  const p = load(req.params.id), dir = pdir(p.id);
  if (!p.words) return res.status(400).json({ error: 'Run the analysis first.' });
  if (req.body.format) p.format = req.body.format;
  set(p, { status: 'rendering', progress: 0, error: null });
  set(p, { status: 'queued', error: null }); res.json({ ok: true });
  enqueueJob('render', p.id, async () => { try {
    set(p, { status: 'rendering', progress: 0 });
    const { FORMATS } = require('./lib/render');
    const extra = (p.exports || []).filter(f => f !== p.format && FORMATS[f]);
    const total = 1 + extra.length;
    const out = await render(dir, p, pr => { p.progress = pr / total; if (Math.random() < 0.2) save(p); });
    const [W1] = FORMATS[p.format] || FORMATS.square, outs = {};
    for (let k = 0; k < extra.length; k++) {
      const f = extra[k], [W2, H2] = FORMATS[f];
      set(p, { exportNow: f });
      const file = 'out_' + f + '.mp4';
      await render(dir, { ...p, format: f, capPx: p.capPx ? Math.round(p.capPx * W2 / W1) : p.capPx, range: null, _out: file }, pr => { p.progress = (k + 1 + pr) / total; if (Math.random() < 0.2) save(p); });
      outs[f] = { file, w: W2, h: H2, at: Date.now() };
    }
    set(p, { exportNow: null, extraOuts: outs });
    let qcPost = null;
    try { set(p, { progress: 0.99 }); qcPost = qc.post(dir, p, out); fs.writeFileSync(path.join(dir, 'qc_report.json'), JSON.stringify(qcPost, null, 1)); } catch (e) { console.error('qc skipped:', e.message); }
    set(p, { status: 'done', progress: 1, outFile: out, rendered: Date.now(), qcPost });
    tg.rendered(p);
    await autoNext(p.id, 'rendered');
    try { const n = nicheOf(p); for (const c of (p.cuts || [])) if (!/^(h|x)_/.test(String(c.clip)) && n.items.some(x => x.id === c.clip)) feedback.record(n.id, { clip: c.clip, text: c.text, kind: 'accept', src: 'render', project: p.id, start: c.start }); } catch (e) { console.error('feedback:', e.message); }
  } catch (e) { console.error(e); set(p, { status: 'error', error: e.message, exportNow: null, autoRun: undefined }); tg.failed('render', p, e.message); } });
}));

// ---- one-button pipeline: analyze -> render (all sizes) -> work folder ----
async function autoNext(id, stage) {
  let p; try { p = load(id); } catch { return; }
  const run = p.autoRun; if (!run) return;
  const post = (u, b) => fetch(selfUrl() + u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b || {}) }).then(r => r.json());
  try {
    if (stage === 'analyzed') { const r = await post('/api/projects/' + id + '/render', { format: p.format }); if (r.error) set(p, { autoRun: undefined, error: r.error }); }
    else if (stage === 'rendered') { if (run.pack) await post('/api/projects/' + id + '/workfolder'); set(load(id), { autoRun: undefined }); }
  } catch (e) { console.error('pipeline:', e.message); }
}
// delete a whole project (its folder with media and renders); the UI asks for confirmation first
app.post('/api/projects/:id/delete', wrap((req, res) => {
  const p = load(req.params.id);
  if (['analyzing', 'rendering', 'queued', 'assembling'].includes(p.status)) return res.status(400).json({ error: 'The project is busy. Wait until it finishes.' });
  fs.rmSync(pdir(p.id), { recursive: true, force: true }); res.json({ ok: true });
}));
// ---- thematic emoji above the captions ----
app.post('/api/projects/:id/emoji/auto', wrap((req, res) => {
  const p = load(req.params.id); if (!p.words) return res.status(400).json({ error: 'Run the analysis first.' });
  const emoji = require('./lib/emoji');
  p.emojis = emoji.pick(cuesOf(p).map(c => ({ start: c.start, end: c.end, text: c.text })));
  p.emojiOn = true; p.updated = Date.now(); save(p); res.json({ emojis: p.emojis, emojiOn: true });
}));
const bandUpload = multer({ storage: multer.diskStorage({ destination: (req, f, cb) => cb(null, pdir(req.params.id)), filename: (req, f, cb) => cb(null, 'band_src' + (path.extname(f.originalname).toLowerCase().replace(/[^.a-z0-9]/g, '') || '.png')) }), limits: { fileSize: 40 * 1024 * 1024 } });
app.post('/api/projects/:id/band-image', bandUpload.single('image'), wrap((req, res) => {
  const p = load(req.params.id); if (!req.file) return res.status(400).json({ error: 'No file.' });
  if (!/\.(png|jpe?g|webp)$/i.test(req.file.filename)) { fs.rmSync(req.file.path, { force: true }); return res.status(400).json({ error: 'Use a PNG, JPG or WebP picture.' }); }
  for (const n of fs.readdirSync(pdir(p.id))) if (/^band_src\./.test(n) && n !== req.file.filename) fs.rmSync(path.join(pdir(p.id), n), { force: true });
  p.band = require('./lib/band').norm({ ...(p.band || {}), type: 'image', image: req.file.filename, on: true }); p.updated = Date.now(); save(p); res.json({ band: p.band });
}));
app.get('/api/band-asset/:name', (req, res) => { const n = String(req.params.name).replace(/[^a-z0-9]/gi, ''); const f = path.join(ROOT, 'data', 'bands', n + '.png'); fs.existsSync(f) ? res.sendFile(f) : res.status(404).end(); });
const logoUpload = multer({ storage: multer.diskStorage({ destination: (req, f, cb) => cb(null, pdir(req.params.id)), filename: (req, f, cb) => cb(null, 'logo_src' + (path.extname(f.originalname).toLowerCase().replace(/[^.a-z0-9]/g, '') || '.png')) }), limits: { fileSize: 25 * 1024 * 1024 } });
app.post('/api/projects/:id/overlay-logo', logoUpload.single('logo'), wrap((req, res) => {
  const p = load(req.params.id); if (!req.file) return res.status(400).json({ error: 'No file.' });
  if (!/\.(png|webp|jpe?g)$/i.test(req.file.filename)) { fs.rmSync(req.file.path, { force: true }); return res.status(400).json({ error: 'Use a PNG, JPG or WebP picture.' }); }
  for (const n of fs.readdirSync(pdir(p.id))) if (/^logo_src\./.test(n) && n !== req.file.filename) fs.rmSync(path.join(pdir(p.id), n), { force: true });
  p.overlays = require('./lib/overlays').merge(p.overlays || {}, { logo: { file: req.file.filename, on: true } }); p.updated = Date.now(); save(p); res.json({ overlays: p.overlays });
}));
app.get('/api/transitions', (req, res) => { const f = require('./lib/fx'); res.json({ list: f.TRANSITIONS, mix: f.MIX_LABELS, grades: f.GRADES }); });
// plan review (rules only) and zoom moments
app.get('/api/projects/:id/review', wrap((req, res) => { const p = load(req.params.id); if (!p.cuts) return res.status(400).json({ error: 'Run the analysis first.' }); res.json(require('./lib/review').review(p)); }));
// optional local language model review (Ollama)
let aiBusy = false;
app.get('/api/llm/status', wrap(async (req, res) => { const l = require('./lib/llm'); res.json({ installed: await l.installed(), model: l.MODEL, busy: aiBusy }); }));
app.post('/api/projects/:id/ai-review', wrap(async (req, res) => {
  const l = require('./lib/llm'), p = load(req.params.id);
  if (!p.cuts || !p.sentences) return res.status(400).json({ error: 'Run the analysis first.' });
  if (!await l.installed()) return res.status(400).json({ error: 'The language model is not installed. Run “ollama pull ' + l.MODEL + '”.' });
  if (aiBusy) return res.status(400).json({ error: 'Another review is running. Try again in a minute.' });
  aiBusy = true;
  try {
    const r = await l.reviewPlan(p, nicheOf(p), require('./lib/review').review(p), ['ru', 'uk', 'en'].includes(req.body.lang) ? req.body.lang : 'en');
    const q = load(p.id); q.aiReview = r; save(q); res.json(r);
  } catch (e) { res.status(500).json({ error: e.name === 'TimeoutError' ? 'The model took too long. Try again.' : e.message }); }
  finally { aiBusy = false; }
}));
app.post('/api/projects/:id/zooms', wrap((req, res) => {
  const p = load(req.params.id);
  p.zooms = (Array.isArray(req.body.zooms) ? req.body.zooms : []).map(z => ({ start: +z.start, end: +z.end })).filter(z => z.start >= 0 && z.end > z.start).slice(0, 80);
  p.updated = Date.now(); save(p); res.json({ zooms: p.zooms });
}));
app.get('/api/emoji/list', (req, res) => res.json(require('./lib/emoji').list()));
app.get('/api/emoji/img', wrap(async (req, res) => {
  const f = await require('./lib/emoji').asset(String(req.query.e || '').slice(0, 12));
  if (!f) return res.status(404).end(); res.set('Cache-Control', 'public, max-age=86400'); res.sendFile(f);
}));
app.get('/api/formats', (req, res) => res.json(require('./lib/render').FORMAT_INFO));
app.post('/api/niches/:id/preset', wrap((req, res) => {
  const nid = req.params.id.replace(/[^\w-]/g, '');
  if (req.body.clear) { niches.setDefaults(nid, { preset: {} }); return res.json({ ok: true, preset: {} }); }
  const p = load(req.body.projectId), snap = presets.snapshot(p);
  niches.setDefaults(nid, { preset: snap }); res.json({ ok: true, preset: snap, summary: presets.describe(snap) });
}));
app.post('/api/projects/:id/apply-preset', wrap((req, res) => {
  const p = load(req.params.id); if (!p.niche) return res.status(400).json({ error: 'Choose a niche first.' });
  const pr = presets.ofNiche(nicheOf(p));
  if (!Object.keys(pr).length) return res.status(400).json({ error: 'This niche has no saved preset yet.' });
  presets.apply(p, pr); p.updated = Date.now(); save(p); res.json(p);
}));
app.post('/api/tasks/:id/apply-preset', wrap((req, res) => {
  const t = taskslib.get(req.params.id); if (!t) return res.status(404).json({ error: 'Unknown task.' });
  const pr = t.niche ? presets.ofNiche(niches.get(t.niche)) : {};
  const done = [], skipped = [];
  for (const p of creativesOf(t.id)) {
    if (['analyzing', 'rendering', 'queued', 'assembling'].includes(p.status)) { skipped.push({ name: p.name, why: 'already working' }); continue; }
    presets.apply(p, pr, { keep: ['format'] });
    if (t.format) p.format = t.format;
    if (Array.isArray(t.exports)) p.exports = t.exports.slice();
    p.updated = Date.now(); save(p); done.push(p.name);
  }
  res.json({ done, skipped, preset: Object.keys(pr).length > 0 });
}));
app.post('/api/tasks/:id/run-all', wrap(async (req, res) => {
  const force = !!req.body.force, dry = !!req.body.dry, pack = req.body.pack !== false, plan = { start: [], skipped: [] };
  for (const p of creativesOf(req.params.id)) {
    const sm = taskslib.summarize(p);
    if (['analyzing', 'rendering', 'queued', 'assembling'].includes(p.status)) { plan.skipped.push({ id: p.id, name: p.name, why: 'already working' }); continue; }
    if (!sm.done.script || !sm.done.media) { plan.skipped.push({ id: p.id, name: p.name, why: 'needs script and voice/video' }); continue; }
    if (sm.done.render && sm.done.analysis && !force) { plan.skipped.push({ id: p.id, name: p.name, why: 'already rendered' }); continue; }
    plan.start.push({ id: p.id, name: p.name, from: sm.done.analysis && !force ? 'render' : 'analyze' });
  }
  if (dry) return res.json(plan);
  const started = [];
  for (const it of plan.start) {
    const p = load(it.id); p.autoRun = { pack }; save(p);
    const r = await (await fetch(selfUrl() + '/api/projects/' + p.id + '/' + (it.from === 'render' ? 'render' : 'analyze'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ format: p.format }) })).json();
    if (r.error) { set(load(it.id), { autoRun: undefined }); plan.skipped.push({ id: it.id, name: it.name, why: r.error }); } else started.push(it.name);
  }
  res.json({ started, skipped: plan.skipped });
}));

app.get('/api/share/:id', wrap((req, res) => { const p = load(req.params.id); res.json({ name: p.name, video: p.outFile ? `/files/${p.id}/${p.outFile}?v=${p.rendered}` : null, feedback: p.feedback || [] }); }));
app.post('/api/share/:id/feedback', wrap((req, res) => {
  const p = load(req.params.id);
  p.feedback = [...(p.feedback || []), { at: Date.now(), who: String(req.body.who || '').slice(0, 60), status: req.body.status === 'approved' ? 'approved' : 'changes', note: String(req.body.note || '').slice(0, 1000) }];
  save(p); res.json({ ok: true });
}));
app.get('/share/:id', (req, res) => res.sendFile(path.join(ROOT, 'public', 'share.html')));

recovery.takeInterrupted(j => { try { return { projectName: load(j.projectId).name }; } catch { return {}; } });
for (const d of fs.readdirSync(PROJ)) { try { const p = load(d); if (['analyzing', 'rendering', 'queued'].includes(p.status)) set(p, { status: 'error', error: 'Interrupted (server restart). Start again.' }); } catch {} }
process.on('uncaughtException', e => console.error('uncaught:', e));
process.on('unhandledRejection', e => console.error('unhandled:', e));
app.get('/health', (req, res) => res.json({ ok: true, uptime: Math.round(process.uptime()) }));
require('./lib/voice_routes').mount(app, { load, save, pdir, settings, wrap, creativesOf, speakers, PROJ });
require('./lib/dreamface').mount(app, { load, save, pdir, wrap, settings, creativesOf, taskslib, allProjects });
require('./lib/grok_routes').mount(app, { load, save, wrap, settings, niches, multer, allProjects });
const tg = require('./lib/telegram').create({ SETTINGS, pdir, creativesOf, taskslib });
tg.mount(app, wrap);
const siteUrl = () => String(settings().publicUrl || ('http://localhost:' + (process.env.PORT || 4317))).replace(/\/$/, '');
const watcher = require('./lib/asana_watch').create({ settings, taskslib, creativesOf, load, save, tg, siteUrl });
require('./lib/team_routes').mount(app, { load, save, wrap, settings, allProjects, taskslib, tg, watcher });
watcher.start();
require('./lib/sources_routes').mount(app, { wrap, allProjects, niches, settings, multer });
require('./lib/harvest_routes').mount(app, { wrap, niches, multer, enqueue });
require('./lib/autofill_routes').mount(app, { wrap, settings, allProjects, niches });
const simpleMode = require('./lib/simple').create({ load, save, settings, creativesOf, speakers, selfUrl, taskslib });
require('./lib/simple_routes').mount(app, { wrap, load, save, settings, creativesOf, taskslib, speakers, niches, simple: simpleMode, newProject });
require('./lib/autoniche_routes').mount(app, { wrap, multer, enqueue });
require('./lib/joinmedia').mount(app, { wrap, load, save, pdir, multer, enqueueJob });
require('./lib/typo_routes').mount(app, { wrap, load, save, set, enqueueJob, pdir, multer });
const maint = require('./lib/maint').create({ ROOT, PROJ, SETTINGS, jobs: { running: () => JOBS.cur, waiting: () => JOBS.n }, allProjects, recovery, hooks: { health: tg.health, backupFailed: tg.backupFailed } });
maint.mount(app, wrap); maint.start();
if (recovery.list().length) tg.restarted(recovery.list().length);
inbox.start();
const PORT = process.env.PORT || 4317;
app.listen(PORT, '127.0.0.1', () => console.log(`Video Studio: http://localhost:${PORT}`));
