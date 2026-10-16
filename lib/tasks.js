// Tasks (briefs) that contain several creatives (= projects). Splitting a brief into creatives, stages and the "what next" summary.
const fs = require('fs'), path = require('path');
const { parseBlocks } = require('./script');
const FILE = path.join(__dirname, '..', 'data', 'tasks.json');
const load = () => { try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return []; } };
const save = l => fs.writeFileSync(FILE, JSON.stringify(l, null, 1));

const list = () => load();
const get = id => load().find(t => t.id === id) || null;
function upsert(b) {
  const l = load();
  let t = b.id && l.find(x => x.id === b.id);
  if (!t) { t = { id: 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), created: Date.now(), source: 'manual' }; l.push(t); }
  for (const k of ['title', 'description', 'comments', 'niche', 'format', 'source', 'sourceRef']) if (b[k] !== undefined) t[k] = String(b[k]).slice(0, 20000);
  if (b.links !== undefined) t.links = (Array.isArray(b.links) ? b.links : String(b.links).split(/\s+/)).map(s => String(s).trim()).filter(Boolean).slice(0, 50);
  if (b.exports !== undefined) t.exports = (Array.isArray(b.exports) ? b.exports : []).map(String).filter(x => /^[a-z0-9_]+$/.test(x)).slice(0, 8);
  t.title = (t.title || 'New task').trim().slice(0, 120); t.updated = Date.now();
  save(l); return t;
}
function patch(id, obj) { const l = load(), t = l.find(x => x.id === id); if (!t) return null; Object.assign(t, obj, { updated: Date.now() }); save(l); return t; }
const remove = id => { const l = load(); if (!l.some(t => t.id === id)) return false; save(l.filter(t => t.id !== id)); return true; };

// ---- split a brief into creatives ----
const HEAD = /^\s*(?:#{1,3}\s*)?(?:creative|креатив|кріатив|script|скрипт|сценарий|сценарій|ad|variant|вариант|варіант|version|версия|версія|video|видео|відео)\s*[#№]?\s*(\d+)\s*[:.)\-–—]?\s*(.*)$/i;
const SEP = /^\s*[-=_*~]{3,}\s*$/;
function splitCreatives(text) {
  const lines = String(text || '').replace(/\r/g, '').split('\n');
  const heads = [];
  lines.forEach((l, i) => { const m = l.match(HEAD); if (m && !/\d\s*[.)]\s+\S/.test(l.slice(0, 3))) heads.push({ i, title: (m[2] || '').trim(), no: m[1] }); });
  let chunks = [];
  if (heads.length >= 1) {
    heads.forEach((h, k) => { const end = k + 1 < heads.length ? heads[k + 1].i : lines.length; chunks.push({ title: h.title, no: h.no, body: lines.slice(h.i + 1, end).join('\n') }); });
  } else if (lines.some(l => SEP.test(l))) {
    let cur = []; for (const l of lines) { if (SEP.test(l)) { chunks.push({ title: '', body: cur.join('\n') }); cur = []; } else cur.push(l); }
    chunks.push({ title: '', body: cur.join('\n') });
  } else chunks = [{ title: '', body: lines.join('\n') }];
  const out = chunks.map((c, k) => ({ name: (c.title || '').replace(/^["«“]|["»”]$/g, '').trim() || `Creative ${c.no || k + 1}`, script: c.body.trim() })).filter(c => c.script);
  return out.map(c => ({ ...c, blocks: parseBlocks(c.script).length, words: c.script.split(/\s+/).filter(Boolean).length }));
}

// ---- stages + summary of one creative (project) ----
const STAGES = [
  { id: 'script', label: 'Script' }, { id: 'media', label: 'Voice / video' }, { id: 'analysis', label: 'Analysis' },
  { id: 'plan', label: 'Plan' }, { id: 'render', label: 'Render' }, { id: 'check', label: 'Checked' }
];
function summarize(p) {
  const blocks = parseBlocks(p.script || '').length;
  const done = {
    script: blocks > 0,
    media: !!(p.presenterFile || p.voiceFile),
    analysis: !!p.words,
    plan: !!(p.words && p.cuts),
    render: !!p.outFile,
    check: !!(p.outFile && p.qcPost && p.qcPost.status !== 'fail')
  };
  const stages = STAGES.map(s => ({ ...s, done: !!done[s.id] }));
  const attention = [];
  if (p.status === 'error' && p.error) attention.push(String(p.error).slice(0, 140));
  if (p.qcPost) { const f = p.qcPost.checks.filter(c => c.status === 'fail'), w = p.qcPost.checks.filter(c => c.status === 'warn'); if (f.length) attention.push(`Export check: ${f.length} problem(s) (${f.map(c => c.title).join('; ').slice(0, 100)})`); else if (w.length) attention.push(`Export check: ${w.length} warning(s)`); }
  if (p.qcPre && p.qcPre.summary.fail) attention.push(`Plan check: ${p.qcPre.summary.fail} problem(s)`);
  if (p.cuts) { const cards = p.cuts.filter(c => c.clip === 'card').length, weak = p.cuts.filter(c => c.sim != null && c.sim < 0.55 && c.clip !== 'stock').length; if (cards) attention.push(`${cards} moment(s) show a text card instead of a clip`); if (weak) attention.push(`${weak} weak clip match(es)`); }
  if (p.dreamface && ['packaged', 'partial'].includes(p.dreamface.status)) attention.push(p.dreamface.status === 'partial' ? `DreamFace result incomplete (${(p.dreamface.got || []).length}/${(p.dreamface.parts || []).length} parts)` : 'Waiting for the DreamFace result (package prepared)');
  if (p.matchRatio != null && p.matchRatio < 0.8) attention.push(`Voice matches only ${Math.round(p.matchRatio * 100)}% of the script`);
  if (p.lipsync && p.lipsync.bad) { const open = p.lipsync.bad.filter(b => !(p.cuts || []).some(c => c.start < b.end && c.end > b.start)); if (open.length) attention.push(`${open.length} suspicious moment(s) not covered`); }
  let next;
  if (['analyzing', 'rendering', 'queued', 'assembling'].includes(p.status)) next = 'Working… (' + p.status + ')';
  else if (!done.script) next = 'Write or paste the script';
  else if (!done.media) next = 'Add the voice or the speaker video';
  else if (!done.analysis) next = 'Run the analysis';
  else if (!done.render) next = 'Review the plan on the timeline, then render';
  else if (!done.check) next = 'Fix the export check problems, then render again';
  else next = 'Done: download the video';
  const ready = done.check ? 'done' : p.status === 'error' || (p.qcPost && p.qcPost.status === 'fail') ? 'problem' : done.render ? 'review' : done.analysis ? 'editing' : done.media ? 'ready for analysis' : 'draft';
  return { stages, attention, next, state: ready, done };
}
module.exports = { list, get, upsert, patch, remove, splitCreatives, summarize, STAGES };
