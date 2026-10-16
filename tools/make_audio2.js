// More local, license-free audio: extra SFX variants + new categories, and 8 more music beds. Appends to data/audio/index.json.
// Run: node tools/make_audio2.js   (run tools/make_audio.js first)
const { spawnSync } = require('child_process');
const fs = require('fs'), path = require('path');
const OUT = path.join(__dirname, '..', 'data', 'audio'), SFX = path.join(OUT, 'sfx'), MUS = path.join(OUT, 'music');
const idxFile = path.join(OUT, 'index.json');
const index = JSON.parse(fs.readFileSync(idxFile, 'utf8'));
const has = id => index.some(x => x.id === id);

function synth(file, expr, d, af = '') {
  const chain = [af, 'afade=t=in:d=0.004', `afade=t=out:st=${Math.max(0, d - 0.03)}:d=0.03`].concat(['alimiter=limit=0.8:level=0']).filter(Boolean).join(',');
  const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', `aevalsrc='${expr}':d=${d}:s=44100`, '-af', chain, '-ar', '44100', file], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(file + ': ' + r.stderr.slice(-300));
}
const N = '(random(0)*2-1)';
function add(cat, name, expr, d, af, label) {
  if (has(name)) return;
  synth(path.join(SFX, name + '.wav'), expr, d, af); index.push({ id: name, cat, dur: d, label: label || name });
}
const each = (cat, rows, fn, label) => rows.forEach((row, i) => { const [expr, d, af] = fn(...row); add(cat, `${cat}_${i + 1}`, expr, d, af, `${label} ${i + 1}`); });

// extend existing categories (ids continue after the original numbering)
const more = (cat, start, rows, fn, label) => rows.forEach((row, i) => { const [expr, d, af] = fn(...row); add(cat, `${cat}_${start + i}`, expr, d, af, `${label} ${start + i}`); });
more('whoosh', 7, [[0.5, 3200, 0.5], [0.8, 5000, 0.45], [0.4, 2200, 0.65], [1.1, 3500, 0.4]], (d, lp, k) => [`${N}*pow(sin(PI*pow(t/${d},${k})),2)*0.8`, d, `highpass=f=250,lowpass=f=${lp},volume=1.4`], 'Whoosh');
more('swish', 5, [[0.2, 4200], [0.26, 6000], [0.15, 8000], [0.32, 3000]], (d, lp) => [`${N}*pow(sin(PI*t/${d}),2)*0.8`, d, `highpass=f=600,lowpass=f=${lp},volume=1.3`], 'Swish');
more('pop', 6, [[1000, 2000, 30], [800, 1500, 26], [1400, 2800, 36], [600, 1000, 20], [1800, 3400, 44]], (f0, sl, k) => [`sin(2*PI*(${f0}*t-${sl}*t*t))*exp(-t*${k})*0.9`, 0.2, ''], 'Pop');
more('tick', 5, [[2500, 380], [4200, 460], [1800, 280], [6000, 560]], (hp, k) => [`${N}*exp(-t*${k})`, 0.06, `highpass=f=${hp},volume=1.5`], 'Tick');
more('ding', 5, [[1200, 5], [2000, 8], [880, 3.5], [1480, 6]], (f, k) => [`(sin(2*PI*${f}*t)+0.4*sin(2*PI*${f * 2}*t)+0.2*sin(2*PI*${f * 3}*t))*exp(-t*${k})*0.35`, 1.2, ''], 'Ding');
more('hit', 5, [[100, 70, 8], [80, 55, 6.5], [120, 90, 10], [50, 25, 4.5]], (f0, sl, k) => [`sin(2*PI*(${f0}*t-${sl}*t*t))*exp(-t*${k})*0.95+${N}*exp(-t*45)*0.35`, 0.9, 'lowpass=f=5000'], 'Hit');
more('riser', 4, [[1.5, 250, 350], [2.4, 120, 380], [1.0, 350, 600]], (d, f0, sl) => [`(${N}*0.35+sin(2*PI*(${f0}*t+${sl}*t*t))*0.45)*pow(t/${d},2)`, d, 'lowpass=f=9000'], 'Riser');
more('glitch', 3, [[55, 10], [90, 14], [30, 6]], (r, k) => [`${N}*lt(mod(t*${r},1),0.45)*exp(-t*${k})*0.8`, 0.35, 'highpass=f=800'], 'Glitch');

