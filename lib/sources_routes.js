// Sources: library health, the queue of moments without a clip, and the ways to fill a gap (a file, free stock, Grok).
const fs = require('fs'), path = require('path');
const sources = require('./sources'), grok = require('./grok');
const stock = require('./stock'), spend = require('./spend');

const STOP = new Set('the a an and or but if then so to of in on at for with from by is are was were be been it its this that you your we our they their he she i me my not no do does did have has had will would can could should as how what when why who which там тут это этот эта эти что как когда почему если или для при про над под без все всё его её их мы вы они она оно мой наш ваш твой нет да так уже ещё еще только можно нужно надо будет была были быть це цей ця ці що як коли чому якщо або для при про над під без всі його її їх ми ви вони вона воно мій наш ваш твій немає так вже ще тільки можна треба буде була були бути'.split(' '));
const queryOf = text => String(text || '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(w => w.length > 3 && !STOP.has(w)).slice(0, 4).join(' ');
const tagsOf = text => [...new Set(String(text || '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(w => w.length > 3 && !STOP.has(w)))].slice(0, 8);

function mount(app, ctx) {
  const { wrap, allProjects, niches, settings, multer } = ctx;
  const nid = req => String(req.query.niche || req.body.niche || 'weight-loss').replace(/[^\w-]/g, '');

  app.get('/api/sources/overview', wrap((req, res) => {
    const id = nid(req), n = niches.get(id, { own: true });
    res.json({ niche: n.id, name: n.name, ...sources.overview(allProjects(), n.id, n.items), keys: { stock: !!(settings().pexelsKey || settings().pixabayKey), grok: !!settings().xaiKey } });
  }));
  app.post('/api/sources/gap/ignore', wrap((req, res) => { sources.ignore(nid(req), String(req.body.key || '')); res.json({ ok: true }); }));
  app.post('/api/sources/gap/unignore-all', wrap((req, res) => { sources.unignoreAll(nid(req)); res.json({ ok: true }); }));

  // ---- a file for the gap ----
  const upload = multer({ storage: multer.diskStorage({
    destination: (req, f, cb) => { const n = niches.get(String(req.query.niche || 'weight-loss').replace(/[^\w-]/g, '')); fs.mkdirSync(n.files, { recursive: true }); cb(null, n.files); },
    filename: (req, f, cb) => cb(null, Date.now().toString(36) + '_' + f.originalname.replace(/[^\w.-]/g, '_'))
  }), limits: { fileSize: 600 * 1024 * 1024 } });
  app.post('/api/sources/gap/file', upload.single('file'), wrap((req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Choose a video file.' });
    const id = nid(req), text = String(req.body.text || ''), cid = niches.addClip(id, req.file.filename, tagsOf(text), req.file.originalname);
    niches.updateClip(id, cid, { desc: text.slice(0, 300) }); res.json({ clip: cid });
  }));

  // ---- free stock ----
  app.post('/api/sources/gap/stock-search', wrap(async (req, res) => {
    const q = String(req.body.q || '').trim() || queryOf(req.body.text);
    if (!q) return res.status(400).json({ error: 'Type what to look for.' });
    try { res.json({ q, items: await stock.search(q, settings(), true) }); } catch (e) { res.status(400).json({ error: e.message }); }
  }));
  app.post('/api/sources/gap/stock-add', wrap(async (req, res) => {
    const id = nid(req), n = niches.get(id), item = req.body.item || {}, text = String(req.body.text || '');
    if (!item.url || !item.id) return res.status(400).json({ error: 'Choose a clip.' });
    const file = await stock.download({ id: item.id, url: item.url }, n.files);
    const cid = niches.addClip(id, file, ['stock', item.source || 'stock', ...tagsOf(text)], item.page || file);
    niches.updateClip(id, cid, { desc: text.slice(0, 300) }); res.json({ clip: cid });
  }));

  // ---- Grok (paid): cost first, then a separate confirmation ----
  const jobs = new Map();
  app.post('/api/sources/gap/grok-preview', wrap((req, res) => {
    const s = settings(); if (!s.xaiKey) return res.status(400).json({ error: 'No xAI API key set (Settings).' });
    const id = nid(req), n = niches.get(id), text = String(req.body.text || '').trim(); if (!text) return res.status(400).json({ error: 'The moment has no text.' });
    const resn = ['480p', '720p', '1080p'].includes(req.body.res) ? req.body.res : '720p', style = ((n.defaults || {}).grokStyle || grok.DEFAULT_STYLE).trim();
    const prompt = String(req.body.prompt || '').trim() || `${style} Scene illustrating: "${text}". Vertical 9:16 framing. One continuous 4-6 second shot, no on-screen text, no logos or watermarks, no one speaking to the camera.`;
    const seconds = 5, est = grok.estimate([{ seconds }], resn);
    const budget = spend.check(s.dailyBudgetUsd, est);
    res.json({ prompt, seconds, res: resn, estUsd: est, rate: grok.RATE[resn], token: grok.newToken({ kind: 'gap', niche: id, text, prompt, seconds, res: resn, estUsd: est }), budget });
  }));
  app.post('/api/sources/gap/grok-generate', wrap((req, res) => {
    const t = grok.takeToken(String(req.body.token || '')); if (!t || t.kind !== 'gap') return res.status(400).json({ error: 'The confirmation expired. Run the cost check again.' });
    const key = settings().xaiKey; if (!key) return res.status(400).json({ error: 'No xAI API key set (Settings).' });
    const bud = spend.check(settings().dailyBudgetUsd, t.estUsd); if (bud.over) return res.status(400).json({ error: 'This would go over the daily limit ($' + bud.limit + ', spent today $' + bud.spent + '). Raise it in Settings.' });
    const job = { id: 'g' + Date.now().toString(36), status: 'running', text: t.text }; jobs.set(job.id, job);
    res.json({ job: job.id });
    (async () => {
      try {
        const n = niches.get(t.niche); fs.mkdirSync(n.files, { recursive: true });
        const fn = 'grok_' + Date.now().toString(36) + '_gap.mp4';
        await grok.generateOne(key, { prompt: t.prompt, seconds: t.seconds }, { aspect: '9:16', res: t.res, poll: +process.env.GROK_POLL_MS || 4000 }, path.join(n.files, fn));
        const cid = niches.addClip(t.niche, fn, ['grok', 'generated', ...tagsOf(t.text)], fn); niches.updateClip(t.niche, cid, { desc: t.text.slice(0, 300) });
        job.status = 'done'; job.clip = cid; spend.add('grok', t.estUsd, t.text);
      } catch (e) { job.status = 'failed'; job.error = String(e.message || e).slice(0, 200); }
      setTimeout(() => jobs.delete(job.id), 600000);
    })();
  }));
  app.get('/api/sources/gap/grok-status/:id', wrap((req, res) => res.json(jobs.get(req.params.id) || { status: 'unknown' })));
  return { queryOf, tagsOf };
}
module.exports = { mount, queryOf, tagsOf };
