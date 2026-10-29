# Intelligent Solid Waste Segregation Analytics - IoT Backend & Gateway Server
# Framework: Native PowerShell / .NET HttpListener (Zero external dependencies)
# Port: 8080 (http://localhost:8080)
# Multi-Microcontroller Architecture: Module A (Arduino Uno) & Module B (ESP32)

param (
    [int]$Port = 8080,
    [string]$ComPort = "",
    [int]$BaudRate = 115200
)

$baseDir = Resolve-Path "$PSScriptRoot\.."
$dashboardDir = Join-Path $baseDir "simulation\dashboard"
$dataDir = Join-Path $baseDir "data"

if (-not (Test-Path $dataDir)) {
    New-Item -ItemType Directory -Path $dataDir | Out-Null
}

$telemetryLogFile = Join-Path $dataDir "telemetry.jsonl"
$lidEventsLogFile = Join-Path $dataDir "lid_events.jsonl"
$categoriesLogFile = Join-Path $dataDir "classifications.jsonl"

# Centralized Compartment Definitions
$global:COMPARTMENTS_CONFIG = @(
    @{
        id = "A"
        name = "Biodegradable Waste"
        configured = $true
        active = $true
        category = "BIODEGRADABLE"
        moisture_channel = "c1"
        weight_channel = "lc1"
        description = "Organic food scraps, compostable matter. High moisture capacity."
    },
    @{
        id = "B"
        name = "Non-Biodegradable Waste"
        configured = $true
        active = $true
        category = "NON_BIODEGRADABLE"
        moisture_channel = "c2"
        weight_channel = "lc2"
        description = "Dry recyclables, containers, plastics, metals, packaging."
    },
    @{
        id = "C"
        name = "Reserved Compartment"
        configured = $false
        active = $false
        category = $null
        moisture_channel = $null
        weight_channel = $null
        status = "RESERVED_FUTURE_USE"
        description = "Reserved for future hardware expansion - no active sensors assigned."
    }
)

# Multi-Device State in memory
$global:latestUnoTelemetry = $null
$global:lastUnoReceivedTime = $null
$global:latestEsp32Telemetry = $null
$global:lastEsp32ReceivedTime = $null

$global:latestTelemetry = $null
$global:lastReceivedTime = $null
$global:lastLidState = "CLOSED"
$global:unoCommandQueue = [System.Collections.Generic.Queue[string]]::new()
$global:esp32CommandQueue = [System.Collections.Generic.Queue[string]]::new()
$global:monitoringMode = "hardware"
$global:simulationStartedAt = $null
$global:simulationSessionId = $null

Write-Host "==========================================================" -ForegroundColor DarkGreen
Write-Host " Intelligent Waste Segregation -- Multi-Device Backend v2.2 " -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor DarkGreen
Write-Host " Dashboard Directory: $dashboardDir" -ForegroundColor Gray
Write-Host " Data Storage:        $dataDir" -ForegroundColor Gray
Write-Host " Default Mode:        $global:monitoringMode" -ForegroundColor Yellow
Write-Host " Listening on:        http://localhost:$Port/" -ForegroundColor Cyan

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Prefixes.Add("http://127.0.0.1:$Port/")
$listener.Start()

