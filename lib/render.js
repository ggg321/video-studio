const { spawn } = require('child_process');
const fs = require('fs'), path = require('path');
const { buildAss } = require('./ass');
const { LIB } = require('./plan');
let enhance; const getEnh = () => enhance || (enhance = require('./enhance'));

const FORMATS = { square: [720, 720], square_hd: [1080, 1080], vertical: [1080, 1920], vertical_720: [720, 1280], portrait: [864, 1080], portrait_hd: [1080, 1350], landscape_720: [1280, 720], landscape: [1920, 1080] };
// names for the UI: where each size is normally used
const FORMAT_INFO = [
  { id: 'vertical_720', label: '9:16 · 720×1280', use: 'TikTok, Reels, Shorts' },
  { id: 'vertical', label: '9:16 · 1080×1920', use: 'TikTok, Reels, Shorts (full HD)' },
  { id: 'portrait', label: '4:5 · 864×1080', use: 'Instagram and Facebook feed' },
  { id: 'portrait_hd', label: '4:5 · 1080×1350', use: 'Instagram and Facebook feed (full HD)' },
  { id: 'square', label: '1:1 · 720×720', use: 'Square, any feed' },
  { id: 'square_hd', label: '1:1 · 1080×1080', use: 'Square (full HD)' },
  { id: 'landscape_720', label: '16:9 · 1280×720', use: 'YouTube, websites' },
  { id: 'landscape', label: '16:9 · 1920×1080', use: 'YouTube (full HD)' }
];
const FONTS = require('./fonts').fontsDirOpt();

function run(cmd, args, opts = {}, onLine) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { ...opts });
    let err = '';
    p.stderr.on('data', d => { err += d; if (err.length > 20000) err = err.slice(-20000); });
    if (onLine) { let buf = ''; p.stdout.on('data', d => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { onLine(buf.slice(0, i)); buf = buf.slice(i + 1); } }); }
    p.on('close', code => code === 0 ? resolve() : reject(new Error(`${cmd} exit ${code}\n${err.slice(-1500)}`)));
    p.on('error', reject);
  });
}

