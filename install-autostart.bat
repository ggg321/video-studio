@echo off
rem Start Video Studio automatically when you log in to Windows (current user, no admin needed).
schtasks /create /tn "VideoStudio" /tr "wscript.exe \"%~dp0run-hidden.vbs\"" /sc onlogon /f
echo Klaar. Verwijderen: schtasks /delete /tn "VideoStudio" /f
pause
