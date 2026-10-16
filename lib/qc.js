// Quality checks. pre(): on the plan before rendering. post(): on the finished file. Report = { summary, checks:[{id,title,status,detail}] }.
const fs = require('fs'), path = require('path');
const { spawnSync } = require('child_process');
const { FORMATS } = require('./render');

const ST = { pass: 'pass', warn: 'warn', fail: 'fail' };
const chk = (id, title, status, detail = '') => ({ id, title, status, detail });
const worst = a => a.includes('fail') ? 'fail' : a.includes('warn') ? 'warn' : 'pass';
const mmss = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const ff = (args) => spawnSync('ffmpeg', ['-hide_banner', '-nostats', ...args], { encoding: 'utf8', maxBuffer: 1 << 26 }).stderr || '';

function summarize(checks) {
  const s = { pass: 0, warn: 0, fail: 0 }; checks.forEach(c => s[c.status]++);
  return { summary: s, status: worst(checks.map(c => c.status)), checks, at: Date.now() };
}

// ---- plan checks (before export) ----
function pre(p, niche, duration) {
  const out = [], cuts = (p.cuts || []).filter(c => c.clip), dur = duration || p.duration || 0;
  // inserts: missing material
  const missing = cuts.filter(c => {
    if (c.clip === 'card') return !c.card;
    if (c.clip === 'stock') return !(c.file && fs.existsSync(path.join(__dirname, '..', 'projects', p.id, 'stock', c.file)));
    const it = niche.items.find(x => x.id === c.clip); return !it || !fs.existsSync(niche.abs(it));
  });
  out.push(chk('missing', 'Inserts: all materials exist', missing.length ? ST.fail : ST.pass, missing.length ? missing.map(c => `${mmss(c.start)} (${c.clip})`).join(', ') : `${cuts.length} inserts`));
  // overlaps
  const sorted = [...cuts].sort((a, b) => a.start - b.start), ov = [];
  for (let i = 1; i < sorted.length; i++) if (sorted[i].start < sorted[i - 1].end - 0.05) ov.push(`${mmss(sorted[i].start)}`);
  out.push(chk('overlap', 'Inserts: no overlaps', ov.length ? ST.warn : ST.pass, ov.length ? 'Overlap at ' + ov.join(', ') : ''));
  // outside the video / too short
  const out_of = cuts.filter(c => dur && c.end > dur + 0.05), short = cuts.filter(c => c.end - c.start < 0.8);
  out.push(chk('range', 'Inserts: inside the video, long enough', out_of.length ? ST.fail : short.length ? ST.warn : ST.pass,
    out_of.length ? 'Beyond the end: ' + out_of.map(c => mmss(c.start)).join(', ') : short.length ? 'Shorter than 0.8 s at ' + short.map(c => mmss(c.start)).join(', ') : ''));
  // repeated material
  const cnt = {}; cuts.filter(c => c.clip !== 'card').forEach(c => { const k = c.clip === 'stock' ? 'stock:' + c.file : c.clip; cnt[k] = (cnt[k] || 0) + 1; });
  const rep = Object.entries(cnt).filter(([, n]) => n > 1).map(([k, n]) => `${k}×${n}`);
  let back = 0; for (let i = 1; i < sorted.length; i++) if (sorted[i].clip !== 'card' && sorted[i].clip === sorted[i - 1].clip) back++;
  out.push(chk('repeat', 'Inserts: no repeated material', back ? ST.fail : rep.length ? ST.warn : ST.pass, back ? 'Same clip twice in a row' : rep.join(', ')));
  // coverage
  const covered = cuts.reduce((a, c) => a + Math.max(0, c.end - c.start), 0);
  out.push(chk('coverage', 'Inserts: share of the video covered', ST.pass, dur ? `${Math.round(covered / dur * 100)}% (${cuts.length} inserts)` : ''));
  // speech recognition vs script
  if (p.matchRatio != null) out.push(chk('script', 'Voice matches the script', p.matchRatio < 0.7 ? ST.fail : p.matchRatio < 0.85 ? ST.warn : ST.pass, `${Math.round(p.matchRatio * 100)}% of the script words found in the audio`));
  // subtitles readability (plan level)
  const cues = p.subs && p.subs.length ? p.subs : null;
  if (cues || (p.words && p.words.length)) out.push(readability(p, cues));
  // unresolved lip-sync / jump moments
  if (p.lipsync && p.lipsync.bad && p.lipsync.bad.length) {
    const open = p.lipsync.bad.filter(b => !cuts.some(c => c.start < b.end && c.end > b.start));
    out.push(chk('sync', 'Suspicious moments covered', open.length ? ST.warn : ST.pass, open.length ? 'Not covered: ' + open.map(b => `${mmss(b.start)} ${b.reason}`).join(', ') : `${p.lipsync.bad.length} moment(s), all covered`));
  }
  return summarize(out);
}

