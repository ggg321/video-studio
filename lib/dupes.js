// Duplicates in a library: the same clip uploaded twice, a trimmed or re-encoded copy of a clip.
// Two clips are duplicates when most of the picture "fingerprints" of the shorter one (two per second, as the harvest of old videos uses) have a near twin in the other.
const fs = require('fs'), path = require('path');
const niches = require('./niches'), harvest = require('./harvest');
const ROOT = path.join(__dirname, '..');
const NEAR = 3, SHARE = 0.7;   // stricter than the harvest: a wrongly dropped upload is worse than a duplicate that stays

const ham = (a, b) => { let d = 0; for (let i = 0; i < a.length; i++) { let x = parseInt(a[i], 16) ^ parseInt(b[i], 16); while (x) { d += x & 1; x >>= 1; } } return d; };
// share of the hashes of `a` that have a twin in `b`
const share = (a, b) => { if (!a.length || !b.length) return 0; let m = 0; for (const x of a) if (b.some(y => ham(x, y) <= NEAR)) m++; return m / a.length; };
const same = (a, b) => (a.length <= b.length ? share(a, b) : share(b, a)) >= SHARE;

// which of two clips is worth keeping: no watermark, bigger picture, longer, better described
const score = c => (c.watermark ? 0 : 1e6) + (+String(c.res || '').split(',')[0] || 0) * 100 + (c.dur || 0) * 10 + (c.desc ? 50 : 0) + (c.tags || []).length - (c.avoid ? 1e5 : 0);

// -> [{ keep: clip, dupes: [clip] }]
function groups(nicheId) {
  const n = niches.get(nicheId, { own: true }), hs = harvest.libraryHashes(n.id);
  const items = n.items.filter(c => hs[c.id] && hs[c.id].length), parent = new Map(items.map(c => [c.id, c.id]));
  const find = x => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
    if (find(items[i].id) !== find(items[j].id) && same(hs[items[i].id], hs[items[j].id])) parent.set(find(items[j].id), find(items[i].id));
  }
  const by = {}; for (const c of items) (by[find(c.id)] = by[find(c.id)] || []).push(c);
  return Object.values(by).filter(g => g.length > 1).map(g => { const s = g.slice().sort((a, b) => score(b) - score(a)); return { keep: s[0], dupes: s.slice(1) }; });
}
// is this new file already in the library? -> { of: clipId } | null
function checkFile(nicheId, file) {
  const n = niches.get(nicheId, { own: true }), hs = harvest.libraryHashes(n.id);
  let dur = 8; try { dur = parseFloat(require('child_process').spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' }).stdout) || 8; } catch {}
  const mine = harvest.hashesOf(file, 0, Math.min(dur, 12));
  if (!mine.length) return null;
  let best = null;
  for (const [id, arr] of Object.entries(hs)) if (arr.length) { const s = mine.length <= arr.length ? share(mine, arr) : share(arr, mine); if (s >= SHARE && (!best || s > best.s)) best = { of: id, s }; }
  return best ? { of: best.of } : null;
}
// delete the extra clips (files go to the folder "trash" of the niche, nothing is lost); projects that used them now use the clip that stays
function removeAll(nicheId, pairs) {
  const n = niches.get(nicheId, { own: true }), trash = path.join(ROOT, 'data', 'niches', n.id, 'trash'); fs.mkdirSync(trash, { recursive: true });
  const map = {}; let removed = 0;
  for (const { drop, keep } of pairs) {
    const c = n.items.find(x => x.id === drop); if (!c || !n.items.some(x => x.id === keep) || drop === keep) continue;
    try { const f = n.abs(c); if (fs.existsSync(f)) fs.renameSync(f, path.join(trash, c.file)); } catch {}
    niches.updateClip(n.id, drop, { delete: true }); map[drop] = keep; removed++;
  }
  // projects of this niche
  const PROJ = path.join(ROOT, 'projects'); let touched = 0;
  if (Object.keys(map).length && fs.existsSync(PROJ)) for (const d of fs.readdirSync(PROJ)) {
    const pf = path.join(PROJ, d, 'project.json'); if (!fs.existsSync(pf)) continue;
    let p; try { p = JSON.parse(fs.readFileSync(pf, 'utf8')); } catch { continue; }
    if ((p.niche || 'weight-loss') !== n.id || !Array.isArray(p.cuts)) continue;
    let ch = false; for (const c of p.cuts) if (map[c.clip]) { c.clip = map[c.clip]; ch = true; }
    if (ch) { fs.writeFileSync(pf, JSON.stringify(p, null, 1)); touched++; }
  }
  return { removed, projects: touched };
}
module.exports = { groups, checkFile, removeAll };
