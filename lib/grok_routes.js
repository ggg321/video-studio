// Grok as a clip source: prompts for the gaps, bulk import by file name, and paid generation through the xAI API (cost check + confirmation).
const fs = require('fs'), path = require('path');
const grok = require('./grok'), flowprompt = require('./flowprompt'), hook = require('./hook'), spend = require('./spend');

function mount(app, ctx) {
  const { load, save, wrap, settings, niches, multer, allProjects } = ctx;
  const MAX_DEFAULT = 10, MAX_HARD = 20;
  const style = n => ((n.defaults || {}).grokStyle || grok.DEFAULT_STYLE).trim();
  const hookItem = p => {
    const t = hook.text(p); if (!t || !p.sentences) return null;
    const st = style(niches.get(p.niche)), d = hook.dur(p);
    return { i: -1, scene: 0, hook: true, start: 0, end: d, text: t, status: hook.has(p) ? 'has a hook clip' : 'no hook clip', set: hook.has(p), seconds: Math.max(3, Math.min(8, Math.ceil(d + 0.5))),
      prompt: `${st} Opening shot that grabs attention for the line: "${t}". ${grok.aspectFor(p.format) === '9:16' ? 'Vertical 9:16 framing.' : 'Horizontal 16:9 framing (it will be cropped to the video format).'} One continuous 3-5 second shot, no on-screen text, no logos or watermarks, no one speaking to the camera.` };
  };
  const real = p => p.cuts.map((c, k) => k).filter(k => !p.cuts[k].hook);   // the hook cut is not a numbered scene
  const gaps = p => flowprompt.build(p, niches.get(p.niche), { style: style(niches.get(p.niche)), aspect: grok.aspectFor(p.format) }).map(x => ({ ...x, scene: real(p).indexOf(x.i) + 1, seconds: grok.secondsFor(p.cuts[x.i]) }));

  // put a finished clip file (already in the niche folder) on an insert and into the library
  const attach = (p, i, filename, orig, tags = []) => {
    const n = niches.get(p.niche);
    if (i === -1) { const cid = niches.addClip(n.id, filename, ['grok', 'generated', 'hook', ...tags], orig); niches.updateClip(n.id, cid, { desc: hook.text(p) }); hook.set(p, cid); return cid; }
    const c = p.cuts[i];
    const cid = niches.addClip(n.id, filename, ['grok', 'generated', ...tags], orig);
    niches.updateClip(n.id, cid, { desc: c.text || c.card || '' });
    Object.assign(c, { clip: cid, sim: 1 }); delete c.card; delete c.file; delete c.src; delete c.page;
    return cid;
  };
  const upload = multer({ storage: multer.diskStorage({
    destination: (req, f, cb) => { const n = niches.get(load(req.params.id).niche); fs.mkdirSync(n.files, { recursive: true }); cb(null, n.files); },
    filename: (req, f, cb) => cb(null, Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 5) + '_' + f.originalname.replace(/[^\w.-]/g, '_'))
  }), limits: { fileSize: 400 * 1024 * 1024 } });

  app.get('/api/projects/:id/grok/prompts', wrap((req, res) => {
    const p = load(req.params.id), n = niches.get(p.niche), s = settings();
    res.json({ niche: n.id, style: style(n), hasKey: !!s.xaiKey, model: grok.MODEL, rates: grok.RATE, max: Math.min(MAX_HARD, +s.grokMax || MAX_DEFAULT), aspect: grok.aspectFor(p.format), hook: p.cuts ? hookItem(p) : null, items: p.cuts ? gaps(p) : [], state: p.grok || null, clips: (p.cuts || []).length });
  }));

  // ---- bulk import: scene_07.mp4 goes to scene 7, hook.mp4 to the opening ----
  app.post('/api/projects/:id/grok/bulk', upload.array('files', 80), wrap((req, res) => {
    const p = load(req.params.id); if (!p.cuts) return res.status(400).json({ error: 'Run the analysis first.' });
    const out = [];
    const files = [...(req.files || [])].sort((a, b) => (grok.parseScene(a.originalname) === 'hook') - (grok.parseScene(b.originalname) === 'hook'));   // the hook goes last: it shifts the cut indexes
    for (const f of files) {
      const n = grok.parseScene(f.originalname);
      if (n == null) { niches.addClip(niches.get(p.niche).id, f.filename, ['grok', 'generated'], f.originalname); out.push({ file: f.originalname, status: 'library', note: 'No scene number in the name: added to the library only.' }); continue; }
      const i = n === 'hook' ? -1 : (real(p)[n - 1] == null ? 9999 : real(p)[n - 1]);
      if (i === -1 && !hook.text(p)) { niches.addClip(niches.get(p.niche).id, f.filename, ['grok', 'generated'], f.originalname); out.push({ file: f.originalname, status: 'library', note: 'No script found for the opening: added to the library only.' }); continue; }
      if (i !== -1 && !p.cuts[i]) { niches.addClip(niches.get(p.niche).id, f.filename, ['grok', 'generated'], f.originalname); out.push({ file: f.originalname, status: 'library', scene: n, note: 'Scene ' + n + ' does not exist in this project: added to the library only.' }); continue; }
      attach(p, i, f.filename, f.originalname); out.push({ file: f.originalname, status: 'placed', scene: n, hook: i === -1 });
    }
    p.updated = Date.now(); save(p); res.json({ results: out });
  }));

  // ---- paid generation: 1) cost check -> token  2) confirmed run ----
  app.post('/api/projects/:id/grok/preview', wrap((req, res) => {
    const p = load(req.params.id), s = settings();
    if (!s.xaiKey) return res.status(400).json({ error: 'No xAI API key set (Settings).' });
    if (p.grok && p.grok.status === 'running') return res.status(400).json({ error: 'A Grok generation is already running for this project.' });
    const resn = ['480p', '720p', '1080p'].includes(req.body.res) ? req.body.res : '720p', max = Math.min(MAX_HARD, +s.grokMax || MAX_DEFAULT);
    const all = [hookItem(p), ...gaps(p)].filter(Boolean), want = new Set((req.body.items || []).map(Number)), items = all.filter(x => want.has(x.i)).slice(0, max);
    if (!items.length) return res.status(400).json({ error: 'Choose at least one moment.' });
    const total = items.reduce((a, x) => a + x.seconds, 0), est = grok.estimate(items, resn);
    const token = grok.newToken({ projectId: p.id, items: items.map(x => ({ i: x.i, scene: x.scene, start: x.start, text: x.text, prompt: x.prompt, seconds: x.seconds })), res: resn, aspect: grok.aspectFor(p.format) });
    const budget = spend.check(s.dailyBudgetUsd, est);
    res.json({ items: items.map(x => ({ i: x.i, scene: x.scene, text: x.text, seconds: x.seconds })), res: resn, totalSeconds: total, estUsd: est, budget, rate: grok.RATE[resn], token, max, capped: want.size > items.length });
  }));

  const setState = (pid, fn) => { const q = load(pid); q.grok = q.grok || {}; fn(q.grok, q); save(q); };
  async function runJob(pid, job) {
    const key = settings().xaiKey; let idx = 0, abort = false;
    const worker = async () => {
      while (idx < job.items.length && !abort) {
        const it = job.items[idx++];
        setState(pid, g => { const x = g.items.find(y => y.i === it.i); x.status = 'running'; });
        try {
          const n = niches.get(load(pid).niche); fs.mkdirSync(n.files, { recursive: true });
          const fn = `grok_${Date.now().toString(36)}_${it.i === -1 ? 'hook' : 's' + it.scene}.mp4`;
          await grok.generateOne(key, it, { aspect: job.aspect, res: job.res, poll: job.poll }, path.join(n.files, fn));
          spend.add('grok', grok.estimate([it], job.res), 'scene ' + it.scene);
          setState(pid, (g, q) => {
            const x = g.items.find(y => y.i === it.i);
            const k = it.i === -1 ? -1 : (q.cuts || []).findIndex(c => !c.hook && Math.abs(c.start - it.start) < 0.05 && String(c.text || c.card || '').trim() === it.text)   // the same sentence can span two cuts: the start tells which one;   // indexes may have shifted when a hook was added
            if (it.i === -1 ? hook.text(q) === it.text : k >= 0) { attach(q, k, fn, fn, []); x.status = 'done'; }
            else { niches.addClip(n.id, fn, ['grok', 'generated'], fn); x.status = 'done'; x.note = 'The moment changed meanwhile: the clip was added to the library only.'; }
            g.done = (g.done || 0) + 1; q.updated = Date.now();
          });
        } catch (e) {
          setState(pid, g => { const x = g.items.find(y => y.i === it.i); x.status = 'failed'; x.error = String(e.message || e).slice(0, 200); g.failed = (g.failed || 0) + 1; });
          if (e.fatal) abort = true;
        }
      }
    };
    await Promise.all([worker(), worker()]);
    setState(pid, g => { g.items.forEach(x => { if (x.status === 'pending' || x.status === 'running') { x.status = 'failed'; x.error = x.error || 'Stopped.'; } }); g.status = 'done'; g.finished = Date.now(); });
  }
  app.post('/api/projects/:id/grok/generate', wrap((req, res) => {
    const job = grok.takeToken(String(req.body.token || ''));
    if (!job || job.projectId !== req.params.id) return res.status(400).json({ error: 'The confirmation expired. Run the cost check again.' });
    if (!settings().xaiKey) return res.status(400).json({ error: 'No xAI API key set (Settings).' });
    const p = load(req.params.id); if (p.grok && p.grok.status === 'running') return res.status(400).json({ error: 'A Grok generation is already running for this project.' });
    const items = req.body.test ? job.items.slice(0, 1) : job.items;
    const bud = spend.check(settings().dailyBudgetUsd, grok.estimate(items, job.res)); if (bud.over) return res.status(400).json({ error: 'This would go over the daily limit ($' + bud.limit + ', spent today $' + bud.spent + '). Raise it in Settings.' });
    p.grok = { status: 'running', started: Date.now(), res: job.res, test: !!req.body.test, total: items.length, done: 0, failed: 0, estUsd: grok.estimate(items, job.res), items: items.map(x => ({ i: x.i, scene: x.scene, text: x.text.slice(0, 90), seconds: x.seconds, status: 'pending' })) };
    save(p); res.json({ started: items.length, estUsd: p.grok.estUsd });
    runJob(p.id, { items, res: job.res, aspect: job.aspect, poll: +process.env.GROK_POLL_MS || 4000 }).catch(e => { console.error('grok job:', e.message); setState(p.id, g => { g.status = 'done'; g.error = e.message; }); });
  }));
  app.get('/api/projects/:id/grok/status', wrap((req, res) => res.json(load(req.params.id).grok || null)));
  // a restart interrupts running jobs: mark them so the page does not wait forever
  try { allProjects().forEach(p => { if (p.grok && p.grok.status === 'running') { p.grok.status = 'done'; p.grok.items.forEach(x => { if (x.status === 'pending' || x.status === 'running') { x.status = 'failed'; x.error = 'Interrupted by a restart.'; } }); save(p); } }); } catch {}
}
module.exports = { mount };
