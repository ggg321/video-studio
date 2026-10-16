// Free stock video search (Pexels + Pixabay). Needs free API keys saved in Instellingen.
const fs = require('fs'), path = require('path');

async function pexels(q, key, portrait) {
  const u = `${process.env.PEXELS_API || 'https://api.pexels.com'}/videos/search?query=${encodeURIComponent(q)}&per_page=8${portrait ? '&orientation=portrait' : ''}`;
  const r = await fetch(u, { headers: { Authorization: key } });
  if (!r.ok) throw new Error('Pexels ' + r.status);
  const j = await r.json();
  return (j.videos || []).map(v => {
    const files = (v.video_files || []).filter(f => f.file_type === 'video/mp4').sort((a, b) => Math.abs(a.width - 1080) - Math.abs(b.width - 1080));
    return files[0] ? { source: 'pexels', id: 'px' + v.id, thumb: v.image, url: files[0].link, dur: v.duration, w: files[0].width, h: files[0].height, page: v.url } : null;
  }).filter(Boolean);
}

async function pixabay(q, key) {
  const u = `${process.env.PIXABAY_API || 'https://pixabay.com'}/api/videos/?key=${encodeURIComponent(key)}&q=${encodeURIComponent(q)}&per_page=8`;
  const r = await fetch(u);
  if (!r.ok) throw new Error('Pixabay ' + r.status);
  const j = await r.json();
  return (j.hits || []).map(h => {
    const v = h.videos.medium || h.videos.large || h.videos.small;
    return v && v.url ? { source: 'pixabay', id: 'pb' + h.id, thumb: `https://i.vimeocdn.com/video/${h.picture_id}_640x360.jpg`, url: v.url, dur: h.duration, w: v.width, h: v.height, page: h.pageURL } : null;
  }).filter(Boolean);
}

async function search(q, s, portrait) {
  const out = [], errs = [];
  if (s.pexelsKey) { try { out.push(...await pexels(q, s.pexelsKey, portrait)); } catch (e) { errs.push(e.message); } }
  if (s.pixabayKey) { try { out.push(...await pixabay(q, s.pixabayKey)); } catch (e) { errs.push(e.message); } }
  if (!s.pexelsKey && !s.pixabayKey) throw new Error('No stock API key set (Settings).');
  if (!out.length && errs.length) throw new Error(errs.join('; '));
  return out;
}

async function download(item, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  const file = item.id + '.mp4', dest = path.join(destDir, file);
  if (!fs.existsSync(dest)) {
    const r = await fetch(item.url);
    if (!r.ok) throw new Error('Download ' + r.status);
    fs.writeFileSync(dest, Buffer.from(await r.arrayBuffer()));
  }
  return file;
}
module.exports = { search, download };
