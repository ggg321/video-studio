// HeyGen: avatar video from an audio track (paid per generated minute; test mode is free and watermarked).
const BASE = process.env.HEYGEN_BASE || 'https://api.heygen.com';
const UPLOAD = process.env.HEYGEN_UPLOAD_BASE || 'https://upload.heygen.com';

async function call(key, url, opt = {}) {
  const r = await fetch(url, { ...opt, headers: { 'X-Api-Key': key, Accept: 'application/json', ...(opt.json ? { 'Content-Type': 'application/json' } : {}), ...(opt.headers || {}) }, body: opt.json ? JSON.stringify(opt.json) : opt.body });
  let j = null; try { j = await r.json(); } catch {}
  const msg = j && (j.message || (j.error && (j.error.message || j.error.code || (typeof j.error === 'string' ? j.error : '')))) || '';
  if (r.status === 401 || r.status === 403) throw new Error('HeyGen rejected the API key (' + r.status + '). Check it in Settings.');
  if (r.status === 429) throw new Error('HeyGen: too many requests, try again in a minute.');
  if (!r.ok || (j && j.error && !j.data)) throw new Error('HeyGen error ' + r.status + (msg ? ': ' + msg : ''));
  return j;
}

async function avatars(key) {
  const j = await call(key, BASE + '/v2/avatars');
  const d = j.data || {};
  return (d.avatars || []).map(a => ({ id: a.avatar_id, name: a.avatar_name, gender: a.gender, preview: a.preview_image_url || '' }));
}
async function quota(key) {
  try { const j = await call(key, BASE + '/v2/user/remaining_quota'); const d = j.data || {}; return d.remaining_quota != null ? d.remaining_quota : null; } catch { return null; }
}
// raw audio upload -> asset id (HeyGen cannot read local files, so the audio goes to its asset store first)
async function uploadAudio(key, buffer, type = 'audio/mpeg') {
  const j = await call(key, UPLOAD + '/v1/asset', { method: 'POST', headers: { 'Content-Type': type }, body: buffer });
  const id = j.data && (j.data.id || j.data.asset_id);
  if (!id) throw new Error('HeyGen did not return an asset id for the audio.');
  return id;
}
async function generate(key, { avatarId, assetId, width, height, test, title }) {
  const j = await call(key, BASE + '/v2/video/generate', { method: 'POST', json: {
    title: String(title || 'Video Studio').slice(0, 100), test: !!test, caption: false, dimension: { width, height },
    video_inputs: [{ character: { type: 'avatar', avatar_id: avatarId, avatar_style: 'normal' }, voice: { type: 'audio', audio_asset_id: assetId } }] } });
  const id = j.data && j.data.video_id;
  if (!id) throw new Error('HeyGen did not return a video id.');
  return id;
}
async function status(key, videoId) {
  const j = await call(key, BASE + '/v1/video_status.get?video_id=' + encodeURIComponent(videoId));
  const d = j.data || {};
  return { status: d.status, url: d.video_url, error: d.error && (d.error.message || d.error.detail || JSON.stringify(d.error)) };
}
async function download(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error('Could not download the HeyGen video (' + r.status + ').');
  return Buffer.from(await r.arrayBuffer());
}
module.exports = { avatars, quota, uploadAudio, generate, status, download };
