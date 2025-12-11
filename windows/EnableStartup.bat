@echo off
REM Executes the main PowerShell script with the "Enable" mode.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0SetStartupTask.ps1" -Mode Enable
