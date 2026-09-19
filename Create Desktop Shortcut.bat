@echo off
setlocal
cd /d "%~dp0"
set TARGET=%CD%\Launch Hinterland.bat
set ICON=%CD%pp\icon-512.png
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$s=(New-Object -ComObject WScript.Shell).CreateShortcut([Environment]::GetFolderPath('Desktop')+'\Hinterland.lnk'); $s.TargetPath='%TARGET%'; $s.WorkingDirectory='%CD%'; $s.Description='Shift-share and comparative analysis for Ontario municipalities'; $s.Save()"
echo.
echo   Done - "Hinterland" is on your Desktop.
echo.
pause
