@echo off
cd /d "%~dp0"
setlocal enabledelayedexpansion

:: =============================================================================
:: detypo.bat - Detypo PDF Proofreader one-click launcher (Windows)
:: =============================================================================
:: Usage:
::   detypo.bat             Prod mode (build, serve at :3000) [default]
::   detypo.bat dev          Dev mode (hot-reload, opens :4000)
::   detypo.bat stop         Stop all services (dev mode)
::
:: Prod mode: server runs in this window. Ctrl+C or close window to stop.
:: Dev mode:  services run in background. Use detypo.bat stop to stop.
::
:: Requires: Python 3.10+, Node.js 18+
:: =============================================================================

set BACKEND_PORT=3000
set FRONTEND_PORT=4000

:: ---- Find Python ----
set PYTHON=
for %%c in (python python3) do (
    where %%c >nul 2>nul
    if !errorlevel!==0 (
        %%c --version >nul 2>&1
        if !errorlevel!==0 (
            set PYTHON=%%c
            goto :python_found
        )
    )
)
echo [detypo] Python not found. Please install Python 3.10+
exit /b 1
:python_found

:: ---- Check Node ----
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [detypo] Node.js not found. Please install Node.js 18+
    exit /b 1
)

:: ---- Dispatch ----
if /i "%~1"=="stop"  goto :do_stop
if /i "%~1"=="dev"   goto :do_dev
goto :do_prod

:: ======================== PROD MODE (default) ========================
:do_prod
echo [detypo] Detypo - Prod Mode

:: Install Python deps
%PYTHON% -c "import fastapi,uvicorn,pymupdf,requests,pydantic" >nul 2>&1
if %errorlevel% neq 0 (
    echo [detypo] Installing Python dependencies...
    pip install -r requirements.txt >nul 2>&1
    if !errorlevel! neq 0 (
        echo [detypo] Python dep install failed
        exit /b 1
    )
    echo [detypo] Python deps ready
)

:: Install and build frontend
if not exist "frontend\node_modules\" (
    echo [detypo] Installing frontend dependencies...
    cd frontend
    call npm install --silent
    cd ..
    if !errorlevel! neq 0 (
        echo [detypo] Frontend dep install failed
        exit /b 1
    )
    echo [detypo] Frontend deps ready
)
echo [detypo] Building frontend...
cd frontend
call npm run build
cd ..
if %errorlevel% neq 0 (
    echo [detypo] Frontend build failed
    exit /b 1
)
echo [detypo] Frontend build done

:: Kill existing process on port 3000
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":3000 " ^| findstr "LISTENING"') do taskkill /PID %%p /F /T >nul 2>&1
timeout /t 1 /nobreak >nul

echo.
echo ======================================
echo   Detypo is running (prod)
echo   URL:  http://127.0.0.1:3000
echo   Stop: Ctrl+C or close this window
echo ======================================
echo.
start "" "http://127.0.0.1:3000"

set DETYPO_PROD=1
%PYTHON% server.py
echo.
echo [detypo] Server stopped. Cleaning up...
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":3000 " ^| findstr "LISTENING"') do taskkill /PID %%p /F /T >nul 2>&1
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":4000 " ^| findstr "LISTENING"') do taskkill /PID %%p /F /T >nul 2>&1
taskkill /F /IM python.exe >nul 2>&1
taskkill /F /IM node.exe >nul 2>&1
echo [detypo] Done
goto :eof


:: ======================== DEV MODE ========================
:do_dev
echo [detypo] Detypo - Dev Mode

:: Install Python deps
%PYTHON% -c "import fastapi,uvicorn,pymupdf,requests,pydantic" >nul 2>&1
if %errorlevel% neq 0 (
    echo [detypo] Installing Python dependencies...
    pip install -r requirements.txt >nul 2>&1
    if !errorlevel! neq 0 (
        echo [detypo] Python dep install failed
        exit /b 1
    )
    echo [detypo] Python deps ready
)

:: Install frontend deps
if not exist "frontend\node_modules\" (
    echo [detypo] Installing frontend dependencies...
    cd frontend
    call npm install --silent
    cd ..
    if !errorlevel! neq 0 (
        echo [detypo] Frontend dep install failed
        exit /b 1
    )
    echo [detypo] Frontend deps ready
)

:: Kill ports
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":3000 " ^| findstr "LISTENING"') do taskkill /PID %%p /F /T >nul 2>&1
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":4000 " ^| findstr "LISTENING"') do taskkill /PID %%p /F >nul 2>&1
timeout /t 1 /nobreak >nul

:: Start backend
echo [detypo] Starting backend (127.0.0.1:3000)...
start "DetypoBackend" /B cmd /c "%PYTHON% server.py > %TEMP%\detypo-backend-%RANDOM%.log 2>&1"

:: Wait for backend
echo [detypo] Waiting for backend...
set /a _tries=0
:dev_wait_backend
set /a _tries+=1
if %_tries% gtr 30 goto :dev_backend_timeout
curl -s -o nul http://127.0.0.1:3000 2>nul
if %errorlevel% neq 0 (
    timeout /t 1 /nobreak >nul
    goto :dev_wait_backend
)
goto :dev_backend_ready
:dev_backend_timeout
echo [detypo] WARNING: Backend may not be ready
:dev_backend_ready
echo [detypo] Backend ready

:: Start frontend
echo [detypo] Starting frontend (127.0.0.1:4000)...
start "DetypoFrontend" /B cmd /c "cd /d %CD%\frontend && npm run dev > %TEMP%\detypo-frontend.log 2>&1"

:: Wait for frontend
echo [detypo] Waiting for frontend...
set /a _tries=0
:dev_wait_frontend
set /a _tries+=1
if %_tries% gtr 30 goto :dev_frontend_timeout
curl -s -o nul http://127.0.0.1:4000 2>nul
if %errorlevel% neq 0 (
    timeout /t 1 /nobreak >nul
    goto :dev_wait_frontend
)
goto :dev_frontend_ready
:dev_frontend_timeout
echo [detypo] WARNING: Frontend may not be ready
:dev_frontend_ready
echo [detypo] Frontend ready

echo.
echo ======================================
echo   Detypo is running (dev)
echo   URL:  http://127.0.0.1:4000
echo   Stop: detypo.bat stop
echo ======================================
echo.
start "" "http://127.0.0.1:4000"
goto :eof


:: ======================== STOP ========================
:do_stop
echo [detypo] Stopping services...
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":3000 " ^| findstr "LISTENING"') do taskkill /PID %%p /F /T >nul 2>&1
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":4000 " ^| findstr "LISTENING"') do taskkill /PID %%p /F /T >nul 2>&1
taskkill /F /IM python.exe >nul 2>&1
taskkill /F /IM node.exe >nul 2>&1
echo [detypo] Stopped
goto :eof
