$ErrorActionPreference = "Stop"

$appDir = "C:\Users\pc1\Documents\The Book Author"
$nodePath = "C:\Users\pc1\Documents\.tooling\node-v22.22.1-win-x64\node.exe"
$serverPath = Join-Path $appDir ".next\standalone\server.js"
$standaloneDir = Join-Path $appDir ".next\standalone"
$staticSource = Join-Path $appDir ".next\static"
$staticTarget = Join-Path $standaloneDir ".next\static"
$publicSource = Join-Path $appDir "public"
$publicTarget = Join-Path $standaloneDir "public"

if (!(Test-Path $serverPath)) {
  throw "Standalone server not found at $serverPath"
}

$env:DATABASE_URL = "file:C:/Users/pc1/Documents/storyforge/prisma/dev.db"
$env:STORYFORGE_CONFIG_DIR = $appDir

if (Test-Path $staticSource) {
  New-Item -ItemType Directory -Force -Path $staticTarget | Out-Null
  Copy-Item -Path (Join-Path $staticSource "*") -Destination $staticTarget -Recurse -Force
}

if (Test-Path $publicSource) {
  New-Item -ItemType Directory -Force -Path $publicTarget | Out-Null
  Copy-Item -Path (Join-Path $publicSource "*") -Destination $publicTarget -Recurse -Force
}

Start-Process -FilePath $nodePath -ArgumentList $serverPath -WorkingDirectory $appDir -WindowStyle Minimized
