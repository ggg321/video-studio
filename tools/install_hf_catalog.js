// node tools/install_hf_catalog.js
// Installs from the HyperFrames catalog everything the platform uses (subtitle templates, carousels, scenes) into hyperframes/trial.
// Needs: cd hyperframes && npm install   (once)
const { spawnSync } = require('child_process'), path = require('path'), fs = require('fs');
const HF = path.join(__dirname, '..', 'hyperframes'), TRIAL = path.join(HF, 'trial');
const CLI = path.join(HF, 'node_modules', 'hyperframes', 'bin', 'hyperframes.mjs');
if (!fs.existsSync(CLI)) { console.error('Run first: cd hyperframes && npm install'); process.exit(1); }
const env = { ...process.env, HYPERFRAMES_SKIP_SKILLS: '1', HYPERFRAMES_NO_TELEMETRY: '1' };
if (!fs.existsSync(TRIAL)) { const r = spawnSync(process.execPath, [CLI, 'init', 'trial', '--example', 'blank', '--resolution', 'portrait', '--non-interactive', '--skip-transcribe'], { cwd: HF, env, stdio: 'inherit' }); if (r.status !== 0) process.exit(r.status || 1); }
const ITEMS = [
  // subtitle templates
  'caption-kinetic-slam', 'caption-pill-karaoke', 'caption-neon-glow', 'caption-highlight', 'caption-clip-wipe', 'caption-glitch-rgb', 'caption-gradient-fill',
  'caption-matrix-decode', 'caption-neon-accent', 'caption-emoji-pop', 'caption-particle-burst', 'caption-weight-shift',
  // carousels
  'carousel-circle-1', 'carousel-orbit-1', 'carousel-vision-1', 'carousel-path-1', 'carousel-text-circle-1',
  // scenes
  'weight-wave', 'hw-title', 'hw-write-title', 'wireframe-portal-title', 'glass-shard-title', 'canopy-part-title', 'logo-outro', 'mk-progress-stat', 'mk-line-graph', 'bar-chart-race', 'data-chart',
  'flowchart-vertical', 'flowchart', 'hw-pipeline', 'message-thread-reveal', 'notification-cascade', 'ai-chat-reveal', 'notes-reveal', 'instagram-follow', 'tiktok-follow', 'x-post', 'reddit-post',
  'spotify-card', 'lt-bold-block', 'lt-clean-bar', 'lt-kicker-name', 'lt-soft-pill'
];
let bad = 0;
for (const it of ITEMS) { const r = spawnSync(process.execPath, [CLI, 'add', it, '--no-clipboard', '--json'], { cwd: TRIAL, env, encoding: 'utf8' }); console.log(r.status === 0 ? 'ok  ' : 'FAIL', it); if (r.status !== 0) bad++; }
process.exit(bad ? 1 : 0);
