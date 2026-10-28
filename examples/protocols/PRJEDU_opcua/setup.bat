@echo off
rem ---------------------------------------------------------------------
rem PRJEDU_opcua -- set up the simulated machine, once.
rem
rem The machine is a Python program with an OPC UA server (asyncua). This
rem makes a Python environment of its own in sim\.venv and installs
rem asyncua there - nothing is installed into your Python itself.
rem
rem Needs Python 3.10 or later (any, 64-bit or not: the engine does not
rem use this Python) and the internet, once.
rem Delete sim\.venv to undo it.
rem ---------------------------------------------------------------------
setlocal
set "PY="
where py >nul 2>nul && set "PY=py -3"
if not defined PY (where python >nul 2>nul && set "PY=python")
if not defined PY (
    echo Python not found. Install Python 3.10 or later from python.org, then run this again.
    exit /b 1
)
%PY% -c "import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)" || (
    echo This Python is older than 3.10; asyncua needs 3.10 or later.
    exit /b 1
)
if not exist "%~dp0sim\.venv\Scripts\python.exe" (
    echo Making sim\.venv ...
    %PY% -m venv "%~dp0sim\.venv" || exit /b 1
)
echo Installing asyncua into sim\.venv ...
"%~dp0sim\.venv\Scripts\python.exe" -m pip install --disable-pip-version-check -q "asyncua==2.0.1" || exit /b 1
"%~dp0sim\.venv\Scripts\python.exe" -c "import asyncua; print('asyncua', asyncua.__version__ if hasattr(asyncua, '__version__') else '', 'ready - now run_machine.bat')"
endlocal
