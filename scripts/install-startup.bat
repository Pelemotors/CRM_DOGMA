@echo off
title Wonder Motors - Install Startup
cd /d "%~dp0"

set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "LINK=%STARTUP%\Wonder Motors CRM.lnk"
set "TARGET=%~dp0RUN.bat"

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ws = New-Object -ComObject WScript.Shell; ^
   $s = $ws.CreateShortcut('%LINK%'); ^
   $s.TargetPath = '%TARGET%'; ^
   $s.WorkingDirectory = '%~dp0'; ^
   $s.WindowStyle = 1; ^
   $s.Description = 'Wonder Motors CRM Server'; ^
   $s.Save()"

echo.
echo Shortcut created:
echo   %LINK%
echo.
echo The CRM server will start automatically when Windows logs in.
echo To remove: delete the shortcut from Startup folder.
echo.
pause
