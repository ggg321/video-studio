@echo off
rem Starts Video Studio with auto-restart and opens it in your browser.
cd /d "%~dp0"
start "" http://localhost:4317
call "%~dp0supervisor.bat"
