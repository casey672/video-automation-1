@echo off
title My Texas Estate Plan — Generating Video
echo =========================================
echo  My Texas Estate Plan — Video Generator
echo  %DATE% %TIME%
echo =========================================
echo.
cd /d "%~dp0"
node generate.js %*
echo.
echo Done. Check results.log for the YouTube URL.
pause
