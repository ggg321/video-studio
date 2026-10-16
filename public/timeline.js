// Timeline + live preview. The preview composes presenter video, inserts, cards, captions, music and SFX in the browser (approximate,
// instant); "Render exact preview" runs the real render pipeline on a short fragment.
const TL = { px: 36, sel: -1, t: 0, playing: false, wave: null, cues: [], scroll: 0, sfxIdx: 0, raf: 0, insSrc: '', music: null, master: null, voice: null };
const TLH = { ruler: 22, wave: 34, ins: 48, subs: 26, sfx: 22 };
const TLF = { square: [720, 720], square_hd: [1080, 1080], vertical: [1080, 1920], vertical_720: [720, 1280], portrait: [864, 1080], portrait_hd: [1080, 1350], landscape_720: [1280, 720], landscape: [1920, 1080] };

const tlDur = () => P.duration || (P.words && P.words.length ? P.words[P.words.length - 1].end : 30);
const tlFmt = t => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

function timelineCard() {
  return P.cuts && P.words ? `<div class="card pvcard" id="tlpvcard"><div id="tlpv"></div></div><div class="card"><h2>Timeline</h2><div id="tlbox"></div></div>` : '';
}

function insUrl(c) {
  if (c.clip === 'stock' && c.file) return `/files/${P.id}/stock/${c.file}`;
  const it = LIB.find(x => x.id === c.clip); return it ? it.url : '';
}
function blockInfo(c) {
  if (c.clip === 'card') return { color: c.variant ? '#d4a017' : '#c0141c', label: c.card || 'card', fg: c.variant ? '#111' : '#fff' };
  if (c.clip === 'stock') return { color: '#1f6feb', label: 'stock', fg: '#fff' };
  const it = LIB.find(x => x.id === c.clip); return { color: c.hook ? '#b8860b' : '#2a6f4f', label: c.hook ? 'hook' : c.clip, fg: '#fff', thumb: it && it.thumb };
}

