# setup-schedule.ps1
# Right-click this file and select "Run as Administrator" to set up the 3x/week schedule
# This creates a Task Scheduler task that runs generate-now.bat every Mon/Wed/Fri at 9 AM

$taskName = "MyTXEstatePlan-VideoGeneration"
$taskFolder = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host " My Texas Estate Plan - Schedule Setup" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Task name:   $taskName"
Write-Host "Script path: $taskFolder"
Write-Host "Schedule:    Monday, Wednesday, Friday at 9:00 AM"
Write-Host ""

# Delete existing task if it exists
if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
    Write-Host "Removed existing task." -ForegroundColor Yellow
}

# Create action: run generate-now.bat from the project folder
$action = New-ScheduledTaskAction `
    -Execute "cmd.exe" `
    -Argument "/c `"$taskFolder\generate-now.bat`"" `
    -WorkingDirectory $taskFolder

# Create triggers: Mon, Wed, Fri at 9 AM
$triggerMon = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday    -At "9:00AM"
$triggerWed = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Wednesday -At "9:00AM"
$triggerFri = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Friday    -At "9:00AM"

# Settings: run even if on battery, allow up to 2 hours, start missed tasks within 1 hour
$settings = New-ScheduledTaskSettingsSet `
    -RunOnlyIfNetworkAvailable `
    -ExecutionTimeLimit (New-TimeSpan -Hours 2) `
    -StartWhenAvailable `
    -DisallowDemandStart:$false

# Register the task (runs as current user, elevated)
Register-ScheduledTask `
    -TaskName $taskName `
    -Action $action `
    -Trigger @($triggerMon, $triggerWed, $triggerFri) `
    -Settings $settings `
    -RunLevel Highest `
    -Description "Generates and uploads humorous estate planning YouTube Shorts to the My Texas Estate Plan channel" `
    -Force

Write-Host ""
Write-Host "SUCCESS! Task created:" -ForegroundColor Green
Write-Host "  Name:     $taskName" -ForegroundColor Green
Write-Host "  Runs:     Mon / Wed / Fri at 9:00 AM" -ForegroundColor Green
Write-Host ""
Write-Host "To run it manually right now:"
Write-Host "  Start-ScheduledTask -TaskName '$taskName'"
Write-Host ""
Write-Host "Or just double-click generate-now.bat to trigger a video anytime."
Write-Host ""
Read-Host "Press Enter to close"
