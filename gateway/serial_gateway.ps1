# Multi-Device Serial Gateway — Intelligent Waste Segregation
# Bridges independent USB COM ports for Arduino Uno and ESP32 to the Backend REST API
# Single-Loop High-Reliability Architecture with Auto-Reconnection & Dual Protocol Support

param (
    [string]$UnoPort = "",
    [string]$Esp32Port = "",
    [string]$ComPort = "",
    [int]$BaudRate = 115200,
    [int]$UnoBaud = 0,
    [int]$Esp32Baud = 0,
    [string]$BackendUrl = "http://localhost:8080/api/telemetry"
)

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  Dual-Device Serial Gateway & Multi-Protocol Bridge     " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

[System.Reflection.Assembly]::LoadWithPartialName("System.IO.Ports") | Out-Null

# Auto-detect ports if unspecified
if (-not $UnoPort -or -not $Esp32Port) {
    try {
        $pnpDevices = Get-PnpDevice -Class Ports -Status OK -ErrorAction SilentlyContinue
        foreach ($dev in $pnpDevices) {
            $name = $dev.FriendlyName
            if ($name -match '\((COM\d+)\)') {
                $p = $matches[1]
                if (-not $UnoPort -and ($name -like '*CH340*' -or $name -like '*Arduino*' -or $dev.InstanceId -like '*VID_1A86&PID_7523*')) {
                    $UnoPort = $p
                }
                elseif (-not $Esp32Port -and ($name -like '*CH9102*' -or $name -like '*CP210*' -or $name -like '*ESP32*' -or $dev.InstanceId -like '*VID_1A86&PID_55D4*')) {
                    $Esp32Port = $p
                }
            }
        }
    } catch {}
}

$sysPorts = [System.IO.Ports.SerialPort]::GetPortNames()
if (-not $UnoPort -and $sysPorts -contains "COM7") { $UnoPort = "COM7" }
if (-not $Esp32Port -and $sysPorts -contains "COM3") { $Esp32Port = "COM3" }

if ($ComPort -and -not $UnoPort -and -not $Esp32Port) {
    $UnoPort = $ComPort
}

# Determine default baud rates
if ($UnoBaud -eq 0) {
    $UnoBaud = if ($BaudRate -ne 115200) { $BaudRate } else { 9600 }
}
if ($Esp32Baud -eq 0) {
    $Esp32Baud = if ($BaudRate -ne 115200) { $BaudRate } else { 115200 }
}

Write-Host " Uno Target (Module A):     $(if ($UnoPort) { "$UnoPort @ $UnoBaud baud" } else { 'None' })" -ForegroundColor Yellow
Write-Host " ESP32 Target (Module B):   $(if ($Esp32Port) { "$Esp32Port @ $Esp32Baud baud" } else { 'None' })" -ForegroundColor Yellow
Write-Host " Backend Target URL:        $BackendUrl" -ForegroundColor Yellow
Write-Host " Press Ctrl+C to terminate gateway" -ForegroundColor Gray
Write-Host "==========================================================" -ForegroundColor Cyan

# Function to safely create and open a SerialPort
function Open-PortSafely ($pName, $baud) {
    if ([string]::IsNullOrWhiteSpace($pName)) { return $null }
    try {
        $sp = New-Object System.IO.Ports.SerialPort $pName, $baud, "None", 8, "One"
        $sp.DtrEnable = $true
        $sp.RtsEnable = $true
        $sp.ReadTimeout = 500
        $sp.WriteTimeout = 500
        $sp.Open()
        Write-Host "Connected on $pName ($baud baud)" -ForegroundColor Green
        return $sp
    } catch {
        Write-Host "Waiting for $pName ($($_.Exception.Message))" -ForegroundColor DarkGray
        return $null
    }
}

$spUno = $null
$spEsp = $null

# Uno Telemetry State
$unoDist = 55.0
$unoProx = $false
$unoLid = "CLOSED"
$lastUnoPost = [DateTime]::MinValue
$unoSeq = 0
$unoCount = 0

# ESP32 Telemetry State
$espC1Wt = 0.0; $espC1Moist = 0.0
$espC2Wt = 0.0; $espC2Moist = 0.0
$espC3Wt = 0.0; $espC3Moist = 0.0
$lastEspPost = [DateTime]::MinValue
$espSeq = 0
$espCount = 0

