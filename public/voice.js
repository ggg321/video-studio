// "Voice & avatar": ElevenLabs voice generation and HeyGen avatar video. Paid actions always show a check (cost) first and need a second, explicit click.
let VOICES = null, AVATARS = null, VOICE_ERR = '', AV_ERR = '', EL = { prev: null, busy: false, msg: '', seg: false }, HG = { prev: null, busy: false, msg: '', test: true }, EL_SET = { model: 'eleven_multilingual_v2', stability: 0.5, similarity: 0.75, voiceId: '' }, HG_SET = { avatarId: '' };

async function voiceLoad() {
  if (CFG.eleven && VOICES === null) { VOICES = []; const r = await api('/api/eleven/voices'); if (r.error) VOICE_ERR = r.error; else { VOICES = r.voices; VOICES.models = r.models; } draw(); }
  if (CFG.heygen && AVATARS === null) { AVATARS = []; const r = await api('/api/heygen/avatars'); if (r.error) AV_ERR = r.error; else { AVATARS = r.avatars; AVATARS.quota = r.quota; } draw(); }
}

function voiceCard() {
  const df = typeof dfCard === 'function' ? dfCard(null, P.id) : '';
  if (!CFG.eleven && !CFG.heygen) return '<div class="card" style="padding:10px 16px"><div class="badge">Voice with ElevenLabs and avatar video with HeyGen: add the API keys in Settings to use them here. Nothing is sent to these services before you confirm a cost check.</div></div>' + df;
  voiceLoad();
  return `<div class="card"><h2>Voice &amp; avatar (paid services)</h2>${CFG.eleven ? elevenBlock() : ''}${CFG.heygen ? heygenBlock() : ''}</div>` + df;
}

// ---------- ElevenLabs ----------
function elevenBlock() {
  const has = P.voiceFile && P.voiceSource === 'elevenlabs';
  const models = (VOICES && VOICES.models) || [{ id: EL_SET.model, label: EL_SET.model }];
  return `<div style="margin-bottom:14px"><b>ElevenLabs voice</b> ${has ? '<span class="badge">· current voice was generated here</span>' : ''}
   ${VOICE_ERR ? `<div class="warn" style="color:#e5484d">${esc(VOICE_ERR)}</div>` : ''}
   <div class="row" style="margin-top:6px"><div><label>Voice</label><select onchange="EL_SET.voiceId=this.value;EL.prev=null"><option value="">— choose —</option>${(VOICES || []).map(v => `<option value="${v.id}" ${v.id === EL_SET.voiceId ? 'selected' : ''}>${esc(v.name)}${v.category && v.category !== 'premade' ? ' · ' + esc(v.category) : ''}${v.labels && v.labels.accent ? ' · ' + esc(v.labels.accent) : ''}</option>`).join('')}</select></div>
   <div><label>Model</label><select onchange="EL_SET.model=this.value;EL.prev=null">${models.map(m => `<option value="${m.id}" ${m.id === EL_SET.model ? 'selected' : ''}>${esc(m.label)}</option>`).join('')}</select></div></div>
   <div class="row"><div><label>Stability (${EL_SET.stability})</label><input type="range" min="0" max="1" step="0.05" value="${EL_SET.stability}" onchange="EL_SET.stability=+this.value;EL.prev=null;draw()"></div><div><label>Similarity (${EL_SET.similarity})</label><input type="range" min="0" max="1" step="0.05" value="${EL_SET.similarity}" onchange="EL_SET.similarity=+this.value;EL.prev=null;draw()"></div></div>
   <div class="row" style="margin-top:8px"><button class="sec" onclick="elCheck(false)" ${EL.busy ? 'disabled' : ''}>Check cost (voice for the whole script)</button></div>${elPanel()}</div>`;
}
function elPanel() {
  const p = EL.prev, msg = EL.msg ? `<div class="badge" style="margin-top:6px;color:${EL.msg.startsWith('✓') ? '#3fb950' : '#e5484d'}">${esc(EL.msg)}</div>` : '';
  if (!p) return msg;
  return `<div style="margin-top:8px;padding:10px;border:1px solid var(--line);border-radius:8px;background:var(--surface)">
    ${EL.seg ? `<b>${p.segments} segment(s)</b> · ` : ''}<b>${p.chars.toLocaleString()} characters</b> · ${p.model}
    ${p.remaining != null ? `<div class="badge">Your plan has ${p.remaining.toLocaleString()} characters left.</div>` : ''}
    ${p.skipped && p.skipped.length ? `<div class="badge">Skipped (speaker has no voice): segment ${p.skipped.join(', ')}</div>` : ''}
    ${p.start ? `<div class="badge">Starts with: “${esc(p.start)}…”</div>` : ''}
    ${p.enough ? '' : '<div style="color:#e5484d">Not enough characters left in your plan.</div>'}
    ${P.voiceFile && !EL.seg ? '<div class="badge" style="color:#d29922">This replaces the current voice file; run the analysis again afterwards.</div>' : ''}
    <div class="row" style="margin-top:8px"><button onclick="elGo()" ${!p.enough || EL.busy ? 'disabled' : ''}>${EL.busy ? 'Generating…' : 'Generate (uses ' + p.chars.toLocaleString() + ' characters)'}</button><button class="sec" onclick="EL.prev=null;draw()">Cancel</button></div></div>${msg}`;
}
async function elCheck(seg) {
  EL.seg = !!seg; EL.msg = ''; EL.prev = null;
  if (!seg && !EL_SET.voiceId) { EL.msg = 'Choose a voice first.'; draw(); return; }
  const r = await api('/api/projects/' + P.id + '/eleven/' + (seg ? 'segments-preview' : 'preview'), { voiceId: EL_SET.voiceId, model: EL_SET.model, stability: EL_SET.stability, similarity: EL_SET.similarity });
  if (r.error) EL.msg = r.error; else EL.prev = r;
  draw();
}
async function elGo() {
  EL.busy = true; EL.msg = ''; draw();
  const r = await api('/api/projects/' + P.id + '/eleven/' + (EL.seg ? 'segments-generate' : 'generate'), { token: EL.prev.token });
  EL.busy = false; EL.prev = null;
  if (r.error) { EL.msg = r.error; draw(); return; }
  EL.msg = EL.seg ? `✓ ${r.generated} segment voice(s) generated (${r.chars.toLocaleString()} characters)` : `✓ Voice generated: ${r.seconds} s (${r.chars.toLocaleString()} characters)`;
  const keep = EL.msg; await open_(P.id); EL.msg = keep; draw();
}