// new categories
each('click', [[3000, 600], [2200, 450], [4500, 800], [1600, 380]], (hp, k) => [`${N}*exp(-t*${k})*0.8+sin(2*PI*${hp / 2}*t)*exp(-t*${k * 2})*0.4`, 0.05, `highpass=f=${hp / 2}`], 'Click');
each('sparkle', [[2400, 2], [3200, 3], [1800, 1.6]], (f, s) => [`(sin(2*PI*${f}*t*(1+0.5*floor(t*14)/${s}))+0.5*sin(2*PI*${f * 2}*t*(1+0.25*floor(t*14))))*exp(-t*3.5)*0.25`, 0.9, 'highpass=f=800'], 'Sparkle');
each('drop', [[220, 1.0], [160, 1.3], [300, 0.8]], (f, d) => [`sin(2*PI*(${f}*t-${f / (2 * d)}*t*t))*exp(-t*3)*0.9+${N}*exp(-t*20)*0.2`, d, 'lowpass=f=1500'], 'Drop');
each('shutter', [[0.18], [0.24]], d => [`${N}*(exp(-t*90)+exp(-(t-0.07)*70)*gt(t,0.07))*0.7`, d, 'highpass=f=1500,lowpass=f=9000'], 'Shutter');
each('coin', [[1318, 1760], [988, 1318], [1568, 2093]], (a, b) => [`(sin(2*PI*${a}*t)*lt(t,0.09)+sin(2*PI*${b}*t)*gt(t,0.09))*exp(-mod(t,0.09)*14)*exp(-t*3)*0.5`, 0.6, ''], 'Coin');
each('notify', [[880, 1318], [660, 990], [1046, 1568]], (a, b) => [`(sin(2*PI*${a}*t)*lt(t,0.12)+sin(2*PI*${b}*t)*gt(t,0.12))*exp(-t*5)*0.45`, 0.7, ''], 'Notification');
each('buzz', [[140], [200]], f => [`(sgn(sin(2*PI*${f}*t))*0.5+sin(2*PI*${f * 1.5}*t)*0.3)*exp(-t*6)*0.5`, 0.45, 'lowpass=f=2500'], 'Buzz');
each('type', [[18], [26]], r => [`${N}*lt(mod(t*${r},1),0.12)*exp(-mod(t*${r},1)*40)*0.7`, 0.9, 'highpass=f=1800,lowpass=f=8000'], 'Typing');
each('stinger', [[110, 220], [98, 196], [123, 246]], (a, b) => [`(sin(2*PI*${a}*t)+0.7*sin(2*PI*${b}*t)+0.4*sin(2*PI*${b * 1.5}*t))*exp(-t*2.2)*0.5+${N}*exp(-t*30)*0.2`, 1.6, 'lowpass=f=4000'], 'Stinger');

// ---- more music beds (64 s, seamless: beat divides 4 s) ----
const P = (...a) => a;
function bed(name, label, { bpm, roots, third, arp = 0, kick = 0, hat = 0, bass = 0, vinyl = 0, riser = 0, lp = 9000, vol = 1 }) {
  if (has(name)) return;
  const b = 60 / bpm, idx = 'mod(floor(t/4),4)';
  const r = `if(eq(${idx},0),${roots[0]},if(eq(${idx},1),${roots[1]},if(eq(${idx},2),${roots[2]},${roots[3]})))`;
  const pad = `(sin(2*PI*${r}*t)+0.55*sin(2*PI*1.5*${r}*t)+0.4*sin(2*PI*2*${r}*t)+0.3*sin(2*PI*2*${third}*${r}*t))*(0.35+0.2*sin(2*PI*mod(t,4)/4*0.5))*0.22`;
  const bt = `mod(t,${b})`, sd = b / 2, s4 = `mod(floor(t/${sd}),4)`;
  const m = `if(eq(${s4},0),2,if(eq(${s4},1),2*${third},if(eq(${s4},2),3,2*${third})))`;
  let e = pad;
  if (arp) e += `+sin(2*PI*${r}*${m}*t)*exp(-mod(t,${sd})*18)*${0.12 * arp}`;
  if (kick) e += `+sin(2*PI*(55*${bt}-90*${bt}*${bt}))*exp(-${bt}*14)*${0.8 * kick}`;
  if (hat) e += `+${N}*exp(-mod(t+${sd},${b})*70)*0.10`;
  if (bass) e += `+sin(2*PI*0.5*${r}*t)*0.25*(0.6+0.4*sin(2*PI*t*2))`;
  if (vinyl) e += `+${N}*0.02`;
  if (riser) e += `+${N}*0.05*pow(mod(t,16)/16,2)`;
  synth(path.join(MUS, name + '.wav'), `(${e})*${vol}`, 64, `lowpass=f=${lp},alimiter=limit=0.9`);
  index.push({ id: name, cat: 'music', dur: 64, label });
}
bed('bed_chill', 'Chill (lo-fi, 75 bpm)', { bpm: 75, roots: P(146.83, 116.54, 174.61, 130.81), third: 1.189, arp: 0.8, kick: 0.55, vinyl: 1, lp: 4500, vol: 1.3 });
bed('bed_uplift', 'Uplift (major, 120 bpm)', { bpm: 120, roots: P(261.63, 196, 220, 174.61), third: 1.26, arp: 1, kick: 0.9, hat: 1, vol: 1.0 });
bed('bed_corporate', 'Corporate (90 bpm)', { bpm: 90, roots: P(146.83, 220, 123.47, 196), third: 1.26, arp: 1, kick: 0.5, hat: 1, vol: 1.1 });
bed('bed_tension', 'Tension (60 bpm)', { bpm: 60, roots: P(130.81, 103.83, 155.56, 116.54), third: 1.189, bass: 1, riser: 1, lp: 6000, vol: 1.1 });
bed('bed_epic', 'Epic (90 bpm)', { bpm: 90, roots: P(164.81, 130.81, 196, 146.83), third: 1.189, kick: 1, bass: 1, vol: 1.0 });
bed('bed_tech', 'Tech (120 bpm, plucks)', { bpm: 120, roots: P(196, 155.56, 233.08, 174.61), third: 1.189, arp: 1.5, kick: 0.8, hat: 1, bass: 1, vol: 0.95 });
bed('bed_warm', 'Warm (60 bpm, soft)', { bpm: 60, roots: P(174.61, 130.81, 196, 146.83), third: 1.26, arp: 0.6, bass: 1, lp: 5000, vol: 1.4 });
bed('bed_news', 'News (150 bpm)', { bpm: 150, roots: P(220, 164.81, 196, 146.83), third: 1.189, kick: 0.7, hat: 1, arp: 0.8, vol: 1.0 });

fs.writeFileSync(idxFile, JSON.stringify(index, null, 1));
const cats = {}; index.forEach(x => cats[x.cat] = (cats[x.cat] || 0) + 1);
console.log(index.length + ' items', JSON.stringify(cats));
