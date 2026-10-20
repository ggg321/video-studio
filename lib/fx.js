// Transitions (light / zoom / news) and video effects (shake, camera move, constant zoom, vignette, grain, colour grade, progress bar).
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');

const TRANSITIONS = [
  { id: 'fade', label: 'Fade', group: 'basic' }, { id: 'slideleft', label: 'Slide left', group: 'basic' }, { id: 'slideup', label: 'Slide up', group: 'basic' }, { id: 'cut', label: 'Hard cut', group: 'basic' },
  { id: 'flash', label: 'Flash (white)', group: 'light' }, { id: 'flashwarm', label: 'Flash (warm)', group: 'light' }, { id: 'glow', label: 'Glow burst', group: 'light' },
  { id: 'sweep', label: 'Light sweep', group: 'light' }, { id: 'leak', label: 'Light leak', group: 'light' }, { id: 'flare', label: 'Lens streak', group: 'light' },
  { id: 'zoomin', label: 'Zoom in', group: 'zoom' }, { id: 'zoomout', label: 'Zoom out', group: 'zoom' }, { id: 'punch', label: 'Punch-in', group: 'zoom' }, { id: 'whip', label: 'Whip zoom', group: 'zoom' },
  { id: 'newsblue', label: 'News swipe (blue)', group: 'news' }, { id: 'newsred', label: 'News swipe (red)', group: 'news' }, { id: 'bars', label: 'News bars', group: 'news' }, { id: 'glitch', label: 'Glitch', group: 'news' }
];
const GROUPS = {}; TRANSITIONS.forEach(t => (GROUPS[t.group] = GROUPS[t.group] || []).push(t.id));
const MIX = { mix: GROUPS.basic, mix_light: GROUPS.light, mix_zoom: GROUPS.zoom, mix_news: GROUPS.news, mix_all: [...GROUPS.light, ...GROUPS.zoom, ...GROUPS.news] };
const MIX_LABELS = [['mix', 'Mix: basic'], ['mix_light', 'Mix: light'], ['mix_zoom', 'Mix: zoom'], ['mix_news', 'Mix: news'], ['mix_all', 'Mix: everything']];
const valid = id => TRANSITIONS.some(t => t.id === id) || !!MIX[id];
const pick = (mode, k) => (MIX[mode] ? MIX[mode][k % MIX[mode].length] : TRANSITIONS.some(t => t.id === mode) ? mode : 'fade');

// light pictures are drawn once per frame size
function asset(name, W, H) {
  const dir = path.join(ROOT, 'data', 'fx'), file = path.join(dir, `${name}_${W}x${H}.png`);
  if (fs.existsSync(file)) return file;
  fs.mkdirSync(dir, { recursive: true });
  execFileSync(require('./platform').PY, [path.join(ROOT, 'tools', 'fxassets.py')], { input: JSON.stringify({ name, W, H, out: file }), timeout: 60000, windowsHide: true });
  return file;
}

