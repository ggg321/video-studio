// Sample videos (your own archive): transcribe the voice-over, find where the picture changes, and keep the rhythm
// (where inserts appear, how long they last, the opening hook). The rhythm is later mapped onto a new script.
// Only timing and structure are kept: no frames of the sample are stored or reused.
const fs = require('fs'), path = require('path');
const { spawn, spawnSync } = require('child_process');
const { transcribe } = require('./transcribe');

const DIR = path.join(__dirname, '..', 'data', 'references');
fs.mkdirSync(DIR, { recursive: true });
const fileOf = id => path.join(DIR, id.replace(/[^\w-]/g, '') + '.json');
const AUDIO_ONLY = /\.(mp3|wav|m4a|aac|ogg|oga|flac|opus|wma)$/i;

const list = () => fs.readdirSync(DIR).filter(f => /^r[\w-]+\.json$/.test(f)).map(f => { try { const p = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')); return { id: p.id, name: p.name, created: p.created, duration: p.duration, visual: p.visual, source: p.source, cues: p.cues, presenter: p.presenter, speakers: p.speakers, music: p.music, lang: p.lang, stats: p.stats, hook: p.hook }; } catch { return null; } }).filter(Boolean).sort((a, b) => b.created - a.created);
const get = id => { try { return JSON.parse(fs.readFileSync(fileOf(id), 'utf8')); } catch { return null; } };
const remove = id => { try { fs.unlinkSync(fileOf(id)); return true; } catch { return false; } };

function run(cmd, args, opts = {}) {
  return new Promise((ok, no) => {
    const p = spawn(cmd, args, { windowsHide: true, ...opts }); let out = '', err = '';
    p.stdout.on('data', d => { out += d; if (out.length > 4e6) out = out.slice(-4e6); }); p.stderr.on('data', d => { err += d; if (err.length > 4e6) err = err.slice(-4e6); });
    p.on('error', no); p.on('close', c => c === 0 ? ok({ out, err }) : no(new Error(err.slice(-300) || cmd + ' failed')));
  });
}
const probeDur = f => { const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], { encoding: 'utf8' }); return parseFloat(r.stdout) || 0; };
const hasVideo = f => /video/.test(spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_type', '-of', 'csv=p=0', f], { encoding: 'utf8' }).stdout || '');

// sentences from timed words: break at . ! ? … or after a pause longer than 0.7 s
function sentencesOf(words) {
  const out = []; let cur = null;
  const flush = () => { if (cur) { cur.text = cur.w.join(' '); delete cur.w; out.push(cur); cur = null; } };
  words.forEach((w, i) => {
    if (!cur) cur = { start: w.start, end: w.end, w: [] };
    cur.w.push(w.text); cur.end = w.end;
    const gap = words[i + 1] ? words[i + 1].start - w.end : 9;
    if (/[.!?…]$/.test(w.text) || gap > 0.7) flush();
  });
  flush();
  const merged = [];
  for (const s of out) { const l = merged[merged.length - 1]; if (l && (s.end - s.start < 0.8 || l.end - l.start < 0.8) && s.start - l.end < 0.7) { l.end = s.end; l.text += ' ' + s.text; } else merged.push({ ...s }); }
  return merged.map(s => ({ start: +s.start.toFixed(2), end: +s.end.toFixed(2), text: s.text }));
}

// ---- picture changes (cuts, dissolves) of the sample ----
// The video is read as tiny colour frames (12 per second). A change is the difference between the average of the 4 frames
// before and the 4 frames after each moment, so a soft dissolve or two similar-looking shots still show up, not only hard cuts.
const FPS = 12, FN = 16, FL = FN * FN * 3, W4 = 4;
function readFrames(file) {
  return new Promise((ok, no) => {
    const p = spawn('ffmpeg', ['-loglevel', 'error', '-i', file, '-an', '-vf', `fps=${FPS},scale=${FN}:${FN}:flags=area`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'], { windowsHide: true });
    const ch = []; p.stdout.on('data', d => ch.push(d)); p.on('error', no); p.on('close', c => c === 0 ? ok(Buffer.concat(ch)) : no(new Error('Could not read the picture of the sample.')));
  });
}
const fmean = (buf, a, b) => { const o = new Float64Array(FL); for (let i = a; i < b; i++) { const o0 = i * FL; for (let k = 0; k < FL; k++) o[k] += buf[o0 + k]; } for (let k = 0; k < FL; k++) o[k] /= Math.max(1, b - a); return o; };
// pixels that never change (black bars around a smaller picture, a fixed logo) would dilute every difference: they are left out
let ACT = null, ACTPX = null;
const fdist = (x, y) => { let s = 0; if (ACT) { for (let q = 0; q < ACT.length; q++) { const k = ACT[q]; s += Math.abs(x[k] - y[k]); } return s / ACT.length; } for (let k = 0; k < FL; k++) s += Math.abs(x[k] - y[k]); return s / FL; };
function activePixels(buf, n) {
  const m = new Float64Array(FL), q = new Float64Array(FL); let c = 0;
  for (let i = 0; i < n; i += 2) { c++; for (let k = 0; k < FL; k++) { const v = buf[i * FL + k]; m[k] += v; q[k] += v * v; } }
  const act = []; for (let k = 0; k < FL; k++) { const mu = m[k] / c, sd = Math.sqrt(Math.max(0, q[k] / c - mu * mu)); if (sd >= 4) act.push(k); }
  return act.length >= FL * 0.15 && act.length < FL ? Int32Array.from(act) : null;
}
function detectCuts(buf, dur) {
  const n = Math.floor(buf.length / FL), sc = new Float64Array(n), d1 = new Float64Array(n);
  ACT = activePixels(buf, n); ACTPX = ACT ? Array.from({ length: FN * FN }, (_, p) => ACT.includes(p * 3) || ACT.includes(p * 3 + 1) || ACT.includes(p * 3 + 2)) : null;
  for (let i = 1; i < n; i++) { let s = 0; const a = i * FL, b = (i - 1) * FL; if (ACT) { for (let q = 0; q < ACT.length; q++) { const k = ACT[q]; s += Math.abs(buf[a + k] - buf[b + k]); } d1[i] = s / ACT.length; } else { for (let k = 0; k < FL; k++) s += Math.abs(buf[a + k] - buf[b + k]); d1[i] = s / FL; } }
  for (let i = W4; i <= n - W4; i++) sc[i] = fdist(fmean(buf, i - W4, i), fmean(buf, i, i + W4));
  const peaks = [];
  for (let i = W4; i < n - W4; i++) {
    let top = true; for (let j = i - 3; j <= i + 3; j++) if (j !== i && sc[j] > sc[i]) top = false;
    if (!top) continue;
    const hard = sc[i] >= 28 && (d1[i] >= 18 || sc[i] >= 42), soft = sc[i] >= 22 && d1[i] < 12;   // hard cut / dissolve
    if (hard || soft) peaks.push({ t: i / FPS, s: sc[i] });
  }
  const bounds = [];
  for (const p of peaks) { const l = bounds[bounds.length - 1]; if (l && p.t - l.t < 0.5) { if (p.s > l.s) bounds[bounds.length - 1] = p; } else bounds.push(p); }
  const times = [0, ...bounds.map(b => b.t).filter(t => t > 0.3 && t < dur - 0.3)];
  const segs = times.map((t, i) => ({ start: t, end: i + 1 < times.length ? times[i + 1] : dur }));
  if (segs.length > 1 && segs[segs.length - 1].end - segs[segs.length - 1].start < 0.5) { const l = segs.pop(); segs[segs.length - 1].end = l.end; }
  segs.forEach(g => { const a = Math.min(n - 1, Math.floor(g.start * FPS)), b = Math.max(a + 1, Math.min(n, Math.floor(g.end * FPS))); g.sig = fmean(buf, a, b); g.hist = colorHist(buf, a, b); const a2 = Math.min(n - 3, a + 8); g.first = (b - a >= 12) ? fmean(buf, a2, a2 + 3) : fmean(buf, a, Math.min(n, a + 2)); });
  return segs;
}
// colour distribution of a stretch of frames (64 bins): it stays the same when the speaker is zoomed or re-framed by a jump cut
function colorHist(buf, a, b) {
  const h = new Float64Array(64); let t = 0;
  for (let i = a; i < b; i++) for (let p = 0; p < FN * FN; p++) { if (ACTPX && !ACTPX[p]) continue; const o = i * FL + p * 3; h[(buf[o] >> 6) * 16 + (buf[o + 1] >> 6) * 4 + (buf[o + 2] >> 6)]++; t++; }
  for (let k = 0; k < 64; k++) h[k] /= (t || 1);
  return h;
}
const hdist = (x, y) => { let s = 0; for (let k = 0; k < 64; k++) s += Math.abs(x[k] - y[k]); return s / 2; };
// Speakers are the looks that make up a large part of the video or come back again and again (one person, or several people
// taking turns); everything else is an insert. Other framings of a speaker (zoom, jump cut) differ in position but not in colours.
function splitSpeaker(segs, total) {
  const cl = [];
  for (const s of segs) {
    const d = s.end - s.start; let best = -1, bd = 1e9;
    cl.forEach((c, i) => { const x = fdist(c.c, s.sig); if (x < bd) { bd = x; best = i; } });
    if (best >= 0 && bd < 22) { const c = cl[best]; for (let k = 0; k < FL; k++) c.c[k] = (c.c[k] * c.d + s.sig[k] * d) / (c.d + d); c.d += d; c.n++; s.cl = best; }
    else { cl.push({ c: Float64Array.from(s.sig), d, n: 1 }); s.cl = cl.length - 1; }
  }
  // the same stock clip used again starts with the same picture every time; a speaker coming back does not
  const repeated = i => { const m = segs.filter(s => s.cl === i); for (let a = 0; a < m.length; a++) for (let b = a + 1; b < m.length; b++) if (fdist(m[a].first, m[b].first) < 8) return true; return false; };
  const spk = new Set();
  cl.forEach((c, i) => { const sh = c.d / Math.max(1, total); if (sh >= 0.25 || ((sh >= 0.08 && c.n >= 2 && c.d / c.n >= 2.5) || (sh >= 0.04 && c.n >= 2 && c.d / c.n >= 4)) && !repeated(i)) spk.add(i); });
  if (spk.size) {
    const hist = i => { const h = new Float64Array(64); let pd = 0; for (const s of segs) if (s.cl === i) { const d = s.end - s.start; for (let k = 0; k < 64; k++) h[k] += s.hist[k] * d; pd += d; } for (let k = 0; k < 64; k++) h[k] /= (pd || 1); return h; };
    const sh = [...spk].map(i => ({ i, h: hist(i) }));
    for (const s of segs) {
      if (spk.has(s.cl)) continue;
      let best = null, bd = 1;
      for (const q of sh) { const x = hdist(s.hist, q.h); if (x < bd) { bd = x; best = q; } }
      if (best && bd < 0.25 && fdist(s.sig, cl[best.i].c) < 60) s.cl = best.i;
    }
  }
  const sp = segs.filter(s => spk.has(s.cl)), share = sp.reduce((a, s) => a + s.end - s.start, 0) / Math.max(1, total);
  return share >= 0.25 ? { presenter: true, share, speakers: spk.size, inserts: segs.filter(s => !spk.has(s.cl)) } : { presenter: false, share, speakers: 0, inserts: segs };
}

// ---- text cards (this platform's own look) ----
// A card is a small coloured label at the top of the picture: red with white text, or near-black with yellow text.
// It hardly changes the picture, so it is found by its colours: a rectangle of red, or a dark rectangle holding yellow letters.
const CN = 64, CF = 4, CL = CN * CN * 3;
function readCardFrames(file) {
  return new Promise((ok, no) => {
    const p = spawn('ffmpeg', ['-loglevel', 'error', '-i', file, '-an', '-vf', 'fps=' + CF + ',scale=' + CN + ':' + CN + ':flags=area', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'], { windowsHide: true });
    const ch = []; p.stdout.on('data', d => ch.push(d)); p.on('error', no); p.on('close', () => ok(Buffer.concat(ch)));
  });
}
function bestBlob(mask, rows, minCnt) {
  const seen = new Uint8Array(CN * rows); let best = null;
  for (let s0 = 0; s0 < mask.length; s0++) {
    if (!mask[s0] || seen[s0]) continue;
    const st = [s0]; seen[s0] = 1; let cnt = 0, x0 = CN, x1 = 0, y0 = rows, y1 = 0;
    while (st.length) {
      const q = st.pop(), qx = q % CN, qy = (q / CN) | 0; cnt++; x0 = Math.min(x0, qx); x1 = Math.max(x1, qx); y0 = Math.min(y0, qy); y1 = Math.max(y1, qy);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = qx + dx, ny = qy + dy; if (nx < 0 || ny < 0 || nx >= CN || ny >= rows) continue; const k = ny * CN + nx; if (mask[k] && !seen[k]) { seen[k] = 1; st.push(k); } }
    }
    const w = x1 - x0 + 1, h = y1 - y0 + 1;
    if (cnt >= minCnt && w >= 0.12 * CN && h >= 3 && h <= 0.22 * CN && cnt / (w * h) >= 0.45 && (!best || cnt > best.cnt)) best = { cnt, w, h };
  }
  return best;
}
async function detectCards(file) {
  const buf = await readCardFrames(file), n = Math.floor(buf.length / CL), rows = Math.round(CN * 0.4), has = [];
  for (let i = 0; i < n; i++) {
    const red = new Uint8Array(CN * rows), uni = new Uint8Array(CN * rows); let yel = 0, dk = 0, un = 0;
    for (let y = 0; y < rows; y++) for (let x = 0; x < CN; x++) {
      const o = i * CL + (y * CN + x) * 3, r = buf[o], g = buf[o + 1], b = buf[o + 2], k = y * CN + x;
      const isY = r > 170 && g > 130 && b < 110, isD = r < 85 && g < 85 && b < 85;
      if (r > 170 && g < 60 && b < 60) red[k] = 1;
      if (isD) dk++; if (isY) yel++; if (isY || isD) { uni[k] = 1; un++; }
    }
    const rb = bestBlob(red, rows, 30), ub = yel >= 2 ? bestBlob(uni, rows, 28) : null;
    has.push(!!(rb || (ub && dk >= 0.3 * ub.cnt)));
  }
  const out = []; let st = -1;
  for (let i = 0; i <= n; i++) { if (i < n && has[i]) { if (st < 0) st = i; } else if (st >= 0) { if (i - st >= 3) out.push({ start: +(st / CF).toFixed(2), end: +(i / CF).toFixed(2) }); st = -1; } }
  return out;
}

// ---- text cards of any design ----
// Besides the platform's own colours (above), a card of any look is found as a solid-colour rectangle in the top or bottom part of the
// picture that pops in and pops out (its box changes a lot at its start and end, the rest of the picture does not) and stays 0.75-7 s.
const GN = 96, GF = 4, GL = GN * GN * 3, GTOL = 16;
function readBannerFrames(file) {
  return new Promise((ok, no) => {
    const p = spawn('ffmpeg', ['-loglevel', 'error', '-i', file, '-an', '-vf', 'fps=' + GF + ',scale=' + GN + ':' + GN + ':flags=area', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'], { windowsHide: true });
    const ch = []; p.stdout.on('data', d => ch.push(d)); p.on('error', no); p.on('close', () => ok(Buffer.concat(ch)));
  });
}
function solidRects(buf, i) {
  const out = [], vis = new Uint8Array(GN * GN), bands = [[0, Math.round(GN * 0.4)], [Math.round(GN * 0.55), GN]];
  for (const [ya, yb] of bands) for (let y0 = ya; y0 < yb; y0++) for (let x0 = 0; x0 < GN; x0++) {
    const s0 = y0 * GN + x0; if (vis[s0]) continue;
    const o0 = i * GL + s0 * 3, sr = buf[o0], sg = buf[o0 + 1], sb = buf[o0 + 2], st = [s0]; vis[s0] = 1;
    let cnt = 0, x1 = x0, x2 = x0, y1 = y0, y2 = y0;
    while (st.length) {
      const q = st.pop(), qx = q % GN, qy = (q / GN) | 0; cnt++; if (qx < x1) x1 = qx; if (qx > x2) x2 = qx; if (qy < y1) y1 = qy; if (qy > y2) y2 = qy;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = qx + dx, ny = qy + dy; if (nx < 0 || ny < ya || nx >= GN || ny >= yb) continue;
        const k = ny * GN + nx; if (vis[k]) continue; const o = i * GL + k * 3;
        if (Math.abs(buf[o] - sr) <= GTOL && Math.abs(buf[o + 1] - sg) <= GTOL && Math.abs(buf[o + 2] - sb) <= GTOL) { vis[k] = 1; st.push(k); }
      }
    }
    const w = x2 - x1 + 1, h = y2 - y1 + 1;
    if (cnt >= 30 && w >= 0.12 * GN && w <= 0.95 * GN && h >= 3 && h <= 0.2 * GN && w / h >= 1.6 && cnt / (w * h) >= 0.5 && x1 >= 1 && x2 <= GN - 2 && y1 >= 1 && y2 <= GN - 2) out.push({ x1, x2, y1, y2 });
  }
  return out;
}
const rectIou = (a, b) => { const ix = Math.max(0, Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1) + 1), iy = Math.max(0, Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1) + 1), I = ix * iy; return I / ((a.x2 - a.x1 + 1) * (a.y2 - a.y1 + 1) + (b.x2 - b.x1 + 1) * (b.y2 - b.y1 + 1) - I); };
async function detectBanners(file) {
  const buf = await readBannerFrames(file), n = Math.floor(buf.length / GL), R = [];
  for (let i = 0; i < n; i++) R.push(solidRects(buf, i));
  const runs = []; let open = [];
  for (let i = 0; i <= n; i++) {
    const cur = i < n ? R[i] : [], next = [];
    for (const o of open) { const m = cur.find(r => rectIou(r, o.last) > 0.6); if (m) { o.last = m; o.end = i; next.push(o); m.used = true; } else runs.push(o); }
    for (const r of cur) if (!r.used) next.push({ start: i, end: i, last: r });
    open = next;
  }
  const change = (a, b, box, inside) => { let s = 0, c = 0; for (let y = 0; y < GN; y++) for (let x = 0; x < GN; x++) { const inb = x >= box.x1 && x <= box.x2 && y >= box.y1 && y <= box.y2; if (inb !== inside) continue; const oa = a * GL + (y * GN + x) * 3, ob = b * GL + (y * GN + x) * 3; s += Math.max(Math.abs(buf[oa] - buf[ob]), Math.abs(buf[oa + 1] - buf[ob + 1]), Math.abs(buf[oa + 2] - buf[ob + 2])); c++; } return s / Math.max(1, c); };
  const pops = (r, at) => { if (at < 1 || at >= n) return false; const inn = change(at - 1, at, r.last, true), out = change(at - 1, at, r.last, false); return inn >= 25 && inn >= 2.5 * (out + 2); };
  return runs.filter(r => r.end - r.start + 1 >= 3 && r.end - r.start + 1 <= 28 && (pops(r, r.start) || pops(r, r.end + 1))).map(r => ({ start: +(r.start / GF).toFixed(2), end: +((r.end + 1) / GF).toFixed(2) }));
}
// all cards: the platform's own look + any solid banner, overlapping findings merged
// a card is an overlay on the speaker: findings that fall on a full-screen insert are food photos, dark scenes, etc.
const overInsert = (cards, inserts) => cards.filter(c => !inserts.some(x => Math.min(c.end, x.end) - Math.max(c.start, x.start) >= 0.5 * (c.end - c.start)));
async function detectAllCards(file) {
  const all = [...await detectCards(file), ...await detectBanners(file)].sort((a, b) => a.start - b.start), out = [];
  for (const v of all) { const l = out[out.length - 1]; if (l && v.start <= l.end + 0.3) l.end = Math.max(l.end, v.end); else out.push({ ...v }); }
  return out;
}

// ---- sound cues (audio only): transition sounds such as whooshes ----
// A cue is a sudden rise in loudness whose sound stays noise-like (flat spectrum) for about a third of a second.
// Speech onsets and the letter "s" rise too, but they are not flat for that long. Found in videos made with transition sounds.
function fftInPlace(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) { let cr = 1, ci = 0; for (let k = 0; k < len / 2; k++) { const a = i + k, b = a + len / 2, vr = re[b] * cr - im[b] * ci, vi = re[b] * ci + im[b] * cr; re[b] = re[a] - vr; im[b] = im[a] - vi; re[a] += vr; im[a] += vi; const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr; } }
  }
}
// ---- tempo of the music under the voice ----
// Onsets from five frequency bands (low bands count more: kick and bass), then the beat period that best explains them
// (also its 2x, 4x and half). Speech alone gives a weak, irregular result, so a strong value means that music is playing.
const MB = [[40, 150], [150, 400], [400, 1200], [1200, 3500], [3500, 7500]];
function onsetCurve(x) {
  const N = 512, hop = 160, re = new Float64Array(N), im = new Float64Array(N), E = [];
  for (let st = 0; st + N <= x.length; st += hop) {
    for (let i = 0; i < N; i++) { re[i] = x[st + i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / N)); im[i] = 0; }
    fftInPlace(re, im); const e = new Float64Array(MB.length);
    for (let b = 0; b < MB.length; b++) { const k0 = Math.round(MB[b][0] * N / 16000), k1 = Math.round(MB[b][1] * N / 16000); let q = 0; for (let k = k0; k < k1; k++) q += re[k] * re[k] + im[k] * im[k]; e[b] = Math.log(q + 1); }
    E.push(e);
  }
  const on = new Float64Array(E.length);
  for (let i = 1; i < E.length; i++) { let q = 0; for (let b = 0; b < MB.length; b++) q += Math.max(0, E[i][b] - E[i - 1][b]) * (b < 2 ? 1.4 : 1); on[i] = q; }
  return on;
}
function detectMusic(wavFile) {
  const r = spawnSync('ffmpeg', ['-loglevel', 'error', '-i', wavFile, '-vn', '-ac', '1', '-ar', '16000', '-f', 's16le', 'pipe:1'], { maxBuffer: 1e9 });
  if (!r.stdout || r.stdout.length < 16000 * 2 * 8) return { has: false, bpm: 0, conf: 0 };
  const x = new Int16Array(r.stdout.buffer.slice(r.stdout.byteOffset, r.stdout.byteOffset + (r.stdout.length & ~1))), on = onsetCurve(x);
  let m = 0; for (const v of on) m += v; m /= on.length; const o = on.map(v => v - m);
  const ac = lag => { lag = Math.round(lag); let q = 0, c = 0; for (let i = 0; i + lag < o.length; i++) { q += o[i] * o[i + lag]; c++; } return c ? q / c : 0; };
  let v0 = 0; for (const v of o) v0 += v * v; v0 /= o.length;
  let best = [0, -1e9];
  for (let bpm = 60; bpm <= 170; bpm += 0.5) { const lag = 6000 / bpm, q = (ac(lag) + 0.7 * ac(2 * lag) + 0.4 * ac(4 * lag) + 0.5 * Math.max(0, ac(lag / 2))) / (v0 + 1e-9) * ((bpm >= 80 && bpm <= 160) ? 1.12 : 1); if (q > best[1]) best = [bpm, q]; }
  return { has: best[1] >= 0.15, bpm: +best[0].toFixed(1), conf: +best[1].toFixed(2) };
}
// nearest of our music beds by tempo; half / double time counts a little less (the beat is often felt at the other octave)
function musicMatch(mu, beds) {
  if (!mu || !mu.has) return [];
  return beds.filter(b => b.bpm).map(b => {
    let bestD = 9, how = '';
    for (const [f, pen, label] of [[1, 0, ''], [2, 0.08, ' (double time)'], [0.5, 0.08, ' (half time)']]) { const d = Math.abs(mu.bpm * f - b.bpm) / b.bpm + pen; if (d < bestD) { bestD = d; how = label; } }
    return { id: b.id, d: bestD, how, bpm: b.bpm };
  }).sort((a, b) => a.d - b.d);
}

function soundCues(wavFile) {
  const r = spawnSync('ffmpeg', ['-loglevel', 'error', '-i', wavFile, '-vn', '-ac', '1', '-ar', '16000', '-f', 's16le', 'pipe:1'], { maxBuffer: 1e9 });
  if (!r.stdout || r.stdout.length < 32000) return [];
  const pcm = new Int16Array(r.stdout.buffer.slice(r.stdout.byteOffset, r.stdout.byteOffset + (r.stdout.length & ~1))), SR = 16000, hop = 160, win = 320;
  const db = []; for (let i = 0; i + win <= pcm.length; i += hop) { let s = 0; for (let k = 0; k < win; k++) s += pcm[i + k] * pcm[i + k]; db.push(10 * Math.log10(s / win + 1)); }
  const med = a => { const b = Array.from(a).sort((x, y) => x - y); return b[b.length >> 1]; };
  const sorted = [...db].sort((a, b) => a - b), floor = sorted[Math.floor(sorted.length * 0.1)];
  const flat = t0 => { const N = 512, s = Math.round(t0 * SR), re = new Float64Array(N), im = new Float64Array(N); for (let i = 0; i < N; i++) re[i] = (pcm[s + i] || 0) * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / N)); fftInPlace(re, im); let lg = 0, ar = 0, c = 0; for (let k = 4; k < N / 2; k++) { const m = Math.hypot(re[k], im[k]) + 1e-3; lg += Math.log(m); ar += m; c++; } return Math.exp(lg / c) / (ar / c); };
  const cues = [];
  for (let i = 45; i < db.length - 6; i++) {
    const rise = db[i + 4] - med(db.slice(i - 45, i - 4));
    if (rise < 8 || db[i + 4] < floor + 12) continue;
    const t = i * 0.01, last = cues[cues.length - 1];
    if (last !== undefined && t - last < 0.8) continue;
    if ((flat(t + 0.06) + flat(t + 0.2) + flat(t + 0.32)) / 3 >= 0.45) cues.push(+t.toFixed(2));
  }
  return cues;
}

