// Autofill: once a day the platform looks for free stock clips for the most frequent gaps of a niche (moments no clip fits)
// and puts them in "Candidates to review". Nothing reaches the library without a click. Only free sources (Pexels, Pixabay);
// their licence allows commercial use without attribution, the link to the source is kept with the clip.
const fs = require('fs'), path = require('path');
const stock = require('./stock'), sources = require('./sources'), niches = require('./niches');
const DIR = process.env.AUTOFILL_DIR || path.join(__dirname, '..', 'data', 'autofill');
const STATE = path.join(DIR, 'state.json');
fs.mkdirSync(DIR, { recursive: true });
const rd = () => { try { return JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch { return { candidates: [], rejected: [], tried: [], lastRun: 0 }; } };
const wr = s => fs.writeFileSync(STATE, JSON.stringify(s, null, 1));
const OLLAMA = process.env.OLLAMA_URL || 'http://127.0.0.1:11434', MODEL = process.env.REVIEW_MODEL || 'gemma3:4b';

// stock sites search in English: a short English phrase for the moment (local model; falls back to the words of the text)
async function englishQuery(text, fallback) {
  if (!/[^\u0000-\u007f]/.test(String(text))) return fallback;
  try {
    const r = await fetch(OLLAMA + '/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(60000),
      body: JSON.stringify({ model: MODEL, stream: false, keep_alive: '5m', options: { temperature: 0.2, num_predict: 24 }, prompt: 'Write a 2 to 4 word English search phrase for a stock video that illustrates this sentence. Reply with the phrase only, no quotes.\nSentence: ' + text }) });
    const j = await r.json(), q = String(j.response || '').replace(/["\n.]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
    return q.length >= 3 ? q : fallback;
  } catch { return fallback; }
}

const list = nicheId => rd().candidates.filter(c => !nicheId || c.niche === nicheId);
const status = () => { const s = rd(); return { lastRun: s.lastRun || 0, candidates: s.candidates.length, lastError: s.lastError || '' }; };

async function run({ nicheId, settings, projects, perRun = 5, queryOf, log = () => {} }) {
  const s = settings; if (!s.pexelsKey && !s.pixabayKey) throw new Error('Add a free Pexels or Pixabay key (Settings).');
  const st = rd(), n = niches.get(nicheId, { own: true });
  const have = new Set(st.candidates.filter(c => c.niche === n.id).map(c => c.gapKey));
  const ov = sources.overview(projects, n.id, n.items);
  let made = 0;
  for (const g of ov.gaps) {
    if (made >= perRun) break;
    if (have.has(g.key) || (st.tried || []).includes(n.id + ':' + g.key)) continue;
    st.tried = [...(st.tried || []), n.id + ':' + g.key].slice(-500);
    const q = await englishQuery(g.text, queryOf(g.text)); if (!q) continue;
    let items = []; try { items = await stock.search(q, s, true); } catch (e) { log('stock: ' + e.message); st.lastError = e.message; continue; }
    const pick = items.filter(x => !st.rejected.includes(x.id) && x.dur >= 3 && x.dur <= 30).slice(0, 2);
    for (const it of pick) {
      const dir = path.join(DIR, n.id); fs.mkdirSync(dir, { recursive: true });
      let file; try { file = await stock.download({ id: it.id, url: it.url }, dir); } catch (e) { log('download: ' + e.message); continue; }
      st.candidates.push({ id: 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 4), niche: n.id, gapKey: g.key, text: g.text, query: q, file, thumb: it.thumb, source: it.source, page: it.page || '', dur: it.dur, stockId: it.id, at: Date.now() });
      made++;
    }
    wr(st);
  }
  st.lastRun = Date.now(); st.lastError = made ? '' : (st.lastError || ''); wr(st);
  return { made };
}
// the person accepts a candidate: it goes to the library with the moment as its description
function accept(id, tags) {
  const st = rd(), c = st.candidates.find(x => x.id === id); if (!c) throw new Error('Candidate not found.');
  const n = niches.get(c.niche); fs.mkdirSync(n.files, { recursive: true });
  const fn = 'autofill_' + c.file; fs.copyFileSync(path.join(DIR, c.niche, c.file), path.join(n.files, fn));
  const cid = niches.addClip(n.id, fn, ['stock', c.source || 'stock', ...tags], c.page || c.file);
  niches.updateClip(n.id, cid, { desc: String(c.text).slice(0, 300) });
  st.candidates = st.candidates.filter(x => x.id !== id);
  if (!st.candidates.some(x => x.niche === c.niche && x.file === c.file)) { try { fs.unlinkSync(path.join(DIR, c.niche, c.file)); } catch {} }
  wr(st); return cid;
}
function reject(id) {
  const st = rd(), c = st.candidates.find(x => x.id === id); if (!c) return false;
  st.rejected = [...(st.rejected || []), c.stockId].slice(-1000); st.candidates = st.candidates.filter(x => x.id !== id);
  if (!st.candidates.some(x => x.niche === c.niche && x.file === c.file)) { try { fs.unlinkSync(path.join(DIR, c.niche, c.file)); } catch {} }
  wr(st); return true;
}
module.exports = { run, list, status, accept, reject, englishQuery, DIR };
