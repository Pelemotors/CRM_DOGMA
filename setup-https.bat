@echo off
setlocal EnableDelayedExpansion
title Yossi Car - Setup HTTPS
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
  echo ERROR: Node.js not found. Install from https://nodejs.org
  pause
  exit /b 1
)

echo.
echo ========================================
echo   Setup HTTPS certificates (mkcert)
echo ========================================
echo.

where mkcert >nul 2>&1
if errorlevel 1 (
  echo mkcert not found. Trying winget install...
  where winget >nul 2>&1
  if errorlevel 1 (
    echo ERROR: mkcert and winget not found.
    echo Install mkcert from: https://github.com/FiloSottile/mkcert/releases
    echo Then run this script again.
    pause
    exit /b 1
  )
  winget install --id FiloSottile.mkcert -e --accept-source-agreements --accept-package-agreements
  if errorlevel 1 (
    echo ERROR: winget could not install mkcert.
    pause
    exit /b 1
  )
  set "PATH=%PATH%;%LOCALAPPDATA%\Microsoft\WinGet\Links;%ProgramFiles%\mkcert"
)

where mkcert >nul 2>&1
if errorlevel 1 (
  echo ERROR: mkcert still not in PATH.
  echo Close this window, open a NEW Command Prompt, run setup-https.bat again.
  pause
  exit /b 1
)

echo Installing local CA (may ask for Admin approval)...
mkcert -install
if errorlevel 1 (
  echo ERROR: mkcert -install failed. Try Run as Administrator.
  pause
  exit /b 1
)

if not exist "certs" mkdir certs

set "HOSTS=localhost 127.0.0.1 ::1"
for /f "usebackq delims=" %%I in (`node -e "import('./src/lan.js').then(m=>m.getLanIPv4Addresses().forEach(a=>console.log(a)))"`) do (
  set "HOSTS=!HOSTS! %%I"
)
echo Hosts: !HOSTS!

echo Creating certs\lan.pem ...
mkcert -cert-file "certs\lan.pem" -key-file "certs\lan-key.pem" !HOSTS!
if errorlevel 1 (
  echo ERROR: certificate creation failed.
  pause
  exit /b 1
)

for /f "usebackq delims=" %%C in (`mkcert -CAROOT`) do set "CAROOT=%%C"
if exist "!CAROOT!\rootCA.pem" (
  copy /Y "!CAROOT!\rootCA.pem" "certs\rootCA.pem" >nul
  echo Copied rootCA.pem to certs\
) else (
  echo WARNING: could not copy rootCA.pem from !CAROOT!
)

echo.
echo DONE.
echo   1. Run RUN.bat
echo   2. Open https://127.0.0.1:3000
echo   3. On staff PCs: copy certs folder + INSTALL-TRUST.bat, run INSTALL-TRUST.bat once,
echo      then open the https LAN URL shown in the server window.
echo.
pause
exit /b 0
