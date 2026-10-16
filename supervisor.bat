@echo off
rem Keeps Video Studio running: restarts the server if it ever stops, and keeps Windows awake while it runs.
cd /d "%~dp0"
if not exist data mkdir data
start "" /b powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "%~dp0keepawake.ps1"
:loop
echo [%date% %time%] starting server >> data\server.log
node server.js >> data\server.log 2>&1
echo [%date% %time%] server stopped (exit %errorlevel%), restarting in 5s >> data\server.log
timeout /t 5 /nobreak >nul
goto loop
