// Turn aligned script words into a cut list: where inserts appear and which clip.
const { norm } = require('./script');
const fs = require('fs'), path = require('path');
const LIB = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'library.json'), 'utf8'));
const GENERIC = ['c02', 'c03', 'c70', 'c01', 'c67', 'c61', 'c24', 'c22', 'c69', 'c76', 'c64', 'c75', 'c74', 'c71'];

function wordMatches(w, tag) {
  if (w.length < 4 || tag.length < 4) return w === tag;
  const k = Math.min(5, w.length, tag.length);
  return w.slice(0, k) === tag.slice(0, k);
}
function score(words, clip) {
  let s = 0;
  for (const w of words) for (const t of clip.tags) if (wordMatches(w, norm(t))) { s++; break; }
  return s;
}
const SIM_MIN = 0.45;   // minimum cosine similarity for a semantic match to count as "fits"
const { cos } = require('./embed');
// How much the user's earlier decisions about this clip (accepted / rejected in similar contexts) change its score.
function fbBonus(clipId, tv, words, fb) {
  if (!fb) return 0;
  let bonus = fb.prior.get(clipId) || 0;
  const list = fb.byClip.get(clipId);
  if (list) {
    const ws = new Set(words.filter(w => w.length > 2));
    for (const e of list) {
      let sim, thr;
      if (tv && e.vec) { sim = cos(tv, e.vec); thr = 0.6; }
      else { let inter = 0; for (const w of e.words) if (ws.has(w)) inter++; sim = inter / Math.max(1, new Set([...e.words, ...ws]).size); thr = 0.3; }
      if (sim >= thr) bonus += e.sign * e.w * (sim - (thr - 0.1)) * 14;
    }
  }
  return Math.max(-14, Math.min(8, bonus));
}
// score of one clip for one phrase: { s, m (keyword hits), sim (semantic), fb (history bonus) }
function scoreClip(c, words, used, ctx) {
  const tv = ctx && ctx.sem ? ctx.sem.get(ctx.text) : null;
  const m = score(words, c);
  let sim = 0; if (tv) { const cv = ctx.sem.clip(c.id); if (cv) sim = cos(tv, cv); }
  const fb = fbBonus(c.id, tv, words, ctx && ctx.fb);
  const s = m * 3 + (sim > 0 ? Math.max(0, sim - 0.25) * 18 : 0) - (used ? (used.get(c.id) || 0) * 4 : 0) + (c.watermark ? -1 : 0) + ((c.id.charCodeAt(2) * 7) % 5) / 10 + fb;
  return { s, m, sim, fb };
}
// ctx = { text, sem, fb } enables semantic scoring (embedding vectors) and learning from earlier decisions
function pick(words, used, lib = LIB, ctx = null) {
  let best = null, bs = -1e9, raw = 0, bestSim = 0;
  for (const c of lib) {
    if (c.avoid || (ctx && ctx.avoid === c.id)) continue;   // never the same clip twice in a row
    const r = scoreClip(c, words, used, ctx);
    if (r.s > bs) { bs = r.s; best = c; raw = r.m; bestSim = r.sim; }
  }
  return { clip: best, matches: raw + (bestSim >= SIM_MIN ? 1 : 0), sim: bestSim };
}
// every library clip ranked for a phrase (used by the Swap dialog)
function rank(text, words, lib, ctx) {
  return lib.filter(c => !c.avoid).map(c => ({ clip: c, ...scoreClip(c, words, null, { ...ctx, text }) })).sort((x, y) => y.s - x.s);
}

const STOP = new Set('a an the and or but if then so to of in on at for with from by is are was were be been am it its this that these those you your we our they their he she i me my not no do does did have has had will would can could should as about into than too very just right because next one'.split(' ')
  .concat('der die das und oder aber ein eine ist sind war nicht mit von zu auf für den dem des im ich du wir sie ihr es sich auch noch nur sehr le la les un une des et ou mais est sont pas que qui dans pour avec sur ce cette je tu nous vous ils elle el los las un una y o pero es son no que con por para en de del se lo al su mi tu il lo gli un uno una e o ma è sono non che con per su di da in si mi ti os as um uma e ou mas é são não que com por para em de do da no na se eu tu nós jak to się nie na że z w i oraz ale jest są dla do od po ten ta и в во не что он на я с со как а то все она так его но да ты к у же вы за бы по только ее мне было вот от меня еще нет о из ему теперь когда и в не що він на я з як а то все вона так його але так ти до у же ви за би по тільки її мені було ось від мене ще ні про із йому тепер коли'.split(' ')).concat('de het een en of maar als dan om te van in op aan voor met uit door is zijn was waren je jouw we ons ze hun hij zij ik mij mijn niet geen dit dat deze die ook nog maar heel gewoon'.split(' ')));
