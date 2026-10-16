// Asana import (read-only): task description, comments, subtasks, attachments. Needs a Personal Access Token (Settings).
const BASE = process.env.ASANA_BASE || 'https://app.asana.com/api/1.0';

// accepts a task URL (several Asana URL shapes) or a bare numeric gid
function parseRef(input) {
  const s = String(input || '').trim();
  if (/^\d{6,}$/.test(s)) return s;
  const m = s.match(/\/task\/(\d{6,})/) || s.match(/app\.asana\.com\/0\/\d+\/(\d{6,})/) || s.match(/\/(\d{10,})(?:[/?#]|$)/);
  return m ? m[1] : null;
}

async function api(token, path, params = {}) {
  const u = new URL(BASE + path);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const r = await fetch(u, { headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' } });
  if (r.status === 401) throw new Error('Asana rejected the token (401). Check the Personal Access Token in Settings.');
  if (r.status === 403) throw new Error('Asana: no access to this task (403).');
  if (r.status === 404) throw new Error('Asana: task not found (404). Check the link or the token\'s workspace.');
  if (r.status === 429) throw new Error('Asana: rate limit reached, try again in a minute.');
  if (!r.ok) throw new Error('Asana error ' + r.status);
  return r.json();
}
async function pages(token, path, params) {
  const out = []; let offset;
  for (let i = 0; i < 20; i++) {
    const j = await api(token, path, { limit: 100, ...params, ...(offset ? { offset } : {}) });
    out.push(...(j.data || []));
    offset = j.next_page && j.next_page.offset; if (!offset) break;
  }
  return out;
}
const URL_RE = /https?:\/\/[^\s<>"')\]]+/g;
const urlsIn = t => [...new Set((String(t || '').match(URL_RE) || []).map(u => u.replace(/[.,;:!?]+$/, '')))];

async function fetchTask(token, gid) {
  const t = (await api(token, '/tasks/' + gid, { opt_fields: 'name,notes,permalink_url,due_on,completed,assignee.name,projects.name,created_by.name' })).data;
  const stories = await pages(token, '/tasks/' + gid + '/stories', { opt_fields: 'type,resource_subtype,text,created_at,created_by.name' });
  const comments = stories.filter(s => s.type === 'comment' || s.resource_subtype === 'comment_added').map(s => ({ by: (s.created_by && s.created_by.name) || '', at: s.created_at, text: String(s.text || '').trim() })).filter(c => c.text);
  const sub = await pages(token, '/tasks/' + gid + '/subtasks', { opt_fields: 'name,notes,completed' });
  const subtasks = sub.map(s => ({ gid: s.gid, name: s.name, notes: String(s.notes || '').trim(), completed: !!s.completed }));
  let attachments = [];
  try { attachments = (await pages(token, '/tasks/' + gid + '/attachments', { opt_fields: 'name,host,view_url,permanent_url,download_url' })).map(a => ({ name: a.name, host: a.host, url: a.view_url || a.permanent_url || '' })); } catch {}
  const links = [...new Set([...urlsIn(t.notes), ...comments.flatMap(c => urlsIn(c.text)), ...subtasks.flatMap(s => urlsIn(s.notes)), ...attachments.map(a => a.url).filter(Boolean)])];
  return { gid, name: t.name, createdBy: (t.created_by && t.created_by.name) || '', notes: String(t.notes || '').trim(), url: t.permalink_url, due: t.due_on, assignee: t.assignee && t.assignee.name, project: t.projects && t.projects[0] && t.projects[0].name, comments, subtasks, attachments, links };
}
// ---- watching a task for new comments (read-only) ----
async function me(token) { const u = (await api(token, '/users/me', { opt_fields: 'name,gid' })).data; return { gid: u.gid, name: u.name }; }
async function taskMeta(token, gid) { const t = (await api(token, '/tasks/' + gid, { opt_fields: 'name,permalink_url,completed,created_by.name,assignee.name' })).data; return { name: t.name, url: t.permalink_url, completed: !!t.completed, createdBy: (t.created_by && t.created_by.name) || '', assignee: (t.assignee && t.assignee.name) || '' }; }
// comments (not system events) written after the given ISO time, oldest first
async function newComments(token, gid, afterIso) {
  const st = await pages(token, '/tasks/' + gid + '/stories', { opt_fields: 'type,resource_subtype,text,created_at,created_by.name' });
  return st.filter(x => (x.type === 'comment' || x.resource_subtype === 'comment_added') && (!afterIso || x.created_at > afterIso))
    .map(x => ({ gid: x.gid, by: (x.created_by && x.created_by.name) || '', at: x.created_at, text: String(x.text || '').trim() })).filter(c => c.text).sort((a, b) => a.at < b.at ? -1 : 1);
}
module.exports = { parseRef, fetchTask, urlsIn, me, taskMeta, newComments };
