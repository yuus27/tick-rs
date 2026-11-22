@echo off
cd /d "%~dp0"
call npm install --no-audit --no-fund
call npm run build
echo.
echo   Klaar. Start tick. opnieuw met start-tick.bat
pause
