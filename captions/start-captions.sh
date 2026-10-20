#!/bin/bash
cd "$(dirname "$0")/.."
( sleep 2; open http://localhost:4318 2>/dev/null || xdg-open http://localhost:4318 ) &
node captions/server.js
