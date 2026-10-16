// node make_caption.js <component> <projectDir> <outDir> [W H from to]
// Builds a HyperFrames project from a catalog caption component, fills it with the words of one of our projects and renders a transparent overlay (WebM).
const fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');
const [, , comp, pdir, outDir, W = 720, H = 1280, from = 0, to = 12] = process.argv;
const HF = __dirname, tpl = path.join(HF, 'trial', 'compositions', 'components', comp + '.html');
if (!fs.existsSync(tpl)) { console.error('no component ' + comp + ' in trial/ (run: hyperframes add ' + comp + ')'); process.exit(1); }
const p = JSON.parse(fs.readFileSync(path.join(pdir, 'project.json'), 'utf8'));
const typo = require(path.join(HF, '..', 'lib', 'typo.js'));
const kw = typo.plan(pdir, { ...p, typo: {} }).keywords;
const words = (p.words || []).filter(w => w.start >= +from && w.end <= +to).map(w => ({ text: w.w, start: +(w.start - from).toFixed(2), end: +(w.end - from).toFixed(2) }));
const keys = words.map((w, i) => (kw.some(k => Math.abs(k.start - (w.start + +from)) < 0.2) ? i : -1)).filter(i => i >= 0);
const dur = +(+to - +from).toFixed(2), k = W / 1920;
let h = fs.readFileSync(tpl, 'utf8');
h = h.replace(/var WORDS = \[[\s\S]*?\n {8}\];/, () => 'var WORDS = ' + JSON.stringify(words) + ';');
h = h.replace(/var KEYWORDS = new Set\(\[[^\]]*\]\);/, () => 'var KEYWORDS = new Set(' + JSON.stringify(keys) + ');');
h = h.replace(/width=1920, height=1080/g, `width=${W}, height=${H}`).replace(/width: 1920px;/g, `width: ${W}px;`).replace(/height: 1080px;/g, `height: ${H}px;`)
  .replace(/data-width="1920"/, `data-width="${W}"`).replace(/data-height="1080"/, `data-height="${H}"`).replace(/data-duration="8"/, `data-duration="${dur}"`)
  .replace(/fitFontSize\(([^,]+), 220, "400", ("[^"]*"|'[^']*'|[^,]+), 1720\)/, (m, a, b) => `fitFontSize(${a}, ${Math.round(220 * k)}, "400", ${b}, ${Math.round(1720 * k)})`);
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'index.html'), h);
fs.writeFileSync(path.join(outDir, 'hyperframes.json'), fs.readFileSync(path.join(HF, 'trial', 'hyperframes.json')));
fs.writeFileSync(path.join(outDir, 'package.json'), '{"name":"cap","private":true}');
console.log('words', words.length, 'keys', keys.length, 'dur', dur);
