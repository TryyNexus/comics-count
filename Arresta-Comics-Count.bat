@echo off
echo Arresto Comics Count in corso...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3001" ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)
taskkill /F /IM cloudflared.exe >nul 2>&1
echo Comics Count e il tunnel sono stati arrestati.
ping 127.0.0.1 -n 2 >nul
