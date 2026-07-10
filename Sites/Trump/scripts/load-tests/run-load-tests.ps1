param(
    [string]$TargetVUs = "20",
    [string]$BaseUrl = "http://localhost:3000",
    [string]$Secret = "secret"
)

$env:VUS = $TargetVUs
$env:BASE_URL = $BaseUrl
$env:LOAD_TEST_SECRET = $Secret

Write-Host "=========================================================" -ForegroundColor Cyan
Write-Host "Starting Load Test with $TargetVUs Concurrent Users" -ForegroundColor Green
Write-Host "Target URL: $BaseUrl"
Write-Host "=========================================================" -ForegroundColor Cyan

# Checking if k6 is installed
if (-not (Get-Command k6 -ErrorAction SilentlyContinue)) {
    Write-Host "k6 is not installed. Please install it to run the HTTP load tests." -ForegroundColor Red
} else {
    Write-Host "Running k6 HTTP Load Test..." -ForegroundColor Yellow
    k6 run k6-load-test.js
}

# Checking if Artillery is installed
if (-not (Get-Command artillery -ErrorAction SilentlyContinue)) {
    Write-Host "Artillery is not installed. Please install via 'npm i -g artillery' to run WebSocket tests." -ForegroundColor Red
} else {
    Write-Host "Running Artillery WebSocket Load Test..." -ForegroundColor Yellow
    # Adjust arrival rate based on target VUs
    $env:ARRIVAL_RATE = [math]::Max([math]::Round([int]$TargetVUs / 2), 1)
    artillery run artillery-ws.yml
}

Write-Host "=========================================================" -ForegroundColor Cyan
Write-Host "Load Test Finished for $TargetVUs VUs" -ForegroundColor Green
Write-Host "=========================================================" -ForegroundColor Cyan
Write-Host "Remember to check your DigitalOcean dashboard for CPU, RAM, and pm2 logs/stats." -ForegroundColor Yellow
