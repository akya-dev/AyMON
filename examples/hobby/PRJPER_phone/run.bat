@echo off
rem ---------------------------------------------------------------------
rem PRJPER_phone -- run the example. It prints the address to open on the
rem phone, and the dashboard's address for this PC.
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
rem A personal example runs on FREE - the edition for personal use - so no
rem licence is handed in. The education licence in ..\..\..\bin\lic is bound to the
rem PRJEDU / PRJDEV directories; given here, the engine would report it as
rem "for another project" and fall back to FREE anyway.
set "LIC="
if not exist "%~dp0log" mkdir "%~dp0log"

rem The addresses a phone on the same network can reach: those of the
rem network cards that have a gateway (Wi-Fi, Ethernet) - not the virtual
rem ones (WSL, Hyper-V) that have none.
echo.
echo  On the phone (same Wi-Fi), open:
set "FOUND="
for /f "usebackq delims=" %%A in (`powershell -NoProfile -Command "Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway -and $_.NetAdapter.Status -eq 'Up' } | ForEach-Object { $_.IPv4Address.IPAddress }" 2^>nul`) do (
    echo      https://%%A:8110/phone.html
    set "FOUND=1"
)
if not defined FOUND echo      https://^<this PC's address^>:8110/phone.html    ^(ipconfig shows it^)
echo  and accept the certificate warning once.
echo.
echo  On this PC, the dashboard:   http://127.0.0.1:8111/
echo  No phone? A simulated one:   http://127.0.0.1:8111/phone.html?sim=1
echo.
echo  The first time, Windows asks whether AyXDB.exe may accept connections:
echo  allow it on PRIVATE networks. See the README if the phone cannot connect.
echo.
echo Using %BIN%\AyXDB.exe
"%BIN%\AyXDB.exe" -console "%~dp0db\AyXDB.xml" %LIC%
endlocal