function readability(p, cues) {
  const list = cues || autoCueList(p);
  const fast = [], tiny = [];
  list.forEach(c => {
    const d = c.end - c.start, chars = c.text.replace(/\s+/g, '').length;
    if (d > 0 && chars / d > 22) fast.push(mmss(c.start));
    if (d < 0.25) tiny.push(mmss(c.start));
  });
  const [W, H] = FORMATS[p.format || 'square'] || FORMATS.square;
  const px = p.capPx || null;
  const small = px && px < H * 0.025;
  const st = fast.length > 3 || small ? ST.warn : (fast.length || tiny.length ? ST.warn : ST.pass);
  const bits = [];
  if (fast.length) bits.push('Reading speed above 22 chars/s at ' + fast.slice(0, 6).join(', '));
  if (tiny.length) bits.push('Cues shorter than 0.25 s at ' + tiny.slice(0, 6).join(', '));
  if (small) bits.push(`Font size ${px}px is small for ${W}×${H}`);
  return chk('subs', 'Subtitles: readable', bits.length ? ST.warn : ST.pass, bits.join('; ') || `${list.length} cues`);
}
function autoCueList(p) {
  try { return require('./ass').autoCues(p.words.map(w => ({ w: w.w, start: w.start, end: w.end })), { style: p.subStyle, capLines: p.capLines }); } catch { return []; }
}

// Are the inserts really visible in the file? Compare an exported frame with the matching frame of the source clip (SSIM).
function insertsVisible(dir, p, file, W, H) {
  const niche = require('./niches').get(p.niche, { libs: p.libs }), res = [];
  const cuts = (p.cuts || []).filter(c => c.clip !== 'card' && c.end - c.start >= 0.8).slice(0, 14);
  for (const c of cuts) {
    let src, dur;
    if (c.clip === 'stock' && c.file) { src = path.join(dir, 'stock', c.file); dur = c.sdur || 8; }
    else { const it = niche.items.find(x => x.id === c.clip); if (!it) continue; src = niche.abs(it); dur = it.dur; }
    if (!fs.existsSync(src)) continue;
    const ss = Math.min(0.3, Math.max(0, dur - 1)), tm = (c.start + c.end) / 2, ts = ss + (tm - c.start);
    const e = ff(['-ss', tm.toFixed(2), '-i', path.join(dir, file), '-ss', ts.toFixed(2), '-i', src, '-filter_complex',
      '[0:v]format=yuv420p,scale=' + W + ':' + H + '[a];[1:v]scale=' + W + ':' + H + ':force_original_aspect_ratio=increase,crop=' + W + ':' + H + ',format=yuv420p[b];[a][b]ssim', '-frames:v', '1', '-f', 'null', '-']);
    const m = e.match(/All:([0-9.]+)/);
    if (m) res.push({ t: tm, ssim: +m[1] });
  }
  return res;
}

