// Everything that differs between Windows and macOS (and Linux) in one place.
const fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..');
const WIN = process.platform === 'win32', MAC = process.platform === 'darwin';

// python of the project's virtual environment (tools/*.py)
const PY = path.join(ROOT, '.venv', WIN ? 'Scripts' : 'bin', WIN ? 'python.exe' : 'python');

// speech recognition: whisper.cpp. On Windows the prebuilt folder in tools/whisper; on macOS `brew install whisper-cpp` (binary whisper-cli) and a model file in tools/whisper
const WHISPER_DIR = path.join(ROOT, 'tools', 'whisper');
const WHISPER_MODEL = path.join(WHISPER_DIR, 'ggml-large-v3-turbo-q5_0.bin');
function whisperExe() {
  if (WIN) { const p = path.join(WHISPER_DIR, 'Release', 'whisper-cli.exe'); return fs.existsSync(p) ? p : null; }
  for (const d of (process.env.PATH || '').split(path.delimiter).concat(['/opt/homebrew/bin', '/usr/local/bin']))
    for (const n of ['whisper-cli', 'whisper-cpp']) { const p = path.join(d, n); if (d && fs.existsSync(p)) return p; }
  return null;
}

// real-esrgan upscaler (optional)
const ESRGAN = path.join(ROOT, 'tools', 'realesrgan', WIN ? 'realesrgan-ncnn-vulkan.exe' : 'realesrgan-ncnn-vulkan');

// installed Chrome / Edge for Remotion and HyperFrames rendering
const CHROMES = WIN ? ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe']
  : MAC ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge']
  : ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
const chrome = () => [process.env.CHROME_PATH, ...CHROMES].find(x => x && fs.existsSync(x)) || null;

// open a file or a folder with the system's default app
function open(target) { const [c, a] = WIN ? ['cmd.exe', ['/c', 'start', '', target]] : MAC ? ['open', [target]] : ['xdg-open', [target]]; spawn(c, a, { detached: true, stdio: 'ignore', windowsHide: true }).unref(); }
const openFolder = target => { WIN ? spawn('explorer.exe', [target], { detached: true, stdio: 'ignore' }).unref() : open(target); };

// system font folders (extra fonts for the font catalog and for scripts the bundled fonts do not cover)
const SYSTEM_FONTS = WIN ? ['C:/Windows/Fonts'] : MAC ? ['/System/Library/Fonts', '/System/Library/Fonts/Supplemental', '/Library/Fonts', path.join(process.env.HOME || '', 'Library/Fonts')] : ['/usr/share/fonts'];
const EMOJI_FONT = WIN ? 'C:/Windows/Fonts/seguiemj.ttf' : MAC ? '/System/Library/Fonts/Apple Color Emoji.ttc' : '';

module.exports = { ROOT, WIN, MAC, PY, WHISPER_DIR, WHISPER_MODEL, whisperExe, ESRGAN, chrome, CHROMES, open, openFolder, SYSTEM_FONTS, EMOJI_FONT };
