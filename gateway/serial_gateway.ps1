# Multi-Device Serial Gateway — Intelligent Waste Segregation
# Bridges independent USB COM ports for Arduino Uno and ESP32 to the Backend REST API
# Coordinates Cross-Device Lid Synchronization from Uno to ESP32

param (
    [string]$UnoPort = "",
    [string]$Esp32Port = "",
    [string]$ComPort = "",  # Backward compatibility single port
    [int]$BaudRate = 115200,
    [string]$BackendUrl = "http://localhost:8080/api/telemetry"
)

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  Dual-Device Serial Gateway & Lid Synchronization Bridge " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " Uno Target (Module A):     $(if ($UnoPort) { $UnoPort } else { 'Auto/None' })" -ForegroundColor Yellow
Write-Host " ESP32 Target (Module B):   $(if ($Esp32Port) { $Esp32Port } else { 'Auto/None' })" -ForegroundColor Yellow
Write-Host " Single COM Port:           $(if ($ComPort) { $ComPort } else { 'None' })" -ForegroundColor Yellow
Write-Host " Baud Rate:                 $BaudRate" -ForegroundColor Yellow
Write-Host " Backend URL:               $BackendUrl" -ForegroundColor Yellow
Write-Host " Press Ctrl+C to terminate gateway" -ForegroundColor Gray
Write-Host "==========================================================" -ForegroundColor Cyan

# Load System.IO.Ports assembly
[System.Reflection.Assembly]::LoadWithPartialName("System.IO.Ports") | Out-Null
$availablePorts = [System.IO.Ports.SerialPort]::GetPortNames()
Write-Host "`nDetected COM Ports on System: $($availablePorts -join ', ')" -ForegroundColor Gray

if ($ComPort -and -not $UnoPort -and -not $Esp32Port) {
    $UnoPort = $ComPort
}

# Shared state file for cross-process lid synchronization between threads
$syncStateFile = Join-Path $PSScriptRoot "..\data\gateway_sync.json"

function Start-SerialReaderThread ($portName, $deviceType, $endpointUrl, $peerPort) {
    if ([string]::IsNullOrWhiteSpace($portName)) { return $null }

    $scriptBlock = {
        param($pName, $dType, $url, $baud, $syncFile)

        [System.Reflection.Assembly]::LoadWithPartialName("System.IO.Ports") | Out-Null
        try {
            $sp = New-Object System.IO.Ports.SerialPort $pName, $baud, "None", 8, "One"
            $sp.DtrEnable = $true
            $sp.RtsEnable = $true
            $sp.ReadTimeout = 2000
            $sp.WriteTimeout = 2000
            $sp.Open()
            Write-Host "[$dType] Connected on $pName. Forwarding to $url..." -ForegroundColor Green

            $count = 0
            $lastLidState = ""
            $lastSyncChecked = [DateTime]::MinValue

            while ($sp.IsOpen) {
                try {
                    $line = $sp.ReadLine()
                    if ([string]::IsNullOrWhiteSpace($line)) { continue }
                    $trimmed = $line.Trim()

                    if ($trimmed.StartsWith("{") -and $trimmed.EndsWith("}")) {
                        $targetUrl = "$url/$dType"
                        try {
                            $res = Invoke-RestMethod -Uri $targetUrl -Method Post -Body $trimmed -ContentType "application/json" -TimeoutSec 2 -ErrorAction Stop
                            $count++
                            Write-Host "[$dType #$count] Forwarded telemetry packet on $pName" -ForegroundColor Green

                            # If Module A (Uno) reports a lid transition, write to sync file
                            if ($dType -eq "uno") {
                                try {
                                    $obj = $trimmed | ConvertFrom-Json
                                    if ($obj.lid_cmd -and $obj.lid_cmd -ne $lastLidState) {
                                        $lastLidState = $obj.lid_cmd
                                        $syncData = @{
                                            lid_cmd = $obj.lid_cmd
                                            seq = $obj.seq
                                            timestamp = [DateTime]::UtcNow.ToString("o")
                                        } | ConvertTo-Json -Compress
                                        [System.IO.File]::WriteAllText($syncFile, $syncData)
                                    }
                                } catch {}
                            }
                        } catch {
                            Invoke-RestMethod -Uri $url -Method Post -Body $trimmed -ContentType "application/json" -TimeoutSec 2 -ErrorAction SilentlyContinue | Out-Null
                        }
                    } else {
                        Write-Host "[$dType DEBUG] $trimmed" -ForegroundColor DarkGray
                    }

                    # If Module B (ESP32), check for pending lid sync to relay
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
                    # Normal read timeout; keep loop active
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

    $ps = [PowerShell]::Create().AddScript($scriptBlock).AddArgument($portName).AddArgument($deviceType).AddArgument($endpointUrl).AddArgument($BaudRate).AddArgument($syncStateFile)
    $handle = $ps.BeginInvoke()
    return @{ PowerShell = $ps; Handle = $handle; Port = $portName; Device = $deviceType }
}

$readers = @()

if ($UnoPort) {
    Write-Host "Starting Uno reader on $UnoPort..." -ForegroundColor Cyan
    $readers += Start-SerialReaderThread $UnoPort "uno" $BackendUrl $Esp32Port
}

if ($Esp32Port) {
    Write-Host "Starting ESP32 reader on $Esp32Port..." -ForegroundColor Cyan
    $readers += Start-SerialReaderThread $Esp32Port "esp32" $BackendUrl $UnoPort
}

if ($readers.Count -eq 0) {
    Write-Host "`n[NOTICE] No COM ports specified. Run with:" -ForegroundColor Yellow
    Write-Host "  .\\gateway\\serial_gateway.ps1 -UnoPort COM3 -Esp32Port COM4" -ForegroundColor White
    Write-Host "Or for a single microcontroller:" -ForegroundColor Yellow
    Write-Host "  .\\gateway\\serial_gateway.ps1 -UnoPort COM3" -ForegroundColor White
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
