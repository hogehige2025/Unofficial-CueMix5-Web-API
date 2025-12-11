@echo off
REM Executes the main PowerShell script with the "Disable" mode.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0SetStartupTask.ps1" -Mode Disable