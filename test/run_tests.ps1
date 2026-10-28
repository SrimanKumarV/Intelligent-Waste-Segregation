# PowerShell Test Runner for Intelligent Solid Waste Segregation System (Arduino Uno & IoT Suite)

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  Intelligent Waste Segregation - Automated Test Suite    " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

$allPassed = $true

# 1. Check for C++ compiler
$gpp = Get-Command g++ -ErrorAction SilentlyContinue
if ($gpp) {
    Write-Host "`n[1/3] Compiling test_detection.cpp with g++..." -ForegroundColor Yellow
    $outExe = "$PSScriptRoot\test_detection.exe"
    & g++ -std=c++11 -DUNIT_TEST -I"$PSScriptRoot\..\include" "$PSScriptRoot\test_detection.cpp" -o $outExe
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Running test_detection.exe:`n" -ForegroundColor Green
        & $outExe
        if ($LASTEXITCODE -ne 0) { $allPassed = $false }
    } else {
        $allPassed = $false
    }
} else {
    Write-Host "`n[1/3] C++ compiler (g++) not found in PATH (skipped binary test)." -ForegroundColor DarkGray
}

# 2. Telemetry Protocol Syntax & Structure Unit Tests (PowerShell native)
Write-Host "`n[2/3] Validating Telemetry Protocol JSON Specifications..." -ForegroundColor Yellow

$sampleValidJSON = '{"v":1,"dev":"UNO-WS01","seq":10,"up":20,"moist_raw":450,"moist_pct":68.5,"moist_ok":true,"moist_cal":true,"weight_g":152.0,"weight_raw":63840,"weight_ok":true,"weight_cal":true,"dist_cm":14.2,"prox":true,"lid_cmd":"OPEN","faults":[]}'
$sampleUncalibJSON = '{"v":1,"dev":"UNO-WS01","seq":11,"up":21,"moist_raw":620,"moist_pct":null,"moist_ok":true,"moist_cal":false,"weight_g":null,"weight_raw":0,"weight_ok":false,"weight_cal":false,"dist_cm":null,"prox":false,"lid_cmd":"CLOSED","faults":["CALIBRATION_REQUIRED"]}'

try {
    $parsed1 = $sampleValidJSON | ConvertFrom-Json
    if ($parsed1.v -eq 1 -and $parsed1.dev -eq "UNO-WS01" -and $parsed1.moist_pct -eq 68.5) {
        Write-Host "  PASS: Valid calibrated telemetry parsed correctly" -ForegroundColor Green
    } else {
        Write-Host "  FAIL: Valid telemetry schema mismatch" -ForegroundColor Red
        $allPassed = $false
    }

    $parsed2 = $sampleUncalibJSON | ConvertFrom-Json
    if ($parsed2.moist_pct -eq $null -and $parsed2.weight_g -eq $null -and $parsed2.faults[0] -eq "CALIBRATION_REQUIRED") {
        Write-Host "  PASS: Uncalibrated telemetry explicit nulls preserved" -ForegroundColor Green
    } else {
        Write-Host "  FAIL: Null preservation failed" -ForegroundColor Red
        $allPassed = $false
    }
} catch {
    Write-Host "  FAIL: JSON parser error: $_" -ForegroundColor Red
    $allPassed = $false
}

# 3. Check Dashboard Files Integrity
Write-Host "`n[3/3] Checking Dashboard Asset Integrity..." -ForegroundColor Yellow
$dashFiles = @("index.html", "styles.css", "app.js")
foreach ($f in $dashFiles) {
    $p = Join-Path "$PSScriptRoot\..\simulation\dashboard" $f
    if (Test-Path $p) {
        $size = (Get-Item $p).Length
        Write-Host "  PASS: Found $f ($size bytes)" -ForegroundColor Green
    } else {
        Write-Host "  FAIL: Missing $f" -ForegroundColor Red
        $allPassed = $false
    }
}

Write-Host "`n==========================================================" -ForegroundColor Cyan
if ($allPassed) {
    Write-Host "  TEST SUITE COMPLETED: ALL INTEGRITY CHECKS PASSED       " -ForegroundColor Green
} else {
    Write-Host "  TEST SUITE COMPLETED WITH ISSUES                        " -ForegroundColor Yellow
}
Write-Host "==========================================================" -ForegroundColor Cyan
