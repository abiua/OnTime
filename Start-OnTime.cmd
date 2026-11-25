@echo off
cd /d "%~dp0"
if not exist "node_modules\electron" (
  echo Please run npm install first.
  pause
  exit /b 1
)
set ELECTRON_RUN_AS_NODE=
start "OnTime" /b "node_modules\electron\dist\electron.exe" . %*
