// Team workflow: the life of a creative (work / review / changes / approved), notices (bell), buyer comments from Asana.
const lifecycle = require('./lifecycle'), notices = require('./notices'), { scriptFrom } = require('./asana_watch');

function mount(app, ctx) {
  const { load, save, wrap, settings, allProjects, taskslib, tg, watcher } = ctx;
  const lifeView = (p, days) => { const l = lifecycle.get(p); return { state: l.state, since: l.since, handedAt: l.handedAt || null, daysLeft: lifecycle.daysLeft(p, days), history: (l.history || []).slice(-30).reverse() }; };

  app.get('/api/projects/:id/life', wrap((req, res) => res.json(lifeView(load(req.params.id), +settings().autoApproveDays || 0))));
  app.post('/api/projects/:id/life', wrap((req, res) => {
    const p = load(req.params.id), to = String(req.body.state || '');
    if (!lifecycle.STATES.includes(to)) return res.status(400).json({ error: 'Unknown state.' });
    lifecycle.setState(p, to, { by: req.body.by, note: req.body.note });
    p.updated = Date.now(); save(p); res.json(lifeView(p, +settings().autoApproveDays || 0));
  }));
  // a note on the creative without changing its state
  app.post('/api/projects/:id/life/comment', wrap((req, res) => {
    const text = String(req.body.text || '').trim(); if (!text) return res.status(400).json({ error: 'Write a note first.' });
    const p = load(req.params.id); lifecycle.addComment(p, { by: req.body.by, text, source: 'manual' }); save(p); res.json(lifeView(p, +settings().autoApproveDays || 0));
  }));

  // ---- notices (bell) ----
  app.get('/api/notices', wrap((req, res) => res.json({ items: notices.list({ unread: req.query.unread === '1', limit: 60 }), ...notices.counts() })));
  app.get('/api/notices/count', wrap((req, res) => res.json(notices.counts())));
  app.post('/api/notices/read-all', wrap((req, res) => { notices.readAll(); res.json(notices.counts()); }));
  app.post('/api/notices/:id/act', wrap((req, res) => {
    const n = notices.get(req.params.id); if (!n) return res.status(404).json({ error: 'Notice not found.' });
    const act = String(req.body.action || ''), cid = req.body.creativeId ? String(req.body.creativeId) : '';
    if (act === 'dismiss') { notices.patch(n.id, { state: 'dismissed', read: true }); return res.json({ ok: true, ...notices.counts() }); }
    if (!['edit', 'material'].includes(act)) return res.status(400).json({ error: 'Unknown action.' });
    const task = n.taskId ? taskslib.get(n.taskId) : null;
    const targets = cid ? [cid] : (n.creatives || []).map(x => x.id);
    if (!targets.length) return res.status(400).json({ error: 'Choose a creative.' });
    if (act === 'material' && targets.length !== 1) return res.status(400).json({ error: 'Choose the creative that gets this text.' });
    const done = [];
    for (const id of targets) {
      const p = load(id);
      if (act === 'edit') { lifecycle.addComment(p, { by: n.by, text: n.text, source: n.kind }); lifecycle.setState(p, 'changes', { by: n.by, note: n.text.slice(0, 200) }); }
      else {
        if ((p.script || '').trim() && !req.body.force) return res.status(409).json({ error: 'This creative already has a script. Replace it?', needsForce: true });
        p.script = scriptFrom(n.text); lifecycle.addComment(p, { by: n.by, text: 'Script taken from the comment.', source: n.kind });
        delete p.words; delete p.cuts; if (p.status === 'planned' || p.status === 'done') p.status = (p.presenterFile || p.voiceFile) ? 'media' : 'draft';
      }
      p.updated = Date.now(); save(p); done.push(id);
    }
    notices.patch(n.id, { state: act, read: true, creativeIds: done });
    res.json({ ok: true, done, task: task ? task.title : '', ...notices.counts() });
  }));
  app.post('/api/asana/check-now', wrap(async (req, res) => res.json(await watcher.runOnce())));
  app.get('/api/asana/watch', wrap((req, res) => res.json({ ...watcher.status(), enabled: !!settings().asanaToken && settings().asanaWatch !== false })));

  // ---- automatic approval after N quiet days (off by default) ----
  function autoApprove() {
    const days = +settings().autoApproveDays || 0; if (!days) return 0;
    let n = 0;
    for (const p0 of allProjects()) {
      if (!lifecycle.due(p0, days)) continue;
      const p = load(p0.id); lifecycle.setState(p, 'approved', { auto: true, by: 'auto', note: days + ' days without edits' }); p.updated = Date.now(); save(p); n++;
      notices.add({ kind: 'auto-approved', key: 'auto:' + p.id + ':' + (p.life.since), taskId: p.taskId || null, taskTitle: p.name, text: p.name, state: 'info', creatives: [{ id: p.id, no: p.creativeNo || null, name: p.name }] });
      tg.autoApproved({ name: p.name, days });
    }
    return n;
  }
  setTimeout(autoApprove, 60000); const t = setInterval(autoApprove, 15 * 60000); t.unref && t.unref();
  app.post('/api/life/auto-approve-now', wrap((req, res) => res.json({ approved: autoApprove() })));
  return { autoApprove };
}
module.exports = { mount };
