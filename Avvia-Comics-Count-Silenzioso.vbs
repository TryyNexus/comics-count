Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "d:\Antigravity\Comics Count"
WshShell.Run """C:\Program Files\nodejs\node.exe"" ""d:\Antigravity\Comics Count\backend\server.js""", 0, False
