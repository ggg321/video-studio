// The opening insert ("hook"): a clip shown from second 0 over the first line, kept as a normal cut flagged hook:true so render, preview and the timeline treat it like any insert.
const dur = p => { if (p.hookDur) return +Math.max(1.5, Math.min(5, p.hookDur)).toFixed(2); const s = (p.sentences || [])[0]; return +Math.max(2, Math.min(3.5, s ? s.end : 3)).toFixed(2); };
const text = p => String(((p.sentences || [])[0] || {}).text || '').trim();
const has = p => (p.cuts || []).some(c => c.hook);
function clear(p) { p.cuts = (p.cuts || []).filter(c => !c.hook); }
// put the clip over [0, d): later inserts that start inside it are shortened or dropped
function set(p, clipId, d) {
  clear(p); d = d || dur(p);
  const rest = (p.cuts || []).filter(c => c.end > d + 0.3).map(c => c.start < d ? { ...c, start: d } : c);
  if (rest[0] && rest[0].start === d && rest[0].end - d < 0.8) { d = rest[0].end; rest.shift(); }   // no sliver of the next insert after the hook
  p.cuts = [{ start: 0, end: d, clip: clipId, text: text(p), sim: 1, hook: true }, ...rest];
  return p.cuts[0];
}
// best library clip for the opening line (not a watermarked one, not one of the first inserts already); null when nothing fits well enough
// the shared hooks (universal, not tied to a topic) come first: the best of them for this line, whatever the similarity; then the clips of the niche itself
function pick(p, items, ctx, rank, norm) {
  const t = text(p); if (!t || !items || !items.length) return null;
  const used = new Set((p.cuts || []).slice(0, 3).map(c => c.clip)), toks = t.split(/\s+/).map(norm).filter(Boolean);
  const hooks = items.filter(c => c.hookOnly);
  if (hooks.length) { const h = rank(t, toks, hooks, ctx).find(x => !x.clip.watermark && !used.has(x.clip.id)); if (h) return h.clip.id; }
  const r = rank(t, toks, items.filter(c => !c.hookOnly), ctx).find(x => !x.clip.watermark && !used.has(x.clip.id) && (x.sim != null ? x.sim >= 0.45 : x.s > 0));
  return r ? r.clip.id : null;
}
// the best n different clips for the opening line (for A/B copies); `skip` = ids that must not be used
function pickMany(p, items, ctx, rank, norm, n, skip = []) {
  const t = text(p); if (!t || !items || !items.length) return [];
  const used = new Set([...(p.cuts || []).slice(0, 3).map(c => c.clip), ...skip]), toks = t.split(/\s+/).map(norm).filter(Boolean);
  const ok = x => !x.clip.watermark && !used.has(x.clip.id);
  const hooks = items.filter(c => c.hookOnly), first = hooks.length ? rank(t, toks, hooks, ctx).filter(ok).map(x => x.clip.id) : [];
  const more = rank(t, toks, items.filter(c => !c.hookOnly), ctx).filter(x => ok(x) && (x.sim != null ? x.sim >= 0.4 : x.s > 0)).map(x => x.clip.id);
  return [...first, ...more].slice(0, n);
}
module.exports = { dur, text, has, set, clear, pick, pickMany };
