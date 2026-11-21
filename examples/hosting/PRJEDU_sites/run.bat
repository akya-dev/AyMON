@echo off
rem ---------------------------------------------------------------------
rem PRJEDU_sites -- run the example in a console window: ONE engine, the
rem host and its roots ACME and BETA. Then open http://127.0.0.1:8125/
rem
rem The host's page adds GAMMA to db\AyXDB.xml and makes roots\GAMMA;
rem its Remove button takes both away again.
rem
rem The engine is AyXDB.exe. This script looks for it in the usual places;
rem if yours lives somewhere else, pass the directory:
rem     run.bat "C:\Program Files\AyMON\bin"
rem
rem Stop the engine with CTRL-C. The host's log is in the log\ directory
rem beside this file, each root's in its own roots\<name>\log\, and the
rem console prints the lines of all of them.
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
rem One licence for the whole process: every root counts against it.
set "LIC="
if exist "%~dp0..\..\..\bin\lic\AyMON.lic" (
    for %%I in ("%~dp0..\..\..\bin\lic") do set "LIC=-lic:"%%~fI""
)
if not defined LIC if exist "%~dp0..\bin\lic\AyMON.lic" (
    for %%I in ("%~dp0..\bin\lic") do set "LIC=-lic:"%%~fI""
)
rem the engine writes a log into a directory that is there: one for the
rem host, one in each root and in the template HOST.add copies
if not exist "%~dp0log" mkdir "%~dp0log"
if not exist "%~dp0roots\ACME\log" mkdir "%~dp0roots\ACME\log"
if not exist "%~dp0roots\BETA\log" mkdir "%~dp0roots\BETA\log"
if not exist "%~dp0templates\site\log" mkdir "%~dp0templates\site\log"
title AyMON several projects - one engine
echo Using %BIN%\AyXDB.exe
"%BIN%\AyXDB.exe" -console "%~dp0db\AyXDB.xml" %LIC%
endlocal
