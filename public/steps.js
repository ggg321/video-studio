// Project page: one step at a time (Script, Voice, Inserts, Sound, Style, Render) instead of one very long page.
// Replaces draw0() of index.html (this file is loaded before the inline script, which no longer defines it).
let STEP = 1, FMT = [];
const STEP_NAMES = ['Script', 'Voice', 'Inserts', 'Sound', 'Style', 'Render'];
// the six old steps are shown as three pages; each page stacks its two old steps
const GROUPS = [['Materials', [1, 2]], ['Montage', [3, 4]], ['Style and export', [5, 6]]];
const GROUP = n => (n + 1) >> 1;
const LANGS = [['', 'Auto-detect'], ['en', 'English'], ['nl', 'Nederlands'], ['de', 'Deutsch'], ['fr', 'Français'], ['es', 'Español'], ['it', 'Italiano'], ['pt', 'Português'], ['pl', 'Polski'], ['cs', 'Čeština'], ['sk', 'Slovenčina'], ['sl', 'Slovenščina'], ['hr', 'Hrvatski'], ['bg', 'Български'], ['ro', 'Română'], ['hu', 'Magyar'], ['el', 'Ελληνικά'], ['da', 'Dansk'], ['sv', 'Svenska'], ['fi', 'Suomi'], ['et', 'Eesti'], ['lv', 'Latviešu'], ['lt', 'Lietuvių'], ['mt', 'Malti'], ['ru', 'Русский'], ['uk', 'Українська'], ['no', 'Norsk (Whisper)'], ['tr', 'Türkçe (Whisper)'], ['ar', 'العربية (Whisper)'], ['he', 'עברית (Whisper)'], ['zh', '中文 (Whisper)'], ['ja', '日本語 (Whisper)'], ['ko', '한국어 (Whisper)'], ['hi', 'हिन्दी (Whisper)'], ['sr', 'Српски (Whisper)'], ['mk', 'Македонски (Whisper)'], ['sq', 'Shqip (Whisper)'], ['ka', 'ქართული (Whisper)'], ['id', 'Indonesia (Whisper)'], ['vi', 'Tiếng Việt (Whisper)']];
const isBusy = () => ['analyzing', 'rendering', 'queued'].includes(P.status);
const fmtInfo = id => FMT.find(f => f.id === id) || { id, label: id, use: '' };
const fmtShape = id => id.startsWith('vertical') ? 'width:18px;height:32px' : id.startsWith('portrait') ? 'width:24px;height:30px' : id.startsWith('landscape') ? 'width:34px;height:19px' : 'width:26px;height:26px';

function stepDone() {
  const seg = P.segMode === 'segments';
  return [
    !!(P.script && P.script.trim()),
    !!(P.presenterFile || P.voiceFile) || !!(seg && P.segTimes && P.segTimes.length),
    !!P.cuts,
    !!(P.cuts && P.audio && (P.audio.music || (P.audio.sfx || []).length)),
    !!P.subStyle,
    !!P.outFile
  ];
}
function defaultStep() {
  const d = stepDone();
  if (P.outFile) return 6;
  for (let i = 0; i < 3; i++) if (!d[i]) return i + 1;
  return 3;
}
function go(n) {
  STEP = Math.min(6, Math.max(1, n)); const g = GROUP(STEP);
  document.querySelectorAll('.stp').forEach(e => e.classList.toggle('on', GROUP(+e.dataset.s) === g));
  document.querySelectorAll('.step-btn').forEach((b, i) => b.classList.toggle('on', i + 1 === g));
  window.scrollTo({ top: 0 });
  if (g === 2 && window.initTimeline) initTimeline();
  if (g === 3 && window.initPreview) initPreview();
}
const stp = (n, html) => `<div class="stp ${GROUP(STEP) === GROUP(n) ? 'on' : ''}" data-s="${n}">${html}</div>`;
// buttons only at the end of each page (the old steps 2, 4 and 6)
const stepnav = n => (n % 2) ? '' : `<div class="stepnav">${n > 2 ? `<button class="sec" onclick="go(${n - 3})">← Back</button>` : '<span></span>'}${n < 6 ? `<button onclick="go(${n + 1})">Next →</button>` : '<span></span>'}</div>`;

