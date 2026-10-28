@echo off
rem ---------------------------------------------------------------------
rem PRJEDU_rep -- the PLANT engine (the source of the data).
rem
rem Open a second window and run run_centre.bat. Order does not matter.
rem Stop either one with CTRL-C and start it again; they reconnect and the
rem mirror catches up by itself.
rem
rem WHY 127.0.0.1 IS NOT AN ACCIDENT
rem
rem Replication is not in the FREE edition. It works here anyway, because
rem the rule is about WHERE the connection goes, not what it costs: an
rem unlicensed feature is a LOCAL feature. Cluster, replication, RPC and
rem MCP all run between engines on one machine so that anybody can learn
rem them, and are refused on a remote address without a licence. What you
rem buy is the second machine.
rem
rem If yours lives somewhere else, pass the directory:
rem     run_plant.bat "C:\Program Files\AyMON\bin"
rem ---------------------------------------------------------------------
setlocal
set "BIN=%~1"
if "%BIN%"=="" if exist "%~dp0..\..\..\bin\win-x64\AyXDB.exe" set "BIN=%~dp0..\..\..\bin\win-x64"
if "%BIN%"=="" if exist "%~dp0..\bin\win-x64\AyXDB.exe"        set "BIN=%~dp0..\bin\win-x64"
if "%BIN%"=="" if exist "%~dp0bin\win-x64\AyXDB.exe"           set "BIN=%~dp0bin\win-x64"
if "%BIN%"=="" (
    echo AyXDB.exe not found. Pass its directory:  run_plant.bat "C:\path\to\bin"
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
title AyMON PRJEDU_rep -- PLANT
"%BIN%\AyXDB.exe" -console "%~dp0db\AyXDB_plant.xml" %LIC%
endlocal
