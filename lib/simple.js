// "Simple" mode: one button makes every creative of a task. Per creative: voice (ElevenLabs) and avatar video (HeyGen) when the
// source says so, then analysis and render. Paid steps are listed with their cost first and run only after one confirmation.
const crypto = require('crypto');
const lifecycle = require('./lifecycle'), spend = require('./spend');

function create(ctx) {
  const { load, save, settings, creativesOf, speakers, selfUrl, taskslib } = ctx;
  const pending = new Map(), CHARS_PER_SEC = 14;
  const textOf = p => String(p.script || '').trim();
  const hasMedia = p => !!(p.presenterFile || p.voiceFile);
  const simple = p => p.simple || {};
  const busy = p => ['analyzing', 'rendering', 'queued', 'assembling'].includes(p.status);

  async function post(path, body) {
    const r = await fetch(selfUrl() + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
    return r.json();
  }
  async function getp(id) { return load(id); }
  const mark = (id, patch) => { try { const q = load(id); q.simple = { ...(q.simple || {}), ...patch, at: Date.now() }; save(q); } catch (e) { console.error('simple mark:', e.message); } };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  async function waitFor(id, cond, timeoutMs, every = 4000, tick) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) { const p = load(id); if (cond(p)) return p; if (tick) await tick(p); await sleep(every); }
    throw new Error('Timed out.');
  }

  // ---- what would "Make all" do, and what does it cost ----
  function planRow(p, opts) {
    const s = settings(), r = spend.rates(s), mode = simple(p).mode || (hasMedia(p) ? 'file' : ''), sp = simple(p).speakerId ? speakers.get(simple(p).speakerId) : null;
    const row = { id: p.id, name: p.name, no: p.creativeNo || null, mode, steps: [], blocked: '', skip: '', usd: 0 };
    if (busy(p)) { row.skip = 'Already working.'; return row; }
    if (!textOf(p)) { row.blocked = 'Add the script.'; return row; }
    if (p.segMode === 'segments') {      // several speakers: the parts are joined first, then the creative is made as usual
      const need = require('./segments').segmentReadiness(p);
      if (need.length) { row.blocked = need[0]; return row; }
      row.mode = 'segments';
      if (p.outFile && p.words && !opts.force) { row.skip = 'Already made.'; return row; }
      row.steps.push({ kind: 'assemble' }, { kind: 'make' }); return row;
    }
    if (!mode) { row.blocked = 'Choose where the voice or video comes from.'; return row; }
    if (mode === 'file' && !hasMedia(p)) { row.blocked = 'Upload the video or the voice file.'; return row; }
    if (mode === 'eleven' || mode === 'heygen') {
      if (!sp) { row.blocked = 'Choose who speaks.'; return row; }
      if (!s.elevenKey && !p.voiceFile) { row.blocked = 'Add the ElevenLabs key (Settings).'; return row; }
      if (!sp.elevenVoiceId && !p.voiceFile) { row.blocked = sp.name + ' has no ElevenLabs voice (Settings, People and voices).'; return row; }
      const chars = textOf(p).length;
      if (!p.voiceFile) { const usd = chars / 1000 * r.eleven; row.steps.push({ kind: 'eleven', chars, usd: +usd.toFixed(2) }); row.usd += usd; }
      if (mode === 'heygen' && !(p.presenterFile && p.aiAvatar)) {
        if (!s.heygenKey) { row.blocked = 'Add the HeyGen key (Settings).'; return row; }
        if (!sp.heygenAvatarId) { row.blocked = sp.name + ' has no HeyGen avatar (Settings, People and voices).'; return row; }
        const sec = Math.round(chars / CHARS_PER_SEC), usd = opts.heygenLive ? sec / 60 * r.heygen : 0;
        row.steps.push({ kind: 'heygen', seconds: sec, usd: +usd.toFixed(2), test: !opts.heygenLive }); row.usd += usd;
      }
    }
    if (p.outFile && p.words && !row.steps.length && !opts.force) { row.skip = 'Already made.'; return row; }
    row.steps.push({ kind: 'make' });
    row.usd = +row.usd.toFixed(2); return row;
  }
  function plan(taskId, opts = {}) {
    const ids = opts.ids && opts.ids.length ? new Set(opts.ids) : null;
    const rows = creativesOf(taskId).filter(p => !ids || ids.has(p.id)).map(p => planRow(p, opts));
    const todo = rows.filter(r => !r.blocked && !r.skip), usd = +todo.reduce((a, r) => a + r.usd, 0).toFixed(2);
    const paid = todo.some(r => r.steps.some(x => x.kind === 'eleven' || x.kind === 'heygen'));
    const budget = spend.check(settings().dailyBudgetUsd, usd);
    const out = { taskId, rows, todo: todo.length, paid, usd, elevenChars: todo.reduce((a, r) => a + r.steps.filter(x => x.kind === 'eleven').reduce((q, x) => q + x.chars, 0), 0), heygenSeconds: todo.reduce((a, r) => a + r.steps.filter(x => x.kind === 'heygen').reduce((q, x) => q + x.seconds, 0), 0), heygenLive: !!opts.heygenLive, budget, note: 'ElevenLabs and HeyGen costs depend on your plan: the figures use the rates from Settings.' };
    out.token = crypto.randomBytes(10).toString('hex'); pending.set(out.token, { ...out, exp: Date.now() + 15 * 60000 });
    return out;
  }

  // ---- the run ----
  const runs = new Map();
  async function makeOne(p0, row, heygenLive) {
    const id = p0.id, sp = simple(p0).speakerId ? speakers.get(simple(p0).speakerId) : null;
    for (const st of row.steps) {
      if (st.kind === 'eleven') {
        mark(id, { step: 'voice', msg: 'Making the voice…' });
        const pv = await post('/api/projects/' + id + '/eleven/preview', { voiceId: sp.elevenVoiceId }); if (pv.error) throw new Error(pv.error);
        if (pv.enough === false) throw new Error('Not enough ElevenLabs characters left (' + pv.remaining + ').');
        const g = await post('/api/projects/' + id + '/eleven/generate', { token: pv.token }); if (g.error) throw new Error(g.error);
        spend.add('elevenlabs', st.usd, p0.name);
      } else if (st.kind === 'heygen') {
        mark(id, { step: 'avatar', msg: 'Making the avatar video…' });
        const pv = await post('/api/projects/' + id + '/heygen/preview', { avatarId: sp.heygenAvatarId, test: !heygenLive }); if (pv.error) throw new Error(pv.error);
        const g = await post('/api/projects/' + id + '/heygen/generate', { token: pv.token }); if (g.error) throw new Error(g.error);
        spend.add('heygen', st.usd, p0.name);
        await waitFor(id, p => (p.heygen && p.heygen.status === 'completed' && p.presenterFile && p.aiAvatar) || (p.heygen && p.heygen.status === 'failed'), +process.env.SIMPLE_AVATAR_WAIT_MS || 25 * 60000, +process.env.SIMPLE_POLL_MS || 8000, async p => { await post('/api/projects/' + id + '/heygen/check', {}); });
        const q = load(id); if (q.heygen && q.heygen.status === 'failed') throw new Error(q.heygen.error || 'HeyGen could not make the video.');
      } else if (st.kind === 'assemble') {
        mark(id, { step: 'voice', msg: 'Joining the parts…' });
        const r = await post('/api/projects/' + id + '/segments-assemble', {}); if (r.error) throw new Error(r.error);
      } else if (st.kind === 'make') {
        mark(id, { step: 'make', msg: 'Analyzing and rendering…' });
        const q = load(id); q.autoRun = { pack: false }; save(q);
        const r = await post('/api/projects/' + id + '/analyze', { format: q.format }); if (r.error) throw new Error(r.error);
        const t0 = Date.now();
        await waitFor(id, p => Date.now() - t0 > 6000 && !busy(p), 45 * 60000, 4000);
        const done = load(id); if (done.status === 'error') throw new Error(done.error || 'The render failed.');
      }
    }
    mark(id, { step: 'done', msg: '' });
  }
  function start(token, who) {
    const pl = pending.get(token); pending.delete(token);
    if (!pl || pl.exp < Date.now()) throw new Error('The confirmation expired. Start again.');
    const b = spend.check(settings().dailyBudgetUsd, pl.usd); if (b.over) throw new Error('This would go over the daily limit ($' + b.limit + ', spent today $' + b.spent + ').');
    const todo = pl.rows.filter(r => !r.blocked && !r.skip), run = { id: pl.token, taskId: pl.taskId, status: 'running', at: Date.now(), total: todo.length, done: 0, failed: 0 };
    runs.set(run.id, run);
    todo.forEach(r => mark(r.id, { step: 'queued', msg: 'Waiting…', mode: r.mode }));
    (async () => {
      // the remote work (voices, avatars) is started for everyone first; the render of each creative follows as soon as its media is ready
      for (const r of todo) {
        try { await makeOne(load(r.id), r, pl.heygenLive); run.done++; }
        catch (e) { run.failed++; mark(r.id, { step: 'error', msg: String(e.message || e).slice(0, 200) }); console.error('simple:', r.name, e.message); }
      }
      run.status = 'done'; setTimeout(() => runs.delete(run.id), 3600000);
    })();
    return run;
  }
  const runningFor = taskId => [...runs.values()].find(r => r.taskId === taskId && r.status === 'running') || null;
  return { plan, start, runningFor, planRow };
}
module.exports = { create };
