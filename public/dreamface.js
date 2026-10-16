// DreamFace (manual lip-sync): prepare a package, then receive the finished videos (inbox folder / upload), check, match and import them.
// Shared by the project page (index.html, one creative) and the task page (tasks.html, many creatives).
let DF = { elig: null, queue: null, inbox: '', scope: '', include: true, max: 0, sel: new Set(), msg: '', pkg: null, busy: false };
const DFJ = (u, b) => (typeof api === 'function' ? api : j)(u, b);
const dfEsc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const dfRedraw = () => { if (typeof draw === 'function') draw(); };

async function dfLoad(scope, taskId) {
  DF.scope = scope;
  DF.elig = await DFJ('/api/dreamface/eligible' + (taskId ? '?task=' + taskId : ''));
  const q = await DFJ('/api/dreamface/queue'); DF.queue = q.items; DF.inbox = q.inbox;
  dfRedraw();
}
// taskId: show all creatives of that task; projectId: only this creative
function dfCard(taskId, projectId) {
  const scope = (taskId || '') + '|' + (projectId || '');
  if (DF.scope !== scope || DF.elig === null) { DF.scope = scope; DF.elig = DF.elig || []; dfLoad(scope, taskId); if (!DF.queue) return '<div class="card"><h2>DreamFace (manual)</h2><div class="badge">Loading…</div></div>'; }
  const elig = projectId ? DF.elig.filter(e => e.id === projectId) : DF.elig;
  const ids = new Set(elig.map(e => e.id));
  const q = (DF.queue || []).filter(e => !projectId || e.projectId === projectId || !e.projectId);
  return `<div class="card"><h2>DreamFace (manual lip-sync)</h2>
   <div class="badge">Prepare a package of audio files, process them in DreamFace yourself, then bring the finished videos back here. Nothing is sent to DreamFace by this app.</div>
   <div style="margin-top:8px"><b>1 · Package</b>
   ${elig.length ? elig.map(e => `<label style="display:flex;gap:8px;align-items:center;color:var(--tx);margin:4px 0"><input type="checkbox" style="width:auto" ${projectId || DF.sel.has(e.id) ? 'checked' : ''} ${projectId ? 'disabled' : `onchange="dfTick('${e.id}',this.checked)"`}> ${e.no ? '#' + e.no + ' ' : ''}${dfEsc(e.name)} ${e.df ? `<span class="badge">· ${e.df.status === 'imported' ? '✓ imported' : e.df.status === 'partial' ? 'partial ' + e.df.got + '/' + e.df.parts : 'package prepared'}</span>` : ''}${e.hasVideo ? '<span class="badge">· has a video</span>' : ''}</label>`).join('') : '<div class="badge">No creative with a voice yet. Add or generate the voice first.</div>'}
   <div class="row" style="margin-top:6px"><label style="display:flex;gap:8px;align-items:center;color:var(--tx);flex:0 0 auto"><input type="checkbox" style="width:auto" ${DF.include ? 'checked' : ''} onchange="DF.include=this.checked"> Include the current video as a face reference</label>
    <div style="flex:0 0 220px"><label style="margin:0">Split audio into parts of at most (seconds, 0 = no)</label><input type="number" min="0" value="${DF.max}" style="max-width:110px" onchange="DF.max=+this.value||0"></div>
    <button onclick="dfPackage(${projectId ? `'${projectId}'` : 'null'})" ${DF.busy || !elig.length ? 'disabled' : ''}>${DF.busy ? 'Preparing…' : 'Prepare package'}</button></div>
   ${DF.pkg ? `<div style="margin-top:8px;padding:10px;border:1px solid var(--line);border-radius:8px;background:var(--surface)"><b>Package ready</b> · ${DF.pkg.items.map(i => dfEsc(i.name) + ' (' + i.seconds + ' s' + (i.parts > 1 ? ', ' + i.parts + ' parts' : '') + ')').join('; ')}
      <div class="badge">${dfEsc(DF.pkg.dir)}</div>${DF.pkg.zip ? `<div class="badge">ZIP: ${dfEsc(DF.pkg.zip)}</div>` : ''}${DF.pkg.skipped.length ? `<div class="badge" style="color:#d29922">Skipped: ${DF.pkg.skipped.map(s => dfEsc(s.name + ' (' + s.why + ')')).join(', ')}</div>` : ''}
      <div class="row" style="margin-top:6px"><button class="sec" onclick="dfOpen('${dfEsc(DF.pkg.dir).replace(/\\/g, '/')}')">Open folder</button></div>
      <div class="badge" style="margin-top:4px">In DreamFace keep the file name (it contains the creative key), download the result and put it into the inbox folder below, or drop it here.</div></div>` : ''}</div>
   <div style="margin-top:14px"><b>2 · Finished videos</b>
   <div class="badge">Inbox folder (checked every 15 s): ${dfEsc(DF.inbox)}</div>
   <div class="row" style="margin-top:6px"><button class="sec" onclick="dfScan()">Scan the inbox now</button><label class="btn sec" style="flex:none;background:#2a2f3a;color:#fff;border-radius:8px;padding:8px 14px;font-weight:600;cursor:pointer">Add files…<input type="file" accept="video/*" multiple hidden onchange="dfUpload(this.files)"></label><span class="badge">${dfEsc(DF.msg)}</span></div>
   ${q.length ? q.map(e => dfRow(e, elig, ids, projectId)).join('') : '<div class="badge" style="margin-top:6px">No finished videos waiting.</div>'}</div></div>`;
}
function dfRow(e, elig, ids, projectId) {
  const p = elig.find(x => x.id === e.projectId), icon = { pass: '✓', warn: '⚠', fail: '✕' }, col = { pass: '#3fb950', warn: '#d29922', fail: '#e5484d' };
  const done = e.status === 'imported';
  return `<div style="padding:8px 0;border-top:1px solid var(--line)"><div class="row" style="gap:8px"><div style="flex:2"><b>${dfEsc(e.name)}</b> <span class="badge">${(e.size / 1048576).toFixed(1)} MB · ${e.info && e.info.duration ? e.info.duration.toFixed(1) + ' s' : '?'}${e.info && e.info.width ? ' · ' + e.info.width + '×' + e.info.height : ''}</span></div>
    ${done ? `<span class="badge" style="color:#3fb950">✓ imported into ${dfEsc(e.projectName || '')}</span>` : `<div style="flex:2"><select onchange="dfAssign('${e.id}',this.value,1)"><option value="">— which creative? —</option>${elig.map(x => `<option value="${x.id}" ${x.id === e.projectId ? 'selected' : ''}>${x.no ? '#' + x.no + ' ' : ''}${dfEsc(x.name)}</option>`).join('')}</select></div>
    ${e.parts > 1 ? `<div style="flex:0 0 90px"><input type="number" min="1" max="${e.parts}" value="${e.part || 1}" title="Part number" onchange="dfAssign('${e.id}','${e.projectId}',this.value)"></div>` : ''}
    <button ${e.projectId && e.result !== 'fail' ? '' : 'disabled'} onclick="dfImport('${e.id}')">Import</button><button class="sec" onclick="dfIgnore('${e.id}')">Ignore</button>`}</div>
    <div class="chips" style="display:flex;gap:10px;flex-wrap:wrap;margin-top:4px">${(e.checks || []).map(c => `<span class="badge" style="color:${col[c.status]}" title="${dfEsc(c.detail)}">${icon[c.status]} ${dfEsc(c.title)}${c.status !== 'pass' && c.detail ? ': ' + dfEsc(c.detail) : ''}</span>`).join('')}</div></div>`;
}
function dfTick(id, on) { on ? DF.sel.add(id) : DF.sel.delete(id); }
async function dfPackage(projectId) {
  const ids = projectId ? [projectId] : [...DF.sel]; if (!ids.length) { DF.msg = 'Tick at least one creative.'; dfRedraw(); return; }
  DF.busy = true; DF.msg = ''; dfRedraw();
  const r = await DFJ('/api/dreamface/package', { ids, includeVideo: DF.include, maxSeconds: DF.max });
  DF.busy = false; if (r.error) { DF.msg = r.error; DF.pkg = null; } else DF.pkg = r;
  DF.elig = null; dfRedraw();
}
async function dfScan() { const r = await DFJ('/api/dreamface/scan', {}); DF.queue = r.items; DF.msg = r.added ? r.added + ' new file(s) found.' : 'No new files.'; dfRedraw(); }
async function dfUpload(files) { if (!files.length) return; const fd = new FormData(); for (const f of files) fd.append('files', f); DF.msg = 'Uploading…'; dfRedraw(); const r = await (await fetch('/api/dreamface/upload', { method: 'POST', body: fd })).json(); DF.queue = r.items; DF.msg = ''; dfRedraw(); }
async function dfAssign(qid, projectId, part) { const r = await DFJ('/api/dreamface/' + qid + '/assign', { projectId, part: +part || 1 }); DF.queue = r.items; dfRedraw(); }
async function dfIgnore(qid) { const r = await DFJ('/api/dreamface/' + qid + '/ignore', {}); DF.queue = r.items; dfRedraw(); }
async function dfImport(qid) {
  const r = await DFJ('/api/dreamface/' + qid + '/import', {});
  if (r.error) { DF.msg = r.error; dfRedraw(); return; }
  DF.queue = r.items; DF.elig = null; DF.msg = r.status === 'imported' ? '✓ Imported as the presenter video.' : `Part imported (${r.got}/${r.of}). Add the remaining parts.`;
  if (typeof P !== 'undefined' && P && typeof open_ === 'function') { const keep = DF.msg; await open_(P.id); DF.msg = keep; dfRedraw(); }
  else if (typeof TV !== 'undefined' && TV && typeof openTask === 'function') await openTask(TV.task.id);
  else dfRedraw();
}
async function dfOpen(p) { const r = await DFJ('/api/open', { path: p }); if (r.error) { DF.msg = r.error; dfRedraw(); } }