async function analyze({ file, name, lang = '', log = () => {}, progress = () => {} }) {
  const id = 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 4), work = path.join(DIR, '_work_' + id);
  fs.mkdirSync(work, { recursive: true });
  try {
    const dur = probeDur(file); if (dur < 3) throw new Error('The file is too short or not readable.');
    const visual = !AUDIO_ONLY.test(file) && hasVideo(file);
    progress(0.1);
    const wav = path.join(work, 'a.wav');
    await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', file, '-vn', '-ac', '1', '-ar', '16000', wav]);
    progress(0.2);
    const words = await transcribe(wav, work, lang, log);
    let music = null; try { music = detectMusic(wav); } catch (e) { log('Music detection skipped: ' + e.message); }
    if (!words.length) throw new Error('No speech was found in the sample.');
    progress(0.7);
    const sentences = sentencesOf(words);
    let inserts = [], presenter = false, share = 0, segments = null;
    let source = 'picture', cues = 0, speakers = 0, cards = [];
    if (visual) {
      const segs = detectCuts(await readFrames(file), dur), r = splitSpeaker(segs, dur);
      presenter = r.presenter; share = r.share; speakers = r.speakers; segments = segs.map(x => ({ start: +x.start.toFixed(2), end: +x.end.toFixed(2) })); inserts = r.inserts.map(x => ({ start: +x.start.toFixed(2), end: +x.end.toFixed(2) }));
    } else {
      // audio only: the picture cannot be read, so the picture changes are estimated.
      // 1) transition sounds (whooshes) mark them when the video was made with such sounds; 2) otherwise an insert on most sentences
      const cu = soundCues(wav); cues = cu.length; presenter = true;
      if (cu.length >= 4 && cu.length / dur >= 0.12) {          // regular transition sounds, not a few chance sounds
        source = 'sound';
        cu.forEach((c, i) => { const st = c + 0.06, en = Math.min(cu[i + 1] != null ? cu[i + 1] + 0.06 : dur, st + 5); if (en - st >= 0.8) inserts.push({ start: +st.toFixed(2), end: +en.toFixed(2) }); });
      } else {
        source = 'speech';
        sentences.forEach((s, i) => { if (i > 0 && s.end - s.start >= 1.5) inserts.push({ start: +(s.start + Math.min(0.3, (s.end - s.start) * 0.12)).toFixed(2), end: +Math.min(s.end, s.start + 3.2).toFixed(2) }); });
      }
    }
    if (visual && presenter) { try { cards = overInsert(await detectAllCards(file), inserts); } catch (e) { log('Card detection skipped: ' + e.message); } }
    for (const x of [...inserts, ...cards]) {
      let k = sentences.findIndex(s => x.start >= s.start - 0.05 && x.start < s.end); if (k < 0) k = Math.max(0, sentences.findIndex(s => s.start > x.start) - 1);
      x.sent = k; x.off = +Math.max(0, x.start - sentences[k].start).toFixed(2);
    }
    const first = inserts[0], hook = first && first.start < 1 && first.end - first.start >= 0.8 ? { dur: +Math.min(4, first.end).toFixed(2) } : null;
    const spoken = words[words.length - 1].end - words[0].start, lens = inserts.map(x => x.end - x.start);
    const profile = {
      id, name: String(name || path.basename(file)).slice(0, 80), created: Date.now(), duration: +dur.toFixed(2), visual, source, cues, presenter, speakers, music, lang, hook, sentences, inserts, cards, segments,
      stats: { words: words.length, wps: +(words.length / Math.max(1, spoken)).toFixed(2), sentences: sentences.length, inserts: inserts.length, cards: cards.length, avgInsert: lens.length ? +(lens.reduce((a, b) => a + b, 0) / lens.length).toFixed(2) : 0, perMinute: +(inserts.length / (dur / 60)).toFixed(1), presenterShare: +share.toFixed(2) }
    };
    fs.writeFileSync(fileOf(id), JSON.stringify(profile, null, 1));
    progress(1);
    return profile;
  } finally { try { fs.rmSync(work, { recursive: true, force: true }); } catch {} }
}

