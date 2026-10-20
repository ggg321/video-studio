#!/bin/bash
# One-time set-up for macOS. Usage: bash setup-mac.sh
set -e
cd "$(dirname "$0")"
command -v brew >/dev/null || { echo "Install Homebrew first: https://brew.sh"; exit 1; }
brew install node ffmpeg python git whisper-cpp
echo "Optional: brew install ollama && ollama pull gemma3:4b && ollama pull bge-m3   (meaning-based matching, translation of subtitles)"
echo "Optional: install Google Chrome (used to render the Motion tab)"

npm install
(cd remotion && npm install)
(cd hyperframes && npm install)
node tools/install_hf_catalog.js || echo "HyperFrames catalog: some items failed, the rest works"

python3 -m venv .venv
.venv/bin/pip install --quiet fonttools pillow numpy
.venv/bin/pip install --quiet mediapipe || echo "mediapipe not installed: lip-sync check is off, everything else works"
mkdir -p data tools/whisper
.venv/bin/python tools/buildfonts.py

MODEL=tools/whisper/ggml-large-v3-turbo-q5_0.bin
if [ ! -f "$MODEL" ]; then
  echo "Downloading the speech model (about 570 MB)..."
  curl -L -o "$MODEL" https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q5_0.bin
fi
chmod +x start.sh
echo "Done. Start with: ./start.sh   (Video Studio: http://localhost:4317, Subtitle Studio: node captions/server.js -> http://localhost:4318)"
