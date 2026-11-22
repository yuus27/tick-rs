@echo off
title tick. desktop-app bouwen
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 ( echo Node.js niet gevonden. Installeer de LTS-versie via https://nodejs.org & pause & exit /b 1 )
echo.
echo   Pakketten installeren (eerste keer downloadt dit Electron, ~100 MB)...
call npm install --no-audit --no-fund
if errorlevel 1 ( pause & exit /b 1 )
echo.
echo   Desktop-app bouwen...
call npm run dist
if errorlevel 1 ( pause & exit /b 1 )
echo.
echo   Klaar! In de map "release" staan:
echo     - tick-setup-*.exe     (installer met snelkoppeling op je bureaublad)
echo     - tick-portable-*.exe  (los bestand, geen installatie nodig)
echo.
explorer release
pause
