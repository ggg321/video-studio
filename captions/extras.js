// Optional extras around the video: a photo in the first seconds and a timer that extends the end to a chosen length.
const fs = require('fs'), path = require('path'), { execFile } = require('child_process');
const ROOT = path.join(__dirname, '..');
const run = (cmd, args, opt = {}) => new Promise((ok, no) => execFile(cmd, args, { maxBuffer: 64 << 20, ...opt }, (e, so, se) => e ? no(new Error((se || e.message).slice(-400))) : ok(so)));

const pexelsKey = () => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'settings.json'), 'utf8')).pexelsKey || ''; } catch { return ''; } };

// "9:50" / "09:50" / "1:02:03" / "590" -> seconds
const parseTime = s => { const p = String(s || '').trim().split(':').map(Number); if (!p.length || p.some(x => !isFinite(x) || x < 0)) return 0; return p.reduce((a, x) => a * 60 + x, 0); };
const mmss = t => { t = Math.max(0, Math.round(t)); const h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), s = t % 60, p = n => String(n).padStart(2, '0'); return h ? `${h}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`; };

// a nature photo from Pexels in the shape of the video (portrait / landscape / square); cached in the job folder
async function naturePhoto(dir, W, H) {
  const key = pexelsKey(); if (!key) throw new Error('No Pexels key (Video Studio → Settings). Upload your own photo instead.');
  const orient = H > W * 1.15 ? 'portrait' : W > H * 1.15 ? 'landscape' : 'square';
  const topics = ['nature landscape', 'forest', 'mountain lake', 'green meadow', 'ocean beach sunrise', 'waterfall'];
  const q = topics[Math.floor(Math.random() * topics.length)];
  const r = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(q)}&orientation=${orient}&per_page=20`, { headers: { Authorization: key }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error('Pexels: ' + r.status);
  const ph = (await r.json()).photos || []; if (!ph.length) throw new Error('Pexels found no photo');
  const pick = ph[Math.floor(Math.random() * ph.length)], url = pick.src.large2x || pick.src.large || pick.src.original;
  const img = await fetch(url, { signal: AbortSignal.timeout(30000) }); if (!img.ok) throw new Error('Photo download failed');
  const file = path.join(dir, 'nature.jpg'); fs.writeFileSync(file, Buffer.from(await img.arrayBuffer()));
  return { file, credit: pick.photographer || '' };
}

// timer subtitles: one number per second, big, centred
function timerAss(W, H, seconds, from, down, total, font) {
  const fs_ = Math.round(Math.min(W, H) * 0.2), f = t => { const h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), s = Math.floor((t % 60) * 100) / 100; return `${h}:${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`; };
  let ev = '';
  for (let s = 0; s < Math.ceil(seconds); s++) ev += `Dialogue: 0,${f(s)},${f(Math.min(seconds, s + 1))},T,,0,0,0,,{\\an5\\pos(${W / 2},${H / 2})}${mmss(down ? total - (from + s) : from + s)}\n`;
  return `[Script Info]\nScriptType: v4.00+\nPlayResX: ${W}\nPlayResY: ${H}\nWrapStyle: 2\n\n[V4+ Styles]\nFormat: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding\nStyle: T,${font},${fs_},&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,${Math.round(fs_ / 14)},${Math.round(fs_ / 20)},5,0,0,0,1\n\n[Events]\nFormat: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text\n${ev}`;
}

// builds the ffmpeg arguments. o.intro = { on, sec, photo (file) }, o.outro = { on, target (seconds), down (bool) }
async function plan(j, dir, o, fontsOpt) {
  const even = n => Math.max(2, Math.floor(n / 2) * 2), W = even(j.W), H = even(j.H);
  const pr = JSON.parse(await run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=r_frame_rate', '-of', 'json', path.join(dir, j.src)]));
  const [a, b] = String((pr.streams[0] || {}).r_frame_rate || '30/1').split('/').map(Number), fps = Math.min(60, Math.max(15, Math.round(a / (b || 1)) || 30));
  const intro = o.intro && o.intro.on && o.intro.photo ? Math.max(0.2, Math.min(10, +o.intro.sec || 1)) : 0;
  const total = o.outro && o.outro.on ? Math.round(+o.outro.target || 0) : 0;
  const tail = total ? +(total - intro - j.duration).toFixed(3) : 0;
  if (total && tail < 1) throw new Error(`The video is already ${mmss(intro + j.duration)} long: the timer needs a target longer than that.`);
  const inputs = [], f = [], vs = [], as = [];
  const addIn = (...x) => { inputs.push(...x); return inputs.filter(v => v === '-i').length - 1; };
  const sil = t => addIn('-f', 'lavfi', '-t', String(t), '-i', 'anullsrc=r=48000:cl=stereo');
  const norm = `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,fps=${fps},format=yuv420p`;
  if (intro) {
    const i = addIn('-loop', '1', '-framerate', String(fps), '-t', String(intro), '-i', o.intro.photo), s = sil(intro);
    f.push(`[${i}:v]${norm}[iv]`); f.push(`[${s}:a]aformat=sample_rates=48000:channel_layouts=stereo[ia]`); vs.push('[iv]'); as.push('[ia]');
  }
  const m = addIn('-i', path.join(dir, j.src));
  f.push(`[${m}:v]scale=${W}:${H},setsar=1,fps=${fps},ass=subs.ass:fontsdir=${fontsOpt},format=yuv420p[mv]`); vs.push('[mv]');
  if (j.hasAudio) f.push(`[${m}:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo[ma]`);
  else { const s = sil(j.duration); f.push(`[${s}:a]aformat=sample_rates=48000:channel_layouts=stereo[ma]`); }
  as.push('[ma]');
  if (total) {
    const last = path.join(dir, 'last.png');
    await run('ffmpeg', ['-y', '-loglevel', 'error', '-sseof', '-0.3', '-i', path.join(dir, j.src), '-update', '1', '-frames:v', '1', last]).catch(() => run('ffmpeg', ['-y', '-loglevel', 'error', '-i', path.join(dir, j.src), '-frames:v', '1', last]));
    fs.writeFileSync(path.join(dir, 'timer.ass'), timerAss(W, H, tail, Math.round(intro + j.duration), !!o.outro.down, total, 'Montserrat Black'));
    const i = addIn('-loop', '1', '-framerate', String(fps), '-t', String(tail), '-i', last), s = sil(tail);
    f.push(`[${i}:v]${norm},eq=brightness=-0.35:saturation=0.55,gblur=sigma=18,ass=timer.ass:fontsdir=${fontsOpt},format=yuv420p[ov]`); f.push(`[${s}:a]aformat=sample_rates=48000:channel_layouts=stereo[oa]`); vs.push('[ov]'); as.push('[oa]');
  }
  const n = vs.length, ordered = vs.map((v, k) => v + as[k]).join('');
  f.push(`${ordered}concat=n=${n}:v=1:a=1[v][a]`);
  return { args: [...inputs, '-filter_complex', f.join(';'), '-map', '[v]', '-map', '[a]'], total: total || intro + j.duration, extended: n > 1 };
}
module.exports = { plan, naturePhoto, parseTime, mmss, pexelsKey };
