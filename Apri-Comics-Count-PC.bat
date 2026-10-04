@echo off
start "" "d:\Antigravity\Comics Count\Avvia-Comics-Count-Silenzioso.vbs"
ping 127.0.0.1 -n 2 >nul
start "" "http://localhost:3001"
