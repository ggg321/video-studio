# Video Studio

A local web platform that automates short talking-head videos: script and voice in, a finished video out. Montage by meaning (inserts from your libraries), subtitles, transitions, sounds, a Simple mode (one button) and a Pro mode (every setting), plus a Motion tab for complex animated videos.

Runs on your own computer: Node.js (Express) and ffmpeg, with Python tools, a local model through Ollama, and Remotion / HyperFrames for the animated parts. Port `4317`.

## What is not in this repository

Secrets and personal data stay out on purpose (see `.gitignore`):

- `data/` — settings with API keys, tasks, niches and clip libraries, samples, sounds, speakers. It is created on the first start.
- `projects/`, `library/`, `exports/`, `backups/` — your videos and clips.
- `fonts/`, `assets/` — font files and Remotion assets.
- `tools/realesrgan`, `tools/whisper` — program files and models.
- `node_modules`, `.venv`.

Never commit API keys. Keys (Asana, Telegram, Pexels, Pixabay, xAI, ElevenLabs, HeyGen) are typed into the Settings page and saved in `data/settings.json`.

## Set-up on a new computer (Windows)

1. Install **Node.js 24**, **ffmpeg** (in the PATH), **Python 3.11+**, **Git**. Optional: **Ollama** with the models `gemma3:4b` and `bge-m3` (`ollama pull gemma3:4b`, `ollama pull bge-m3`), Google Chrome (Remotion and HyperFrames use it for rendering).
2. Clone the repository and install the packages:

```bash
npm install
cd remotion && npm install && cd ..
cd hyperframes && npm install && cd ..
node tools/install_hf_catalog.js
```

3. Python tools (speech recognition, upscaling, lip-sync check): create `.venv` and install what `tools/*.py` import (`faster-whisper`, `numpy`, `Pillow` and others).
4. Fonts: put the font files into `fonts/` (the list is read by `tools/buildfonts.py`; run it to build `data/fonts.json`). Sounds: `node tools/import_sfx.js "<folder with your sounds>" --apply`.
5. Start: `start.bat` (or `supervisor.bat` for a restart after a crash). Open http://localhost:4317.
6. Settings → paste your keys.

## Layout

| Folder | What |
|---|---|
| `server.js`, `lib/` | the server and its modules (matching, render, subtitles, sources, simple mode, team workflow…) |
| `public/` | the pages (Creatives, Projects, Sources, Motion, Library, Settings…) and `i18n.js` (English, Russian, Ukrainian) |
| `remotion/` | compositions for the Motion tab (`src/Typo.jsx`, `src/custom/`) and `render.js` |
| `hyperframes/` | helpers for the HyperFrames catalog (`trial/` is installed by `tools/install_hf_catalog.js`) |
| `tools/` | Python and Node helper scripts |
| `DESIGN.md` | the design tokens of the interface |

## Notes

- Third-party skills for Claude Code are listed in `skills-lock.json` (they are installed into `.claude/skills`, which is not committed).
- Licenses of the libraries used: Remotion (free for individuals and small teams, check the current terms), GSAP (standard no-charge license), HyperFrames (Apache-2.0), Remotion Bits (MIT).
