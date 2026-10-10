@echo off
rem ---------------------------------------------------------------------
rem PRJPER_adsb -- run the example in a console window.
rem
rem One window is enough: the receiver and the tracker are two documents
rem of the same engine. Then open http://127.0.0.1:8097/
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
if "%BIN%"=="" if exist "%~dp0..\bin\win-x64\AyXDB.exe"       set "BIN=%~dp0..\bin\win-x64"
if "%BIN%"=="" if exist "%~dp0bin\win-x64\AyXDB.exe"          set "BIN=%~dp0bin\win-x64"
if "%BIN%"=="" (
    echo AyXDB.exe not found. Pass its directory:  run.bat "C:\path\to\bin"
    exit /b 1
)
rem A personal example runs on FREE - the edition for personal use - so no
rem licence is handed in. The education licence in ..\bin\lic is bound to the
rem PRJEDU / PRJDEV directories; given here, the engine would report it as
rem "for another project" and fall back to FREE anyway.
set "LIC="
if not exist "%~dp0log" mkdir "%~dp0log"
echo Using %BIN%\AyXDB.exe
"%BIN%\AyXDB.exe" -console "%~dp0db\AyXDB.xml" %LIC%
endlocal
