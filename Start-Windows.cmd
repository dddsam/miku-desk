@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Please install Node.js 22 or newer, then run this file again.
  pause
  exit /b 1
)
if not exist "node_modules\electron\dist\electron.exe" (
  call npm ci --no-audit --no-fund
  if errorlevel 1 goto failed
  if not exist "node_modules\electron\dist\electron.exe" node node_modules\electron\install.js
  if errorlevel 1 goto failed
)
call npm start
if errorlevel 1 goto failed
exit /b 0
:failed
echo Startup failed. Keep this window open and copy the error message.
pause
exit /b 1
