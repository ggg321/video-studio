// Routes of the automatic sorting of uploaded clips into niches.
const fs = require('fs'), path = require('path');
const express = require('express');
const an = require('./autoniche'), niches = require('./niches');

function mount(app, ctx) {
  const { wrap, multer, enqueue } = ctx;
  fs.mkdirSync(an.INBOX, { recursive: true });
  app.use('/auto-inbox', express.static(an.INBOX));
  const up = multer({ storage: multer.diskStorage({ destination: (req, f, cb) => cb(null, an.INBOX),
    filename: (req, f, cb) => cb(null, Date.now().toString(36) + Math.random().toString(36).slice(2, 4) + '_' + f.originalname.replace(/[^\w.-]/g, '_')) }), limits: { fileSize: 2e9 } });
  let JOB = { running: false, total: 0, done: 0, results: [] };
  app.post('/api/library/auto-upload', up.array('files', 300), wrap((req, res) => {
    const tags = String(req.body.tags || '').split(',').map(t => t.trim().toLowerCase()).filter(Boolean), files = req.files || [], asHooks = !!req.body.hooks;
    if (!files.length) return res.status(400).json({ error: 'Choose clips first.' });
    // batches of one upload arrive one after another: the first starts a new report, the next ones add to it
    if (req.body.first || !JOB.total) JOB = { running: true, total: files.length, done: 0, results: [] }; else { JOB.total += files.length; JOB.running = true; }
    res.json({ started: true, total: files.length });
    enqueue(async () => {
      for (const f of files) {
        try { const r = await an.sort(f.path, f.originalname, tags, asHooks); JOB.results.push({ name: f.originalname, ...r }); }
        catch (e) { JOB.results.push({ name: f.originalname, error: e.message }); }
        JOB.done++;
      }
      if (JOB.done >= JOB.total) JOB.running = false;
    });
  }));
  app.get('/api/library/auto-status', wrap((req, res) => res.json(JOB)));
  app.get('/api/library/auto-pending', wrap((req, res) => res.json({ items: an.pending(), niches: niches.list().map(n => ({ id: n.id, name: n.name })) })));
  app.post('/api/library/auto-place', wrap((req, res) => { const r = an.choose(String(req.body.id || ''), String(req.body.niche || '')); r.error ? res.status(400).json(r) : res.json(r); }));
  // duplicates of a library: find, then remove the extra ones (their files go to a trash folder, projects switch to the clip that stays)
  const dupes = require('./dupes');
  app.get('/api/niches/:id/duplicates', wrap((req, res) => {
    const n = niches.get(req.params.id, { own: true });
    const g = dupes.groups(n.id).map(x => ({ keep: { id: x.keep.id, thumb: n.thumbsUrl + x.keep.id + '.jpg', url: n.filesUrl + x.keep.file, dur: x.keep.dur, res: x.keep.res, tags: x.keep.tags }, dupes: x.dupes.map(c => ({ id: c.id, thumb: n.thumbsUrl + c.id + '.jpg', url: n.filesUrl + c.file, dur: c.dur, res: c.res, tags: c.tags })) }));
    res.json({ groups: g, extra: g.reduce((s, x) => s + x.dupes.length, 0), total: n.items.length });
  }));
  app.post('/api/niches/:id/duplicates/remove', wrap((req, res) => {
    const pairs = (Array.isArray(req.body.pairs) ? req.body.pairs : []).map(p => ({ drop: String(p.drop || ''), keep: String(p.keep || '') }));
    res.json(dupes.removeAll(String(req.params.id).replace(/[^\w-]/g, ''), pairs));
  }));
  // a few words about what a niche is: helps the sorting a lot when the niche has few clips
  app.post('/api/niches/:id/about', wrap((req, res) => {
    const id = String(req.params.id).replace(/[^\w-]/g, ''), f = path.join(__dirname, '..', 'data', 'niches', id, 'niche.json');
    if (!fs.existsSync(f)) return res.status(404).json({ error: 'No such niche.' });
    const n = JSON.parse(fs.readFileSync(f, 'utf8')); n.about = String(req.body.about || '').slice(0, 400); fs.writeFileSync(f, JSON.stringify(n, null, 1)); res.json({ ok: true });
  }));
  app.get('/api/niches/:id/about', wrap((req, res) => res.json({ about: niches.get(req.params.id).about || '' })));
}
module.exports = { mount };