function Get-DevicesHealth {
    $now = Get-Date

    # 1. Uno Health Evaluation
    $unoStatus = "DISCONNECTED"
    $unoElapsed = $null
    $unoConnected = $false
    if ($null -ne $global:lastUnoReceivedTime) {
        $unoElapsed = [Math]::Round(($now - $global:lastUnoReceivedTime).TotalSeconds, 1)
        if ($unoElapsed -le 5.0) {
            $unoStatus = "CONNECTED"
            $unoConnected = $true
        } elseif ($unoElapsed -le 15.0) {
            $unoStatus = "STALE"
            $unoConnected = $false
        } else {
            $unoStatus = "DISCONNECTED"
            $unoConnected = $false
        }
    }

    # 2. ESP32 Health Evaluation
    $espStatus = "DISCONNECTED"
    $espElapsed = $null
    $espConnected = $false
    if ($null -ne $global:lastEsp32ReceivedTime) {
        $espElapsed = [Math]::Round(($now - $global:lastEsp32ReceivedTime).TotalSeconds, 1)
        if ($espElapsed -le 5.0) {
            $espStatus = "CONNECTED"
            $espConnected = $true
        } elseif ($espElapsed -le 15.0) {
            $espStatus = "STALE"
            $espConnected = $false
        } else {
            $espStatus = "DISCONNECTED"
            $espConnected = $false
        }
    }

    $overall = if ($unoConnected -and $espConnected) {
        "BOTH_CONNECTED"
    } elseif ($unoConnected) {
        "UNO_ONLY"
    } elseif ($espConnected) {
        "ESP32_ONLY"
    } else {
        "ALL_OFFLINE"
    }

    $esp = $global:latestEsp32Telemetry

    return @{
        overall_status = $overall
        timestamp = $now.ToString("o")
        uno = @{
            device_id = if ($global:latestUnoTelemetry -and $global:latestUnoTelemetry.dev) { $global:latestUnoTelemetry.dev } else { "UNO-WS01" }
            device_name = "Arduino Uno (Proximity & Autonomous Lid)"
            status = $unoStatus
            connected = $unoConnected
            seconds_since_last_packet = $unoElapsed
            last_received_at = if ($global:lastUnoReceivedTime) { $global:lastUnoReceivedTime.ToString("o") } else { $null }
            uptime_seconds = if ($global:latestUnoTelemetry -and $global:latestUnoTelemetry.up) { $global:latestUnoTelemetry.up } else { 0 }
            faults = if ($global:latestUnoTelemetry -and $global:latestUnoTelemetry.faults) { $global:latestUnoTelemetry.faults } else { @() }
        }
        esp32 = @{
            device_id = if ($esp -and $esp.dev) { $esp.dev } else { "ESP32-WS01" }
            device_name = "ESP32 Multi-Sensor Hub (C1, C2, LC1, LC2)"
            status = $espStatus
            connected = $espConnected
            seconds_since_last_packet = $espElapsed
            last_received_at = if ($global:lastEsp32ReceivedTime) { $global:lastEsp32ReceivedTime.ToString("o") } else { $null }
            uptime_seconds = if ($esp -and $esp.up) { $esp.up } else { 0 }
            channels = @{
                c1 = @{
                    ok = if ($esp -and $null -ne $esp.c1_ok) { [bool]$esp.c1_ok } elseif ($esp -and $null -ne $esp.moist_ok) { [bool]$esp.moist_ok } else { $false }
                    calibrated = if ($esp -and $null -ne $esp.c1_cal) { [bool]$esp.c1_cal } elseif ($esp -and $null -ne $esp.moist_cal) { [bool]$esp.moist_cal } else { $false }
                }
                c2 = @{
                    ok = if ($esp -and $null -ne $esp.c2_ok) { [bool]$esp.c2_ok } else { $false }
                    calibrated = if ($esp -and $null -ne $esp.c2_cal) { [bool]$esp.c2_cal } else { $false }
                }
                lc1 = @{
                    ok = if ($esp -and $null -ne $esp.lc1_ok) { [bool]$esp.lc1_ok } elseif ($esp -and $null -ne $esp.weight_ok) { [bool]$esp.weight_ok } else { $false }
                    calibrated = if ($esp -and $null -ne $esp.lc1_cal) { [bool]$esp.lc1_cal } elseif ($esp -and $null -ne $esp.weight_cal) { [bool]$esp.weight_cal } else { $false }
                }
                lc2 = @{
                    ok = if ($esp -and $null -ne $esp.lc2_ok) { [bool]$esp.lc2_ok } else { $false }
                    calibrated = if ($esp -and $null -ne $esp.lc2_cal) { [bool]$esp.lc2_cal } else { $false }
                }
            }
            lid_sync_state = if ($esp -and $esp.lid_sync_state) { $esp.lid_sync_state } else { "UNKNOWN" }
            lid_sync_fresh = if ($esp -and $null -ne $esp.lid_sync_fresh) { [bool]$esp.lid_sync_fresh } else { $false }
            faults = if ($esp -and $esp.faults) { $esp.faults } else { @() }
        }
    }
}

function Get-DeviceHealth {
    $devices = Get-DevicesHealth
    $connected = ($devices.overall_status -eq "BOTH_CONNECTED" -or $devices.overall_status -eq "UNO_ONLY" -or $devices.overall_status -eq "ESP32_ONLY")
    $status = if ($devices.overall_status -eq "BOTH_CONNECTED") { "ONLINE" } elseif ($connected) { "PARTIAL" } else { "DISCONNECTED" }

    return @{
        status = $status
        connected = $connected
        overall_status = $devices.overall_status
        device_id = "MULTI-MICROCONTROLLER"
        uno = $devices.uno
        esp32 = $devices.esp32
        seconds_since_last_packet = if ($null -ne $devices.uno.seconds_since_last_packet) { $devices.uno.seconds_since_last_packet } else { $devices.esp32.seconds_since_last_packet }
        uptime_seconds = [Math]::Max([int]$devices.uno.uptime_seconds, [int]$devices.esp32.uptime_seconds)
        last_received_at = if ($global:lastReceivedTime) { $global:lastReceivedTime.ToString("o") } else { $null }
    }
}

