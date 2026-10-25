# PowerShell Test Runner for Intelligent Solid Waste Segregation System

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  Intelligent Solid Waste Segregation - Host Test Runner" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Check for Python
$py = Get-Command python -ErrorAction SilentlyContinue
if ($py) {
    try {
        & python --version 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Write-Host "`n[1/2] Running Python simulation..." -ForegroundColor Yellow
            & python "$PSScriptRoot\..\simulation\simulate_system.py"
        } else {
            Write-Host "`n[1/2] Python command found but returned exit code $LASTEXITCODE." -ForegroundColor DarkGray
        }
    } catch {
        Write-Host "`n[1/2] Python execution failed: $_" -ForegroundColor DarkGray
    }
} else {
    Write-Host "`n[1/2] Python is not installed." -ForegroundColor DarkGray
}

# 2. Check for C++ compiler
$gpp = Get-Command g++ -ErrorAction SilentlyContinue
if ($gpp) {
    Write-Host "`n[2/2] Compiling test_detection.cpp with g++..." -ForegroundColor Yellow
    $outExe = "$PSScriptRoot\test_detection.exe"
    & g++ -std=c++11 -DUNIT_TEST -I"$PSScriptRoot\..\include" "$PSScriptRoot\test_detection.cpp" -o $outExe
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Running test_detection.exe:`n" -ForegroundColor Green
        & $outExe
    }
} else {
    Write-Host "`n[2/2] C++ compiler (g++) not found in PATH." -ForegroundColor DarkGray
}

Write-Host "`nInteractive Digital Twin Dashboard available at:" -ForegroundColor Cyan
Write-Host "  $PSScriptRoot\..\simulation\dashboard\index.html" -ForegroundColor White
Write-Host "==========================================================" -ForegroundColor Cyan
