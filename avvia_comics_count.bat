@echo off
title Comics Count 2.0 - Tracker Fumetti & Contabilita
echo ===================================================
echo     COMICS COUNT 2.0 - Tracker Fumetti & Contabilita
echo ===================================================
echo.
echo Avvio del server in corso...
cd /d "%~dp0backend"
start http://localhost:3001
node server.js
pause
