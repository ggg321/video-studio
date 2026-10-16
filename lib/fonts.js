// Font catalog (data/fonts.json, built by tools/buildfonts.py) and the folder libass reads fonts from.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const CACHE = path.join(ROOT, 'data', 'fontcache');
const list = () => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'fonts.json'), 'utf8')); } catch { return []; } };
// ffmpeg filter option value, e.g. 'C\:/Users/me/VideoStudio/data/fontcache' (colon escaped, quoted)
const fontsDirOpt = () => "'" + CACHE.replace(/\\/g, '/').replace(':', '\\:') + "'";
// Is this label a font we ship? (used to validate user choice)
const has = label => list().some(f => f.label === label);
module.exports = { list, CACHE, fontsDirOpt, has };
