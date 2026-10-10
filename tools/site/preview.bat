@echo off
rem Preview the documentation site on this machine, exactly as GitHub Pages
rem will serve it: http://127.0.0.1:8000/AyMON/  (CTRL-C to stop).
rem The first run makes a Python environment in _build\venv (about a minute);
rem later runs start at once. After editing a README, stop and run it again.
setlocal
set "HERE=%~dp0"
set "VENV=%HERE%_build\venv"
if not exist "%VENV%\Scripts\python.exe" (
  echo Making the Python environment in %VENV% ...
  py -3 -m venv "%VENV%" 2>nul || python -m venv "%VENV%" || goto :nopython
  "%VENV%\Scripts\python" -m pip install -q --disable-pip-version-check -r "%HERE%requirements.txt" || goto :eof
)
start "" cmd /c "timeout /t 5 >nul & start http://127.0.0.1:8000/AyMON/"
"%VENV%\Scripts\python" "%HERE%build.py" --serve
goto :eof

:nopython
echo Python 3 is needed: https://www.python.org/downloads/
exit /b 1
