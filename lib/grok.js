// Grok (xAI) as a source of insert clips: bulk import by file name (scene_07 / hook) and, with an xAI key, paid generation for the gaps.
// Paid generation always goes through a cost check and a separate confirmation (token) first.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const API = () => (process.env.XAI_API || 'https://api.x.ai').replace(/\/$/, '');
const MODEL = process.env.GROK_VIDEO_MODEL || 'grok-imagine-video-1.5';
// approximate USD per second of video (xAI preview pricing at the time of writing: check your xAI account)
const RATE = { '480p': 0.08, '720p': 0.14, '1080p': 0.25 };
const DEFAULT_STYLE = 'Photorealistic cinematic footage, natural lighting, shallow depth of field, smooth slow camera movement.';

const aspectFor = f => { f = String(f || ''); return f.startsWith('vertical') ? '9:16' : f.startsWith('landscape') ? '16:9' : f.startsWith('portrait') ? '3:4' : '1:1'; };
const secondsFor = c => Math.max(3, Math.min(8, Math.ceil((c.end - c.start) + 0.5)));
const estimate = (items, res) => +(items.reduce((a, x) => a + x.seconds, 0) * (RATE[res] || RATE['720p'])).toFixed(2);

// "scene_07.mp4" -> 7, "hook.mp4" -> 'hook' (the opening slot); anything else -> null
function parseScene(name) {
  const b = String(name).replace(/\.[^.]+$/, '').toLowerCase();
  if (/(^|[^a-zа-яіїє])(hook|intro|opening|хук|начало|початок)([^a-zа-яіїє]|$)/.test(b)) return 'hook';
  const m = b.match(/(?:scene|sc|s|сцена|сцен|#)[ _.-]?0*(\d{1,3})(?!\d)/) || b.match(/^0*(\d{1,3})(?:[^\d]|$)/) || b.match(/[ _.-]0*(\d{1,3})(?:\s*\(\d+\))?$/);
  return m ? +m[1] : null;
}

const tokens = new Map();
function newToken(data) { const t = crypto.randomBytes(8).toString('hex'); tokens.set(t, { ...data, at: Date.now() }); for (const [k, v] of tokens) if (Date.now() - v.at > 20 * 60000) tokens.delete(k); return t; }
const takeToken = t => { const v = tokens.get(t); tokens.delete(t); return v && Date.now() - v.at < 20 * 60000 ? v : null; };

async function xai(key, method, url, body) {
  const r = await fetch(API() + url, { method, headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(60000) });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 || r.status === 403) { const e = new Error('xAI rejected the API key (' + r.status + '). Check it in Settings.'); e.fatal = true; throw e; }
  if (r.status === 402 || r.status === 429) { const e = new Error(r.status === 402 ? 'xAI says the account has no credit left.' : 'xAI: too many requests, try again in a minute.'); e.fatal = r.status === 402; e.retry = r.status === 429; throw e; }
  if (!r.ok) throw new Error('xAI error ' + r.status + (j.error ? ': ' + (j.error.message || j.error) : ''));
  return j;
}
// one clip: start, poll, download. Resolves with the file path.
async function generateOne(key, item, opts, dest) {
  let start; for (let k = 0; k < 3; k++) { try { start = await xai(key, 'POST', '/v1/videos/generations', { model: MODEL, prompt: item.prompt, duration: item.seconds, aspect_ratio: opts.aspect, resolution: opts.res, generate_audio: false }); break; } catch (e) { if (!e.retry || k === 2) throw e; await new Promise(r => setTimeout(r, 15000)); } }
  if (!start || !start.request_id) throw new Error('xAI did not return a request id.');
  const t0 = Date.now(); let st;
  while (Date.now() - t0 < 8 * 60000) {
    await new Promise(r => setTimeout(r, opts.poll || 4000));
    st = await xai(key, 'GET', '/v1/videos/' + start.request_id);
    if (st.status === 'done') break;
    if (st.status === 'failed' || st.status === 'expired') throw new Error('xAI could not make this clip (' + st.status + ').');
  }
  if (!st || st.status !== 'done' || !st.video || !st.video.url) throw new Error('The clip was not ready in time.');
  if (st.video.respect_moderation === false) throw new Error('xAI moderation blocked this clip.');
  const r = await fetch(st.video.url, { signal: AbortSignal.timeout(120000) });
  if (!r.ok) throw new Error('Could not download the clip (' + r.status + ').');
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length < 10000) throw new Error('The downloaded clip is empty.');
  fs.writeFileSync(dest, buf); return dest;
}
module.exports = { MODEL, RATE, DEFAULT_STYLE, aspectFor, secondsFor, estimate, parseScene, newToken, takeToken, generateOne };