// what one transition needs: how the insert enters, extra light/colour layers, and a punch on the picture underneath
function spec(tr, o) {
  const { W, H, s } = o, dt = o.dt || 0.35, sp = { fadeIn: 0, fadeOut: false, vf: '', x: '', y: '', center: false, layers: [], bump: 0 };
  const zin = (A, d) => `scale=w='trunc(${W}*(1+${A}*max(0,1-t/${d}))/2)*2':h='trunc(${H}*(1+${A}*max(0,1-t/${d}))/2)*2':eval=frame,crop=${W}:${H}`;
  switch (tr) {
    case 'fade': sp.fadeIn = 0.16; sp.fadeOut = true; break;
    case 'slideleft': sp.x = `'if(lt(t,${s + 0.16}),W*(1-(t-${s})/0.16),0)'`; break;
    case 'slideup': sp.y = `'if(lt(t,${s + 0.16}),H*(1-(t-${s})/0.16),0)'`; break;
    case 'flash': sp.layers.push({ t: 'flash', color: '0xffffff', at: s, up: 0.05, down: 0.22 }); break;
    case 'flashwarm': sp.layers.push({ t: 'flash', color: '0xffd49a', at: s, up: 0.06, down: 0.3, peak: 0.95 }); break;
    case 'glow': sp.fadeIn = 0.1; sp.layers.push({ t: 'img', name: 'glow', at: s - 0.12, fi: 0.12, hold: 0.04, fo: 0.38 }); break;
    case 'sweep': sp.layers.push({ t: 'sweep', name: 'sweep', at: s - 0.2, dur: 0.6 }); break;
    case 'leak': sp.fadeIn = 0.12; sp.layers.push({ t: 'img', name: 'leak', at: s - 0.28, fi: 0.28, hold: 0.05, fo: 0.45 }); break;
    case 'flare': sp.layers.push({ t: 'img', name: 'flare', at: s - 0.1, fi: 0.1, hold: 0.04, fo: 0.42 }); break;
    case 'zoomin': sp.vf = zin(0.5, 0.28); sp.fadeIn = 0.1; break;
    case 'zoomout': sp.vf = `scale=w='trunc(${W}*min(1,0.55+0.45*t/0.3)/2)*2':h='trunc(${H}*min(1,0.55+0.45*t/0.3)/2)*2':eval=frame`; sp.fadeIn = 0.12; sp.center = true; break;
    case 'punch': sp.vf = zin(0.22, 0.24); sp.bump = 0.22; break;
    case 'whip': sp.vf = zin(0.9, 0.2); sp.layers.push({ t: 'flash', color: '0xffffff', at: s, up: 0.04, down: 0.16, peak: 0.5 }); break;
    case 'newsblue': case 'newsred':
      sp.x = `'if(lt(t,${s + dt}),-W*(1-(t-${s})/${dt}),0)'`; sp.layers.push({ t: 'bar', color: tr === 'newsblue' ? '0x1a4aa8' : '0xd6121c', at: s, dt }); break;
    case 'bars': sp.layers.push({ t: 'bars', at: s }); break;
    case 'glitch': { const g = Math.round(W * 0.03); sp.vf = `rgbashift=rh=${g}:bh=${-g}:gv=${Math.round(H * 0.006)}:enable='lt(t,0.3)'`; sp.layers.push({ t: 'flash', color: '0xffffff', at: s, up: 0.03, down: 0.1, peak: 0.35 }); break; }
    default: sp.fadeIn = 0.16; sp.fadeOut = true;
  }
  return sp;
}
// env: { f, inputs, addIn(args)->index, last (mutable), W, H }
function applyLayers(env, sp, k) {
  const { W, H } = env;
  sp.layers.forEach((L, j) => {
    const tag = `${k}_${j}`, add = (label, extra) => { env.f.push(`[${env.last}][${label}]overlay=${extra}[ofx${tag}]`); env.last = `ofx${tag}`; };
    if (L.t === 'flash') {
      const total = L.up + L.down + 0.05, i = env.addIn(['-f', 'lavfi', '-i', `color=c=${L.color}:s=${W}x${H}:r=30:d=${total.toFixed(2)}`]);
      env.f.push(`[${i}:v]format=rgba,colorchannelmixer=aa=${L.peak || 1},fade=t=in:st=0:d=${L.up}:alpha=1,fade=t=out:st=${L.up}:d=${L.down}:alpha=1,setpts=PTS-STARTPTS+${(L.at - L.up).toFixed(3)}/TB[fx${tag}]`);
      add(`fx${tag}`, `enable='between(t,${(L.at - L.up).toFixed(3)},${(L.at + L.down + 0.05).toFixed(3)})':eof_action=pass`);
    } else if (L.t === 'img') {
      const total = L.fi + L.hold + L.fo + 0.05, i = env.addIn(['-loop', '1', '-framerate', '30', '-t', total.toFixed(2), '-i', asset(L.name, W, H)]);
      env.f.push(`[${i}:v]format=rgba,fade=t=in:st=0:d=${L.fi}:alpha=1,fade=t=out:st=${(L.fi + L.hold).toFixed(3)}:d=${L.fo}:alpha=1,setpts=PTS-STARTPTS+${L.at.toFixed(3)}/TB[fx${tag}]`);
      add(`fx${tag}`, `enable='between(t,${L.at.toFixed(3)},${(L.at + total).toFixed(3)})':eof_action=pass`);
    } else if (L.t === 'sweep') {
      const i = env.addIn(['-loop', '1', '-framerate', '30', '-t', (L.dur + 0.1).toFixed(2), '-i', asset(L.name, W, H)]);
      env.f.push(`[${i}:v]format=rgba,setpts=PTS-STARTPTS+${L.at.toFixed(3)}/TB[fx${tag}]`);
      add(`fx${tag}`, `x='-main_w+2*main_w*(t-${L.at.toFixed(3)})/${L.dur}':y=0:enable='between(t,${L.at.toFixed(3)},${(L.at + L.dur).toFixed(3)})':eof_action=pass`);
    } else if (L.t === 'bar') {
      const bw = Math.round(W * 0.07 / 2) * 2, thin = Math.max(4, Math.round(W * 0.012 / 2) * 2), d = L.dt + 0.12;
      const i1 = env.addIn(['-f', 'lavfi', '-i', `color=c=${L.color}:s=${bw}x${H}:r=30:d=${d.toFixed(2)}`]), i2 = env.addIn(['-f', 'lavfi', '-i', `color=c=0xffffff:s=${thin}x${H}:r=30:d=${d.toFixed(2)}`]);
      env.f.push(`[${i1}:v]format=rgba,setpts=PTS-STARTPTS+${L.at.toFixed(3)}/TB[fxa${tag}]`, `[${i2}:v]format=rgba,setpts=PTS-STARTPTS+${L.at.toFixed(3)}/TB[fxb${tag}]`);
      const en = `enable='between(t,${L.at.toFixed(3)},${(L.at + L.dt + 0.03).toFixed(3)})':eof_action=pass`, edge = `min(main_w,(t-${L.at.toFixed(3)})/${L.dt}*main_w)`;
      env.f.push(`[${env.last}][fxa${tag}]overlay=x='${edge}-overlay_w':y=0:${en}[ofa${tag}]`, `[ofa${tag}][fxb${tag}]overlay=x='${edge}':y=0:${en}[ofx${tag}]`); env.last = `ofx${tag}`;
    } else if (L.t === 'bars') {
      const cols = ['0x1a4aa8', '0xffffff', '0xd6121c'], sh = Math.ceil(H / 3 / 2) * 2;
      cols.forEach((c, n) => {
        const t0 = L.at - 0.25 + 0.05 * n, i = env.addIn(['-f', 'lavfi', '-i', `color=c=${c}:s=${W}x${sh}:r=30:d=0.6`]);
        env.f.push(`[${i}:v]format=rgba,setpts=PTS-STARTPTS+${t0.toFixed(3)}/TB[fxs${tag}_${n}]`);
        env.f.push(`[${env.last}][fxs${tag}_${n}]overlay=x='-main_w+2*main_w*(t-${t0.toFixed(3)})/0.5':y=${n * Math.floor(H / 3)}:enable='between(t,${t0.toFixed(3)},${(t0 + 0.5).toFixed(3)})':eof_action=pass[ofx${tag}_${n}]`); env.last = `ofx${tag}_${n}`;
      });
    }
  });
}