function Get-CombinedTelemetry {
    $health = Get-DevicesHealth
    $now = Get-Date

    $uno = $global:latestUnoTelemetry
    $esp32 = $global:latestEsp32Telemetry

    $allFaults = [System.Collections.Generic.List[string]]::new()
    if ($uno -and $uno.faults) {
        foreach ($f in $uno.faults) { if (-not $allFaults.Contains($f)) { $allFaults.Add($f) } }
    }
    if ($esp32 -and $esp32.faults) {
        foreach ($f in $esp32.faults) { if (-not $allFaults.Contains($f)) { $allFaults.Add($f) } }
    }
    if ($health.uno.status -eq "DISCONNECTED") {
        if (-not $allFaults.Contains("UNO_OFFLINE")) { $allFaults.Add("UNO_OFFLINE") }
    }
    if ($health.esp32.status -eq "DISCONNECTED") {
        if (-not $allFaults.Contains("ESP32_OFFLINE")) { $allFaults.Add("ESP32_OFFLINE") }
    }

    # Extract 4 independent channels
    $c1Raw = if ($esp32) { if ($null -ne $esp32.c1_raw) { $esp32.c1_raw } else { $esp32.moist_raw } } else { $null }
    $c1Pct = if ($esp32) { if ($null -ne $esp32.c1_pct) { $esp32.c1_pct } else { $esp32.moist_pct } } else { $null }
    $c1Ok = if ($esp32) { if ($null -ne $esp32.c1_ok) { [bool]$esp32.c1_ok } elseif ($null -ne $esp32.moist_ok) { [bool]$esp32.moist_ok } else { $false } } else { $false }
    $c1Cal = if ($esp32) { if ($null -ne $esp32.c1_cal) { [bool]$esp32.c1_cal } elseif ($null -ne $esp32.moist_cal) { [bool]$esp32.moist_cal } else { $false } } else { $false }

    $c2Raw = if ($esp32 -and $null -ne $esp32.c2_raw) { $esp32.c2_raw } else { $null }
    $c2Pct = if ($esp32 -and $null -ne $esp32.c2_pct) { $esp32.c2_pct } else { $null }
    $c2Ok = if ($esp32 -and $null -ne $esp32.c2_ok) { [bool]$esp32.c2_ok } else { $false }
    $c2Cal = if ($esp32 -and $null -ne $esp32.c2_cal) { [bool]$esp32.c2_cal } else { $false }

    $lc1G = if ($esp32) { if ($null -ne $esp32.lc1_g) { $esp32.lc1_g } else { $esp32.weight_g } } else { $null }
    $lc1Raw = if ($esp32) { if ($null -ne $esp32.lc1_raw) { $esp32.lc1_raw } else { $esp32.weight_raw } } else { $null }
    $lc1Ok = if ($esp32) { if ($null -ne $esp32.lc1_ok) { [bool]$esp32.lc1_ok } elseif ($null -ne $esp32.weight_ok) { [bool]$esp32.weight_ok } else { $false } } else { $false }
    $lc1Cal = if ($esp32) { if ($null -ne $esp32.lc1_cal) { [bool]$esp32.lc1_cal } elseif ($null -ne $esp32.weight_cal) { [bool]$esp32.weight_cal } else { $false } } else { $false }

    $lc2G = if ($esp32 -and $null -ne $esp32.lc2_g) { $esp32.lc2_g } else { $null }
    $lc2Raw = if ($esp32 -and $null -ne $esp32.lc2_raw) { $esp32.lc2_raw } else { $null }
    $lc2Ok = if ($esp32 -and $null -ne $esp32.lc2_ok) { [bool]$esp32.lc2_ok } else { $false }
    $lc2Cal = if ($esp32 -and $null -ne $esp32.lc2_cal) { [bool]$esp32.lc2_cal } else { $false }

    # Total Measured Mass Calculation across LC1 & LC2
    $totalWeightG = $null
    $totalWeightStatus = "UNAVAILABLE"
    $isLc1Valid = ($null -ne $lc1G -and $lc1Ok -and $lc1Cal)
    $isLc2Valid = ($null -ne $lc2G -and $lc2Ok -and $lc2Cal)

    if ($isLc1Valid -and $isLc2Valid) {
        $totalWeightG = [Math]::Round(($lc1G + $lc2G), 1)
        $totalWeightStatus = "COMPLETE"
    } elseif ($isLc1Valid) {
        $totalWeightG = [Math]::Round($lc1G, 1)
        $totalWeightStatus = "PARTIAL (LC1 Only)"
    } elseif ($isLc2Valid) {
        $totalWeightG = [Math]::Round($lc2G, 1)
        $totalWeightStatus = "PARTIAL (LC2 Only)"
    } else {
        $totalWeightG = $null
        $totalWeightStatus = "UNAVAILABLE"
    }

    return @{
        v = 1
        source = if ($global:monitoringMode -eq "simulation") { "simulation" } else { "hardware" }
        timestamp = $now.ToString("o")
        device_health = $health

        # Module A (Arduino Uno): Ultrasonic Proximity & Lid
        dist_cm = if ($uno) { $uno.dist_cm } else { $null }
        prox = if ($uno) { [bool]$uno.prox } else { $false }
        lid_cmd = if ($uno -and $uno.lid_cmd) { $uno.lid_cmd } else { "CLOSED" }
        uno_stale = ($health.uno.status -ne "CONNECTED")
        uno_received_at = if ($global:lastUnoReceivedTime) { $global:lastUnoReceivedTime.ToString("o") } else { $null }
        uno_seq = if ($uno) { $uno.seq } else { $null }
        uno_up = if ($uno) { $uno.up } else { 0 }

        # Module B (ESP32): 4 Sensor Channels
        c1_raw = $c1Raw
        c1_pct = $c1Pct
        c1_ok = $c1Ok
        c1_cal = $c1Cal

        c2_raw = $c2Raw
        c2_pct = $c2Pct
        c2_ok = $c2Ok
        c2_cal = $c2Cal

        lc1_g = $lc1G
        lc1_raw = $lc1Raw
        lc1_ok = $lc1Ok
        lc1_cal = $lc1Cal

        lc2_g = $lc2G
        lc2_raw = $lc2Raw
        lc2_ok = $lc2Ok
        lc2_cal = $lc2Cal

        # Backward compatibility composite properties
        moist_raw = $c1Raw
        moist_pct = $c1Pct
        moist_ok = $c1Ok
        moist_cal = $c1Cal
        weight_g = $lc1G
        weight_raw = $lc1Raw
        weight_ok = $lc1Ok
        weight_cal = $lc1Cal

        # Total Measured Mass
        total_measured_weight_g = $totalWeightG
        total_weight_status = $totalWeightStatus

        # Three Compartments Representation
        compartments = @{
            A = @{
                id = "A"
                name = "Biodegradable Waste"
                configured = $true
                active = $true
                category = "BIODEGRADABLE"
                moisture_pct = $c1Pct
                moisture_raw = $c1Raw
                moisture_ok = $c1Ok
                moisture_cal = $c1Cal
                weight_g = $lc1G
                weight_raw = $lc1Raw
                weight_ok = $lc1Ok
                weight_cal = $lc1Cal
                status = if ($c1Ok -and $lc1Ok) { "HEALTHY" } else { "WARNING" }
            }
            B = @{
                id = "B"
                name = "Non-Biodegradable Waste"
                configured = $true
                active = $true
                category = "NON_BIODEGRADABLE"
                moisture_pct = $c2Pct
                moisture_raw = $c2Raw
                moisture_ok = $c2Ok
                moisture_cal = $c2Cal
                weight_g = $lc2G
                weight_raw = $lc2Raw
                weight_ok = $lc2Ok
                weight_cal = $lc2Cal
                status = if ($c2Ok -and $lc2Ok) { "HEALTHY" } else { "WARNING" }
            }
            C = @{
                id = "C"
                name = "Reserved / Future Use"
                configured = $false
                active = $false
                category = $null
                status = "NOT_CONFIGURED"
                moisture_pct = $null
                weight_g = $null
                note = "Reserved for future functionality - no sensors assigned"
            }
        }

        esp32_stale = ($health.esp32.status -ne "CONNECTED")
        esp32_received_at = if ($global:lastEsp32ReceivedTime) { $global:lastEsp32ReceivedTime.ToString("o") } else { $null }
        esp32_seq = if ($esp32) { $esp32.seq } else { $null }
        esp32_up = if ($esp32) { $esp32.up } else { 0 }

        faults = $allFaults.ToArray()
        raw_uno = $uno
        raw_esp32 = $esp32
    }
}

