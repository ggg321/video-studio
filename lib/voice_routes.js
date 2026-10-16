// ElevenLabs (voice) + HeyGen (avatar video) routes. Every paid action is two steps: /preview (what will be sent and what it uses) and
// then /generate|run with the confirmation token returned by the preview. Nothing is sent to these services before that second call.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const eleven = require('./eleven'), heygen = require('./heygen');
const { parseBlocks } = require('./script');
const { run, probe } = require('./render');

const pending = new Map();
const mint = payload => { const id = crypto.randomBytes(12).toString('hex'); pending.set(id, { payload, exp: Date.now() + 10 * 60e3 }); return id; };
const take = (id, kind) => { const e = pending.get(id); pending.delete(id); return e && e.exp > Date.now() && e.payload.kind === kind ? e.payload : null; };
const DIMS = { square: [1280, 720], square_hd: [1280, 720], vertical: [720, 1280], vertical_720: [720, 1280] };

function mount(app, c) {
  const { load, save, pdir, settings, wrap, creativesOf } = c;
  const needKey = (name, label) => { const k = settings()[name]; if (!k) { const e = new Error(label + ' API key not set (Settings).'); e.status = 400; throw e; } return k; };
  const wrapE = fn => wrap(async (req, res) => { try { await fn(req, res); } catch (e) { if (res.headersSent) return; res.status(e.status || 400).json({ error: e.message }); } });

  // ---------- ElevenLabs ----------
  let vcache = { key: '', at: 0, list: [] };
  app.get('/api/eleven/voices', wrapE(async (req, res) => {
    const key = needKey('elevenKey', 'ElevenLabs');
    if (vcache.key !== key || Date.now() - vcache.at > 10 * 60e3) vcache = { key, at: Date.now(), list: await eleven.voices(key) };
    res.json({ voices: vcache.list, models: eleven.MODELS });
  }));
  app.get('/api/eleven/subscription', wrapE(async (req, res) => res.json(await eleven.subscription(needKey('elevenKey', 'ElevenLabs')))));

  const textOf = p => parseBlocks(p.script || '').join('\n\n');
  async function remaining(key) { try { return (await eleven.subscription(key)).remaining; } catch { return null; } }
  async function writeVoice(dir, parts, outName, copy) {
    const names = parts.map((b, i) => { const n = 'tts_part_' + i + '.mp3'; fs.writeFileSync(path.join(dir, n), b); return n; });
    fs.writeFileSync(path.join(dir, 'tts_list.txt'), names.map(n => "file '" + n + "'").join('\n') + '\n');
    await run('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', 'tts_list.txt', ...(copy ? ['-c', 'copy'] : ['-ac', '1', '-ar', '44100']), outName], { cwd: dir });
    names.forEach(n => { try { fs.unlinkSync(path.join(dir, n)); } catch {} }); try { fs.unlinkSync(path.join(dir, 'tts_list.txt')); } catch {}
  }
  const opts = b => ({ model: eleven.MODELS.some(m => m.id === b.model) ? b.model : 'eleven_multilingual_v2', stability: Math.min(1, Math.max(0, +b.stability || 0.5)), similarity: Math.min(1, Math.max(0, +b.similarity || 0.75)) });

  app.post('/api/projects/:id/eleven/preview', wrapE(async (req, res) => {
    const key = needKey('elevenKey', 'ElevenLabs'), p = load(req.params.id), text = textOf(p);
    if (!text.trim()) throw new Error('The script is empty.');
    if (!req.body.voiceId) throw new Error('Choose a voice.');
    const rem = await remaining(key), o = opts(req.body);
    res.json({ chars: text.length, requests: eleven.chunkText(text).length, remaining: rem, enough: rem == null || text.length <= rem, model: o.model, start: text.slice(0, 140),
      token: mint({ kind: 'eleven', pid: p.id, voiceId: String(req.body.voiceId), ...o, chars: text.length }) });
  }));
  app.post('/api/projects/:id/eleven/generate', wrapE(async (req, res) => {
    const key = needKey('elevenKey', 'ElevenLabs'), t = take(req.body.token, 'eleven');
    if (!t || t.pid !== req.params.id) throw new Error('Confirmation expired. Run the check again.');
    const p = load(req.params.id), text = textOf(p);
    if (text.length !== t.chars) throw new Error('The script changed after the check. Run the check again.');
    const parts = await eleven.tts(key, { voiceId: t.voiceId, text, model: t.model, stability: t.stability, similarity: t.similarity });
    const dir = pdir(p.id); await writeVoice(dir, parts, 'voice.wav', false);
    const q = load(p.id); Object.assign(q, { voiceFile: 'voice.wav', voiceSource: 'elevenlabs', status: 'media', error: null, updated: Date.now() });
    delete q.words; delete q.cuts; try { fs.unlinkSync(path.join(dir, 'waveform.json')); } catch {}
    save(q); res.json({ ok: true, chars: t.chars, seconds: +(await probe(path.join(dir, 'voice.wav'))).toFixed(1) });
  }));
  // one voice per segment (the voice id is stored on the speaker)
  const segTargets = p => parseBlocks(p.script || '').map((text, i) => { const sp = require('./segments').speakerOf(p, i); return { i, text, voiceId: sp && sp.elevenVoiceId, speaker: sp && sp.name }; });
  app.post('/api/projects/:id/eleven/segments-preview', wrapE(async (req, res) => {
    const key = needKey('elevenKey', 'ElevenLabs'), p = load(req.params.id), all = segTargets(p), ok = all.filter(x => x.voiceId), o = opts(req.body);
    if (!ok.length) throw new Error('No segment has a speaker with an ElevenLabs voice (Speakers page).');
    const chars = ok.reduce((a, x) => a + x.text.length, 0), rem = await remaining(key);
    res.json({ segments: ok.length, skipped: all.filter(x => !x.voiceId).map(x => x.i + 1), chars, remaining: rem, enough: rem == null || chars <= rem, model: o.model,
      token: mint({ kind: 'eleven-seg', pid: p.id, ...o, chars, idx: ok.map(x => x.i) }) });
  }));
  app.post('/api/projects/:id/eleven/segments-generate', wrapE(async (req, res) => {
    const key = needKey('elevenKey', 'ElevenLabs'), t = take(req.body.token, 'eleven-seg');
    if (!t || t.pid !== req.params.id) throw new Error('Confirmation expired. Run the check again.');
    const p = load(req.params.id), all = segTargets(p), dir = pdir(p.id); let done = 0;
    for (const i of t.idx) {
      const s = all[i]; if (!s || !s.voiceId) continue;
      const parts = await eleven.tts(key, { voiceId: s.voiceId, text: s.text, model: t.model, stability: t.stability, similarity: t.similarity });
      await writeVoice(dir, parts, 'seg' + i + '_voice.mp3', true);
      const q = load(p.id); q.seg = q.seg || []; (q.seg[i] = q.seg[i] || {}).voiceFile = 'seg' + i + '_voice.mp3'; q.updated = Date.now(); save(q); done++;
    }
    res.json({ ok: true, generated: done, chars: t.chars });
  }));

  // ---------- HeyGen ----------
  let acache = { key: '', at: 0, list: [] };
  app.get('/api/heygen/avatars', wrapE(async (req, res) => {
    const key = needKey('heygenKey', 'HeyGen');
    if (acache.key !== key || Date.now() - acache.at > 10 * 60e3) acache = { key, at: Date.now(), list: await heygen.avatars(key) };
    res.json({ avatars: acache.list, quota: await heygen.quota(key) });
  }));
  async function startVideo(key, p, avatarId, test) {
    const dir = pdir(p.id), mp3 = path.join(dir, 'heygen_audio.mp3');
    await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', path.join(dir, p.voiceFile), '-ac', '1', '-ar', '44100', '-b:a', '128k', mp3]);
    const assetId = await heygen.uploadAudio(key, fs.readFileSync(mp3), 'audio/mpeg');
    const [w, h] = DIMS[p.format] || DIMS.square;
    const videoId = await heygen.generate(key, { avatarId, assetId, width: w, height: h, test, title: p.name });
    const q = load(p.id); q.heygen = { videoId, status: 'processing', test: !!test, avatarId, startedAt: Date.now(), error: null }; q.updated = Date.now(); save(q);
    try { fs.unlinkSync(mp3); } catch {}
    return videoId;
  }
  app.post('/api/projects/:id/heygen/preview', wrapE(async (req, res) => {
    const key = needKey('heygenKey', 'HeyGen'), p = load(req.params.id);
    if (!p.voiceFile) throw new Error('This creative has no voice yet. Add a voice file or generate one with ElevenLabs first.');
    if (!req.body.avatarId) throw new Error('Choose an avatar.');
    if (p.heygen && ['processing', 'pending', 'waiting'].includes(p.heygen.status)) throw new Error('A HeyGen video is already being generated for this creative.');
    const sec = await probe(path.join(pdir(p.id), p.voiceFile)), test = req.body.test !== false;
    res.json({ seconds: +sec.toFixed(1), test, replaces: !!p.presenterFile, quota: await heygen.quota(key), dims: (DIMS[p.format] || DIMS.square).join('×'),
      token: mint({ kind: 'heygen', pid: p.id, avatarId: String(req.body.avatarId), test }) });
  }));
  app.post('/api/projects/:id/heygen/generate', wrapE(async (req, res) => {
    const key = needKey('heygenKey', 'HeyGen'), t = take(req.body.token, 'heygen');
    if (!t || t.pid !== req.params.id) throw new Error('Confirmation expired. Run the check again.');
    const videoId = await startVideo(key, load(req.params.id), t.avatarId, t.test);
    res.json({ ok: true, videoId, test: t.test });
  }));
  app.post('/api/projects/:id/heygen/check', wrapE(async (req, res) => { await pollOne(load(req.params.id)); res.json(load(req.params.id).heygen || null); }));
  // batch for a task: one check, one confirmation for the whole task
  const eligible = (tid, force) => creativesOf(tid).filter(p => p.voiceFile && (force || !p.presenterFile) && !(p.heygen && ['processing', 'pending', 'waiting'].includes(p.heygen.status)));
  app.post('/api/tasks/:id/heygen/preview', wrapE(async (req, res) => {
    const key = needKey('heygenKey', 'HeyGen'); if (!req.body.avatarId) throw new Error('Choose an avatar.');
    const list = eligible(req.params.id, !!req.body.force), test = req.body.test !== false;
    if (!list.length) throw new Error('No creative is ready: each needs a voice and no avatar video yet.');
    let total = 0; const items = [];
    for (const p of list) { const s = await probe(path.join(pdir(p.id), p.voiceFile)); total += s; items.push({ id: p.id, name: p.name, seconds: +s.toFixed(1), replaces: !!p.presenterFile }); }
    res.json({ items, totalSeconds: +total.toFixed(1), test, quota: await heygen.quota(key), token: mint({ kind: 'heygen-task', tid: req.params.id, avatarId: String(req.body.avatarId), test, force: !!req.body.force, ids: items.map(x => x.id) }) });
  }));
  app.post('/api/tasks/:id/heygen/run', wrapE(async (req, res) => {
    const key = needKey('heygenKey', 'HeyGen'), t = take(req.body.token, 'heygen-task');
    if (!t || t.tid !== req.params.id) throw new Error('Confirmation expired. Run the check again.');
    const started = [], failed = [];
    for (const id of t.ids) { const p = load(id); try { await startVideo(key, p, t.avatarId, t.test); started.push(p.name); } catch (e) { failed.push({ name: p.name, why: e.message }); } }
    res.json({ started, failed, test: t.test });
  }));

  // background poller: finished videos are downloaded and become the creative's presenter video
  async function pollOne(p) {
    const key = settings().heygenKey, h = p.heygen;
    if (!key || !h || !['processing', 'pending', 'waiting'].includes(h.status)) return;
    const s = await heygen.status(key, h.videoId), q = load(p.id);
    if (s.status === 'completed' && s.url) {
      const dir = pdir(p.id), file = 'heygen_' + h.videoId + '.mp4';
      fs.writeFileSync(path.join(dir, file), await heygen.download(s.url)); fs.copyFileSync(path.join(dir, file), path.join(dir, 'presenter.mp4'));
      q.heygen = { ...h, status: 'completed', file, doneAt: Date.now() }; q.presenterFile = 'presenter.mp4'; q.aiAvatar = true;
      if (!['analyzing', 'rendering', 'queued', 'assembling'].includes(q.status)) q.status = q.words ? 'planned' : 'media';
      for (const f of fs.readdirSync(dir)) if (/^preview_.*\.jpg$/.test(f)) { try { fs.unlinkSync(path.join(dir, f)); } catch {} }
    } else if (s.status === 'failed') q.heygen = { ...h, status: 'failed', error: s.error || 'HeyGen could not generate the video.' };
    else q.heygen = { ...h, status: s.status || h.status };
    q.updated = Date.now(); save(q);
  }
  async function pollAll() {
    if (!settings().heygenKey) return;
    for (const d of fs.readdirSync(c.PROJ)) { try { const p = load(d); if (p.heygen && ['processing', 'pending', 'waiting'].includes(p.heygen.status)) await pollOne(p); } catch (e) { console.error('heygen poll', d, e.message); } }
  }
  setInterval(() => pollAll().catch(() => {}), +process.env.HEYGEN_POLL_MS || 20000);
}
module.exports = { mount };
