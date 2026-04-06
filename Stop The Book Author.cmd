@echo off
setlocal

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$conn = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1; if ($conn) { Stop-Process -Id $conn.OwningProcess -Force; Write-Host 'The Book Author stopped.' } else { Write-Host 'The Book Author is not running.' }"

pause
