// More news-style music beds (64 s, seamless). Appends to data/audio/index.json.
// Run: node tools/make_audio3.js   (after make_audio.js and make_audio2.js)
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
const P = (...a) => a;
function bed(name, label, { bpm, roots, third, arp = 0, kick = 0, hat = 0, bass = 0, vinyl = 0, riser = 0, pulse = 0, tick = 0, clap = 0, lp = 9000, vol = 1 }) {
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
  if (pulse) e += `+sin(2*PI*2*${r}*t)*exp(-mod(t,${sd})*22)*${0.16 * pulse}+sin(2*PI*3*${r}*t)*exp(-mod(t,${sd})*30)*${0.08 * pulse}`;
  if (tick) e += `+${N}*exp(-mod(t,${b / 4})*170)*${0.07 * tick}`;
  if (clap) e += `+${N}*exp(-mod(t+${b},${2 * b})*30)*${0.12 * clap}`;
  if (riser) e += `+${N}*0.05*pow(mod(t,16)/16,2)`;
  synth(path.join(MUS, name + '.wav'), `(${e})*${vol}`, 64, `lowpass=f=${lp},alimiter=limit=0.9`);
  index.push({ id: name, cat: 'music', dur: 64, label });
}
bed('bed_news_urgent', 'News · Urgent (135 bpm, pulse)', { bpm: 135, roots: P(220, 164.81, 196, 146.83), third: 1.189, pulse: 1, kick: 0.8, hat: 1, riser: 1, vol: 1.0 });
bed('bed_news_studio', 'News · Studio (105 bpm)', { bpm: 105, roots: P(196, 146.83, 220, 164.81), third: 1.26, arp: 1.3, kick: 0.5, hat: 1, pulse: 0.5, vol: 1.05 });
bed('bed_news_breaking', 'News · Breaking (165 bpm, ticks)', { bpm: 165, roots: P(185, 138.59, 164.81, 123.47), third: 1.189, tick: 1, pulse: 0.8, kick: 0.9, riser: 1, bass: 1, vol: 0.95 });
bed('bed_news_report', 'News · Report (90 bpm, serious)', { bpm: 90, roots: P(130.81, 116.54, 146.83, 98), third: 1.189, bass: 1, arp: 0.7, tick: 0.5, lp: 6500, vol: 1.1 });
bed('bed_news_sport', 'News · Sports (120 bpm, drive)', { bpm: 120, roots: P(261.63, 196, 233.08, 174.61), third: 1.26, kick: 1, clap: 1, hat: 1, arp: 1, vol: 1.0 });
bed('bed_news_evening', 'News · Evening (75 bpm, warm)', { bpm: 75, roots: P(174.61, 130.81, 155.56, 146.83), third: 1.26, arp: 0.8, bass: 1, kick: 0.3, lp: 5500, vol: 1.3 });

fs.writeFileSync(idxFile, JSON.stringify(index, null, 1));
const cats = {}; index.forEach(x => cats[x.cat] = (cats[x.cat] || 0) + 1);
console.log(index.length + ' items', JSON.stringify(cats));
