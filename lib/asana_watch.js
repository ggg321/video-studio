// Watches the Asana tasks of the team for new comments from buyers (read-only: nothing is ever written to Asana).
// A buyer = the person who created the task (their nick is taken from Asana) plus the names added in Settings.
// Comments of the team (Settings, and the owner of the token) are ignored. A comment never changes a status by itself:
// it becomes a notice (bell + Telegram) and a person decides: an edit, material for the creative, or nothing.
const fs = require('fs'), path = require('path');
const asana = require('./asana'), notices = require('./notices'), lifecycle = require('./lifecycle');
const STATE = process.env.ASANA_WATCH_FILE || path.join(__dirname, '..', 'data', 'asana_watch.json');
const DAY = 86400000;
const csv = v => String(v || '').split(/[,;\n]/).map(x => x.trim().toLowerCase()).filter(Boolean);

const EDIT = ['правк', 'поправ', 'исправ', 'измени', 'изменить', 'замени', 'заменить', 'убери', 'уберите', 'добавь', 'добавьте', 'перепиш', 'переделай', 'не нравится', 'слишком', 'сделай', 'fix', 'change', 'replace', 'remove', 'too ', 'змін', 'виправ', 'заміни', 'прибер', 'додай', 'переробі'];
const MATERIAL = ['текст', 'сценарий', 'сценарій', 'script', 'хук', 'hook', 'креатив', 'cta', 'озвучк', 'озвучен'];
// a hint only: the person decides
function suggest(text) {
  const t = String(text || '').toLowerCase(), words = t.split(/\s+/).filter(Boolean).length;
  const edit = EDIT.some(k => t.includes(k)), mat = MATERIAL.some(k => t.includes(k));
  if (words >= 30 && (mat || !edit)) return 'material';
  if (edit) return 'edit';
  if (mat && words >= 12) return 'material';
  return null;
}
// "creative 2", "креатив №2" in the comment: which creative it is about
function creativeHint(text) {
  const t = String(text || '').toLowerCase();
  for (const key of ['креатив', 'кріатив', 'creative', 'крео', 'ролик №', 'видео №', 'відео №']) {
    const i = t.indexOf(key); if (i < 0) continue;
    const rest = t.slice(i + key.length, i + key.length + 8); let num = '';
    for (const ch of rest) { if (ch >= '0' && ch <= '9') num += ch; else if (num) break; }
    if (num) return +num;
  }
  return null;
}

// "Текст для креатива 2: ..." -> only the text after the label (a short label that names a script / text / creative)
function scriptFrom(text) {
  const t = String(text || '').trim(), i = t.indexOf(':');
  if (i > 0 && i <= 40) { const head = t.slice(0, i).toLowerCase(); if (head.split(/\s+/).length <= 5 && !head.includes(',') && MATERIAL.some(k => head.includes(k))) return t.slice(i + 1).trim() || t; }
  return t;
}

function create({ settings, taskslib, creativesOf, load, save, tg, siteUrl }) {
  const rd = () => { try { return JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch { return {}; } };
  const wr = s => fs.writeFileSync(STATE, JSON.stringify(s));
  let running = false, timer = null, last = { at: 0, found: 0, error: '' };

  async function runOnce() {
    const s = settings();
    if (!s.asanaToken || s.asanaWatch === false) return { skipped: true };
    if (running) return { skipped: true };
    running = true; let found = 0, error = '';
    try {
      const st = rd(); st.tasks = st.tasks || {};
      if (!st.me) st.me = await asana.me(s.asanaToken);
      const team = new Set([...csv(s.asanaTeam), String(st.me.name || '').toLowerCase()]), extra = csv(s.asanaBuyers);
      for (const t of taskslib.list()) {
        const gid = t.asana && t.asana.gid; if (!gid) continue;
        const cs = creativesOf(t.id);
        const imported = (t.asana && t.asana.importedAt) || 0;
        if (!(cs.some(c => lifecycle.state(c) !== 'approved') || Date.now() - imported < 45 * DAY)) continue;
        const ts = st.tasks[gid] = st.tasks[gid] || { after: new Date(imported || Date.now()).toISOString() };
        let a = t.asana;
        if (!a.createdBy) { const m = await asana.taskMeta(s.asanaToken, gid); a = { ...a, createdBy: m.createdBy, url: a.url || m.url }; taskslib.patch(t.id, { asana: a }); }
        const buyers = new Set([String(a.createdBy || '').toLowerCase(), ...extra].filter(Boolean));
        for (const c of await asana.newComments(s.asanaToken, gid, ts.after)) {
          if (c.at > ts.after) ts.after = c.at;
          const by = c.by.toLowerCase();
          if (team.has(by) || !buyers.has(by)) continue;
          const n = notices.add({ kind: 'asana-comment', key: 'asana:' + gid + ':' + c.gid, taskId: t.id, taskTitle: t.title, gid, by: c.by, text: c.text, url: a.url || '', at: Date.parse(c.at) || Date.now(), suggestion: suggest(c.text), hint: creativeHint(c.text), creatives: cs.map(x => ({ id: x.id, no: x.creativeNo || null, name: x.name })) });
          if (!n) continue;
          found++;
          for (const p of cs) if (lifecycle.state(p) === 'review') { const q = load(p.id); lifecycle.addComment(q, { by: c.by, text: c.text, source: 'asana' }, true); save(q); }   // the quiet days start again
          tg.buyerComment({ by: c.by, task: t.title, text: c.text, url: a.url, site: siteUrl() + '/tasks.html' });
        }
      }
      wr(st);
    } catch (e) { error = String(e.message || e).slice(0, 200); console.error('asana watch:', error); }
    finally { running = false; last = { at: Date.now(), found, error }; }
    return last;
  }
  const start = () => { if (timer) return; setTimeout(() => runOnce(), 30000); timer = setInterval(() => runOnce(), 3 * 60000); timer.unref && timer.unref(); };
  return { runOnce, start, status: () => last, suggest, creativeHint };
}
module.exports = { create, suggest, creativeHint, scriptFrom };
