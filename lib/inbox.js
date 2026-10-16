// Inbox watcher: video files dropped into a niche's inbox folder (e.g. your Flow download folder) are copied into that niche's library.
const fs = require('fs'), path = require('path');
const niches = require('./niches');
const ROOT = path.join(__dirname, '..');
const EXT = /\.(mp4|mov|webm|m4v)$/i;
const seenSize = new Map();   // file -> size at previous poll (a file is imported once its size stops changing)

const inboxDir = n => {
  const custom = (n.defaults && n.defaults.inbox) || '';
  return custom ? custom : path.join(ROOT, 'data', 'niches', n.id, 'inbox');
};
const doneFile = id => path.join(ROOT, 'data', 'niches', id, 'inbox_done.json');
const loadDone = id => { try { return new Set(JSON.parse(fs.readFileSync(doneFile(id), 'utf8'))); } catch { return new Set(); } };

// Import everything stable in the niche's inbox. Returns number of imported clips.
function scan(nicheId) {
  const n = niches.get(nicheId, { own: true }), dir = inboxDir(n);
  fs.mkdirSync(dir, { recursive: true });
  const done = loadDone(n.id); let added = 0;
  for (const name of fs.readdirSync(dir)) {
    if (!EXT.test(name)) continue;
    const full = path.join(dir, name);
    let st; try { st = fs.statSync(full); } catch { continue; }
    if (!st.isFile()) continue;
    const key = name + '|' + st.size + '|' + Math.round(st.mtimeMs);
    if (done.has(key)) continue;
    const prev = seenSize.get(full);
    seenSize.set(full, st.size);
    if (prev !== st.size || st.size < 50000) continue;        // still being written / downloaded
    const safe = Date.now().toString(36) + '_' + name.replace(/[^\w.-]/g, '_');
    fs.mkdirSync(n.files, { recursive: true });
    fs.copyFileSync(full, path.join(n.files, safe));
    let dup = null; try { dup = require('./dupes').checkFile(n.id, path.join(n.files, safe)); } catch {}
    if (dup) { try { fs.unlinkSync(path.join(n.files, safe)); } catch {} done.add(key); continue; }   // already in the library
    niches.addClip(n.id, safe, ['flow', 'generated'], name);
    done.add(key); added++;
  }
  fs.writeFileSync(doneFile(n.id), JSON.stringify([...done]));
  return added;
}

function scanAll() {
  let total = 0;
  for (const n of niches.list()) { try { total += scan(n.id); } catch (e) { console.error('inbox', n.id, e.message); } }
  if (total) console.log('inbox: imported', total, 'clip(s)');
  return total;
}
function start(intervalMs = 15000) { setInterval(scanAll, intervalMs); }
module.exports = { scan, scanAll, start, inboxDir };
