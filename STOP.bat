@echo off
title Yossi Car - Stop Server
cd /d "%~dp0"

set "QUIET=%~1"

powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"

if /I "%QUIET%"=="/quiet" exit /b 0

echo.
echo Server on port 3000 stopped (if it was running).
echo Run RUN.bat to start again.
echo.
pause
