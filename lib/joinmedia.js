// Several separate videos of the speaker -> one speaker video of the creative (in the order given). The rest of the pipeline sees one normal video.
const fs = require('fs'), path = require('path');
const { spawnSync } = require('child_process');
const { run, probe } = require('./render');

const hasAudio = f => /audio/.test(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type', '-of', 'csv=p=0', f], { encoding: 'utf8' }).stdout || '');
const size = f => { const r = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height:stream_side_data=rotation', '-of', 'json', f], { encoding: 'utf8' }); try { const s = JSON.parse(r.stdout).streams[0]; const rot = Math.abs(+((s.side_data_list || [])[0] || {}).rotation || 0); return rot === 90 ? [s.height, s.width] : [s.width, s.height]; } catch { return [0, 0]; } };
const even = n => Math.max(2, Math.round(n / 2) * 2);

// parts: [{ file (absolute), name }]; dir: project folder. onStep(i, total) is called after every part. Returns { file, parts:[{name,start,end}], duration }.
async function join(dir, parts, onStep) {
  let [W, H] = size(parts[0].file);
  if (!W || !H) throw new Error('The first video cannot be read.');
  const k = Math.min(1, 1920 / Math.max(W, H)); W = even(W * k); H = even(H * k);     // the first video sets the size; the others are fitted into it without cropping
  const work = path.join(dir, 'join_tmp'); fs.rmSync(work, { recursive: true, force: true }); fs.mkdirSync(work, { recursive: true });
  const list = [], info = []; let t = 0;
  for (let i = 0; i < parts.length; i++) {
    const src = parts[i].file, out = path.join(work, `p${i}.mp4`), withA = hasAudio(src), d0 = await probe(src);
    if (!(d0 > 0.2)) throw new Error(`Video ${i + 1} (${parts[i].name}) is empty or cannot be read.`);
    const vf = `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:black,fps=30,format=yuv420p,setsar=1`;
    const args = ['-y', '-loglevel', 'error', '-i', src, ...(withA ? [] : ['-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono']), '-map', '0:v:0', '-map', withA ? '0:a:0' : '1:a:0', '-vf', vf,
      '-af', 'aresample=44100', '-ac', '1', '-t', d0.toFixed(3), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-c:a', 'aac', '-ar', '44100', '-b:a', '160k', out];
    await run('ffmpeg', args);
    const d = await probe(out);
    info.push({ name: parts[i].name, start: +t.toFixed(2), end: +(t + d).toFixed(2) }); t += d;
    list.push(`file 'p${i}.mp4'`);
    onStep && onStep(i + 1, parts.length);
  }
  fs.writeFileSync(path.join(work, 'list.txt'), list.join('\n') + '\n');
  const final = path.join(dir, 'presenter.mp4');
  await run('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', path.join(work, 'list.txt'), '-c', 'copy', '-movflags', '+faststart', final]);
  fs.rmSync(work, { recursive: true, force: true });
  return { file: 'presenter.mp4', parts: info, duration: +t.toFixed(2) };
}

function mount(app, ctx) {
  const { wrap, load, save, pdir, multer, enqueueJob } = ctx;
  const up = multer({ storage: multer.diskStorage({
    destination: (req, f, cb) => { const d = path.join(pdir(req.params.id), 'parts'); fs.mkdirSync(d, { recursive: true }); cb(null, d); },
    filename: (req, f, cb) => cb(null, Date.now().toString(36) + Math.random().toString(36).slice(2, 5) + '_' + String(f.originalname).replace(/[^\w.-]/g, '_')) }), limits: { fileSize: 4e9 } });
  app.post('/api/projects/:id/media-join', up.array('parts', 30), wrap((req, res) => {
    const p = load(req.params.id), dir = pdir(p.id), files = req.files || [];
    if (files.length < 2) return res.status(400).json({ error: 'Choose two or more videos.' });
    p.join = { status: 'running', done: 0, total: files.length, error: '' }; save(p);
    res.json({ started: true, total: files.length });
    const parts = files.map(f => ({ file: f.path, name: f.originalname }));
    enqueueJob('join', p.id, async () => {
      try {
        const r = await join(dir, parts, (i, n) => { const q = load(p.id); q.join = { ...q.join, done: i, total: n }; save(q); });
        const q = load(p.id);
        q.presenterFile = r.file; delete q.voiceFile; q.status = 'media'; q.updated = Date.now(); q.duration = r.duration;
        q.joinParts = r.parts; q.join = { status: 'done', done: files.length, total: files.length, error: '' }; save(q);
      } catch (e) { console.error('join:', e.message); const q = load(p.id); q.join = { status: 'error', done: 0, total: files.length, error: e.message }; save(q); }
      finally { try { fs.rmSync(path.join(dir, 'parts'), { recursive: true, force: true }); fs.rmSync(path.join(dir, 'join_tmp'), { recursive: true, force: true }); } catch {} }
    });
  }));
  app.get('/api/projects/:id/join', wrap((req, res) => { const p = load(req.params.id); res.json({ join: p.join || null, parts: p.joinParts || [] }); }));
}
module.exports = { mount, join };
