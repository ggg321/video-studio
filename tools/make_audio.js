// Generates a local, license-free SFX pack and music beds with ffmpeg synthesis.
// Run: node tools/make_audio.js
const { spawnSync } = require('child_process');
const fs = require('fs'), path = require('path');
const OUT = path.join(__dirname, '..', 'data', 'audio');
const SFX = path.join(OUT, 'sfx'), MUS = path.join(OUT, 'music');
fs.mkdirSync(SFX, { recursive: true }); fs.mkdirSync(MUS, { recursive: true });

function synth(file, expr, d, af = '') {
  const args = ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', `aevalsrc='${expr}':d=${d}:s=44100`];
  const chain = [af, `afade=t=in:d=0.004`, `afade=t=out:st=${Math.max(0, d - 0.03)}:d=0.03`].concat(['alimiter=limit=0.8:level=0']).filter(Boolean).join(',');
  args.push('-af', chain, '-ar', '44100', file);
  const r = spawnSync('ffmpeg', args, { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(file + ': ' + r.stderr.slice(-400));
}
const N = '(random(0)*2-1)';
const index = [];
function add(cat, name, expr, d, af, label) {
  const f = path.join(SFX, name + '.wav'); synth(f, expr, d, af);
  index.push({ id: name, cat, dur: d, label: label || name });
}

// whooshes (transitions / insert starts)
[[0.55, 2500, 0.55], [0.7, 4000, 0.45], [0.45, 6000, 0.6], [0.9, 3000, 0.4], [0.35, 7000, 0.5], [0.65, 1800, 0.5]].forEach(([d, lp, k], i) =>
  add('whoosh', `whoosh_${i + 1}`, `${N}*pow(sin(PI*pow(t/${d},${k})),2)*0.8`, d, `highpass=f=250,lowpass=f=${lp},volume=1.4`, `Whoosh ${i + 1}`));
// swishes (short, for zoom punch-ins)
[[0.22, 5000], [0.28, 3500], [0.18, 7000], [0.3, 2500]].forEach(([d, lp], i) =>
  add('swish', `swish_${i + 1}`, `${N}*pow(sin(PI*t/${d}),2)*0.8`, d, `highpass=f=600,lowpass=f=${lp},volume=1.3`, `Swish ${i + 1}`));
// pops / UI blips (cards and plates)
[[900, 1800, 28], [1200, 2600, 34], [700, 1200, 22], [1500, 3000, 40], [500, 900, 18]].forEach(([f0, sl, k], i) =>
  add('pop', `pop_${i + 1}`, `sin(2*PI*(${f0}*t-${sl}*t*t))*exp(-t*${k})*0.9`, 0.2, '', `Pop ${i + 1}`));
// ticks / clicks (word emphasis, counters)
[[2000, 300], [3500, 420], [1500, 250], [5000, 500]].forEach(([hp, k], i) =>
  add('tick', `tick_${i + 1}`, `${N}*exp(-t*${k})`, 0.06, `highpass=f=${hp},volume=1.5`, `Tick ${i + 1}`));
// dings / success chimes
[[1320, 5], [1760, 6], [988, 4], [1568, 7]].forEach(([f, k], i) =>
  add('ding', `ding_${i + 1}`, `(sin(2*PI*${f}*t)+0.4*sin(2*PI*${f * 2}*t)+0.2*sin(2*PI*${f * 3}*t))*exp(-t*${k})*0.35`, 1.2, '', `Ding ${i + 1}`));
// hits / impacts (hook, big statements)
[[90, 60, 7], [70, 45, 6], [110, 80, 9], [60, 30, 5]].forEach(([f0, sl, k], i) =>
  add('hit', `hit_${i + 1}`, `sin(2*PI*(${f0}*t-${sl}*t*t))*exp(-t*${k})*0.95+${N}*exp(-t*45)*0.35`, 0.9, `lowpass=f=5000`, `Hit ${i + 1}`));
// risers (build-up before a reveal)
[[1.2, 200, 300], [1.8, 150, 400], [0.9, 300, 500]].forEach(([d, f0, sl], i) =>
  add('riser', `riser_${i + 1}`, `(${N}*0.35+sin(2*PI*(${f0}*t+${sl}*t*t))*0.45)*pow(t/${d},2)`, d, 'lowpass=f=9000', `Riser ${i + 1}`));
// glitches
[[40, 8], [70, 12]].forEach(([r, k], i) =>
  add('glitch', `glitch_${i + 1}`, `${N}*lt(mod(t*${r},1),0.45)*exp(-t*${k})*0.8`, 0.35, 'highpass=f=800', `Glitch ${i + 1}`));

// ---- music beds (64 s each = 128 beats at 120 bpm, loops cleanly) ----
const roots = arr => `if(eq(idx,0),${arr[0]},if(eq(idx,1),${arr[1]},if(eq(idx,2),${arr[2]},${arr[3]})))`;
function bed(name, label, rootsArr, { kick, hat, bass, vol }) {
  const idx = 'mod(floor(t/4),4)', r = roots(rootsArr).replace(/idx/g, idx);
  const pad = `(sin(2*PI*${r}*t)+0.55*sin(2*PI*1.5*${r}*t)+0.4*sin(2*PI*2*${r}*t)+0.25*sin(2*PI*2.52*${r}*t))*(0.35+0.2*sin(2*PI*mod(t,4)/4*0.5))*0.22`;
  const bt = 'mod(t,0.5)';
  const k = kick ? `+sin(2*PI*(55*${bt}-90*${bt}*${bt}))*exp(-${bt}*14)*0.8` : '';
  const h = hat ? `+${N}*exp(-mod(t+0.25,0.5)*70)*0.10` : '';
  const b = bass ? `+sin(2*PI*0.5*${r}*t)*0.25*(0.6+0.4*sin(2*PI*t*2))` : '';
  const expr = `(${pad}${k}${h}${b})*${vol}`;
  const f = path.join(MUS, name + '.wav');
  synth(f, expr, 64, 'lowpass=f=9000,alimiter=limit=0.9');
  index.push({ id: name, cat: 'music', dur: 64, label });
}
bed('bed_calm', 'Calm (pad)', [220, 174.61, 261.63, 196], { kick: false, hat: false, bass: false, vol: 1.6 });
bed('bed_pulse', 'Pulse (120 bpm)', [220, 174.61, 261.63, 196], { kick: true, hat: true, bass: false, vol: 1.1 });
bed('bed_drive', 'Drive (bass + beat)', [146.83, 116.54, 174.61, 130.81], { kick: true, hat: true, bass: true, vol: 1.0 });

fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(index, null, 1));
console.log(index.length + ' files');
