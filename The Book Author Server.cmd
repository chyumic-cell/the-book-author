@echo off
setlocal

set "APP_DIR=%~dp0"
if "%APP_DIR:~-1%"=="\" set "APP_DIR=%APP_DIR:~0,-1%"
set "RUNTIME_DIR=%APP_DIR%\runtime"
set "NODE_DIR=%APP_DIR%\node"
if not exist "%NODE_DIR%\node.exe" set "NODE_DIR=C:\Users\pc1\Documents\.tooling\node-v22.22.1-win-x64"
set "PATH=%NODE_DIR%;%PATH%"
set "APP_DIR_URL=%APP_DIR:\=/%"
set "DATABASE_URL=file:%APP_DIR_URL%/prisma/dev.db"
set "STORYFORGE_CONFIG_DIR=%APP_DIR%"

if exist "%APP_DIR%\.next\standalone\server.js" (
  if exist "%APP_DIR%\.next\static" (
    robocopy "%APP_DIR%\.next\static" "%APP_DIR%\.next\standalone\.next\static" /MIR /NFL /NDL /NJH /NJS /NC /NS >nul
  )
  if exist "%APP_DIR%\public" (
    robocopy "%APP_DIR%\public" "%APP_DIR%\.next\standalone\public" /MIR /NFL /NDL /NJH /NJS /NC /NS >nul
  )
  cd /d "%APP_DIR%"
  node "%APP_DIR%\.next\standalone\server.js" > "%APP_DIR%\.the-book-author-runtime.log" 2>&1
  exit /b %errorlevel%
)
cd /d "%RUNTIME_DIR%"
node server.js > "%APP_DIR%\.the-book-author-runtime.log" 2>&1
