// "Typographic" video: the speaker with animated key words, full-screen text scenes and phone / monitor frames with the user's screenshots.
// The plan (what appears when) is built from the words and sentences of the project; the picture is drawn by Remotion (remotion/render.js).
const fs = require('fs'), path = require('path'), { spawn, spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const RDIR = path.join(ROOT, 'remotion');
const FONTS = [path.join(ROOT, 'fonts'), path.join(ROOT, 'assets', 'remotion', 'fonts')];
const DEFAULTS = { accent: '#2dffc4', font: 'Montserrat-VF.ttf', density: 'medium', sceneEvery: 4, themes: 'mix', anim: 'blur', shotsAs: 'device', carousel: 'carousel-vision-1', carouselBg: 'dark', underline: false, morph: false, particles: false, keywords: true, flashes: true, shotSeconds: 2.4 };
const ACCENTS = [['#2dffc4', 'Mint'], ['#ff4fd8', 'Orchid'], ['#35c8ff', 'Cyan'], ['#ffb02e', 'Amber'], ['#ff6b57', 'Coral'], ['#9b7bff', 'Violet'], ['#ffffff', 'White']];

const STOP = new Set(('a an the and or but if so of to in on at by for with from as is are was were be been am do does did have has had it its this that these those i you he she we they me him her us them my your his our their ' +
  'not no yes can could will would should may might just very too also then than there here what which who when where why how all any some more most about into over out up down off again once only own same so such s t ' +
  'и в во не что он на я с со как а то все она так его но да ты к у же вы за бы по только ее мне было вот от меня еще нет о из ему теперь когда даже ну вдруг ли если уже или ни быть был него до вас нибудь опять уж вам ведь там потом себя ничего ей может они тут где есть надо ней для мы тебя их чем была сам чтоб без будто чего раз тоже себе под будет ж тогда кто этот того потому этого какой совсем ним здесь этом один почти мой тем чтобы нее сейчас были куда зачем всех никогда можно при наконец два об другой хоть после над больше тот через эти нас про всего них какая много разве три эту моя впрочем хорошо свою этой перед иногда лучше чуть том нельзя такой им более всегда конечно всю между ' +
  'і й та що це як але або чи не на в у з до для від по при про то це він вона вони ми ви я ти був була було були є буде тільки вже ще дуже також коли де там тут який яка яке які').split(/\s+/));

const clean = w => String(w || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const probeDur = f => { try { const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], { encoding: 'utf8' }); return parseFloat(r.stdout) || 0; } catch { return 0; } };
const probeSize = f => { try { const r = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', f], { encoding: 'utf8' }).stdout.trim().split(','); return [+r[0] || 0, +r[1] || 0]; } catch { return [0, 0]; } };

function settingsOf(p) { return { ...DEFAULTS, ...((p.typo && p.typo.opts) || {}) }; }

// the best 1-3 word phrase of a sentence: the longest run of words that are not filler
function bestRun(ws, maxWords = 3) {
  let best = null, cur = [];
  const close = () => { if (cur.length) { for (let i = 0; i < cur.length; i += maxWords) { const part = cur.slice(i, i + maxWords), sc = part.reduce((s, w) => s + clean(w.w).length + (/\d/.test(w.w) ? 6 : 0), 0) + part.length * 2; if (!best || sc > best.sc) best = { words: part, sc }; } } cur = []; };
  for (const w of ws) { const c = clean(w.w); if (!c || (STOP.has(c) && !/\d/.test(c)) || c.length < 3 && !/\d/.test(c)) close(); else cur.push(w); }
  close(); return best;
}

// -> { keywords:[{start,end,text,pos}], scenes:[{kind,start,end,lines,hl,theme} | {kind:'device',...}] , duration }
function plan(dir, p, o) {
  o = { ...settingsOf(p), ...(o || {}) };
  const sents = (p.sentences || []).filter(s => s.end > s.start), words = p.words || [];
  const T = probeDur(p.voiceFile ? path.join(dir, p.voiceFile) : path.join(dir, p.presenterFile)) || (sents.length ? sents[sents.length - 1].end : 10);
  const wordsIn = s => words.filter(w => w.start >= s.start - 0.05 && w.end <= s.end + 0.1);
  const scenes = [], keywords = [];
  let lastScene = -9, ns = 0;
  // text scenes
  if (+o.sceneEvery > 0) {
    for (let i = 2; i < sents.length - 1; i += +o.sceneEvery) {
      const run = bestRun(wordsIn(sents[i]), 3); if (!run) continue;
      const a = run.words[0].start, b = run.words[run.words.length - 1].end, dur = Math.min(2.4, Math.max(1.3, b - a + 0.7));
      if (a - lastScene < 2.2 || a + dur > T - 0.5) continue;
      const txt = run.words.map(w => w.w.replace(/[.,!?;:]+$/g, ''));
      const lines = txt.length > 1 ? [txt.slice(0, Math.ceil(txt.length / 2)).join(' '), txt.slice(Math.ceil(txt.length / 2)).join(' ')] : [txt[0]];
      const theme = o.themes === 'dark' ? 'dark' : o.themes === 'light' ? 'light' : (ns % 2 ? 'dark' : 'light');
      scenes.push({ kind: 'text', start: +a.toFixed(2), end: +(a + dur).toFixed(2), lines, hl: [txt[txt.length - 1]], theme }); lastScene = a + dur; ns++;
    }
  }
  // screenshots: one carousel scene with all of them, or one phone / monitor frame each
  const shots = ((p.typo && p.typo.shots) || []).filter(f => fs.existsSync(path.join(dir, 'typo', f)));
  const blk = o.shotsAs === 'carousel' && shots.length ? require('./hfscenes').get(o.carousel) : null;
  if (blk) {
    const dur = Math.min(blk.dur, Math.max(2, T - 2)), at = T * 0.45, s = sents.find(x => x.start >= at) || sents[Math.floor(sents.length / 2)];
    let a = s ? s.start : at;
    const hit = () => scenes.find(c => a < c.end + 0.3 && a + dur > c.start - 0.3);
    for (let g = 0; hit() && g < 6; g++) a = hit().end + 0.4;
    if (a + dur <= T - 0.2) scenes.push({ kind: 'carousel', start: +a.toFixed(2), end: +(a + dur).toFixed(2), block: blk.id, theme: blk.texts && blk.texts.length ? 'light' : (o.carouselBg === 'light' ? 'light' : 'dark'), lines: [], files: shots });
  }
  (blk ? [] : shots).forEach((f, k) => {
    const at = T * (k + 1) / (shots.length + 1), s = sents.find(x => x.end > at) || sents[sents.length - 1]; if (!s) return;
    let a = s.start; const dur = +o.shotSeconds || 2.4;
    for (let g = 0; g < 8; g++) { const c = scenes.find(c => a < c.end + 0.3 && a + dur > c.start - 0.3); if (!c) break; a = c.end + 0.4; }
    if (a + dur > T - 0.3) return;
    const file = path.join(dir, 'typo', f), [w, h] = /\.(png|jpe?g|webp)$/i.test(f) ? probeSize(file) : [0, 0];
    scenes.push({ kind: 'device', start: +a.toFixed(2), end: +(a + dur).toFixed(2), device: w && h && w > h * 1.15 ? 'monitor' : 'phone', src: file, theme: 'dark', fileName: f });
  });
  scenes.sort((a, b) => a.start - b.start);
  // key words over the speaker (not while a scene covers the picture)
  if (o.keywords) {
    const step = o.density === 'low' ? 2 : 1, perSent = o.density === 'high' ? 2 : 1;
    sents.forEach((s, i) => {
      if (i % step) return;
      let ws = wordsIn(s);
      for (let n = 0; n < perSent; n++) {
        const run = bestRun(ws, 2); if (!run) break;
        const first = run.words[0], a = Math.max(0, first.start - 0.05), b = Math.min(s.end + 0.3, a + 1.7);
        ws = ws.filter(w => !run.words.includes(w));
        if (scenes.some(c => a < c.end + 0.1 && b > c.start - 0.1)) continue;
        if (keywords.some(k => a < k.end && b > k.start)) continue;
        keywords.push({ start: +a.toFixed(2), end: +b.toFixed(2), text: run.words.map(w => w.w.replace(/[.,!?;:]+$/g, '')).join(' '), pos: (keywords.length % 3 === 2) ? 'center' : 'top' });
      }
    });
  }
  return { keywords, scenes, duration: +T.toFixed(2) };
}

function fontFile(name) { for (const d of FONTS) { const f = path.join(d, path.basename(String(name || ''))); if (fs.existsSync(f)) return f; } return path.join(ROOT, 'fonts', 'Montserrat-VF.ttf'); }
function fontList() { const out = []; for (const d of FONTS) { try { for (const f of fs.readdirSync(d)) if (/\.(ttf|otf|woff2?)$/i.test(f)) out.push(f); } catch {} } return [...new Set(out)].sort(); }

const FORMATS = { vertical_720: [720, 1280], vertical: [1080, 1920], portrait: [864, 1080], portrait_hd: [1080, 1350], square: [720, 720], square_hd: [1080, 1080], landscape_720: [1280, 720], landscape: [1920, 1080] };

// renders to <dir>/out_typo.mp4; pl is the plan (possibly edited by the user)
// carousel scenes are drawn by HyperFrames first and then played as a clip inside the video
async function render(dir, p, pl, onProgress) {
  const hs = require('./hfscenes'), hb = require('./hfblocks'), scenes = [];
  for (const s of pl.scenes) {
    if (s.kind === 'catalog') {
      const r = await hb.render(dir, { block: s.block, params: s.params || {} });
      scenes.push({ kind: 'clip', start: s.start, end: Math.min(s.end, s.start + r.dur), src: r.file, alpha: r.alpha, bg: r.bg, fit: s.fit === 'cover' ? 'cover' : 'contain', theme: 'dark' });
      continue;
    }
    if (s.kind !== 'carousel') { scenes.push(s); continue; }
    const files = ((s.files && s.files.length ? s.files : (p.typo && p.typo.shots)) || []).map(f => path.join(dir, 'typo', path.basename(f)));
    const light = s.theme === 'light', r = await hs.render(dir, { block: s.block, images: files, bg: light ? '#EDEDEF' : '#06100f', lines: s.lines, wide: (FORMATS[p.format] || FORMATS.vertical_720)[0] > (FORMATS[p.format] || FORMATS.vertical_720)[1] * 1.2 });
    scenes.push({ kind: 'clip', start: s.start, end: Math.min(s.end, s.start + r.dur), src: r.file, theme: s.theme, bg: light ? '#EDEDEF' : '#06100f' });
  }
  return renderInner(dir, p, { ...pl, scenes }, onProgress);
}
function renderInner(dir, p, pl, onProgress) {
  return new Promise((resolve, reject) => {
    if (!p.presenterFile) return reject(new Error('A typographic video needs the video of the speaker.'));
    const o = settingsOf(p), [W, H] = FORMATS[p.format] || FORMATS.vertical_720;
    const props = { width: W, height: H, fps: 30, duration: pl.duration, video: path.join(dir, p.presenterFile), audio: p.voiceFile ? path.join(dir, p.voiceFile) : null,
      presenterDur: probeDur(path.join(dir, p.presenterFile)), accent: o.accent, fontUrl: fontFile(o.font), fontFamily: 'Montserrat', flashes: !!o.flashes, anim: ['gsap', 'split'].includes(o.anim) ? o.anim : 'blur', fx: { underline: !!o.underline, morph: !!o.morph, particles: !!o.particles },
      keywords: pl.keywords, scenes: pl.scenes.map(s => (s.kind === 'device' && s.src && !path.isAbsolute(s.src) ? { ...s, src: path.join(dir, 'typo', s.src) } : s)) };
    const pf = path.join(dir, 'typo_props.json'), out = path.join(dir, 'out_typo.mp4');
    fs.writeFileSync(pf, JSON.stringify(props));
    const ch = spawn(process.execPath, [path.join(RDIR, 'render.js'), pf, out, dir, ...FONTS], { cwd: RDIR, windowsHide: true });
    let err = '', buf = '';
    ch.stdout.on('data', d => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (l.startsWith('PROGRESS ')) onProgress && onProgress(parseFloat(l.slice(9)) || 0); } });
    ch.stderr.on('data', d => { err += d; if (err.length > 8000) err = err.slice(-8000); });
    ch.on('error', reject);
    ch.on('close', code => code === 0 && fs.existsSync(out) ? resolve('out_typo.mp4') : reject(new Error((err.match(/ERROR ([^\n]+)/) || [])[1] || 'The render stopped: ' + err.slice(-400))));
  });
}
module.exports = { plan, render, settingsOf, DEFAULTS, ACCENTS, fontList, probeDur };