function Get-CategoryStats {
    $bioCount = 0
    $nonBioCount = 0
    $totalWeightBio = 0.0
    $totalWeightNonBio = 0.0

    if (Test-Path $categoriesLogFile) {
        $lines = Get-Content $categoriesLogFile -ErrorAction SilentlyContinue
        foreach ($line in $lines) {
            if ([string]::IsNullOrWhiteSpace($line)) { continue }
            try {
                $rec = $line | ConvertFrom-Json
                if ($rec.category -eq "BIODEGRADABLE") {
                    $bioCount++
                    if ($rec.weight_g) { $totalWeightBio += [float]$rec.weight_g }
                } elseif ($rec.category -eq "NON_BIODEGRADABLE") {
                    $nonBioCount++
                    if ($rec.weight_g) { $totalWeightNonBio += [float]$rec.weight_g }
                }
            } catch {}
        }
    }

    $total = $bioCount + $nonBioCount
    $bioPct = if ($total -gt 0) { [Math]::Round(($bioCount / $total) * 100, 1) } else { 0.0 }
    $nonBioPct = if ($total -gt 0) { [Math]::Round(($nonBioCount / $total) * 100, 1) } else { 0.0 }

    return @{
        total_events = $total
        biodegradable = @{
            count = $bioCount
            percentage = $bioPct
            total_weight_grams = [Math]::Round($totalWeightBio, 1)
        }
        non_biodegradable = @{
            count = $nonBioCount
            percentage = $nonBioPct
            total_weight_grams = [Math]::Round($totalWeightNonBio, 1)
        }
    }
}

