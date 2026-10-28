@echo off
rem ---------------------------------------------------------------------
rem PRJEDU_telnet -- open a shell into the running example.
rem
rem     shell.bat            plain telnet, 127.0.0.1:2323
rem     shell.bat -Tls       the same shell over TLS,   127.0.0.1:2324
rem
rem This only starts shell.ps1 with PowerShell's execution policy relaxed
rem FOR THIS ONE PROCESS, so nothing on the machine has to be changed.
rem Log in as admin/admin123, eng/eng123, opr/opr123 or mon/mon123.
rem ---------------------------------------------------------------------
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0shell.ps1" %*
