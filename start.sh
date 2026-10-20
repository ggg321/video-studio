#!/bin/bash
# macOS / Linux: starts Video Studio with auto-restart and opens it in the browser.
cd "$(dirname "$0")"
mkdir -p data
( sleep 3; if command -v open >/dev/null; then open http://localhost:4317; else xdg-open http://localhost:4317; fi ) &
# keep the Mac awake while the server runs (does not change power settings)
if command -v caffeinate >/dev/null; then caffeinate -i -w $$ & fi
while true; do
  echo "[$(date)] starting server" >> data/server.log
  node server.js >> data/server.log 2>&1
  echo "[$(date)] server stopped (exit $?), restarting in 5s" >> data/server.log
  sleep 5
done