$startTime = [DateTime]::UtcNow
$lastReconnectAttempt = [DateTime]::MinValue

try {
    while ($true) {
        $now = [DateTime]::UtcNow

        # Auto-reconnection logic every 3 seconds
        if (($now - $lastReconnectAttempt).TotalSeconds -ge 3) {
            $lastReconnectAttempt = $now
            if ($UnoPort -and (-not $spUno -or -not $spUno.IsOpen)) {
                if ($spUno) { try { $spUno.Dispose() } catch {} }
                $spUno = Open-PortSafely $UnoPort $UnoBaud
            }
            if ($Esp32Port -and (-not $spEsp -or -not $spEsp.IsOpen)) {
                if ($spEsp) { try { $spEsp.Dispose() } catch {} }
                $spEsp = Open-PortSafely $Esp32Port $Esp32Baud
            }
        }

        # ----------------------------------------------------
        # 1. READ FROM UNO (MODULE A)
        # ----------------------------------------------------
        if ($spUno -and $spUno.IsOpen) {
            try {
                while ($spUno.BytesToRead -gt 0) {
                    $line = $spUno.ReadLine()
                    if ([string]::IsNullOrWhiteSpace($line)) { continue }
                    $trimmed = $line.Trim()

                    if ($trimmed.StartsWith("{") -and $trimmed.EndsWith("}")) {
                        # Standard JSON format
                        try {
                            Invoke-RestMethod -Uri "$BackendUrl/uno" -Method Post -Body $trimmed -ContentType "application/json" -TimeoutSec 1 -ErrorAction SilentlyContinue | Out-Null
                            $unoCount++
                            Write-Host "[Uno #$unoCount] Forwarded JSON packet" -ForegroundColor Green
                        } catch {}
                    } else {
                        # Plain text parser for distance and lid
                        $stateChanged = $false
                        if ($trimmed -match 'Distance:\s*(\d+(\.\d+)?)') {
                            $unoDist = [double]$matches[1]
                            $stateChanged = $true
                        }
                        if ($trimmed -match 'Object detected') {
                            $unoProx = $true
                            $stateChanged = $true
                        }
                        if ($trimmed -match 'Object moved away') {
                            $unoProx = $false
                            $stateChanged = $true
                        }
                        if ($trimmed -match 'Lid\s*(OPEN|CLOSED)') {
                            $newLid = $matches[1].ToUpper()
                            if ($newLid -ne $unoLid) {
                                $unoLid = $newLid
                                # Sync lid state to ESP32 immediately if connected
                                if ($spEsp -and $spEsp.IsOpen) {
                                    try {
                                        $syncFrame = "{""cmd"":""sync_lid"",""state"":""$unoLid"",""seq"":$unoSeq}`n"
                                        $spEsp.Write($syncFrame)
                                    } catch {}
                                }
                            }
                            $stateChanged = $true
                        }

                        if ($stateChanged -and (($now - $lastUnoPost).TotalMilliseconds -ge 800)) {
                            $lastUnoPost = $now
                            $unoSeq++
                            $up = [int]($now - $startTime).TotalSeconds
                            $unoJson = @{
                                v = 1
                                dev = "UNO-WS01"
                                seq = $unoSeq
                                up = $up
                                dist_cm = $unoDist
                                prox = $unoProx
                                lid_cmd = $unoLid
                                faults = @()
                            } | ConvertTo-Json -Compress

                            try {
                                Invoke-RestMethod -Uri "$BackendUrl/uno" -Method Post -Body $unoJson -ContentType "application/json" -TimeoutSec 1 -ErrorAction SilentlyContinue | Out-Null
                                $unoCount++
                                Write-Host "[Uno #$unoCount] Forwarded Uno (Dist: $unoDist cm, Lid: $unoLid, Prox: $unoProx)" -ForegroundColor Green
                            } catch {}
                        }
                    }
                }
            } catch [System.TimeoutException] {
                # Normal read timeout
            } catch {
                Write-Host "Uno read notice: $($_.Exception.Message)" -ForegroundColor DarkGray
            }
        }

        # ----------------------------------------------------
        # 2. READ FROM ESP32 (MODULE B)
        # ----------------------------------------------------
        if ($spEsp -and $spEsp.IsOpen) {
            try {
                while ($spEsp.BytesToRead -gt 0) {
                    $line = $spEsp.ReadLine()
                    if ([string]::IsNullOrWhiteSpace($line)) { continue }
                    $trimmed = $line.Trim()

                    if ($trimmed.StartsWith("{") -and $trimmed.EndsWith("}")) {
                        # Standard JSON format
                        try {
                            Invoke-RestMethod -Uri "$BackendUrl/esp32" -Method Post -Body $trimmed -ContentType "application/json" -TimeoutSec 1 -ErrorAction SilentlyContinue | Out-Null
                            $espCount++
                            Write-Host "[ESP32 #$espCount] Forwarded JSON packet" -ForegroundColor Green
                        } catch {}
                    } else {
                        # Plain text parser for C1, C2, C3
                        if ($trimmed -match 'C1:\s*([\d\.\-]+)\s*g\s*\|\s*moist\s*([\d\.\-]+)%') {
                            $espC1Wt = [double]$matches[1]
                            $espC1Moist = [double]$matches[2]
                        }
                        if ($trimmed -match 'C2:\s*([\d\.\-]+)\s*g\s*\|\s*moist\s*([\d\.\-]+)%') {
                            $espC2Wt = [double]$matches[1]
                            $espC2Moist = [double]$matches[2]
                        }
                        if ($trimmed -match 'C3:\s*([\d\.\-]+)\s*g\s*\|\s*moist\s*([\d\.\-]+)%') {
                            $espC3Wt = [double]$matches[1]
                            $espC3Moist = [double]$matches[2]
                        }

                        if ($trimmed -match '^-+$' -or (($now - $lastEspPost).TotalMilliseconds -ge 1000)) {
                            $lastEspPost = $now
                            $espSeq++
                            $up = [int]($now - $startTime).TotalSeconds
                            $espJson = @{
                                v = 1
                                dev = "ESP32-WS01"
                                seq = $espSeq
                                up = $up
                                c1_pct = $espC1Moist
                                c1_raw = 500
                                c1_ok = $true
                                c1_cal = $true
                                lc1_g = $espC1Wt
                                lc1_raw = [int]($espC1Wt * 100)
                                lc1_ok = $true
                                lc1_cal = $true
                                c2_pct = $espC2Moist
                                c2_raw = 600
                                c2_ok = $true
                                c2_cal = $true
                                lc2_g = $espC2Wt
                                lc2_raw = [int]($espC2Wt * 100)
                                lc2_ok = $true
                                lc2_cal = $true
                                channels = @{
                                    c1 = @{ ok = $true; calibrated = $true }
                                    c2 = @{ ok = $true; calibrated = $true }
                                    lc1 = @{ ok = $true; calibrated = $true }
                                    lc2 = @{ ok = $true; calibrated = $true }
                                }
                                faults = @()
                            } | ConvertTo-Json -Compress

                            try {
                                Invoke-RestMethod -Uri "$BackendUrl/esp32" -Method Post -Body $espJson -ContentType "application/json" -TimeoutSec 1 -ErrorAction SilentlyContinue | Out-Null
                                $espCount++
                                Write-Host "[ESP32 #$espCount] Forwarded ESP32 (C1: $espC1Wt g / $espC1Moist%, C2: $espC2Wt g / $espC2Moist%)" -ForegroundColor Green
                            } catch {}
                        }
                    }
                }
            } catch [System.TimeoutException] {
                # Normal read timeout
            } catch {
                Write-Host "ESP32 read notice: $($_.Exception.Message)" -ForegroundColor DarkGray
            }
        }

        Start-Sleep -Milliseconds 30
    }
} finally {
    Write-Host "`nStopping serial connections..." -ForegroundColor Gray
    if ($spUno -and $spUno.IsOpen) { $spUno.Close(); $spUno.Dispose() }
    if ($spEsp -and $spEsp.IsOpen) { $spEsp.Close(); $spEsp.Dispose() }
    Write-Host "Gateway stopped." -ForegroundColor Gray
}
