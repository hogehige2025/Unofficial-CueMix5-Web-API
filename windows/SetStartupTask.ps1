# =============================================================================
# SetStartupTask.ps1
#
# This script enables or disables the auto-start task for the 
# Unofficial CueMix5 applications (Web API and Watcher).
# It should be run with administrator privileges.
# =============================================================================

# --- Script Parameters ---
param(
    [Parameter(Mandatory=$true)]
    [ValidateSet('Enable', 'Disable')]
    [string]$Mode
)

# --- Configuration ---
$Applications = @(
    @{
        TaskName = "Unofficial CueMix5 Web API"
        ExecutableName = "uo_cm5_webapi.exe"
        Description = "Starts the Unofficial CueMix5 Web API when the user logs on."
    },
    @{
        TaskName = "Unofficial CueMix5 Watcher"
        ExecutableName = "uo_cm5_watcher.exe"
        Description = "Starts the Unofficial CueMix5 Watcher when the user logs on."
    }
)
$AppDataConfigDirName = "uo_cm5_webapi"

# --- Script Setup ---
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$AppDataConfigPath = Join-Path $env:APPDATA $AppDataConfigDirName

# --- Helper Functions ---
function Write-Host-Color { param([string]$Message, [string]$Color); Write-Host $Message -ForegroundColor $Color }
function Check-Admin {
    Write-Host-Color "`n--- Checking for administrator privileges ---" -Color Cyan
    $currentUser = New-Object Security.Principal.WindowsPrincipal ([Security.Principal.WindowsIdentity]::GetCurrent())
    if (-not $currentUser.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        Write-Host-Color "ERROR: This script must be run with administrator privileges." -Color Red
        return $false
    }
    Write-Host-Color "  -> Success: Running as administrator." -Color Green
    return $true
}

# =============================================================================
# --- Main Logic ---
# =============================================================================

if (-not (Check-Admin)) { pause; return }

