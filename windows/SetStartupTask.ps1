# =============================================================================
# SetStartupTask.ps1
#
# This script enables or disables the auto-start task for the 
# Unofficial CueMix5 Web API application.
# It should be run with administrator privileges.
# =============================================================================

# --- Script Parameters ---
param(
    [Parameter(Mandatory=$true)]
    [ValidateSet('Enable', 'Disable')]
    [string]$Mode
)

# --- XML Template (Embedded) ---
$xmlTemplate = @"
<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Author>%%USER_ID%%</Author>
    <Description>Starts the Unofficial CueMix5 Web API when the user logs on.</Description>
    <URI>\Unofficial CueMix5 Web API</URI>
  </RegistrationInfo>
  <Triggers>
    <LogonTrigger>
      <Enabled>true</Enabled>
      <UserId>%%USER_ID%%</UserId>
    </LogonTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <UserId>%%USER_ID%%</UserId>
      <LogonType>S4U</LogonType>
      <RunLevel>LeastPrivilege</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>true</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>true</StopIfGoingOnBatteries>
    <AllowHardTerminate>true</AllowHardTerminate>
    <StartWhenAvailable>false</StartWhenAvailable>
    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>
    <IdleSettings>
      <StopOnIdleEnd>true</StopOnIdleEnd>
      <RestartOnIdle>false</RestartOnIdle>
    </IdleSettings>
    <AllowStartOnDemand>true</AllowStartOnDemand>
    <Enabled>true</Enabled>
    <Hidden>false</Hidden>
    <RunOnlyIfIdle>false</RunOnlyIfIdle>
    <WakeToRun>false</WakeToRun>
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
    <Priority>7</Priority>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>%%EXECUTABLE_PATH%%</Command>
      <WorkingDirectory>%%WORKING_DIRECTORY%%</WorkingDirectory>
    </Exec>
  </Actions>
</Task>
"@

# --- Configuration ---
$TaskName = "Unofficial CueMix5 Web API"
$ExecutableName = "uo_cm5_webapi.exe"
$AppDataConfigDirName = "uo_cm5_webapi"

# --- Script Setup ---
# Get the directory where this script is located.
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition

# Define paths relative to the script location.
$TempXmlPath = Join-Path $ScriptDir 'uo_cm5_webapi.xml'
$ExecutablePath = Join-Path $ScriptDir $ExecutableName
$AppDataConfigPath = Join-Path $env:APPDATA $AppDataConfigDirName

# --- Helper Functions ---
function Write-Host-Color {
    param(
        [string]$Message,
        [string]$Color
    )
    Write-Host $Message -ForegroundColor $Color
}

function Check-Admin {
    Write-Host "1. Checking for administrator privileges..."
    $currentUser = New-Object Security.Principal.WindowsPrincipal ([Security.Principal.WindowsIdentity]::GetCurrent())
    if (-not $currentUser.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        Write-Host-Color "ERROR: This script must be run with administrator privileges." -Color Red
        return $false
    }
    Write-Host-Color "  -> Success: Running as administrator." -Color Green
    return $true
}

function Check-Task-Exists {
    schtasks /query /TN $TaskName > $null 2>&1
    return $? # $? is true if the last command succeeded, false otherwise.
}

# =============================================================================
# --- Main Logic ---
# =============================================================================

