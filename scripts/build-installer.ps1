$ErrorActionPreference = "Stop"

$appDir = "C:\Users\pc1\Documents\The Book Author"
$nodeSourceDir = "C:\Users\pc1\Documents\.tooling\node-v22.22.1-win-x64"
$distDir = Join-Path $appDir "dist"
$stagingDir = Join-Path $distDir "installer-staging"
$payloadRoot = Join-Path $stagingDir "The-Book-Author"
$payloadZip = Join-Path $stagingDir "the-book-author-payload.zip"
$installCmdSource = Join-Path $appDir "installer\install.cmd"
$installCmdTarget = Join-Path $payloadRoot "install.cmd"
$installerPath = Join-Path $distDir "The-Book-Author-Installer.cmd"

function Ensure-CleanDirectory([string]$path) {
  if (Test-Path $path) {
    Remove-Item $path -Recurse -Force
  }

  New-Item -ItemType Directory -Path $path | Out-Null
}

Ensure-CleanDirectory $distDir
Ensure-CleanDirectory $stagingDir
Ensure-CleanDirectory $payloadRoot

$includePaths = @(
  "Launch The Book Author.cmd",
  "The Book Author Server.cmd",
  "Stop The Book Author.cmd",
  "runtime",
  "prisma",
  "exports",
  ".env.example"
)

foreach ($relativePath in $includePaths) {
  $source = Join-Path $appDir $relativePath
  if (-not (Test-Path $source)) {
    continue
  }

  $destination = Join-Path $payloadRoot $relativePath
  if ((Get-Item $source).PSIsContainer) {
    New-Item -ItemType Directory -Path $destination -Force | Out-Null
    Copy-Item -Path (Join-Path $source "*") -Destination $destination -Recurse -Force
  } else {
    $parent = Split-Path $destination -Parent
    New-Item -ItemType Directory -Path $parent -Force | Out-Null
    Copy-Item -Path $source -Destination $destination -Force
  }
}

if (-not (Test-Path (Join-Path $nodeSourceDir "node.exe"))) {
  throw "Portable Node runtime was not found at $nodeSourceDir"
}

$nodeTargetDir = Join-Path $payloadRoot "node"
New-Item -ItemType Directory -Path $nodeTargetDir -Force | Out-Null
Copy-Item -Path (Join-Path $nodeSourceDir "node.exe") -Destination (Join-Path $nodeTargetDir "node.exe") -Force

Copy-Item -Path $installCmdSource -Destination $installCmdTarget -Force

if (Test-Path (Join-Path $payloadRoot ".the-book-author.providers.json")) {
  Remove-Item (Join-Path $payloadRoot ".the-book-author.providers.json") -Force
}

Set-Content -Path (Join-Path $payloadRoot ".the-book-author.providers.json") -Value @'
{
  "activeProvider": "OPENROUTER",
  "useMockFallback": false,
  "openai": {
    "apiKey": "",
    "model": "gpt-4.1-mini"
  },
  "openrouter": {
    "apiKey": "",
    "model": "openrouter/auto",
    "baseUrl": "https://openrouter.ai/api/v1",
    "siteUrl": "http://localhost:3000",
    "appName": "The Book Author"
  },
  "custom": {
    "apiKey": "",
    "label": "Custom compatible API",
    "baseUrl": "",
    "model": ""
  }
}
'@ -Encoding UTF8

$runtimeEnvPath = Join-Path $payloadRoot "runtime\.env"
if (Test-Path $runtimeEnvPath) {
  Set-Content -Path $runtimeEnvPath -Value @(
    'DATABASE_URL="file:../prisma/dev.db"',
    'OPENAI_API_KEY=""',
    'OPENAI_MODEL="gpt-4.1-mini"',
    'OPENROUTER_API_KEY=""',
    'OPENROUTER_MODEL="openrouter/auto"',
    'OPENROUTER_BASE_URL="https://openrouter.ai/api/v1"',
    'OPENROUTER_SITE_URL="http://localhost:3000"',
    'OPENROUTER_APP_NAME="The Book Author"',
    'OPENROUTER_SETUP_URL="https://openrouter.ai/keys"',
    'STORYFORGE_DEFAULT_PROVIDER="OPENROUTER"',
    'STORYFORGE_REQUIRE_PERSONAL_AI_KEY="true"',
    'USE_MOCK_AI="false"'
  ) -Encoding ASCII
}

if (Test-Path $payloadZip) {
  Remove-Item $payloadZip -Force
}

if (Test-Path $installerPath) {
  Remove-Item $installerPath -Force
}

