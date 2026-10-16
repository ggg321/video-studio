// Cut inserts out of finished videos of the archive and offer them for the library.
// For each video: find the inserts (everything that is not the speaker), find burned-in subtitles and crop them away,
// write down what was said while each insert was on screen (tags), mark clips that the library already has.
// Nothing reaches the library until a person ticks the clips and confirms. Only the picture is used (no sound).
const fs = require('fs'), path = require('path');
const { spawnSync } = require('child_process');
const reference = require('./reference'), { transcribe } = require('./transcribe'), niches = require('./niches');
const DIR = process.env.HARVEST_DIR || path.join(__dirname, '..', 'data', 'harvest');
fs.mkdirSync(DIR, { recursive: true });

const bdir = id => path.join(DIR, id.replace(/[^\w-]/g, ''));
const bfile = id => path.join(bdir(id), 'batch.json');
const read = id => { try { return JSON.parse(fs.readFileSync(bfile(id), 'utf8')); } catch { return null; } };
const write = b => { fs.mkdirSync(bdir(b.id), { recursive: true }); fs.writeFileSync(bfile(b.id), JSON.stringify(b, null, 1)); };
const ff = (args, opt = {}) => spawnSync('ffmpeg', ['-loglevel', 'error', ...args], { maxBuffer: 1e9, ...opt });
const STOP = new Set('the a an and or but if then so to of in on at for with from by is are was were be been it its this that you your we our they their he she i me my not no do does did have has had will would can could should as how what when why who which там тут это этот эта эти что как когда почему если или для при про над под без все всё его её их мы вы они она оно мой наш ваш твой нет да так уже ещё еще только можно нужно надо будет была были быть це цей ця ці що як коли чому якщо або для при про над під без всі його її їх ми ви вони вона воно мій наш ваш твій немає так вже ще тільки можна треба буде була були бути'.split(' '));
const contentWords = text => [...new Set(String(text || '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(w => w.length > 3 && !STOP.has(w)))];

// ---- burned-in subtitles: outlined white text (white pixels with a dark pixel next to them) repeating in the same rows ----
const SW = 270, SH = 480;
function subtitleZone(file, dur) {
  const n = 14, freq = new Float64Array(SH);
  let got = 0;
  for (let i = 0; i < n; i++) {
    const t = dur * (i + 0.5) / n, r = ff(['-ss', t.toFixed(2), '-i', file, '-frames:v', '1', '-vf', `scale=${SW}:${SH}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']);
    const buf = r.stdout; if (!buf || buf.length < SW * SH * 3) continue; got++;
    const lum = (x, y) => { const o = (y * SW + x) * 3; return 0.299 * buf[o] + 0.587 * buf[o + 1] + 0.114 * buf[o + 2]; };
    for (let y = 2; y < SH - 2; y++) {
      let c = 0;
      for (let x = 3; x < SW - 3; x++) { const o = (y * SW + x) * 3; if (buf[o] < 225 || buf[o + 1] < 225 || buf[o + 2] < 225) continue; if (lum(x - 3, y) < 70 || lum(x + 3, y) < 70 || lum(x - 2, y) < 70 || lum(x + 2, y) < 70) c++; }
      if (c / SW > 0.012) freq[y]++;
    }
  }
  if (got < 6) return null;
  const rows = []; for (let y = 0; y < SH; y++) if (freq[y] / got >= 0.35) rows.push(y);
  const bands = []; for (const y of rows) { const l = bands[bands.length - 1]; if (l && y - l[1] <= 6) l[1] = y; else bands.push([y, y]); }
  const b = bands.filter(x => x[1] - x[0] >= 5 && x[0] / SH > 0.3)[0];
  return b ? { top: +(b[0] / SH).toFixed(3), bottom: +(b[1] / SH).toFixed(3) } : null;
}

// ---- "have we got this already": 64-bit average hashes, two per second, of the top part of the picture (the subtitles are below it) ----
function hashesOf(file, from, len) {
  const r = ff(['-ss', Math.max(0, from).toFixed(2), '-t', Math.max(0.5, len).toFixed(2), '-i', file, '-an', '-vf', 'fps=2,crop=iw:ih*0.6:0:0,crop=min(iw\\,ih):min(iw\\,ih),scale=8:8:flags=area,format=gray', '-f', 'rawvideo', '-']);
  const b = r.stdout || Buffer.alloc(0), out = [];
  for (let k = 0; k + 64 <= b.length && out.length < 24; k += 64) {
    let m = 0; for (let i = 0; i < 64; i++) m += b[k + i]; m /= 64;
    let hx = ''; for (let i = 0; i < 64; i += 4) { let v = 0; for (let q = 0; q < 4; q++) v = (v << 1) | (b[k + i + q] > m ? 1 : 0); hx += v.toString(16); }
    out.push(hx);
  }
  return out;
}
const ham = (a, b) => { let d = 0; for (let i = 0; i < a.length; i++) { let x = parseInt(a[i], 16) ^ parseInt(b[i], 16); while (x) { d += x & 1; x >>= 1; } } return d; };
// hashes of the library clips (cached per niche)
function libraryHashes(nicheId) {
  const n = niches.get(nicheId, { own: true }), f = path.join(__dirname, '..', 'data', 'niches', n.id, 'hashes2.json');
  let c = {}; try { c = JSON.parse(fs.readFileSync(f, 'utf8')); } catch {}
  let changed = false;
  for (const it of n.items) {
    if (c[it.id]) continue;
    const full = path.join(n.files, it.file); if (!fs.existsSync(full)) continue;
    c[it.id] = hashesOf(full, 0, Math.min(it.dur || 8, 12)); changed = true;
  }
  if (changed) fs.writeFileSync(f, JSON.stringify(c));
  return c;
}
const NEAR = 6;
function duplicateOf(hs, lib, others) {
  let best = { d: 99, id: null };
  for (const [id, arr] of Object.entries(lib)) for (const a of hs) for (const b of arr) { const d = ham(a, b); if (d < best.d) best = { d, id }; }
  if (best.d <= NEAR) return { of: best.id, d: best.d };
  for (const o of others) for (const a of hs) for (const b of o.hashes) if (ham(a, b) <= NEAR) return { of: 'batch', d: ham(a, b) };
  return null;
}

const jaccard = (a, b) => { const A = new Set(a), B = new Set(b); let i = 0; for (const x of A) if (B.has(x)) i++; return A.size + B.size ? i / (A.size + B.size - i) : 0; };

// ---- one batch ----
async function run(id, log = () => {}) {
  const b = read(id); if (!b) return;
  const n = niches.get(b.niche), lib = libraryHashes(n.id), seen = [];
  const set = (patch) => { Object.assign(b, patch); write(b); };
  try {
    for (const f of b.files) {
      f.status = 'analyzing'; write(b);
      const src = path.join(bdir(id), 'src', f.stored);
      const dur = reference.probeDur(src); f.dur = +dur.toFixed(1);
      if (dur < 3) { f.status = 'skipped'; f.note = 'The file is too short or not readable.'; write(b); continue; }
      // what was said (for the tags)
      const wav = path.join(bdir(id), 'a_' + f.stored + '.wav'), work = path.join(bdir(id), 'w_' + f.stored); fs.mkdirSync(work, { recursive: true });
      ff(['-y', '-i', src, '-vn', '-ac', '1', '-ar', '16000', wav]);
      let words = []; try { words = await transcribe(wav, work, b.lang, log); } catch (e) { log('Speech recognition skipped: ' + e.message); }
      try { fs.rmSync(work, { recursive: true, force: true }); fs.unlinkSync(wav); } catch {}
      f.words = words.map(w => w.text).join(' ').slice(0, 4000); f.bag = contentWords(f.words);
      const v = await reference.analyzeVisual(src);
      const subs = b.subs === 'none' ? null : subtitleZone(src, dur);
      f.subs = subs ? { top: subs.top } : null; f.speaker = v.presenter;
      f.cands = (v.presenter ? v.inserts : v.segments).map(s => ({ ...s })); f.nc = f.cands.length; f._words = words;
      f.status = 'analyzed'; write(b);
    }
    // a clean version of the same video beats the one with subtitles
    for (const a of b.files) for (const c of b.files) {
      if (a === c || a.status !== 'analyzed' || c.status !== 'analyzed' || !a.subs || c.subs) continue;
      if (Math.abs(a.dur - c.dur) <= 1.5 && jaccard(a.bag, c.bag) >= 0.7 && c.nc >= Math.max(1, Math.round(0.7 * a.nc))) { a.status = 'skipped'; a.note = 'A version without subtitles (' + c.name + ') is used instead.'; }
    }
    b.clips = []; fs.mkdirSync(path.join(bdir(id), 'clips'), { recursive: true });
    for (const f of b.files) {
      if (f.status !== 'analyzed') continue;
      const src = path.join(bdir(id), 'src', f.stored);
      const crop = b.subs === 'crop' ? (f.subs ? f.subs.top : 0.72) : (f.subs ? f.subs.top : null);
      const keep = crop ? Math.max(0.35, Math.min(0.95, crop - 0.05)) : null;
      for (const s of f.cands) {
        let a = s.start + 0.25, e = s.end - 0.25; if (e - a < 0.9) continue;
        if (e - a > 8) { const mid = (a + e) / 2; a = mid - 4; e = mid + 4; }
        const k = b.clips.length + 1, name = 'c' + k + '.mp4', out = path.join(bdir(id), 'clips', name);
        const vf = keep ? `crop=iw:trunc(ih*${keep}/2)*2:0:0` : 'null';
        const r = ff(['-y', '-ss', a.toFixed(2), '-t', (e - a).toFixed(2), '-i', src, '-an', '-vf', vf, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-movflags', '+faststart', out]);
        if (r.status !== 0 || !fs.existsSync(out)) continue;
        ff(['-y', '-ss', ((e - a) / 2).toFixed(2), '-i', out, '-frames:v', '1', '-vf', 'scale=240:-2', path.join(bdir(id), 'clips', 'c' + k + '.jpg')]);
        const hh = hashesOf(src, a, e - a);       // taken from the uncropped source, top part only: comparable with the library
        const dup = duplicateOf(hh, lib, seen); seen.push({ hashes: hh });
        const said = (f._words || []).filter(w => w.end > s.start && w.start < s.end).map(w => w.text).join(' ');
        b.clips.push({ n: k, file: name, thumb: 'c' + k + '.jpg', src: f.name, start: +a.toFixed(2), end: +e.toFixed(2), dur: +(e - a).toFixed(1), cropped: !!keep, tags: contentWords(said).slice(0, 6), desc: said.slice(0, 200), dup: dup ? dup.of : null });
      }
    }
    for (const f of b.files) { delete f._words; delete f.cands; delete f.nc; if (f.status === 'analyzed') f.status = 'done'; }
    set({ status: 'done', finished: Date.now() });
  } catch (e) { console.error('harvest:', e.message); set({ status: 'failed', error: String(e.message).slice(0, 200) }); }
}

function create({ id, files, niche, lang, subs }) {
  id = id || ('h' + Date.now().toString(36) + Math.random().toString(36).slice(2, 4));
  const b = { id, created: Date.now(), status: 'queued', niche, lang: lang || '', subs: ['auto', 'none', 'crop'].includes(subs) ? subs : 'auto', files: files.map(f => ({ name: f.name, stored: f.stored, status: 'queued' })), clips: [] };
  write(b); return b;
}
// add the chosen clips to the library; the batch folder is removed afterwards
function addToLibrary(id, nicheId, picks) {
  const b = read(id); if (!b) throw new Error('Batch not found.');
  const n = niches.get(nicheId); fs.mkdirSync(n.files, { recursive: true });
  let added = 0;
  for (const p of picks) {
    const c = b.clips.find(x => x.n === +p.n); if (!c) continue;
    const fn = 'harvest_' + id + '_' + c.n + '.mp4'; fs.copyFileSync(path.join(bdir(id), 'clips', c.file), path.join(n.files, fn));
    const tags = (Array.isArray(p.tags) ? p.tags : String(p.tags || '').split(',')).map(t => String(t).trim().toLowerCase()).filter(Boolean);
    const cid = niches.addClip(n.id, fn, ['harvest', ...tags], c.src);
    niches.updateClip(n.id, cid, { desc: String(p.desc != null ? p.desc : c.desc).slice(0, 300) }); added++;
  }
  discard(id); return added;
}
function discard(id) { try { fs.rmSync(bdir(id), { recursive: true, force: true }); } catch {} }
function list() { return fs.readdirSync(DIR).filter(d => fs.existsSync(path.join(DIR, d, 'batch.json'))).map(d => { const b = read(d); return b && { id: b.id, created: b.created, status: b.status, files: b.files.length, clips: (b.clips || []).length }; }).filter(Boolean).sort((a, b) => b.created - a.created); }
module.exports = { create, run, read, addToLibrary, discard, list, subtitleZone, hashesOf, libraryHashes, duplicateOf, DIR, bdir };
