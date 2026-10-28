@echo off
rem ---------------------------------------------------------------------
rem PRJEDU_telnet -- run the example, then open a shell into it from a
rem second window:
rem     shell.ps1            plain telnet, 127.0.0.1:2323
rem     shell.ps1 -Tls       the same shell over TLS,   127.0.0.1:2324
rem
rem The engine is AyXDB.exe. This script looks for it in the usual places;
rem if yours lives somewhere else, pass the directory:
rem     run.bat "C:\Program Files\AyMON\bin"
rem
rem Stop the engine with CTRL-C. The log is in the log\ directory beside
rem this file, and the console prints the same lines.
rem ---------------------------------------------------------------------
setlocal
set "BIN=%~1"
if "%BIN%"=="" if exist "%~dp0..\..\..\bin\win-x64\AyXDB.exe" set "BIN=%~dp0..\..\..\bin\win-x64"
if "%BIN%"=="" if exist "%~dp0..\bin\win-x64\AyXDB.exe"       set "BIN=%~dp0..\bin\win-x64"
if "%BIN%"=="" if exist "%~dp0bin\win-x64\AyXDB.exe"          set "BIN=%~dp0bin\win-x64"
if "%BIN%"=="" (
    echo AyXDB.exe not found. Pass its directory:  run.bat "C:\path\to\bin"
    exit /b 1
)
rem The licence is shared by every platform's engine, so it does not sit
rem beside the exe: -lic: names it for this one process, ahead of AYMON_LIC
rem and the project's own db\lic. Given as an absolute path because the
rem engine may be one you passed in, and a relative -lic: is relative to
rem the EXE. Only if the file is there: an explicit -lic: that names nothing
rem runs FREE rather than fall back to a licence you put in db\lic.
set "LIC="
if exist "%~dp0..\..\..\bin\lic\AyMON.lic" (
    for %%I in ("%~dp0..\..\..\bin\lic") do set "LIC=-lic:"%%~fI""
)
if not defined LIC if exist "%~dp0..\bin\lic\AyMON.lic" (
    for %%I in ("%~dp0..\bin\lic") do set "LIC=-lic:"%%~fI""
)
if not exist "%~dp0log" mkdir "%~dp0log"
echo Using %BIN%\AyXDB.exe
"%BIN%\AyXDB.exe" -console "%~dp0db\AyXDB.xml" %LIC%
endlocal
