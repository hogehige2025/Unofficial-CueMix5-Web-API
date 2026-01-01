@echo off
pushd %~dp0
REM Executes the main PowerShell script with the "Enable" mode.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "SetStartupTask.ps1" -Mode Disable
popd