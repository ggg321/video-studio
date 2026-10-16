// Learning from the user's decisions about inserts, per niche. Stored locally; nothing leaves the machine.
// Signals: swap (old clip rejected, new clip accepted), delete (rejected), thumbs up/down (explicit), final render (weak accept).
const fs = require('fs'), path = require('path');
const { norm } = require('./script');
const ROOT = path.join(__dirname, '..');
const file = nid => path.join(ROOT, 'data', 'niches', nid.replace(/[^\w-]/g, ''), 'feedback.json');
const load = nid => { try { return JSON.parse(fs.readFileSync(file(nid), 'utf8')); } catch { return []; } };
const save = (nid, l) => fs.writeFileSync(file(nid), JSON.stringify(l.slice(-3000), null, 1));

const WEIGHT = { swap: 1.0, delete: 1.0, rate: 1.5, render: 0.25 };
// e: { clip, text, kind:'accept'|'reject', src, project, start }
function record(nid, e) {
  if (!e.clip || !e.text || !String(e.text).trim()) return false;
  const l = load(nid), cut = `${e.project || ''}|${e.clip}|${Math.round(e.start || 0)}`;
  // an explicit decision replaces earlier ones for the same clip in the same place (also the opposite one)
  const rest = l.filter(x => !(x.cut === cut && (x.src === 'render' ? true : x.src === e.src || x.kind !== e.kind)));
  if (e.src === 'render' && l.some(x => x.cut === cut && x.src !== 'render')) return false;      // never let the weak signal override an explicit one
  rest.push({ clip: e.clip, text: String(e.text).slice(0, 400), kind: e.kind, w: WEIGHT[e.src] || 1, src: e.src, cut, at: Date.now() });
  save(nid, rest); return true;
}
function stats(nid) {
  const l = load(nid), per = {};
  for (const e of l) { const p = per[e.clip] = per[e.clip] || { up: 0, down: 0 }; if (e.kind === 'accept') p.up += e.w >= 1 ? 1 : 0; else p.down++; }
  return { accept: l.filter(e => e.kind === 'accept' && e.w >= 1).length, implicit: l.filter(e => e.kind === 'accept' && e.w < 1).length, reject: l.filter(e => e.kind === 'reject').length, perClip: per };
}
const reset = nid => { try { fs.unlinkSync(file(nid)); } catch {} };

// structure used by the planner: byClip -> [{ sign, w, words:Set, vec }]
function build(nid, sem) {
  const byClip = new Map(), prior = new Map();
  for (const e of load(nid)) {
    const words = new Set(e.text.split(/\s+/).map(norm).filter(w => w.length > 2)), vec = sem ? sem.get(e.text) : null;
    const sign = e.kind === 'accept' ? 1 : -1;
    (byClip.get(e.clip) || byClip.set(e.clip, []).get(e.clip)).push({ sign, w: e.w, words, vec });
    prior.set(e.clip, (prior.get(e.clip) || 0) + (sign > 0 ? Math.min(0.3 * e.w, 0.3) : -0.6 * Math.min(e.w, 1.5)));
  }
  for (const [k, v] of prior) prior.set(k, Math.max(-3, Math.min(1.5, v)));
  return { byClip, prior, texts: load(nid).map(e => e.text) };
}
module.exports = { record, stats, reset, build, list: load };