function Ingest-TelemetryRecord ($jsonString, $explicitTarget = "") {
    try {
        $record = $jsonString | ConvertFrom-Json
        $now = Get-Date
        $record | Add-Member -MemberType NoteProperty -Name "received_at" -Value $now.ToString("o") -Force

        $target = $explicitTarget
        if ([string]::IsNullOrWhiteSpace($target)) {
            $devStr = if ($record.dev) { [string]$record.dev.ToUpper() } else { "" }
            if ($devStr.Contains("UNO")) { $target = "uno" }
            elseif ($devStr.Contains("ESP32")) { $target = "esp32" }
            elseif ($null -ne $record.dist_cm -and $null -eq $record.c1_raw -and $null -eq $record.moist_raw -and $null -eq $record.weight_raw) { $target = "uno" }
            elseif ($null -ne $record.c1_raw -or $null -ne $record.moist_raw -or $null -ne $record.lc1_raw -or $null -ne $record.weight_raw) { $target = "esp32" }
            else { $target = "composite" }
        }

        if ($target -eq "uno") {
            $global:latestUnoTelemetry = $record
            $global:lastUnoReceivedTime = $now

            # Record verified lid events
            if ($record.lid_cmd -and $record.lid_cmd -ne $global:lastLidState) {
                $ev = @{
                    timestamp = $record.received_at
                    device = if ($record.dev) { $record.dev } else { "UNO-WS01" }
                    previous_state = $global:lastLidState
                    new_state = $record.lid_cmd
                    trigger = if ($record.prox) { "PROXIMITY_DETECTED" } else { "AUTO_TIMEOUT_OR_MANUAL" }
                    distance_cm = $record.dist_cm
                }
                $evLine = ($ev | ConvertTo-Json -Compress)
                Add-Content -Path $lidEventsLogFile -Value $evLine
                $global:lastLidState = $record.lid_cmd

                # Queue lid sync for ESP32
                $global:esp32CommandQueue.Enqueue((@{
                    cmd = "sync_lid"
                    state = $record.lid_cmd
                    seq = if ($record.seq) { $record.seq } else { 0 }
                    ts = [DateTimeOffset]::Now.ToUnixTimeMilliseconds()
                } | ConvertTo-Json -Compress))
            }
        } elseif ($target -eq "esp32") {
            $global:latestEsp32Telemetry = $record
            $global:lastEsp32ReceivedTime = $now
        } else {
            $global:latestUnoTelemetry = $record
            $global:lastUnoReceivedTime = $now
            $global:latestEsp32Telemetry = $record
            $global:lastEsp32ReceivedTime = $now
        }

        $composite = Get-CombinedTelemetry
        $global:latestTelemetry = $composite
        $global:lastReceivedTime = $now

        # Persist to telemetry.jsonl for hardware mode only
        if ($global:monitoringMode -eq "hardware") {
            $line = ($record | ConvertTo-Json -Compress)
            Add-Content -Path $telemetryLogFile -Value $line
        }

        return @{ success = $true; target = $target; seq = $record.seq }
    } catch {
        return @{ success = $false; error = $_.Exception.Message }
    }
}

