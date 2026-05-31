@echo off
cd /d "%~dp0"
setlocal enabledelayedexpansion

:: =============================================================================
:: detypo.bat - Detypo PDF Proofreader one-click launcher (Windows)
:: =============================================================================
:: Usage:
::   detypo.bat             Prod mode (build, serve at auto-detected port)
::   detypo.bat dev          Dev mode (hot-reload, opens on auto-detected ports)
::   detypo.bat stop         Stop all services
::
:: Prod mode: server runs in this window. Ctrl+C or close window to stop.
:: Dev mode:  services run in background. Use detypo.bat stop to stop.
::
:: Ports are auto-detected (OS-assigned). The actual ports are shown in the
:: banner. The backend writes .detypo-port so cleanup knows which port to kill.
::
:: Requires: Python 3.10+, Node.js 18+
:: =============================================================================

set "PORT_FILE=%~dp0.detypo-port"
set "TMP_PY=%TEMP%\detypo_find_port.py"

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
pause
exit /b 1
:python_found

:: ---- Write a tiny Python script to find an available port ----
:: Uses individual echo lines instead of a block to avoid () escaping issues.
:: Accepts an optional preferred port as first argument.
echo import socket, sys > "%TMP_PY%"
echo preferred = int(sys.argv[1]) if len(sys.argv) ^> 1 else 0 >> "%TMP_PY%"
echo s = socket.socket() >> "%TMP_PY%"
echo try: >> "%TMP_PY%"
echo   if preferred: s.bind(("127.0.0.1", preferred)) >> "%TMP_PY%"
echo   else: s.bind(("127.0.0.1", 0)) >> "%TMP_PY%"
echo except OSError: >> "%TMP_PY%"
echo   s.bind(("127.0.0.1", 0)) >> "%TMP_PY%"
echo print(s.getsockname()[1]) >> "%TMP_PY%"
echo s.close() >> "%TMP_PY%"

:: ---- Find backend port: reuse last port if still available ----
set "PREFERRED_PORT=0"
if exist "%PORT_FILE%" (
    set /p PREFERRED_PORT=<"%PORT_FILE%"
)
for /f "usebackq" %%p in (`%PYTHON% "%TMP_PY%" !PREFERRED_PORT!`) do set "BACKEND_PORT=%%p"

:: ---- Find frontend port ----
for /f "usebackq" %%p in (`%PYTHON% "%TMP_PY%" 0`) do set "FRONTEND_PORT=%%p"
del "%TMP_PY%" >nul 2>&1

:: ---- Check Node ----
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [detypo] Node.js not found. Please install Node.js 18+
    pause
    exit /b 1
)

:: ---- Dispatch ----
if /i "%~1"=="stop" goto :do_stop
if /i "%~1"=="dev"  goto :do_dev
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
        pause
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
        pause
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
    pause
    exit /b 1
)
echo [detypo] Frontend build done

echo.
echo ======================================
echo   Detypo is running (prod^)
echo   URL:  http://127.0.0.1:%BACKEND_PORT%
echo   Stop: Ctrl+C or close this window
echo ======================================
echo.
start "" "http://127.0.0.1:%BACKEND_PORT%"

set DETYPO_PROD=1
%PYTHON% server.py --port %BACKEND_PORT%
echo.
echo [detypo] Server stopped. Cleaning up...
del "%PORT_FILE%" >nul 2>&1
echo [detypo] Done
pause
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
        pause
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
        pause
        exit /b 1
    )
    echo [detypo] Frontend deps ready
)

:: Start backend
echo [detypo] Starting backend (127.0.0.1:%BACKEND_PORT%^)...
start "DetypoBackend" /B cmd /c "%PYTHON% server.py --port %BACKEND_PORT% > %TEMP%\detypo-backend.log 2>&1"

:: Wait for backend
echo [detypo] Waiting for backend...
set /a _tries=0
:dev_wait_backend
set /a _tries+=1
if %_tries% gtr 30 goto :dev_backend_timeout
curl -s -o nul http://127.0.0.1:%BACKEND_PORT% 2>nul
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
echo [detypo] Starting frontend (127.0.0.1:%FRONTEND_PORT%^)...
start "DetypoFrontend" /B cmd /c "cd /d %CD%\frontend && npm run dev -- --port %FRONTEND_PORT% > %TEMP%\detypo-frontend.log 2>&1"

:: Wait for frontend
echo [detypo] Waiting for frontend...
set /a _tries=0
:dev_wait_frontend
set /a _tries+=1
if %_tries% gtr 30 goto :dev_frontend_timeout
curl -s -o nul http://127.0.0.1:%FRONTEND_PORT% 2>nul
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
echo   Detypo is running (dev^)
echo   URL:  http://127.0.0.1:%FRONTEND_PORT%
echo   Stop: detypo.bat stop
echo ======================================
echo.
start "" "http://127.0.0.1:%FRONTEND_PORT%"
goto :eof


:: ======================== STOP ========================
:do_stop
echo [detypo] Stopping services...

:: Read port file to clean up the actual backend port
if exist "%PORT_FILE%" (
    set /p _active_port=<"%PORT_FILE%"
    for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":!_active_port! " ^| findstr "LISTENING"') do taskkill /PID %%p /F /T >nul 2>&1
    del "%PORT_FILE%" >nul 2>&1
)

:: Kill by window title (dev mode processes)
taskkill /FI "WINDOWTITLE eq DetypoBackend*" /F /T >nul 2>&1
taskkill /FI "WINDOWTITLE eq DetypoFrontend*" /F /T >nul 2>&1

:: Fallback: kill anything on default ports
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":8520 " ^| findstr "LISTENING"') do taskkill /PID %%p /F /T >nul 2>&1
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":5173 " ^| findstr "LISTENING"') do taskkill /PID %%p /F /T >nul 2>&1

echo [detypo] Stopped
goto :eof
