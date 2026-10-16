// Speech recognition with word timestamps. Parakeet (fast, 25 European languages) first; Whisper (multilingual, slower) as fallback.
const fs = require('fs'), path = require('path');
const { exec, spawn } = require('child_process');

const PARAKEET = new Set('bg hr cs da nl en et fi fr de el hu it lv lt mt pl pt ro sk sl es sv ru uk'.split(' '));
const WHISPER_DIR = path.join(__dirname, '..', 'tools', 'whisper');
const WHISPER_EXE = path.join(WHISPER_DIR, 'Release', 'whisper-cli.exe');
const WHISPER_MODEL = path.join(WHISPER_DIR, 'ggml-large-v3-turbo-q5_0.bin');
const whisperAvailable = () => fs.existsSync(WHISPER_EXE) && fs.existsSync(WHISPER_MODEL);

function viaParakeet(wav, dir, lang) {
  return new Promise((ok, no) => exec(`npx hyperframes transcribe "${wav}" ${lang ? '--language ' + lang : ''}`, { cwd: dir, timeout: 900000 },
    (e, so, se) => {
      if (e) return no(new Error(se || e.message));
      try { ok(JSON.parse(fs.readFileSync(path.join(dir, 'transcript.json'), 'utf8'))); } catch (x) { no(x); }
    }));
}

function viaWhisper(wav, dir, lang) {
  return new Promise((ok, no) => {
    if (!whisperAvailable()) return no(new Error('Whisper is not installed (tools/whisper).'));
    const out = path.join(dir, 'whisper');
    const p = spawn(WHISPER_EXE, ['-m', WHISPER_MODEL, '-f', wav, '-l', lang || 'auto', '-ml', '1', '-sow', '-ojf', '-of', out, '-np'], { cwd: WHISPER_DIR });
    let err = ''; p.stderr.on('data', d => { err += d; if (err.length > 5000) err = err.slice(-5000); });
    p.on('error', no);
    p.on('close', code => {
      if (code !== 0) return no(new Error('whisper exit ' + code + ' ' + err.slice(-300)));
      try {
        const j = JSON.parse(fs.readFileSync(out + '.json', 'utf8'));
        const words = [];
        for (const t of j.transcription || []) {
          const text = (t.text || '').trim();
          if (!text || /^\[.*\]$/.test(text)) continue;
          const start = t.offsets.from / 1000, end = Math.max(t.offsets.to / 1000, start + 0.05);
          if (/^[.,!?;:…]+$/.test(text) && words.length) { words[words.length - 1].text += text; continue; }
          words.push({ id: 'w' + words.length, text, start, end });
        }
        fs.writeFileSync(path.join(dir, 'transcript.json'), JSON.stringify(words));
        ok(words);
      } catch (x) { no(x); }
    });
  });
}

// lang: '' (auto) or ISO code. Returns [{text,start,end}] and writes transcript.json in dir.
async function transcribe(wav, dir, lang, log = () => {}) {
  const needsWhisper = lang && !PARAKEET.has(lang);
  if (!needsWhisper) {
    try { return await viaParakeet(wav, dir, lang); }
    catch (e) { log('Parakeet failed, trying Whisper: ' + e.message.slice(0, 200)); }
  }
  return viaWhisper(wav, dir, lang);
}
module.exports = { transcribe, whisperAvailable, PARAKEET, viaWhisper };
