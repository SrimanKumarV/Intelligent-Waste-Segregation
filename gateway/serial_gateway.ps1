# Serial Gateway for Arduino Uno — Intelligent Waste Segregation
# Reads structured JSON Lines from Arduino Uno USB COM port and forwards to Backend API

param (
    [string]$ComPort = "COM3",
    [int]$BaudRate = 115200,
    [string]$BackendUrl = "http://localhost:8080/api/telemetry"
)

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  Arduino Uno Serial Gateway -> Backend Telemetry Bridge  " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " Target Port:   $ComPort" -ForegroundColor Yellow
Write-Host " Baud Rate:     $BaudRate" -ForegroundColor Yellow
Write-Host " Forwarding to: $BackendUrl" -ForegroundColor Yellow
Write-Host " Press Ctrl+C to stop gateway" -ForegroundColor Gray
Write-Host "==========================================================" -ForegroundColor Cyan

# Load System.IO.Ports assembly
[System.Reflection.Assembly]::LoadWithPartialName("System.IO.Ports") | Out-Null

$availablePorts = [System.IO.Ports.SerialPort]::GetPortNames()
if ($availablePorts.Count -eq 0) {
    Write-Host "`n[WARNING] No COM ports currently detected on system!" -ForegroundColor Yellow
    Write-Host "Plug your Arduino Uno into a USB port and rerun with: -ComPort COMx" -ForegroundColor White
} elseif ($availablePorts -notcontains $ComPort) {
    Write-Host "`n[NOTICE] Port '$ComPort' not found. Available COM ports: $($availablePorts -join ', ')" -ForegroundColor Yellow
}

try {
    $port = New-Object System.IO.Ports.SerialPort $ComPort, $BaudRate, [System.IO.Ports.Parity]::None, 8, [System.IO.Ports.StopBits]::One
    $port.ReadTimeout = 3000
    $port.Open()

    Write-Host "`n✓ Opened $ComPort successfully. Reading telemetry..." -ForegroundColor Green

    $packetCount = 0

    while ($port.IsOpen) {
        try {
            $line = $port.ReadLine()
            if ([string]::IsNullOrWhiteSpace($line)) { continue }

            $trimmed = $line.Trim()

            # Ignore human banners or debug lines that don't start with JSON
            if (-not $trimmed.StartsWith("{") -or -not $trimmed.EndsWith("}")) {
                Write-Host "[ARDUINO DEBUG] $trimmed" -ForegroundColor DarkGray
                continue
            }

            # Forward JSON packet to Backend API
            $response = Invoke-RestMethod -Uri $BackendUrl -Method Post -Body $trimmed -ContentType "application/json" -TimeoutSec 3 -ErrorAction Stop

            $packetCount++
            Write-Host "[PACKET #$packetCount] Forwarded telemetry to backend: $(Get-Date -Format 'HH:mm:ss')" -ForegroundColor Green
        } catch [System.TimeoutException] {
            # Idle timeout — loop continues
        } catch {
            Write-Host "[FORWARD ERROR] $_" -ForegroundColor Red
        }
    }
} catch {
    Write-Host "`n[ERROR] Failed to open or maintain connection to $ComPort: $_" -ForegroundColor Red
} finally {
    if ($port -and $port.IsOpen) {
        $port.Close()
        Write-Host "`nClosed $ComPort." -ForegroundColor Gray
    }
}
