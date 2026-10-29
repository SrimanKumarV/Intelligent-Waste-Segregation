$resH = Invoke-WebRequest -Uri 'http://localhost:8080/' -UseBasicParsing
$resJS = Invoke-WebRequest -Uri 'http://localhost:8080/app.js' -UseBasicParsing
$resCSS = Invoke-WebRequest -Uri 'http://localhost:8080/styles.css' -UseBasicParsing

Write-Host "HTTP Index HTML:  $($resH.StatusCode) ($($resH.RawContentLength) bytes)" -ForegroundColor Green
Write-Host "HTTP App JS:      $($resJS.StatusCode) ($($resJS.RawContentLength) bytes)" -ForegroundColor Green
Write-Host "HTTP Styles CSS:  $($resCSS.StatusCode) ($($resCSS.RawContentLength) bytes)" -ForegroundColor Green

$hasSwitch = $resH.Content.IndexOf('id="mode-toggle-switch"') -ge 0
$hasBanner = $resH.Content.IndexOf('id="mode-banner"') -ge 0
$hasSimControls = $resH.Content.IndexOf('id="simulation-controls"') -ge 0

if ($hasSwitch -and $hasBanner -and $hasSimControls) {
    Write-Host "[PASS] HTML has mode-toggle-switch, mode-banner, and simulation-controls elements." -ForegroundColor Green
} else {
    Write-Host "[FAIL] HTML missing elements" -ForegroundColor Red
}

$hasEngine = $resJS.Content.IndexOf('simulationEngine') -ge 0
$hasModeFn = $resJS.Content.IndexOf('setMonitoringMode') -ge 0
$hasSeparation = $resJS.Content.IndexOf('source: "simulation"') -ge 0

if ($hasEngine -and $hasModeFn -and $hasSeparation) {
    Write-Host "[PASS] App.js has simulationEngine, setMonitoringMode, and data separation." -ForegroundColor Green
} else {
    Write-Host "[FAIL] App.js missing simulation elements" -ForegroundColor Red
}
