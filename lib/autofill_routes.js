// Routes for autofill (see autofill.js): candidates to review, run now, accept / reject, daily schedule.
const express = require('express');
const autofill = require('./autofill'), { queryOf } = require('./sources_routes'), { tagsOf } = require('./sources_routes');

function mount(app, ctx) {
  const { wrap, settings, allProjects, niches } = ctx;
  app.use('/autofill-files', express.static(autofill.DIR));
  let running = false, lastMade = 0;
  const perDay = () => Math.min(20, Math.max(1, +settings().autofillPerDay || 5));

  async function runAll(nicheId) {
    if (running) return { skipped: true };
    running = true; let made = 0, error = '';
    try {
      const list = nicheId ? [nicheId] : niches.list().map(n => n.id), per = Math.max(1, Math.floor(perDay() / list.length));
      for (const id of list) { const r = await autofill.run({ nicheId: id, settings: settings(), projects: allProjects(), perRun: per, queryOf, log: m => console.error('autofill:', m) }); made += r.made; }
    } catch (e) { error = String(e.message || e).slice(0, 200); console.error('autofill:', error); }
    finally { running = false; lastMade = made; }
    return { made, error };
  }
  app.get('/api/autofill/candidates', wrap((req, res) => res.json({ items: autofill.list(req.query.niche ? String(req.query.niche) : null), ...autofill.status(), running, on: !!settings().autofillOn, perDay: perDay(), lastMade })));
  app.post('/api/autofill/run', wrap(async (req, res) => {
    const s = settings(); if (!s.pexelsKey && !s.pixabayKey) return res.status(400).json({ error: 'Add a free Pexels or Pixabay key (Settings).' });
    if (running) return res.json({ started: false, running: true });
    res.json({ started: true }); runAll(req.body.niche ? String(req.body.niche).replace(/[^\w-]/g, '') : null);
  }));
  app.post('/api/autofill/:id/accept', wrap((req, res) => { try { const c = autofill.list().find(x => x.id === req.params.id); res.json({ clip: autofill.accept(req.params.id, tagsOf(c ? c.text : '')) }); } catch (e) { res.status(400).json({ error: e.message }); } }));
  app.post('/api/autofill/:id/reject', wrap((req, res) => res.json({ ok: autofill.reject(req.params.id) })));

  // once a day (checked every hour), only when it is switched on in the overview
  const tick = () => { const s = settings(); if (s.autofillOn && (s.pexelsKey || s.pixabayKey) && Date.now() - (autofill.status().lastRun || 0) > 20 * 3600000) runAll(); };
  setTimeout(tick, 5 * 60000); const t = setInterval(tick, 3600000); t.unref && t.unref();
  return { runAll };
}
module.exports = { mount };