# --- Enable Mode ---
if ($Mode -eq 'Enable') {
    Write-Host-Color "--- Enabling Startup Task ---" -Color Yellow

    # 1. Check for admin privileges
    if (-not (Check-Admin)) { pause; return }

    # 2. Check if the task already exists
    Write-Host "2. Checking if task '$TaskName' already exists..."
    if (Check-Task-Exists) {
        Write-Host-Color "  -> Task already exists. Halting." -Color Yellow
        pause; return
    }
    Write-Host-Color "  -> Task does not exist. Proceeding..." -Color Green

    # 3. Generate XML from template
    Write-Host "3. Generating task definition XML..."
    try {
        $userId = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
        $content = $xmlTemplate.Replace('%%EXECUTABLE_PATH%%', $ExecutablePath).Replace('%%WORKING_DIRECTORY%%', $ScriptDir).Replace('%%USER_ID%%', $userId)
        [System.IO.File]::WriteAllText($TempXmlPath, $content, [System.Text.Encoding]::Unicode)
        Write-Host-Color "  -> Successfully generated '$TempXmlPath'." -Color Green
    } catch {
        Write-Host-Color "  -> ERROR: Failed to generate XML file. Error: $_" -Color Red
        pause; return
    }

    # 4. Add the task
    Write-Host "4. Adding task to Task Scheduler..."
    schtasks /create /xml $TempXmlPath /tn $TaskName /f
    if ($LASTEXITCODE -ne 0) {
        Write-Host-Color "  -> ERROR: Failed to create task. Make sure you are running as an administrator." -Color Red
        Remove-Item -Path $TempXmlPath -ErrorAction SilentlyContinue
        pause; return
    }

    # 5. Verify task creation
    Write-Host "5. Verifying task creation..."
    if (Check-Task-Exists) {
        Write-Host-Color "  -> Success: Task '$TaskName' is registered." -Color Green
    } else {
        Write-Host-Color "  -> ERROR: Task verification failed." -Color Red
        Remove-Item -Path $TempXmlPath -ErrorAction SilentlyContinue
        pause; return
    }

    # 6. Run the task
    Write-Host "6. Starting the task..."
    schtasks /run /TN $TaskName
    Start-Sleep -Seconds 3 # Wait for the process to start

    # 7. Verify process is running
    Write-Host "7. Verifying application process..."
    $process = Get-Process -Name $ExecutableName -ErrorAction SilentlyContinue
    if ($process) {
        Write-Host-Color "  -> Success: Process '$ExecutableName' is running (PID: $($process.Id))." -Color Green
    } else {
        Write-Host-Color "  -> WARNING: Process '$ExecutableName' does not appear to be running. Please check the Task Scheduler for errors." -Color Yellow
    }

    # 8. Verify config directory
    Write-Host "8. Verifying configuration directory..."
    if (Test-Path $AppDataConfigPath) {
        Write-Host-Color "  -> Success: Configuration directory found at '$AppDataConfigPath'." -Color Green
    } else {
        Write-Host-Color "  -> WARNING: Configuration directory not found. The application may create it on first full run." -Color Yellow
    }

    # 9. Open Web UI in browser
    Write-Host "9. Opening Web UI in browser..."
    try {
        $settingsJsonPath = Join-Path $AppDataConfigPath "settings.json"
        $settingsContent = Get-Content -Path $settingsJsonPath -Raw | ConvertFrom-Json
        $port = $settingsContent.listeningPort
        if ($port) {
            $url = "http://localhost:$port"
            Write-Host-Color "  -> Navigating to $url" -Color Cyan
            Start-Process $url
        } else {
            Write-Host-Color "  -> Could not determine listening port from settings." -Color Yellow
        }
    } catch {
        Write-Host-Color "  -> Could not read settings to open Web UI, but the task is running." -Color Yellow
    }
}

# --- Disable Mode ---
if ($Mode -eq 'Disable') {
    Write-Host-Color "--- Disabling Startup Task ---" -Color Yellow

    # 1. Check for admin privileges
    if (-not (Check-Admin)) { pause; return }

    # 2. Check if the task exists
    Write-Host "2. Checking if task '$TaskName' exists..."
    if (-not (Check-Task-Exists)) {
        Write-Host-Color "  -> Task does not exist. Nothing to do." -Color Green
        pause; return
    }
    Write-Host-Color "  -> Task found. Proceeding with removal..." -Color Green

    # 3. Stop the task (if running)..."
    Write-Host "3. Stopping the task (if running)..."
    schtasks /end /TN $TaskName > $null 2>&1

    # 4. Verify process is stopped
    Write-Host "4. Verifying application process is stopped..."
    Start-Sleep -Seconds 2 # Wait for the process to terminate
    $process = Get-Process -Name $ExecutableName -ErrorAction SilentlyContinue
    if ($process) {
        Write-Host-Color "  -> WARNING: Process is still running. Attempting to force-stop." -Color Yellow
        Stop-Process -Name $ExecutableName -Force
        Start-Sleep -Seconds 1
    }
    Write-Host-Color "  -> Success: Process is not running." -Color Green

    # 5. Delete the task
    Write-Host "5. Deleting the task..."
    schtasks /delete /TN $TaskName /f
    if ($LASTEXITCODE -ne 0) {
        Write-Host-Color "  -> ERROR: Failed to delete task." -Color Red
        pause; return
    }

    # 6. Verify task deletion
    Write-Host "6. Verifying task deletion..."
    if (-not (Check-Task-Exists)) {
        Write-Host-Color "  -> Success: Task '$TaskName' has been removed." -Color Green
    } else {
        Write-Host-Color "  -> ERROR: Task still exists after deletion attempt." -Color Red
    }
}

Write-Host-Color "--- Script Finished ---" -Color Yellow
pause
