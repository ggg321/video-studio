// Learning from decisions: ranked candidates in the Swap dialog + feedback on swap / delete / thumbs.
// Replaces pickClip / setClip / delCut from index.html (this file is loaded after it).
let CAND = null;

async function pickClip(i) {
  const d = $('#dlg'); CAND = null;
  d.innerHTML = '<h3>Choose an insert</h3><div class="badge">Ranking clips for this moment…</div>'; d.showModal();
  const r = await api('/api/projects/' + P.id + '/candidates', { i });
  if (r.error) { d.innerHTML = `<h3>Choose an insert</h3><div class="badge" style="color:#e5484d">${esc(r.error)}</div><p><button class="sec" onclick="$('#dlg').close()">Close</button></p>`; return; }
  CAND = r;
  d.innerHTML = `<h3>Choose an insert</h3>
    <div class="badge">Best fit first for: “${esc(r.text.slice(0, 120))}”${r.semantic ? ' · by meaning + your earlier choices' : ' · by keywords + your earlier choices'}</div>
    <div class="grid" style="margin-top:10px">${r.items.map((c, k) => `<div style="position:relative;cursor:pointer" title="${esc(c.tags.join(' '))}" onclick="setClip(${i},'${c.id}')">
      <img src="${c.thumb}" style="${c.id === r.current ? 'border-color:#fff' : ''}${c.down && c.fb < 0 ? ';opacity:.55' : ''}">
      <div style="position:absolute;left:4px;top:4px;display:flex;gap:3px;flex-wrap:wrap">${k < 3 ? '<span class="badge" style="background:#1d3b2a;color:#7ee2a0;padding:1px 5px;border-radius:6px">best</span>' : ''}${c.sim != null ? `<span class="badge" style="background:#000a;color:#fff;padding:1px 5px;border-radius:6px">${Math.round(c.sim * 100)}%</span>` : ''}</div>
      <div style="position:absolute;right:4px;bottom:22px;display:flex;gap:3px">${c.fb > 1 ? '<span title="chosen in similar situations before" style="background:#000a;border-radius:6px;padding:1px 4px">👍</span>' : ''}${c.fb < -1 ? '<span title="rejected in similar situations before" style="background:#000a;border-radius:6px;padding:1px 4px">👎</span>' : ''}</div>
      <div class="badge" style="text-align:center">${c.up ? '👍' + c.up + ' ' : ''}${c.down ? '👎' + c.down : ''}${c.watermark ? ' ⚠' : ''}</div></div>`).join('')}</div>
    <p><button class="sec" onclick="$('#dlg').close()">Close</button></p>`;
}
async function setClip(i, id) {
  const c = P.cuts[i], old = c.clip, text = c.text || c.card || '', start = c.start;
  if (old !== id) await api('/api/projects/' + P.id + '/feedback', { kind: 'swap', from: old, to: id, text, start });
  c.clip = id; delete c.card; delete c.variant; delete c.file; delete c.sdur; delete c.src; delete c.page; delete c.sim;
  saveCuts(); $('#dlg').close(); draw();
}
function delCut(i) {
  const c = P.cuts[i];
  if (c && c.clip && c.clip !== 'card' && c.clip !== 'stock') api('/api/projects/' + P.id + '/feedback', { kind: 'delete', from: c.clip, text: c.text || '', start: c.start });
  P.cuts.splice(i, 1); saveCuts(); draw();
}
// thumbs on a selected insert
async function rate(i, rating) {
  const c = P.cuts[i]; if (!c || c.clip === 'card' || c.clip === 'stock') { alert('Thumbs work for clips from the library.'); return; }
  const st = await api('/api/projects/' + P.id + '/feedback', { kind: 'rate', rating, clip: c.clip, text: c.text || '', start: c.start });
  const m = document.getElementById('tlrate'); if (m) m.textContent = rating === 'up' ? 'Noted: more like this for similar phrases.' : 'Noted: this clip will rank lower for similar phrases.';
  if (rating === 'down') pickClip(i);
}
