# Multi-Device Serial Gateway — Intelligent Waste Segregation
# Bridges independent USB COM ports for Arduino Uno and ESP32 to the Backend REST API
# Coordinates Cross-Device Lid Synchronization from Uno to ESP32
# Supports both Standard JSON Lines Protocol and Legacy / Custom Human-Readable Serial Formats

param (
    [string]$UnoPort = "",
    [string]$Esp32Port = "",
    [string]$ComPort = "",  # Backward compatibility single port
    [int]$BaudRate = 115200,
    [int]$UnoBaud = 0,
    [int]$Esp32Baud = 0,
    [string]$BackendUrl = "http://localhost:8080/api/telemetry"
)

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  Dual-Device Serial Gateway & Multi-Protocol Bridge     " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# Load System.IO.Ports assembly
[System.Reflection.Assembly]::LoadWithPartialName("System.IO.Ports") | Out-Null
$availablePorts = [System.IO.Ports.SerialPort]::GetPortNames()
Write-Host "Detected System COM Ports: $($availablePorts -join ', ')" -ForegroundColor Gray

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
                    Write-Host "Auto-detected Arduino Uno on $UnoPort ($name)" -ForegroundColor Green
                }
                elseif (-not $Esp32Port -and ($name -like '*CH9102*' -or $name -like '*CP210*' -or $name -like '*ESP32*' -or $dev.InstanceId -like '*VID_1A86&PID_55D4*')) {
                    $Esp32Port = $p
                    Write-Host "Auto-detected ESP32 on $Esp32Port ($name)" -ForegroundColor Green
                }
            }
        }
    } catch {}
}

if ($ComPort -and -not $UnoPort -and -not $Esp32Port) {
    $UnoPort = $ComPort
}

# Default Baud rates: Uno typically 9600 for simple sketches or 115200 for JSON firmware.
# ESP32 defaults to 115200.
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

# Shared state file for cross-process lid synchronization between threads
$syncStateFile = Join-Path $PSScriptRoot "..\data\gateway_sync.json"

