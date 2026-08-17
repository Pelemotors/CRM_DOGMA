@echo off
title T.A Motors - CRM
cd /d "C:\Users\user\Projects\tamotors\CRM_DOGMA"
if not exist package.json (
  echo ERROR: package.json not found in %CD%
  pause
  exit /b 1
)
"C:\Program Files\nodejs\npm.cmd" run dev
pause