async function initTimeline() {
  const box = document.getElementById('tlbox');
  if (!box || typeof P === 'undefined' || !P || !P.words) return;
  TL.stop && TL.stop();
  const [W, H] = TLF[P.format || 'square'] || TLF.square, vert = H > W * 1.3;
  const availH = Math.max(380, window.innerHeight - 330), pw = vert ? Math.min(320, Math.max(200, Math.round(availH * W / H))) : Math.min(460, Math.max(300, Math.round(availH * 0.8))), ph = Math.round(pw * H / W), dur = tlDur();
  const hasVid = !!P.presenterFile;
  const st = (typeof STY !== 'undefined' && STY.find(s => s.id === (P.subStyle || 'classic'))) || null;
  TL.t = clamp(TL.t, 0, dur);
  box.innerHTML = `
  <div class="row" style="align-items:flex-start;gap:16px;flex-wrap:wrap">
    <div style="flex:0 0 ${pw}px">
      <div id="tlstage" style="position:relative;width:${pw}px;height:${ph}px;background:#0b0d11;border-radius:10px;overflow:hidden;border:1px solid var(--line)">
        <div id="tlzoom" style="position:absolute;inset:0;transition:transform .25s">
          ${hasVid ? `<video id="tlbase" src="/files/${P.id}/${P.presenterFile}" ${P.voiceFile ? 'muted' : ''} playsinline preload="auto" style="width:100%;height:100%;object-fit:cover"></video>` : `<audio id="tlbase" src="/files/${P.id}/${P.voiceFile}" preload="auto"></audio>`}
        </div>
        <video id="tlins" muted playsinline preload="auto" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:none"></video>
        <div id="tlcard" style="position:absolute;left:50%;top:9%;transform:translateX(-50%);display:none;padding:.2em .6em;font:700 ${pw * 0.07}px Arial;white-space:nowrap;max-width:92%;overflow:hidden"></div>
        <div id="tlcap" style="position:absolute;left:50%;top:70%;transform:translate(-50%,-50%);text-align:center;width:max-content;max-width:88%;pointer-events:none"></div>
      </div>
      <div class="row" style="gap:6px;margin-top:8px;flex-wrap:nowrap">
        <button class="sec" style="padding:6px 10px" onclick="tlSeek(TL.t-2)">⏪</button>
        <button id="tlplay" style="padding:6px 16px" onclick="tlToggle()">▶ Play</button>
        <button class="sec" style="padding:6px 10px" onclick="tlSeek(TL.t+2)">⏩</button>
        <span id="tltime" class="badge" style="flex:1;text-align:right">0:00.0</span>
      </div>
      <div class="badge" style="margin-top:4px">Space = play/pause · click the ruler to jump</div>
    </div>
    <div style="flex:1;min-width:220px">
      <div id="tlinsp"></div>
      <div class="row" style="gap:8px;margin-top:10px">
        <button class="sec" onclick="tlAddAtPlayhead()">+ Insert at playhead</button>
        <button class="sec" onclick="tlExact()">Render exact preview</button>
      </div>
      <div id="tlexact" style="margin-top:10px"></div>
    </div>
  </div>
  <div style="margin-top:14px"><div class="row" style="gap:10px;flex-wrap:nowrap"><label style="margin:0;white-space:nowrap">Zoom</label><input type="range" min="12" max="140" value="${TL.px}" oninput="tlZoom(+this.value)"></div></div>
  <div id="tlscroll" style="overflow-x:auto;margin-top:6px;border:1px solid var(--line);border-radius:8px;background:var(--surface)"><div id="tltrack" style="position:relative"></div></div>`;
  const pv = document.getElementById('tlpv'); if (pv) { pv.innerHTML = ''; const col = box.querySelector(':scope > .row > div'); if (col) pv.appendChild(col); }   // the player goes to the sticky card
  TL.master = document.getElementById('tlbase');
  TL.voice = hasVid && P.voiceFile ? Object.assign(new Audio('/files/' + P.id + '/' + P.voiceFile), {}) : null;
  const A = P.audio || {};
  TL.music = A.musicOn !== false && A.music ? Object.assign(new Audio('/audio/music/' + A.music + '.wav'), { loop: true, volume: clamp(A.musicVol ?? 0.18, 0, 1) }) : null;
  TL.st = st; TL.pw = pw; TL.dur = dur;
  tlDrawTrack();
  tlSeek(TL.t);
  tlInspector();
  document.getElementById('tlscroll').scrollLeft = TL.scroll;
  document.getElementById('tlscroll').onscroll = e => { TL.scroll = e.target.scrollLeft; };
  TL.master.addEventListener('ended', () => tlPause());
  // data: waveform + subtitle cues
  if (!TL.wave || TL.wave.id !== P.id) { TL.wave = { id: P.id, peaks: [] }; api('/api/projects/' + P.id + '/waveform').then(w => { TL.wave = { id: P.id, peaks: w.peaks || [] }; tlDrawWave(); }); }
  else tlDrawWave();
  api('/api/projects/' + P.id + '/subtitles').then(r => { TL.cues = r.cues || []; tlDrawTrack(true); tlTick(); });
  if (!window.__tlKeys) { window.__tlKeys = true; document.addEventListener('keydown', e => { if (e.code === 'Space' && !/INPUT|TEXTAREA|SELECT|BUTTON/.test((document.activeElement || {}).tagName || '') && document.getElementById('tlbox')) { e.preventDefault(); tlToggle(); } }); }
  TL.stop = () => { tlPause(); };
}

