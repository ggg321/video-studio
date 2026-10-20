// Routes of the typographic video: settings, screenshots for the phone / monitor frames, the plan and the render.
const fs = require('fs'), path = require('path');
const typo = require('./typo'), hfcaps = require('./hfcaps');

function mount(app, ctx) {
  const { wrap, load, save, set, enqueueJob, pdir, multer } = ctx;
  const shotsDir = id => path.join(pdir(id), 'typo');
  const up = multer({ storage: multer.diskStorage({
    destination: (req, f, cb) => { const d = shotsDir(req.params.id); fs.mkdirSync(d, { recursive: true }); cb(null, d); },
    filename: (req, f, cb) => cb(null, Date.now().toString(36) + '_' + String(f.originalname).replace(/[^\w.\-]+/g, '_').slice(-60)) }), limits: { fileSize: 300 * 1024 * 1024 } });
  const state = p => {
    const t = p.typo || {};
    return { opts: typo.settingsOf(p), shots: t.shots || [], status: t.status || '', progress: t.progress || 0, error: t.error || '', file: t.file || null, rendered: t.rendered || null, plan: t.plan || null,
      hasVideo: !!p.presenterFile, analyzed: !!(p.words && p.sentences), name: p.name, format: p.format };
  };
  // subtitle templates from the HyperFrames catalog for the normal (light) video
  app.get('/api/hfcaps', wrap((req, res) => res.json(hfcaps.list())));
  app.post('/api/projects/:id/hfcaption', wrap((req, res) => {
    const p = load(req.params.id), id = String(req.body.id || '');
    p.hfCaption = hfcaps.get(id) ? id : ''; p.updated = Date.now(); save(p); res.json({ ok: true, hfCaption: p.hfCaption });
  }));
  // light motion over the normal video (Pro)
  app.get('/api/projects/:id/lightmotion', wrap((req, res) => res.json(require('./lightmotion').optsOf(load(req.params.id)))));
  app.post('/api/projects/:id/lightmotion', wrap((req, res) => {
    const p = load(req.params.id), b = req.body || {}, o = { ...(p.lightMotion || {}) };
    if (b.on != null) o.on = !!b.on;
    if (['blur', 'gsap', 'split'].includes(b.anim)) o.anim = b.anim;
    if (b.underline != null) o.underline = !!b.underline;
    if (b.particles != null) o.particles = !!b.particles;
    if (['low', 'medium', 'high'].includes(b.density)) o.density = b.density;
    if (b.accent != null) o.accent = /^#[0-9a-f]{6}$/i.test(b.accent) ? b.accent : '';
    p.lightMotion = o; p.updated = Date.now(); save(p); res.json(require('./lightmotion').optsOf(p));
  }));
  // photo at the start + timer at the end of the finished video (Pro and Simple)
  const W = require('./wrap');
  const photoUp = multer({ storage: multer.diskStorage({ destination: (req, f, cb) => cb(null, pdir(req.params.id)), filename: (req, f, cb) => cb(null, 'wrap_photo' + (path.extname(f.originalname || '').toLowerCase().replace(/[^.a-z0-9]/g, '') || '.jpg')) }), limits: { fileSize: 40 * 1024 * 1024 } });
  app.get('/api/projects/:id/wrap', wrap((req, res) => res.json({ ...W.settingsOf(load(req.params.id)), pexels: !!W.pexelsKey() })));
  app.post('/api/projects/:id/wrap', wrap((req, res) => {
    const p = load(req.params.id), b = req.body || {}, o = { ...(p.wrap || {}) };
    for (const k of ['introOn', 'outroOn', 'outroDown']) if (b[k] != null) o[k] = !!b[k];
    if (b.introSec != null) o.introSec = Math.min(10, Math.max(0.5, +b.introSec || 1));
    if (['nature', 'upload'].includes(b.introSrc)) o.introSrc = b.introSrc;
    if (b.outroTarget != null) { if (!W.parseTime(b.outroTarget)) return res.status(400).json({ error: 'Write the length like 9:50' }); o.outroTarget = String(b.outroTarget).trim(); }
    if (['black', 'white', 'last'].includes(b.outroBg)) o.outroBg = b.outroBg;
    p.wrap = o; p.updated = Date.now(); save(p); res.json({ ...W.settingsOf(p), pexels: !!W.pexelsKey() });
  }));
  app.post('/api/projects/:id/wrap-photo', photoUp.single('file'), wrap((req, res) => {
    const p = load(req.params.id); if (!req.file) return res.status(400).json({ error: 'No file' });
    if (!/\.(jpe?g|png|webp|gif|bmp)$/i.test(req.file.filename)) { try { fs.unlinkSync(req.file.path); } catch {} return res.status(400).json({ error: 'This is not a picture' }); }
    p.wrap = { ...(p.wrap || {}), introFile: req.file.filename, introSrc: 'upload', introName: req.file.originalname }; p.updated = Date.now(); save(p); res.json({ ...W.settingsOf(p), name: req.file.originalname });
  }));
  // catalog scenes (titles, charts, diagrams, phone chats, social cards, lower thirds)
  app.get('/api/hfblocks', wrap((req, res) => res.json(require('./hfblocks').list())));
  app.get('/api/hfblocks/:id', wrap((req, res) => { const f = require('./hfblocks').fields(String(req.params.id).replace(/[^\w-]/g, '')); f ? res.json(f) : res.status(404).json({ error: 'No such scene.' }); }));
  app.get('/api/typo/options', wrap((req, res) => res.json({ accents: typo.ACCENTS, fonts: typo.fontList(), defaults: typo.DEFAULTS, carousels: require('./hfscenes').list() })));
  app.get('/api/projects/:id/typo', wrap((req, res) => res.json(state(load(req.params.id)))));
  app.post('/api/projects/:id/typo/options', wrap((req, res) => {
    const p = load(req.params.id), b = req.body || {}, o = { ...((p.typo && p.typo.opts) || {}) };
    if (/^#[0-9a-f]{6}$/i.test(b.accent || '')) o.accent = b.accent;
    if (b.font != null && /^[\w .\-]+\.(ttf|otf|woff2?)$/i.test(b.font)) o.font = b.font;
    if (['low', 'medium', 'high'].includes(b.density)) o.density = b.density;
    if (b.sceneEvery != null) o.sceneEvery = Math.min(12, Math.max(0, Math.round(+b.sceneEvery) || 0));
    if (['mix', 'dark', 'light'].includes(b.themes)) o.themes = b.themes;
    if (['blur', 'gsap', 'split'].includes(b.anim)) o.anim = b.anim;
    if (['device', 'carousel'].includes(b.shotsAs)) o.shotsAs = b.shotsAs;
    if (b.carousel && require('./hfscenes').get(String(b.carousel))) o.carousel = String(b.carousel);
    if (['dark', 'light'].includes(b.carouselBg)) o.carouselBg = b.carouselBg;
    for (const k of ['underline', 'morph', 'particles']) if (b[k] != null) o[k] = !!b[k];
    if (b.keywords != null) o.keywords = !!b.keywords;
    if (b.flashes != null) o.flashes = !!b.flashes;
    if (b.shotSeconds != null) o.shotSeconds = Math.min(6, Math.max(1, +b.shotSeconds || 2.4));
    p.typo = { ...(p.typo || {}), opts: o, plan: null }; save(p); res.json(state(p));
  }));
  app.post('/api/projects/:id/typo/shots', up.array('files', 20), wrap((req, res) => {
    const p = load(req.params.id); const t = p.typo || {}; t.shots = [...(t.shots || []), ...(req.files || []).map(f => f.filename)]; t.plan = null; p.typo = t; save(p); res.json(state(p));
  }));
  app.post('/api/projects/:id/typo/shots/remove', wrap((req, res) => {
    const p = load(req.params.id), name = path.basename(String(req.body.name || '')), t = p.typo || {};
    t.shots = (t.shots || []).filter(x => x !== name); t.plan = null; try { fs.unlinkSync(path.join(shotsDir(p.id), name)); } catch {} p.typo = t; save(p); res.json(state(p));
  }));
  // the plan can be seen and edited before the render
  app.post('/api/projects/:id/typo/plan', wrap((req, res) => {
    const p = load(req.params.id); if (!p.words) return res.status(400).json({ error: 'Run the analysis first.' });
    const pl = typo.plan(pdir(p.id), p); p.typo = { ...(p.typo || {}), plan: pl }; save(p); res.json(state(p));
  }));
  app.post('/api/projects/:id/typo/plan/save', wrap((req, res) => {
    const p = load(req.params.id), b = req.body || {}, cur = (p.typo && p.typo.plan) || null; if (!cur) return res.status(400).json({ error: 'Make the plan first.' });
    const num = v => Math.round((+v || 0) * 100) / 100;
    const keywords = (Array.isArray(b.keywords) ? b.keywords : cur.keywords).filter(k => k && String(k.text || '').trim()).map(k => ({ start: num(k.start), end: num(k.end), text: String(k.text).slice(0, 80), pos: ['top', 'center', 'low'].includes(k.pos) ? k.pos : 'top' }));
    const hbk = require('./hfblocks');
    const clean = o => { const r = {}; let n = 0; for (const [k, v] of Object.entries(o || {})) { if (n++ > 40) break; if (['string', 'number', 'boolean'].includes(typeof v)) r[String(k).slice(0, 120)] = typeof v === 'string' ? v.slice(0, 400) : v; } return r; };
    const scenes = (Array.isArray(b.scenes) ? b.scenes : cur.scenes).filter(Boolean).filter(s => s.kind !== 'catalog' || hbk.get(String(s.block))).map(s => s.kind === 'catalog'
      ? { kind: 'catalog', start: num(s.start), end: num(s.end), block: String(s.block), params: clean(s.params), fit: s.fit === 'cover' ? 'cover' : 'contain' }
      : s.kind === 'carousel'
      ? { kind: 'carousel', start: num(s.start), end: num(s.end), block: String(s.block || ''), theme: s.theme === 'light' ? 'light' : 'dark', lines: (Array.isArray(s.lines) ? s.lines : []).map(x => String(x).slice(0, 60)).slice(0, 2), files: Array.isArray(s.files) ? s.files.map(x => path.basename(String(x))) : [] }
      : s.kind === 'device'
      ? { kind: 'device', start: num(s.start), end: num(s.end), device: s.device === 'monitor' ? 'monitor' : 'phone', src: String(s.src || ''), fileName: s.fileName || path.basename(String(s.src || '')), theme: 'dark', caption: String(s.caption || '').slice(0, 60) }
      : { kind: 'text', start: num(s.start), end: num(s.end), lines: (Array.isArray(s.lines) ? s.lines : String(s.lines || '').split('|')).map(x => String(x).trim()).filter(Boolean).slice(0, 4), hl: (s.hl || []).map(String).slice(0, 8), theme: s.theme === 'light' ? 'light' : 'dark' });
    p.typo = { ...(p.typo || {}), plan: { ...cur, keywords, scenes: scenes.filter(s => s.kind === 'device' || s.kind === 'carousel' || s.kind === 'catalog' || s.lines.length) } }; save(p); res.json(state(p));
  }));
  app.post('/api/projects/:id/typo/render', wrap((req, res) => {
    const p = load(req.params.id), dir = pdir(p.id);
    if (!p.presenterFile) return res.status(400).json({ error: 'A typographic video needs the video of the speaker.' });
    if (!p.words) return res.status(400).json({ error: 'Run the analysis first.' });
    const t = p.typo || {}; if (['queued', 'rendering'].includes(t.status)) return res.status(409).json({ error: 'It is already being made.' });
    const pl = t.plan || typo.plan(dir, p);
    set(p, { typo: { ...t, plan: pl, status: 'queued', progress: 0, error: '' } });
    res.json(state(p));
    enqueueJob('typo', p.id, async () => {
      let q = load(p.id);
      try {
        q.typo = { ...q.typo, status: 'rendering', progress: 0 }; save(q);
        const file = await typo.render(dir, q, pl, pr => { q.typo.progress = pr; if (Math.random() < 0.15) save(q); });
        q = load(p.id); q.typo = { ...q.typo, status: 'done', progress: 1, file, rendered: Date.now(), error: '' }; save(q);
      } catch (e) { console.error('typo:', e.message); q = load(p.id); q.typo = { ...q.typo, status: 'error', error: e.message }; save(q); }
    });
  }));
}
module.exports = { mount };
