@echo off
setlocal

set "APP_DIR=%~dp0"
if "%APP_DIR:~-1%"=="\" set "APP_DIR=%APP_DIR:~0,-1%"
set "RUNTIME_DIR=%APP_DIR%\runtime"
set "NODE_DIR=%APP_DIR%\node"
if not exist "%NODE_DIR%\node.exe" set "NODE_DIR=C:\Users\pc1\Documents\.tooling\node-v22.22.1-win-x64"
set "PATH=%NODE_DIR%;%PATH%"
set "PORT=3000"
set "HEALTH_URL=http://localhost:%PORT%/api/health"
set "RUNTIME_LOG=%APP_DIR%\.the-book-author-runtime.log"
set "EDGE_EXE=C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$conn = Get-NetTCPConnection -LocalPort %PORT% -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1; if ($conn) { exit 0 } else { exit 1 }"

if errorlevel 1 (
  start "The Book Author Server" /min "%APP_DIR%\The Book Author Server.cmd"
)

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$deadline = (Get-Date).AddSeconds(30); do { try { $response = Invoke-WebRequest -UseBasicParsing '%HEALTH_URL%'; if ($response.StatusCode -eq 200) { exit 0 } } catch {}; Start-Sleep -Milliseconds 500 } while ((Get-Date) -lt $deadline); exit 1"

if errorlevel 1 goto :start_failed

if exist "%EDGE_EXE%" (
  start "" "%EDGE_EXE%" --app=http://localhost:%PORT%
) else (
  start "" http://localhost:%PORT%
)

exit /b 0

:start_failed
echo The Book Author did not start in time.
echo Check "%RUNTIME_LOG%" for details.
pause
exit /b 1
