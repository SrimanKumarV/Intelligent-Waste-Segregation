# Intelligent Solid Waste Segregation Analytics — IoT Backend & Gateway Server
# Framework: Native PowerShell / .NET HttpListener (Zero external dependencies)
# Port: 8080 (http://localhost:8080)

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

# Multi-Device State in memory
$global:latestUnoTelemetry = $null
$global:lastUnoReceivedTime = $null
$global:latestEsp32Telemetry = $null
$global:lastEsp32ReceivedTime = $null

$global:latestTelemetry = $null
$global:lastReceivedTime = $null
$global:lastLidState = "CLOSED"
$global:commandQueue = [System.Collections.Generic.Queue[string]]::new()
$global:monitoringMode = "hardware"
$global:simulationStartedAt = $null
$global:simulationSessionId = $null

Write-Host "==========================================================" -ForegroundColor DarkGreen
Write-Host " Intelligent Waste Segregation -- Multi-Device Backend v2.1 " -ForegroundColor Green
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

    return @{
        overall_status = $overall
        timestamp = $now.ToString("o")
        uno = @{
            device_id = if ($global:latestUnoTelemetry -and $global:latestUnoTelemetry.dev) { $global:latestUnoTelemetry.dev } else { "UNO-WS01" }
            device_name = "Arduino Uno (Proximity & Lid)"
            status = $unoStatus
            connected = $unoConnected
            seconds_since_last_packet = $unoElapsed
            last_received_at = if ($global:lastUnoReceivedTime) { $global:lastUnoReceivedTime.ToString("o") } else { $null }
            uptime_seconds = if ($global:latestUnoTelemetry -and $global:latestUnoTelemetry.up) { $global:latestUnoTelemetry.up } else { 0 }
            faults = if ($global:latestUnoTelemetry -and $global:latestUnoTelemetry.faults) { $global:latestUnoTelemetry.faults } else { @() }
        }
        esp32 = @{
            device_id = if ($global:latestEsp32Telemetry -and $global:latestEsp32Telemetry.dev) { $global:latestEsp32Telemetry.dev } else { "ESP32-WS01" }
            device_name = "ESP32 (Moisture & Load Cell)"
            status = $espStatus
            connected = $espConnected
            seconds_since_last_packet = $espElapsed
            last_received_at = if ($global:lastEsp32ReceivedTime) { $global:lastEsp32ReceivedTime.ToString("o") } else { $null }
            uptime_seconds = if ($global:latestEsp32Telemetry -and $global:latestEsp32Telemetry.up) { $global:latestEsp32Telemetry.up } else { 0 }
            faults = if ($global:latestEsp32Telemetry -and $global:latestEsp32Telemetry.faults) { $global:latestEsp32Telemetry.faults } else { @() }
        }
    }
}