// Pick up to 3 meaningful words from a sentence for an on-screen card.
function keyPhrase(rawWords) {
  const clean = rawWords.map(w => w.replace(/[^\p{L}\p{N}'-]/gu, '')).filter(Boolean);
  const keep = clean.filter(w => !STOP.has(w.toLowerCase()) && w.length > 2);
  const pool = keep.length ? keep : clean;
  return pool.slice(0, 3).join(' ').toUpperCase();
}

function buildSentences(aligned) {
  const map = new Map();
  for (const w of aligned.words) {
    const key = w.block + ':' + w.sent;
    if (!map.has(key)) map.set(key, { block: w.block, sent: w.sent, words: [], raw: [], start: w.start, end: w.end });
    const s = map.get(key); s.words.push(w.n); s.raw.push(w.w); s.end = w.end;
  }
  return [...map.values()].map(s => ({ ...s, text: s.raw.join(' ') }));
}

// Split into short phrases (clauses) of >= minLen seconds, so inserts/cards can land more often than once per sentence.
function buildUnits(aligned, minLen = 1.6) {
  const units = []; let cur = null;
  const flush = () => { if (cur) { cur.text = cur.raw.join(' '); units.push(cur); cur = null; } };
  for (const w of aligned.words) {
    if (!cur) cur = { block: w.block, sent: w.sent, words: [], raw: [], start: w.start, end: w.end };
    cur.words.push(w.n); cur.raw.push(w.w); cur.end = w.end;
    if (/[.,!?;:]$/.test(w.w) && cur.end - cur.start >= minLen) flush();
  }
  flush();
  // merge a short tail into the previous unit
  if (units.length > 1 && units[units.length - 1].end - units[units.length - 1].start < minLen * 0.7) {
    const t = units.pop(), l = units[units.length - 1];
    l.words.push(...t.words); l.raw.push(...t.raw); l.end = t.end; l.text = l.raw.join(' ');
  }
  return units;
}

function plan(aligned, { presenter = true, total, clips = true, lib = LIB, sem = null, fb = null, template = null, segTemplate = null, cards = true }) {
  const generic = [...new Set([...lib.filter(c => c.tags.includes('generic')).map(c => c.id), ...GENERIC.filter(id => lib.some(c => c.id === id)), ...lib.slice(0, 10).map(c => c.id)])];
  const sents = buildSentences(aligned);
  const used = new Map(), cuts = [], zooms = [];
  if (presenter) {
    const units = buildUnits(aligned);
    if (template && template.length) {
      // rhythm taken from a sample video: the inserts sit at the given moments (clip chosen by the meaning of the words there)
      let k = 0;
      template.forEach(sl => {
        const ws = aligned.words.filter(w => w.end > sl.start && w.start < sl.end); if (!ws.length) return;
        const words = ws.map(w => w.n), raw = ws.map(w => w.w), text = raw.join(' ');
        if (sl.kind === 'card') { if (cards) cuts.push({ start: sl.start, end: sl.end, clip: 'card', card: keyPhrase(raw), variant: k % 2, text }); k++; return; }
        const { clip, matches, sim } = pick(words, used, lib, { text, sem, fb });
        if (clips && clip && matches > 0) { used.set(clip.id, (used.get(clip.id) || 0) + 1); cuts.push({ start: sl.start, end: sl.end, clip: clip.id, text, ...(sim > 0 ? { sim: +sim.toFixed(2) } : {}) }); }
        else if (cards) cuts.push({ start: sl.start, end: +Math.min(sl.end, sl.start + 2.4).toFixed(2), clip: 'card', card: keyPhrase(raw), variant: k % 2, text });
        k++;
      });
      units.forEach((u, i) => { const dur = u.end - u.start; if (!cuts.some(c => c.start < u.end && c.end > u.start) && dur >= 1.2 && (zooms.length % 2 === 0 || i % 2 === 1)) zooms.push({ start: +u.start.toFixed(2), end: +u.end.toFixed(2) }); });
    } else {
    let lastInsertEnd = -10, k = 0;
    units.forEach((u, i) => {
      const dur = u.end - u.start;
      const canInsert = i > 0 && u.start - lastInsertEnd >= 0.9 && dur >= 1.5;
      if (canInsert) {
        const st = u.start + Math.min(0.3, dur * 0.12), len = Math.min(3.2, u.end - st - 0.05);
        const { clip, matches, sim } = pick(u.words, used, lib, { text: u.text, sem, fb });
        if (clips && clip && matches > 0) {
          used.set(clip.id, (used.get(clip.id) || 0) + 1);
          cuts.push({ start: +st.toFixed(2), end: +(st + len).toFixed(2), clip: clip.id, text: u.text, ...(sim > 0 ? { sim: +sim.toFixed(2) } : {}) });
          lastInsertEnd = st + len; k++; return;
        }
        if (!cards) return;                                  // text cards switched off: the speaker stays on screen
        cuts.push({ start: +st.toFixed(2), end: +(st + Math.min(len, 2.4)).toFixed(2), clip: 'card', card: keyPhrase(u.raw), variant: k % 2, text: u.text });
        lastInsertEnd = st + Math.min(len, 2.4); k++; return;
      }
      // no insert here: punch in on the presenter on every second such phrase
      if (dur >= 1.2 && zooms.length % 2 === 0 || dur >= 1.2 && i % 2 === 1) zooms.push({ start: +u.start.toFixed(2), end: +u.end.toFixed(2) });
    });
    }
  } else {
    let prevClip = null;
    if (segTemplate && segTemplate.length) {
      // rhythm taken from a sample video: the picture changes at the given moments
      segTemplate.forEach((sg, i) => {
        const ws = aligned.words.filter(w => w.end > sg.start && w.start < sg.end), words = ws.map(w => w.n), raw = ws.map(w => w.w), text = raw.join(' ');
        let { clip, matches } = pick(words, used, lib, { text, sem, fb, avoid: prevClip });
        if (matches <= 0 && generic.length) { const g = generic.filter(id => !used.get(id)); clip = lib.find(c => c.id === (g[0] || generic[i % generic.length])); }
        if (!clip || !generic.length && matches <= 0 && cards) { if (cards) cuts.push({ start: sg.start, end: sg.end, clip: 'card', card: keyPhrase(raw), variant: i % 2, text }); return; }
        used.set(clip.id, (used.get(clip.id) || 0) + 1); prevClip = clip.id;
        cuts.push({ start: sg.start, end: sg.end, clip: clip.id, text });
      });
    } else
    sents.forEach((s, i) => {
      const dur = s.end - s.start;
      const n = Math.max(1, Math.round(dur / 3.2)), seg = dur / n;
      for (let k = 0; k < n; k++) {
        const a = s.start + seg * k, b = s.start + seg * (k + 1);
        let { clip, matches } = pick(s.words, used, lib, { text: s.text, sem, fb, avoid: prevClip });
        if (matches <= 0 && generic.length) { const g = generic.filter(id => !used.get(id)); clip = lib.find(c => c.id === (g[0] || generic[(i + k) % generic.length])); }
        if (!clip || !generic.length && matches <= 0 && cards) { if (cards) cuts.push({ start: +a.toFixed(2), end: +b.toFixed(2), clip: 'card', card: keyPhrase(s.raw), variant: k % 2, text: s.text }); continue; }
        used.set(clip.id, (used.get(clip.id) || 0) + 1); prevClip = clip.id;
        cuts.push({ start: +a.toFixed(2), end: +b.toFixed(2), clip: clip.id, text: s.text });
      }
    });
    if (cuts.length) {
      cuts[0].start = 0; cuts[cuts.length - 1].end = +total.toFixed(2);
      for (let k = 1; k < cuts.length; k++) cuts[k].start = cuts[k - 1].end;
    }
  }
  return { sentences: sents.map(({ block, sent, start, end, text }) => ({ block, sent, start: +start.toFixed(2), end: +end.toFixed(2), text })), cuts, zooms };
}
// Cover segments with poor lip-sync using inserts/cards (only the part not already covered).
async function coverBad(cuts, bad, aligned, { clips = true, lib = LIB, sem = null, fb = null, cards = true } = {}) {
  const used = new Map(); cuts.forEach(c => used.set(c.clip, (used.get(c.clip) || 0) + 1));
  const merged = [];
  [...bad].filter(b => b.end > 0.4).sort((a, b) => a.start - b.start).forEach(b => {
    const s = Math.max(b.start, 0.4);
    if (merged.length && s <= merged[merged.length - 1].end + 0.2) merged[merged.length - 1].end = Math.max(merged[merged.length - 1].end, b.end);
    else merged.push({ start: s, end: b.end, reason: b.reason });
  });
  const added = [];
  for (const b of merged) {
    // remove already-covered intervals
    let free = [[b.start, b.end]];
    for (const c of cuts) free = free.flatMap(([a, z]) => (c.end <= a || c.start >= z) ? [[a, z]] : [[a, Math.max(a, c.start)], [Math.min(z, c.end), z]]).filter(([a, z]) => z - a > 0.05);
    for (const [a0, z0] of free) {
      for (let a = a0; z0 - a >= 0.8; a += 3.2) {
        const z = Math.min(z0, a + 3.2);
        const ws = aligned.words.filter(w => w.end > a && w.start < z);
        const words = ws.map(w => w.n), raw = ws.map(w => w.w);
        const text = raw.join(' ');
        if (sem && text) await sem.ensure([text]);
        const { clip, matches, sim } = pick(words, used, lib, { text, sem, fb });
        if (!cards && !(clips && clip)) continue;            // no cards: nothing to cover with
        const cut = clips && clip && (matches > 0 || !cards)
          ? { start: +a.toFixed(2), end: +z.toFixed(2), clip: clip.id, text, bad: b.reason, ...(sim > 0 ? { sim: +sim.toFixed(2) } : {}) }
          : { start: +a.toFixed(2), end: +z.toFixed(2), clip: 'card', card: keyPhrase(raw.length ? raw : ['…']), variant: added.length % 2, text: raw.join(' '), bad: b.reason };
        if (cut.clip !== 'card') used.set(cut.clip, (used.get(cut.clip) || 0) + 1);
        added.push(cut);
      }
    }
  }
  return [...cuts, ...added].sort((x, y) => x.start - y.start);
}
module.exports = { plan, coverBad, buildUnits, buildSentences, rank, LIB, SIM_MIN };
