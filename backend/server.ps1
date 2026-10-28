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

# State in memory
$global:latestTelemetry = $null
$global:lastReceivedTime = $null
$global:lastLidState = "CLOSED"
$global:commandQueue = [System.Collections.Generic.Queue[string]]::new()

Write-Host "==========================================================" -ForegroundColor DarkGreen
Write-Host " Intelligent Waste Segregation -- IoT Backend Server v2.0 " -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor DarkGreen
Write-Host " Dashboard Directory: $dashboardDir" -ForegroundColor Gray
Write-Host " Data Storage:        $dataDir" -ForegroundColor Gray
Write-Host " Listening on:        http://localhost:$Port/" -ForegroundColor Cyan

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Prefixes.Add("http://127.0.0.1:$Port/")
$listener.Start()

function Get-DeviceHealth {
    if ($null -eq $global:latestTelemetry) {
        return @{
            status = "NO_DATA"
            connected = $false
            device_id = $null
            seconds_since_last_packet = $null
            uptime_seconds = 0
            message = "No sensor telemetry received yet. Awaiting hardware connection."
        }
    }

    $elapsed = [Math]::Round(((Get-Date) - $global:lastReceivedTime).TotalSeconds, 1)
    $connStatus = "ONLINE"
    if ($elapsed -gt 15) {
        $connStatus = "DISCONNECTED"
    } elseif ($elapsed -gt 5) {
        $connStatus = "STALE"
    }

    return @{
        status = $connStatus
        connected = ($connStatus -eq "ONLINE")
        device_id = $global:latestTelemetry.dev
        seconds_since_last_packet = $elapsed
        uptime_seconds = $global:latestTelemetry.up
        last_received_at = $global:lastReceivedTime.ToString("o")
        faults = $global:latestTelemetry.faults
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

function Ingest-TelemetryRecord ($jsonString) {
    try {
        $record = $jsonString | ConvertFrom-Json
        if (-not $record.dev -or -not $record.v) {
            return @{ success = $false; error = "Invalid schema" }
        }

        $now = Get-Date
        $record | Add-Member -MemberType NoteProperty -Name "received_at" -Value $now.ToString("o") -Force

        $global:latestTelemetry = $record
        $global:lastReceivedTime = $now

        # Check for Lid State Transition
        $currentLid = $record.lid_cmd
        if ($currentLid -ne $global:lastLidState) {
            $eventRecord = @{
                timestamp = $now.ToString("o")
                previous_state = $global:lastLidState
                new_state = $currentLid
                trigger = if ($record.prox) { "PROXIMITY_DETECTED" } else { "AUTO_TIMEOUT_OR_MANUAL" }
                distance_cm = $record.dist_cm
            }
            $eventLine = ($eventRecord | ConvertTo-Json -Compress)
            Add-Content -Path $lidEventsLogFile -Value $eventLine
            $global:lastLidState = $currentLid
        }

        # Persist to telemetry.jsonl
        $line = ($record | ConvertTo-Json -Compress)
        Add-Content -Path $telemetryLogFile -Value $line

        return @{ success = $true; seq = $record.seq }
    } catch {
        return @{ success = $false; error = $_.Exception.Message }
    }
}

try {
    while ($listener.IsListening) {
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
                $json = $health | ConvertTo-Json
                $buf = [System.Text.Encoding]::UTF8.GetBytes($json)
                $response.OutputStream.Write($buf, 0, $buf.Length)
            }
            elseif ($path -eq "/api/telemetry/latest" -and $request.HttpMethod -eq "GET") {
                $health = Get-DeviceHealth
                $payload = @{
                    device_health = $health
                    telemetry = $global:latestTelemetry
                }
                $json = $payload | ConvertTo-Json -Depth 5
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
                $json = $history | ConvertTo-Json -Depth 4
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
                $json = $events | ConvertTo-Json -Depth 4
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

                $result = Ingest-TelemetryRecord $body
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
    }
} finally {
    $listener.Stop()
}