// ---------- track drawing ----------
function tlDrawTrack(keepScroll) {
  const track = document.getElementById('tltrack'); if (!track) return;
  const px = TL.px, dur = TL.dur, w = Math.ceil(dur * px) + 40;
  const y = { ruler: 0, wave: TLH.ruler, ins: TLH.ruler + TLH.wave, subs: TLH.ruler + TLH.wave + TLH.ins, sfx: TLH.ruler + TLH.wave + TLH.ins + TLH.subs };
  const total = y.sfx + TLH.sfx;
  const step = px >= 60 ? 1 : px >= 28 ? 2 : 5;
  let h = `<div id="tlruler" style="position:absolute;left:0;top:0;width:${w}px;height:${TLH.ruler}px;border-bottom:1px solid var(--line);cursor:pointer;touch-action:none">`;
  for (let s = 0; s <= dur; s += step) h += `<div style="position:absolute;left:${s * px}px;top:0;height:100%;border-left:1px solid var(--line2);padding-left:3px;font-size:10px;color:var(--mut)">${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}</div>`;
  (P.segTimes || []).forEach(s => { const sp = (typeof SPK !== 'undefined' ? SPK : []).find(x => x.id === s.speakerId); h += `<div title="${esc(sp ? sp.name : 'speaker')}" style="position:absolute;left:${s.start * px}px;width:${(s.end - s.start) * px - 1}px;bottom:0;height:5px;background:${sp && sp.color || '#888'}"></div>`; });
  h += `</div><canvas id="tlwave" style="position:absolute;left:0;top:${y.wave}px;width:${w}px;height:${TLH.wave}px" width="${Math.min(w, 20000)}" height="${TLH.wave}"></canvas>`;
  const cuts = P.cuts || [];
  cuts.forEach((c, i) => {
    const b = blockInfo(c), left = c.start * px, wd = Math.max(8, (c.end - c.start) * px);
    h += `<div class="tlb" data-i="${i}" style="position:absolute;left:${left}px;top:${y.ins + 3}px;width:${wd}px;height:${TLH.ins - 6}px;background:${b.thumb ? `linear-gradient(#0008,#0008),url(${b.thumb}) center/auto 100%` : b.color};color:${b.fg};border-radius:6px;overflow:hidden;font-size:11px;line-height:1.2;padding:3px 10px;cursor:grab;touch-action:none;box-sizing:border-box;${i === TL.sel ? 'outline:2px solid #fff;' : ''}${c.bad ? 'box-shadow:inset 0 -3px 0 #ff5a5f;' : ''}user-select:none;white-space:nowrap">
      <div class="tlh" data-k="l" style="position:absolute;left:0;top:0;bottom:0;width:12px;cursor:ew-resize;touch-action:none;background:#fff3"></div>
      <div class="tlh" data-k="r" style="position:absolute;right:0;top:0;bottom:0;width:12px;cursor:ew-resize;touch-action:none;background:#fff3"></div>${esc(b.label)}${c.sim ? ' · ' + Math.round(c.sim * 100) + '%' : ''}</div>`;
  });
  (TL.cues || []).forEach(q => { h += `<div style="position:absolute;left:${q.start * px}px;top:${y.subs + 3}px;width:${Math.max(6, (q.end - q.start) * px - 2)}px;height:${TLH.subs - 6}px;background:#3a3f4d;border-radius:4px;font-size:10px;line-height:${TLH.subs - 6}px;padding:0 4px;overflow:hidden;white-space:nowrap;color:#cfd3dc;box-sizing:border-box">${esc(q.text)}</div>`; });
  const A = P.audio || {};
  if (A.sfxOn !== false) (A.sfx || []).forEach((e, i) => { h += `<div class="tls" data-i="${i}" title="${esc(e.id)}" style="position:absolute;left:${e.t * px - 8}px;top:${y.sfx + 2}px;width:16px;height:16px;background:#ffb020;transform:rotate(45deg);border-radius:2px;cursor:ew-resize;touch-action:none"></div>`; });
  if (A.musicOn !== false && A.music) h += `<div style="position:absolute;left:0;top:${y.sfx + 16}px;width:${dur * px}px;height:4px;background:#6b46c1;border-radius:2px"></div>`;
  h += `<div style="position:absolute;left:4px;top:${y.wave + 1}px;font-size:9px;color:#667">voice</div><div style="position:absolute;left:4px;top:${y.ins}px;font-size:9px;color:#99a">inserts</div><div style="position:absolute;left:4px;top:${y.subs}px;font-size:9px;color:#99a">subs</div><div style="position:absolute;left:4px;top:${y.sfx}px;font-size:9px;color:#99a">sfx</div>`;
  h += `<div id="tlhead" style="position:absolute;top:0;bottom:0;width:0;border-left:2px solid #ff5a5f;pointer-events:none;left:${TL.t * px}px;z-index:5"><div style="position:absolute;top:0;left:-6px;width:10px;height:10px;background:#ff5a5f;border-radius:50% 50% 0 50%;transform:rotate(45deg)"></div></div>`;
  track.style.width = w + 'px'; track.style.height = total + 'px'; track.innerHTML = h;
  tlDrawWave();
  // events
  document.getElementById('tlruler').onpointerdown = e => { const mv = ev => tlSeek((ev.clientX - track.getBoundingClientRect().left) / TL.px); mv(e); const up = () => { document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up); }; document.addEventListener('pointermove', mv); document.addEventListener('pointerup', up); };
  track.querySelectorAll('.tlb').forEach(el => { el.onpointerdown = e => tlDragCut(e, +el.dataset.i, (e.target.dataset && e.target.dataset.k) || 'move'); });
  track.querySelectorAll('.tls').forEach(el => { el.onpointerdown = e => tlDragSfx(e, +el.dataset.i); });
}
function tlDrawWave() {
  const cv = document.getElementById('tlwave'); if (!cv || !TL.wave) return;
  const g = cv.getContext('2d'), p = TL.wave.peaks || [], W = cv.width, H = cv.height;
  g.clearRect(0, 0, W, H); g.fillStyle = '#4f6df5aa';
  const per = W / Math.max(1, TL.dur);   // canvas px per second
  for (let i = 0; i < p.length; i++) { const hh = Math.max(1, p[i] * (H - 2)); g.fillRect(i / 20 * per, (H - hh) / 2, Math.max(1, per / 20), hh); }
}
function tlZoom(v) { TL.px = v; const keep = TL.t; tlDrawTrack(); tlSeek(keep); }

// ---------- dragging ----------
function tlSnap(t) {
  let best = t, d = 0.12;
  for (const w of (P.words || [])) for (const x of [w.start, w.end]) if (Math.abs(x - t) < d) { d = Math.abs(x - t); best = x; }
  return best;
}
function tlDragCut(e, i, kind) {
  e.preventDefault(); e.stopPropagation();
  TL.sel = i; const c = P.cuts[i], s0 = c.start, e0 = c.end, x0 = e.clientX, el = e.currentTarget;
  let moved = false;
  const mv = ev => {
    const dx = (ev.clientX - x0) / TL.px; if (Math.abs(ev.clientX - x0) > 3) moved = true; if (!moved) return;
    let ns = s0, ne = e0;
    if (kind === 'move') { const L = e0 - s0; ns = clamp(tlSnap(s0 + dx), 0, TL.dur - L); ne = ns + L; }
    else if (kind === 'l') ns = clamp(tlSnap(s0 + dx), 0, e0 - 0.4);
    else ne = clamp(tlSnap(e0 + dx), s0 + 0.4, TL.dur);
    c.start = +ns.toFixed(2); c.end = +ne.toFixed(2);
    el.style.left = c.start * TL.px + 'px'; el.style.width = Math.max(8, (c.end - c.start) * TL.px) + 'px';
  };
  const up = () => {
    document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up);
    if (moved) { P.cuts.sort((a, b) => a.start - b.start); TL.sel = P.cuts.indexOf(c); saveCuts(); draw(); } else { tlDrawTrack(); tlInspector(); tlSeek(c.start); }
  };
  document.addEventListener('pointermove', mv); document.addEventListener('pointerup', up);
}
function tlDragSfx(e, i) {
  e.preventDefault(); e.stopPropagation(); const s = P.audio.sfx[i], x0 = e.clientX, t0 = s.t; let moved = false; const el = e.currentTarget;
  const mv = ev => { moved = moved || Math.abs(ev.clientX - x0) > 3; if (!moved) return; s.t = +clamp(t0 + (ev.clientX - x0) / TL.px, 0, TL.dur).toFixed(2); el.style.left = s.t * TL.px - 8 + 'px'; };
  const up = () => { document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up); if (moved) { P.audio.sfx.sort((a, b) => a.t - b.t); saveA().then(draw); } else playS(s.id); };
  document.addEventListener('pointermove', mv); document.addEventListener('pointerup', up);
}

// ---------- inspector ----------
function tlInspector() {
  const el = document.getElementById('tlinsp'); if (!el) return;
  const c = P.cuts[TL.sel];
  if (!c) { el.innerHTML = '<div class="badge">Click an insert on the timeline to select it. Drag it to move, drag its edges to trim; edges snap to word boundaries.</div>'; return; }
  const b = blockInfo(c);
  el.innerHTML = `<div class="row" style="gap:10px;flex-wrap:nowrap;align-items:flex-start">
    ${b.thumb ? `<img src="${b.thumb}" style="width:64px;height:64px;object-fit:cover;border-radius:8px">` : `<div style="width:64px;height:64px;border-radius:8px;background:${b.color};display:grid;place-items:center;color:${b.fg};font-size:11px;text-align:center">${esc(b.label)}</div>`}
    <div style="flex:1"><b>${c.start.toFixed(2)} – ${c.end.toFixed(2)} s</b> <span class="badge">(${(c.end - c.start).toFixed(1)} s)</span>
      <div class="badge">${esc(c.text || '')}</div>${c.bad ? `<div class="badge" style="color:#ff5a5f">covers: ${esc(c.bad)}</div>` : ''}</div></div>
    <div class="row" style="gap:6px;margin-top:8px"><button class="sec" title="Good clip for this phrase" onclick="rate(${TL.sel},'up')">👍</button><button class="sec" title="Wrong clip for this phrase" onclick="rate(${TL.sel},'down')">👎</button><button class="sec" onclick="pickClip(${TL.sel})">Swap</button><button class="sec" onclick="stockDlg(${TL.sel})">Stock…</button><button class="sec" onclick="delCut(${TL.sel})">Delete</button></div><div class="row" style="gap:6px;margin-top:8px;align-items:center"><span class="badge">Transition into this insert</span>${cutTrnSelect(TL.sel)}</div><div class="badge" id="tlrate" style="margin-top:4px"></div>`;
}
function tlAddAtPlayhead() {
  const t = +TL.t.toFixed(2), s = P.words.filter(w => w.end > t && w.start < t + 2.5).map(w => w.w).slice(0, 3).join(' ').toUpperCase();
  P.cuts.push({ start: t, end: +Math.min(TL.dur, t + 2.5).toFixed(2), clip: 'card', card: s || 'NEW', variant: 0, text: '' });
  P.cuts.sort((a, b) => a.start - b.start); TL.sel = P.cuts.findIndex(c => c.start === t && c.clip === 'card'); saveCuts(); draw();
}
async function tlExact() {
  const out = document.getElementById('tlexact'); const c = P.cuts[TL.sel];
  const from = c ? Math.max(0, c.start - 1.2) : Math.max(0, TL.t - 2), to = c ? c.end + 1.2 : TL.t + 5;
  out.innerHTML = '<div class="badge">Rendering ' + (to - from).toFixed(1) + ' s with the real pipeline…</div>';
  const r = await api('/api/projects/' + P.id + '/preview', { from, to, cuts: P.cuts });
  out.innerHTML = r.error ? `<div class="badge" style="color:#ff5a5f">${esc(r.error)}</div>` : `<video controls autoplay playsinline src="${r.url}" style="width:100%;max-width:260px;border-radius:8px;background:#000"></video><div class="badge">Exact fragment ${from.toFixed(1)}–${Math.min(to, from + 30).toFixed(1)} s (low resolution).</div>`;
}

// ---------- playback ----------
function tlToggle() { TL.playing ? tlPause() : tlPlay(); }
function tlPlay() {
  if (!TL.master) return; TL.playing = true;
  if (TL.t >= TL.dur - 0.1) tlSeek(0);
  TL.master.play().catch(() => {}); if (TL.voice) { TL.voice.currentTime = TL.master.currentTime; TL.voice.play().catch(() => {}); }
  if (TL.music) { TL.music.currentTime = TL.master.currentTime % 64; TL.music.play().catch(() => {}); }
  const b = document.getElementById('tlplay'); if (b) b.textContent = '⏸ Pause';
  const loop = () => { if (!TL.playing) return; tlTick(true); TL.raf = requestAnimationFrame(loop); }; TL.raf = requestAnimationFrame(loop);
  clearInterval(TL.iv); TL.iv = setInterval(() => { if (TL.playing) tlTick(true); }, 80);   // fallback when the tab throttles animation frames
}
function tlPause() {
  TL.playing = false; cancelAnimationFrame(TL.raf); clearInterval(TL.iv);
  if (TL.master && TL.master.pause) TL.master.pause(); if (TL.voice) TL.voice.pause(); if (TL.music) TL.music.pause();
  const ins = document.getElementById('tlins'); if (ins) ins.pause();
  const b = document.getElementById('tlplay'); if (b) b.textContent = '▶ Play';
}
function tlSeek(t) {
  if (!TL.master) return; t = clamp(t, 0, TL.dur);
  try { TL.master.currentTime = t; } catch {} if (TL.voice) TL.voice.currentTime = t; if (TL.music) TL.music.currentTime = t % 64;
  TL.t = t; const sx = (P.audio && P.audio.sfx) || []; TL.sfxIdx = sx.findIndex(e => e.t >= t); if (TL.sfxIdx < 0) TL.sfxIdx = sx.length;
  TL.insSrc = ''; setTimeout(() => tlTick(false), 60);
}
function tlTick(playing) {
  if (!TL.master) return;
  const t = TL.master.currentTime; TL.t = t;
  if (playing) {
    if (t >= TL.dur - 0.03) { tlPause(); TL.t = TL.dur; return; }          // the voice track is the length of the video
    // keep video + separate voice (+ music) in step: if the video is still buffering, hold the audio until it catches up
    if (TL.master.paused && !TL.master.ended) TL.master.play().catch(() => {});
    if (TL.voice) {
      if (TL.master.readyState < 3) { if (!TL.voice.paused) TL.voice.pause(); }
      else { if (TL.voice.paused) TL.voice.play().catch(() => {}); if (Math.abs(TL.voice.currentTime - t) > 0.25) TL.voice.currentTime = t; }
    }
    if (TL.music && TL.music.paused && TL.master.readyState >= 3) TL.music.play().catch(() => {});
  }
  const head = document.getElementById('tlhead'); if (head) head.style.left = t * TL.px + 'px';
  const tm = document.getElementById('tltime'); if (tm) tm.textContent = tlFmt(t) + ' / ' + tlFmt(TL.dur);
  if (playing) { const sc = document.getElementById('tlscroll'); if (sc && (t * TL.px > sc.scrollLeft + sc.clientWidth - 40 || t * TL.px < sc.scrollLeft)) sc.scrollLeft = Math.max(0, t * TL.px - 60); }
  // inserts + cards
  const c = (P.cuts || []).find(x => t >= x.start && t < x.end), ins = document.getElementById('tlins'), card = document.getElementById('tlcard');
  if (c && c.clip === 'card') {
    card.style.display = 'block'; card.textContent = c.card; card.style.background = c.variant ? '#181818' : '#e0001a'; card.style.color = c.variant ? '#ffe100' : '#fff';
    ins.style.display = 'none'; ins.pause();
  } else {
    card.style.display = 'none';
    const url = c ? insUrl(c) : '';
    if (url) {
      ins.style.display = 'block';
      if (TL.insSrc !== url + '|' + c.start) { TL.insSrc = url + '|' + c.start; ins.src = url; ins.currentTime = 0.3 + (t - c.start); if (playing) ins.play().catch(() => {}); }
      else if (Math.abs(ins.currentTime - (0.3 + t - c.start)) > 0.4) ins.currentTime = 0.3 + t - c.start;
      if (playing && ins.paused) ins.play().catch(() => {});
    } else { ins.style.display = 'none'; ins.pause(); TL.insSrc = ''; }
  }
  // zoom punch-in
  const z = (P.zooms || []).some(q => t >= q.start && t < q.end); document.getElementById('tlzoom').style.transform = z ? 'scale(1.12)' : 'scale(1)';
  // caption
  const q = (TL.cues || []).find(x => t >= x.start && t < x.end), cap = document.getElementById('tlcap');
  if (cap) { if (q) { tlCaption(cap, q.text); cap.style.display = 'block'; } else cap.style.display = 'none'; }
  // SFX
  const A = P.audio || {};
  if (playing && A.sfxOn !== false) { const sx = A.sfx || []; while (TL.sfxIdx < sx.length && sx[TL.sfxIdx].t <= t) { if (t - sx[TL.sfxIdx].t < 0.5) { const a = new Audio('/audio/sfx/' + sx[TL.sfxIdx].id + '.wav'); a.volume = clamp(sx[TL.sfxIdx].vol ?? 0.5, 0, 1); a.play().catch(() => {}); } TL.sfxIdx++; } }
}
function tlCaption(el, text) {
  const st = TL.st; if (!st) { el.textContent = text; return; }
  const [W, H] = TLF[P.format || 'square'] || TLF.square, vi = H > W * 1.3 ? 1 : 0, pw = TL.pw;
  const sc = P.capScale || 1, pxOut = P.capPx || Math.round(W * st.size[vi] * sc), px = pw * pxOut / W;
  const x = P.capX != null ? P.capX : 0.5, y = P.capY != null ? P.capY : 1 - st.pos[vi] - st.size[vi] * (W / H) * 0.6;
  const font = P.font || st.font, accent = P.accent || st.accent, lines = P.capLines || 1;
  const words = text.split(/\s+/).filter(Boolean); let ai = -1;
  if (st.mode === 'longest') { let l = 4; words.forEach((w, k) => { const n = w.replace(/[^\p{L}\p{N}]/gu, '').length; if (n > l) { ai = k; l = n; } }); }
  const spans = words.map((w, k) => `<span${k === ai ? ` style="color:${accent}"` : ''}>${esc(st.upper ? w.toUpperCase() : w)}</span>`);
  const per = Math.ceil(spans.length / Math.min(lines, spans.length || 1)), rows = [];
  for (let i = 0; i < spans.length; i += per) rows.push(spans.slice(i, i + per).join(' '));
  el.style.left = x * 100 + '%'; el.style.top = y * 100 + '%';
  el.style.cssText += `;font-family:'${font}',Arial;font-weight:${P.font ? 400 : (st.bold ? 700 : 400)};font-size:${px}px;line-height:1.1;color:#fff;${st.box ? 'background:rgba(0,0,0,.72);padding:.12em .4em;border-radius:4px;' : `-webkit-text-stroke:${Math.max(1.2, px / 9)}px #000;paint-order:stroke fill;`}${st.glow ? `text-shadow:0 0 ${px / 3}px ${accent};` : ''}`;
  el.innerHTML = rows.join('<br>');
}