Compress-Archive -Path (Join-Path $payloadRoot "*") -DestinationPath $payloadZip -CompressionLevel Optimal
$payloadBase64 = [System.Convert]::ToBase64String(
  [System.IO.File]::ReadAllBytes($payloadZip),
  [System.Base64FormattingOptions]::InsertLineBreaks
)

$installerHeader = @'
@echo off
setlocal EnableExtensions
title The Book Author Installer

set "SELF_PATH=%~f0"
set "WORK_DIR=%TEMP%\The-Book-Author-Installer-%RANDOM%%RANDOM%"
set "PAYLOAD_ZIP=%WORK_DIR%\the-book-author-payload.zip"
set "EXPAND_DIR=%WORK_DIR%\The-Book-Author"
set "INSTALL_DIR=%STORYFORGE_INSTALL_DIR%"
if not defined INSTALL_DIR set "INSTALL_DIR=%LOCALAPPDATA%\The Book Author"
set "SHORTCUT_DIR=%STORYFORGE_SHORTCUT_DIR%"
if not defined SHORTCUT_DIR set "SHORTCUT_DIR=%USERPROFILE%\Desktop"
set "DESKTOP_SHORTCUT=%SHORTCUT_DIR%\The Book Author.lnk"
set "SHOULD_LAUNCH=1"
if /I "%STORYFORGE_SKIP_LAUNCH%"=="1" set "SHOULD_LAUNCH=0"

echo Preparing The Book Author installer...
if exist "%WORK_DIR%" rmdir /s /q "%WORK_DIR%" >nul 2>nul
mkdir "%WORK_DIR%" >nul 2>nul

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$source = $env:SELF_PATH; $output = $env:PAYLOAD_ZIP; $marker = '__STORYFORGE_PAYLOAD_BELOW__'; $content = Get-Content -LiteralPath $source -Raw; $index = $content.LastIndexOf($marker); if ($index -lt 0) { throw 'Installer payload marker was not found.' }; $payload = [regex]::Replace($content.Substring($index + $marker.Length), '\s', ''); [System.IO.File]::WriteAllBytes($output, [System.Convert]::FromBase64String($payload))"
if errorlevel 1 (
  echo The Book Author payload could not be unpacked.
  rmdir /s /q "%WORK_DIR%" >nul 2>nul
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "Expand-Archive -LiteralPath '%PAYLOAD_ZIP%' -DestinationPath '%EXPAND_DIR%' -Force"
if errorlevel 1 (
  echo The Book Author files could not be extracted.
  rmdir /s /q "%WORK_DIR%" >nul 2>nul
  pause
  exit /b 1
)

if not exist "%INSTALL_DIR%" (
  mkdir "%INSTALL_DIR%" >nul 2>nul
)

robocopy "%EXPAND_DIR%" "%INSTALL_DIR%" /MIR /NFL /NDL /NJH /NJS /NP >nul
if errorlevel 8 (
  echo The Book Author files could not be copied into the install location.
  rmdir /s /q "%WORK_DIR%" >nul 2>nul
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$shell = New-Object -ComObject WScript.Shell; $shortcut = $shell.CreateShortcut('%DESKTOP_SHORTCUT%'); $shortcut.TargetPath = '%INSTALL_DIR%\Launch The Book Author.cmd'; $shortcut.WorkingDirectory = '%INSTALL_DIR%'; $shortcut.IconLocation = '%INSTALL_DIR%\runtime\public\storyforge-icon.ico'; $shortcut.Save()"
if errorlevel 1 (
  echo The Book Author installed, but the desktop shortcut could not be created.
)

echo The Book Author was installed to:
echo %INSTALL_DIR%
echo.
echo A desktop shortcut was created or updated.
echo This install does not include an AI key.
echo Add your own key in The Book Author under Settings ^> AI providers.
echo OpenRouter keys: https://openrouter.ai/keys
echo.

if "%SHOULD_LAUNCH%"=="1" (
  start "" "%INSTALL_DIR%\Launch The Book Author.cmd"
)

rmdir /s /q "%WORK_DIR%" >nul 2>nul
exit /b 0

__STORYFORGE_PAYLOAD_BELOW__
'@

Set-Content -Path $installerPath -Value $installerHeader -Encoding ASCII
Add-Content -Path $installerPath -Value $payloadBase64 -Encoding ASCII

$installer = Get-Item $installerPath
[pscustomobject]@{
  Installer = $installer.FullName
  SizeMB = [math]::Round($installer.Length / 1MB, 1)
  PayloadZipMB = [math]::Round((Get-Item $payloadZip).Length / 1MB, 1)
} | Format-Table -AutoSize
