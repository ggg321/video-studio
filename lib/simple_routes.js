// Routes for the Simple mode screen: the board of a task, creating a task with N empty creatives, the source of each creative,
// the plan (what "Make all" would do and cost) and the run.
const lifecycle = require('./lifecycle'), spend = require('./spend');

function mount(app, ctx) {
  const { wrap, load, save, settings, creativesOf, taskslib, speakers, niches, simple, newProject } = ctx;
  const kindOf = p => (p.presenterFile ? (p.aiAvatar ? 'avatar video' : 'video') : p.voiceFile ? 'voice' : null);
  // a script of several speakers ("Speaker 1:", "Спикер 2:"): who is who, and the video of each part
  const sgm = require('./segments'), scr = require('./script');
  function segsOf(p) {
    const ex = scr.parseBlocksEx(p.script || '');
    if (!ex.some(b => b.label)) return null;
    const labels = [...new Set(ex.map(b => b.label).filter(Boolean))];
    return {
      on: p.segMode === 'segments', labels: labels.map(l => ({ label: l, speakerId: ((p.speakerMap || {})[l]) || ((speakers.list().find(s => String(s.name || '').toLowerCase().replace(/\s+/g, ' ').trim() === l)) || {}).id || '' })),
      blocks: ex.map((b, i) => { const sp = sgm.speakerOf(p, i, ex), o = (p.seg || [])[i] || {}; return { i, label: b.label, text: b.text.slice(0, 70), speaker: sp ? sp.name : '', own: !!o.videoFile, def: !!(sp && sp.videoFile) }; }),
      problems: sgm.segmentReadiness(p)
    };
  }
  function row(p) {
    const sm = taskslib.summarize(p), s = p.simple || {}, hook = (p.cuts || []).find(c => c.hook), pl = simple.planRow(p, {}), cards = (p.cuts || []).filter(c => c.clip === 'card').length;
    return {
      id: p.id, no: p.creativeNo || null, name: p.name, script: p.script || '', mode: s.mode || '', speakerId: s.speakerId || '', media: kindOf(p), status: p.status, progress: p.progress || 0,
      step: s.step || '', stepMsg: s.msg || '', pipeline: sm.state, life: lifecycle.state(p), daysLeft: lifecycle.daysLeft(p, +settings().autoApproveDays || 0),
      outFile: p.outFile || null, rendered: p.rendered || null, duration: p.duration || null, format: p.format, error: p.status === 'error' ? p.error : '', qc: p.qcPost ? p.qcPost.status : null,
      heygen: p.heygen ? p.heygen.status : null, blocked: pl.blocked, skip: pl.skip,
      transition: p.transition || 'fade', transDur: p.transDur || 0.35,
      cuts: (p.cuts || []).map((c, i) => ({ i, start: +c.start.toFixed(1), end: +c.end.toFixed(1), kind: c.hook ? 'hook' : c.clip === 'card' ? 'card' : c.clip === 'stock' ? 'stock' : 'clip', text: String(c.text || c.card || '').slice(0, 60), tr: c.tr || '' })),
      chips: { hook: hook ? { clip: hook.clip, dur: +(hook.end - hook.start).toFixed(1) } : null, music: (p.audio && p.audio.music) || null, subStyle: p.subStyle || 'classic', hfCaption: p.hfCaption || '', cardsOn: p.cardsOn !== false, cards, inserts: (p.cuts || []).filter(c => c.clip !== 'card' && !c.hook).length },
      changed: !!s.changed, analyzed: !!(p.cuts && p.words), reference: p.reference || '', libs: p.libs === 'all' ? 'all' : '', wrap: require('./wrap').settingsOf(p), segs: segsOf(p)
    };
  }
  app.get('/api/simple/board', wrap((req, res) => {
    const t = taskslib.get(String(req.query.task || '')); if (!t) return res.status(404).json({ error: 'Task not found.' });
    const st = settings();
    res.json({
      task: { id: t.id, title: t.title, niche: t.niche || 'weight-loss', format: t.format || '' },
      speakers: speakers.list().map(s => ({ id: s.id, name: s.name, color: s.color, voice: !!s.elevenVoiceId, avatar: !!s.heygenAvatarId })),
      keys: { eleven: !!st.elevenKey, heygen: !!st.heygenKey }, run: simple.runningFor(t.id), spentToday: spend.today(), limit: +st.dailyBudgetUsd || 0,
      creatives: creativesOf(t.id).map(row)
    });
  }));
  // a new task with N empty creatives (the preset of the niche is applied to each)
  app.post('/api/simple/tasks', wrap((req, res) => {
    const nid = niches.get(String(req.body.niche || 'weight-loss').replace(/[^\w-]/g, '')).id, n = Math.min(12, Math.max(1, Math.round(+req.body.count || 4)));
    const t = taskslib.upsert({ title: String(req.body.title || 'New task').slice(0, 120), niche: nid, format: String(req.body.format || ''), source: 'simple' });
    for (let i = 0; i < n; i++) newProject('Creative ' + (i + 1), '', t);
    res.json({ id: t.id });
  }));
  app.post('/api/simple/creatives', wrap((req, res) => {
    const t = taskslib.get(String(req.body.task || '')); if (!t) return res.status(404).json({ error: 'Task not found.' });
    const p = newProject('Creative ' + (creativesOf(t.id).length + 1), '', t); res.json({ id: p.id });
  }));
  app.post('/api/simple/source', wrap((req, res) => {
    const p = load(req.body.id), mode = ['file', 'eleven', 'heygen', ''].includes(req.body.mode) ? req.body.mode : '';
    p.simple = { ...(p.simple || {}), mode, speakerId: String(req.body.speakerId || ''), changed: false }; p.updated = Date.now(); save(p); res.json(row(p));
  }));
  app.post('/api/simple/plan', wrap((req, res) => res.json(simple.plan(String(req.body.taskId || ''), { ids: req.body.ids, heygenLive: !!req.body.heygenLive, force: !!req.body.force }))));
  app.post('/api/simple/run', wrap((req, res) => { try { res.json(simple.start(String(req.body.token || ''))); } catch (e) { res.status(400).json({ error: e.message }); } }));
  // the transition of one insert (empty = the one of the whole video)
  app.post('/api/simple/cut-tr', wrap((req, res) => {
    const p = load(req.body.id), i = +req.body.i, c = (p.cuts || [])[i], tr = String(req.body.tr || '');
    if (!c) return res.status(404).json({ error: 'No such insert.' });
    if (tr && !require('./fx').valid(tr)) return res.status(400).json({ error: 'No such transition.' });
    if (tr) c.tr = tr; else delete c.tr;
    p.simple = { ...(p.simple || {}), changed: true }; p.updated = Date.now(); save(p); res.json({ ok: true });
  }));
  app.post('/api/simple/changed', wrap((req, res) => { const p = load(req.body.id); p.simple = { ...(p.simple || {}), changed: !!req.body.changed }; save(p); res.json({ ok: true }); }));
}
module.exports = { mount };
