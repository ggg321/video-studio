// Uploaded clips that find their own niche. A clip is described (a few frames -> a local vision model, plus the words of its file name and tags),
// the description becomes a vector (bge-m3, as for the matching of clips to phrases) and is compared with every niche:
// with the name of the niche and with the clips it already holds. A clear winner takes the clip, a doubtful one waits in a queue for one click.
const fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');
const niches = require('./niches'), embed = require('./embed');
const ROOT = path.join(__dirname, '..');
const OLLAMA = process.env.OLLAMA_URL || 'http://127.0.0.1:11434', VISION = process.env.VISION_MODEL || 'gemma3:4b';
const PENDING = process.env.AUTONICHE_FILE || path.join(ROOT, 'data', 'auto_pending.json');
const INBOX = path.join(ROOT, 'data', 'auto_inbox');
const T = { min: +process.env.AUTONICHE_MIN || 0.55, margin: +process.env.AUTONICHE_MARGIN || 0.10 };

const readP = () => { try { return JSON.parse(fs.readFileSync(PENDING, 'utf8')); } catch { return []; } };
const writeP = a => fs.writeFileSync(PENDING, JSON.stringify(a, null, 1));
const nameWords = f => String(f || '').replace(/\.[^.]+$/, '').replace(/^[a-z0-9]{6,9}_/, '').toLowerCase().split(/[^a-z0-9а-яіїєё]+/).filter(t => t.length > 3 && !/^\d+$/.test(t));

// three frames of the clip as base64 jpg
function frames(file) {
  const d = parseFloat(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' }).stdout) || 3, out = [];
  for (const k of [0.2, 0.5, 0.8]) {
    const r = spawnSync('ffmpeg', ['-v', 'error', '-ss', String((d * k).toFixed(2)), '-i', file, '-frames:v', '1', '-vf', 'scale=384:-2', '-f', 'image2pipe', '-vcodec', 'mjpeg', '-'], { encoding: 'buffer', maxBuffer: 8e6 });
    if (r.status === 0 && r.stdout.length > 500) out.push(r.stdout.toString('base64'));
  }
  return out;
}
// -> { desc, tags } in English (the library is matched on English words)
async function describe(file) {
  try {
    const imgs = frames(file); if (!imgs.length) return null;
    const r = await fetch(OLLAMA + '/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(90000),
      body: JSON.stringify({ model: VISION, stream: false, format: 'json', options: { temperature: 0.1 },
        messages: [{ role: 'user', content: 'These are three frames of one short video clip. Say what is shown. Answer as JSON: {"desc":"one short sentence","tags":["8 to 12 single-word or two-word keywords: objects, activity, setting, topic"]}', images: imgs }] }) });
    const j = await r.json(), o = JSON.parse((j.message && j.message.content) || '{}');
    return { desc: String(o.desc || '').slice(0, 240), tags: (Array.isArray(o.tags) ? o.tags : []).map(t => String(t).toLowerCase().trim()).filter(Boolean).slice(0, 12) };
  } catch { return null; }
}

const mean = vs => { const m = new Float32Array(vs[0].length); for (const v of vs) for (let i = 0; i < m.length; i++) m[i] += v[i]; let s = 0; for (const x of m) s += x * x; s = Math.sqrt(s) || 1; return m.map(x => x / s); };
// ranked niches for a text: [{ id, name, score }]
async function rank(text) {
  const list = niches.list();
  const q = (await embedRaw([text]))[0], out = [];
  for (const n of list) {
    const nn = niches.get(n.id);
    const ctx = nn.items.length ? await embed.context(n.id, nn.items) : null;
    const vecs = ctx ? nn.items.map(c => ctx.clip(c.id)).filter(Boolean) : [];
    const nameV = (await embedRaw([n.name + (nn.about ? '. ' + nn.about : '')]))[0];
    const sName = embed.cos(q, nameV);
    let sClips = 0;
    if (vecs.length) {
      const cs = vecs.map(v => embed.cos(q, v)).sort((a, b) => b - a);
      sClips = 0.6 * cs.slice(0, 3).reduce((s, x) => s + x, 0) / Math.min(3, cs.length) + 0.4 * embed.cos(q, mean(vecs));
    }
    // a niche with few clips leans on its name; a rich one on its clips
    const w = Math.min(1, vecs.length / 20);
    out.push({ id: n.id, name: n.name, score: +(w * sClips + (1 - w) * sName).toFixed(3), clips: vecs.length });
  }
  return out.sort((a, b) => b.score - a.score);
}
async function embedRaw(texts) {
  const r = await fetch(OLLAMA + '/api/embed', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: embed.MODEL, input: texts }) });
  const e = (await r.json()).embeddings; return e.map(v => { let s = 0; for (const x of v) s += x * x; s = Math.sqrt(s) || 1; return Float32Array.from(v, x => x / s); });
}
const verdict = ranked => {
  const a = ranked[0], b = ranked[1];
  return !!a && a.score >= T.min && (!b || a.score - b.score >= T.margin);
};

// one saved file in INBOX: -> { placed: {niche, id} } or { pending: id }
async function sort(file, origName, userTags = [], asHooks = false) {
  const d = await describe(file) || { desc: '', tags: [] };
  const tags = [...new Set([...userTags, ...d.tags, ...nameWords(origName)])];
  const text = [d.desc, tags.join(', ')].filter(Boolean).join('. ') || String(origName || '');
  if (asHooks) return place(file, origName, niches.HOOKS, [...new Set(['hook', ...tags])], d.desc, []);
  let ranked = []; try { ranked = await rank(text); } catch {}
  if (verdict(ranked)) return place(file, origName, ranked[0].id, tags, d.desc, ranked);
  const items = readP(), id = 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  items.push({ id, file: path.basename(file), orig: origName, desc: d.desc, tags, ranked: ranked.slice(0, 3), at: Date.now() });
  writeP(items); return { pending: id, ranked: ranked.slice(0, 3), desc: d.desc };
}
function place(file, origName, nicheId, tags, desc, ranked) {
  const n = niches.get(nicheId, { own: true });
  fs.mkdirSync(n.files, { recursive: true });
  let dup = null; try { dup = require('./dupes').checkFile(nicheId, file); } catch {}
  if (dup) { try { fs.unlinkSync(file); } catch {} return { duplicate: { niche: nicheId, name: n.name, of: dup.of }, desc }; }
  const dest = path.basename(file); fs.renameSync(file, path.join(n.files, dest));
  const cid = niches.addClip(nicheId, dest, tags, origName);
  if (desc) niches.updateClip(nicheId, cid, { desc });
  return { placed: { niche: nicheId, name: n.name, id: cid }, ranked: ranked ? ranked.slice(0, 3) : [], desc };
}
const pending = () => readP().map(p => ({ ...p, thumb: '/auto-inbox/' + encodeURIComponent(p.file) }));
// the user's choice for a waiting clip
function choose(id, nicheId) {
  const items = readP(), i = items.findIndex(p => p.id === id); if (i < 0) return { error: 'Not found.' };
  const p = items[i], file = path.join(INBOX, p.file);
  if (nicheId === 'skip') { try { fs.unlinkSync(file); } catch {} items.splice(i, 1); writeP(items); return { removed: true }; }
  if (!niches.list().some(n => n.id === nicheId)) return { error: 'No such niche.' };
  const r = place(file, p.orig, nicheId, p.tags, p.desc, p.ranked); items.splice(i, 1); writeP(items); return r;
}
module.exports = { sort, pending, choose, describe, rank, verdict, INBOX, T };
