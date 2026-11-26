@echo off
title tick. desktop (test)
cd /d "%~dp0"
if not exist node_modules\electron ( call npm install --no-audit --no-fund )
if not exist node_modules\electron-updater ( call npm install --no-audit --no-fund )
if not exist node_modules\happy-dom ( call npm install --no-audit --no-fund )
call npm run desktop
