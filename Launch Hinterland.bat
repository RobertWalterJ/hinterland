@echo off
setlocal
title Hinterland
cd /d "%~dp0"

rem Find a Python. py.exe first, then python on PATH.
set PY=
where py >nul 2>nul && set PY=py
if "%PY%"=="" (where python >nul 2>nul && set PY=python)
if "%PY%"=="" (
  echo.
  echo   Python was not found on this computer.
  echo   Install it from https://www.python.org/downloads/ and tick
  echo   "Add python.exe to PATH", then run this again.
  echo.
  pause
  exit /b 1
)

if not exist "app\data\geo.json" (
  echo.
  echo   The data has not been built yet. Running the build now -
  echo   this takes about ten minutes the first time, once only.
  echo.
  %PY% pipelineetch.py || goto :failed
  %PY% pipelineuild.py || goto :failed
  %PY% pipelineoundaries.py || goto :failed
  %PY% pipelinexport_web.py || goto :failed
)

%PY% pipeline\serve.py
goto :eof

:failed
echo.
echo   The build did not finish. The message above says why.
pause