// ---------------- video effects ----------------
const GRADES = [['off', 'Off'], ['warm', 'Warm'], ['cool', 'Cool'], ['tealorange', 'Teal and orange'], ['punchy', 'Punchy'], ['bw', 'Black and white'], ['faded', 'Faded film']];
const gradeFilter = { warm: 'colorbalance=rs=.07:gs=.015:bs=-.09:rm=.05:bm=-.06,eq=saturation=1.05', cool: 'colorbalance=rs=-.07:bs=.09:bm=.05:rm=-.04,eq=saturation=1.05', tealorange: 'colorbalance=rs=.1:bs=-.07:rh=.06:bh=.09:gm=-.02,eq=saturation=1.12:contrast=1.05', punchy: 'eq=contrast=1.12:saturation=1.3', bw: 'hue=s=0,eq=contrast=1.15', faded: 'eq=contrast=0.9:brightness=0.03:saturation=0.85' };
const num = (v, a, b, d) => { v = +v; return Number.isFinite(v) ? Math.min(b, Math.max(a, v)) : d; };
const oneOf = (v, l, d) => (l.includes(v) ? v : d);
function normFx(o = {}) {
  const s = o.shake || {}, p = o.pan || {}, z = o.zoom || {}, pr = o.progress || {};
  return {
    shake: { mode: oneOf(s.mode, ['off', 'continuous', 'impact'], 'off'), amount: num(s.amount, 0.1, 1, 0.5) },
    pan: { mode: oneOf(p.mode, ['off', 'lr', 'rl', 'up', 'down', 'alt', 'drift'], 'off'), amount: num(p.amount, 0.1, 1, 0.5) },
    zoom: { mode: oneOf(z.mode, ['off', 'push', 'breathe', 'pulse'], 'off'), amount: num(z.amount, 0.1, 1, 0.5), every: num(z.every, 1, 10, 3) },
    vignette: num(o.vignette, 0, 1, 0), grain: num(o.grain, 0, 1, 0), grade: oneOf(o.grade, GRADES.map(g => g[0]), 'off'),
    progress: { on: !!pr.on, color: /^#[0-9a-f]{6}$/i.test(String(pr.color || '')) ? pr.color.toLowerCase() : '#ff2a2a', pos: pr.pos === 'bottom' ? 'bottom' : 'top', h: Math.round(num(pr.h, 2, 24, 8)) }
  };
}
function mergeFx(old = {}, patch = {}) {
  const out = {}; for (const k of ['shake', 'pan', 'zoom', 'progress']) out[k] = { ...(old[k] || {}), ...(patch[k] || {}) };
  for (const k of ['vignette', 'grain', 'grade']) out[k] = patch[k] !== undefined ? patch[k] : old[k];
  return normFx(out);
}
// shake + camera move + constant zoom in one scale/crop; impacts = times (s) where an impact shake starts
function cameraChain(fx, W, H, T, impacts) {
  const sh = fx.shake, pn = fx.pan, zm = fx.zoom;
  if (sh.mode === 'off' && pn.mode === 'off' && zm.mode === 'off') return '';
  const ashX = sh.mode === 'off' ? 0 : sh.amount * 0.016 * W, ashY = ashX * 0.9;
  const pX = pn.mode === 'off' ? 0 : pn.amount * 0.12 * W, pY = pn.mode === 'off' ? 0 : pn.amount * 0.12 * H;
  const z0 = 1 + 2 * Math.max((ashX + pX / 2) / W, (ashY + pY / 2) / H) + 0.012, za = zm.mode === 'off' ? 0 : zm.amount * 0.2;
  const zt = zm.mode === 'push' ? `${za.toFixed(4)}*min(1,t/${Math.max(1, T).toFixed(2)})` : zm.mode === 'breathe' ? `${za.toFixed(4)}*0.5*(1-cos(2*PI*t/6))` : zm.mode === 'pulse' ? `${za.toFixed(4)}*exp(-6*mod(t,${zm.every}))` : '0';
  const env = sh.mode === 'impact' ? (impacts.length ? 'min(1,' + impacts.slice(0, 40).map(s => `between(t,${s.toFixed(2)},${(s + 0.4).toFixed(2)})*(1-(t-${s.toFixed(2)})/0.4)`).join('+') + ')' : '0') : '1';
  const fast = sh.mode === 'impact' ? '(sin(t*47)+0.6*sin(t*83+1.3)+0.4*sin(t*121))' : '(sin(t*9.1)+0.6*sin(t*17.3+1)+0.3*sin(t*29.7))', fastY = sh.mode === 'impact' ? '(sin(t*53+2)+0.6*sin(t*89)+0.4*sin(t*113+0.7))' : '(sin(t*8.3+2)+0.6*sin(t*15.1)+0.3*sin(t*31.1+1))';
  let ox = sh.mode === 'off' ? '0' : `${ashX.toFixed(2)}*${env}*${fast}`, oy = sh.mode === 'off' ? '0' : `${ashY.toFixed(2)}*${env}*${fastY}`;
  const Tt = Math.max(1, T).toFixed(2);
  if (pn.mode === 'lr') ox += `+(t/${Tt}-0.5)*${pX.toFixed(1)}`; else if (pn.mode === 'rl') ox += `-(t/${Tt}-0.5)*${pX.toFixed(1)}`;
  else if (pn.mode === 'up') oy += `-(t/${Tt}-0.5)*${pY.toFixed(1)}`; else if (pn.mode === 'down') oy += `+(t/${Tt}-0.5)*${pY.toFixed(1)}`;
  else if (pn.mode === 'alt') ox += `+sin(2*PI*t/9)*${(pX / 2).toFixed(1)}`; else if (pn.mode === 'drift') { ox += `+(sin(t*0.6)+0.5*sin(t*1.7+2))*${(pX / 3).toFixed(1)}`; oy += `+(sin(t*0.5+1)+0.5*sin(t*1.3))*${(pY / 3).toFixed(1)}`; }
  const Z = `(${z0.toFixed(4)}+${zt})`;
  return `scale=w='trunc(${W}*${Z}/2)*2':h='trunc(${H}*${Z}/2)*2':eval=frame,crop=${W}:${H}:x='(iw-${W})/2+${ox}':y='(ih-${H})/2+${oy}'`;
}
// vignette / grain / grade as one filter string ('' when none)
function lookChain(fx) {
  const p = [];
  if (fx.grade !== 'off') p.push(gradeFilter[fx.grade]);
  if (fx.vignette > 0) p.push(`vignette=angle=${((Math.PI / 2) * (0.95 - 0.6 * fx.vignette)).toFixed(3)}`);
  if (fx.grain > 0) p.push(`noise=alls=${Math.round(6 + fx.grain * 30)}:allf=t`);
  return p.join(',');
}
module.exports = { TRANSITIONS, MIX_LABELS, GRADES, valid, pick, spec, applyLayers, normFx, mergeFx, cameraChain, lookChain };
