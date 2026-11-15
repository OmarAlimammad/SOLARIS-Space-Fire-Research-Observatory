@echo off
setlocal
cd /d "%~dp0"
title SATURN V - ORBITAL FLIGHT LAB 2.0
color 0B
echo.
echo ========================================================
echo       ORBITAL LAB 2.0 - SATURN V MISSION CONTROL
echo ========================================================
echo.
echo Starting local web server at http://127.0.0.1:8000
echo.
where py >nul 2>&1
if not errorlevel 1 (
  start "SATURN V WEB SERVER" cmd /k py -3 -m http.server 8000
  goto browser
)
where python >nul 2>&1
if not errorlevel 1 (
  start "SATURN V WEB SERVER" cmd /k python -m http.server 8000
  goto browser
)
where node >nul 2>&1
if not errorlevel 1 (
  start "SATURN V WEB SERVER" cmd /k node server.mjs
  goto browser
)
echo ERROR: Python 3 or Node.js is required.
echo Python: https://www.python.org/downloads/
echo Node.js: https://nodejs.org/
pause
exit /b 1
:browser
timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:8000/"
echo.
echo Browser opened. Keep the separate server terminal window open.
echo If the browser shows a blank page, verify Internet for Three.js CDN.
echo.
pause
