// Project menu (⋯): task link, variant, work folder, niche preset.
let TASKS_CACHE = null, CR_MSG = '';

async function crLoad() { TASKS_CACHE = await api('/api/tasks'); }
function creativeMenu() {
  if (!TASKS_CACHE) { crLoad().then(() => { if (typeof P !== 'undefined' && P) draw(); }); return ''; }
  return `<details class="menu"><summary title="More actions">⋯</summary><div class="pop">
    <label style="margin-top:0">Task</label><select onchange="crSetTask(this.value)"><option value="">— no task —</option>${TASKS_CACHE.map(x => `<option value="${x.id}" ${x.id === P.taskId ? 'selected' : ''}>${esc(x.title)}</option>`).join('')}</select>
    <div class="row" style="margin-top:12px;gap:8px"><button class="sec" onclick="crRename()">Rename</button><button class="sec" onclick="crVariant()">Duplicate project</button></div>
    <div class="row" style="margin-top:8px;gap:8px"><button class="sec" onclick="crFolder()">Work folder</button>${P.workFolder ? '<button class="sec" onclick="crOpen()">Open folder</button>' : ''}</div>
    <hr class="sep"><div class="row"><button class="danger" onclick="crDelete()">Delete project</button></div>
  </div></details>`;
}
const creativeBar = creativeMenu;
async function crSetTask(id) { await api('/api/projects/' + P.id, { taskId: id }); P = Object.assign(P, await api('/api/projects/' + P.id)); await crLoad(); draw(); }
async function crRename() {
  const n = await uiPrompt('New name of the project', P.name || '');
  if (!n || !n.trim() || n.trim() === P.name) return;
  const r = await api('/api/projects/' + P.id, { name: n.trim().slice(0, 100) });
  if (r.error) { toast(r.error); return; }
  P.name = n.trim().slice(0, 100); await list(); draw(); toast('Renamed.');
}
async function crVariant() {
  toast('Making a copy…');
  const r = await api('/api/projects/' + P.id + '/duplicate', {});
  if (r.error) { toast(r.error); return; }
  await list(); await open_(r.id);
}
async function crFolder() {
  toast('Building the work folder…');
  const r = await api('/api/projects/' + P.id + '/workfolder', {});
  if (r.error) { toast(r.error); return; }
  P.workFolder = r.dir; draw(); toast(`Saved to ${r.dir} (${r.copied.length} items${r.missing.length ? ', missing: ' + r.missing.join(', ') : ''})`);
}
async function crOpen() { const r = await api('/api/open', { path: P.workFolder }); if (r.error) toast(r.error); }

// niche presets
async function presetSave() {
  const nid = P.niche || 'weight-loss';
  const r = await api('/api/niches/' + nid + '/preset', { projectId: P.id });
  if (r.error) { toast(r.error); return; }
  NICHES = await api('/api/niches'); draw(); toast('Preset saved. New creatives of this niche will start with these settings.');
}
async function presetApply() {
  const r = await api('/api/projects/' + P.id + '/apply-preset', {});
  if (r.error) { toast(r.error); return; }
  P = Object.assign(P, r); draw(); toast('Niche preset applied.');
}
async function crDelete() {
  if (!await uiConfirm('Delete this project with all its files and renders? This cannot be undone.', 'Delete', true)) return;
  const r = await api('/api/projects/' + P.id + '/delete', {});
  if (r.error) { toast(r.error); return; }
  P = null; document.body.classList.remove('has-proj'); $('#view').innerHTML = '<div class="empty"><b>Project deleted</b>Pick another project or create a new one.</div>'; history.replaceState(null, '', location.pathname); list();
}
