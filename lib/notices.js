// Notifications for the team (bell on the site; the same events go to Telegram). Stored in data/notices.json, newest first.
const fs = require('fs'), path = require('path');
const FILE = process.env.NOTICES_FILE || path.join(__dirname, '..', 'data', 'notices.json');
const load = () => { try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return []; } };
const save = l => fs.writeFileSync(FILE, JSON.stringify(l.slice(0, 300), null, 1));

function add(n) {
  const l = load(), item = { id: 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), at: Date.now(), read: false, state: 'new', ...n };
  if (item.key && l.some(x => x.key === item.key)) return null;       // the same event is never added twice
  l.unshift(item); save(l); return item;
}
const list = (opts = {}) => load().filter(n => !opts.unread || !n.read).slice(0, opts.limit || 60);
const get = id => load().find(n => n.id === id) || null;
function patch(id, obj) { const l = load(), n = l.find(x => x.id === id); if (!n) return null; Object.assign(n, obj); save(l); return n; }
function readAll() { const l = load(); l.forEach(n => { n.read = true; }); save(l); }
const counts = () => { const l = load(); return { unread: l.filter(n => !n.read).length, open: l.filter(n => n.state === 'new').length }; };
module.exports = { add, list, get, patch, readAll, counts };
