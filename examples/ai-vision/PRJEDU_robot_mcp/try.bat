@echo off
rem ---------------------------------------------------------------------
rem PRJEDU_robot_mcp -- the calls an AI assistant makes, without one.
rem Start run.bat first, in another window.
rem   try.bat          what the assistant may and may not do
rem   try.bat --run    play the program and watch it (brakes released
rem                    first, by a person, on the page)
rem
rem Needs Python 3 (python.org or the Microsoft Store); only the standard
rem library is used.
rem ---------------------------------------------------------------------
where py >nul 2>nul && (py -3 "%~dp0try.py" %* & goto :eof)
where python >nul 2>nul && (python "%~dp0try.py" %* & goto :eof)
echo Python 3 is needed to run try.py - see https://www.python.org/downloads/
