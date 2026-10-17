@echo off
setlocal enabledelayedexpansion

echo ========================================================
echo       CLUBCUT EDIT - AI SPEECH & MEDIA STUDIO
echo ========================================================
echo.

:: 1. Verify FFmpeg
where ffmpeg >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] FFmpeg is not detected in your PATH.
    echo Please install FFmpeg to enable audio normalization and media extraction.
    pause
    exit /b 1
)
echo [OK] FFmpeg detected.

:: 2. Verify Python
where python >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Python 3.10+ is not detected in your PATH.
    pause
    exit /b 1
)
echo [OK] Python detected.

:: 3. Verify Node.js
where npm >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js / npm is not detected in your PATH.
    pause
    exit /b 1
)
echo [OK] Node.js & npm detected.

echo.
echo [1/3] Preparing Python backend dependencies & checking ports...
cd /d "%~dp0backend"
if not exist "data\media" mkdir "data\media"

:: Release port 8000 if occupied to prevent WinError 10013
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8000 ^| findstr LISTENING 2^>nul') do (
    if "%%a" neq "0" (
        echo [INFO] Releasing port 8000 (PID %%a)...
        taskkill /F /PID %%a >nul 2>&1
    )
)

:: Release port 5173 if occupied
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :5173 ^| findstr LISTENING 2^>nul') do (
    if "%%a" neq "0" (
        echo [INFO] Releasing port 5173 (PID %%a)...
        taskkill /F /PID %%a >nul 2>&1
    )
)

echo [2/3] Launching FastAPI Backend on http://localhost:8000 ...
start "ClubCut Backend (Port 8000)" cmd /k "python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload"

echo [3/3] Launching React Vite Frontend on http://localhost:5173 ...
cd /d "%~dp0frontend"
start "ClubCut Frontend (Port 5173)" cmd /k "npm run dev"

timeout /t 3 /nobreak >nul
start http://localhost:5173

echo.
echo ========================================================
echo    ClubCut Edit is now running!
echo    - Frontend:  http://localhost:5173
echo    - Backend:   http://localhost:8000
echo    - API Docs:  http://localhost:8000/docs
echo ========================================================
echo.
pause
