@echo off
cd /d "%~dp0.."
start "" http://localhost:4318
node captions\server.js
