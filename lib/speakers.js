// Local list of speakers (people who appear / whose voice is used). Reused across projects; consent is stored once per person.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const FILE = path.join(ROOT, 'data', 'speakers.json');
const FILES = path.join(ROOT, 'data', 'speakers', 'files');
fs.mkdirSync(FILES, { recursive: true });

const load = () => { try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return []; } };
const save = l => fs.writeFileSync(FILE, JSON.stringify(l, null, 1));
const COLORS = ['#ff3b30', '#ffd60a', '#32d74b', '#0a84ff', '#bf5af2', '#ff9f0a', '#64d2ff'];

const list = () => load();
const get = id => load().find(s => s.id === id) || null;

function upsert(b) {
  const l = load();
  let s = b.id && l.find(x => x.id === b.id);
  if (!s) { s = { id: 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), created: Date.now() }; l.push(s); s.color = COLORS[(l.length - 1) % COLORS.length]; }
  if (b.name !== undefined) s.name = String(b.name).trim().slice(0, 60) || 'Speaker';
  if (b.color !== undefined && /^#[0-9a-f]{6}$/i.test(b.color)) s.color = b.color;
  if (b.notes !== undefined) s.notes = String(b.notes).slice(0, 300);
  if (b.elevenVoiceId !== undefined) s.elevenVoiceId = String(b.elevenVoiceId).slice(0, 80);
  if (b.elevenVoiceName !== undefined) s.elevenVoiceName = String(b.elevenVoiceName).slice(0, 80);
  if (b.heygenAvatarId !== undefined) s.heygenAvatarId = String(b.heygenAvatarId).slice(0, 80);
  if (b.ttsVoice !== undefined) s.ttsVoice = String(b.ttsVoice).slice(0, 60);
  if (b.consent) {
    const was = !!(s.consent && s.consent.confirmed);
    s.consent = { confirmed: !!b.consent.confirmed, note: String(b.consent.note || '').slice(0, 200), at: was === !!b.consent.confirmed && s.consent ? s.consent.at : Date.now() };
  }
  save(l); return s;
}
function remove(id) {
  const s = get(id); if (!s) return false;
  if (s.videoFile) { try { fs.unlinkSync(path.join(FILES, s.videoFile)); } catch {} }
  save(load().filter(x => x.id !== id)); return true;
}
function setVideo(id, filename) {
  const l = load(), s = l.find(x => x.id === id); if (!s) return null;
  if (s.videoFile && s.videoFile !== filename) { try { fs.unlinkSync(path.join(FILES, s.videoFile)); } catch {} }
  s.videoFile = filename; save(l); return s;
}
module.exports = { list, get, upsert, remove, setVideo, FILES };
