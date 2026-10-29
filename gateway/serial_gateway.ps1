# Multi-Device Serial Gateway — Intelligent Waste Segregation
# Bridges independent USB COM ports for Arduino Uno and ESP32 to the Backend REST API

param (
    [string]$UnoPort = "",
    [string]$Esp32Port = "",
    [string]$ComPort = "",  # Backward compatibility single port
    [int]$BaudRate = 115200,
    [string]$BackendUrl = "http://localhost:8080/api/telemetry"
)

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  Dual-Device Serial Gateway -> Backend Telemetry Bridge  " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " Uno Target:     $(if ($UnoPort) { $UnoPort } else { 'Auto/None' })" -ForegroundColor Yellow
Write-Host " ESP32 Target:   $(if ($Esp32Port) { $Esp32Port } else { 'Auto/None' })" -ForegroundColor Yellow
Write-Host " Single COM Port:$(if ($ComPort) { $ComPort } else { 'None' })" -ForegroundColor Yellow
Write-Host " Baud Rate:      $BaudRate" -ForegroundColor Yellow
Write-Host " Backend URL:    $BackendUrl" -ForegroundColor Yellow
Write-Host " Press Ctrl+C to terminate gateway" -ForegroundColor Gray
Write-Host "==========================================================" -ForegroundColor Cyan

# Load System.IO.Ports assembly
[System.Reflection.Assembly]::LoadWithPartialName("System.IO.Ports") | Out-Null
$availablePorts = [System.IO.Ports.SerialPort]::GetPortNames()
Write-Host "`nDetected COM Ports on System: $($availablePorts -join ', ')" -ForegroundColor Gray

# If only single -ComPort was passed, route to appropriate target
if ($ComPort -and -not $UnoPort -and -not $Esp32Port) {
    $UnoPort = $ComPort
}

function Start-SerialReaderThread ($portName, $deviceType, $endpointUrl) {
    if ([string]::IsNullOrWhiteSpace($portName)) { return $null }

    $scriptBlock = {
        param($pName, $dType, $url, $baud)

        [System.Reflection.Assembly]::LoadWithPartialName("System.IO.Ports") | Out-Null
        $sp = $null
        try {
            $sp = New-Object System.IO.Ports.SerialPort $pName, $baud, [System.IO.Ports.Parity]::None, 8, [System.IO.Ports.StopBits]::One
            $sp.ReadTimeout = 2000
            $sp.Open()
            Write-Host "[$dType] Connected on $pName. Forwarding to $url..." -ForegroundColor Green

            $count = 0
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
                            Write-Host "[$dType #$count] Forwarded packet on $pName ($([DateTime]::Now.ToString('HH:mm:ss')))" -ForegroundColor Green
                        } catch {
                            # Fallback to standard endpoint
                            Invoke-RestMethod -Uri $url -Method Post -Body $trimmed -ContentType "application/json" -TimeoutSec 2 -ErrorAction SilentlyContinue | Out-Null
                        }
                    } else {
                        Write-Host "[$dType DEBUG] $trimmed" -ForegroundColor DarkGray
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

    $ps = [PowerShell]::Create().AddScript($scriptBlock).AddArgument($portName).AddArgument($deviceType).AddArgument($endpointUrl).AddArgument($BaudRate)
    $handle = $ps.BeginInvoke()
    return @{ PowerShell = $ps; Handle = $handle; Port = $portName; Device = $deviceType }
}

$readers = @()

if ($UnoPort) {
    Write-Host "Starting Uno reader on $UnoPort..." -ForegroundColor Cyan
    $readers += Start-SerialReaderThread $UnoPort "uno" $BackendUrl
}

if ($Esp32Port) {
    Write-Host "Starting ESP32 reader on $Esp32Port..." -ForegroundColor Cyan
    $readers += Start-SerialReaderThread $Esp32Port "esp32" $BackendUrl
}

if ($readers.Count -eq 0) {
    Write-Host "`n[NOTICE] No COM ports assigned. Run with:" -ForegroundColor Yellow
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
