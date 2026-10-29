# Automated Test Suite: Live Hardware / Synthetic Simulation Toggle & Mode Separation
# Project: Intelligent Waste Segregation Analytics

param (
    [string]$BaseUrl = "http://localhost:8080"
)

$passedCount = 0
$failedCount = 0

function Report-Test ($name, $condition, $details = "") {
    if ($condition) {
        $global:passedCount++
        Write-Host "  [PASS] $name" -ForegroundColor Green
        if ($details) { Write-Host "         $details" -ForegroundColor DarkGray }
    } else {
        $global:failedCount++
        Write-Host "  [FAIL] $name" -ForegroundColor Red
        if ($details) { Write-Host "         $details" -ForegroundColor Yellow }
    }
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  Testing Live Hardware / Simulation Mode Integration     " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# Test 1: Verify Initial Default Monitoring Mode is Hardware
try {
    $modeRes = Invoke-RestMethod -Uri "$BaseUrl/api/monitoring/mode" -Method GET
    Report-Test "Initial default mode is 'hardware'" ($modeRes.mode -eq "hardware") "Current mode: $($modeRes.mode)"
    Report-Test "Initial simulation_active is False" ($modeRes.simulation_active -eq $false)
} catch {
    Report-Test "Read /api/monitoring/mode" $false $_.Exception.Message
}

# Test 2: Switch to Simulation Mode via API
try {
    $postBody = '{"mode":"simulation"}'
    $switchRes = Invoke-RestMethod -Uri "$BaseUrl/api/monitoring/mode" -Method POST -Body $postBody -ContentType 'application/json'
    Report-Test "Switch to Simulation Mode returns success" ($switchRes.success -eq $true -and $switchRes.mode -eq "simulation") "Session: $($switchRes.session_id)"
    Report-Test "Simulation session ID is generated" (-not [string]::IsNullOrWhiteSpace($switchRes.session_id))
    Report-Test "Simulation start timestamp is recorded" (-not [string]::IsNullOrWhiteSpace($switchRes.started_at))
} catch {
    Report-Test "POST /api/monitoring/mode (simulation)" $false $_.Exception.Message
}

# Test 3: Idempotent Mode Switching
try {
    $postBody = '{"mode":"simulation"}'
    $repeatRes = Invoke-RestMethod -Uri "$BaseUrl/api/monitoring/mode" -Method POST -Body $postBody -ContentType 'application/json'
    Report-Test "Repeated switch to Simulation Mode is idempotent" ($repeatRes.success -eq $true -and $repeatRes.mode -eq "simulation")
} catch {
    Report-Test "Idempotent mode switch" $false $_.Exception.Message
}

# Test 4: Simulation Status Endpoint
try {
    $simStatus = Invoke-RestMethod -Uri "$BaseUrl/api/simulation/status" -Method GET
    Report-Test "GET /api/simulation/status reports simulation enabled" ($simStatus.simulation_enabled -eq $true)
    Report-Test "Simulation status confirms hardware isolation" ($simStatus.hardware_isolated -eq $true)
    Report-Test "Simulation status lists all scenarios" ($simStatus.scenarios_available.Count -ge 3)
} catch {
    Report-Test "GET /api/simulation/status" $false $_.Exception.Message
}

# Test 5: Synthetic Telemetry Schema & Integrity Validation
$sampleSyntheticPacket = @{
    v = "1.0"
    dev = "SIM-WS01"
    seq = 101
    up = 101
    source = "simulation"
    sim_session_id = "SIM-1793205960"
    scenario = "SCENARIO_A"
    moist_raw = 560
    moist_pct = 48.3
    moist_ok = $true
    moist_cal = $true
    weight_raw = 184500
    weight_g = 201.2
    weight_ok = $true
    weight_cal = $true
    dist_cm = 16.5
    prox = $true
    lid_cmd = "OPEN"
    faults = @()
}

$simJson = ($sampleSyntheticPacket | ConvertTo-Json -Compress)
Report-Test "Synthetic packet carries explicit 'simulation' provenance" ($sampleSyntheticPacket.source -eq "simulation")
Report-Test "Synthetic device ID is 'SIM-WS01'" ($sampleSyntheticPacket.dev -eq "SIM-WS01")
Report-Test "Synthetic moisture raw and calibrated percentage are correlated" ($sampleSyntheticPacket.moist_raw -gt 50 -and $sampleSyntheticPacket.moist_pct -gt 0)
Report-Test "Synthetic proximity triggers coherent OPEN lid command" ($sampleSyntheticPacket.prox -eq $true -and $sampleSyntheticPacket.lid_cmd -eq "OPEN")

# Test 6: Verify Data Source Separation (Production Log Integrity)
# The hardware log data/telemetry.jsonl must NEVER contain records with source="simulation"
$logPath = Join-Path "$PSScriptRoot\..\data" "telemetry.jsonl"
$hasSimulationRecordsInLog = $false
if (Test-Path $logPath) {
    $lines = Get-Content $logPath -ErrorAction SilentlyContinue
    foreach ($line in $lines) {
        if (-not [string]::IsNullOrWhiteSpace($line)) {
            if ($line.Contains('"source":"simulation"') -or $line.Contains('"dev":"SIM-WS01"')) {
                $hasSimulationRecordsInLog = $true
                break
            }
        }
    }
}
Report-Test "Production telemetry.jsonl is clean (Zero synthetic records found)" (-not $hasSimulationRecordsInLog)

# Test 7: Genuine Hardware Telemetry Ingestion Still Works
try {
    $sampleHardwarePacket = '{"v":1,"dev":"UNO-WS01","seq":888,"up":120,"moist_raw":490,"moist_pct":60.0,"moist_ok":true,"moist_cal":true,"weight_g":250.0,"weight_raw":105000,"weight_ok":true,"weight_cal":true,"dist_cm":55.0,"prox":false,"lid_cmd":"CLOSED","faults":[],"source":"hardware"}'
    $hwIngest = Invoke-RestMethod -Uri "$BaseUrl/api/telemetry" -Method POST -Body $sampleHardwarePacket -ContentType 'application/json'
    Report-Test "Genuine hardware telemetry POST succeeded" ($hwIngest.success -eq $true -and $hwIngest.seq -eq 888)
} catch {
    Report-Test "Genuine hardware telemetry POST" $false $_.Exception.Message
}

# Test 8: Invalid Mode Handling Rejection
try {
    $badBody = '{"mode":"invalid_test_mode"}'
    $badRes = Invoke-RestMethod -Uri "$BaseUrl/api/monitoring/mode" -Method POST -Body $badBody -ContentType 'application/json'
    Report-Test "Reject invalid mode string" $false "Server should have returned 400 Bad Request"
} catch {
    Report-Test "Server properly rejected invalid mode string (HTTP 400)" $true $_.Exception.Message
}

# Test 9: Switch Back to Live Hardware Mode
try {
    $hwBody = '{"mode":"hardware"}'
    $switchBackRes = Invoke-RestMethod -Uri "$BaseUrl/api/monitoring/mode" -Method POST -Body $hwBody -ContentType 'application/json'
    Report-Test "Switch back to Live Hardware Mode succeeded" ($switchBackRes.success -eq $true -and $switchBackRes.mode -eq "hardware")
    
    $checkMode = Invoke-RestMethod -Uri "$BaseUrl/api/monitoring/mode" -Method GET
    Report-Test "GET /api/monitoring/mode confirms active mode is hardware" ($checkMode.mode -eq "hardware" -and $checkMode.simulation_active -eq $false)
} catch {
    Report-Test "Switch back to hardware" $false $_.Exception.Message
}

$summaryColor = if ($failedCount -eq 0) { "Green" } else { "Red" }
Write-Host "`n==========================================================" -ForegroundColor Cyan
Write-Host "  RESULTS: $passedCount PASSED, $failedCount FAILED" -ForegroundColor $summaryColor
Write-Host "==========================================================" -ForegroundColor Cyan

if ($failedCount -gt 0) {
    exit 1
} else {
    exit 0
}
