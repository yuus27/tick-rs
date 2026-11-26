@echo off
title tick. (RSBuddy)
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Node.js is niet gevonden.
  echo   Installeer de LTS-versie via https://nodejs.org en start dit bestand opnieuw.
  echo.
  pause
  exit /b 1
)

if not exist node_modules (
  echo   Eerste keer: pakketten installeren...
  call npm install --no-audit --no-fund
  if errorlevel 1 ( pause & exit /b 1 )
)

if not exist node_modules\happy-dom (
  echo   Nieuwe pakketten installeren...
  call npm install --no-audit --no-fund
  if errorlevel 1 ( pause & exit /b 1 )
)

if not exist server\ai\tick-ai.bundle.mjs (
  echo   App bouwen...
  call npm run build
  if errorlevel 1 ( pause & exit /b 1 )
)

if not exist web\dist\index.html (
  echo   App bouwen...
  call npm run build
  if errorlevel 1 ( pause & exit /b 1 )
)

rem Opent tick. als los app-venster in Edge zodra de server draait
start "" /min cmd /c timeout /t 2 /nobreak ^>nul ^& start msedge --app=http://localhost:5177
node server\index.js
pause
