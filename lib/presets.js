// Niche presets: one bundle of look-and-feel settings that new creatives of a niche start with.
// Stored in niche.defaults.preset; the old flat defaults (subStyle, transition, accent, music) still count.
const SIMPLE = ['subStyle', 'font', 'accent', 'transition', 'capX', 'capY', 'capScale', 'capPx', 'capLines', 'enhance', 'upscale', 'matching', 'lipsyncMode', 'cutsMode', 'clips', 'cardsOn', 'format', 'lang', 'emojiOn', 'emojiScale', 'emojiPos', 'band', 'overlays', 'fx', 'transDur'];
const AUDIO = ['music', 'musicVol', 'musicOn', 'sfxOn', 'sfxStyle'];

function snapshot(p) {
  const out = {};
  for (const k of SIMPLE) if (p[k] !== undefined && p[k] !== '') out[k] = p[k];
  if (out.band) out.band = { ...out.band, image: '' };
  if (out.overlays) out.overlays = { ...out.overlays, logo: { ...(out.overlays.logo || {}), file: '', on: false } };
  if (Array.isArray(p.exports) && p.exports.length) out.exports = p.exports.slice();
  const a = p.audio || {}, au = {};
  for (const k of AUDIO) if (a[k] !== undefined) au[k] = a[k];
  if (Object.keys(au).length) out.audio = au;
  return out;
}

// preset of a niche = legacy flat defaults + explicit preset
function ofNiche(n) {
  const d = (n && n.defaults) || {}, out = {};
  for (const k of ['subStyle', 'transition', 'accent']) if (d[k]) out[k] = d[k];
  if (d.music) out.audio = { music: d.music };
  const pr = d.preset || {};
  const res = { ...out, ...pr };
  if (out.audio || pr.audio) res.audio = { ...(out.audio || {}), ...(pr.audio || {}) };
  return res;
}

// apply to a project; opts.keep = list of keys to leave alone (e.g. ['format'] when a task fixes the format)
function apply(p, preset, opts = {}) {
  const keep = new Set(opts.keep || []);
  for (const k of SIMPLE) if (preset[k] !== undefined && !keep.has(k)) p[k] = preset[k];
  if (preset.exports && !keep.has('exports')) p.exports = preset.exports.slice();
  if (preset.audio) {
    const a = p.audio || { sfx: [], musicVol: 0.18 };
    p.audio = { ...a, sfx: a.sfx || [], musicOn: true, sfxOn: true, ...preset.audio, musicVol: preset.audio.musicVol ?? a.musicVol ?? 0.18 };
  }
  return p;
}

// short human summary for the UI
function describe(preset) {
  const a = preset.audio || {};
  return {
    subStyle: preset.subStyle || null, font: preset.font || null, transition: preset.transition || null,
    music: a.music || null, sfxStyle: a.sfxStyle || null, format: preset.format || null, exports: preset.exports || [],
    count: Object.keys(preset).length
  };
}
module.exports = { snapshot, ofNiche, apply, describe, SIMPLE, AUDIO };
