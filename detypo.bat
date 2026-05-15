@echo off
cd /d "%~dp0"
setlocal enabledelayedexpansion

:: =============================================================================
:: detypo.bat - Detypo PDF Proofreader one-click launcher (Windows)
:: =============================================================================
:: Usage:
::   detypo.bat             Prod mode (build frontend, serve at :3000)
::   detypo.bat dev          Dev mode (hot-reload, opens browser at :4000)
::   detypo.bat stop         Stop all services
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
if /i "%~1"=="stop" goto :stop_all
if /i "%~1"=="dev"  goto :dev_mode

:: ======================== PROD MODE (default) ========================
:prod_mode
echo [detypo] Detypo - Prod Mode

:: Install Python deps if needed
%PYTHON% -c "import fastapi,uvicorn,pymupdf,requests,pydantic" >nul 2>&1
if %errorlevel% neq 0 (
    echo [detypo] Installing Python dependencies...
    pip install -r requirements.txt >nul 2>&1
    if !errorlevel! neq 0 (
        echo [detypo] Python dep install failed. Check network.
        exit /b 1
    )
    echo [detypo] Python deps ready
)

:: Install frontend deps if needed
if not exist "frontend\node_modules\" (
    echo [detypo] Installing frontend dependencies...
    cd frontend
    call npm install --silent
    cd ..
    if !errorlevel! neq 0 (
        echo [detypo] Frontend dep install failed. Check network.
        exit /b 1
    )
    echo [detypo] Frontend deps ready
)

:: Build frontend
echo [detypo] Building frontend...
cd frontend
call npm run build
cd ..
if %errorlevel% neq 0 (
    echo [detypo] Frontend build failed
    exit /b 1
)
echo [detypo] Frontend build done

:: Kill port 3000
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":3000 " ^| findstr "LISTENING"') do taskkill /PID %%p /F >nul 2>&1
timeout /t 1 /nobreak >nul

echo.
echo ======================================
echo   Detypo is running (prod)
echo   URL:  http://127.0.0.1:%BACKEND_PORT%
echo   Stop: Ctrl+C
echo ======================================
echo.
start "" "http://127.0.0.1:%BACKEND_PORT%"
%PYTHON% server.py
goto :eof


:: ======================== DEV MODE ========================
:dev_mode
echo [detypo] Detypo - Dev Mode

:: Install Python deps if needed
%PYTHON% -c "import fastapi,uvicorn,pymupdf,requests,pydantic" >nul 2>&1
if %errorlevel% neq 0 (
    echo [detypo] Installing Python dependencies...
    pip install -r requirements.txt >nul 2>&1
    if !errorlevel! neq 0 (
        echo [detypo] Python dep install failed. Check network.
        exit /b 1
    )
    echo [detypo] Python deps ready
)

:: Install frontend deps if needed
if not exist "frontend\node_modules\" (
    echo [detypo] Installing frontend dependencies...
    cd frontend
    call npm install --silent
    cd ..
    if !errorlevel! neq 0 (
        echo [detypo] Frontend dep install failed. Check network.
        exit /b 1
    )
    echo [detypo] Frontend deps ready
)

:: Kill existing processes on our ports
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":3000 " ^| findstr "LISTENING"') do taskkill /PID %%p /F >nul 2>&1
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":4000 " ^| findstr "LISTENING"') do taskkill /PID %%p /F >nul 2>&1
timeout /t 1 /nobreak >nul

:: Start backend
echo [detypo] Starting backend (127.0.0.1:3000)...
start "DetypoBackend" /B %PYTHON% server.py > %TEMP%\detypo-backend.log 2>&1

:: Wait for backend
echo [detypo] Waiting for backend...
set /a _tries=0
:wait_backend
set /a _tries+=1
if %_tries% gtr 30 (
    echo [detypo] WARNING: Backend may not be ready (timeout)
    goto :skip_backend_wait
)
curl -s -o nul http://127.0.0.1:3000 2>nul
if %errorlevel% neq 0 (
    timeout /t 1 /nobreak >nul
    goto :wait_backend
)
:skip_backend_wait
echo [detypo] Backend ready

:: Start frontend
echo [detypo] Starting frontend (127.0.0.1:4000)...
start "DetypoFrontend" /B cmd /c "cd /d %CD%\frontend && npm run dev > %TEMP%\detypo-frontend.log 2>&1"

:: Wait for frontend
echo [detypo] Waiting for frontend...
set /a _tries=0
:wait_frontend
set /a _tries+=1
if %_tries% gtr 30 (
    echo [detypo] WARNING: Frontend may not be ready (timeout)
    goto :skip_frontend_wait
)
curl -s -o nul http://127.0.0.1:4000 2>nul
if %errorlevel% neq 0 (
    timeout /t 1 /nobreak >nul
    goto :wait_frontend
)
:skip_frontend_wait
echo [detypo] Frontend ready

echo.
echo ======================================
echo   Detypo is running
echo   URL:  http://127.0.0.1:%FRONTEND_PORT%
echo   Stop: detypo.bat stop
echo ======================================
echo.
start "" "http://127.0.0.1:%FRONTEND_PORT%"
goto :eof


:: ======================== STOP ========================
:stop_all
echo [detypo] Stopping services...
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":3000 " ^| findstr "LISTENING"') do taskkill /PID %%p /F >nul 2>&1
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":4000 " ^| findstr "LISTENING"') do taskkill /PID %%p /F >nul 2>&1
taskkill /F /IM node.exe >nul 2>&1
echo [detypo] Stopped
goto :eof
