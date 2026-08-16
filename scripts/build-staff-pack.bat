@echo off
title Wonder Motors - Build Staff HTTPS Pack
cd /d "%~dp0.."

set "OUT=%USERPROFILE%\Desktop\WonderMotors-HTTPS-Staff"
if not exist "certs\rootCA.pem" (
  echo ERROR: certs\rootCA.pem missing. Run setup-https.bat first.
  pause
  exit /b 1
)

if exist "%OUT%" rmdir /s /q "%OUT%"
mkdir "%OUT%\certs"
mkdir "%OUT%\scripts"

copy /y "INSTALL-TRUST.bat" "%OUT%\" >nul
copy /y "certs\rootCA.pem" "%OUT%\certs\" >nul
copy /y "scripts\install-trust.ps1" "%OUT%\scripts\" >nul

echo Wonder Motors CRM - Staff HTTPS Setup > "%OUT%\README.txt"
echo. >> "%OUT%\README.txt"
echo 1. Copy this entire folder to the staff PC >> "%OUT%\README.txt"
echo 2. Run INSTALL-TRUST.bat once as Administrator >> "%OUT%\README.txt"
echo 3. Open the LAN URL shown in the server window (https://...) >> "%OUT%\README.txt"
echo. >> "%OUT%\README.txt"
echo Do NOT copy certs\certs - keep this folder structure. >> "%OUT%\README.txt"

echo.
echo Staff pack ready:
echo   %OUT%
echo.
pause
