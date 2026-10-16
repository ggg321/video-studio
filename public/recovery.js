// Offers to resume jobs that were interrupted by a crash / restart.
const REC_LABEL = { analyze: 'Analysis', render: 'Render', assemble: 'Assembling segments' };
async function recoveryCheck() {
  let r; try { r = await (await fetch('/api/recovery')).json(); } catch { return; }
  let box = document.getElementById('recbox');
  if (!r.items || !r.items.length) { if (box && box.open) box.close(); return; }       // nothing left: close a window that is still open
  if (!box) { box = document.createElement('dialog'); box.id = 'recbox'; box.style.cssText = 'background:var(--card);color:var(--tx);border:1px solid var(--line);border-radius:12px;max-width:560px;width:92%;padding:18px'; document.body.appendChild(box); }
  const when = t => new Date(t).toLocaleString();
  box.innerHTML = `<h3 style="margin-top:0">Recover unfinished work</h3>
    <div class="badge">The app stopped while these jobs were running or waiting. Your projects were saved; only the jobs were interrupted.</div>
    ${r.items.map(j => `<div style="display:flex;gap:8px;align-items:center;padding:8px 0;border-top:1px solid var(--line)"><div style="flex:1"><b>${esc(j.projectName || j.projectId)}</b><div class="badge">${esc(REC_LABEL[j.kind] || j.kind)} · started ${when(j.at)}</div></div>
      <button onclick="recResume('${j.id}')">Restart</button><button class="sec" onclick="recSkip('${j.id}')">Skip</button></div>`).join('')}
    <div class="row" style="margin-top:12px;gap:8px"><button onclick="recAll()">Restart all (${r.items.length})</button><button class="sec" onclick="document.getElementById('recbox').close()">Decide later</button></div>
    <div class="badge" id="recmsg" style="margin-top:6px"></div>`;
  if (!box.open) box.showModal();
}
async function recResume(id) { const r = await api('/api/recovery/' + id + '/resume', {}); if (r.error) document.getElementById('recmsg').textContent = r.error; await recoveryCheck(); if (typeof list === 'function') list(); }
async function recSkip(id) { await api('/api/recovery/' + id + '/skip', {}); await recoveryCheck(); const b = document.getElementById('recbox'); if (b && !b.querySelector('button')) b.close(); }
async function recAll() { const r = await api('/api/recovery/resume-all', {}); const m = document.getElementById('recmsg'); if (m) m.textContent = r.started + ' job(s) restarted' + (r.failed.length ? '; could not restart: ' + r.failed.map(f => f.name + ' (' + f.why + ')').join('; ') : ''); setTimeout(() => { const b = document.getElementById('recbox'); if (b && b.open) b.close(); if (typeof list === 'function') list(); }, 1500); }
