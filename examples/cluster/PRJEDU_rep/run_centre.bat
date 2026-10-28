@echo off
rem ---------------------------------------------------------------------
rem PRJEDU_rep -- the CENTRE engine (the mirror).
rem
rem Run this in its own window, beside run_plant.bat. Start it FIRST once,
rem to see what an empty mirror looks like: the document exists, holds no
rem elements, and fills the moment the plant appears.
rem
rem The two engines share this project directory. They are told apart by
rem the tid in their root files, and by nothing else -- %TID% keeps their
rem log files separate in log\.
rem
rem If yours lives somewhere else, pass the directory:
rem     run_centre.bat "C:\Program Files\AyMON\bin"
rem ---------------------------------------------------------------------
setlocal
set "BIN=%~1"
if "%BIN%"=="" if exist "%~dp0..\..\..\bin\win-x64\AyXDB.exe" set "BIN=%~dp0..\..\..\bin\win-x64"
if "%BIN%"=="" if exist "%~dp0..\bin\win-x64\AyXDB.exe"        set "BIN=%~dp0..\bin\win-x64"
if "%BIN%"=="" if exist "%~dp0bin\win-x64\AyXDB.exe"           set "BIN=%~dp0bin\win-x64"
if "%BIN%"=="" (
    echo AyXDB.exe not found. Pass its directory:  run_centre.bat "C:\path\to\bin"
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
title AyMON PRJEDU_rep -- CENTRE
"%BIN%\AyXDB.exe" -console "%~dp0db\AyXDB_centre.xml" %LIC%
endlocal