function phead() {
  const d = stepDone(), busy = isBusy();
  const st = busy ? ['warn', 'Working'] : P.outFile ? ['ok', 'Rendered'] : P.cuts ? ['ac', 'Planned'] : ['', 'Draft'];
  const t = typeof TASKS_CACHE !== 'undefined' && TASKS_CACHE ? TASKS_CACHE.find(x => x.id === P.taskId) : null;
  return `<div class="phead"><div class="top">
    <button class="sec menu-btn" onclick="document.body.classList.toggle('aside-open')" title="Projects" aria-label="Projects">☰</button><input id="name" class="title" value="${esc(P.name)}" onchange="saveMeta()" aria-label="Project name">
    <select class="niche" onchange="setP('niche',this.value)" title="Niche">${NICHES.map(n => `<option value="${n.id}" ${(P.niche || 'weight-loss') == n.id ? 'selected' : ''}>Niche: ${esc(n.name)} (${n.count})</option>`).join('')}</select>
    <span class="pill ${st[0]}">${st[1]}</span>${lifeChip()}${creativeMenu()}</div>
    <div class="crumb">${t ? `<a href="/tasks.html#${t.id}">${esc(t.title)}</a> › creative #${P.creativeNo || '?'}${P.variantOf ? ' · variant' : ''}` : 'Not part of a task'}</div>
    <nav class="steps">${GROUPS.map((g, i) => { const gd = i === 0 ? d[0] && d[1] : i === 1 ? d[2] : d[5]; return `<button class="step-btn ${GROUP(STEP) === i + 1 ? 'on' : ''} ${gd ? 'done' : ''}" onclick="go(${g[1][0]})"><span class="n">${gd ? '✓' : i + 1}</span><span class="t">${g[0]}</span></button>`; }).join('')}</nav></div>`;
}
function statusbar() {
  if (!isBusy()) return '';
  const lab = P.status === 'queued' ? 'In the queue…' : P.status === 'rendering' ? 'Rendering…' : 'Analyzing…';
  return `<div class="statusbar"><b>${lab}</b><div class="bar"><i id="pb" style="width:${Math.round((P.progress || 0) * 100)}%"></i></div>${P.exportNow ? `<span class="badge">${esc(fmtInfo(P.exportNow).label)}</span>` : ''}</div>`;
}

// ---- 1 Script ----
function scriptStep() {
  return `<div class="card"><h2>Script</h2><p class="lead">Paste what the speaker says. Separate blocks with a blank line or number them (1., 2. …): each block becomes one planned moment.</p>
    <textarea id="script" onchange="saveMeta()">${esc(P.script)}</textarea></div>${stepnav(1)}`;
}

// ---- 2 Voice ----
const langSelect = () => `<select onchange="setP('lang',this.value)">${LANGS.map(([v, l]) => `<option value="${v}" ${(P.lang || '') == v ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
function speakerCard() {
  const lang = (LANGS.find(x => x[0] === (P.lang || '')) || LANGS[0])[1];
  return `<div class="card"><h2>Speaker video or voice</h2>
    <p class="lead">Upload the recording of the speaker (video), or only the voice track. Everything else is built from it.</p>
    ${P.presenterFile || P.voiceFile ? `<div class="chips" style="margin-bottom:12px">${P.presenterFile ? '<span class="chip on">✓ Speaker video</span>' : ''}${P.voiceFile ? '<span class="chip on">✓ Voice track</span>' : ''}</div>` : ''}
    <div class="row"><div><label>Speaker video (mp4/mov)</label><input type="file" id="fv" accept="video/*"></div><div><label>Or voice only (mp3/wav)</label><input type="file" id="fa" accept="audio/*"></div><button onclick="upload()">Upload</button></div>
    ${joinCard()}
    <details class="more"><summary>Recognition language: ${lang}</summary><div class="body"><label>Spoken language (for recognition)</label>${langSelect()}</div></details>
    <button class="sec" onclick="tts()">Or generate voice (TTS)</button></div>`;
}
function voiceStep() {
  const seg = P.segMode === 'segments';
  return modeSwitch() + (seg ? segmentsCard() : speakerCard() + voiceCard()) + stepnav(2);
}

// ---- 3 Inserts ----
function lipsyncCard() {
  if (!P.lipsync) return '';
  const mm = t => Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0');
  return `<div class="card"><h2>⚠ Recommended: cover these moments</h2><div class="badge">(lip-sync score ${P.lipsync.meanScore})</div>
    <div class="chips" style="margin:10px 0 14px">${P.lipsync.bad.map(b => `<span class="pill warn">${mm(b.start)}–${mm(b.end)} · ${esc(b.reason)}</span>`).join('')}</div>
    <div class="row"><input id="marks" placeholder="Mark bad moments in seconds, e.g. 7.9-9.1, 12.8-13.8"><button class="sec" onclick="coverMarks()">Cover these</button></div></div>`;
}
const modeOpts = cur => [['off', 'Off'], ['notify', 'Warn only'], ['cover', 'Cover automatically']].map(([v, l]) => `<option value="${v}" ${cur == v ? 'selected' : ''}>${l}</option>`).join('');
function insertsStep(busy) {
  const n = P.cuts ? P.cuts.length : 0;
  return `<div class="card"><h2>Find inserts</h2>
    <p class="lead">The voice is transcribed and matched to the script. Every moment gets a clip from your library, a stock video or a text card.</p>
    ${P.cuts ? '' : '<div class="hint" style="margin-bottom:10px">Want the inserts placed like in a finished video? Choose a sample in “Make it like a sample” below before you analyze.</div>'}
    ${P.error ? `<div class="hint bad">${esc(P.error)}</div>` : ''}
    <div class="row mid"><button class="lg" onclick="analyze()" ${busy ? 'disabled' : ''}>${P.cuts ? 'Analyze again' : 'Analyze and suggest inserts'}</button>
      ${P.cuts ? `<span class="badge">Recognition: ${Math.round((P.matchRatio || 0) * 100)}% of the script found in the audio.</span>` : ''}</div>
    ${P.cuts && P.matchRatio < .8 ? '<div class="hint warn" style="margin-top:12px">Low: check that the speaker follows the script.</div>' : ''}
    <div class="row" style="margin-top:14px"><div><label>Transitions between inserts</label>${trnSelect()}</div><div><label>Transition speed (${Math.round((P.transDur || 0.35) * 100) / 100} s)</label><input type="range" min="0.15" max="0.9" step="0.05" value="${P.transDur || 0.35}" onchange="setP('transDur',+this.value)"></div></div>
    <div class="badge">For one insert only: after the analysis, in “Inserts as a list” below (a transition in every row), or on the timeline.</div>
    <details class="more"><summary>Matching options</summary><div class="body">
      ${libsHtml()}
      <label class="chk"><input type="checkbox" ${P.cardsOn === false ? '' : 'checked'} onchange="setP('cardsOn',this.checked)"> Text cards (a small label where no clip fits; off = the speaker stays on screen)</label>
      <label class="chk"><input type="checkbox" id="clips" ${P.clips === false ? '' : 'checked'} onchange="saveMeta()"> Use clips from the library (off = text cards only)</label>
      <div class="row"><div><label>Insert matching</label><select onchange="setP('matching',this.value)"><option value="semantic" ${P.matching === 'keywords' ? '' : 'selected'}>By meaning (AI, local)</option><option value="keywords" ${P.matching === 'keywords' ? 'selected' : ''}>By keywords (tags)</option></select>${CFG.semantic ? '' : '<div class="badge warn">AI model not installed: using keywords</div>'}</div>
      <div><label>Lip-sync check</label><select onchange="setP('lipsyncMode',this.value)">${modeOpts(P.lipsyncMode || 'notify')}</select></div>
      <div><label>Jump cuts in footage</label><select onchange="setP('cutsMode',this.value)">${modeOpts(P.cutsMode || 'notify')}</select></div></div></div></details></div>
    ${refCard()}${hookCard()}${lipsyncCard()}${timelineCard()}${reviewCard()}
    ${P.cuts ? `<details class="more" ${n <= 6 ? 'open' : ''}><summary>Inserts as a list (${n})</summary><div class="body"><div id="cuts">${P.cuts.map(cutRow).join('')}</div>
      <div class="row" style="margin-top:12px;justify-content:flex-start"><button class="sec" onclick="addCut()">+ Add insert</button><button class="sec" onclick="autoStock()">Cards → stock video (auto)</button>${P.cuts.some(c => c.clip === 'card') ? '<button class="sec" onclick="removeCards()">Remove all cards</button>' : ''}</div></div></details>` : ''}
    ${stepnav(3)}`;
}

// ---- 4 Sound ----
function soundStep() {
  return (P.cuts ? audioCard() : `<div class="card"><div class="empty"><b>Analyze first</b>Music and sound effects are placed after the inserts are planned.<br><br><button class="sec" onclick="go(3)">Go to Inserts</button></div></div>`) + stepnav(4);
}

// ---- 5 Style ----
// animated key words over the normal video (drawn by Remotion on a transparent layer, no rebuild of the video)
function lightMotionCard() {
  const m = Object.assign({ on: false, anim: 'split', underline: true, particles: false, density: 'low' }, P.lightMotion || {});
  const sel = (k, opts) => '<select onchange="setLM(\'' + k + '\',this.value)">' + opts.map(([v, l]) => '<option value="' + v + '"' + (m[k] === v ? ' selected' : '') + '>' + l + '</option>').join('') + '</select>';
  return '<div class="card"><h2>Light motion</h2><div class="badge">Animated key words over the normal video, with a hand-drawn underline and soft particles if you like. The video is not rebuilt, the words are laid on top. It adds a few minutes to the render.</div>'
    + '<label class="chk" style="margin-top:10px"><input type="checkbox"' + (m.on ? ' checked' : '') + ' onchange="setLM(\'on\',this.checked)"> Add light motion to this video</label>'
    + (m.on ? '<div class="row" style="gap:12px"><div><label>How the words appear</label>' + sel('anim', [['blur', 'Blur in'], ['gsap', 'Letters spring in'], ['split', 'Lines and letters rise']]) + '</div><div><label>How many words</label>' + sel('density', [['low', 'Few'], ['medium', 'Normal'], ['high', 'Many']]) + '</div></div>'
      + '<label class="chk"><input type="checkbox"' + (m.underline ? ' checked' : '') + ' onchange="setLM(\'underline\',this.checked)"> Hand-drawn underline</label>'
      + '<label class="chk"><input type="checkbox"' + (m.particles ? ' checked' : '') + ' onchange="setLM(\'particles\',this.checked)"> Floating particles</label>' : '')
    + '</div>';
}
async function setLM(k, v) { P.lightMotion = await api('/api/projects/' + P.id + '/lightmotion', { [k]: v }); draw(); }
// several separate videos of the speaker -> one speaker video (in the order chosen)
let JOINQ = [], JOINMSG = '';
function joinCard() {
  const rows = JOINQ.map((f, i) => '<div class="row" style="gap:8px;align-items:center;margin-top:4px"><span class="badge" style="width:22px">' + (i + 1) + '</span><span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(f.name) + '</span><span class="badge">' + (f.size / 1048576).toFixed(0) + ' MB</span>'
    + '<button class="sec sm" onclick="joinMove(' + i + ',-1)"' + (i ? '' : ' disabled') + '>↑</button><button class="sec sm" onclick="joinMove(' + i + ',1)"' + (i < JOINQ.length - 1 ? '' : ' disabled') + '>↓</button><button class="sec sm" onclick="joinDrop(' + i + ')">✕</button></div>').join('');
  const parts = (P.joinParts || []).length ? '<div class="badge" style="margin-top:8px">Joined from: ' + P.joinParts.map((x, i) => (i + 1) + '. ' + esc(x.name) + ' (' + x.start.toFixed(0) + '–' + x.end.toFixed(0) + ' s)').join(' · ') + '</div>' : '';
  return '<details class="more"' + (JOINQ.length || JOINMSG ? ' open' : '') + '><summary>Several videos → one</summary><div class="body"><div class="badge">Choose 2 to 10 separate videos of the speaker. They are joined in the order below into one speaker video, and everything else works as usual.</div>'
    + '<input type="file" id="fvm" accept="video/*" multiple onchange="joinPick(this.files)" style="margin-top:8px">' + rows
    + (JOINQ.length > 1 ? '<p style="margin-top:10px"><button onclick="joinUpload()">Join ' + JOINQ.length + ' videos and upload</button></p>' : '') + '<div class="badge" id="joinmsg" style="margin-top:6px">' + esc(JOINMSG) + '</div>' + parts + '</div></details>';
}
function joinPick(files) { JOINQ = [...JOINQ, ...files].slice(0, 30); draw(); }
function joinMove(i, d) { const j = i + d; if (j < 0 || j >= JOINQ.length) return; [JOINQ[i], JOINQ[j]] = [JOINQ[j], JOINQ[i]]; draw(); }
function joinDrop(i) { JOINQ.splice(i, 1); draw(); }
async function joinUpload() {
  if (JOINQ.length < 2) return;
  await saveMeta();
  const fd = new FormData(); JOINQ.forEach(f => fd.append('parts', f));
  const set = m => { JOINMSG = m; const e = document.getElementById('joinmsg'); if (e) e.textContent = m; };
  set('Uploading… 0%');
  const r = await new Promise(res => { const x = new XMLHttpRequest(); x.open('POST', '/api/projects/' + P.id + '/media-join'); x.upload.onprogress = e => { if (e.lengthComputable) set('Uploading… ' + Math.round(100 * e.loaded / e.total) + '%'); };
    x.onload = () => { try { res(JSON.parse(x.responseText)); } catch { res({ error: 'The server answered with an error (' + x.status + ').' }); } }; x.onerror = () => res({ error: 'The upload was interrupted.' }); x.send(fd); });
  if (r.error) { set(r.error); return; }
  for (let k = 0; k < 1800; k++) {
    await new Promise(ok => setTimeout(ok, 2000));
    const s = await api('/api/projects/' + P.id + '/join'), j = s.join || {};
    if (j.status === 'running') set('Joining… ' + j.done + ' of ' + j.total);
    else if (j.status === 'error') { set(j.error || 'It did not work.'); return; }
    else if (j.status === 'done') { JOINQ = []; JOINMSG = ''; P = Object.assign(P, await api('/api/projects/' + P.id)); draw(); return; }
  }
}
// the libraries the inserts are taken from: this niche, all libraries, or a choice
const libsMode = () => P.libs === 'all' ? 'all' : (Array.isArray(P.libs) ? 'pick' : '');
function libsHtml() {
  const others = (typeof NICHES !== 'undefined' ? NICHES : []).filter(n => n.id !== (P.niche || 'weight-loss')), m = libsMode();
  if (!others.length) return '';
  return '<div class="row"><div><label>Take inserts from</label><select onchange="setLibs(this.value)"><option value=""' + (m === '' ? ' selected' : '') + '>This niche only</option><option value="all"' + (m === 'all' ? ' selected' : '') + '>All libraries (the best clip wins)</option><option value="pick"' + (m === 'pick' ? ' selected' : '') + '>Choose libraries…</option></select></div></div>'
    + (m === 'pick' ? '<div style="margin:4px 0 8px">' + others.map(n => '<label class="chk"><input type="checkbox"' + (P.libs.includes(n.id) ? ' checked' : '') + ' onchange="toggleLib(\'' + n.id + '\',this.checked)"> ' + esc(n.name) + ' <span class="badge">' + n.count + '</span></label>').join('') + '</div>' : '')
    + (m ? '<div class="badge" style="margin-bottom:8px">If a better clip for a phrase is in another library, it is used. The change applies at the next analysis.</div>' : '');
}
async function setLibs(v) { P.libs = v === 'all' ? 'all' : v === 'pick' ? [] : ''; await api('/api/projects/' + P.id, { libs: P.libs }); if (!P.libs) delete P.libs; draw(); }
async function toggleLib(id, on) { const s = new Set(Array.isArray(P.libs) ? P.libs : []); on ? s.add(id) : s.delete(id); P.libs = [...s]; await api('/api/projects/' + P.id, { libs: P.libs }); draw(); }
// the real result: six seconds rendered by the real pipeline with the chosen subtitles (an animated template included)
async function capExact() {
  const el = document.getElementById('capexact'); if (!el) return;
  if (!P.words) { el.innerHTML = '<div class="badge">Run the analysis first: the subtitles need the words.</div>'; return; }
  el.innerHTML = '<div class="badge" style="margin-top:8px">Rendering the real result… ' + (P.hfCaption ? 'an animated template takes about a minute.' : 'a few seconds.') + '</div>';
  const r = await api('/api/projects/' + P.id + '/preview', { w: 540 });
  el.innerHTML = r.error ? '<div class="badge" style="color:#ff5a5f;margin-top:8px">' + esc(r.error) + '</div>' : '<video controls autoplay loop playsinline src="' + r.url + '" style="width:100%;margin-top:8px;border-radius:10px;background:#000"></video><div class="badge">The real render of ' + r.from.toFixed(1) + '–' + r.to.toFixed(1) + ' s with the subtitles you chose.</div>';
}
function styleStep() {
  const acc = P.accent || (STY.find(s => s.id == (P.subStyle || 'classic')) || { accent: '#ff0000' }).accent;
  const hasPreset = (NICHES.find(n => n.id === (P.niche || 'weight-loss')) || { defaults: {} }).defaults.preset;
  return `<div class="card pvcard" id="cappvcard"><div id="cappv"></div><div class="badge" style="margin-top:8px">Drag the text in the frame to place it. The frame also shows the effects.</div>
    <div class="row" style="margin-top:10px"><button class="sec" onclick="capExact()">Show the exact subtitles (6 s)</button></div><div id="capexact"></div></div><div class="card"><h2>Subtitles style</h2>
    <div class="row"><div><label>Subtitle template</label><select onchange="setP('subStyle',this.value)">${STY.map(s => `<option value="${s.id}" ${(P.subStyle || 'classic') == s.id ? 'selected' : ''}>${s.label}</option>`).join('')}</select>${typeof HFC !== 'undefined' && HFC.length ? `<label>Animated template (slower to render)</label><select onchange="setHF(this.value)"><option value="">None (use the template above)</option>${HFC.map(s => `<option value="${s.id}" ${P.hfCaption === s.id ? 'selected' : ''}>${s.label}</option>`).join('')}</select><div class="badge">The animated templates are drawn as a separate layer, so the render takes a few minutes longer. The preview in the frame still shows the quick template.</div>` : ''}</div>
    <div><label>Font</label><select onchange="setP('font',this.value)"><option value="">Template default</option>${FONTS.map(f => `<option value="${f.label}" ${P.font == f.label ? 'selected' : ''}>${f.label}${f.cyrillic ? '' : ' (Latin only)'}</option>`).join('')}</select></div>
    <div style="flex:0 0 110px"><label>Accent colour</label><input type="color" value="${acc}" onchange="setP('accent',this.value)"></div></div>
    <div id="capprev" style="margin-top:18px"></div></div>
    ${bandCard()}
    ${lightMotionCard()}
    <div class="card"><h2>Look of the video</h2>
    <div class="row"><div><label>Transitions</label>${trnSelect()}</div><div><label>Transition speed (${Math.round((P.transDur || 0.35) * 100) / 100} s)</label><input type="range" min="0.15" max="0.9" step="0.05" value="${P.transDur || 0.35}" onchange="setP('transDur',+this.value)"></div></div>
    <div class="badge" style="margin-top:6px">Light, zoom and news transitions are applied to every insert. Mixes alternate between the transitions of one kind.</div>
    <label class="chk"><input type="checkbox" ${P.enhance ? 'checked' : ''} onchange="setP('enhance',this.checked)"> Basic video enhancement (denoise, sharpen, colour)</label>
    <label class="chk"><input type="checkbox" ${P.upscale ? 'checked' : ''} ${CFG.upscaler ? '' : 'disabled'} onchange="setP('upscale',this.checked)"> AI upscale (Real-ESRGAN, slow) ${CFG.upscaler ? '' : '<span class="badge">not installed</span>'}</label></div>
    ${fxCard()}
    ${emojiCard()}
    ${overlaysCard()}
    ${P.words ? subsCard() : ''}
    <div class="card soft"><div class="row mid"><div><b>Niche preset</b> ${hasPreset ? '<span class="pill ok">saved</span>' : ''}<div class="badge">Save this look (template, font, transitions, music, sizes…) as the starting point for every new creative of this niche.</div></div>
      <button class="sec" onclick="presetSave()">Save as niche preset</button><button class="ghost" onclick="presetApply()">Apply niche preset</button></div></div>
    ${stepnav(5)}`;
}

// ---- 6 Render ----
function toggleExport(id, on) {
  const s = new Set(P.exports || []); on ? s.add(id) : s.delete(id); P.exports = [...s];
  api('/api/projects/' + P.id, { exports: P.exports }); draw();
}
function renderStep(busy) {
  const main = P.format || 'square', ex = (P.exports || []).filter(f => f !== main);
  const dl = (file, label, sub, fid) => `<div class="out"><b>${esc(label)}</b><span class="badge">${esc(sub)}</span><a class="btn sm" href="/files/${P.id}/${file}?v=${P.rendered}" download="${esc(P.name)}_${fid}.mp4">Download</a><button class="sec sm" onclick="openVideo('${file}')">Open in player</button></div>`;
  return `<div class="card"><h2>Typographic video</h2><div class="badge">Animated key words over the speaker, full-screen text scenes and phone frames with your screenshots.</div><p style="margin-top:10px"><a class="btn" href="/typo.html?id=${P.id}">Open the typographic editor</a>${P.typo && P.typo.file ? ` <a class="btn sec" href="/files/${P.id}/${P.typo.file}?v=${P.typo.rendered || 0}" download>Download the last one</a>` : ''}</p></div><div class="card"><h2>Video size</h2>
    <label style="margin-top:0">Main size</label><select id="format" onchange="saveMeta().then(draw)">${FMT.map(f => `<option value="${f.id}" ${main === f.id ? 'selected' : ''}>${f.label} · ${f.use}</option>`).join('')}</select>
    <label style="margin-top:18px">Also export these sizes</label>
    <div class="fmts">${FMT.filter(f => f.id !== main).map(f => `<label class="fmt ${ex.includes(f.id) ? 'on' : ''}"><input type="checkbox" ${ex.includes(f.id) ? 'checked' : ''} onchange="toggleExport('${f.id}',this.checked)"><span class="shape" style="${fmtShape(f.id)}"></span><span><b>${f.label}</b><small>${f.use}</small></span></label>`).join('')}</div>
    <div class="badge" style="margin-top:10px">Extra sizes are rendered from the same plan in one go; subtitles are rescaled automatically.</div></div>
    <div class="card"><h2>Check and render</h2>${qcCard()}
    <div class="row mid" style="margin-top:8px;justify-content:flex-start"><button class="lg" onclick="renderIt()" ${busy || !P.cuts ? 'disabled' : ''}>Render video</button><span class="badge">${1 + ex.length} size(s)</span></div>
    ${!P.cuts ? '<div class="hint warn" style="margin-top:12px">Run the analysis first.</div>' : ''}
    ${P.outFile ? `<div class="outs">${dl(P.outFile, fmtInfo(main).label, fmtInfo(main).use, main)}${Object.entries(P.extraOuts || {}).filter(([f]) => ex.includes(f)).map(([f, o]) => dl(o.file, fmtInfo(f).label, fmtInfo(f).use, f)).join('')}</div>
      <p style="margin:16px 0 8px"><video controls src="/files/${P.id}/${P.outFile}?v=${P.rendered}" width="360"></video></p>
      <div class="row mid" style="justify-content:flex-start"><a class="btn sec sm" target="_blank" href="/share/${P.id}">Client link</a><button class="sec sm" onclick="crFolder()">Work folder</button>${P.workFolder ? '<button class="sec sm" onclick="crOpen()">Open folder</button>' : ''}</div>` : ''}</div>
    ${stepnav(6)}`;
}

function draw0() {
  const busy = isBusy();
  document.body.classList.add('has-proj');
  $('#view').innerHTML = phead() + statusbar() + stp(1, scriptStep()) + stp(2, voiceStep()) + stp(3, insertsStep(busy)) + stp(4, soundStep()) + stp(5, styleStep()) + stp(6, renderStep(busy));
  wrapPanels();
  const ph = document.querySelector('.phead'); if (ph) document.documentElement.style.setProperty('--phead-h', ph.offsetHeight + 'px');
}

// ---- panels: a card shows its title and a one-line summary, the rest opens on a click ----
let PANEL_STATE = {};
const wordsOf = s => String(s || '').split(/\s+/).filter(Boolean).length;
const PANELS = {
  'Script': { open: true, sum: () => wordsOf(P.script) + ' words' },
  'Speaker video or voice': { open: true, sum: () => P.presenterFile ? (P.aiAvatar ? 'Avatar video' : 'Video added') : P.voiceFile ? 'Voice added' : 'Nothing added yet' },
  'Voice & avatar (paid services)': { sum: () => P.heygen ? 'HeyGen: ' + P.heygen.status : P.voiceSource ? 'Voice: ' + P.voiceSource : 'Optional' },
  'DreamFace (manual lip-sync)': { sum: () => 'Optional' },
  'Find inserts': { open: () => !P.cuts, sum: () => P.cuts ? P.cuts.length + ' moments planned' : 'Not analyzed yet' },
  'Make it like a sample': { sum: () => P.referenceReport ? 'Sample applied: ' + P.referenceReport.name : P.reference ? 'Sample chosen' : 'Not used' },
  'Opening insert (hook)': { sum: () => { const h = (P.cuts || []).find(c => c.hook); return h ? 'Clip ' + h.clip + ', ' + (h.end - h.start).toFixed(1) + ' s' : 'None'; } },
  '⚠ Recommended: cover these moments': { open: true, sum: () => (P.lipsync && P.lipsync.bad ? P.lipsync.bad.length : 0) + ' moment(s)' },
  'Timeline': { open: true, sum: () => '' },
  'Plan review': { sum: () => 'Checks and advice' },
  'Sound': { sum: () => ((P.audio && P.audio.music) || 'No music') + ' · ' + ((P.audio && P.audio.sfx) || []).length + ' sound(s)' },
  'Subtitles style': { open: true, sum: () => (STY.find(s => s.id === (P.subStyle || 'classic')) || {}).label || P.subStyle || 'classic' },
  'Light motion': { sum: () => (P.lightMotion && P.lightMotion.on) ? 'On' : 'Off' },
  'Caption band': { sum: () => P.band && P.band.on ? 'On' : 'Off' },
  'Look of the video': { sum: () => 'Transition: ' + (P.transition || 'fade') },
  'Video effects': { sum: () => { const f = typeof fxGet === 'function' ? fxGet() : {}, on = ['shake', 'pan', 'zoom'].filter(k => f[k] && f[k].mode !== 'off'); return on.length ? on.join(', ') : 'Off'; } },
  'Emoji above subtitles': { sum: () => P.emojiOn ? 'On' : 'Off' },
  'Ticker, logo and clock': { sum: () => { const o = typeof ovGet === 'function' ? ovGet() : {}, on = ['ticker', 'logo', 'clock'].filter(k => o[k] && o[k].on); return on.length ? on.join(', ') : 'Off'; } },
  'Subtitles (SRT)': { sum: () => '' },
  'Typographic video': { sum: () => P.typo && P.typo.file ? 'Made' : 'Optional' },
  'Video size': { sum: () => (typeof fmtInfo === 'function' ? fmtInfo(P.format || 'square').label : P.format) },
  'Check and render': { open: true, sum: () => isBusy() ? 'Working' : P.outFile ? 'Rendered' : 'Not rendered yet' }
};
function wrapPanels() {
  document.querySelectorAll('#view .stp > .card').forEach(card => {
    const h = card.querySelector(':scope > h2'); if (!h) return;
    const title = h.textContent.trim(), reg = PANELS[title]; if (!reg) return;
    const key = P.id + '|' + title, open = key in PANEL_STATE ? PANEL_STATE[key] : (typeof reg.open === 'function' ? reg.open() : !!reg.open);
    let sum = ''; try { sum = reg.sum ? reg.sum() : ''; } catch {}
    const d = document.createElement('details'); d.className = 'panel'; if (open) d.open = true;
    d.innerHTML = '<summary><b>' + esc(title) + '</b><span class="psum">' + esc(sum) + '</span></summary>';
    card.parentNode.insertBefore(d, card); d.appendChild(card);
    d.addEventListener('toggle', () => { PANEL_STATE[key] = d.open; if (d.open) { if (title === 'Timeline' && window.initTimeline) initTimeline(); if (title === 'Subtitles style' && window.initPreview) initPreview(); } });
  });
}

// ---- emoji above the subtitles (no plate under them) ----
let EMO = null;
function emojiCard() {
  if (!EMO) { api('/api/emoji/list').then(l => { EMO = l; if (P) draw(); }); EMO = []; }
  const L = P.emojis || [], img = e => `/api/emoji/img?e=${encodeURIComponent(e)}`;
  return `<div class="card"><h2>Emoji above subtitles</h2>
    <label class="chk"><input type="checkbox" ${P.emojiOn ? 'checked' : ''} onchange="setP('emojiOn',this.checked)"> Show thematic emoji above the subtitles</label>
    <div class="row mid" style="margin-top:8px"><button class="sec" onclick="emojiAuto()" ${P.words ? '' : 'disabled'}>Pick automatically from the text</button>
      <div style="flex:0 0 160px"><label style="margin-top:0">Emoji position</label><select onchange="setP('emojiPos',this.value)"><option value="above" ${P.emojiPos === 'below' ? '' : 'selected'}>Above the text</option><option value="below" ${P.emojiPos === 'below' ? 'selected' : ''}>Below the text</option></select></div>
      <div style="flex:0 0 200px"><label style="margin-top:0">Emoji size</label><input type="range" min="0.6" max="1.6" step="0.1" value="${P.emojiScale || 1}" onchange="setP('emojiScale',+this.value)"></div></div>
    ${!P.words ? '<div class="badge" style="margin-top:8px">Run the analysis first: the emoji are chosen from the spoken words.</div>' : ''}
    ${L.length ? `<div style="margin-top:12px">${L.map((m, i) => `<div class="cut" style="grid-template-columns:44px 120px 120px 1fr 36px;gap:10px"><img src="${img(m.emoji)}" style="width:36px;height:36px;border-radius:0;object-fit:contain"><input value="${m.start}" onchange="emojiSet(${i},'start',+this.value)" aria-label="Start"><input value="${m.end}" onchange="emojiSet(${i},'end',+this.value)" aria-label="End"><select onchange="emojiSet(${i},'emoji',this.value)">${EMO.map(e => `<option ${e === m.emoji ? 'selected' : ''}>${e}</option>`).join('')}</select><button class="sec sm" onclick="emojiDel(${i})">✕</button></div>`).join('')}</div>` : ''}
    <div class="row mid" style="margin-top:10px;justify-content:flex-start"><button class="sec sm" onclick="emojiAdd()">+ Add emoji</button></div>
    <div class="badge" style="margin-top:8px">Emoji pop in above the text and fade out with it, with no plate behind them. They are drawn with the Windows emoji font and show up in the rendered video and the exact preview.</div></div>`;
}
async function emojiAuto() { const r = await api('/api/projects/' + P.id + '/emoji/auto', {}); if (r.error) { toast(r.error); return; } P.emojis = r.emojis; P.emojiOn = true; draw(); toast(r.emojis.length ? 'Emoji picked: ' + r.emojis.length : 'No matching words found.'); }
function emojiSave() { return api('/api/projects/' + P.id, { emojis: P.emojis }); }
function emojiSet(i, k, v) { P.emojis[i][k] = v; emojiSave().then(() => { if (k === 'emoji') draw(); }); }
function emojiDel(i) { P.emojis.splice(i, 1); emojiSave().then(draw); }
function emojiAdd() { const t = P.emojis && P.emojis.length ? P.emojis[P.emojis.length - 1].end + 1 : 1; P.emojis = [...(P.emojis || []), { start: +t.toFixed(2), end: +(t + 1.2).toFixed(2), emoji: '🔥' }]; emojiSave().then(draw); }

// ---- caption band: a strip behind the subtitles ----
const BAND_PRESETS = [['Blue', { type: 'gradient', c1: '#001a6e', c2: '#0a5fd0', angle: 90, opacity: 1 }], ['Teal', { type: 'gradient', c1: '#00283d', c2: '#0aa5c8', angle: 120, opacity: 1 }], ['Dark', { type: 'gradient', c1: '#0b0d12', c2: '#2a3140', angle: 180, opacity: 1 }], ['Violet', { type: 'gradient', c1: '#2b1055', c2: '#7597de', angle: 90, opacity: 1 }], ['Sunset', { type: 'gradient', c1: '#ff512f', c2: '#f09819', angle: 90, opacity: 1 }], ['Black glass', { type: 'solid', c1: '#000000', c2: '#000000', opacity: 0.6 }]];
function bandCard() {
  const b = Object.assign({ on: false, type: 'gradient', c1: '#001a6e', c2: '#0a5fd0', angle: 90, opacity: 1, auto: true, h: 0.14, w: 1, dy: 0, radius: 0, image: '' }, P.band || {});
  const sw = ([n, p]) => `<button class="sec sm" title="${n}" style="width:44px;min-height:30px;padding:0;background:${p.type === 'solid' ? p.c1 : `linear-gradient(${p.angle}deg,${p.c1},${p.c2})`};opacity:${p.opacity}" onclick='bandSet(${JSON.stringify({ ...p, on: true })})' aria-label="${n}"></button>`;
  const rng = (k, label, min, max, step, val, show) => `<div><label>${label} (${show})</label><input type="range" min="${min}" max="${max}" step="${step}" value="${val}" onchange="bandSet({${k}:+this.value})"></div>`;
  return `<div class="card"><h2>Caption band</h2>
    <label class="chk"><input type="checkbox" ${b.on ? 'checked' : ''} onchange="bandSet({on:this.checked})"> Put a band behind the subtitles</label>
    <div class="badge" style="margin:2px 0 8px">A strip with a gradient, a colour or your own picture. In the preview above, drag the band to move it and pull its edges to change the height and width.</div>
    <div class="row mid" style="justify-content:flex-start;gap:8px">${BAND_PRESETS.map(sw).join('')}</div>
    <div class="row"><div style="flex:0 0 190px"><label>Type</label><select onchange="bandSet({type:this.value})">${[['gradient', 'Gradient'], ['solid', 'One colour'], ['image', 'Picture']].map(([v, l]) => `<option value="${v}" ${b.type === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      ${b.type !== 'image' ? `<div style="flex:0 0 110px"><label>Colour 1</label><input type="color" value="${b.c1}" onchange="bandSet({c1:this.value})"></div>` : ''}
      ${b.type === 'gradient' ? `<div style="flex:0 0 110px"><label>Colour 2</label><input type="color" value="${b.c2}" onchange="bandSet({c2:this.value})"></div>${rng('angle', 'Direction', 0, 360, 15, b.angle, b.angle + '°')}` : ''}
      ${b.type === 'image' ? `<div><label>Picture (PNG / JPG / WebP)</label><input type="file" accept="image/png,image/jpeg,image/webp" onchange="bandUpload(this.files[0])">${b.image ? '<div class="badge">✓ Picture added</div>' : ''}</div>` : ''}</div>
    <div class="row">${rng('opacity', 'Opacity', 0.1, 1, 0.05, b.opacity, Math.round(b.opacity * 100) + '%')}${rng('bright', 'Brightness', 0.4, 1.6, 0.05, b.bright || 1, Math.round((b.bright || 1) * 100) + '%')}${rng('w', 'Width', 0.3, 1, 0.05, b.w, Math.round(b.w * 100) + '%')}${rng('radius', 'Rounded corners', 0, 80, 2, b.radius, b.radius + ' px')}</div>
    <div class="row mid"><label class="chk" style="margin:0"><input type="checkbox" ${b.auto ? 'checked' : ''} onchange="bandSet({auto:this.checked})"> Height fits the text</label>
      ${b.auto ? '' : rng('h', 'Height', 0.03, 0.6, 0.01, b.h, Math.round(b.h * 100) + '% of the frame')}${rng('dy', 'Move up / down', -0.7, 0.7, 0.01, b.dy, Math.round(b.dy * 100) + '%')}${rng('dx', 'Move left / right', -0.5, 0.5, 0.01, b.dx || 0, Math.round((b.dx || 0) * 100) + '%')}</div></div>`;
}
async function bandSet(patch) {
  const r = await api('/api/projects/' + P.id, { band: { ...(P.band || {}), ...patch } });
  P.band = r.band; draw();
}
async function bandUpload(file) {
  if (!file) return; const fd = new FormData(); fd.append('image', file);
  const r = await (await fetch('/api/projects/' + P.id + '/band-image', { method: 'POST', body: fd })).json();
  if (r.error) { toast(r.error); return; } P.band = r.band; P.updated = Date.now(); draw();
}

// ---- ticker, logo plate and news clock ----
const OV_POS = { tl: [0.16, 0.07], tc: [0.5, 0.07], tr: [0.84, 0.07], bl: [0.16, 0.86], bc: [0.5, 0.86], br: [0.84, 0.86] };
const OV_POS_LABEL = { tl: 'Top left', tc: 'Top centre', tr: 'Top right', bl: 'Bottom left', bc: 'Bottom centre', br: 'Bottom right' };
const ovDef = () => ({
  ticker: { on: false, text: '', speed: 140, pos: 'bottom', edge: 0.08, h: 0.055, color: '#ffffff', font: 'Roboto Bold', plate: { type: 'gradient', c1: '#0a1e4a', c2: '#1a4aa8', angle: 90, opacity: 0.95, radius: 0 }, label: { on: false, text: '', color: '#ffffff', plate: { type: 'solid', c1: '#d6121c', c2: '#d6121c', angle: 90, opacity: 1, radius: 0 } } },
  logo: { on: false, file: '', x: 0.84, y: 0.08, w: 0.24, ratio: 1.6, pad: 0.14, plate: { type: 'solid', c1: '#ffffff', c2: '#ffffff', angle: 90, opacity: 0.95, radius: 14 } },
  clock: { on: false, start: '12:00', seconds: false, label: '', x: 0.2, y: 0.07, size: 0.055, color: '#ffffff', font: 'Roboto Bold', plate: { type: 'gradient', c1: '#0a1e4a', c2: '#1a4aa8', angle: 90, opacity: 0.95, radius: 0 } }
});
function ovGet() { const d = ovDef(), o = P.overlays || {}; for (const k of Object.keys(d)) { d[k] = { ...d[k], ...(o[k] || {}) }; d[k].plate = { ...ovDef()[k].plate, ...((o[k] || {}).plate || {}) }; } d.ticker.label = { ...ovDef().ticker.label, ...((P.overlays || {}).ticker || {}).label }; return d; }
async function ovSet(kind, patch) { const r = await api('/api/projects/' + P.id, { overlays: { [kind]: patch } }); P.overlays = r.overlays; draw(); }
const OV_PRESETS = {
  ticker: {
    news: { color: '#ffffff', plate: { type: 'gradient', c1: '#0a1e4a', c2: '#1a4aa8', angle: 90, opacity: 0.95, radius: 0 }, label: { on: true, text: 'BREAKING', color: '#ffffff', plate: { type: 'solid', c1: '#d6121c', c2: '#d6121c', opacity: 1, radius: 0 } } },
    minimal: { color: '#ffffff', plate: { type: 'solid', c1: '#000000', c2: '#000000', opacity: 0.7, radius: 0 }, label: { on: false } },
    bright: { color: '#111111', plate: { type: 'solid', c1: '#ffd400', c2: '#ffd400', opacity: 1, radius: 0 }, label: { on: true, text: 'LIVE', color: '#ffffff', plate: { type: 'solid', c1: '#111111', c2: '#111111', opacity: 1, radius: 0 } } },
    light: { color: '#1c1c1c', plate: { type: 'solid', c1: '#f2f2f2', c2: '#f2f2f2', opacity: 0.95, radius: 14 }, label: { on: false } }
  },
  clock: {
    news: { color: '#ffffff', plate: { type: 'gradient', c1: '#0a1e4a', c2: '#1a4aa8', angle: 90, opacity: 0.95, radius: 0 } },
    minimal: { color: '#ffffff', plate: { type: 'none' } },
    bright: { color: '#111111', plate: { type: 'solid', c1: '#ffd400', c2: '#ffd400', opacity: 1, radius: 0 } },
    dark: { color: '#ffffff', plate: { type: 'solid', c1: '#111111', c2: '#111111', opacity: 0.85, radius: 10 } }
  }
};
const ovPresetRow = kind => `<div class="row" style="gap:6px;margin-bottom:6px"><span class="badge">Quick style</span>${Object.keys(OV_PRESETS[kind]).map(k => `<button class="sec sm" onclick="ovSet('${kind}',{...OV_PRESETS['${kind}']['${k}'],on:true})">${{ news: 'News', minimal: 'Minimal', bright: 'Bright', light: 'Light', dark: 'Dark' }[k]}</button>`).join('')}</div>`;
function ovPos(kind, v) { const p = OV_POS[v]; ovSet(kind, { x: p[0], y: p[1] }); }
function ovPosKey(o) { return Object.keys(OV_POS).find(k => Math.abs(OV_POS[k][0] - o.x) < 0.02 && Math.abs(OV_POS[k][1] - o.y) < 0.02) || ''; }
const ovRng = (kind, k, label, min, max, step, val, show, wrapPre = '{', wrapPost = '}') => `<div><label>${label} (${show})</label><input type="range" min="${min}" max="${max}" step="${step}" value="${val}" onchange="ovSet('${kind}',${wrapPre}${k}:+this.value${wrapPost})"></div>`;
function ovPlate(kind, plate, pre, post, title) {
  const set = (k, v) => `ovSet('${kind}',${pre}${k}:${v}${post})`;
  return `<div class="row"><div style="flex:0 0 160px"><label>${title}</label><select onchange="${set('type', 'this.value')}">${[['gradient', 'Gradient'], ['solid', 'One colour'], ['none', 'No plate']].map(([v, l]) => `<option value="${v}" ${plate.type === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
    ${plate.type !== 'none' ? `<div style="flex:0 0 100px"><label>Colour 1</label><input type="color" value="${plate.c1}" onchange="${set('c1', 'this.value')}"></div>` : ''}
    ${plate.type === 'gradient' ? `<div style="flex:0 0 100px"><label>Colour 2</label><input type="color" value="${plate.c2}" onchange="${set('c2', 'this.value')}"></div>` : ''}
    ${plate.type !== 'none' ? `<div><label>Opacity (${Math.round(plate.opacity * 100)}%)</label><input type="range" min="0.1" max="1" step="0.05" value="${plate.opacity}" onchange="${set('opacity', '+this.value')}"></div><div><label>Rounded corners (${plate.radius} px)</label><input type="range" min="0" max="60" step="2" value="${plate.radius}" onchange="${set('radius', '+this.value')}"></div>` : ''}</div>`;
}
const ovFonts = (kind, cur) => `<div style="flex:0 0 190px"><label>Font</label><select onchange="ovSet('${kind}',{font:this.value})">${FONTS.map(f => `<option ${f.label === cur ? 'selected' : ''}>${f.label}</option>`).join('')}</select></div>`;
const ovPosSel = (kind, o) => `<div style="flex:0 0 170px"><label>Position</label><select onchange="ovPos('${kind}',this.value)">${ovPosKey(o) ? '' : '<option value="">Custom</option>'}${Object.keys(OV_POS).map(k => `<option value="${k}" ${ovPosKey(o) === k ? 'selected' : ''}>${OV_POS_LABEL[k]}</option>`).join('')}</select></div>`;
const ovSwitch = (kind, on, title) => `<label class="chk" style="margin:0"><input type="checkbox" ${on ? 'checked' : ''} onchange="ovSet('${kind}',{on:this.checked})"> ${title}</label>`;
function overlaysCard() {
  const o = ovGet(), t = o.ticker, l = o.logo, c = o.clock;
  const sum = (on, name) => `${name}${on ? ' ✓' : ''}`;
  return `<div class="card"><h2>Ticker, logo and clock</h2>
    <div class="badge" style="margin-bottom:8px">News-style extras on top of the video. In the preview above, drag them to move and pull the handles on their corner or edges to resize.</div>
    <details class="more" ${t.on ? 'open' : ''}><summary>${sum(t.on, 'Scrolling ticker')}</summary><div class="body">
      ${ovSwitch('ticker', t.on, 'Show the ticker')}${ovPresetRow('ticker')}
      <label>Ticker text</label><input value="${esc(t.text)}" placeholder="Breaking news: your text here" onchange="ovSet('ticker',{text:this.value})">
      <div class="row"><div style="flex:0 0 150px"><label>Position</label><select onchange="ovSet('ticker',{pos:this.value})"><option value="bottom" ${t.pos === 'top' ? '' : 'selected'}>Bottom</option><option value="top" ${t.pos === 'top' ? 'selected' : ''}>Top</option></select></div>
        ${ovRng('ticker', 'speed', 'Speed', 30, 500, 10, t.speed, t.speed)}${ovRng('ticker', 'h', 'Height', 0.03, 0.14, 0.005, t.h, Math.round(t.h * 100) + '% of the frame')}${ovRng('ticker', 'edge', 'Distance from the edge', 0, 0.4, 0.01, t.edge, Math.round(t.edge * 100) + '%')}</div>
      <div class="row"><div style="flex:0 0 110px"><label>Text colour</label><input type="color" value="${t.color}" onchange="ovSet('ticker',{color:this.value})"></div>${ovFonts('ticker', t.font)}</div>
      ${ovPlate('ticker', t.plate, '{plate:{', '}}', 'Ticker plate')}
      <label class="chk"><input type="checkbox" ${t.label.on ? 'checked' : ''} onchange="ovSet('ticker',{label:{on:this.checked}})"> Label box on the left (for example “BREAKING”)</label>
      ${t.label.on ? `<div class="row"><div><label>Label text</label><input value="${esc(t.label.text)}" placeholder="BREAKING" onchange="ovSet('ticker',{label:{text:this.value}})"></div><div style="flex:0 0 110px"><label>Label text colour</label><input type="color" value="${t.label.color}" onchange="ovSet('ticker',{label:{color:this.value}})"></div></div>${ovPlate('ticker', t.label.plate, '{label:{plate:{', '}}}', 'Label plate')}` : ''}
    </div></details>
    <details class="more" ${l.on ? 'open' : ''}><summary>${sum(l.on, 'Logo plate')}</summary><div class="body">
      ${ovSwitch('logo', l.on, 'Show the logo')}
      <div class="row"><div><label>Logo (transparent PNG works best)</label><input type="file" accept="image/png,image/webp,image/jpeg" onchange="ovLogo(this.files[0])">${l.file ? '<div class="badge">✓ Logo added</div>' : ''}</div>${ovPosSel('logo', l)}</div>
      <div class="row">${ovRng('logo', 'w', 'Plate width', 0.06, 0.8, 0.01, l.w, Math.round(l.w * 100) + '%')}${ovRng('logo', 'ratio', 'Plate shape', 0.5, 3.5, 0.05, l.ratio, l.ratio.toFixed(2))}${ovRng('logo', 'pad', 'Space around the logo', 0, 0.4, 0.01, l.pad, Math.round(l.pad * 100) + '%')}</div>
      <div class="row">${ovRng('logo', 'x', 'Left / right', 0, 1, 0.01, l.x, Math.round(l.x * 100) + '%')}${ovRng('logo', 'y', 'Up / down', 0, 1, 0.01, l.y, Math.round(l.y * 100) + '%')}</div>
      ${ovPlate('logo', l.plate, '{plate:{', '}}', 'Plate behind the logo')}
    </div></details>
    <details class="more" ${c.on ? 'open' : ''}><summary>${sum(c.on, 'News clock')}</summary><div class="body">
      ${ovSwitch('clock', c.on, 'Show the clock')}${ovPresetRow('clock')}
      <div class="row"><div style="flex:0 0 170px"><label>Start time (HH:MM or HH:MM:SS)</label><input value="${esc(c.start)}" placeholder="14:35" onchange="ovTime(this.value)"></div>
        <div style="flex:0 0 130px"><label>Label (optional)</label><input value="${esc(c.label)}" placeholder="MSK" onchange="ovSet('clock',{label:this.value})"></div>
        <label class="chk" style="margin-top:22px"><input type="checkbox" ${c.seconds ? 'checked' : ''} onchange="ovSet('clock',{seconds:this.checked})"> Show seconds</label></div>
      <div class="badge">The time starts from the value you set at the beginning of the video and keeps counting while it plays.</div>
      <div class="row">${ovPosSel('clock', c)}${ovRng('clock', 'size', 'Size', 0.02, 0.12, 0.005, c.size, Math.round(c.size * 100) + '%')}<div style="flex:0 0 110px"><label>Text colour</label><input type="color" value="${c.color}" onchange="ovSet('clock',{color:this.value})"></div>${ovFonts('clock', c.font)}</div>
      <div class="row">${ovRng('clock', 'x', 'Left / right', 0, 1, 0.01, c.x, Math.round(c.x * 100) + '%')}${ovRng('clock', 'y', 'Up / down', 0, 1, 0.01, c.y, Math.round(c.y * 100) + '%')}</div>
      ${ovPlate('clock', c.plate, '{plate:{', '}}', 'Clock plate')}
    </div></details></div>`;
}
function ovTime(v) { v = String(v).trim(); if (!/^\d{1,2}:\d{2}(:\d{2})?$/.test(v)) { toast('Use the format HH:MM or HH:MM:SS.'); draw(); return; } ovSet('clock', { start: v }); }
async function ovLogo(file) {
  if (!file) return; const fd = new FormData(); fd.append('logo', file);
  const r = await (await fetch('/api/projects/' + P.id + '/overlay-logo', { method: 'POST', body: fd })).json();
  if (r.error) { toast(r.error); return; } P.overlays = r.overlays; draw();
}

// ---- transitions (basic / light / zoom / news) and video effects ----
let TRN = null;
function trnSelect() {
  if (!TRN) { api('/api/transitions').then(r => { TRN = r; if (P) draw(); }); TRN = { list: [], mix: [], grades: [] }; }
  const cur = P.transition || 'fade', groups = [['basic', 'Basic'], ['light', 'Light'], ['zoom', 'Zoom'], ['news', 'News']];
  return `<select onchange="setP('transition',this.value)">${groups.map(([g, l]) => `<optgroup label="${l}">${TRN.list.filter(t => t.group === g).map(t => `<option value="${t.id}" ${cur === t.id ? 'selected' : ''}>${t.label}</option>`).join('')}</optgroup>`).join('')}<optgroup label="Mixes">${TRN.mix.map(([v, l]) => `<option value="${v}" ${cur === v ? 'selected' : ''}>${l}</option>`).join('')}</optgroup></select>`;
}
const fxDef = () => ({ shake: { mode: 'off', amount: 0.5 }, pan: { mode: 'off', amount: 0.5 }, zoom: { mode: 'off', amount: 0.5, every: 3 }, vignette: 0, grain: 0, grade: 'off', progress: { on: false, color: '#ff2a2a', pos: 'top', h: 8 } });
function fxGet() { const d = fxDef(), o = P.fx || {}; for (const k of ['shake', 'pan', 'zoom', 'progress']) d[k] = { ...d[k], ...(o[k] || {}) }; for (const k of ['vignette', 'grain', 'grade']) if (o[k] !== undefined) d[k] = o[k]; return d; }
async function fxSet(patch) { const r = await api('/api/projects/' + P.id, { fx: patch }); P.fx = r.fx; draw(); }
const fxOpts = (list, cur) => list.map(([v, l]) => `<option value="${v}" ${cur === v ? 'selected' : ''}>${l}</option>`).join('');
const fxSlide = (label, show, min, max, step, val, patchExpr) => `<div><label>${label} (${show})</label><input type="range" min="${min}" max="${max}" step="${step}" value="${val}" onchange="fxSet(${patchExpr})"></div>`;
function fxCard() {
  const f = fxGet(), pc = v => Math.round(v * 100) + '%';
  return `<div class="card"><h2>Video effects</h2>
    <div class="badge" style="margin-bottom:8px">Camera effects keep the viewer's attention. Subtitles, plates and overlays stay steady; only the picture moves. See them in “Render exact preview” or the final render.</div>
    <div class="row"><div style="flex:0 0 220px"><label>Camera shake</label><select onchange="fxSet({shake:{mode:this.value}})">${fxOpts([['off', 'Off'], ['continuous', 'Handheld (constant)'], ['impact', 'On every cut (impact)']], f.shake.mode)}</select></div>${f.shake.mode !== 'off' ? fxSlide('Strength', pc(f.shake.amount), 0.1, 1, 0.05, f.shake.amount, '{shake:{amount:+this.value}}') : ''}</div>
    <div class="row"><div style="flex:0 0 220px"><label>Camera move</label><select onchange="fxSet({pan:{mode:this.value}})">${fxOpts([['off', 'Off'], ['lr', 'Pan left to right'], ['rl', 'Pan right to left'], ['up', 'Tilt up'], ['down', 'Tilt down'], ['alt', 'Back and forth'], ['drift', 'Slow drift']], f.pan.mode)}</select></div>${f.pan.mode !== 'off' ? fxSlide('Amount', pc(f.pan.amount), 0.1, 1, 0.05, f.pan.amount, '{pan:{amount:+this.value}}') : ''}</div>
    <div class="row"><div style="flex:0 0 220px"><label>Constant zoom</label><select onchange="fxSet({zoom:{mode:this.value}})">${fxOpts([['off', 'Off'], ['push', 'Slow push-in'], ['breathe', 'Breathing'], ['pulse', 'Pulse (beat)']], f.zoom.mode)}</select></div>${f.zoom.mode !== 'off' ? fxSlide('Amount', pc(f.zoom.amount), 0.1, 1, 0.05, f.zoom.amount, '{zoom:{amount:+this.value}}') : ''}${f.zoom.mode === 'pulse' ? fxSlide('Beat every', f.zoom.every + ' s', 1, 10, 0.5, f.zoom.every, '{zoom:{every:+this.value}}') : ''}</div>
    <hr class="sep">
    <div class="row"><div style="flex:0 0 220px"><label>Colour grade</label><select onchange="fxSet({grade:this.value})">${fxOpts((TRN && TRN.grades.length ? TRN.grades : [['off', 'Off']]), f.grade)}</select></div>${fxSlide('Vignette', pc(f.vignette), 0, 1, 0.05, f.vignette, '{vignette:+this.value}')}${fxSlide('Film grain', pc(f.grain), 0, 1, 0.05, f.grain, '{grain:+this.value}')}</div>
    <div class="row mid"><label class="chk" style="margin:0"><input type="checkbox" ${f.progress.on ? 'checked' : ''} onchange="fxSet({progress:{on:this.checked}})"> Progress bar</label>
      ${f.progress.on ? `<div style="flex:0 0 100px"><label>Colour</label><input type="color" value="${f.progress.color}" onchange="fxSet({progress:{color:this.value}})"></div><div style="flex:0 0 140px"><label>Position</label><select onchange="fxSet({progress:{pos:this.value}})">${fxOpts([['top', 'Top'], ['bottom', 'Bottom']], f.progress.pos)}</select></div>${fxSlide('Thickness', f.progress.h + ' px', 2, 24, 1, f.progress.h, '{progress:{h:+this.value}}')}` : ''}</div></div>`;
}

// ---- transition demo in the preview frame (approximation of the render, slowed down a little so it can be seen) ----
let DEMO_N = 0;
function fxDemoPick(sel) {
  const list = (typeof TRN !== 'undefined' && TRN && TRN.list) ? TRN.list : [];
  const g = x => list.filter(t => t.group === x).map(t => t.id);
  const mixes = { mix: g('basic'), mix_light: g('light'), mix_zoom: g('zoom'), mix_news: g('news'), mix_all: [...g('light'), ...g('zoom'), ...g('news')] };
  return mixes[sel] && mixes[sel].length ? mixes[sel][DEMO_N++ % mixes[sel].length] : sel;
}
function fxDemo() {
  const box = document.getElementById('fxdemo'), fr = document.getElementById('capframe'), stage = document.getElementById('fxstage'); if (!box || !fr) return;
  const tr = fxDemoPick(P.transition || 'fade'), U = 1.7, D = (P.transDur || 0.35) * 1000 * U;
  box.innerHTML = ''; box.style.display = 'block';
  const mk = (css, html = '') => { const e = document.createElement('div'); e.style.cssText = 'position:absolute;inset:0;' + css; e.innerHTML = html; box.appendChild(e); return e; };
  const anim = (el, kf, dur, delay = 0, easing = 'ease-out') => el.animate(kf, { duration: dur, delay, fill: 'both', easing });
  const B = mk('background:linear-gradient(135deg,#1f6f4f,#0f3d2c);display:grid;place-items:center;color:#cfeedd;font:700 15px system-ui;overflow:hidden', '<span>INSERT</span>');
  const flash = (color, up, down, peak = 1, at = 0) => { const f = mk(`background:${color};opacity:0`); anim(f, [{ opacity: 0 }, { opacity: peak, offset: up / (up + down) }, { opacity: 0 }], up + down, at, 'linear'); };
  const show = at => anim(B, [{ opacity: 0 }, { opacity: 1 }], 1, at, 'linear');
  const fi = 160 * U;
  switch (tr) {
    case 'cut': break;
    case 'fade': anim(B, [{ opacity: 0 }, { opacity: 1 }], fi); break;
    case 'slideleft': anim(B, [{ transform: 'translateX(100%)' }, { transform: 'none' }], fi); break;
    case 'slideup': anim(B, [{ transform: 'translateY(100%)' }, { transform: 'none' }], fi); break;
    case 'flash': show(50 * U); flash('#fff', 50 * U, 220 * U); break;
    case 'flashwarm': show(60 * U); flash('#ffd49a', 60 * U, 300 * U, 0.95); break;
    case 'glow': anim(B, [{ opacity: 0 }, { opacity: 1 }], 100 * U, 120 * U); { const g = mk('background:radial-gradient(circle at 50% 50%,rgba(255,244,214,.95),rgba(255,244,214,0) 62%);opacity:0'); anim(g, [{ opacity: 0, transform: 'scale(.6)' }, { opacity: 1, offset: .3, transform: 'scale(1.1)' }, { opacity: 0, transform: 'scale(1.6)' }], 540 * U, 0, 'linear'); } break;
    case 'sweep': show(200 * U); { const s = mk('background:linear-gradient(100deg,transparent 30%,rgba(255,255,255,.85) 50%,transparent 70%);transform:translateX(-100%)'); anim(s, [{ transform: 'translateX(-100%)' }, { transform: 'translateX(100%)' }], 600 * U, 0, 'linear'); } break;
    case 'leak': anim(B, [{ opacity: 0 }, { opacity: 1 }], 120 * U, 280 * U); { const l = mk('background:linear-gradient(270deg,rgba(255,150,60,.9),rgba(255,70,120,.5) 55%,transparent);opacity:0'); anim(l, [{ opacity: 0 }, { opacity: 1, offset: .45 }, { opacity: 0 }], 780 * U, 0, 'linear'); } break;
    case 'flare': show(110 * U); { const f = mk('background:linear-gradient(0deg,transparent 46%,rgba(210,235,255,.95) 50%,transparent 54%);opacity:0'); anim(f, [{ opacity: 0, transform: 'scaleX(.3)' }, { opacity: 1, offset: .25, transform: 'scaleX(1)' }, { opacity: 0, transform: 'scaleX(1.2)' }], 540 * U, 0, 'linear'); } break;
    case 'zoomin': anim(B, [{ opacity: 0, transform: 'scale(1.5)' }, { opacity: 1, transform: 'scale(1)' }], 280 * U); break;
    case 'zoomout': B.style.background = 'linear-gradient(135deg,#1f6f4f,#0f3d2c)'; anim(B, [{ opacity: 0, transform: 'scale(.55)' }, { opacity: 1, transform: 'scale(1)' }], 300 * U); break;
    case 'punch': if (stage) anim(stage, [{ transform: 'scale(1)' }, { transform: 'scale(1.22)' }], 220 * U, 0, 'ease-in'); show(220 * U); anim(B, [{ transform: 'scale(1.22)' }, { transform: 'scale(1)' }], 240 * U, 220 * U); break;
    case 'whip': anim(B, [{ transform: 'scale(1.9)' }, { transform: 'scale(1)' }], 200 * U); flash('#fff', 40 * U, 160 * U, 0.5); break;
    case 'newsblue': case 'newsred': {
      anim(B, [{ transform: 'translateX(-100%)' }, { transform: 'none' }], D);
      const bar = mk(`left:0;right:auto;width:7%;background:${tr === 'newsblue' ? '#1a4aa8' : '#d6121c'};border-right:3px solid #fff;transform:translateX(-100%)`);
      anim(bar, [{ transform: 'translateX(-100%)', left: '0%' }, { transform: 'translateX(-100%)', left: '100%' }], D, 0, 'ease-out'); break;
    }
    case 'bars': show(250 * U); ['#1a4aa8', '#ffffff', '#d6121c'].forEach((c, i) => { const s = mk(`top:${i * 33.34}%;height:33.34%;background:${c};transform:translateX(-100%)`); anim(s, [{ transform: 'translateX(-100%)' }, { transform: 'translateX(100%)' }], 500 * U, 50 * U * i, 'linear'); }); break;
    case 'glitch': anim(B, [{ filter: 'drop-shadow(8px 0 0 rgba(255,0,0,.8)) drop-shadow(-8px 0 0 rgba(0,255,255,.8))' }, { filter: 'none' }], 300 * U, 0, 'steps(5)'); flash('#fff', 30 * U, 100 * U, 0.35); break;
    default: anim(B, [{ opacity: 0 }, { opacity: 1 }], fi);
  }
  const label = mk('left:6px;top:6px;right:auto;bottom:auto;color:#fff;font:600 10px system-ui;background:#0009;padding:2px 6px;border-radius:6px;height:auto', esc(((TRN && TRN.list.find(t => t.id === tr)) || { label: tr }).label)); label.style.inset = 'auto'; label.style.left = '6px'; label.style.top = '6px';
  setTimeout(() => { box.style.display = 'none'; box.innerHTML = ''; if (stage) stage.getAnimations().forEach(a => a.cancel()); }, 1700);
}

// ---- plan review (rules only) ----
let REV = null;
function reviewCard() {
  if (!P.cuts) return '';
  const key = P.id + ':' + (P.updated || 0);
  if (!REV || REV.key !== key) { REV = { key, data: null }; api('/api/projects/' + P.id + '/review').then(r => { if (REV && REV.key === key) { REV.data = r; if (document.getElementById('revbox')) draw(); } }); }
  const r = REV.data;
  if (!r || r.error) return `<div class="card" id="revbox"><h2>Plan review</h2><div class="badge">${r && r.error ? esc(r.error) : 'Checking…'}</div></div>`;
  const cls = v => (v >= 80 ? 'ok' : v >= 60 ? 'warn' : 'bad'), h = r.hook, st = r.stats;
  const icon = { bad: '⛔', warn: '⚠️', tip: '💡' };
  return `<div class="card" id="revbox"><h2>Plan review</h2>
    <div class="badge" style="margin-bottom:10px">Rule-based checks, no AI: the opening, pacing, how well inserts fit, repeats and where to add accents.</div>
    <div class="row mid" style="justify-content:flex-start;gap:10px"><span class="pill ${cls(r.score)}" style="font-size:15px;padding:5px 14px">Overall ${r.score}/100</span><span class="pill ${h ? cls(h.score) : ''}">Hook ${h ? h.score : '–'}</span><span class="pill ${cls(r.plan)}">Plan ${r.plan}</span>
      <span class="badge">${st.inserts} inserts · ${st.cards} cards · avg ${st.avgInsert} s</span><button class="ghost sm" onclick="REV=null;draw()" style="margin-left:auto">Check again</button></div>
    ${h ? `<div style="margin-top:12px"><b>Opening line</b> <span class="pill ${h.label === 'strong' ? 'ok' : h.label === 'ok' ? 'warn' : 'bad'}">${h.label}</span><div class="badge" style="margin:4px 0 6px">“${esc(h.text.slice(0, 140))}”</div>
      <div class="chips">${h.reasons.map(x => `<span class="chip ${x.ok ? 'on' : ''}">${x.ok ? '✓' : '✕'} ${esc(x.text)}</span>`).join('')}</div>
      ${h.better.map(b => `<div class="hint" style="margin-top:8px">Try opening with: “${esc(b.text.slice(0, 120))}” <span class="badge">(hook ${b.score})</span> <button class="sec sm" onclick="reviewSeek(${b.at})">Show</button></div>`).join('')}</div>` : ''}
    <div style="margin-top:12px">${r.issues.length ? r.issues.map(i => `<div class="kv" style="align-items:flex-start"><span>${icon[i.level]} <b>${esc(i.title)}</b><div class="badge">${esc(i.detail)}</div>${(i.list || []).map(x => `<div class="badge">– “${esc(String(x).slice(0, 80))}”</div>`).join('')}</span>
      <span class="row" style="gap:6px;flex:none">${i.at != null ? `<button class="sec sm" onclick="reviewSeek(${i.at})">Show</button>` : ''}${i.cut != null && i.action !== 'stock' ? `<button class="sec sm" onclick="pickClip(${i.cut})">Swap</button>` : ''}${i.action === 'stock' ? '<button class="sec sm" onclick="autoStock()">Cards → stock video (auto)</button>' : ''}${i.zoomAt != null ? `<button class="sec sm" onclick="reviewZoom(${i.zoomAt})">Add zoom</button>` : ''}</span></div>`).join('') : '<div class="hint">No problems found.</div>'}</div></div>`;
}
function reviewSeek(t) { if (typeof tlSeek === 'function') tlSeek(t); const b = document.getElementById('tlbox'); if (b) b.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
async function reviewZoom(t) { P.zooms = [...(P.zooms || []), { start: +(+t).toFixed(2), end: +(+t + 1.4).toFixed(2) }]; await api('/api/projects/' + P.id + '/zooms', { zooms: P.zooms }); REV = null; draw(); toast('Zoom added'); }

// ---- AI review with the local language model (optional, Ollama) ----
let LLM = null, AI_BUSY = false;
function aiBlock() {
  if (!LLM) { LLM = { installed: false, model: '', loading: true }; api('/api/llm/status').then(r => { LLM = r; if (document.getElementById('revbox')) draw(); }); }
  const a = P.aiReview, ready = LLM.installed && !AI_BUSY;
  const res = a ? `<div class="hint" style="margin-top:10px"><b>Opening line</b><div>${esc(a.hook.verdict)}</div>${a.hook.alternatives.map(x => `<div style="margin-top:6px">“${esc(x)}” <button class="sec sm" onclick="navigator.clipboard.writeText(${esc(JSON.stringify(x))}).then(()=>toast('Copied'))">Copy</button></div>`).join('')}</div>
    ${a.mismatches.length ? `<div style="margin-top:10px"><b>Where the picture may not fit</b>${a.mismatches.map(m => `<div class="kv" style="align-items:flex-start"><span>“${esc(m.text)}”<div class="badge">${esc(m.why)}</div>${m.better ? `<div class="badge">→ ${esc(m.better)}</div>` : ""}</span><button class="sec sm" onclick="reviewSeek(${m.at})">Show</button></div>`).join('')}</div>` : '<div class="badge" style="margin-top:8px">The AI found no clear mismatches between words and pictures.</div>'}
    ${a.tips.length ? `<div style="margin-top:10px"><b>Editing tips</b>${a.tips.map(t => `<div class="badge" style="margin-top:4px">💡 ${esc(t)}</div>`).join('')}</div>` : ''}
    <div class="badge" style="margin-top:8px">${esc(a.model)} · ${Math.round(a.ms / 1000)} s · local. These are suggestions: check them before changing anything.</div>` : '';
  return `<hr class="sep"><div><b>AI review</b> <span class="pill ${LLM.installed ? 'ok' : ''}">${LLM.installed ? 'local model ready' : 'model not installed'}</span>
    <div class="badge" style="margin:4px 0 8px">A small language model on this computer reads the whole script and the chosen pictures, and suggests stronger opening lines, mismatches and editing tips. Free, works offline.</div>
    <button class="sec" onclick="aiRun()" ${ready ? '' : 'disabled'}>${AI_BUSY ? 'Thinking…' : a ? 'Review again with the AI' : 'Review the plan with the AI'}</button>
    ${AI_BUSY ? '<span class="badge" style="margin-left:8px">About half a minute. The video card is busy meanwhile.</span>' : ''}
    ${!LLM.installed && !LLM.loading ? `<div class="badge" style="margin-top:6px">Install the model once: ollama pull ${esc(LLM.model || 'gemma3:4b')}</div>` : ''}${res}</div>`;
}
async function aiRun() {
  AI_BUSY = true; draw();
  const r = await api('/api/projects/' + P.id + '/ai-review', { lang: typeof LANG !== 'undefined' ? LANG : 'en' });
  AI_BUSY = false; if (r.error) toast(r.error); else P.aiReview = r; draw();
}
{ const base = reviewCard; reviewCard = function () { const h = base(); if (!h || h.includes('Checking…') || !h.endsWith('</div>')) return h; return h.slice(0, -6) + aiBlock() + '</div>'; }; }

// ---- opening insert (hook) ----
function hookCard() {
  if (!P.cuts || !P.sentences) return '';
  const k = P.cuts.findIndex(c => c.hook), c = P.cuts[k], cl = c && (LIB.find(x => x.id === c.clip) || {});
  return `<div class="card"><h2>Opening insert (hook)</h2>
    <div class="badge">A clip shown from the very first second over the opening line, to hold attention.</div>
    ${c ? `<div class="row" style="margin-top:10px;gap:12px;flex-wrap:nowrap;align-items:center">${cl.thumb ? `<img src="${cl.thumb}" style="width:64px;height:64px;object-fit:cover;border-radius:8px">` : `<div style="width:64px;height:64px;border-radius:8px;background:#2a6f4f"></div>`}
      <div style="flex:1"><b>0 – ${c.end.toFixed(1)} s</b><div class="badge">${esc(c.text || '')}</div></div></div>
      <div class="row" style="margin-top:10px"><button class="sec" onclick="pickClip(${k})">Swap clip</button><button class="sec" onclick="window.__prevBg=${k};go(5)">See it with the style</button><label style="margin:0">Length, s</label><input style="width:80px" value="${c.end.toFixed(1)}" onchange="hookSet({dur:this.value})"><button class="sec" onclick="hookSet({remove:1})">Remove hook</button></div>
      <div class="badge" style="margin-top:6px">Making it shorter leaves the cut after it as it is. A removed hook is not restored: analyze again to bring the original insert back.</div>`
    : `<div class="row" style="margin-top:10px"><button class="sec" onclick="hookAdd()">Add a hook insert</button><a class="btn sec" href="/grok.html">Make one with Grok</a></div>`}
    <label style="margin-top:14px;display:flex;gap:8px;align-items:center"><input type="checkbox" ${P.autoHook === false ? '' : 'checked'} onchange="setP('autoHook',this.checked)"> Pick the hook automatically when analyzing</label>
    <div class="badge">Uses the best library clip for the first line. A hook you chose yourself is kept when you analyze again.</div>
    <details class="more" style="margin-top:10px"><summary>A/B test of the hook (optional)</summary><div class="body"><div class="badge">Makes copies of this project that differ only in the hook clip, so you can render and compare them. This project stays as variant A.</div>
      <div class="row" style="margin-top:8px"><label style="margin:0">Copies</label><select id="hkcount"><option>1</option><option selected>2</option><option>3</option><option>4</option></select><button class="sec" onclick="hookVariants()">Make copies with other hooks</button></div></div></details></div>`;
}
async function hookSet(b) { const r = await api('/api/projects/' + P.id + '/hook', b); if (r.error) { alert(r.error); return; } P.cuts = r.cuts; draw(); }
async function hookAdd() { await hookSet({ add: 1 }); const k = P.cuts.findIndex(c => c.hook); if (k >= 0) pickClip(k); }

async function openVideo(file) { const r = await api('/api/projects/' + P.id + '/open-video', { file }); if (r.error) toast(r.error); }

// transition for one insert (empty = the one chosen for the whole video)
function cutTrnSelect(i) {
  if (!TRN || !TRN.list.length) { trnSelect(); return ''; }
  const c = P.cuts[i], cur = c.tr || '', groups = [['basic', 'Basic'], ['light', 'Light'], ['zoom', 'Zoom'], ['news', 'News']];
  return `<select onchange="setCutTr(${i},this.value)"><option value="">Same as the whole video</option>${groups.map(([g, l]) => `<optgroup label="${l}">${TRN.list.filter(t => t.group === g).map(t => `<option value="${t.id}" ${cur === t.id ? 'selected' : ''}>${t.label}</option>`).join('')}</optgroup>`).join('')}<optgroup label="Mixes">${TRN.mix.map(([v, l]) => `<option value="${v}" ${cur === v ? 'selected' : ''}>${l}</option>`).join('')}</optgroup></select>`;
}
function setCutTr(i, v) { if (v) P.cuts[i].tr = v; else delete P.cuts[i].tr; saveCuts(); if (typeof tlInspector === 'function') tlInspector(); }

// ---- music suggestions (by the mood of the script and the speaking pace) ----
let MUSUG = null;
async function musicSuggest() { MUSUG = await api('/api/projects/' + P.id + '/music-suggest'); MUSUG.pid = P.id; draw(); }
function musugHtml() {
  if (!MUSUG || MUSUG.pid !== P.id || !MUSUG.items) return '';
  const cur = (P.audio || {}).music;
  return `<div class="hint" style="margin-bottom:10px"><b>Best fits for this script</b>${MUSUG.items.map((m, k) => `<div class="row" style="gap:8px;margin-top:8px;flex-wrap:nowrap;align-items:center">
    <button class="sec sm" onclick="playS('${m.id}')">▶</button>
    <div style="flex:1"><b>${k + 1}. ${esc(m.label)}</b> <span class="badge">${esc(m.mood)}</span><div class="badge">${m.why.map(esc).join(' · ')}</div></div>
    ${cur === m.id ? '<span class="badge">✓ In use</span>' : `<button class="sm" onclick="setA('music','${m.id}')">Use</button>`}</div>`).join('')}
    <div class="badge" style="margin-top:8px">Picked by the words of the script and the speaking pace. Nothing changes until you press Use.</div></div>`;
}

// ---- make the video like a sample from your archive ----
let REFS = null, REFPV = null, REFTM = null;
async function refLoad() { REFS = await api('/api/references'); if ((REFS.jobs || []).length) { clearTimeout(REFTM); REFTM = setTimeout(async () => { await refLoad(); if (STEP === 3) draw(); }, 3000); } }
const refStat = r => `${Math.round(r.duration)} s · ${r.stats.inserts} insert(s), ${r.stats.avgInsert} s each · ${r.stats.perMinute}/min · ${r.stats.wps} words/s${r.stats.cards ? ' · ' + r.stats.cards + ' card(s)' : ''}${r.speakers > 1 ? ' · ' + r.speakers + ' looks of speakers' : ''}${r.hook ? ' · hook ' + r.hook.dur + ' s' : ''}${r.music && r.music.has ? ' · music ' + Math.round(r.music.bpm) + ' bpm' : ''}${r.visual ? '' : r.source === 'sound' ? ' · audio only, from sound effects' : ' · audio only, estimated'}`;
function refCard() {
  if (!P.presenterFile && !P.voiceFile) return '';
  if (!REFS) { refLoad().then(() => { if (STEP === 3) draw(); }); return ''; }
  const cur = P.reference && REFS.items.find(r => r.id === P.reference), rep = P.referenceReport;
  const jobs = (REFS.jobs || []).map(j => `<div class="badge" style="margin-top:6px">${j.status === 'error' ? '<span style="color:#e5484d">' + esc(j.error) + '</span>' : (j.status === 'queued' ? 'Waiting…' : 'Analyzing the sample… ' + Math.round(j.pct * 100) + '%') + ' · ' + esc(j.name)}</div>`).join('');
  return `<div class="card"><h2>Make it like a sample</h2>
    <div class="badge">Choose a finished video from your own archive. The platform listens to its voice-over, finds where the picture changed, and places inserts of the same rhythm (and an opening hook of the same length) on your script, at moments that play the same role. Only the timing is taken: your own library clips are used.</div>
    ${cur ? `<div class="hint" style="margin-top:10px"><b>${esc(cur.name)}</b><div class="badge">${refStat(cur)}</div>
      <div class="row" style="margin-top:8px"><button onclick="analyze()">${P.cuts ? 'Analyze again with this sample' : 'Analyze with this sample'}</button>${P.cuts ? '<button class="sec" onclick="refPreview()">Preview the result</button>' : ''}<button class="sec" onclick="refUse(null)">Don't use a sample</button></div>
      ${rep && rep.id === cur.id ? `<div class="badge" style="margin-top:8px">Applied: ${rep.mode === 'cuts' ? rep.slots + ' picture changes' : rep.slots + ' inserts' + (rep.hook ? ' and a ' + rep.hook + ' s hook' : '')} placed like in the sample.</div>` : '<div class="badge" style="margin-top:8px">It is applied the next time you analyze.</div>'}
      ${refPvHtml()}</div>` : ''}
    <div style="margin-top:12px">${REFS.items.filter(r => !cur || r.id !== cur.id).map(r => `<div class="row" style="gap:8px;flex-wrap:nowrap;align-items:center;margin-top:6px"><div style="flex:1"><b>${esc(r.name)}</b><div class="badge">${refStat(r)}</div></div><button class="sm" onclick="refUse('${r.id}')">Use</button><button class="sec sm" onclick="refDel('${r.id}')">✕</button></div>`).join('')}</div>
    <div class="row" style="margin-top:12px;gap:8px;align-items:flex-end"><div style="flex:1"><label>Add a sample (video or audio file)</label><input type="file" id="reffile" accept="video/*,audio/*"></div><div style="flex:0 0 190px"><label>Language of the sample</label><select id="reflang">${LANGS.map(([v, l]) => `<option value="${v}" ${v === (P.lang || '') ? 'selected' : ''}>${l}</option>`).join('')}</select></div><button class="sec" onclick="refAdd()">Analyze the sample</button></div>${jobs}
    <div class="badge" style="margin-top:6px">Takes about a minute or two. A video gives exact picture changes. With audio only they are estimated: from transition sounds (whooshes) if the video had them, otherwise from the speech.</div></div>`;
}
async function refAdd() {
  const f = document.getElementById('reffile').files[0]; if (!f) { toast('Choose a file first.'); return; }
  const fd = new FormData(); fd.append('file', f); fd.append('name', f.name.replace(/\.[^.]+$/, '')); fd.append('lang', document.getElementById('reflang').value);
  const r = await (await fetch('/api/references', { method: 'POST', body: fd })).json(); if (r.error) { toast(r.error); return; }
  toast('The sample is added. It is analyzed now (a minute or two): the progress is under the button.'); await refLoad(); draw();
}
async function refUse(id) { await api('/api/projects/' + P.id + '/reference', { id }); P.reference = id; P.referenceReport = null; REFPV = null; draw(); }
async function refDel(id) { if (!(await uiConfirm('Delete this sample?'))) return; await api('/api/references/' + id + '/delete', {}); await refLoad(); if (P.reference === id) P.reference = null; draw(); }
async function refPreview() { REFPV = await api('/api/projects/' + P.id + '/reference/preview'); draw(); }
function refPvHtml() {
  if (!REFPV) return ''; if (REFPV.error) return `<div class="badge" style="color:#e5484d;margin-top:8px">${esc(REFPV.error)}</div>`;
  const v = REFPV;
  return `<div style="margin-top:10px"><div class="badge">${v.mode === 'cuts' ? v.slots + ' picture changes' : v.slots + ' inserts'} would be placed (now: ${v.mine.inserts}), over ${v.mine.duration} s.${v.semantic ? ' Matched by meaning.' : ''}</div>
    ${v.report.map(r => `<div class="badge" style="margin-top:4px"><b>${r.at != null && r.refAt == null ? r.at.toFixed(1) : r.at.toFixed(1)} s</b> ${r.kind === 'card' ? '[card] ' : ''}${r.refText ? '← “' + esc(r.refText) + '” in the sample · ' : ''}“${esc(r.text)}”${r.sim != null ? ' · ' + Math.round(r.sim * 100) + '%' : ''}</div>`).join('')}</div>`;
}

async function removeCards() { const n = P.cuts.filter(c => c.clip === 'card').length; if (!(await uiConfirm('Remove all ' + n + ' text card(s)? The speaker stays on screen there.'))) return; P.cuts = P.cuts.filter(c => c.clip !== 'card'); await saveCuts(); draw(); }

// ---- music like the sample (tempo of the sample's music) ----
let MUSLIKE = null;
async function musicLike() { MUSLIKE = await api('/api/projects/' + P.id + '/reference/music'); MUSLIKE.pid = P.id; draw(); }
function muslikeHtml() {
  if (!MUSLIKE || MUSLIKE.pid !== P.id) return '';
  if (MUSLIKE.error) return `<div class="hint warn" style="margin-bottom:10px">${esc(MUSLIKE.error)}</div>`;
  if (!MUSLIKE.has) return `<div class="hint" style="margin-bottom:10px">No clear background music was found in the sample “${esc(MUSLIKE.sample)}”. Add the sample again if it was analyzed before this feature existed.</div>`;
  const cur = (P.audio || {}).music;
  return `<div class="hint" style="margin-bottom:10px"><b>Music like the sample</b> <span class="badge">tempo about ${Math.round(MUSLIKE.bpm)} bpm</span>${MUSLIKE.items.map((m, k) => `<div class="row" style="gap:8px;margin-top:8px;flex-wrap:nowrap;align-items:center">
    <button class="sec sm" onclick="playS('${m.id}')">▶</button>
    <div style="flex:1"><b>${k + 1}. ${esc(m.label)}</b> <span class="badge">${esc(m.mood)}</span><div class="badge">${m.bpm} bpm${m.how ? esc(m.how) : ''}</div></div>
    ${cur === m.id ? '<span class="badge">✓ In use</span>' : `<button class="sm" onclick="setA('music','${m.id}')">Use</button>`}</div>`).join('')}
    <div class="badge" style="margin-top:8px">Picked by the tempo of the music in the sample. Nothing changes until you press Use.</div></div>`;
}

async function hookVariants() {
  const n = +document.getElementById('hkcount').value; toast('Making ' + n + ' copy(ies)…');
  const r = await api('/api/projects/' + P.id + '/hook-variants', { count: n }); if (r.error) { toast(r.error); return; }
  await list(); toast(r.made.length + ' copy(ies) made: ' + r.made.map(m => m.name).join(', ')); draw();
}

// ---- life of the creative: on review -> edits -> approved ----
const LIFE = { work: ['In work', ''], review: ['On review', 'ac'], changes: ['Edits', 'warn'], approved: ['Approved', 'ok'] };
const lifeOf = p => (p.life && p.life.state) || 'work';
function lifeChip() {
  const s = lifeOf(P), l = LIFE[s];
  return `<button class="pill ${l[1]}" style="cursor:pointer;border:0" onclick="lifeDlg()" title="Status for the team: click to change">${l[0]}</button>`;
}
async function lifeDlg() {
  const r = await api('/api/projects/' + P.id + '/life'); if (r.error) { toast(r.error); return; }
  const d = $('#dlg'), s = r.state;
  const fmt = h => new Date(h.at).toLocaleString();
  const hist = (r.history || []).map(h => h.kind === 'state' ? `<div class="badge">${fmt(h)} · ${LIFE[h.from] ? LIFE[h.from][0] : h.from} → <b>${LIFE[h.to][0]}</b>${h.auto ? ' (automatically)' : ''}${h.by && h.by !== 'auto' ? ' · ' + esc(h.by) : ''}${h.note ? ' · ' + esc(h.note) : ''}</div>` : `<div class="badge">${fmt(h)} · ${esc(h.by || 'note')}: ${esc(h.text)}</div>`).join('');
  d.innerHTML = `<h3>Status for the team</h3>
    <div style="margin:6px 0 10px">Now: <span class="pill ${LIFE[s][1]}">${LIFE[s][0]}</span>${r.daysLeft != null ? ` <span class="badge">approved automatically in ${r.daysLeft > 0 ? r.daysLeft.toFixed(1) + ' day(s)' : 'a moment'} if no edits come</span>` : ''}</div>
    <div class="row" style="gap:8px">
      ${s !== 'review' ? '<button onclick="lifeSet(\'review\')">Hand over for review</button>' : ''}
      ${s !== 'approved' ? '<button class="sec" onclick="lifeSet(\'approved\')">Approve</button>' : ''}
      ${s !== 'changes' ? '<button class="sec" onclick="lifeEdits()">Edits requested…</button>' : ''}
      ${s !== 'work' ? '<button class="sec" onclick="lifeSet(\'work\')">Back to work</button>' : ''}
    </div>
    <div class="row" style="gap:8px;margin-top:12px"><input id="lnote" placeholder="Add a note to the history"><button class="sec" onclick="lifeNote()">Add</button></div>
    <div style="max-height:220px;overflow:auto;margin-top:12px">${hist || '<div class="badge">No history yet.</div>'}</div>
    <p style="margin-top:14px"><button class="sec" onclick="closeDlg()">Close</button></p>`;
  if (!d.open) d.showModal();
}
async function lifeSet(state, note) { const r = await api('/api/projects/' + P.id + '/life', { state, note }); if (r.error) { toast(r.error); return; } P.life = { ...(P.life || {}), state: r.state, handedAt: r.handedAt }; closeDlg(); toast(LIFE[state][0]); draw(); }
async function lifeEdits() { const note = await uiPrompt('What should be changed?', ''); if (note === null) return; lifeSet('changes', note); }
async function lifeNote() { const text = $('#lnote').value.trim(); if (!text) return; const r = await api('/api/projects/' + P.id + '/life/comment', { text }); if (r.error) { toast(r.error); return; } lifeDlg(); }
