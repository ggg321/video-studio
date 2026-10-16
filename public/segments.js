// "Speakers & segments": assign a speaker and source material to each script block, then assemble one combined recording.
let SEG = null, SPK = [], SEG_BUSY = false, SEG_MSG = '';

function segReset() { SEG = null; }
async function segLoad() { SPK = await api('/api/speakers'); SEG = await api('/api/projects/' + P.id + '/segments'); SEG.pid = P.id; }

function modeSwitch() {
  // a script with "Speaker 1:" / "Спикер 2:" lines asks for this mode: say so and offer the switch
  const labelled = /^\s*(спикер|speaker|говорящий|ведучий|ведущий|диктор|голос|клиент(ка)?|клієнт(ка)?|отзыв|відгук|review|гость|гість|эксперт|експерт|врач|лікар|доктор)\s*[#№]?\s*\d*\s*[:：]/im.test(P.script || '');
  if (labelled && P.segMode !== 'segments') return '<div class="card" style="padding:10px 16px"><div class="row" style="align-items:center"><span class="badge" style="flex:1">The script has speaker labels (Speaker 1, Speaker 2…). Several people speak in this creative.</span><button onclick="setP(\'segMode\',\'segments\')">Use different speakers</button></div></div>';
  if (!(CFG.multiSpeaker || P.segMode === 'segments')) return '';   // hidden unless multi-speaker mode is on (or this project already uses it)
  return `<div class="card" style="padding:10px 16px"><div class="row"><label style="margin:0;flex:none">Recording mode</label>
    <select onchange="setP('segMode',this.value)"><option value="single" ${P.segMode === 'segments' ? '' : 'selected'}>One recording (one speaker)</option><option value="segments" ${P.segMode === 'segments' ? 'selected' : ''}>Different speakers per segment</option></select></div></div>`;
}

function segmentsCard() {
  if (!SEG || SEG.pid !== P.id) { segLoad().then(draw); return '<div class="card"><h2>Speakers &amp; segments</h2><div class="badge">Loading…</div></div>'; }
  const dot = c => `<span style="display:inline-block;width:11px;height:11px;border-radius:50%;background:${c || '#888'};margin-right:6px"></span>`;
  const rows = SEG.blocks.map(b => {
    const sp = SPK.find(s => s.id === (b.speakerId || b.effectiveSpeakerId));
    const usesDefault = sp && sp.videoFile && !b.videoFile;
    return `<div style="border-top:1px solid var(--line);padding:12px 0">
      <div class="row" style="align-items:flex-start;gap:10px"><div style="flex:0 0 auto"><b>${dot(sp && sp.color)}Segment ${b.i + 1}</b>${b.label ? ' <span class="badge">' + esc(b.label) + '</span>' : ''}</div><div class="badge" style="flex:1">${esc(b.text.slice(0, 140))}${b.text.length > 140 ? '…' : ''}</div></div>
      <div class="row" style="margin-top:6px">
        <div><label>Speaker</label><select onchange="segSet(${b.i},{speakerId:this.value})"><option value="">— choose —</option>${SPK.map(s => `<option value="${s.id}" ${s.id === (b.speakerId || b.effectiveSpeakerId) ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></div>
        <div><label>Video (this segment)</label><input type="file" accept="video/*" id="sv${b.i}" onchange="segUpload(${b.i})"></div>
        <div><label>Voice (optional)</label><input type="file" accept="audio/*" id="sa${b.i}" onchange="segUpload(${b.i})"></div>
        <button class="sec" style="flex:none;margin-top:18px" onclick="segUpload(${b.i})">Upload</button></div>
      <div class="badge" id="segup${b.i}" style="margin-top:4px">${esc(SEG_UP[b.i] || '')}</div>
      <div class="badge" style="margin-top:4px">${b.videoFile ? '🎥 ' + esc(b.videoFile) + ' <a style="cursor:pointer;color:var(--ac)" onclick="segSet(' + b.i + ',{clear:[\'videoFile\']})">✕</a> ' : ''}${b.voiceFile ? '🔊 ' + esc(b.voiceFile) + ' <a style="cursor:pointer;color:var(--ac)" onclick="segSet(' + b.i + ',{clear:[\'voiceFile\']})">✕</a> ' : ''}${usesDefault ? 'Uses the default video of ' + esc(sp.name) : ''}${!b.videoFile && !b.voiceFile && !usesDefault ? 'No material yet' : ''}</div>
      <label style="display:flex;gap:8px;align-items:center;color:var(--tx);margin-top:6px"><input type="checkbox" style="width:auto" ${b.tagOn ? 'checked' : ''} onchange="segSet(${b.i},{tagOn:this.checked})"> Show a name tag at the start <input style="max-width:200px" value="${esc(b.tagText || (sp ? sp.name : ''))}" onchange="segSet(${b.i},{tagText:this.value})"></label></div>`;
  }).join('');
  const times = SEG.times ? `<div class="badge" style="margin-top:8px">Assembled: ${SEG.times.map((t, i) => 'segment ' + (i + 1) + ' ' + (t.end - t.start).toFixed(1) + ' s').join(' · ')} · total ${SEG.times[SEG.times.length - 1].end.toFixed(1)} s. Now run the analysis below.</div>` : '';
  return `<div class="card"><h2>Speakers &amp; segments</h2>
    <div class="badge">Each script block is a segment. Choose who speaks it and add that person's recording. Segments are joined into one video, then everything else works as usual.
      <a href="/speakers.html" target="_blank" style="color:var(--ac)">Manage speakers</a></div>
    ${SEG.problems && SEG.problems.length ? `<div style="color:#d29922;margin:8px 0">${SEG.problems.map(x => '⚠ ' + esc(x)).join('<br>')}</div>` : ''}
    ${(SEG.labels || []).length ? '<div style="margin:10px 0;padding:10px;border:1px solid var(--line);border-radius:10px"><b>Who is who</b><div class="badge">The script names its speakers. Choose the person for each name once: it applies to every part of the script with that name. The list holds the people of the Speakers page.</div>' + (SEG.labels.some(l => !l.speakerId) ? '<p style="margin:8px 0 0"><button class="sec sm" onclick="segPeople()">Create the people from these names</button></p>' : '') + SEG.labels.map(l => '<div class="row" style="gap:10px;align-items:center;margin-top:6px"><span style="flex:0 0 120px">' + esc(l.label) + '</span><select onchange="segMap(\'' + esc(l.label).replace(/\'/g, '') + '\',this.value)"><option value="">— choose —</option>' + SPK.map(s => '<option value="' + s.id + '"' + (s.id === l.speakerId ? ' selected' : '') + '>' + esc(s.name) + '</option>').join('') + '</select></div>').join('') + '</div>' : ''}
    ${rows || '<div class="badge">Write the script first: each block (blank line or "1.", "2.") becomes a segment.</div>'}
    ${CFG.eleven ? `<div class="row" style="margin-top:12px"><div><label>ElevenLabs model</label><select onchange="EL_SET.model=this.value;EL.prev=null">${(VOICES && VOICES.models || [{ id: EL_SET.model, label: EL_SET.model }]).map(m => `<option value="${m.id}" ${m.id === EL_SET.model ? 'selected' : ''}>${esc(m.label)}</option>`).join('')}</select></div><button class="sec" style="flex:none;margin-top:18px" onclick="elCheck(true)">Check cost: voices for all segments</button></div>${elPanel()}` : ''}
    <div class="row" style="margin-top:12px"><button onclick="segAssemble()" ${SEG_BUSY ? 'disabled' : ''}>${SEG_BUSY ? 'Assembling…' : 'Assemble segments'}</button><span class="badge" style="color:${SEG_MSG.startsWith('✓') ? '#3fb950' : '#e5484d'}">${esc(SEG_MSG)}</span></div>${times}</div>`;
}

async function segPeople() { SEG = Object.assign(await api('/api/projects/' + P.id + '/speakers-from-labels', {}), { pid: P.id }); SPK = await api('/api/speakers'); draw(); }
async function segMap(label, speakerId) { SEG = Object.assign(await api('/api/projects/' + P.id + '/speaker-map', { label, speakerId }), { pid: P.id }); draw(); }
async function segSet(i, patch) { SEG = Object.assign(await api('/api/projects/' + P.id + '/segments/' + i, patch), { pid: P.id }); draw(); }
let SEG_UP = {};
async function segUpload(i) {
  const v = document.getElementById('sv' + i).files[0], a = document.getElementById('sa' + i).files[0];
  if (!v && !a) return;
  const fd = new FormData(); if (v) fd.append('video', v); if (a) fd.append('voice', a);
  const say = m => { SEG_UP[i] = m; const e = document.getElementById('segup' + i); if (e) e.textContent = m; };
  const mb = ((v ? v.size : 0) + (a ? a.size : 0)) / 1048576;
  say('Uploading… 0% (' + mb.toFixed(0) + ' MB)');
  const r = await new Promise(res => { const x = new XMLHttpRequest(); x.open('POST', '/api/projects/' + P.id + '/segments/' + i + '/media');
    x.upload.onprogress = e => { if (e.lengthComputable) say('Uploading… ' + Math.round(100 * e.loaded / e.total) + '% (' + mb.toFixed(0) + ' MB)'); };
    x.onload = () => { try { res(JSON.parse(x.responseText)); } catch { res({ error: 'The server answered with an error (' + x.status + ').' }); } };
    x.onerror = () => res({ error: 'The upload was interrupted.' }); x.send(fd); });
  if (r.error || !r.blocks) { say(r.error || 'The upload did not work.'); return; }
  SEG_UP[i] = ''; SEG = Object.assign(r, { pid: P.id }); draw();
}
async function segAssemble() {
  SEG_BUSY = true; SEG_MSG = ''; draw();
  const r = await api('/api/projects/' + P.id + '/segments-assemble', {});
  SEG_BUSY = false;
  if (r.error) { SEG_MSG = r.error; draw(); return; }
  SEG_MSG = '✓ Assembled'; await open_(P.id);
}
