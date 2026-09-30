@echo off
rem Usage:
rem   run.bat                  static mode (same as GitHub Pages, data in browser localStorage)
rem   run.bat backend-enable   backend mode (server.py + SQLite data.db)
setlocal
cd /d "%~dp0"
set PORT=8000
set URL=http://localhost:%PORT%/

set PY=python
where python >nul 2>nul || set PY=py -3
%PY% --version >nul 2>nul || (echo Python 3 not found. Install it from https://www.python.org/ & exit /b 1)

if "%~1"=="" goto static
if /i "%~1"=="backend-enable" goto backend
echo Unknown option "%~1". Use: run.bat [backend-enable]
exit /b 1

:static
echo Static mode: %URL%   (Ctrl+C to stop)
call :open
%PY% -m http.server %PORT%
exit /b

:backend
echo Backend mode: %URL%   (Ctrl+C to stop, delete data.db to reset data)
call :open
%PY% server.py %PORT%
exit /b

:open
rem Open the browser after a short delay so the server is already listening.
start "" /min powershell -NoProfile -Command "Start-Sleep -Seconds 2; Start-Process '%URL%'"
exit /b
