// Semantic matching: multilingual text embeddings from a local Ollama model (bge-m3). Nothing leaves the machine.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const OLLAMA = process.env.OLLAMA_URL || 'http://localhost:11434';
const MODEL = process.env.EMBED_MODEL || 'bge-m3';
const ROOT = path.join(__dirname, '..');

async function available() {
  try {
    const r = await fetch(OLLAMA + '/api/tags', { signal: AbortSignal.timeout(2500) });
    const j = await r.json();
    return (j.models || []).some(m => m.name === MODEL || m.name.startsWith(MODEL + ':'));
  } catch { return false; }
}

const norm = v => { let s = 0; for (const x of v) s += x * x; s = Math.sqrt(s) || 1; return Float32Array.from(v, x => x / s); };
async function embedRaw(texts) {
  const r = await fetch(OLLAMA + '/api/embed', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: MODEL, input: texts }) });
  if (!r.ok) throw new Error('embed ' + r.status + ' ' + (await r.text()).slice(0, 200));
  return (await r.json()).embeddings.map(norm);
}
const cos = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
const hash = s => crypto.createHash('md5').update(s).digest('hex').slice(0, 12);
const clipText = c => [c.desc || '', (c.tags || []).join(', ')].filter(Boolean).join('. ');

// Builds a matching context for one niche: persistent clip vectors + in-memory text vectors.
async function context(nicheId, items) {
  const file = path.join(ROOT, 'data', 'niches', nicheId, 'emb.json');
  let store = {}; try { store = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
  const clipVec = new Map(), textVec = new Map();
  // clip vectors (only re-embed changed ones)
  const need = items.filter(c => !(store[c.id] && store[c.id].h === hash(clipText(c))));
  for (let i = 0; i < need.length; i += 32) {
    const part = need.slice(i, i + 32), vs = await embedRaw(part.map(clipText));
    part.forEach((c, k) => { store[c.id] = { h: hash(clipText(c)), v: Array.from(vs[k], x => +x.toFixed(5)) }; });
  }
  if (need.length) fs.writeFileSync(file, JSON.stringify(store));
  for (const c of items) if (store[c.id]) clipVec.set(c.id, Float32Array.from(store[c.id].v));
  return {
    clip: id => clipVec.get(id) || null,
    get: text => textVec.get(text) || null,
    async ensure(texts) {
      const miss = [...new Set(texts)].filter(t => t && !textVec.has(t));
      for (let i = 0; i < miss.length; i += 32) { const part = miss.slice(i, i + 32), vs = await embedRaw(part); part.forEach((t, k) => textVec.set(t, vs[k])); }
    }
  };
}
module.exports = { available, context, cos, MODEL };
