// Keeping Video Studio healthy 24/7: status, disk clean-up, backups (with rotation), autostart, and a quiet scheduler.
// Never touches: finished videos, exports, source media, the library clips, project.json. Only regenerable leftovers are cleaned.
const fs = require('fs'), path = require('path'), { spawn, execFile } = require('child_process');

const DEFAULTS = { autoBackup: true, backupKeep: 7, backupDir: '', includeKeys: false, includeRenders: false, includeLibrary: false, autoClean: true };
const TAR = fs.existsSync('C:\\Windows\\System32\\tar.exe') ? 'C:\\Windows\\System32\\tar.exe' : 'tar';
const fmtStamp = d => { const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`; };
const KEYS = ['openaiKey', 'pexelsKey', 'pixabayKey', 'asanaToken', 'googleKey', 'elevenKey', 'heygenKey'];

function create(ctx) {
  const { ROOT, PROJ, SETTINGS, jobs, allProjects, recovery } = ctx, hooks = ctx.hooks || {};
  const STATE = path.join(ROOT, 'data', 'maint.json'), LOG = path.join(ROOT, 'data', 'server.log');
  const started = Date.now();
  const rd = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
  const state = () => rd(STATE, { events: [] });
  const saveState = s => { try { fs.writeFileSync(STATE, JSON.stringify(s, null, 1)); } catch {} };
  const event = (kind, text) => { const s = state(); s.events = [{ at: Date.now(), kind, text }, ...(s.events || [])].slice(0, 40); saveState(s); };
  const cfg = () => ({ ...DEFAULTS, ...(rd(SETTINGS, {}).maint || {}) });
  const setCfg = patch => {
    const s = rd(SETTINGS, {}), m = { ...DEFAULTS, ...(s.maint || {}) };
    for (const k of Object.keys(DEFAULTS)) if (patch[k] !== undefined) m[k] = typeof DEFAULTS[k] === 'boolean' ? !!patch[k] : typeof DEFAULTS[k] === 'number' ? Math.min(60, Math.max(1, Math.round(+patch[k]) || DEFAULTS[k])) : String(patch[k]).trim();
    s.maint = m; fs.writeFileSync(SETTINGS, JSON.stringify(s)); return m;
  };
  const backupDir = () => { const d = cfg().backupDir; return d ? path.resolve(d) : path.join(ROOT, 'backups'); };

  // ---------- sizes ----------
  async function dirSize(dir, skip) {
    let total = 0;
    const walk = async d => {
      let ents; try { ents = await fs.promises.readdir(d, { withFileTypes: true }); } catch { return; }
      for (const e of ents) {
        const f = path.join(d, e.name);
        if (e.isDirectory()) { if (!(skip && skip(f))) await walk(f); }
        else { try { total += (await fs.promises.stat(f)).size; } catch {} }
      }
    };
    await walk(dir); return total;
  }
  let sizeCache = null;
  async function sizes(force) {
    if (!force && sizeCache && Date.now() - sizeCache.at < 120000) return sizeCache.v;
    const v = {
      projects: await dirSize(PROJ), exports: await dirSize(path.join(ROOT, 'exports')), library: await dirSize(path.join(ROOT, 'library')),
      niches: await dirSize(path.join(ROOT, 'data', 'niches')), backups: await dirSize(backupDir()), tools: await dirSize(path.join(ROOT, 'tools'))
    };
    sizeCache = { at: Date.now(), v }; return v;
  }
  function disk() {
    try { const s = fs.statfsSync(ROOT); return { free: s.bavail * s.bsize, total: s.blocks * s.bsize }; } catch { return { free: null, total: null }; }
  }

  // ---------- clean-up ----------
  const busyStatus = ['analyzing', 'rendering', 'queued', 'assembling'];
  function cleanScan() {
    const cats = {
      temp: { id: 'temp', label: 'Temporary work files of projects', note: 'Audio for analysis, filter scripts, previews, waveforms. Rebuilt automatically when needed.', files: [], bytes: 0 },
      upscale: { id: 'upscale', label: 'Cached AI upscales of old projects', note: 'Finished projects not touched for 14 days. Recreated only if you render with AI upscale again.', files: [], bytes: 0 },
      installers: { id: 'installers', label: 'Downloaded installers', note: 'Archives that were used to install the tools.', files: [], bytes: 0 },
      log: { id: 'log', label: 'Old server log', note: 'The log is cut to its last part.', files: [], bytes: 0 },
      backups: { id: 'backups', label: 'Old backups', note: 'Only copies beyond the number you keep.', files: [], bytes: 0 }
    };
    const add = (c, f) => { try { const st = fs.statSync(f); const sz = st.isDirectory() ? dirSizeSync(f) : st.size; c.files.push(f); c.bytes += sz; } catch {} };
    const dirSizeSync = d => { let t = 0; for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); t += e.isDirectory() ? dirSizeSync(f) : fs.statSync(f).size; } return t; };
    let projects = []; try { projects = allProjects(); } catch {}
    for (const p of projects) {
      if (busyStatus.includes(p.status)) continue;
      const dir = path.join(PROJ, p.id.replace(/[^\w-]/g, ''));
      let names = []; try { names = fs.readdirSync(dir); } catch { continue; }
      for (const n of names) if (/^(ana\.wav|filter\.txt|preview\.mp4|preview_.*\.jpg|band_[0-9a-f]+\.png|ov_[0-9a-f]+\.png(\.json)?|waveform\.json|frames_in|frames_out)$/.test(n)) add(cats.temp, path.join(dir, n));
      if (names.includes('presenter_up.mp4') && p.status === 'done' && Date.now() - (p.updated || 0) > 14 * 864e5) add(cats.upscale, path.join(dir, 'presenter_up.mp4'));
    }
    const dl = path.join(ROOT, 'data', 'dl'); try { for (const n of fs.readdirSync(dl)) add(cats.installers, path.join(dl, n)); } catch {}
    try { const st = fs.statSync(LOG); if (st.size > 2 * 1024 * 1024) { cats.log.files.push(LOG); cats.log.bytes = st.size - 400 * 1024; } } catch {}
    for (const f of oldBackups()) add(cats.backups, f);
    return Object.values(cats);
  }
  function cleanRun(ids) {
    const want = new Set(ids), freed = { total: 0, files: 0 };
    for (const c of cleanScan()) {
      if (!want.has(c.id)) continue;
      if (c.id === 'log') { try { const b = fs.readFileSync(LOG); fs.writeFileSync(LOG, b.subarray(Math.max(0, b.length - 400 * 1024))); freed.total += c.bytes; } catch {} continue; }
      for (const f of c.files) { try { fs.rmSync(f, { recursive: true, force: true }); freed.files++; } catch {} }
      freed.total += c.bytes;
    }
    sizeCache = null;
    const s = state(); s.lastClean = { at: Date.now(), freed: freed.total }; saveState(s);
    event('clean', `Freed ${(freed.total / 1048576).toFixed(0)} MB`);
    return freed;
  }

  // ---------- backups ----------
  const BK = /^VideoStudio-\d{8}-\d{6}(-[a-z-]+)?\.zip$/;
  function listBackups() {
    const d = backupDir(); let l = [];
    try { l = fs.readdirSync(d).filter(n => BK.test(n)).map(n => { const st = fs.statSync(path.join(d, n)); return { name: n, size: st.size, at: st.mtimeMs }; }); } catch {}
    return l.sort((a, b) => b.at - a.at);
  }
  const oldBackups = () => listBackups().slice(cfg().backupKeep).map(b => path.join(backupDir(), b.name));
  function runTar(args) {
    return new Promise((res, rej) => { const p = spawn(TAR, args, { cwd: ROOT }); let err = ''; p.stderr.on('data', d => err += d); p.on('error', rej); p.on('close', c => c === 0 ? res() : rej(new Error('tar exit ' + c + ' ' + err.slice(-300)))); });
  }
  const rel = f => path.relative(ROOT, f).split(path.sep).join('/');
  function backupFiles(o) {
    const out = [], push = f => { try { if (fs.existsSync(f)) out.push(rel(f)); } catch {} };
    const data = path.join(ROOT, 'data');
    for (const n of fs.readdirSync(data)) { const f = path.join(data, n); if (/^(tasks|speakers)\.json$/.test(n)) push(f); }
    push(path.join(data, 'niches')); push(path.join(data, 'dreamface', 'queue.json')); push(path.join(ROOT, 'fonts'));
    if (o.includeLibrary) push(path.join(ROOT, 'library'));
    let ps = []; try { ps = fs.readdirSync(PROJ); } catch {}
    for (const id of ps) {
      const dir = path.join(PROJ, id); let names = []; try { names = fs.readdirSync(dir); } catch { continue; }
      for (const n of names) {
        if (/^(project|transcript|lipsync|qc_report)\.json$/.test(n) || /^(presenter|voice|voice_in|seg\d+_(video|voice))\./.test(n) || n === 'subs.ass' || (o.includeRenders && (n === 'stock' || /^out.*\.mp4$/.test(n)))) push(path.join(dir, n));
      }
    }
    return out;
  }
  async function createBackup(tag) {
    const o = cfg(), dir = backupDir(); fs.mkdirSync(dir, { recursive: true });
    const name = `VideoStudio-${fmtStamp(new Date())}${tag ? '-' + tag : ''}.zip`, out = path.join(dir, name);
    const tmp = path.join(ROOT, 'data', '_bk'); fs.rmSync(tmp, { recursive: true, force: true }); fs.mkdirSync(tmp, { recursive: true });
    const s = rd(SETTINGS, {}); if (!o.includeKeys) for (const k of KEYS) delete s[k];
    fs.writeFileSync(path.join(tmp, 'settings.json'), JSON.stringify(s));
    const list = path.join(tmp, 'list.txt'); fs.writeFileSync(list, ['data/_bk/settings.json', ...backupFiles(o)].join('\n') + '\n');
    try {
      await runTar(['-a', '-c', '-f', out, '-T', list]);
      await runTar(['-t', '-f', out]);                                       // the archive must be readable
    } catch (e) { try { fs.rmSync(out, { force: true }); } catch {} throw e; }
    finally { fs.rmSync(tmp, { recursive: true, force: true }); }
    const size = fs.statSync(out).size, st = state(); st.lastBackup = { name, at: Date.now(), size, keys: o.includeKeys }; saveState(st);
    event('backup', `${name} (${(size / 1048576).toFixed(0)} MB)`);
    for (const f of oldBackups()) { try { fs.rmSync(f, { force: true }); } catch {} }
    sizeCache = null;
    return { name, size, dir };
  }
  async function restore(name) {
    if (!BK.test(name)) throw new Error('Not a backup file.');
    const file = path.join(backupDir(), name); if (!fs.existsSync(file)) throw new Error('Backup file not found.');
    if (jobs.running() || jobs.waiting()) throw new Error('Jobs are running. Wait until the queue is empty.');
    await createBackup('before-restore');
    const cur = rd(SETTINGS, {});
    await runTar(['-x', '-f', file, '-C', ROOT]);
    const staged = path.join(ROOT, 'data', '_bk'), back = rd(path.join(staged, 'settings.json'), rd(SETTINGS, {}));   // settings travel inside the archive; keep today's keys if the backup had none
    fs.rmSync(staged, { recursive: true, force: true });
    for (const k of KEYS) if (!back[k] && cur[k]) back[k] = cur[k];
    fs.writeFileSync(SETTINGS, JSON.stringify(back));
    event('restore', name); sizeCache = null;
    return { ok: true };
  }

  // ---------- autostart (Windows Task Scheduler, current user, no admin) ----------
  const ex = (cmd, args, ms = 15000) => new Promise(res => execFile(cmd, args, { timeout: ms, windowsHide: true }, (e, so, se) => res({ ok: !e, out: String(so || '') + String(se || '') })));
  async function autostart() { return process.platform === 'win32' && (await ex('schtasks', ['/query', '/tn', 'VideoStudio'])).ok; }
  async function setAutostart(on) {
    if (process.platform !== 'win32') return false;      // macOS: use a Login Item or launchd (see README)
    if (on) return (await ex('schtasks', ['/create', '/tn', 'VideoStudio', '/tr', `wscript.exe "${path.join(ROOT, 'run-hidden.vbs')}"`, '/sc', 'onlogon', '/f'])).ok;
    return (await ex('schtasks', ['/delete', '/tn', 'VideoStudio', '/f'])).ok;
  }

  // ---------- tools ----------
  async function ollama() { try { const r = await fetch('http://127.0.0.1:11434/api/tags', { signal: AbortSignal.timeout(1500) }); return r.ok; } catch { return false; } }
  async function tools() {
    const ff = await ex('ffmpeg', ['-version'], 8000);
    const py = fs.existsSync(require('./platform').PY);
    const wh = !!require('./platform').whisperExe();
    return [
      { id: 'ffmpeg', label: 'ffmpeg (video engine)', ok: ff.ok, need: true },
      { id: 'ollama', label: 'Ollama (meaning-based insert matching)', ok: await ollama(), need: false },
      { id: 'whisper', label: 'Whisper (backup speech recognition)', ok: wh, need: false },
      { id: 'python', label: 'Python tools (lip-sync and cut detection)', ok: py, need: false }
    ];
  }

  // ---------- status ----------
  function tailLog(n = 60) {
    try { const b = fs.readFileSync(LOG, 'utf8').split(/\r?\n/).filter(Boolean); return b.slice(-n); } catch { return []; }
  }
  function health(info) {
    const r = [];
    const gb = v => v / 1073741824;
    if (info.disk.free != null) { if (gb(info.disk.free) < 3) r.push({ level: 'bad', text: `Only ${gb(info.disk.free).toFixed(1)} GB of disk space left` }); else if (gb(info.disk.free) < 10) r.push({ level: 'warn', text: `Disk space is getting low (${gb(info.disk.free).toFixed(1)} GB free)` }); }
    if (info.failed.length) r.push({ level: 'warn', text: `${info.failed.length} project(s) ended with an error` });
    if (info.recover) r.push({ level: 'warn', text: `${info.recover} interrupted job(s) can be restarted` });
    if (info.queue.running && Date.now() - info.queue.running.since > 40 * 60000) r.push({ level: 'warn', text: 'A job has been running for more than 40 minutes' });
    const t = info.tools.find(x => x.need && !x.ok); if (t) r.push({ level: 'bad', text: `${t.label} is not working` });
    const lb = info.backup.last;
    if (info.settings.autoBackup && (!lb || Date.now() - lb.at > 3 * 864e5)) r.push({ level: 'warn', text: lb ? 'The last backup is older than 3 days' : 'No backup has been made yet' });
    if (info.restarts24 >= 3) r.push({ level: 'warn', text: `The server restarted ${info.restarts24} times in the last 24 hours` });
    return { level: r.some(x => x.level === 'bad') ? 'bad' : r.length ? 'warn' : 'ok', reasons: r };
  }
  async function status(full) {
    const st = state(), d = disk();
    let projects = []; try { projects = allProjects(); } catch {}
    const by = {}; projects.forEach(p => { by[p.status] = (by[p.status] || 0) + 1; });
    const failed = projects.filter(p => p.status === 'error').map(p => ({ id: p.id, name: p.name, error: String(p.error || '').slice(0, 200), at: p.updated })).sort((a, b) => b.at - a.at).slice(0, 12);
    const log = tailLog(400);
    const restarts24 = log.filter(l => /server stopped/.test(l)).filter(l => { const m = l.match(/\[(\d{2})\.(\d{2})\.(\d{4})/); return m ? Date.now() - new Date(+m[3], +m[2] - 1, +m[1]).getTime() < 2 * 864e5 : false; }).length;
    const info = {
      uptime: Math.round((Date.now() - started) / 1000), node: process.version, port: process.env.PORT || 4317,
      queue: { running: jobs.running(), waiting: jobs.waiting() }, byStatus: by, total: projects.length, failed, recover: (recovery.list() || []).length,
      disk: d, settings: cfg(), restarts24,
      backup: { last: st.lastBackup || null, dir: backupDir(), list: listBackups() },
      lastClean: st.lastClean || null, events: st.events || [], tools: await tools()
    };
    info.health = health(info);
    if (full) { info.sizes = await sizes(); info.autostart = await autostart(); info.log = tailLog(80).filter(l => /error|uncaught|unhandled|stopped|starting|failed/i.test(l)).slice(-30); info.cleanup = cleanScan().map(c => ({ id: c.id, label: c.label, note: c.note, bytes: c.bytes, count: c.files.length })); }
    return info;
  }

  // ---------- quiet scheduler ----------
  let busy = false;
  async function tick() {
    if (busy) return; busy = true;
    try {
      const o = cfg(), st = state(), idle = !jobs.running() && !jobs.waiting();
      if (idle && o.autoBackup && (!st.lastBackup || Date.now() - st.lastBackup.at > 24 * 3600000)) { try { await createBackup(); } catch (e) { event('error', 'Backup failed: ' + e.message); if (hooks.backupFailed) hooks.backupFailed(e.message); } }
      if (hooks.health) { const i = await status(false), s2 = state(); s2.healthSig = hooks.health(i.health.level, i.health.reasons.map(r => r.text), s2.healthSig); saveState(s2); }
      const d = disk(), low = d.free != null && d.free < 10 * 1073741824;
      if (idle && o.autoClean && (low || !st.lastClean || Date.now() - st.lastClean.at > 7 * 864e5)) cleanRun(['temp', 'log', 'backups']);
    } catch (e) { console.error('maint:', e.message); } finally { busy = false; }
  }
  function start() { setTimeout(tick, 60000); setInterval(tick, 15 * 60000).unref(); event('start', 'Server started'); }

  function mount(app, wrap) {
    app.get('/api/status', wrap(async (req, res) => res.json(await status(req.query.full === '1'))));
    app.get('/api/status/brief', wrap(async (req, res) => { const i = await status(false); res.json({ level: i.health.level, reasons: i.health.reasons.length, running: !!i.queue.running, waiting: i.queue.waiting }); }));
    app.post('/api/maint/settings', wrap((req, res) => res.json(setCfg(req.body || {}))));
    app.post('/api/maint/clean', wrap((req, res) => {
      if (req.body.dry) return res.json(cleanScan().map(c => ({ id: c.id, label: c.label, note: c.note, bytes: c.bytes, count: c.files.length })));
      if (jobs.running()) return res.status(400).json({ error: 'A job is running. Try again when the queue is empty.' });
      res.json(cleanRun(Array.isArray(req.body.ids) ? req.body.ids : []));
    }));
    app.post('/api/maint/backup', wrap(async (req, res) => res.json(await createBackup())));
    app.post('/api/maint/restore', wrap(async (req, res) => res.json(await restore(String(req.body.name || '')))));
    app.post('/api/maint/autostart', wrap(async (req, res) => { const ok = await setAutostart(!!req.body.on); res.json({ ok, on: await autostart() }); }));
  }
  return { mount, start, status, createBackup, cleanScan, cleanRun, restore, listBackups, cfg, setCfg, backupFiles };
}
module.exports = { create };
