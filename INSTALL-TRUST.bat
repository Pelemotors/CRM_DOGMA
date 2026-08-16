@echo off
title Wonder Motors - Install HTTPS Trust
cd /d "%~dp0"

set "CA=%~dp0certs\rootCA.pem"
if not exist "%CA%" (
  echo ERROR: certs\rootCA.pem not found.
  echo Copy the certs folder from the main server next to this script.
  echo.
  pause
  exit /b 1
)

echo.
echo Installing Wonder Motors root certificate for green lock...
echo Windows will ask for Administrator permission.
echo.
pause

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\install-trust.ps1" -CaPath "%CA%"
set "ERR=%ERRORLEVEL%"

echo.
if "%ERR%"=="0" (
  echo OK. Restart Chrome/Edge, then open the https LAN URL.
) else (
  echo Install failed or was cancelled. Error code %ERR%.
)
echo.
pause
exit /b %ERR%
