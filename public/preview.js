// Live caption preview (template, font, size, colour) with drag-to-position, like a video editor.
const FORMAT_WH = { square: [720, 720], square_hd: [1080, 1080], vertical: [1080, 1920], vertical_720: [720, 1280], portrait: [864, 1080], portrait_hd: [1080, 1350], landscape_720: [1280, 720], landscape: [1920, 1080] };

function initPreview() {
  const box = document.getElementById('capprev');
  if (!box || typeof P === 'undefined' || !P) return;
  const st = STY.find(s => s.id === (P.subStyle || 'classic')) || STY[0];
  if (!st || !st.size) return;
  const [W, H] = FORMAT_WH[P.format || 'square'] || FORMAT_WH.square;
  const vi = H > W * 1.3 ? 1 : 0;
  const availH = Math.max(380, window.innerHeight - 300), pw = vi ? Math.min(320, Math.max(200, Math.round(availH * W / H))) : Math.min(460, Math.max(300, Math.round(availH * 0.8))), ph = Math.round(pw * H / W);
  const sc = P.capScale || 1;
  const pxOut = P.capPx || Math.round(Math.min(W, H) * st.size[vi] * sc);   // font size in output pixels
  const px = pw * pxOut / W;                                    // font size in preview pixels
  const slVal = Math.min(1.8, Math.max(0.5, pxOut / (Math.min(W, H) * st.size[vi])));
  const defY = 1 - st.pos[vi] - st.size[vi] * (W / H) * 0.6;
  const x = P.capX != null ? P.capX : 0.5, y = P.capY != null ? P.capY : defY;
  const font = P.font || ((FONTS.find(f => f.label === st.font || f.family === st.font) || {}).label || st.font), bold = P.font ? 400 : (st.bold ? 700 : 400);
  const accent = P.accent || st.accent;
  const lines = P.capLines || st.lines || 1;
  const words = ((P.script || 'Sample caption text here for the preview').replace(/[\n\r]+/g, ' ').trim().split(/\s+/).slice(0, (st.words || 3) * lines));
  let ai = -1;
  if (st.mode === 'longest') { let l = 4; words.forEach((w, k) => { const n = w.replace(/[^\p{L}\p{N}]/gu, '').length; if (n > l) { ai = k; l = n; } }); }
  if (st.mode === 'numkey') { ai = words.findIndex(w => /[0-9€$£%]/.test(w)); if (ai < 0) { let l = 4; words.forEach((w, k) => { const n = w.replace(/[^\p{L}\p{N}]/gu, '').length; if (n > l) { ai = k; l = n; } }); } }
  if (st.mode === 'labelkey') { let l = 0; ai = words.length - 1; words.forEach((w, k) => { const n = w.replace(/[^\p{L}\p{N}]/gu, '').length; if (n >= l && n >= 4) { ai = k; l = n; } }); }
  if (st.mode === 'spoken') ai = Math.min(1, words.length - 1);
  const longestWord = min => { let l = min, r = -1; words.forEach((w, k) => { const n = w.replace(/[^\p{L}\p{N}]/gu, '').length; if (n > l) { r = k; l = n; } }); return r; };
  const col0 = P.accent || (st.pal ? st.pal[0] : st.accent);
  if (st.mode === 'cyclekey') ai = longestWord(3);
  if (st.mode === 'cycle') ai = longestWord(6);
  if (st.mode === 'marker') ai = longestWord(3);
  const spanCss = k => st.mode === 'marker' ? (k === ai ? `background:${accent};padding:0 .12em;border-radius:.1em;` : '') : st.mode === 'reveal' ? (k > 0 ? 'color:' + accent : '') : (k === ai ? 'color:' + col0 : '');
  const spans = words.map((w, k) => `<span style="${spanCss(k)}">${esc(st.upper ? w.toUpperCase() : w)}</span>`);
  const per = Math.ceil(spans.length / Math.min(lines, spans.length || 1)), rows = [];
  for (let i = 0; i < spans.length; i += per) rows.push(spans.slice(i, i + per).join(' '));
  let html = rows.join('<br>');
  if (st.mode === 'linecolor') html = `<span style="color:${col0}">${rows[0]}</span>` + (rows.length > 1 ? '<br>' + rows.slice(1).join('<br>') : '');
  if (st.mode === 'labelkey' && ai > 0) html = `<span style="font-size:.56em">${words.slice(0, ai).map(w => esc(st.upper ? w.toUpperCase() : w)).join(' ')}</span><br>` + spans.slice(ai).join(' ');
  const stroke = (st.box || st.soft) ? '' : `-webkit-text-stroke:${Math.max(1.5, px / 9)}px #000;paint-order:stroke fill;`;
  const softCss = st.soft ? `text-shadow:0 ${px / 13}px ${px / 8}px rgba(0,0,0,.65);` : '';
  const glow = st.glow ? `text-shadow:0 0 ${px / 3}px ${accent};` : '';
  const boxCss = (st.box ? 'background:rgba(0,0,0,.72);padding:.12em .4em;border-radius:4px;' : '') + (st.mode === 'reveal' ? 'background:#e9e7ea;color:#1c1c1c;padding:.2em .55em;border-radius:.3em;' : '') + (st.italic ? 'font-style:italic;' : '');
  // what is shown behind the text: the speaker (default), the hook or any insert, so every style can be judged on real footage
  if (window.__prevBgP !== P.id) { window.__prevBgP = P.id; window.__prevBg = 'speaker'; }
  const cutsAll = P.cuts || [], sel = window.__prevBg, cc = sel !== 'speaker' && cutsAll[+sel] ? cutsAll[+sel] : null;
  const cutLabel = (c, k) => (c.hook ? 'Hook' : 'Insert ' + (k + 1)) + ' · ' + c.start.toFixed(1) + ' s';
  const stageIn = !cc ? '' : cc.clip === 'card' ? `<div style="position:absolute;inset:0;display:grid;place-items:center;text-align:center;font:700 ${pw * 0.1}px Arial;background:${cc.variant ? '#181818' : '#e0001a'};color:${cc.variant ? '#ffe100' : '#fff'}">${esc(cc.card || '')}</div>` : insUrl(cc) ? `<video src="${insUrl(cc)}" autoplay muted loop playsinline style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover"></video>` : '';
  const bg = cc ? 'background:#000;' : P.presenterFile ? `background-image:url(/api/projects/${P.id}/frame?f=${P.format || 'square'}&v=${P.updated || 0});background-size:cover;background-position:center;` : 'background:linear-gradient(160deg,#2b3140,#13161d);';
  box.innerHTML = `
  <div class="row" style="align-items:flex-start;gap:20px;flex-wrap:nowrap">
    <div id="capframe" style="position:relative;flex:0 0 ${pw}px;width:${pw}px;height:${ph}px;background:#0b0d11;border-radius:10px;overflow:hidden;border:1px solid var(--line);touch-action:none">
      <div id="fxstage" style="position:absolute;inset:0;${bg}transform-origin:center;will-change:transform">${stageIn}</div>
      <div id="fxvig" style="position:absolute;inset:0;display:none;pointer-events:none"></div><div id="fxgrain" style="position:absolute;inset:0;display:none;pointer-events:none"></div><div id="fxbar" style="position:absolute;left:0;display:none;pointer-events:none"></div><div id="fxdemo" style="position:absolute;inset:0;display:none;overflow:hidden;pointer-events:none"></div>
      <div id="bandprev" style="position:absolute;display:none;touch-action:none;cursor:move"><i class="bfill" style="position:absolute;inset:0;border-radius:inherit;pointer-events:none"></i><i class="bh bt" data-h="t"></i><i class="bh bb" data-h="b"></i><i class="bh bl" data-h="l"></i><i class="bh br" data-h="r"></i></div>
      <div id="ovlayer" style="position:absolute;inset:0;pointer-events:none"></div>
      <div id="capsample" style="position:absolute;left:${x * 100}%;top:${y * 100}%;transform:translate(-50%,-50%);white-space:normal;text-align:center;width:max-content;max-width:88%;cursor:grab;touch-action:none;user-select:none;color:#fff;font-family:'${font}',Arial;font-weight:${bold};font-size:${px}px;line-height:1.1;${stroke}${glow}${softCss}${boxCss}">${html}</div>
      <div style="position:absolute;left:50%;top:0;bottom:0;border-left:1px dashed rgba(255,255,255,.18);pointer-events:none"></div>
    </div>
    <div style="flex:1;min-width:180px">
      <label>Caption size (px, at ${W}×${H})</label>
      <div class="row" style="gap:8px;flex-wrap:nowrap"><input type="number" min="10" max="400" step="1" value="${pxOut}" style="max-width:100px" onchange="capSet({capPx:+this.value})"><span class="badge">px</span><input type="range" min="0.5" max="1.8" step="0.05" value="${slVal.toFixed(2)}" onchange="capSet({capScale:+this.value,capPx:null})"></div>
      <label>Lines</label>
      <div class="row" style="gap:6px">${[1, 2, 3, 4].map(n => `<button class="${(P.capLines || st.lines || 1) === n ? '' : 'sec'}" style="padding:6px 14px" onclick="capSet({capLines:${n}})">${n}</button>`).join('')}</div>
      <label>Position</label>
      <div class="row" style="gap:6px"><button class="sec" onclick="capSet({capX:0.5,capY:0.15})">Top</button><button class="sec" onclick="capSet({capX:0.5,capY:0.5})">Middle</button><button class="sec" onclick="capSet({capX:0.5,capY:0.78})">Lower</button><button class="sec" onclick="capSet({capReset:true})">Reset</button></div>
      <p class="badge">Drag the text in the frame to place it. Centre line = horizontal middle.</p>
      <label>Show behind the text</label>
      <div class="row" style="gap:6px;flex-wrap:nowrap"><select onchange="window.__prevBg=this.value;initPreview()"><option value="speaker">Speaker</option>${cutsAll.map((c, k) => `<option value="${k}" ${String(sel) === String(k) ? 'selected' : ''}>${cutLabel(c, k)}</option>`).join('')}</select>${cutsAll.some(c => c.hook) ? `<button class="sec" onclick="window.__prevBg=${cutsAll.findIndex(c => c.hook)};initPreview()">Hook</button>` : ''}</div>
      <div class="row" style="gap:6px;margin-top:8px"><button class="sec" onclick="fxDemo()">▶ Play transition</button></div>
      <p class="badge">The frame also shows the camera effects (shake, move, zoom, grade, vignette, grain, progress bar) and plays the chosen transition.</p>
    </div>
  </div>`;
  { const holder = document.getElementById('cappv'), frm = box.querySelector('#capframe'); if (holder && frm) { holder.innerHTML = ''; holder.appendChild(frm); } }   // the frame goes to the sticky card
  const el = document.getElementById('capsample'), fr = document.getElementById('capframe');
  // caption band behind the sample text (same rules as the render: auto height follows the text block)
  const placeBand = () => {
    const bd = document.getElementById('bandprev'), b = P.band;
    if (!bd) return; if (!b || !b.on) { bd.style.display = 'none'; return; }
    const fr0 = fr.getBoundingClientRect(), r = el.getBoundingClientRect(), k = pw / W;
    tcx = r.left + r.width / 2 - fr0.left; tcy = r.top + r.height / 2 - fr0.top;
    const cy = tcy + (b.dy || 0) * ph, cx = tcx + (b.dx || 0) * pw;
    const w = Math.max(0.3, b.w || 1) * pw, h = b.aspect > 0 ? w / b.aspect : b.auto === false ? (b.h || 0.14) * ph : r.height + px * 1.1;
    const bg = b.type === 'image' && b.image ? `url(${b.image.startsWith('builtin_') ? '/api/band-asset/' + b.image.slice(8) : '/files/' + P.id + '/' + b.image + '?v=' + (P.updated || 0)}) center/100% 100%` : b.type === 'solid' ? b.c1 : `linear-gradient(${b.angle ?? 90}deg,${b.c1},${b.c2})`;
    const left = Math.min(pw - w, Math.max(0, cx - w / 2)), top = Math.min(ph - h, Math.max(0, cy - h / 2));
    br = { left, top, w, h };
    Object.assign(bd.style, { display: 'block', left: left + 'px', top: top + 'px', width: w + 'px', height: h + 'px', borderRadius: (b.radius || 0) * k + 'px' });
    const fill = bd.querySelector('.bfill'); fill.style.background = bg; fill.style.opacity = b.opacity ?? 1; fill.style.filter = `brightness(${b.bright || 1})`;
  };
  let br = null, tcx = 0, tcy = 0, bdrag = null;
  placeBand();
  // ---- ticker / logo / clock in the preview: same sizes as the render, drag to move, drag the handles to resize ----
  const ovl = document.getElementById('ovlayer');
  const placeOverlays = () => {
    if (!ovl || typeof ovGet !== 'function') return; ovl.innerHTML = '';
    const o = ovGet(), k = pw / W, ff = n => `font-family:'${n}',Arial;`;
    const fill = p => p.type === 'none' ? '' : `<i class="pf" style="position:absolute;inset:0;border-radius:inherit;pointer-events:none;background:${p.type === 'solid' ? p.c1 : `linear-gradient(${p.angle}deg,${p.c1},${p.c2})`};opacity:${p.opacity}"></i>`;
    const box = (kind, css, plate, inner, handles) => { const d = document.createElement('div'); d.className = 'ovb'; d.dataset.k = kind; d.style.cssText = `position:absolute;pointer-events:auto;touch-action:none;cursor:move;outline:1px dashed rgba(255,255,255,.5);${css}`; d.innerHTML = fill(plate) + inner + handles.map(h => `<i class="bh b${h}" data-h="${h}"></i>`).join(''); ovl.appendChild(d); return d; };
    if (o.ticker.on) {
      const t = o.ticker, hp = t.h * ph, top = t.pos === 'top' ? t.edge * ph : ph - hp - t.edge * ph, em = hp * 0.58 / 1.17, sp = Math.max(8, t.speed * pw / 720), gap = hp * 3;
      const lab = t.label.on && t.label.text.trim() ? `<div class="tklab" style="position:absolute;left:0;top:0;bottom:0;display:flex;align-items:center;padding:0 ${hp * 0.5}px;border-radius:${t.label.plate.radius * k}px;color:${t.label.color};font-size:${em}px;font-weight:700;${ff(t.font)}white-space:nowrap">${fill(t.label.plate)}<span style="position:relative">${esc(t.label.text.toUpperCase())}</span></div>` : '';
      const text = esc(t.text || 'Your ticker text');
      const d = box('ticker', `left:0;top:${top}px;width:${pw}px;height:${hp}px;border-radius:${t.plate.radius * k}px;`, t.plate, `<div class="tkclip" style="position:absolute;left:0;right:0;top:0;bottom:0;overflow:hidden"><div class="tkrun" style="position:absolute;left:0;top:0;height:100%;display:flex;align-items:center;white-space:nowrap;color:${t.color};font-size:${em}px;font-weight:700;${ff(t.font)}">${[0, 1, 2, 3].map(() => `<span class="tku" style="padding-right:${gap}px">${text}</span>`).join('')}</div></div>${lab}`, ['t', 'b']);
      const lw = (d.querySelector('.tklab') || { offsetWidth: 0 }).offsetWidth, run = d.querySelector('.tkrun'), uw = d.querySelector('.tku').offsetWidth;
      d.querySelector('.tkclip').style.left = lw + 'px'; if (uw > 0 && run.animate) run.animate([{ transform: 'translateX(0)' }, { transform: `translateX(${-uw}px)` }], { duration: uw / sp * 1000, iterations: Infinity });
    }
    if (o.logo.on) {
      const l = o.logo, wp = l.w * pw, hp = wp / l.ratio, pad = l.pad * hp;
      box('logo', `left:${l.x * pw - wp / 2}px;top:${l.y * ph - hp / 2}px;width:${wp}px;height:${hp}px;border-radius:${l.plate.radius * k}px;`, l.plate, l.file ? `<img src="/files/${P.id}/${l.file}?v=${P.updated || 0}" draggable="false" style="position:absolute;left:${pad}px;top:${pad}px;width:calc(100% - ${2 * pad}px);height:calc(100% - ${2 * pad}px);object-fit:contain;pointer-events:none">` : `<span style="position:absolute;inset:0;display:grid;place-items:center;color:#667;font:700 ${hp * 0.3}px Arial;pointer-events:none">LOGO</span>`, ['s']);
    }
    if (o.clock.on) {
      const c = o.clock, fs0 = c.size * W * k, em = fs0 / 1.17, parts = c.start.split(':'), shown = `${parts[0].padStart(2, '0')}:${parts[1]}${c.seconds ? ':' + (parts[2] || '00') : ''}`, txt = (c.label ? esc(c.label) + ' ' : '') + shown;
      const d = box('clock', `left:0;top:0;height:${fs0 * 1.15}px;border-radius:${c.plate.radius * k}px;`, c.plate, `<span class="ckt" style="position:absolute;left:0;top:0;height:100%;display:flex;align-items:center;white-space:nowrap;color:${c.color};font-size:${em}px;font-weight:700;${ff(c.font)}pointer-events:none">${txt}</span>`, ['s']);
      const tw0 = d.querySelector('.ckt').offsetWidth, wp = tw0 * 1.04 + fs0 * 0.9; d.style.width = wp + 'px'; d.style.left = Math.min(pw - wp, Math.max(0, c.x * pw - wp / 2)) + 'px'; d.style.top = Math.min(ph - fs0 * 1.15, Math.max(0, c.y * ph - fs0 * 0.575)) + 'px';
      const sp = d.querySelector('.ckt'); sp.style.width = '100%'; sp.style.justifyContent = 'center';
    }
  };
  placeOverlays();
  if (ovl) {
    let od = null;
    ovl.onpointerdown = e => {
      const b = e.target.closest('.ovb'); if (!b) return; const h = e.target.dataset.h || 'move', r = b.getBoundingClientRect(), f = fr.getBoundingClientRect();
      od = { b, k: b.dataset.k, h, x: e.clientX, y: e.clientY, L: r.left - f.left, T: r.top - f.top, w: r.width, hh: r.height }; try { b.setPointerCapture(e.pointerId); } catch {} e.preventDefault(); e.stopPropagation();
    };
    ovl.onpointermove = e => {
      if (!od) return; const dx = e.clientX - od.x, dy = e.clientY - od.y, b = od.b; let L = od.L, T = od.T, w = od.w, hh = od.hh;
      if (od.h === 'move') { L += od.k === 'ticker' ? 0 : dx; T += dy; L = Math.min(pw - w, Math.max(0, L)); T = Math.min(ph - hh, Math.max(0, T)); }
      else if (od.h === 's') { const cx = od.L + od.w / 2, nw = Math.min(pw, Math.max(20, od.w + dx * 2)), sc = nw / od.w; w = nw; hh = od.hh * sc; L = cx - w / 2; T = od.T + od.hh / 2 - hh / 2; }
      else if (od.h === 't') { T = Math.min(od.T + od.hh - 10, od.T + dy); hh = od.T + od.hh - T; }
      else if (od.h === 'b') { hh = Math.max(10, od.hh + dy); }
      Object.assign(b.style, { left: L + 'px', top: T + 'px', width: w + 'px', height: hh + 'px' }); od.now = { L, T, w, hh };
    };
    ovl.onpointerup = async () => {
      if (!od || !od.now) { od = null; return; } const { k, h, w: w0, now: n } = od; od = null;
      const o = ovGet();
      if (k === 'ticker') { const cyc = n.T + n.hh / 2, pos = cyc < ph / 2 ? 'top' : 'bottom'; await ovSet('ticker', { pos, edge: Math.min(0.4, Math.max(0, pos === 'top' ? n.T / ph : (ph - n.T - n.hh) / ph)), h: Math.min(0.14, Math.max(0.03, n.hh / ph)) }); }
      else if (k === 'logo') await ovSet('logo', h === 's' ? { w: Math.min(0.8, Math.max(0.06, n.w / pw)), x: (n.L + n.w / 2) / pw, y: (n.T + n.hh / 2) / ph } : { x: (n.L + n.w / 2) / pw, y: (n.T + n.hh / 2) / ph });
      else if (k === 'clock') await ovSet('clock', h === 's' ? { size: Math.min(0.12, Math.max(0.02, o.clock.size * n.w / w0)), x: (n.L + n.w / 2) / pw, y: (n.T + n.hh / 2) / ph } : { x: (n.L + n.w / 2) / pw, y: (n.T + n.hh / 2) / ph });
    };
  }
  // ---- effects in the preview: the picture moves like in the render, captions / band / overlays stay still ----
  if (window.__fxRaf) { cancelAnimationFrame(window.__fxRaf); window.__fxRaf = 0; }
  const stage = document.getElementById('fxstage'), vig = document.getElementById('fxvig'), gr = document.getElementById('fxgrain'), pbar = document.getElementById('fxbar');
  const fxc = typeof fxGet === 'function' ? fxGet() : null;
  if (fxc && stage) {
    const GR = { warm: 'sepia(.28) saturate(1.1)', cool: 'hue-rotate(14deg) saturate(1.05) brightness(1.02)', tealorange: 'contrast(1.06) saturate(1.2) hue-rotate(-10deg)', punchy: 'contrast(1.12) saturate(1.3)', bw: 'grayscale(1) contrast(1.15)', faded: 'contrast(.9) brightness(1.04) saturate(.85)' };
    stage.style.filter = GR[fxc.grade] || '';
    const sh = fxc.shake, pn = fxc.pan, zm = fxc.zoom, k = pw / W;
    const moving = sh.mode !== 'off' || pn.mode !== 'off' || zm.mode !== 'off';
    if (moving && !P.presenterFile) stage.style.backgroundImage = 'repeating-linear-gradient(90deg,rgba(255,255,255,.07) 0 1px,transparent 1px 26px),repeating-linear-gradient(0deg,rgba(255,255,255,.07) 0 1px,transparent 1px 26px),linear-gradient(160deg,#2b3140,#13161d)';
    if (fxc.vignette > 0) Object.assign(vig.style, { display: 'block', background: `radial-gradient(ellipse at center,transparent ${Math.round(62 - 25 * fxc.vignette)}%,rgba(0,0,0,${(0.35 + 0.6 * fxc.vignette).toFixed(2)}) 100%)` });
    if (fxc.grain > 0) Object.assign(gr.style, { display: 'block', opacity: (0.12 + fxc.grain * 0.5).toFixed(2), mixBlendMode: 'overlay', backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2'/></filter><rect width='120' height='120' filter='url(%23n)'/></svg>")` });
    if (fxc.progress.on) Object.assign(pbar.style, { display: 'block', [fxc.progress.pos === 'top' ? 'top' : 'bottom']: '0', height: Math.max(2, fxc.progress.h * k) + 'px', background: fxc.progress.color, width: '0' });
    if (moving || fxc.grain > 0 || fxc.progress.on) {
      const LOOP = 12, aX = sh.mode === 'off' ? 0 : sh.amount * 0.016 * pw, aY = aX * 0.9, pX = pn.mode === 'off' ? 0 : pn.amount * 0.12 * pw, pY = pn.mode === 'off' ? 0 : pn.amount * 0.12 * ph;
      const z0 = 1 + 2 * Math.max((aX + pX / 2) / pw, (aY + pY / 2) / ph) + 0.012, za = zm.mode === 'off' ? 0 : zm.amount * 0.2;
      const tick = ms => {
        const t = (ms / 1000) % LOOP;
        const env = sh.mode === 'impact' ? Math.max(0, 1 - ((t % 2.5) / 0.4)) : 1;
        const fx_ = sh.mode === 'impact' ? Math.sin(t * 47) + 0.6 * Math.sin(t * 83 + 1.3) + 0.4 * Math.sin(t * 121) : Math.sin(t * 9.1) + 0.6 * Math.sin(t * 17.3 + 1) + 0.3 * Math.sin(t * 29.7);
        const fy_ = sh.mode === 'impact' ? Math.sin(t * 53 + 2) + 0.6 * Math.sin(t * 89) + 0.4 * Math.sin(t * 113 + 0.7) : Math.sin(t * 8.3 + 2) + 0.6 * Math.sin(t * 15.1) + 0.3 * Math.sin(t * 31.1 + 1);
        let ox = aX * env * fx_, oy = aY * env * fy_;
        if (pn.mode === 'lr') ox += (t / LOOP - 0.5) * pX; else if (pn.mode === 'rl') ox -= (t / LOOP - 0.5) * pX; else if (pn.mode === 'up') oy -= (t / LOOP - 0.5) * pY; else if (pn.mode === 'down') oy += (t / LOOP - 0.5) * pY;
        else if (pn.mode === 'alt') ox += Math.sin(2 * Math.PI * t / 9) * pX / 2; else if (pn.mode === 'drift') { ox += (Math.sin(t * 0.6) + 0.5 * Math.sin(t * 1.7 + 2)) * pX / 3; oy += (Math.sin(t * 0.5 + 1) + 0.5 * Math.sin(t * 1.3)) * pY / 3; }
        const zt = zm.mode === 'push' ? za * Math.min(1, t / LOOP) : zm.mode === 'breathe' ? za * 0.5 * (1 - Math.cos(2 * Math.PI * t / 6)) : zm.mode === 'pulse' ? za * Math.exp(-6 * (t % zm.every)) : 0;
        if (moving) stage.style.transform = `translate(${-ox}px,${-oy}px) scale(${z0 + zt})`;
        if (fxc.grain > 0) gr.style.backgroundPosition = `${Math.floor(Math.random() * 120)}px ${Math.floor(Math.random() * 120)}px`;
        if (fxc.progress.on) pbar.style.width = (t / LOOP * 100) + '%';
        window.__fxRaf = requestAnimationFrame(tick);
      };
      window.__fxRaf = requestAnimationFrame(tick);
    }
  }
  // drag the band to move it, drag its edges to change height / width
  const bdEl = document.getElementById('bandprev');
  bdEl.onpointerdown = e => { if (!P.band || !P.band.on || !br) return; bdrag = { k: e.target.dataset.h || 'move', x: e.clientX, y: e.clientY, r: { ...br } }; try { bdEl.setPointerCapture(e.pointerId); } catch {} e.preventDefault(); e.stopPropagation(); };
  bdEl.onpointermove = e => {
    if (!bdrag) return; const dx = e.clientX - bdrag.x, dy = e.clientY - bdrag.y, r0 = bdrag.r, k = bdrag.k;
    let L = r0.left, T = r0.top, R = r0.left + r0.w, B = r0.top + r0.h;
    if (k === 'move') { L += dx; R += dx; T += dy; B += dy; } else { if (k === 't') T += dy; if (k === 'b') B += dy; if (k === 'l') L += dx; if (k === 'r') R += dx; }
    if (k === 'move') { const sx = L < 0 ? -L : R > pw ? pw - R : 0, sy = T < 0 ? -T : B > ph ? ph - B : 0; L += sx; R += sx; T += sy; B += sy; }
    else { L = Math.max(0, L); T = Math.max(0, T); R = Math.min(pw, R); B = Math.min(ph, B); if (R - L < pw * 0.3) { if (k === 'l') L = R - pw * 0.3; else R = L + pw * 0.3; } if (B - T < 14) { if (k === 't') T = B - 14; else B = T + 14; } }
    Object.assign(bdEl.style, { left: L + 'px', top: T + 'px', width: R - L + 'px', height: B - T + 'px' }); bdrag.now = { L, T, R, B };
  };
  bdEl.onpointerup = async () => {
    if (!bdrag) return; const n = bdrag.now, k = bdrag.k; bdrag = null; if (!n) return;
    const patch = { dx: (((n.L + n.R) / 2) - tcx) / pw, dy: (((n.T + n.B) / 2) - tcy) / ph };
    if (k === 'l' || k === 'r') patch.w = Math.min(1, Math.max(0.3, (n.R - n.L) / pw));
    if (k === 't' || k === 'b') { patch.auto = false; patch.aspect = 0; patch.h = Math.min(0.6, Math.max(0.03, (n.B - n.T) / ph)); }
    await bandSet(patch);
  };
  let drag = null;
  el.onpointerdown = e => { drag = true; try { el.setPointerCapture(e.pointerId); } catch {} el.style.cursor = 'grabbing'; };
  el.onpointermove = e => {
    if (!drag) return;
    const r = fr.getBoundingClientRect();
    let nx = (e.clientX - r.left) / r.width, ny = (e.clientY - r.top) / r.height;
    nx = Math.min(0.95, Math.max(0.05, nx)); ny = Math.min(0.97, Math.max(0.03, ny));
    if (Math.abs(nx - 0.5) < 0.025) nx = 0.5;             // snap to the centre line
    el.style.left = nx * 100 + '%'; el.style.top = ny * 100 + '%'; el.dataset.x = nx; el.dataset.y = ny; placeBand();
  };
  el.onpointerup = () => {
    if (!drag) return; drag = null; el.style.cursor = 'grab';
    if (el.dataset.x) capSet({ capX: +(+el.dataset.x).toFixed(3), capY: +(+el.dataset.y).toFixed(3) }, true);
  };
}
async function capSet(patch, noDraw) {
  const r = await api('/api/projects/' + P.id, patch);
  Object.assign(P, { capX: r.capX, capY: r.capY, capScale: r.capScale, capLines: r.capLines, capPx: r.capPx });
  if (!noDraw) initPreview();
}
