@echo off
title My Texas Estate Plan — Video Server
echo =========================================
echo  My Texas Estate Plan — Video Server
echo  Running on http://localhost:3000
echo  Press Ctrl+C to stop
echo =========================================
echo.
cd /d "%~dp0"
node server.js
pause
