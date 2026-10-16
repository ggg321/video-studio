// Routes for cutting inserts out of old videos (see harvest.js).
const fs = require('fs'), path = require('path'), express = require('express');
const harvest = require('./harvest');

function mount(app, ctx) {
  const { wrap, niches, multer, enqueue } = ctx;
  app.use('/harvest-files', express.static(harvest.DIR));
  const upload = multer({ storage: multer.diskStorage({
    destination: (req, f, cb) => { if (!req._hid) req._hid = 'h' + Date.now().toString(36) + Math.random().toString(36).slice(2, 4); const d = path.join(harvest.DIR, req._hid, 'src'); fs.mkdirSync(d, { recursive: true }); cb(null, d); },
    filename: (req, f, cb) => cb(null, Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 5) + '_' + f.originalname.replace(/[^\w.-]/g, '_'))
  }), limits: { fileSize: 3 * 1024 * 1024 * 1024 } });

  app.post('/api/harvest', upload.array('files', 40), wrap((req, res) => {
    const files = (req.files || []).map(f => ({ name: f.originalname, stored: f.filename }));
    if (!files.length) return res.status(400).json({ error: 'Choose one or more video files.' });
    const niche = niches.get(String(req.query.niche || req.body.niche || 'weight-loss').replace(/[^\w-]/g, '')).id;
    const b = harvest.create({ id: req._hid, files, niche, lang: /^[a-z]{2}$/.test(req.body.lang || '') ? req.body.lang : '', subs: req.body.subs });
    res.json({ id: b.id });
    enqueue(() => harvest.run(b.id, m => console.error(m)));
  }));
  app.get('/api/harvest', wrap((req, res) => res.json(harvest.list())));
  app.get('/api/harvest/:id', wrap((req, res) => { const b = harvest.read(req.params.id); b ? res.json(b) : res.status(404).json({ error: 'Batch not found.' }); }));
  app.post('/api/harvest/:id/add', wrap((req, res) => {
    const nid = niches.get(String(req.body.niche || 'weight-loss').replace(/[^\w-]/g, '')).id;
    const picks = (req.body.items || []).filter(x => x && x.n != null); if (!picks.length) return res.status(400).json({ error: 'Tick at least one clip.' });
    try { res.json({ added: harvest.addToLibrary(req.params.id, nid, picks) }); } catch (e) { res.status(400).json({ error: e.message }); }
  }));
  app.post('/api/harvest/:id/discard', wrap((req, res) => { harvest.discard(req.params.id); res.json({ ok: true }); }));
}
module.exports = { mount };
