@echo off
rem ---------------------------------------------------------------------
rem PRJEDU_opcua -- start the simulated moulding machine (an OPC UA
rem server on opc.tcp://127.0.0.1:4840/moulding/) in this window.
rem
rem Run setup.bat once first. Start the engine (run.bat) in another
rem window. Stop the machine with CTRL-C.
rem ---------------------------------------------------------------------
setlocal
if not exist "%~dp0sim\.venv\Scripts\python.exe" (
    echo The machine needs asyncua: run setup.bat once first.
    exit /b 1
)
"%~dp0sim\.venv\Scripts\python.exe" "%~dp0sim\ua_machine.py"
endlocal