// ---- file checks (after render) ----
function post(dir, p, file = 'out.mp4') {
  const f = path.join(dir, file), out = [];
  if (!fs.existsSync(f)) return summarize([chk('file', 'Export file exists', ST.fail, file + ' not found')]);
  const pr = JSON.parse(spawnSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', f], { encoding: 'utf8' }).stdout || '{}');
  const v = (pr.streams || []).find(s => s.codec_type === 'video'), a = (pr.streams || []).find(s => s.codec_type === 'audio');
  const dur = +(pr.format && pr.format.duration) || 0, [W, H] = FORMATS[p.format || 'square'] || FORMATS.square;
  const [fn, fd] = (v && v.r_frame_rate || '30/1').split('/').map(Number), fps = fd ? fn / fd : 0;
  out.push(chk('format', 'Format: H.264 + AAC, size, fps', v && a && v.codec_name === 'h264' && a.codec_name === 'aac' && v.width === W && v.height === H && Math.abs(fps - 30) < 0.5 ? ST.pass : ST.fail,
    `${v ? v.codec_name : '—'} ${v ? v.width + '×' + v.height : ''} ${fps.toFixed(0)}fps / ${a ? a.codec_name : 'no audio'} (expected ${W}×${H})`));
  let src = 0; try { src = +JSON.parse(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', path.join(dir, p.voiceFile || p.presenterFile)], { encoding: 'utf8' }).stdout).format.duration; } catch {}
  const vd = v ? +v.duration : 0, ad = a ? +a.duration : 0;
  out.push(chk('streams', 'Picture and sound have the same length', v && a && Math.abs(vd - ad) > 0.4 ? ST.fail : ST.pass, v && a ? `video ${vd.toFixed(1)} s, audio ${ad.toFixed(1)} s` : ''));
  out.push(chk('duration', 'Duration matches the voice track', src && Math.abs(dur - src) > 0.5 ? ST.warn : ST.pass, `${dur.toFixed(1)} s${src ? ` (source ${src.toFixed(1)} s)` : ''}`));
  out.push(chk('meta', 'Metadata: title, audio track', pr.format && pr.format.tags && pr.format.tags.title && a ? ST.pass : ST.warn, (pr.format && pr.format.tags && pr.format.tags.title) || 'no title tag'));

  // inserts visible?
  try {
    const vis = insertsVisible(dir, p, file, W, H), bad = vis.filter(x => x.ssim < 0.82);
    if (vis.length) out.push(chk('visible', 'Inserts are visible in the video', bad.length ? ST.fail : ST.pass, bad.length ? 'Insert not visible at ' + bad.map(x => mmss(x.t)).join(', ') : vis.length + ' inserts checked'));
  } catch {}
  // loudness
  const e = ff(['-i', f, '-af', 'ebur128=peak=true', '-f', 'null', '-']);
  const lufs = [...e.matchAll(/I:\s+(-?[\d.]+) LUFS/g)].pop(), tp = [...e.matchAll(/Peak:\s+(-?[\d.]+) dBFS/g)].pop();
  const L = lufs ? +lufs[1] : null, TP = tp ? +tp[1] : null;
  out.push(chk('loudness', 'Audio: loudness and peaks', L == null ? ST.warn : (L < -22 || L > -9 || (TP != null && TP > -0.5)) ? ST.warn : ST.pass, `${L != null ? L + ' LUFS' : 'n/a'}${TP != null ? ', true peak ' + TP + ' dBFS' : ''} (target about -16)`));
  // silence
  const s = ff(['-i', f, '-vn', '-af', 'silencedetect=n=-45dB:d=1.2', '-f', 'null', '-']);
  const sil = [...s.matchAll(/silence_start: ([\d.]+)[\s\S]*?silence_duration: ([\d.]+)/g)].map(m => ({ t: +m[1], d: +m[2] })).filter(x => x.t < dur - 0.5);
  out.push(chk('silence', 'Audio: no long silent gaps', sil.length ? ST.warn : ST.pass, sil.length ? sil.slice(0, 5).map(x => `${mmss(x.t)} (${x.d.toFixed(1)} s)`).join(', ') : ''));
  // black / frozen
  const b = ff(['-i', f, '-an', '-vf', 'blackdetect=d=0.3:pic_th=0.97', '-f', 'null', '-']);
  const blk = [...b.matchAll(/black_start:([\d.]+) black_end:([\d.]+)/g)].map(m => ({ t: +m[1], e: +m[2] })).filter(x => !(x.t < 0.05 && x.e < 0.6));
  out.push(chk('black', 'Video: no black frames', blk.length ? ST.fail : ST.pass, blk.length ? blk.slice(0, 5).map(x => `${mmss(x.t)}–${mmss(x.e)}`).join(', ') : ''));
  const fz = ff(['-i', f, '-an', '-vf', 'freezedetect=n=-60dB:d=2.5', '-f', 'null', '-']);
  const frz = [...fz.matchAll(/freeze_start: ([\d.]+)/g)].map(m => +m[1]);
  out.push(chk('freeze', 'Video: no frozen frames', frz.length ? ST.warn : ST.pass, frz.length ? 'Frozen from ' + frz.slice(0, 5).map(mmss).join(', ') : ''));
  return summarize(out);
}
module.exports = { pre, post, readability };