try {
    while ($listener.IsListening) {
        try {
            $context = $listener.GetContext()
            $request = $context.Request
            $response = $context.Response

            # CORS Headers
            $response.Headers.Add("Access-Control-Allow-Origin", "*")
            $response.Headers.Add("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS")
            $response.Headers.Add("Access-Control-Allow-Headers", "Content-Type")

            if ($request.HttpMethod -eq "OPTIONS") {
                $response.StatusCode = 200
                $response.Close()
                continue
            }

            $path = $request.Url.LocalPath

            # REST API ROUTING
            if ($path.StartsWith("/api/")) {
                $response.ContentType = "application/json; charset=utf-8"

                if ($path -eq "/api/compartments" -and $request.HttpMethod -eq "GET") {
                    $json = @{ compartments = $global:COMPARTMENTS_CONFIG } | ConvertTo-Json -Depth 4
                    $buf = [System.Text.Encoding]::UTF8.GetBytes($json)
                    $response.OutputStream.Write($buf, 0, $buf.Length)
                }
                elseif ($path -eq "/api/health" -and $request.HttpMethod -eq "GET") {
                    $health = Get-DeviceHealth
                    $json = $health | ConvertTo-Json -Depth 5
                    $buf = [System.Text.Encoding]::UTF8.GetBytes($json)
                    $response.OutputStream.Write($buf, 0, $buf.Length)
                }
                elseif ($path -eq "/api/devices/status" -and $request.HttpMethod -eq "GET") {
                    $status = Get-DevicesHealth
                    $json = $status | ConvertTo-Json -Depth 5
                    $buf = [System.Text.Encoding]::UTF8.GetBytes($json)
                    $response.OutputStream.Write($buf, 0, $buf.Length)
                }
                elseif ($path -eq "/api/telemetry/combined" -and $request.HttpMethod -eq "GET") {
                    $combined = Get-CombinedTelemetry
                    $json = $combined | ConvertTo-Json -Depth 5
                    $buf = [System.Text.Encoding]::UTF8.GetBytes($json)
                    $response.OutputStream.Write($buf, 0, $buf.Length)
                }
                elseif ($path -eq "/api/telemetry/latest" -and $request.HttpMethod -eq "GET") {
                    $health = Get-DeviceHealth
                    $combined = Get-CombinedTelemetry
                    $payload = @{
                        device_health = $health
                        telemetry = $combined
                    }
                    $json = $payload | ConvertTo-Json -Depth 5
                    $buf = [System.Text.Encoding]::UTF8.GetBytes($json)
                    $response.OutputStream.Write($buf, 0, $buf.Length)
                }
                elseif ($path -eq "/api/telemetry/uno" -and $request.HttpMethod -eq "POST") {
                    $reader = New-Object System.IO.StreamReader($request.InputStream, [System.Text.Encoding]::UTF8)
                    $body = $reader.ReadToEnd()
                    $reader.Close()

                    $result = Ingest-TelemetryRecord $body "uno"
                    $json = $result | ConvertTo-Json
                    $buf = [System.Text.Encoding]::UTF8.GetBytes($json)
                    $response.OutputStream.Write($buf, 0, $buf.Length)
                }
                elseif ($path -eq "/api/telemetry/esp32" -and $request.HttpMethod -eq "POST") {
                    $reader = New-Object System.IO.StreamReader($request.InputStream, [System.Text.Encoding]::UTF8)
                    $body = $reader.ReadToEnd()
                    $reader.Close()

                    $result = Ingest-TelemetryRecord $body "esp32"
                    $json = $result | ConvertTo-Json
                    $buf = [System.Text.Encoding]::UTF8.GetBytes($json)
                    $response.OutputStream.Write($buf, 0, $buf.Length)
                }
                elseif ($path -eq "/api/cmd/uno" -and $request.HttpMethod -eq "POST") {
                    $reader = New-Object System.IO.StreamReader($request.InputStream, [System.Text.Encoding]::UTF8)
                    $body = $reader.ReadToEnd()
                    $reader.Close()

                    $global:unoCommandQueue.Enqueue($body)
                    $json = @{ success = $true; target = "uno"; status = "QUEUED" } | ConvertTo-Json
                    $buf = [System.Text.Encoding]::UTF8.GetBytes($json)
                    $response.OutputStream.Write($buf, 0, $buf.Length)
                }
                elseif ($path -eq "/api/cmd/esp32" -and $request.HttpMethod -eq "POST") {
                    $reader = New-Object System.IO.StreamReader($request.InputStream, [System.Text.Encoding]::UTF8)
                    $body = $reader.ReadToEnd()
                    $reader.Close()

                    $global:esp32CommandQueue.Enqueue($body)
                    $json = @{ success = $true; target = "esp32"; status = "QUEUED" } | ConvertTo-Json
                    $buf = [System.Text.Encoding]::UTF8.GetBytes($json)
                    $response.OutputStream.Write($buf, 0, $buf.Length)
                }
                elseif ($path -eq "/api/telemetry/history" -and $request.HttpMethod -eq "GET") {
                    $history = @()
                    if (Test-Path $telemetryLogFile) {
                        $rawLines = Get-Content $telemetryLogFile -Tail 100 -ErrorAction SilentlyContinue
                        foreach ($l in $rawLines) {
                            if (-not [string]::IsNullOrWhiteSpace($l)) {
                                try { $history += ($l | ConvertFrom-Json) } catch {}
                            }
                        }
                    }
                    $json = if ($history.Count -eq 0) { "[]" } else { $history | ConvertTo-Json -Depth 4 }
                    if ($null -eq $json) { $json = "[]" }
                    $buf = [System.Text.Encoding]::UTF8.GetBytes($json)
                    $response.OutputStream.Write($buf, 0, $buf.Length)
                }
                elseif ($path -eq "/api/lid/events" -and $request.HttpMethod -eq "GET") {
                    $events = @()
                    if (Test-Path $lidEventsLogFile) {
                        $rawLines = Get-Content $lidEventsLogFile -Tail 50 -ErrorAction SilentlyContinue
                        foreach ($l in $rawLines) {
                            if (-not [string]::IsNullOrWhiteSpace($l)) {
                                try { $events += ($l | ConvertFrom-Json) } catch {}
                            }
                        }
                    }
                    $json = if ($events.Count -eq 0) { "[]" } else { $events | ConvertTo-Json -Depth 4 }
                    if ($null -eq $json) { $json = "[]" }
                    $buf = [System.Text.Encoding]::UTF8.GetBytes($json)
                    $response.OutputStream.Write($buf, 0, $buf.Length)
                }
                elseif ($path -eq "/api/categories" -and $request.HttpMethod -eq "GET") {
                    $stats = Get-CategoryStats
                    $json = $stats | ConvertTo-Json -Depth 4
                    $buf = [System.Text.Encoding]::UTF8.GetBytes($json)
                    $response.OutputStream.Write($buf, 0, $buf.Length)
                }
                elseif ($path -eq "/api/telemetry" -and $request.HttpMethod -eq "POST") {
                    $reader = New-Object System.IO.StreamReader($request.InputStream, [System.Text.Encoding]::UTF8)
                    $body = $reader.ReadToEnd()
                    $reader.Close()

                    $result = Ingest-TelemetryRecord $body ""
                    $json = $result | ConvertTo-Json
                    $buf = [System.Text.Encoding]::UTF8.GetBytes($json)
                    $response.OutputStream.Write($buf, 0, $buf.Length)
                }
                elseif ($path -eq "/api/classification" -and $request.HttpMethod -eq "POST") {
                    $reader = New-Object System.IO.StreamReader($request.InputStream, [System.Text.Encoding]::UTF8)
                    $body = $reader.ReadToEnd()
                    $reader.Close()

                    try {
                        $classRec = $body | ConvertFrom-Json
                        $classRec | Add-Member -MemberType NoteProperty -Name "recorded_at" -Value (Get-Date).ToString("o") -Force
                        $classLine = ($classRec | ConvertTo-Json -Compress)
                        Add-Content -Path $categoriesLogFile -Value $classLine

                        $ret = @{ success = $true; message = "Waste classification recorded" }
                        $json = $ret | ConvertTo-Json
                    } catch {
                        $response.StatusCode = 400
                        $json = @{ success = $false; error = $_.Exception.Message } | ConvertTo-Json
                    }
                    $buf = [System.Text.Encoding]::UTF8.GetBytes($json)
                    $response.OutputStream.Write($buf, 0, $buf.Length)
                }
                elseif ($path -eq "/api/monitoring/mode" -and $request.HttpMethod -eq "GET") {
                    $modePayload = @{
                        mode = $global:monitoringMode
                        simulation_active = ($global:monitoringMode -eq "simulation")
                        session_id = $global:simulationSessionId
                        started_at = $global:simulationStartedAt
                        timestamp = (Get-Date).ToString("o")
                    }
                    $json = $modePayload | ConvertTo-Json
                    $buf = [System.Text.Encoding]::UTF8.GetBytes($json)
                    $response.OutputStream.Write($buf, 0, $buf.Length)
                }
                elseif ($path -eq "/api/monitoring/mode" -and ($request.HttpMethod -eq "POST" -or $request.HttpMethod -eq "PUT")) {
                    $reader = New-Object System.IO.StreamReader($request.InputStream, [System.Text.Encoding]::UTF8)
                    $body = $reader.ReadToEnd()
                    $reader.Close()

                    try {
                        $reqObj = $body | ConvertFrom-Json
                        $newMode = [string]$reqObj.mode.ToLower().Trim()
                        if ($newMode -eq "simulation" -or $newMode -eq "hardware") {
                            $prevMode = $global:monitoringMode
                            $global:monitoringMode = $newMode

                            if ($newMode -eq "simulation") {
                                if (-not $global:simulationStartedAt -or $prevMode -ne "simulation") {
                                    $global:simulationStartedAt = (Get-Date).ToString("o")
                                    $global:simulationSessionId = "SIM-" + [DateTimeOffset]::Now.ToUnixTimeSeconds()
                                }
                            } else {
                                $global:simulationStartedAt = $null
                                $global:simulationSessionId = $null
                            }

                            $ret = @{
                                success = $true
                                mode = $global:monitoringMode
                                previous_mode = $prevMode
                                session_id = $global:simulationSessionId
                                started_at = $global:simulationStartedAt
                            }
                            $json = $ret | ConvertTo-Json
                        } else {
                            $response.StatusCode = 400
                            $json = @{ success = $false; error = "Invalid mode. Must be 'hardware' or 'simulation'." } | ConvertTo-Json
                        }
                    } catch {
                        $response.StatusCode = 400
                        $json = @{ success = $false; error = $_.Exception.Message } | ConvertTo-Json
                    }
                    $buf = [System.Text.Encoding]::UTF8.GetBytes($json)
                    $response.OutputStream.Write($buf, 0, $buf.Length)
                }
                elseif ($path -eq "/api/simulation/status" -and $request.HttpMethod -eq "GET") {
                    $simStatus = @{
                        simulation_enabled = ($global:monitoringMode -eq "simulation")
                        session_id = $global:simulationSessionId
                        started_at = $global:simulationStartedAt
                        scenarios_available = @("SCENARIO_A", "SCENARIO_B", "SCENARIO_C", "SCENARIO_D", "SCENARIO_E", "SCENARIO_F")
                        default_interval_ms = 1000
                        hardware_isolated = $true
                    }
                    $json = $simStatus | ConvertTo-Json
                    $buf = [System.Text.Encoding]::UTF8.GetBytes($json)
                    $response.OutputStream.Write($buf, 0, $buf.Length)
                }
                elseif ($path.StartsWith("/api/ml/")) {
                    $mlUrl = "http://127.0.0.1:8000" + $path + $request.Url.Query
                    try {
                        $mlResponse = $null
                        if ($request.HttpMethod -eq "GET") {
                            $mlResponse = Invoke-RestMethod -Uri $mlUrl -Method Get -TimeoutSec 2 -ErrorAction Stop
                        } elseif ($request.HttpMethod -eq "POST") {
                            $reader = New-Object System.IO.StreamReader($request.InputStream, [System.Text.Encoding]::UTF8)
                            $postBody = $reader.ReadToEnd()
                            $reader.Close()
                            $mlResponse = Invoke-RestMethod -Uri $mlUrl -Method Post -Body $postBody -ContentType "application/json" -TimeoutSec 2 -ErrorAction Stop
                        }

                        $json = $mlResponse | ConvertTo-Json -Depth 6
                        $buf = [System.Text.Encoding]::UTF8.GetBytes($json)
                        $response.OutputStream.Write($buf, 0, $buf.Length)
                    } catch {
                        $fallback = @{
                            status = "model_unavailable"
                            message = "Python ML service offline on port 8000"
                            error = $_.Exception.Message
                        }
                        $json = $fallback | ConvertTo-Json
                        $buf = [System.Text.Encoding]::UTF8.GetBytes($json)
                        $response.OutputStream.Write($buf, 0, $buf.Length)
                    }
                }
                else {
                    $response.StatusCode = 404
                    $buf = [System.Text.Encoding]::UTF8.GetBytes('{"error":"Endpoint not found"}')
                    $response.OutputStream.Write($buf, 0, $buf.Length)
                }

                $response.Close()
                continue
            }

            # STATIC FILE SERVING FOR DASHBOARD
            $filePath = if ($path -eq "/") {
                Join-Path $dashboardDir "index.html"
            } else {
                Join-Path $dashboardDir ($path.TrimStart("/").Replace("/", "\"))
            }

            if (-not (Test-Path $filePath -PathType Leaf)) {
                $response.StatusCode = 404
                $response.ContentType = "text/plain"
                $buf = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found")
                $response.OutputStream.Write($buf, 0, $buf.Length)
                $response.Close()
                continue
            }

            $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
            $contentType = switch ($ext) {
                ".html" { "text/html; charset=utf-8" }
                ".css"  { "text/css; charset=utf-8" }
                ".js"   { "application/javascript; charset=utf-8" }
                ".json" { "application/json; charset=utf-8" }
                ".svg"  { "image/svg+xml" }
                ".png"  { "image/png" }
                ".ico"  { "image/x-icon" }
                default { "application/octet-stream" }
            }

            $response.ContentType = $contentType
            $bytes = [System.IO.File]::ReadAllBytes($filePath)
            $response.ContentLength64 = $bytes.Length
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
            $response.Close()

        } catch {
            Write-Host "Error handling HTTP request: $_" -ForegroundColor Red
        }
    }
} finally {
    $listener.Stop()
    $listener.Close()
    Write-Host "Server stopped." -ForegroundColor Gray
}