async function probe(file) {
  return new Promise(res => {
    const p = spawn('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]);
    let o = ''; p.stdout.on('data', d => o += d); p.on('close', () => res(parseFloat(o) || 0));
  });
}

// speaker segments -> [{start,end,color,tag}] for caption accent colour per speaker and optional name tags
function segOpts(proj) {
  if (proj.segMode !== 'segments' || !proj.segTimes) return null;
  const sp = require('./speakers');
  return proj.segTimes.map((t, i) => { const s = sp.get(t.speakerId) || {}, a = (proj.seg || [])[i] || {}; return { start: t.start, end: t.end, color: s.color, tag: a.tagOn ? (a.tagText || s.name || '') : '' }; });
}
async function render(dir, proj, onProgress) {
  const [W, H] = FORMATS[proj.format] || FORMATS.square;
  const audioFile = proj.voiceFile ? path.join(dir, proj.voiceFile) : (proj.presenterFile ? path.join(dir, proj.presenterFile) : null);
  if (!audioFile) throw new Error('No audio or video present.');
  const T = await probe(audioFile);
  let presenter = proj.presenterFile ? path.join(dir, proj.presenterFile) : null;
  if (presenter && proj.upscale && getEnh().available()) presenter = await getEnh().upscale(dir, proj.presenterFile, pr => onProgress && onProgress(pr * 0.3));

  const ovb = require('./overlays').build(dir, proj, W, H);        // ticker / logo / clock pictures
  // a subtitle template from the HyperFrames catalog replaces the ASS words with a transparent overlay (cards and the clock stay in the ASS file)
  let hfOverlay = null;
  const rg0 = proj.range && proj.range.to > proj.range.from ? proj.range : null;
  if (proj.hfCaption) {
    try { onProgress && onProgress(0.01); hfOverlay = await require('./hfcaps').make(dir, proj, W, H, T, rg0); } catch (e) { console.error('subtitle template skipped:', e.message); }
  }
  // light motion: animated key words over the picture (drawn by Remotion on a transparent layer)
  let lmOverlay = null;
  if (proj.lightMotion && proj.lightMotion.on && !(proj.range && proj.range.to > proj.range.from)) {
    try { onProgress && onProgress(0.02); lmOverlay = await require('./lightmotion').make(dir, proj, W, H, T); } catch (e) { console.error('light motion skipped:', e.message); }
  }
  fs.writeFileSync(path.join(dir, 'subs.ass'), buildAss(hfOverlay ? [] : proj.words, W, H, (proj.cuts || []).filter(c => c.clip === 'card' && c.card).map(c => ({ start: c.start, end: c.end, text: c.card, variant: c.variant })), { clock: ovb.clock, duration: T, measure: require('./textwidth').measure, style: proj.subStyle, accent: proj.accent, font: proj.font, capX: proj.capX, capY: proj.capY, capScale: proj.capScale, capLines: proj.capLines, capPx: proj.capPx, cues: proj.subs, segments: segOpts(proj) }));

  const inputs = [];
  let idx = 0;
  const base = idx++;
  // a presenter video shorter than the voice track is looped so the picture never ends before the sound
  if (presenter) { const pd = await probe(presenter); if (pd > 0 && pd < T - 0.1) inputs.push('-stream_loop', '-1', '-i', presenter); else inputs.push('-i', presenter); }
  else inputs.push('-f', 'lavfi', '-i', `color=c=0x111111:s=${W}x${H}:r=30:d=${T.toFixed(2)}`);
  const audioIdx = proj.voiceFile || !presenter ? idx++ : base;
  if (proj.voiceFile || !presenter) inputs.push('-i', audioFile);

  const f = [];
  const zs = (proj.zooms || []).map(z => `between(t,${z.start},${z.end})`).join('+');
  const FX = require('./fx'), fxp = FX.normFx(proj.fx || {});
  // "punch-in" transitions also push the picture underneath in just before the cut
  const bump = (proj.cuts || []).map((c, k) => ({ c, k })).filter(x => FX.pick(x.c.tr || proj.transition || 'fade', x.k) === 'punch').map(x => `between(t,${(x.c.start - 0.22).toFixed(2)},${x.c.start.toFixed(2)})*0.22*(t-${(x.c.start - 0.22).toFixed(2)})/0.22`).join('+');
  const zParts = [zs ? `0.12*min(1,${zs})` : '', presenter ? bump : ''].filter(Boolean).join('+');
  const zoom = zParts ? `,scale=w='trunc(${W}*(1+${zParts})/2)*2':h='trunc(${H}*(1+${zParts})/2)*2':eval=frame,crop=${W}:${H}` : '';
  f.push(presenter
    ? `[${base}:v]fps=30,scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}${zoom}${proj.enhance ? ',' + getEnh().LIGHT : ''},setsar=1,format=yuv420p[b0]`
    : `[${base}:v]format=yuv420p[b0]`);
  let last = 'b0';
  const niche = require('./niches').get(proj.niche, { libs: proj.libs });
  const fxEnv = { f, W, H, addIn: a => { inputs.push(...a); return idx++; }, get last() { return last; }, set last(v) { last = v; } };
  (proj.cuts || []).forEach((c, k) => {
    const found = niche.items.find(x => x.id === c.clip);
    let clip = found && { ...found, file: niche.abs(found), abs: true };
    if (c.clip === 'stock' && c.file) clip = { file: path.join(dir, 'stock', c.file), dur: c.sdur || 8, abs: true };
    if (!clip) return;
    const ss = Math.min(0.3, Math.max(0, clip.dur - 1));
    const d = Math.min(c.end - c.start, clip.dur - ss);
    if (d <= 0.1) return;
    inputs.push('-ss', String(ss), '-t', d.toFixed(2), '-i', clip.abs ? clip.file : path.join(__dirname, '..', 'library', clip.file));
    const i = idx++;
    const tr = FX.pick(c.tr || proj.transition || 'fade', k);
    const sp = FX.spec(tr, { W, H, s: c.start, presenter: !!presenter, dt: proj.transDur || 0.35 });
    const end = (c.start + d).toFixed(2), dur = sp.fadeIn || 0.16;
    // fade times are relative to the insert's own stream (it is shifted to its place on the timeline afterwards)
    const firstOfVoiceOnly = !presenter && c.start < 0.05;
    const alpha = sp.fadeIn && !firstOfVoiceOnly ? `,format=yuva420p,fade=t=in:st=0:d=${dur}:alpha=1${presenter && sp.fadeOut ? `,fade=t=out:st=${Math.max(0, d - dur).toFixed(2)}:d=${dur}:alpha=1` : ''}` : '';
    // without a presenter the previous insert stays under the next one while it fades in (no dark flash in between)
    const ext = !presenter && sp.fadeIn ? dur : 0;
    f.push(`[${i}:v]fps=30,scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1${sp.vf ? ',' + sp.vf : ''},format=yuv420p${alpha},setpts=PTS-STARTPTS+${c.start}/TB[v${k}]`);
    const pos = sp.center ? `:x='(main_w-overlay_w)/2':y='(main_h-overlay_h)/2'` : sp.x ? `:x=${sp.x}` : sp.y ? `:y=${sp.y}` : '';
    f.push(`[${last}][v${k}]overlay=enable='between(t,${c.start},${(c.start + d + ext).toFixed(2)})'${pos}:eof_action=${ext ? 'repeat' : 'pass'}[o${k}]`);
    last = `o${k}`;
    FX.applyLayers(fxEnv, sp, k);                      // light flashes, colour bars, … on top of this cut
  });
  // thematic emoji above the captions (no plate under them): pop in, stay for the cue, fade out
  // camera effects (shake, camera move, constant zoom) and the look (grade, vignette, grain) act on the picture only; captions and overlays stay steady
  {
    const cam = FX.cameraChain(fxp, W, H, T, (proj.cuts || []).map(c => c.start).filter(s => s > 0.05)), look = FX.lookChain(fxp);
    if (cam || look) { f.push(`[${last}]${[cam, look].filter(Boolean).join(',')}[ofxcam]`); last = 'ofxcam'; }
  }
  const geo = require('./ass').geometry(W, H, { style: proj.subStyle, capScale: proj.capScale, capPx: proj.capPx, capLines: proj.capLines, capX: proj.capX, capY: proj.capY });
  // caption band: a gradient / colour / picture strip behind the subtitles
  if (proj.band && proj.band.on) {
    const bd = await require('./band').make(dir, proj, W, H, geo);
    if (bd) {
      inputs.push('-loop', '1', '-framerate', '30', '-t', T.toFixed(2), '-i', bd.file);
      const i = idx++;
      f.push(`[${i}:v]format=rgba[bandv]`, `[${last}][bandv]overlay=x=${bd.x}:y=${bd.y}:format=auto:eof_action=pass[ob]`);
      last = 'ob';
    }
  }
  // ticker, logo plate and clock plate
  ovb.items.forEach((it, k) => {
    inputs.push('-loop', '1', '-framerate', '30', '-t', T.toFixed(2), '-i', it.file);
    const i = idx++;
    f.push(it.kind === 'scroll' ? `[${i}:v]format=rgba,crop=${it.w}:${it.h}:x='mod(t*${it.speed},${it.cycle})':y=0[ovs${k}]` : `[${i}:v]format=rgba[ovs${k}]`);
    f.push(`[${last}][ovs${k}]overlay=x=${it.x}:y=${it.y}:format=auto:eof_action=pass[ovo${k}]`);
    last = `ovo${k}`;
  });
  if (proj.emojiOn && (proj.emojis || []).length) {
    const em = require('./emoji');
    const size = Math.round(geo.fs * 1.75 * (proj.emojiScale > 0 ? proj.emojiScale : 1) / 2) * 2;
    for (const [k, m] of proj.emojis.entries()) {
      if (!(m.end > m.start) || m.start > T) continue;
      const file = await em.asset(m.emoji); if (!file) continue;
      const d = Math.min(m.end, T) - m.start;
      inputs.push('-loop', '1', '-framerate', '30', '-t', d.toFixed(2), '-i', file);
      const i = idx++, cy = proj.emojiPos === 'below' ? Math.min(H - size / 2 - 8, geo.bottom + size * 0.62) : Math.max(size / 2 + 8, geo.top - size * 0.6);
      f.push(`[${i}:v]format=rgba,scale=w='trunc(${size}*min(1,0.55+0.45*t/0.2)/2)*2':h=-1:eval=frame,fade=t=in:st=0:d=0.1:alpha=1,fade=t=out:st=${Math.max(0, d - 0.12).toFixed(2)}:d=0.12:alpha=1,setpts=PTS-STARTPTS+${m.start}/TB[e${k}]`);
      f.push(`[${last}][e${k}]overlay=x='${Math.round(geo.cx)}-w/2':y='${Math.round(cy)}-h/2':enable='between(t,${m.start},${(m.start + d).toFixed(2)})':eof_action=pass[oe${k}]`);
      last = `oe${k}`;
    }
  }
  // thin progress bar along the top or bottom edge
  if (fxp.progress.on) {
    const pb = fxp.progress, i = idx++;
    inputs.push('-f', 'lavfi', '-i', `color=c=0x${pb.color.slice(1)}:s=${W}x${pb.h}:r=30:d=${T.toFixed(2)}`);
    f.push(`[${last}][${i}:v]overlay=x='-main_w+main_w*t/${T.toFixed(2)}':y=${pb.pos === 'top' ? 0 : H - pb.h}:eof_action=pass[opr]`); last = 'opr';
  }
  const range = proj.range && proj.range.to > proj.range.from ? proj.range : null;   // fragment preview: low-res, only this time span
  {
    // the subtitles of the ASS file, then the transparent layers (animated subtitle template, light motion). A fragment preview is scaled down at the end.
    f.push(`[${last}]ass=subs.ass:fontsdir=${FONTS}[vass]`);
    let cur = 'vass';
    const layers = [{ file: hfOverlay, off: range ? range.from : 0 }, { file: range ? null : lmOverlay, off: 0 }].filter(l => l.file);
    layers.forEach((l, k) => {
      inputs.push('-c:v', 'libvpx-vp9', '-i', l.file);
      const hi = idx++, nx = k === layers.length - 1 && !range ? 'vout' : 'vov' + k;
      f.push(`[${hi}:v]format=yuva420p${l.off ? ',tpad=start_duration=' + l.off.toFixed(3) + ':start_mode=add:color=black@0' : ''}[vo${k}]`, `[${cur}][vo${k}]overlay=0:0:eof_action=pass[${nx}]`);
      cur = nx;
    });
    if (range) f.push(`[${cur}]scale=${Math.max(240, Math.min(720, +range.w || 360))}:-2[vout]`);
    else if (cur === 'vass') f[f.length - 1] = `[${last}]ass=subs.ass:fontsdir=${FONTS}[vout]`;
  }

  // ---- audio: voice (+ ducked music) (+ sfx events) ----
  const A = proj.audio || {}, AUD = path.join(__dirname, '..', 'data', 'audio');
  const mix = [];
  const music = A.musicOn !== false && A.music && fs.existsSync(path.join(AUD, 'music', A.music + '.wav')) ? A.music : null;
  if (music) {
    inputs.push('-stream_loop', '-1', '-i', path.join(AUD, 'music', music + '.wav'));
    const mi = idx++;
    f.push(`[${audioIdx}:a]aresample=44100,asplit=2[va][vs]`);
    f.push(`[${mi}:a]aresample=44100,volume=${A.musicVol ?? 0.18}[m0]`);
    f.push('[m0][vs]sidechaincompress=threshold=0.02:ratio=10:attack=15:release=350[md]');
    mix.push('[va]', '[md]');
  } else f.push(`[${audioIdx}:a]aresample=44100[va]`), mix.push('[va]');
  (A.sfxOn === false ? [] : (A.sfx || [])).forEach((e, k) => {
    const file = path.join(AUD, 'sfx', e.id + '.wav');
    if (!fs.existsSync(file) || e.t < 0 || e.t > T) return;
    inputs.push('-i', file);
    const si = idx++, ms = Math.round(e.t * 1000);
    f.push(`[${si}:a]aresample=44100,volume=${e.vol ?? 0.5},adelay=${ms}|${ms}[s${k}]`);
    mix.push(`[s${k}]`);
  });
  f.push(`${mix.join('')}amix=inputs=${mix.length}:normalize=0:duration=first,loudnorm=I=-16:TP=-1.5:LRA=11[aout]`);
  fs.writeFileSync(path.join(dir, 'filter.txt'), f.join(';\n'));

  const out = range ? 'preview.mp4' : (proj._out || 'out.mp4');
  const span = range ? Math.min(T, range.to) - Math.max(0, range.from) : T;
  const args = ['-y', '-hide_banner', '-loglevel', 'error', '-progress', 'pipe:1', ...inputs,
    '-filter_complex_script', 'filter.txt', '-map', '[vout]', '-map', '[aout]', ...(range ? ['-ss', Math.max(0, range.from).toFixed(2), '-t', span.toFixed(2)] : ['-t', T.toFixed(2)]),
    '-c:v', 'libx264', '-preset', range ? 'ultrafast' : 'veryfast', '-crf', range ? (+range.w >= 480 ? '23' : '30') : '21', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', '-metadata', 'title=' + String(proj.name || 'Video').slice(0, 100), out];
  await run('ffmpeg', args, { cwd: dir }, line => {
    const m = line.match(/^out_time_ms=(\d+)/);
    if (m) onProgress && onProgress(Math.min(0.99, (+m[1] / 1e6) / (span || T)));
  });
  return out;
}

module.exports = { render, run, probe, FORMATS, FORMAT_INFO };
