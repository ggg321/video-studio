// Niches: each niche has its own clip library + default look. The first niche ("weight-loss") wraps the original library folder.
const fs = require('fs'), path = require('path');
const { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..'), DIR = path.join(ROOT, 'data', 'niches');
fs.mkdirSync(DIR, { recursive: true });

const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'niche';

function migrate() {
  const d = path.join(DIR, 'weight-loss');
  if (fs.existsSync(path.join(d, 'niche.json'))) return;
  fs.mkdirSync(d, { recursive: true });
  const items = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'library.json'), 'utf8'));
  fs.writeFileSync(path.join(d, 'library.json'), JSON.stringify(items, null, 1));
  fs.writeFileSync(path.join(d, 'niche.json'), JSON.stringify({ id: 'weight-loss', name: 'Weight loss', legacy: true, defaults: { subStyle: 'classic', transition: 'fade', music: null } }, null, 1));
}
migrate();

const meta = id => JSON.parse(fs.readFileSync(path.join(DIR, id, 'niche.json'), 'utf8'));
function paths(n) {
  // legacy niche keeps the original folders
  return n.legacy ? { files: path.join(ROOT, 'library'), thumbs: path.join(ROOT, 'data', 'thumbs'), filesUrl: '/library/', thumbsUrl: '/thumbs/' }
    : { files: path.join(DIR, n.id, 'files'), thumbs: path.join(DIR, n.id, 'thumbs'), filesUrl: `/niche/${n.id}/files/`, thumbsUrl: `/niche/${n.id}/thumbs/` };
}
// The shared library of hooks ("hooks") is not a niche: it is hidden from the lists of niches and its clips are added to the library of every niche, marked hookOnly.
const HOOKS = 'hooks';
function ensureHooks() {
  const d = path.join(DIR, HOOKS);
  if (fs.existsSync(path.join(d, 'niche.json'))) return;
  fs.mkdirSync(path.join(d, 'files'), { recursive: true }); fs.mkdirSync(path.join(d, 'thumbs'), { recursive: true });
  fs.writeFileSync(path.join(d, 'niche.json'), JSON.stringify({ id: HOOKS, name: 'Hooks (all niches)', shared: true, defaults: {} }, null, 1));
  fs.writeFileSync(path.join(d, 'library.json'), '[]');
}
ensureHooks();
function list(opts) { return fs.readdirSync(DIR).filter(d => fs.existsSync(path.join(DIR, d, 'niche.json'))).map(d => ({ n: meta(d), d })).filter(x => (opts && opts.all) || !x.n.shared).map(({ n, d }) => ({ id: n.id, name: n.name, shared: !!n.shared, defaults: n.defaults || {}, count: JSON.parse(fs.readFileSync(path.join(DIR, d, 'library.json'), 'utf8')).length })); }
// the clips of this niche only (what is written back to its library.json)
function getOwn(id) {
  id = String(id || 'weight-loss').replace(/[^\w-]/g, '');
  if (!fs.existsSync(path.join(DIR, id, 'niche.json'))) id = 'weight-loss';
  const n = meta(id), p = paths(n);
  const items = JSON.parse(fs.readFileSync(path.join(DIR, id, 'library.json'), 'utf8'));
  return { ...n, ...p, items, abs: c => path.join(p.files, c.file) };
}
// own clips + the shared hooks (ids 'h_...', hookOnly: used for the opening insert, not as ordinary inserts). { own: true } gives the niche alone.
// which other niches a project takes inserts from: 'all' or a list of ids (the niche of the project itself is always in)
function libsOf(libs, selfId) {
  const all = list().filter(n => !n.shared && n.id !== selfId).map(n => n.id);
  if (libs === 'all') return all;
  return Array.isArray(libs) ? libs.map(String).filter(x => all.includes(x)) : [];
}
// own clips + the shared hooks (ids 'h_...', hookOnly) + clips of other chosen libraries (ids 'x_<niche>_<id>'). { own: true } gives the niche alone.
function get(id, opts) {
  const o = getOwn(id);
  if (o.shared || (opts && opts.own)) return o;
  const h = getOwn(HOOKS), roots = { [HOOKS]: h };
  const shared = h.items.map(c => ({ ...c, id: 'h_' + c.id, shared: true, hookOnly: true, from: HOOKS, thumbId: c.id, fileUrl: h.filesUrl + c.file, thumbUrl: h.thumbsUrl + c.id + '.jpg' }));
  const foreign = [];
  for (const nid of libsOf(opts && opts.libs, o.id)) {
    const x = getOwn(nid); roots[nid] = x;
    for (const c of x.items) foreign.push({ ...c, id: 'x_' + nid + '_' + c.id, shared: true, from: nid, fromName: x.name, thumbId: c.id, fileUrl: x.filesUrl + c.file, thumbUrl: x.thumbsUrl + c.id + '.jpg' });
  }
  return { ...o, items: [...o.items, ...shared, ...foreign], abs: c => (c.shared ? path.join(roots[c.from].files, c.file) : path.join(o.files, c.file)) };
}
const saveItems = (id, items) => fs.writeFileSync(path.join(DIR, id, 'library.json'), JSON.stringify(items, null, 1));
function create(name, defaults = {}) {
  let id = slug(name), k = 1; while (fs.existsSync(path.join(DIR, id))) id = slug(name) + '-' + (++k);
  fs.mkdirSync(path.join(DIR, id, 'files'), { recursive: true }); fs.mkdirSync(path.join(DIR, id, 'thumbs'), { recursive: true });
  fs.writeFileSync(path.join(DIR, id, 'niche.json'), JSON.stringify({ id, name, defaults: { subStyle: 'classic', transition: 'fade', music: null, ...defaults } }, null, 1));
  saveItems(id, []); return id;
}
function setDefaults(id, defaults, name) {
  const n = meta(id); n.defaults = { ...(n.defaults || {}), ...defaults }; if (name) n.name = String(name).slice(0, 60);
  fs.writeFileSync(path.join(DIR, id, 'niche.json'), JSON.stringify(n, null, 1));
}
// add an uploaded clip (already saved in files dir) to the library; tags = user tags + words from the file name
function addClip(id, filename, userTags = [], origName = '') {
  const n = get(id, { own: true }), p = n;
  const full = path.join(p.files, filename);
  const pr = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=width,height', '-of', 'csv=p=0', full], { encoding: 'utf8' });
  const lines = pr.stdout.trim().split('\n'); const dur = parseFloat(lines[lines.length - 1]) || 0;
  const [w, h] = (lines[0] || '').split(',');
  let next = 1; const nums = n.items.map(c => +(c.id.replace(/\D/g, '')) || 0); next = Math.max(0, ...nums) + 1;
  const cid = 'u' + String(next).padStart(3, '0');
  fs.mkdirSync(p.thumbs, { recursive: true });
  spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', String(Math.min(1.5, dur / 3)), '-i', full, '-frames:v', '1', '-vf', 'scale=200:200:force_original_aspect_ratio=increase,crop=200:200', path.join(p.thumbs, cid + '.jpg')]);
  const nameTags = String(origName || filename).replace(/\.[^.]+$/, '').toLowerCase().split(/[^a-z0-9а-яіїєё]+/).filter(t => t.length > 3 && !/^\d+$/.test(t));
  n.items.push({ id: cid, file: filename, orig: origName || filename, dur: +dur.toFixed(2), res: `${w},${h}`, tags: [...new Set([...userTags, ...nameTags])], avoid: false, watermark: false });
  saveItems(n.id, n.items); return cid;
}
function updateClip(id, cid, patch) {
  const n = get(id, { own: true }); const i = n.items.findIndex(c => c.id === cid); if (i < 0) return false;
  if (patch.delete) { n.items.splice(i, 1); } else {
    if (Array.isArray(patch.tags)) n.items[i].tags = patch.tags.map(t => String(t).trim()).filter(Boolean);
    if (patch.desc !== undefined) n.items[i].desc = String(patch.desc).slice(0, 300);
    if (patch.watermark !== undefined) n.items[i].watermark = !!patch.watermark;
    if (patch.avoid !== undefined) n.items[i].avoid = !!patch.avoid;
  }
  saveItems(n.id, n.items); return true;
}
module.exports = { list, get, create, setDefaults, addClip, updateClip, HOOKS };
