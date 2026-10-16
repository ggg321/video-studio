// node tools/import_sfx.js "<folder with sub-folders of sounds>" [--apply]
// Replaces the sound effects of the platform (data/audio/sfx + the non-music part of data/audio/index.json) with a pack of the user.
// The sub-folders of the pack are sorted into the categories that the automatic sounds use (pop, whoosh, swish, click, tick, hit, drop, notify,
// sparkle, riser, glitch, ding, coin, buzz, stinger, shutter, type) and into one category per folder for choosing by hand.
// Every sound is trimmed (silence, a maximum length), made mono 44.1 kHz and brought to the same peak. The old sounds are kept in data/bak.
// Without --apply nothing is written: the plan is printed.
const fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..'), AUD = path.join(ROOT, 'data', 'audio'), SFX = path.join(AUD, 'sfx'), IDX = path.join(AUD, 'index.json');
const [, , src, ...flags] = process.argv, APPLY = flags.includes('--apply');
if (!src || !fs.existsSync(src)) { console.error('usage: node tools/import_sfx.js "<pack folder>" [--apply]'); process.exit(1); }

const MAXD = { pop: 0.7, whoosh: 2.4, swish: 1, click: 0.7, tick: 0.3, hit: 1.8, drop: 1.6, notify: 1.6, sparkle: 2.4, riser: 4, glitch: 1, ding: 1.8, coin: 2.5, buzz: 1.6, stinger: 2.6, shutter: 0.6, type: 1,
  win: 6, wheel: 4, chest: 4, slot: 6, fail: 3, fire: 3, balance: 4, bomb: 2.5, lightning: 2.5, other: 3 };
const prob = f => { const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], { encoding: 'utf8' }); return parseFloat(r.stdout) || 0; };
const nice = n => n.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim();

// which categories a sound belongs to: by its folder, its name and its length
function cats(folder, name, d) {
  const f = folder.toLowerCase(), n = name.toLowerCase(), out = [];
  if (d > 8 && !/slot|wheel/.test(f)) return out;                       // loops, music, rain: not effects
  if (f === 'whoosh') {
    if (/^win |respin/.test(n) || d > 2.6) { if (d <= 4) out.push('riser'); }
    else if (d <= 0.8) { out.push('swish'); if (/digital/.test(n)) out.push('glitch'); }
    else out.push('whoosh');
  } else if (f === 'button') {
    if (d <= 0.6) { out.push('pop'); if (d <= 0.2) out.push('tick'); }
    else if (d <= 1.3) out.push('ding'); else out.push('sparkle');
  } else if (f === 'mouse clicks' || f === 'other') {
    if (/backspace/.test(n)) out.push('type');
    else if (/aluminum/.test(n)) out.push('glitch');
    else if (/bomb/.test(n)) out.push('hit', 'bomb');
    else if (d <= 0.7) { out.push('click'); if (d <= 0.25) out.push('tick'); if (/03|05/.test(n)) out.push('shutter'); }
    else out.push('other');
  } else if (f === 'sms') { if (d <= 2.3) out.push('notify'); }
  else if (f === 'coin') { if (d <= 4) out.push('coin'); }
  else if (f === 'balance up') { out.push('balance'); if (d <= 1.6) out.push('ding'); }
  else if (f === 'win') { if (d <= 7) out.push('win'); if (d <= 2.6) out.push('stinger'); if (d <= 1.6) out.push('ding'); }
  else if (f === 'chest') { out.push('chest'); if (d <= 2.4) out.push('sparkle'); }
  else if (f === 'bomb') { out.push('hit', 'bomb'); }
  else if (f === 'lightning') { out.push('hit', 'lightning'); }
  else if (f === 'fire') { out.push('fire'); }
  else if (f === 'wheel') { if (d <= 1.6) out.push('drop'); if (d <= 5) out.push('wheel'); }
  else if (f === 'china slot sfx') { if (/reel stop/.test(n)) out.push('drop'); if (/gong|taiko hit/.test(n)) out.push('hit'); if (d <= 6) out.push('slot'); }
  else if (f === 'gameover fail') { out.push('fail'); if (d <= 2.1) out.push('buzz'); }
  return out;
}

// the files of the pack
const walk = d => fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }))
  .flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : (/\.(wav|mp3|m4a|ogg|flac)$/i.test(e.name) && !e.name.startsWith('.') ? [path.join(d, e.name)] : []));
const files = [];
for (const folder of fs.readdirSync(src)) {
  const dir = path.join(src, folder); if (!fs.statSync(dir).isDirectory()) continue;
  for (const full of walk(dir)) {            // a sound can sit in a folder of its own inside the sub-folder
    const f = path.basename(full), d = prob(full); if (!d) continue;
    for (const c of cats(folder, f, d)) files.push({ cat: c, full, folder, name: f, d });
  }
}
const byCat = {}; for (const x of files) (byCat[x.cat] = byCat[x.cat] || []).push(x);
console.log(Object.entries(byCat).map(([c, a]) => c + ':' + a.length).join('  '));
if (!APPLY) process.exit(0);

// the old sounds are put aside
const stamp = new Date().toISOString().slice(0, 10), bak = path.join(ROOT, 'data', 'bak', 'sfx_old_' + stamp);
fs.mkdirSync(bak, { recursive: true });
if (!fs.existsSync(path.join(bak, 'index.json'))) { fs.copyFileSync(IDX, path.join(bak, 'index.json')); fs.cpSync(SFX, path.join(bak, 'sfx'), { recursive: true }); }
const old = JSON.parse(fs.readFileSync(IDX, 'utf8')), music = old.filter(x => x.cat === 'music');
for (const f of fs.readdirSync(SFX)) if (/\.wav$/i.test(f)) fs.unlinkSync(path.join(SFX, f));
const tmp = path.join(ROOT, 'data', '_sfx_tmp'); fs.mkdirSync(tmp, { recursive: true });

const index = [...music]; let k = 0;
for (const [cat, list] of Object.entries(byCat)) {
  list.forEach((x, i) => {
    const id = cat + '_' + (i + 1), t1 = path.join(tmp, 't.wav'), out = path.join(SFX, id + '.wav'), max = MAXD[cat] || 3;
    let r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', x.full, '-ac', '1', '-ar', '44100', '-af', 'silenceremove=start_periods=1:start_threshold=-55dB:start_silence=0.01,atrim=0:' + max, t1]);
    if (r.status !== 0) { console.error('skip', x.name); return; }
    const d = prob(t1); if (d < 0.05) { console.error('empty', x.name); return; }
    const vd = spawnSync('ffmpeg', ['-v', 'info', '-i', t1, '-af', 'volumedetect', '-f', 'null', '-'], { encoding: 'utf8' }), m = (vd.stderr.match(/max_volume: (-?[\d.]+) dB/) || [])[1];
    const gain = m != null ? Math.min(24, -3 - parseFloat(m)) : 0, fo = Math.min(0.05, d / 4);
    r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', t1, '-af', `volume=${gain.toFixed(2)}dB,afade=t=out:st=${(d - fo).toFixed(3)}:d=${fo.toFixed(3)}`, '-c:a', 'pcm_s16le', out]);
    if (r.status !== 0) { console.error('failed', x.name); return; }
    index.push({ id, cat, dur: +d.toFixed(2), label: x.folder + ' · ' + nice(x.name) }); k++;
  });
}
fs.rmSync(tmp, { recursive: true, force: true });
fs.writeFileSync(IDX, JSON.stringify(index, null, 1));
console.log('written', k, 'sounds; old ones are in', path.relative(ROOT, bak));
