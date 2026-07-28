@echo off
title Olam HaRechev - Server RUNNING
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
  echo.
  echo  ERROR: Node.js not found in PATH.
  echo  Install from https://nodejs.org then run again.
  echo.
  pause
  exit /b 1
)

if not exist "certs\lan.pem" (
  echo.
  echo  WARNING: HTTPS certs missing.
  echo  For green lock, run setup-https.bat once, then RUN.bat again.
  echo  Starting in HTTP mode for now...
  echo.
  timeout /t 4 /nobreak >nul
)

set "URL=http://127.0.0.1:3000"
if exist "certs\lan.pem" if exist "certs\lan-key.pem" set "URL=https://127.0.0.1:3000"

powershell -NoProfile -Command "try { $c = New-Object Net.Sockets.TcpClient; $c.Connect('127.0.0.1', 3000); $c.Close(); exit 0 } catch { exit 1 }" >nul 2>&1
if not errorlevel 1 (
  echo Server already on port 3000 - restarting...
  call "%~dp0STOP.bat" /quiet
  timeout /t 2 /nobreak >nul
)

echo.
echo ========================================
echo   Olam HaRechev - Management System
echo ========================================
echo.
echo   Keep this window OPEN while working.
echo   Local URL:  %URL%
echo.
echo   To STOP: close this window  OR  run STOP.bat
echo ========================================
echo.

node src\server\index.js
set "ERR=%ERRORLEVEL%"

echo.
if not "%ERR%"=="0" (
  echo Server stopped with error code %ERR%.
) else (
  echo Server stopped.
)
echo.
pause
exit /b %ERR%
