// Library health from the plans of all projects of a niche: which moments had no fitting clip (gaps), how much of the story is covered,
// which clips are used too often. Nothing is stored here except the gaps the team chose to ignore.
const fs = require('fs'), path = require('path');
const STATE = process.env.SOURCES_STATE || path.join(__dirname, '..', 'data', 'sources_state.json');
const WEAK = 0.55, DAY = 86400000;
const rd = () => { try { return JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch { return {}; } };
const wr = s => fs.writeFileSync(STATE, JSON.stringify(s, null, 1));

// the same moment written a bit differently becomes one gap
function gapKey(text) {
  const w = String(text || '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(x => x.length > 2);
  return w.slice(0, 8).join(' ');
}
const isGap = c => c.clip === 'card' || (c.sim != null && c.sim < WEAK && c.clip !== 'stock');

function scan(projects, nicheId, now = Date.now()) {
  const gaps = new Map(), use = new Map(); let moments = 0, good = 0, weekGaps = 0, projectsSeen = 0;
  for (const p of projects) {
    if ((p.niche || 'weight-loss') !== nicheId || !p.cuts || !p.cuts.length) continue;
    projectsSeen++;
    const recent = now - (p.updated || 0) < 7 * DAY;
    for (const c of p.cuts) {
      if (c.hook && !c.sim) continue;
      moments++;
      if (c.clip && c.clip !== 'card' && c.clip !== 'stock') use.set(c.clip, (use.get(c.clip) || 0) + 1);
      if (!isGap(c)) { good++; continue; }
      if (recent) weekGaps++;
      const text = String(c.text || c.card || '').trim(), key = gapKey(text); if (!key) continue;
      let g = gaps.get(key);
      if (!g) { g = { key, text, count: 0, projects: new Set(), cards: 0, weak: 0, simSum: 0, simN: 0, last: 0 }; gaps.set(key, g); }
      g.count++; g.projects.add(p.id); g.last = Math.max(g.last, p.updated || 0);
      if (c.clip === 'card') g.cards++; else { g.weak++; g.simSum += c.sim; g.simN++; }
      if (text.length > g.text.length && text.length < 200) g.text = text;
    }
  }
  const list = [...gaps.values()].map(g => ({ key: g.key, text: g.text, count: g.count, projects: g.projects.size, kind: g.cards >= g.weak ? 'no clip' : 'weak match', sim: g.simN ? +(g.simSum / g.simN).toFixed(2) : null, last: g.last }));
  return { moments, good, weekGaps, projectsSeen, gaps: list, use };
}

function overview(projects, nicheId, items) {
  const s = scan(projects, nicheId), st = rd(), ign = new Set((st.ignored || {})[nicheId] || []);
  const gaps = s.gaps.filter(g => !ign.has(g.key)).sort((a, b) => b.count - a.count || b.last - a.last);
  const overused = [...s.use.entries()].filter(([, n]) => n >= 3).map(([id, n]) => ({ id, uses: n })).sort((a, b) => b.uses - a.uses);
  const unused = items.filter(c => !s.use.has(c.id)).length;
  return {
    clips: items.length, moments: s.moments, coverage: s.moments ? Math.round(100 * s.good / s.moments) : null, weekGaps: s.weekGaps, projects: s.projectsSeen,
    gapCount: gaps.length, ignored: ign.size, overused: overused.length, overusedTop: overused.slice(0, 5), unused, gaps
  };
}
function ignore(nicheId, key) { const st = rd(); st.ignored = st.ignored || {}; const l = st.ignored[nicheId] = st.ignored[nicheId] || []; if (!l.includes(key)) l.push(key); wr(st); }
function unignoreAll(nicheId) { const st = rd(); if (st.ignored) delete st.ignored[nicheId]; wr(st); }
module.exports = { scan, overview, ignore, unignoreAll, gapKey, isGap, WEAK };
