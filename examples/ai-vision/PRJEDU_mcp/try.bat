@echo off
rem ---------------------------------------------------------------------
rem PRJEDU_mcp -- call the MCP endpoints of the running example, no AI
rem needed. Start run.bat first, in another window.
rem
rem This only starts try.ps1 with PowerShell's execution policy relaxed
rem FOR THIS ONE PROCESS, so nothing on the machine has to be changed.
rem ---------------------------------------------------------------------
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0try.ps1" %*
