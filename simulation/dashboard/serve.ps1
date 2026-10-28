# Convenience wrapper to launch the unified IoT Backend Server & Dashboard
Write-Host "Redirecting to unified backend server..." -ForegroundColor Cyan
& "$PSScriptRoot\..\..\backend\server.ps1" -Port 8080
