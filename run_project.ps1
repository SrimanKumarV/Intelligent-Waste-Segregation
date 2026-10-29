# ============================================================================
# Intelligent Waste Segregation Analytics — Universal Project Launcher
# ============================================================================

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  Starting Intelligent Waste Segregation Analytics...     " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

$projectRoot = $PSScriptRoot

# 1. Start ML Inference Service (Port 8000)
$mlRunning = $false
try {
    $res = Invoke-RestMethod -Uri "http://127.0.0.1:8000/health" -TimeoutSec 1 -ErrorAction SilentlyContinue
    if ($res.status -eq "ok") { $mlRunning = $true }
} catch {}

if (-not $mlRunning) {
    Write-Host "[1/4] Starting ML Inference Service on port 8000..." -ForegroundColor Yellow
    Start-Process powershell -ArgumentList "-ExecutionPolicy Bypass -NoExit -Command cd '$projectRoot'; python -m uvicorn ml.service:app --host 127.0.0.1 --port 8000" -WindowStyle Minimized
    Start-Sleep -Seconds 2
} else {
    Write-Host "[1/4] ML Inference Service is already running on port 8000." -ForegroundColor Green
}

# 2. Start Backend REST API & Static Server (Port 8080)
$backendRunning = $false
try {
    $res = Invoke-WebRequest -Uri "http://localhost:8080/api/health" -UseBasicParsing -TimeoutSec 1 -ErrorAction SilentlyContinue
    if ($res.StatusCode -eq 200) { $backendRunning = $true }
} catch {}

if (-not $backendRunning) {
    Write-Host "[2/4] Starting Backend HTTP Server on port 8080..." -ForegroundColor Yellow
    Start-Process powershell -ArgumentList "-ExecutionPolicy Bypass -NoExit -Command cd '$projectRoot'; powershell -ExecutionPolicy Bypass -File backend/server.ps1 -Port 8080" -WindowStyle Minimized
    Start-Sleep -Seconds 2
} else {
    Write-Host "[2/4] Backend Server is already running on port 8080." -ForegroundColor Green
}

# 3. Detect COM ports and Start Serial Gateway Bridge
Write-Host "[3/4] Checking Hardware USB Ports..." -ForegroundColor Yellow
$unoPort = ""
$esp32Port = ""

try {
    $pnpDevices = Get-PnpDevice -Class Ports -Status OK -ErrorAction SilentlyContinue
    foreach ($dev in $pnpDevices) {
        $name = $dev.FriendlyName
        if ($name -match '\((COM\d+)\)') {
            $p = $matches[1]
            if (-not $unoPort -and ($name -like '*CH340*' -or $name -like '*Arduino*' -or $dev.InstanceId -like '*VID_1A86&PID_7523*')) {
                $unoPort = $p
            }
            elseif (-not $esp32Port -and ($name -like '*CH9102*' -or $name -like '*CP210*' -or $name -like '*ESP32*' -or $dev.InstanceId -like '*VID_1A86&PID_55D4*')) {
                $esp32Port = $p
            }
        }
    }
} catch {}

# Fallbacks if known ports exist
[System.Reflection.Assembly]::LoadWithPartialName("System.IO.Ports") | Out-Null
$sysPorts = [System.IO.Ports.SerialPort]::GetPortNames()
if (-not $unoPort -and $sysPorts -contains "COM7") { $unoPort = "COM7" }
if (-not $esp32Port -and $sysPorts -contains "COM3") { $esp32Port = "COM3" }

# Check if gateway is already forwarding
$gwStatus = $false
try {
    $st = Invoke-RestMethod -Uri "http://localhost:8080/api/devices/status" -TimeoutSec 1 -ErrorAction SilentlyContinue
    if ($st.overall_status -eq "BOTH_CONNECTED") { $gwStatus = $true }
} catch {}

if (-not $gwStatus -and ($unoPort -or $esp32Port)) {
    Write-Host "      Detected Hardware: Uno on $unoPort (9600 baud), ESP32 on $esp32Port (115200 baud)" -ForegroundColor Green
    Write-Host "      Starting Serial Gateway Bridge..." -ForegroundColor Yellow
    Start-Process powershell -ArgumentList "-ExecutionPolicy Bypass -NoExit -Command cd '$projectRoot'; powershell -ExecutionPolicy Bypass -File gateway/serial_gateway.ps1 -UnoPort '$unoPort' -UnoBaud 9600 -Esp32Port '$esp32Port' -Esp32Baud 115200" -WindowStyle Minimized
} elseif ($gwStatus) {
    Write-Host "      Serial Gateway is already actively streaming data from $unoPort and $esp32Port." -ForegroundColor Green
} else {
    Write-Host "      No hardware COM ports detected. Running in Simulation / Network mode." -ForegroundColor Gray
}

# 4. Launch Dashboard in Default Browser
Write-Host "[4/4] Launching Dashboard at http://localhost:8080/ ..." -ForegroundColor Cyan
Start-Process "http://localhost:8080/"

Write-Host "`nAll modules are configured and running!" -ForegroundColor Green
Write-Host "Dashboard:  http://localhost:8080/" -ForegroundColor White
Write-Host "ML API:     http://127.0.0.1:8000/docs" -ForegroundColor White
Write-Host "==========================================================" -ForegroundColor Cyan
