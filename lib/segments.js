// Per-segment recordings -> one combined presenter video + voice track (so the rest of the pipeline stays unchanged).
const fs = require('fs'), path = require('path');
const { spawnSync } = require('child_process');
const { run, probe, FORMATS } = require('./render');
const speakers = require('./speakers');
const { parseBlocksEx } = require('./script');

// the speaker of block i: chosen by hand, else the one given to its label in the script, else a person who is named like the label
function speakerOf(p, i, blocks) {
  const o = (p.seg || [])[i] || {};
  if (o.speakerId) return speakers.get(o.speakerId);
  const b = (blocks || parseBlocksEx(p.script || ''))[i], lab = b && b.label;
  if (!lab) return null;
  const id = (p.speakerMap || {})[lab];
  if (id) return speakers.get(id);
  return speakers.list().find(s => String(s.name || '').toLowerCase().replace(/\s+/g, ' ').trim() === lab) || null;
}

const hasAudio = f => /audio/.test(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type', '-of', 'csv=p=0', f], { encoding: 'utf8' }).stdout || '');

// every segment needs a speaker
function segmentProblems(p, count) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const sp = speakerOf(p, i);
    if (!sp) out.push(`Segment ${i + 1}: no speaker chosen.`);
  }
  return out;
}

async function assemble(dir, p, count) {
  const [W, H] = FORMATS[p.format || 'square'] || FORMATS.square;
  const times = []; const list = []; let t = 0;
  for (let i = 0; i < count; i++) {
    const s = (p.seg || [])[i] || {}, sp = speakerOf(p, i);
    if (!sp) throw new Error(`Segment ${i + 1}: choose a speaker.`);
    const video = s.videoFile ? path.join(dir, s.videoFile) : (sp.videoFile ? path.join(speakers.FILES, sp.videoFile) : null);
    const voice = s.voiceFile ? path.join(dir, s.voiceFile) : null;
    if (!video || !fs.existsSync(video)) throw new Error(`Segment ${i + 1}: no video. Upload one, or give ${sp.name} a default video on the Speakers page.`);
    if (!voice && !hasAudio(video)) throw new Error(`Segment ${i + 1}: the video has no sound and no voice file was added.`);
    const vd = await probe(video), T = voice ? await probe(voice) : vd;
    const out = path.join(dir, `seg_${i}.mp4`);
    const args = ['-y', '-loglevel', 'error', ...(voice && vd < T - 0.1 ? ['-stream_loop', '-1'] : []), '-i', video, ...(voice ? ['-i', voice] : []),
      '-vf', `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fps=30,format=yuv420p,setsar=1`,
      '-map', '0:v:0', '-map', voice ? '1:a:0' : '0:a:0', '-t', T.toFixed(3),
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-c:a', 'aac', '-ar', '44100', '-ac', '1', '-b:a', '160k', out];
    await run('ffmpeg', args);
    const d = await probe(out);
    times.push({ start: +t.toFixed(3), end: +(t + d).toFixed(3), speakerId: sp.id });
    t += d; list.push(`file 'seg_${i}.mp4'`);
  }
  fs.writeFileSync(path.join(dir, 'seg_list.txt'), list.join('\n') + '\n');
  await run('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', 'seg_list.txt', '-c', 'copy', 'presenter.mp4'], { cwd: dir });
  await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', 'presenter.mp4', '-vn', '-ac', '1', '-ar', '44100', 'voice.wav'], { cwd: dir });
  for (let i = 0; i < count; i++) { try { fs.unlinkSync(path.join(dir, `seg_${i}.mp4`)); } catch {} }
  return { segTimes: times, presenterFile: 'presenter.mp4', voiceFile: 'voice.wav', duration: +t.toFixed(2) };
}
// what is still missing before the segments can be joined (a person for each part, a video for each part)
function segmentReadiness(p) {
  const bl = parseBlocksEx(p.script || ''), out = [];
  bl.forEach((b, i) => {
    const sp = speakerOf(p, i, bl), s = (p.seg || [])[i] || {};
    if (!sp) { out.push(`Part ${i + 1}${b.label ? ' (' + b.label + ')' : ''}: choose who speaks.`); return; }
    const video = s.videoFile ? path.join(__dirname, '..', 'projects', p.id, s.videoFile) : (sp.videoFile ? path.join(speakers.FILES, sp.videoFile) : null);
    if (!video || !fs.existsSync(video)) out.push(`Part ${i + 1} (${sp.name}): add the video.`);
  });
  if (!bl.length) out.push('Add the script.');
  return out;
}
module.exports = { assemble, segmentProblems, speakerOf, segmentReadiness };
