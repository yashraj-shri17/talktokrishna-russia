@echo off
setlocal
title Talk to Krishna - Launcher

echo ======================================================================
echo 🕉️  TALK TO KRISHNA - AI SPIRITUAL GUIDE
echo ======================================================================
echo.

echo [1/2] Starting AI Backend Server...
start "Krishna AI Backend" cmd /k ".\venv\Scripts\python.exe -X utf8 website/api_server.py"

echo.
echo [2/2] Starting Voice Interface (React)...
echo       This may take a moment to compile...
cd website\krishna-react
start "Krishna Voice UI" cmd /k "npm start"

echo.
echo ======================================================================
echo ✅ SYSTEM LAUNCHED!
echo.
echo 📱 Frontend: http://localhost:3000
echo 🔌 Backend:  http://localhost:5000
echo.
echo You can close this window now.
echo The servers will keep running in their own windows.
echo ======================================================================
pause >nul