function Start-SerialReaderThread ($portName, $deviceType, $endpointUrl, $baud, $peerPort) {
    if ([string]::IsNullOrWhiteSpace($portName)) { return $null }

    $scriptBlock = {
        param($pName, $dType, $url, $baudRate, $syncFile)

        [System.Reflection.Assembly]::LoadWithPartialName("System.IO.Ports") | Out-Null
        $sp = $null
        try {
            $sp = New-Object System.IO.Ports.SerialPort $pName, $baudRate, "None", 8, "One"
            $sp.DtrEnable = $true
            $sp.RtsEnable = $true
            $sp.ReadTimeout = 2000
            $sp.WriteTimeout = 2000
            $sp.Open()
            Write-Host "[$dType] Connected on $pName ($baudRate baud). Forwarding to $url..." -ForegroundColor Green

            $count = 0
            $lastLidState = ""
            $lastSyncChecked = [DateTime]::MinValue
            $startTime = [DateTime]::UtcNow
            $seq = 0

            # Uno tracking state
            $unoDist = 55.0
            $unoProx = $false
            $unoLid = "CLOSED"
            $lastUnoPost = [DateTime]::MinValue

            # ESP32 tracking state
            $espC1Wt = 0.0; $espC1Moist = 0.0
            $espC2Wt = 0.0; $espC2Moist = 0.0
            $espC3Wt = 0.0; $espC3Moist = 0.0
            $lastEspPost = [DateTime]::MinValue

            while ($sp.IsOpen) {
                try {
                    $line = $sp.ReadLine()
                    if ([string]::IsNullOrWhiteSpace($line)) { continue }
                    $trimmed = $line.Trim()
                    $now = [DateTime]::UtcNow

                    if ($trimmed.StartsWith("{") -and $trimmed.EndsWith("}")) {
                        # Standard JSON Line Telemetry
                        $targetUrl = "$url/$dType"
                        try {
                            $res = Invoke-RestMethod -Uri $targetUrl -Method Post -Body $trimmed -ContentType "application/json" -TimeoutSec 2 -ErrorAction Stop
                            $count++
                            Write-Host "[$dType #$count] Forwarded JSON packet on $pName" -ForegroundColor Green

                            # If Module A (Uno) reports a lid transition, write to sync file
                            if ($dType -eq "uno") {
                                try {
                                    $obj = $trimmed | ConvertFrom-Json
                                    if ($obj.lid_cmd -and $obj.lid_cmd -ne $lastLidState) {
                                        $lastLidState = $obj.lid_cmd
                                        $syncData = @{
                                            lid_cmd = $obj.lid_cmd
                                            seq = $obj.seq
                                            timestamp = $now.ToString("o")
                                        } | ConvertTo-Json -Compress
                                        [System.IO.File]::WriteAllText($syncFile, $syncData)
                                    }
                                } catch {}
                            }
                        } catch {
                            Invoke-RestMethod -Uri $url -Method Post -Body $trimmed -ContentType "application/json" -TimeoutSec 2 -ErrorAction SilentlyContinue | Out-Null
                        }
                    }
                    elseif ($dType -eq "uno") {
                        # Universal Parser for Uno text output
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
                            $unoLid = $matches[1].ToUpper()
                            $stateChanged = $true
                        }

                        if ($stateChanged -and (($now - $lastUnoPost).TotalMilliseconds -ge 800)) {
                            $lastUnoPost = $now
                            $seq++
                            $uptime = [int]($now - $startTime).TotalSeconds
                            $unoJson = @{
                                v = 1
                                dev = "UNO-WS01"
                                seq = $seq
                                up = $uptime
                                dist_cm = $unoDist
                                prox = $unoProx
                                lid_cmd = $unoLid
                                faults = @()
                            } | ConvertTo-Json -Compress

                            try {
                                Invoke-RestMethod -Uri "$url/uno" -Method Post -Body $unoJson -ContentType "application/json" -TimeoutSec 2 -ErrorAction SilentlyContinue | Out-Null
                                $count++
                                Write-Host "[$dType #$count] Forwarded Uno (Dist: $unoDist cm, Lid: $unoLid, Prox: $unoProx)" -ForegroundColor Green
                            } catch {}

                            if ($unoLid -ne $lastLidState) {
                                $lastLidState = $unoLid
                                $syncData = @{
                                    lid_cmd = $unoLid
                                    seq = $seq
                                    timestamp = $now.ToString("o")
                                } | ConvertTo-Json -Compress
                                [System.IO.File]::WriteAllText($syncFile, $syncData)
                            }
                        }
                    }
                    elseif ($dType -eq "esp32") {
                        # Universal Parser for ESP32 text output
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
                            $seq++
                            $uptime = [int]($now - $startTime).TotalSeconds
                            $espJson = @{
                                v = 1
                                dev = "ESP32-WS01"
                                seq = $seq
                                up = $uptime
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
                                Invoke-RestMethod -Uri "$url/esp32" -Method Post -Body $espJson -ContentType "application/json" -TimeoutSec 2 -ErrorAction SilentlyContinue | Out-Null
                                $count++
                                Write-Host "[$dType #$count] Forwarded ESP32 (C1: $espC1Wt g / $espC1Moist%, C2: $espC2Wt g / $espC2Moist%)" -ForegroundColor Green
                            } catch {}
                        }
                    }

                    # Cross-device lid sync relay to ESP32
                    if ($dType -eq "esp32") {
                        if (([DateTime]::UtcNow - $lastSyncChecked).TotalMilliseconds -ge 1000) {
                            $lastSyncChecked = [DateTime]::UtcNow
                            if ([System.IO.File]::Exists($syncFile)) {
                                try {
                                    $content = [System.IO.File]::ReadAllText($syncFile)
                                    if (-not [string]::IsNullOrWhiteSpace($content)) {
                                        $syncObj = $content | ConvertFrom-Json
                                        $syncFrame = "{""cmd"":""sync_lid"",""state"":""$($syncObj.lid_cmd)"",""seq"":$($syncObj.seq)}`n"
                                        $sp.Write($syncFrame)
                                    }
                                } catch {}
                            }
                        }
                    }

                } catch [System.TimeoutException] {
                    # Normal read timeout; keep loop alive
                } catch {
                    Write-Host "[$dType READ ERROR] $_" -ForegroundColor Red
                    Start-Sleep -Milliseconds 500
                }
            }
        } catch {
            Write-Host "[$dType ERROR] Failed to connect on $pName: $_" -ForegroundColor Red
        } finally {
            if ($sp -and $sp.IsOpen) { $sp.Close() }
        }
    }

    $ps = [PowerShell]::Create().AddScript($scriptBlock).AddArgument($portName).AddArgument($deviceType).AddArgument($endpointUrl).AddArgument($baud).AddArgument($syncStateFile)
    $handle = $ps.BeginInvoke()
    return @{ PowerShell = $ps; Handle = $handle; Port = $portName; Device = $deviceType }
}

$readers = @()

if ($UnoPort) {
    Write-Host "Starting Uno reader on $UnoPort ($UnoBaud baud)..." -ForegroundColor Cyan
    $readers += Start-SerialReaderThread $UnoPort "uno" $BackendUrl $UnoBaud $Esp32Port
}

if ($Esp32Port) {
    Write-Host "Starting ESP32 reader on $Esp32Port ($Esp32Baud baud)..." -ForegroundColor Cyan
    $readers += Start-SerialReaderThread $Esp32Port "esp32" $BackendUrl $Esp32Baud $UnoPort
}

if ($readers.Count -eq 0) {
    Write-Host "`n[NOTICE] No COM ports specified or auto-detected. Run with:" -ForegroundColor Yellow
    Write-Host "  .\\gateway\\serial_gateway.ps1 -UnoPort COM7 -Esp32Port COM3" -ForegroundColor White
    exit 0
}

try {
    while ($true) {
        Start-Sleep -Seconds 1
    }
} finally {
    Write-Host "`nStopping readers..." -ForegroundColor Gray
    foreach ($r in $readers) {
        if ($r.PowerShell) {
            $r.PowerShell.Stop()
            $r.PowerShell.Dispose()
        }
    }
    Write-Host "Gateway stopped." -ForegroundColor Gray
}
