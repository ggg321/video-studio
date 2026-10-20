// "Photo and timer": a photo in the first seconds of the finished video and a timer that extends the end to a chosen length (e.g. 9:50).
// Used by the main render (as a last step on out.mp4) and by Subtitle Studio.
const fs = require('fs'), path = require('path'), { execFile } = require('child_process');
const ROOT = path.join(__dirname, '..');
const run = (cmd, args, opt = {}) => new Promise((ok, no) => execFile(cmd, args, { maxBuffer: 64 << 20, windowsHide: true, ...opt }, (e, so, se) => e ? no(new Error((se || e.message).slice(-400))) : ok(so)));

const pexelsKey = () => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'settings.json'), 'utf8')).pexelsKey || ''; } catch { return ''; } };
// "9:50" / "09:50" / "1:02:03" / "590" -> seconds
const parseTime = s => { const p = String(s == null ? '' : s).trim().split(':').map(Number); if (!p.length || p.some(x => !isFinite(x) || x < 0)) return 0; return p.reduce((a, x) => a * 60 + x, 0); };
const mmss = t => { t = Math.max(0, Math.round(t)); const h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), s = t % 60, p = n => String(n).padStart(2, '0'); return h ? `${h}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`; };

// a nature photo from Pexels in the shape of the video; saved as <dir>/nature.jpg. Every download is kept in data/nature, so a flaky network
// (Pexels sometimes times out) falls back to a photo downloaded earlier.
const retry = async (fn, n = 4) => { let last; for (let i = 0; i < n; i++) { try { return await fn(); } catch (e) { last = e; await new Promise(r => setTimeout(r, 800 * (i + 1))); } } throw last; };
async function naturePhoto(dir, W, H) {
  const key = pexelsKey(), orient = H > W * 1.15 ? 'portrait' : W > H * 1.15 ? 'landscape' : 'square';
  const cache = path.join(ROOT, 'data', 'nature'), file = path.join(dir, 'nature.jpg');
  const cached = () => { try { const l = fs.readdirSync(cache).filter(f => f.startsWith(orient + '_')); return l.length ? path.join(cache, l[Math.floor(Math.random() * l.length)]) : null; } catch { return null; } };
  try {
    if (!key) throw new Error('No Pexels key (Settings). Upload your own photo instead.');
    const topics = ['nature landscape', 'forest', 'mountain lake', 'green meadow', 'ocean beach sunrise', 'waterfall'];
    const q = topics[Math.floor(Math.random() * topics.length)];
    const ph = await retry(async () => { const r = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(q)}&orientation=${orient}&per_page=20`, { headers: { Authorization: key }, signal: AbortSignal.timeout(20000) }); if (!r.ok) throw new Error('Pexels: ' + r.status); return (await r.json()).photos || []; });
    if (!ph.length) throw new Error('Pexels found no photo');
    const pick = ph[Math.floor(Math.random() * ph.length)], url = pick.src.large2x || pick.src.large || pick.src.original;
    const buf = await retry(async () => { const img = await fetch(url, { signal: AbortSignal.timeout(30000) }); if (!img.ok) throw new Error('Photo download failed'); return Buffer.from(await img.arrayBuffer()); });
    fs.writeFileSync(file, buf);
    try { fs.mkdirSync(cache, { recursive: true }); fs.writeFileSync(path.join(cache, orient + '_' + pick.id + '.jpg'), buf); } catch {}
    return { file, credit: pick.photographer || '' };
  } catch (e) {
    const c = cached(); if (!c) throw new Error('Could not get a nature photo (' + (e.message || e) + '). Check the connection or upload your own photo.');
    fs.copyFileSync(c, file); return { file, credit: '', cached: true };
  }
}

// timer subtitles: one number per second, big, centred. dark = dark text (for a white background)
function timerAss(W, H, seconds, from, down, total, font, dark) {
  const sz = Math.round(Math.min(W, H) * 0.2);
  const f = t => { const h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), s = Math.floor((t % 60) * 100) / 100; return `${h}:${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`; };
  let ev = '';
  for (let s = 0; s < Math.ceil(seconds); s++) ev += `Dialogue: 0,${f(s)},${f(Math.min(seconds, s + 1))},T,,0,0,0,,{\\an5\\pos(${W / 2},${H / 2})}${mmss(down ? total - (from + s) : from + s)}\n`;
  const text = dark ? '&H00101010' : '&H00FFFFFF', outline = dark ? 0 : Math.round(sz / 14);
  return `[Script Info]\nScriptType: v4.00+\nPlayResX: ${W}\nPlayResY: ${H}\nWrapStyle: 2\n\n[V4+ Styles]\nFormat: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding\nStyle: T,${font},${sz},${text},${text},&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,${outline},${dark ? 0 : Math.round(sz / 20)},5,0,0,0,1\n\n[Events]\nFormat: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text\n${ev}`;
}

// Builds ffmpeg input/filter arguments. Run with cwd = dir (subs.ass / timer.ass are looked up there).
// o: { src (file in dir), W, H, duration, hasAudio, mainFilter ('' or e.g. "ass=subs.ass:fontsdir=..."), fontsOpt,
//      intro: { photo, sec }, outro: { target (s), down, bg: 'black'|'white'|'last' } }
async function plan(dir, o) {
  dir = path.resolve(dir);
  const even = n => Math.max(2, Math.floor(n / 2) * 2), W = even(o.W), H = even(o.H), srcPath = path.join(dir, o.src);
  const pr = JSON.parse(await run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=r_frame_rate', '-of', 'json', srcPath]));
  const [a, b] = String((pr.streams[0] || {}).r_frame_rate || '30/1').split('/').map(Number), fps = Math.min(60, Math.max(15, Math.round(a / (b || 1)) || 30));
  const intro = o.intro && o.intro.photo ? Math.max(0.2, Math.min(10, +o.intro.sec || 1)) : 0;
  const total = o.outro && o.outro.target ? Math.round(+o.outro.target) : 0;
  const tail = total ? +(total - intro - o.duration).toFixed(3) : 0;
  if (total && tail < 1) throw new Error(`The video is already ${mmss(intro + o.duration)} long: the timer needs a target longer than that.`);
  const inputs = [], f = [], vs = [], as = [];
  const addIn = (...x) => { inputs.push(...x); return inputs.filter(v => v === '-i').length - 1; };
  const sil = t => addIn('-f', 'lavfi', '-t', String(t), '-i', 'anullsrc=r=48000:cl=stereo');
  const norm = `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,fps=${fps},format=yuv420p`;
  if (intro) {
    const i = addIn('-loop', '1', '-framerate', String(fps), '-t', String(intro), '-i', o.intro.photo), s = sil(intro);
    f.push(`[${i}:v]${norm}[iv]`); f.push(`[${s}:a]aformat=sample_rates=48000:channel_layouts=stereo[ia]`); vs.push('[iv]'); as.push('[ia]');
  }
  const m = addIn('-i', srcPath);
  f.push(`[${m}:v]scale=${W}:${H},setsar=1,fps=${fps}${o.mainFilter ? ',' + o.mainFilter : ''},format=yuv420p[mv]`); vs.push('[mv]');
  if (o.hasAudio) f.push(`[${m}:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo[ma]`);
  else { const s = sil(o.duration); f.push(`[${s}:a]aformat=sample_rates=48000:channel_layouts=stereo[ma]`); }
  as.push('[ma]');
  if (total) {
    const bg = ['black', 'white', 'last'].includes(o.outro.bg) ? o.outro.bg : 'black', dark = bg === 'white';
    fs.writeFileSync(path.join(dir, 'timer.ass'), timerAss(W, H, tail, Math.round(intro + o.duration), !!o.outro.down, total, 'Montserrat Black', dark));
    let i;
    if (bg === 'last') {
      const last = path.join(dir, 'last.png');
      await run('ffmpeg', ['-y', '-loglevel', 'error', '-sseof', '-0.3', '-i', srcPath, '-update', '1', '-frames:v', '1', last]).catch(() => run('ffmpeg', ['-y', '-loglevel', 'error', '-i', srcPath, '-frames:v', '1', last]));
      i = addIn('-loop', '1', '-framerate', String(fps), '-t', String(tail), '-i', last);
      f.push(`[${i}:v]${norm},eq=brightness=-0.35:saturation=0.55,gblur=sigma=18,ass=timer.ass:fontsdir=${o.fontsOpt},format=yuv420p[ov]`);
    } else {
      i = addIn('-f', 'lavfi', '-t', String(tail), '-i', `color=c=${bg}:s=${W}x${H}:r=${fps}`);
      f.push(`[${i}:v]setsar=1,ass=timer.ass:fontsdir=${o.fontsOpt},format=yuv420p[ov]`);
    }
    const s = sil(tail); f.push(`[${s}:a]aformat=sample_rates=48000:channel_layouts=stereo[oa]`); vs.push('[ov]'); as.push('[oa]');
  }
  f.push(`${vs.map((v, k) => v + as[k]).join('')}concat=n=${vs.length}:v=1:a=1[v][a]`);
  return { args: [...inputs, '-filter_complex', f.join(';'), '-map', '[v]', '-map', '[a]'], total: total || intro + o.duration };
}

// Applies the project's wrap options to a finished video file in dir (replaces it). proj.wrap: see settingsOf.
const settingsOf = p => {
  const w = (p && p.wrap) || {};
  return { introOn: !!w.introOn, introSec: Math.min(10, Math.max(0.5, +w.introSec || 1)), introSrc: w.introSrc === 'upload' ? 'upload' : 'nature', introFile: w.introFile || '', introName: w.introName || '',
    outroOn: !!w.outroOn, outroTarget: String(w.outroTarget || '9:50'), outroDown: !!w.outroDown, outroBg: ['black', 'white', 'last'].includes(w.outroBg) ? w.outroBg : 'black' };
};
// throws a readable message when the timer target is not longer than the video
function check(p, duration) {
  const w = settingsOf(p); if (!w.outroOn) return;
  const target = parseTime(w.outroTarget); if (!target) throw new Error('Write the length of the video like 9:50');
  if (target - (w.introOn ? w.introSec : 0) - duration < 1) throw new Error(`The video is already ${mmss((w.introOn ? w.introSec : 0) + duration)} long: the timer needs a target longer than that.`);
}
const active = p => { const w = settingsOf(p); return w.introOn || w.outroOn; };
async function applyToFile(dir, file, proj, W, H, duration, onProgress) {
  dir = path.resolve(dir);
  const w = settingsOf(proj);
  let photo = null;
  if (w.introOn) {
    if (w.introSrc === 'upload' && w.introFile && fs.existsSync(path.join(dir, w.introFile))) photo = path.join(dir, w.introFile);
    else photo = (await naturePhoto(dir, W, H)).file;
  }
  const target = w.outroOn ? parseTime(w.outroTarget) : 0;
  if (w.outroOn && !target) throw new Error('Write the length of the video like 9:50');
  const hasAudio = (await run('ffprobe', ['-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=index', '-of', 'csv=p=0', path.join(dir, file)])).trim() !== '';
  const fontsOpt = require('./fonts').fontsDirOpt();
  const pl = await plan(dir, { src: file, W, H, duration, hasAudio, fontsOpt, intro: photo ? { photo, sec: w.introSec } : null, outro: target ? { target, down: w.outroDown, bg: w.outroBg } : null });
  const tmp = 'wrapped_tmp.mp4';
  await new Promise((ok, no) => {
    const p = require('child_process').spawn('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-progress', 'pipe:1', ...pl.args, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', tmp], { cwd: dir, windowsHide: true });
    let err = ''; p.stderr.on('data', d => { err = (err + d).slice(-500); });
    p.stdout.on('data', d => { const m = /out_time_us=(\d+)/.exec(String(d)); if (m && onProgress) onProgress(Math.min(0.99, +m[1] / 1e6 / pl.total)); });
    p.on('error', no); p.on('close', c => c === 0 ? ok() : no(new Error('Photo / timer step failed: ' + err)));
  });
  fs.renameSync(path.join(dir, tmp), path.join(dir, file));
  return pl.total;
}
module.exports = { plan, naturePhoto, parseTime, mmss, pexelsKey, settingsOf, active, check, applyToFile };