function Get-DeviceHealth {
    # Backward compatible summary
    $devices = Get-DevicesHealth
    $connected = ($devices.overall_status -eq "BOTH_CONNECTED" -or $devices.overall_status -eq "UNO_ONLY" -or $devices.overall_status -eq "ESP32_ONLY")
    $status = if ($devices.overall_status -eq "BOTH_CONNECTED") { "ONLINE" } elseif ($connected) { "PARTIAL" } else { "DISCONNECTED" }

    return @{
        status = $status
        connected = $connected
        overall_status = $devices.overall_status
        device_id = "MULTI-DEVICE"
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

        # Module B (ESP32): Moisture & Load Cell
        moist_raw = if ($esp32) { $esp32.moist_raw } else { $null }
        moist_pct = if ($esp32) { $esp32.moist_pct } else { $null }
        moist_ok = if ($esp32 -and $null -ne $esp32.moist_ok) { [bool]$esp32.moist_ok } else { $false }
        moist_cal = if ($esp32 -and $null -ne $esp32.moist_cal) { [bool]$esp32.moist_cal } else { $false }
        weight_g = if ($esp32) { $esp32.weight_g } else { $null }
        weight_raw = if ($esp32) { $esp32.weight_raw } else { $null }
        weight_ok = if ($esp32 -and $null -ne $esp32.weight_ok) { [bool]$esp32.weight_ok } else { $false }
        weight_cal = if ($esp32 -and $null -ne $esp32.weight_cal) { [bool]$esp32.weight_cal } else { $false }
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
        if (-not $record.v) {
            return @{ success = $false; error = "Invalid schema: missing protocol version 'v'" }
        }

        $now = Get-Date
        $record | Add-Member -MemberType NoteProperty -Name "received_at" -Value $now.ToString("o") -Force

        $target = $explicitTarget
        if ([string]::IsNullOrWhiteSpace($target)) {
            $devStr = "$($record.dev)".ToUpper()
            if ($devStr.Contains("UNO")) {
                $target = "uno"
            } elseif ($devStr.Contains("ESP32")) {
                $target = "esp32"
            } elseif ($null -ne $record.dist_cm -and $null -eq $record.moist_raw -and $null -eq $record.weight_raw) {
                $target = "uno"
            } elseif ($null -ne $record.moist_raw -or $null -ne $record.weight_raw) {
                $target = "esp32"
            } else {
                $target = "composite"
            }
        }

        if ($target -eq "uno") {
            $global:latestUnoTelemetry = $record
            $global:lastUnoReceivedTime = $now

            # Check for Lid State Transition
            $currentLid = $record.lid_cmd
            if ($currentLid -and $currentLid -ne $global:lastLidState) {
                $eventRecord = @{
                    timestamp = $now.ToString("o")
                    device = $record.dev
                    previous_state = $global:lastLidState
                    new_state = $currentLid
                    trigger = if ($record.prox) { "PROXIMITY_DETECTED" } else { "AUTO_TIMEOUT_OR_MANUAL" }
                    distance_cm = $record.dist_cm
                }
                $eventLine = ($eventRecord | ConvertTo-Json -Compress)
                Add-Content -Path $lidEventsLogFile -Value $eventLine
                $global:lastLidState = $currentLid
            }
        } elseif ($target -eq "esp32") {
            $global:latestEsp32Telemetry = $record
            $global:lastEsp32ReceivedTime = $now
        } else {
            # Composite legacy packet containing both sets of fields
            $global:latestUnoTelemetry = $record
            $global:lastUnoReceivedTime = $now
            $global:latestEsp32Telemetry = $record
            $global:lastEsp32ReceivedTime = $now
        }

        # Update composite cache
        $composite = Get-CombinedTelemetry
        $global:latestTelemetry = $composite
        $global:lastReceivedTime = $now

        # Persist to telemetry.jsonl
        $line = ($record | ConvertTo-Json -Compress)
        Add-Content -Path $telemetryLogFile -Value $line

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
        $response.Headers.Add("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
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

            if ($path -eq "/api/health" -and $request.HttpMethod -eq "GET") {
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
            elseif ($path -eq "/api/command" -and $request.HttpMethod -eq "POST") {
                $reader = New-Object System.IO.StreamReader($request.InputStream, [System.Text.Encoding]::UTF8)
                $body = $reader.ReadToEnd()
                $reader.Close()

                $cmdObj = $body | ConvertFrom-Json
                $global:commandQueue.Enqueue($cmdObj.command)
                $json = @{ success = $true; queued = $cmdObj.command } | ConvertTo-Json
                $buf = [System.Text.Encoding]::UTF8.GetBytes($json)
                $response.OutputStream.Write($buf, 0, $buf.Length)
            }
            elseif ($path -eq "/api/monitoring/mode" -and $request.HttpMethod -eq "GET") {
                $payload = @{
                    mode = $global:monitoringMode
                    simulation_active = ($global:monitoringMode -eq "simulation")
                    session_id = $global:simulationSessionId
                    started_at = $global:simulationStartedAt
                    timestamp = (Get-Date).ToString("o")
                }
                $json = $payload | ConvertTo-Json
                $buf = [System.Text.Encoding]::UTF8.GetBytes($json)
                $response.OutputStream.Write($buf, 0, $buf.Length)
            }
            elseif ($path -eq "/api/monitoring/mode" -and ($request.HttpMethod -eq "POST" -or $request.HttpMethod -eq "PUT")) {
                $reader = New-Object System.IO.StreamReader($request.InputStream, [System.Text.Encoding]::UTF8)
                $body = $reader.ReadToEnd()
                $reader.Close()

                try {
                    $reqObj = $body | ConvertFrom-Json
                    $newMode = "$($reqObj.mode)".ToLower().Trim()
                    if ($newMode -eq "simulation" -or $newMode -eq "hardware") {
                        $prevMode = $global:monitoringMode
                        $global:monitoringMode = $newMode
                        if ($newMode -eq "simulation") {
                            if ($null -eq $global:simulationStartedAt -or $prevMode -ne "simulation") {
                                $global:simulationStartedAt = (Get-Date).ToString("o")
                                $global:simulationSessionId = "SIM-$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())"
                            }
                        } else {
                            $global:simulationStartedAt = $null
                            $global:simulationSessionId = $null
                        }
                        $payload = @{
                            success = $true
                            mode = $global:monitoringMode
                            previous_mode = $prevMode
                            session_id = $global:simulationSessionId
                            started_at = $global:simulationStartedAt
                        }
                        $json = $payload | ConvertTo-Json
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
                $payload = @{
                    simulation_enabled = ($global:monitoringMode -eq "simulation")
                    session_id = $global:simulationSessionId
                    started_at = $global:simulationStartedAt
                    scenarios_available = @("SCENARIO_A", "SCENARIO_B", "SCENARIO_C")
                    default_interval_ms = 1000
                    hardware_isolated = $true
                }
                $json = $payload | ConvertTo-Json -Depth 3
                $buf = [System.Text.Encoding]::UTF8.GetBytes($json)
                $response.OutputStream.Write($buf, 0, $buf.Length)
            }
            elseif ($path.StartsWith("/api/ml/")) {
                $mlTargetUri = "http://127.0.0.1:8000" + $path + $request.Url.Query
                try {
                    $mlReq = [System.Net.HttpWebRequest]::Create($mlTargetUri)
                    $mlReq.Method = $request.HttpMethod
                    $mlReq.Timeout = 2500
                    $mlReq.ContentType = "application/json"

                    if ($request.HttpMethod -eq "POST" -or $request.HttpMethod -eq "PUT") {
                        $reader = New-Object System.IO.StreamReader($request.InputStream, [System.Text.Encoding]::UTF8)
                        $postBody = $reader.ReadToEnd()
                        $reader.Close()
                        $byteData = [System.Text.Encoding]::UTF8.GetBytes($postBody)
                        $mlReq.ContentLength = $byteData.Length
                        $reqStream = $mlReq.GetRequestStream()
                        $reqStream.Write($byteData, 0, $byteData.Length)
                        $reqStream.Close()
                    }

                    $mlResp = $mlReq.GetResponse()
                    $respStream = $mlResp.GetResponseStream()
                    $sr = New-Object System.IO.StreamReader($respStream, [System.Text.Encoding]::UTF8)
                    $json = $sr.ReadToEnd()
                    $sr.Close()
                    $mlResp.Close()
                } catch {
                    $json = @{
                        status = "model_unavailable"
                        message = "Python ML microservice is offline or unreachable on http://127.0.0.1:8000"
                        error = $_.Exception.Message
                    } | ConvertTo-Json
                }
                $buf = [System.Text.Encoding]::UTF8.GetBytes($json)
                $response.OutputStream.Write($buf, 0, $buf.Length)
            }
            else {
                $response.StatusCode = 404
                $json = @{ error = "Not found" } | ConvertTo-Json
                $buf = [System.Text.Encoding]::UTF8.GetBytes($json)
                $response.OutputStream.Write($buf, 0, $buf.Length)
            }

            $response.Close()
            continue
        }

        # STATIC FILE SERVING FOR DASHBOARD
        $relPath = $path.TrimStart('/')
        if ([string]::IsNullOrWhiteSpace($relPath)) {
            $relPath = "index.html"
        }

        $filePath = Join-Path $dashboardDir $relPath
        if (Test-Path $filePath -PathType Leaf) {
            $bytes = [System.IO.File]::ReadAllBytes($filePath)
            $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
            switch ($ext) {
                ".html" { $response.ContentType = "text/html; charset=utf-8" }
                ".css"  { $response.ContentType = "text/css; charset=utf-8" }
                ".js"   { $response.ContentType = "application/javascript; charset=utf-8" }
                ".json" { $response.ContentType = "application/json; charset=utf-8" }
                ".svg"  { $response.ContentType = "image/svg+xml" }
                Default { $response.ContentType = "application/octet-stream" }
            }
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
        } else {
            $response.StatusCode = 404
            $msg = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found")
            $response.OutputStream.Write($msg, 0, $msg.Length)
        }
        $response.Close()
        } catch {
            Write-Host "[REQUEST EXCEPTION] $_" -ForegroundColor DarkGray
        }
    }
} finally {
    $listener.Stop()
}
