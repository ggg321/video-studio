// Subtitles (SRT) editor + quality-check panel.
const QC_ICON = { pass: '✓', warn: '⚠', fail: '✕' }, QC_COL = { pass: '#3fb950', warn: '#d29922', fail: '#e5484d' };

function qcList(rep) {
  if (!rep) return '';
  const s = rep.summary;
  return `<div class="badge" style="margin:6px 0">${s.pass} passed · ${s.warn} warning(s) · ${s.fail} problem(s)</div>` +
    rep.checks.map(c => `<div style="display:grid;grid-template-columns:22px 1fr;gap:6px;padding:4px 0;border-top:1px solid var(--line)"><b style="color:${QC_COL[c.status]}">${QC_ICON[c.status]}</b><div>${esc(c.title)}${c.detail ? `<div class="badge">${esc(c.detail)}</div>` : ''}</div></div>`).join('');
}
function qcCard() {
  const pre = P.qcPre, post = P.qcPost;
  return `<div style="margin:8px 0 14px"><div class="row" style="gap:8px"><button class="sec" onclick="qcPre()">Check before export</button>${P.outFile ? '<button class="sec" onclick="qcPost()">Re-check export file</button>' : ''}</div>
  ${pre ? `<div style="margin-top:8px"><b>Plan check</b>${qcList(pre)}</div>` : ''}
  ${post ? `<div style="margin-top:8px"><b>Export file check</b>${qcList(post)}<div class="badge">Report saved in the project folder (qc_report.json).</div></div>` : ''}</div>`;
}
async function qcPre() { P.qcPre = await api('/api/projects/' + P.id + '/qc/pre', {}); draw(); }
async function qcPost() { P.qcPost = await api('/api/projects/' + P.id + '/qc/post', {}); draw(); }

// ---- subtitles ----
let SUBS = null;
function subsCard() {
  return `<div class="card"><h2>Subtitles (SRT)</h2>
  <div class="row" style="gap:8px">
    <a class="btn" style="background:#2a2f3a;color:#fff;border-radius:8px;padding:9px 16px;text-decoration:none;font-weight:600" href="/api/projects/${P.id}/subtitles.srt">Download .srt</a>
    <label class="btn" style="background:#2a2f3a;color:#fff;border-radius:8px;padding:9px 16px;font-weight:600;cursor:pointer;flex:none">Import .srt<input type="file" accept=".srt,.vtt,text/plain" hidden onchange="subsImport(this.files[0])"></label>
    <button class="sec" onclick="subsToggle()">${SUBS ? 'Hide cues' : 'Edit cues'}</button>
    ${P.subs && P.subs.length ? '<button class="sec" onclick="subsReset()">Reset to automatic</button>' : ''}
  </div>
  <div class="badge" style="margin-top:6px">${P.subs && P.subs.length ? 'Custom subtitles are used in the video (' + P.subs.length + ' cues).' : 'Automatic subtitles from the script and voice. Edit them, or import an .srt, to use your own.'}</div>
  <div id="subsbox">${SUBS ? subsRows() : ''}</div></div>`;
}
const tcs = t => { const m = Math.floor(t / 60), s = (t % 60).toFixed(2).padStart(5, '0'); return `${m}:${s}`; };
const unTc = v => { v = String(v).trim().replace(',', '.'); const p = v.split(':').map(Number); return p.length === 2 ? p[0] * 60 + p[1] : p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : +v; };
function subsRows() {
  return `<div style="max-height:380px;overflow:auto;margin-top:8px">` + SUBS.map((c, i) => `<div style="display:grid;grid-template-columns:78px 78px 1fr 30px;gap:6px;margin:4px 0">
    <input value="${tcs(c.start)}" onchange="subsSet(${i},'start',this.value)"><input value="${tcs(c.end)}" onchange="subsSet(${i},'end',this.value)">
    <input value="${esc(c.text)}" onchange="subsSet(${i},'text',this.value)"><button class="sec" style="padding:4px" onclick="subsDel(${i})">✕</button></div>`).join('') +
    `</div><div class="row" style="margin-top:8px"><button class="sec" onclick="subsAdd()">+ Add cue</button></div>`;
}
async function subsToggle() {
  if (SUBS) { SUBS = null; draw(); return; }
  const r = await api('/api/projects/' + P.id + '/subtitles'); SUBS = r.cues; draw();
}
async function subsSave() {
  const r = await api('/api/projects/' + P.id + '/subtitles', { cues: SUBS });
  if (r.error) { alert(r.error); return; }
  P.subs = r.custom ? r.cues : null; SUBS = r.cues;
}
function subsSet(i, k, v) { SUBS[i][k] = k === 'text' ? v : unTc(v); subsSave().then(draw); }
function subsDel(i) { SUBS.splice(i, 1); subsSave().then(draw); }
function subsAdd() { const l = SUBS[SUBS.length - 1]; const t = l ? l.end : 0; SUBS.push({ start: t, end: t + 1.5, text: 'New subtitle' }); subsSave().then(draw); }
async function subsReset() { await api('/api/projects/' + P.id + '/subtitles', { reset: true }); P.subs = null; SUBS = null; draw(); }
async function subsImport(f) {
  if (!f) return; const t = await f.text();
  const r = await api('/api/projects/' + P.id + '/subtitles', { srt: t });
  if (r.error) { alert(r.error); return; }
  P.subs = r.cues; SUBS = r.cues; draw();
}