// Map the sample's rhythm onto a new script: for every insert of the sample, find the moment of the new text that plays
// the same role (same place in the story, and, when the embedding model is available, a similar meaning).
// mine = [{start,end,text}] sentences of the new script with real timings; total = its duration.
function map(ref, mine, total, sem) {
  const slots = [], report = [], hookDur = ref.hook ? ref.hook.dur : 0;
  if (!mine.length) return { slots, report, hookDur };
  const sim = (a, b) => { const x = sem && sem.get(a), y = sem && sem.get(b); if (!x || !y) return null; let d = 0, na = 0, nb = 0; for (let i = 0; i < x.length; i++) { d += x[i] * y[i]; na += x[i] * x[i]; nb += y[i] * y[i]; } return d / Math.sqrt(na * nb || 1); };
  let lastJ = -1, lastEnd = hookDur;
  const items = [...ref.inserts.map(x => ({ ...x, kind: 'clip' })), ...(ref.cards || []).map(x => ({ ...x, kind: 'card' }))].sort((a, b) => a.start - b.start);
  for (const ins of items) {
    if (hookDur && ins.start < hookDur - 0.01) continue;                       // the hook is placed separately
    const frac = ins.start / ref.duration, rs = ref.sentences[ins.sent] || { text: '' };
    let best = -1, bs = -1e9, bsim = null;
    mine.forEach((s, j) => {
      const midf = (s.start + s.end) / 2 / total, room = s.end - Math.max(s.start, lastEnd + 0.3);
      if (j < lastJ || (j === lastJ && room < 2.4) || s.end - s.start < 1.2) return;
      const near = Math.abs(midf - frac), sm = sim(rs.text, s.text);
      const v = -near * 3 + (sm == null ? 0 : sm * 1.5);
      if (near <= 0.22 && v > bs) { bs = v; best = j; bsim = sm; }
    });
    if (best < 0) continue;
    const s = mine[best], st = Math.max(lastEnd + 0.3, s.start + Math.min(ins.off, (s.end - s.start) * 0.55, 1.2)), len = ins.kind === 'card' ? Math.min(2.4, Math.max(1.2, ins.end - ins.start)) : Math.min(4.5, Math.max(1.2, ins.end - ins.start)), en = Math.min(total - 0.1, st + len);
    if (en - st < 1) continue;
    slots.push({ start: +st.toFixed(2), end: +en.toFixed(2), kind: ins.kind });
    report.push({ kind: ins.kind, refAt: ins.start, refText: rs.text.slice(0, 70), at: +st.toFixed(2), text: s.text.slice(0, 70), sim: bsim == null ? null : +bsim.toFixed(2) });
    lastJ = best; lastEnd = en;
  }
  // a gap shorter than 0.8 s between two inserts would flash the speaker: let the first one run on into the next
  for (let i = 0; i + 1 < slots.length; i++) if (slots[i].kind !== 'card' && slots[i + 1].start - slots[i].end < 0.8) slots[i].end = slots[i + 1].start;
  return { slots, report, hookDur };
}
// Voice-over only projects (no speaker on screen): the picture changes where the sample's picture changed,
// stretched to the new length and moved to the nearest word start. Returns contiguous segments from 0 to total.
function mapSegments(ref, words, total) {
  const src = ref.segments && ref.segments.length ? ref.segments : ref.inserts.map(x => ({ start: x.start, end: x.end }));
  const starts = words.map(w => w.start);
  const bounds = [0];
  for (const sg of src.slice(1)) {
    let t = sg.start / ref.duration * total;
    let best = t, bd = 0.5; for (const w of starts) { const d = Math.abs(w - t); if (d < bd) { bd = d; best = w; } }
    if (best - bounds[bounds.length - 1] >= 1.0 && total - best >= 1.0) bounds.push(+best.toFixed(2));
  }
  return bounds.map((b, i) => ({ start: b, end: i + 1 < bounds.length ? bounds[i + 1] : +total.toFixed(2) }));
}
// picture only: where the picture changes and which parts are inserts (used to cut inserts out of old videos)
async function analyzeVisual(file) {
  const dur = probeDur(file), buf = await readFrames(file), segs = detectCuts(buf, dur), r = splitSpeaker(segs, dur);
  const cut = x => ({ start: +x.start.toFixed(2), end: +x.end.toFixed(2) });
  return { dur, presenter: r.presenter, segments: segs.map(cut), inserts: r.inserts.map(cut) };
}
module.exports = { analyze, map, mapSegments, list, get, remove, musicMatch, detectMusic, analyzeVisual, probeDur, _test: { readFrames, detectCuts, splitSpeaker, detectCards, detectBanners, detectAllCards, overInsert } };