// ---------- HeyGen ----------
function heygenBlock() {
  const h = P.heygen;
  const run = h && ['processing', 'pending', 'waiting'].includes(h.status);
  if (run && !window.__hgTimer) window.__hgTimer = setInterval(hgRefresh, 15000);
  if (!run && window.__hgTimer) { clearInterval(window.__hgTimer); window.__hgTimer = null; }
  return `<div><b>HeyGen avatar video</b> ${P.aiAvatar ? '<span class="badge">· AI avatar</span>' : ''}
   ${AV_ERR ? `<div style="color:#e5484d">${esc(AV_ERR)}</div>` : ''}
   ${P.voiceFile ? '' : '<div class="badge" style="color:#d29922">Add or generate the voice first: the avatar speaks this audio.</div>'}
   <div class="row" style="margin-top:6px"><div><label>Avatar</label><select onchange="HG_SET.avatarId=this.value;HG.prev=null"><option value="">— choose —</option>${(AVATARS || []).map(a => `<option value="${a.id}" ${a.id === HG_SET.avatarId ? 'selected' : ''}>${esc(a.name)}${a.gender ? ' · ' + esc(a.gender) : ''}</option>`).join('')}</select></div>
   <label style="display:flex;gap:8px;align-items:center;color:var(--tx);flex:0 0 auto;margin-top:18px"><input type="checkbox" style="width:auto" ${HG.test ? 'checked' : ''} onchange="HG.test=this.checked;HG.prev=null;draw()"> Test mode (free, watermarked)</label></div>
   <div class="row" style="margin-top:8px"><button class="sec" onclick="hgCheck()" ${!P.voiceFile || run || HG.busy ? 'disabled' : ''}>Check before generating</button></div>${hgPanel()}${hgStatus(h)}</div>`;
}
function hgPanel() {
  const p = HG.prev, msg = HG.msg ? `<div class="badge" style="margin-top:6px;color:#e5484d">${esc(HG.msg)}</div>` : '';
  if (!p) return msg;
  return `<div style="margin-top:8px;padding:10px;border:1px solid var(--line);border-radius:8px;background:var(--surface)">
    <b>${p.seconds} s of audio</b> · ${p.dims} · ${p.test ? '<span style="color:#3fb950">test mode: no credits used, watermark on the video</span>' : '<span style="color:#d29922">real generation: uses your HeyGen credits</span>'}
    ${p.quota != null ? `<div class="badge">Remaining quota reported by HeyGen: ${esc(p.quota)}</div>` : ''}
    ${p.replaces ? '<div class="badge" style="color:#d29922">This replaces the current presenter video of this creative.</div>' : ''}
    <div class="row" style="margin-top:8px"><button onclick="hgGo()" ${HG.busy ? 'disabled' : ''}>${HG.busy ? 'Sending…' : p.test ? 'Generate test avatar video' : 'Generate avatar video (uses credits)'}</button><button class="sec" onclick="HG.prev=null;draw()">Cancel</button></div></div>${msg}`;
}
function hgStatus(h) {
  if (!h) return '';
  const col = h.status === 'completed' ? '#3fb950' : h.status === 'failed' ? '#e5484d' : '#d29922';
  return `<div class="badge" style="margin-top:8px">Last HeyGen video: <b style="color:${col}">${esc(h.status)}</b>${h.test ? ' (test)' : ''}${h.error ? ' · ' + esc(h.error) : ''}${['processing', 'pending', 'waiting'].includes(h.status) ? ' · checking every 15 s' : ''} <a style="cursor:pointer;color:var(--ac)" onclick="hgRefresh(true)">Check now</a></div>`;
}
async function hgCheck() {
  HG.msg = ''; HG.prev = null;
  if (!HG_SET.avatarId) { HG.msg = 'Choose an avatar first.'; draw(); return; }
  const r = await api('/api/projects/' + P.id + '/heygen/preview', { avatarId: HG_SET.avatarId, test: HG.test });
  if (r.error) HG.msg = r.error; else HG.prev = r;
  draw();
}
async function hgGo() {
  HG.busy = true; HG.msg = ''; draw();
  const r = await api('/api/projects/' + P.id + '/heygen/generate', { token: HG.prev.token });
  HG.busy = false; HG.prev = null;
  if (r.error) HG.msg = r.error; else { P = Object.assign(P, await api('/api/projects/' + P.id)); }
  draw();
}
async function hgRefresh(force) {
  if (!P) return;
  if (force) await api('/api/projects/' + P.id + '/heygen/check', {});
  const q = await api('/api/projects/' + P.id), was = P.heygen && P.heygen.status;
  P.heygen = q.heygen; if (q.heygen && q.heygen.status === 'completed' && was !== 'completed') { await open_(P.id); return; }
  draw();
}
