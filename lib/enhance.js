// Presenter-video enhancement: light ffmpeg clean-up (always available) + optional Real-ESRGAN AI upscale (ncnn-vulkan binary).
const fs = require('fs'), path = require('path');
const { run } = require('./render');
const EXE = require('./platform').ESRGAN;
const available = () => fs.existsSync(EXE);

// ffmpeg filter chain: gentle denoise, sharpen, slight contrast/saturation
const LIGHT = 'hqdn3d=2:1.5:3:3,unsharp=5:5:0.7:5:5:0.0,eq=contrast=1.04:saturation=1.08';

// AI upscale of the presenter video (x2), result cached as presenter_up.mp4
async function upscale(dir, srcFile, onProgress) {
  const out = path.join(dir, 'presenter_up.mp4');
  if (fs.existsSync(out)) return out;
  const fr = path.join(dir, 'frames_in'), up = path.join(dir, 'frames_out');
  for (const d of [fr, up]) { fs.rmSync(d, { recursive: true, force: true }); fs.mkdirSync(d); }
  await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', path.join(dir, srcFile), '-qscale:v', '2', path.join(fr, 'f%05d.jpg')]);
  const n = fs.readdirSync(fr).length;
  const tick = setInterval(() => onProgress && onProgress(Math.min(0.95, fs.readdirSync(up).length / n)), 2000);
  try { await run(EXE, ['-i', fr, '-o', up, '-n', 'realesr-animevideov3', '-s', '2', '-f', 'jpg'], { cwd: path.dirname(EXE) }); }
  finally { clearInterval(tick); }
  await run('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '30', '-i', path.join(up, 'f%05d.jpg'), '-i', path.join(dir, srcFile),
    '-map', '0:v', '-map', '1:a?', '-c:v', 'libx264', '-crf', '17', '-pix_fmt', 'yuv420p', '-c:a', 'copy', '-shortest', out]);
  fs.rmSync(fr, { recursive: true, force: true }); fs.rmSync(up, { recursive: true, force: true });
  return out;
}
module.exports = { LIGHT, available, upscale };
