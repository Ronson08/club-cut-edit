Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "      CLUBCUT EDIT - AI SPEECH & MEDIA STUDIO" -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Verify FFmpeg
if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) {
    Write-Host "[ERROR] FFmpeg is not detected in your PATH." -ForegroundColor Red
    Write-Host "Please install FFmpeg to enable audio normalization and media extraction."
    Read-Host "Press Enter to exit"
    exit 1
}
Write-Host "[OK] FFmpeg detected." -ForegroundColor Green

# 2. Verify Python
if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    Write-Host "[ERROR] Python 3.10+ is not detected in your PATH." -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}
Write-Host "[OK] Python detected." -ForegroundColor Green

# 3. Verify npm
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Host "[ERROR] Node.js / npm is not detected in your PATH." -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}
Write-Host "[OK] Node.js & npm detected." -ForegroundColor Green

Write-Host ""
$rootDir = $PSScriptRoot
$mediaDir = Join-Path $rootDir "backend\data\media"
if (-not (Test-Path $mediaDir)) {
    New-Item -ItemType Directory -Path $mediaDir -Force | Out-Null
}

# Auto-release port 8000 to prevent WinError 10013 socket permission errors
$port8000 = Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue
if ($port8000) {
    $pidsToKill = $port8000.OwningProcess | Select-Object -Unique | Where-Object { $_ -gt 0 }
    if ($pidsToKill) {
        Write-Host "[INFO] Port 8000 in use. Releasing old backend process ($pidsToKill)..." -ForegroundColor Yellow
        foreach ($p in $pidsToKill) {
            Stop-Process -Id $p -Force -ErrorAction SilentlyContinue
        }
        Start-Sleep -Milliseconds 800
    }
}

# Auto-release port 5173 to prevent frontend port drift
$port5173 = Get-NetTCPConnection -LocalPort 5173 -ErrorAction SilentlyContinue
if ($port5173) {
    $pidsToKill = $port5173.OwningProcess | Select-Object -Unique | Where-Object { $_ -gt 0 }
    if ($pidsToKill) {
        Write-Host "[INFO] Port 5173 in use. Releasing old frontend process ($pidsToKill)..." -ForegroundColor Yellow
        foreach ($p in $pidsToKill) {
            Stop-Process -Id $p -Force -ErrorAction SilentlyContinue
        }
        Start-Sleep -Milliseconds 800
    }
}

Write-Host "[1/2] Launching FastAPI Backend on http://localhost:8000 ..." -ForegroundColor Yellow
Start-Process cmd.exe -ArgumentList "/k", "cd /d `"$rootDir\backend`" && python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload"

Write-Host "[2/2] Launching React Vite Frontend on http://localhost:5173 ..." -ForegroundColor Yellow
Start-Process cmd.exe -ArgumentList "/k", "cd /d `"$rootDir\frontend`" && npm run dev"

Start-Sleep -Seconds 3
Start-Process "http://localhost:5173"

Write-Host ""
Write-Host "========================================================" -ForegroundColor Green
Write-Host "   ClubCut Edit is now running!" -ForegroundColor Green
Write-Host "   - Frontend:  http://localhost:5173" -ForegroundColor White
Write-Host "   - Backend:   http://localhost:8000" -ForegroundColor White
Write-Host "   - API Docs:  http://localhost:8000/docs" -ForegroundColor White
Write-Host "========================================================" -ForegroundColor Green
Write-Host ""
