@echo off
setlocal

set "TEMP_DIR=%~dp0"
if "%TEMP_DIR:~-1%"=="\" set "TEMP_DIR=%TEMP_DIR:~0,-1%"
set "PAYLOAD_ZIP=%TEMP_DIR%\the-book-author-payload.zip"
set "INSTALL_DIR=%THE_BOOK_AUTHOR_INSTALL_DIR%"
if not defined INSTALL_DIR set "INSTALL_DIR=%LOCALAPPDATA%\The Book Author"
set "SHORTCUT_DIR=%THE_BOOK_AUTHOR_SHORTCUT_DIR%"
if not defined SHORTCUT_DIR set "SHORTCUT_DIR=%USERPROFILE%\Desktop"
set "DESKTOP_SHORTCUT=%SHORTCUT_DIR%\The Book Author.lnk"
set "SHOULD_LAUNCH=1"
if /I "%THE_BOOK_AUTHOR_SKIP_LAUNCH%"=="1" set "SHOULD_LAUNCH=0"

echo Installing The Book Author...

if not exist "%PAYLOAD_ZIP%" (
  echo Could not find the The Book Author payload archive.
  pause
  exit /b 1
)

if exist "%INSTALL_DIR%" (
  echo Updating existing The Book Author installation in "%INSTALL_DIR%".
) else (
  mkdir "%INSTALL_DIR%"
)

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "Expand-Archive -LiteralPath '%PAYLOAD_ZIP%' -DestinationPath '%INSTALL_DIR%' -Force"

if errorlevel 1 (
  echo The Book Author could not be extracted.
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$shell = New-Object -ComObject WScript.Shell; $shortcut = $shell.CreateShortcut('%DESKTOP_SHORTCUT%'); $shortcut.TargetPath = '%INSTALL_DIR%\Launch The Book Author.cmd'; $shortcut.WorkingDirectory = '%INSTALL_DIR%'; $shortcut.IconLocation = '%INSTALL_DIR%\public\the-book-author-icon.ico'; $shortcut.Save()"

echo The Book Author was installed to:
echo %INSTALL_DIR%
echo.
echo A desktop shortcut was created.
echo This install does not include an AI key.
echo Add your own key in The Book Author under Settings ^> AI providers.
echo OpenRouter keys: https://openrouter.ai/keys
echo.

if "%SHOULD_LAUNCH%"=="1" (
  start "" "%INSTALL_DIR%\Launch The Book Author.cmd"
)
exit /b 0
