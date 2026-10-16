// ElevenLabs text-to-speech (paid per character). Uses the user's own voices; no voice cloning here.
const BASE = process.env.ELEVEN_BASE || 'https://api.elevenlabs.io/v1';
const MODELS = [
  { id: 'eleven_multilingual_v2', label: 'Multilingual v2 (best quality, 29 languages)' },
  { id: 'eleven_turbo_v2_5', label: 'Turbo v2.5 (faster, half price, 32 languages)' },
  { id: 'eleven_flash_v2_5', label: 'Flash v2.5 (fastest, half price)' }
];
const MAX_CHARS = 4500;   // per request; longer texts are cut at sentence/paragraph boundaries

async function req(key, path, opt = {}) {
  const r = await fetch(BASE + path, { ...opt, headers: { 'xi-api-key': key, ...(opt.json ? { 'Content-Type': 'application/json' } : {}), ...(opt.headers || {}) }, body: opt.json ? JSON.stringify(opt.json) : opt.body });
  if (r.ok) return r;
  let detail = ''; try { const j = await r.json(); detail = (j.detail && (j.detail.message || j.detail.status || (typeof j.detail === 'string' ? j.detail : ''))) || ''; } catch {}
  if (r.status === 401 && /quota/i.test(detail)) throw new Error('ElevenLabs: not enough characters left in your plan.');
  if (r.status === 401) throw new Error('ElevenLabs rejected the API key (401). Check it in Settings.');
  if (r.status === 402 || /quota/i.test(detail)) throw new Error('ElevenLabs: not enough characters left in your plan.');
  if (r.status === 404 && /voice/i.test(detail)) throw new Error('ElevenLabs: this voice is not available in your account.');
  if (r.status === 429) throw new Error('ElevenLabs: too many requests, try again in a minute.');
  throw new Error('ElevenLabs error ' + r.status + (detail ? ': ' + detail : ''));
}

async function voices(key) {
  const j = await (await req(key, '/voices')).json();
  return (j.voices || []).map(v => ({ id: v.voice_id, name: v.name, category: v.category, labels: v.labels || {}, preview: v.preview_url || '' }))
    .sort((a, b) => (a.category === b.category ? a.name.localeCompare(b.name) : a.category === 'premade' ? 1 : -1));
}
async function subscription(key) {
  const j = await (await req(key, '/user/subscription')).json();
  return { used: j.character_count, limit: j.character_limit, remaining: Math.max(0, (j.character_limit || 0) - (j.character_count || 0)), tier: j.tier, resetsAt: j.next_character_count_reset_unix };
}

// split into <= MAX_CHARS pieces at paragraph / sentence ends
function chunkText(text) {
  const out = []; let cur = '';
  const push = s => { if (cur && (cur + s).length > MAX_CHARS) { out.push(cur.trim()); cur = ''; } cur += s; };
  for (const para of String(text).split(/\n{2,}/)) {
    for (const sent of (para.match(/[^.!?…]+[.!?…]*\s*/g) || [para])) push(sent);
    cur += '\n\n';
  }
  if (cur.trim()) out.push(cur.trim());
  return out.filter(Boolean);
}
// returns an array of mp3 Buffers (one per chunk)
async function tts(key, { voiceId, text, model = 'eleven_multilingual_v2', stability = 0.5, similarity = 0.75 }) {
  const parts = [];
  for (const piece of chunkText(text)) {
    const r = await req(key, `/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, { method: 'POST', json: { text: piece, model_id: model, voice_settings: { stability, similarity_boost: similarity } }, headers: { Accept: 'audio/mpeg' } });
    parts.push(Buffer.from(await r.arrayBuffer()));
  }
  return parts;
}
module.exports = { voices, subscription, tts, chunkText, MODELS };