# --- Enable Mode ---
if ($Mode -eq 'Enable') {
    Write-Host-Color "`n--- Cleaning up old settings ---" -Color Cyan
    $commandsJsonPath = Join-Path $AppDataConfigPath "commands.json"
    if (Test-Path $commandsJsonPath) {
        try {
            Remove-Item $commandsJsonPath -Force
            Write-Host-Color "  -> Success: Removed '$commandsJsonPath'." -Color Green
        } catch {
            Write-Host-Color "  -> ERROR: Failed to remove '$commandsJsonPath'. Error: $_" -Color Red
        }
    } else {
        Write-Host-Color "  -> '$commandsJsonPath' does not exist. Skipping removal." -Color Yellow
    }
    $oldConfigPath = "uo_cm5_watcher.cfg"
    if (Test-Path $oldConfigPath) {
        try {
            Remove-Item $oldConfigPath -Force
            Write-Host-Color "  -> Success: Removed '$oldConfigPath'." -Color Green
        } catch {
            Write-Host-Color "  -> ERROR: Failed to remove '$oldConfigPath'. Error: $_" -Color Red
        }
    } else {
        Write-Host-Color "  -> '$oldConfigPath' does not exist. Skipping removal." -Color Yellow
    }
    foreach ($app in $Applications) {
        Write-Host-Color "`n--- Register task: $($app.TaskName) ---" -Color Cyan
        $task = Get-ScheduledTask -TaskName $app.TaskName -ErrorAction SilentlyContinue
        if (!$task) {
            try {
                $Action = New-ScheduledTaskAction -Execute (Join-Path $ScriptDir $app.ExecutableName) -WorkingDirectory $ScriptDir
                $Trigger = New-ScheduledTaskTrigger -AtLogOn
                $logonType = "S4U"
                if ($app.ExecutableName -eq "uo_cm5_watcher.exe") {
                    $logonType = "Interactive"
                }
                $Principal = New-ScheduledTaskPrincipal -UserId (whoami) -LogonType $logonType -RunLevel Limited
                Register-ScheduledTask -TaskName $app.TaskName -Action $Action -Trigger $Trigger -Principal $Principal -Description $app.Description | Out-Null
                Write-Host-Color "  -> Success: Task '$($app.TaskName)' registered." -Color Green
                Start-ScheduledTask -TaskName $app.TaskName
		Write-Host-Color "  -> Success: Task '$($app.TaskName)' started." -Color Green
            } catch {
                Write-Host-Color "  -> ERROR: Failed to create or start task '$($app.TaskName)'. Error: $_" -Color Red
            }
        } else {
            Write-Host-Color "  -> Task already exists. Skipping." -Color Yellow
        }
    }

    # === Final Verification and Actions ===
    Write-Host-Color "`n--- Verifying processes and configuration ---" -Color Cyan
    Start-Sleep -Seconds 3
    foreach ($app in $Applications) {
        $process = Get-Process -Name ($app.ExecutableName -replace '.exe','') -ErrorAction SilentlyContinue
        if ($process) { Write-Host-Color "  -> Success: Process '$($app.ExecutableName)' is running (PID: $($process.Id))." -Color Green }
        else { Write-Host-Color "  -> WARNING: Process '$($app.ExecutableName)' does not appear to be running." -Color Yellow }
    }

    if (Test-Path $AppDataConfigPath) { Write-Host-Color "  -> Success: Configuration directory found at '$AppDataConfigPath'." -Color Green }
    else { Write-Host-Color "  -> WARNING: Configuration directory not found." -Color Yellow }

    try {
        $settingsJsonPath = Join-Path $AppDataConfigPath "settings.json"
        $settingsContent = Get-Content -Path $settingsJsonPath -Raw | ConvertFrom-Json
        $port = $settingsContent.listeningPort
        if ($port) {
            $url = "http://localhost:$port"
            Write-Host-Color "  -> Opening Web UI at $url..." -Color Cyan
            Start-Process $url
        } else { Write-Host-Color "  -> Could not determine listening port from settings." -Color Yellow }
    } catch { Write-Host-Color "  -> Could not read settings to open Web UI. Error: $_" -Color Yellow }
}

# --- Disable Mode ---
if ($Mode -eq 'Disable') {
    
    foreach ($app in $Applications) {
        Write-Host-Color "`n--- Remove Task: $($app.TaskName) ---" -Color Cyan
        $task = Get-ScheduledTask -TaskName $app.TaskName -ErrorAction SilentlyContinue
        if ($task) {
            try {
                Stop-ScheduledTask -TaskName $app.TaskName
		Write-Host-Color "  -> Success: Task '$($app.TaskName)' stopped." -Color Green
                Unregister-ScheduledTask -TaskName $app.TaskName -Confirm:$false
                Write-Host-Color "  -> Success: Task '$($app.TaskName)' removed." -Color Green
            } catch {
                Write-Host-Color "  -> ERROR: Failed to remove task '$($app.TaskName)'. Error: $_" -Color Red
            }
        } else {
            Write-Host-Color "  -> Task does not exist. Skipping." -Color Yellow
        }
    }

    # === Final Verification ===
    Write-Host-Color "`n--- Verifying processes are stopped ---" -Color Cyan
    Start-Sleep -Seconds 2
    foreach ($app in $Applications) {
        $process = Get-Process -Name ($app.ExecutableName -replace '.exe','') -ErrorAction SilentlyContinue
        if ($process) {
            Write-Host-Color "  -> WARNING: Process '$($app.ExecutableName)' is still running. Forcing stop." -Color Yellow
            Stop-Process -Name ($app.ExecutableName -replace '.exe','') -Force -ErrorAction SilentlyContinue
        } else {
            Write-Host-Color "  -> Success: Process '$($app.ExecutableName)' is not running." -Color Green
        }
    }
}

Write-Host-Color "`n--- Script Finished ---" -Color Yellow
cmd /c timeout 5