# DRY-RUN ANALYSIS FOR EMENYU REORGANIZATION
# This script analyzes the project structure without making any changes

Write-Host "=== DRY-RUN ANALYSIS FOR EMENYU REORGANIZATION ===" -ForegroundColor Cyan
Write-Host ""

Write-Host "PHASE 1: Checking dont_upload folder status..." -ForegroundColor Yellow
$sites = @('Trump', 'Greek', 'Imli', 'AlPescatore')
$sites | ForEach-Object {
    $path = "Sites\$_\dont_upload"
    $exists = Test-Path $path -PathType Container
    $status = if($exists) { "EXISTS ✓" } else { "MISSING (needs creation)" }
    Write-Host "  $_: $status"
}

Write-Host ""
Write-Host "PHASE 2: Identifying archivable files in each site..." -ForegroundColor Yellow

$sites | ForEach-Object {
    $siteName = $_
    $siteRoot = "Sites\$siteName"
    Write-Host ""
    Write-Host "  === $siteName ===" -ForegroundColor Magenta
    
    # Check for backups folder
    if (Test-Path "$siteRoot\backups" -PathType Container) {
        $backupCount = (Get-ChildItem "$siteRoot\backups" -Recurse -ErrorAction SilentlyContinue | Measure-Object).Count
        Write-Host "    [ARCHIVE] backups/ folder found ($backupCount items)"
    } else {
        Write-Host "    [OK] no backups/ folder"
    }
    
    # Check for logs folder
    if (Test-Path "$siteRoot\logs" -PathType Container) {
        $logCount = (Get-ChildItem "$siteRoot\logs" -Recurse -ErrorAction SilentlyContinue | Measure-Object).Count
        Write-Host "    [ARCHIVE] logs/ folder found ($logCount items)"
    } else {
        Write-Host "    [OK] no logs/ folder"
    }
    
    # Check for log files
    $logFiles = Get-ChildItem "$siteRoot" -Filter "*.log" -ErrorAction SilentlyContinue
    if ($logFiles.Count -gt 0) {
        Write-Host "    [ARCHIVE] Found $($logFiles.Count) .log files"
    }
    
    # Check for backup files
    $backupFiles = Get-ChildItem "$siteRoot" -Filter "*.BACKUP" -ErrorAction SilentlyContinue
    if ($backupFiles.Count -gt 0) {
        Write-Host "    [ARCHIVE] Found $($backupFiles.Count) .BACKUP files: $($backupFiles.Name -join ', ')"
    }
    
    # Check for chat logs
    if (Test-Path "$siteRoot\chat_logs.json" -PathType Leaf) {
        Write-Host "    [ARCHIVE] chat_logs.json found"
    }
    
    # Check for .env files
    $envFile = Test-Path "$siteRoot\.env" -PathType Leaf
    if ($envFile) {
        Write-Host "    [PROTECT] .env file EXISTS - NEVER UPLOAD"
    }
}

Write-Host ""
Write-Host "PHASE 3: Checking root level archives..." -ForegroundColor Yellow
$zipFiles = Get-ChildItem "Sites" -Filter "*.zip" -ErrorAction SilentlyContinue
if ($zipFiles.Count -gt 0) {
    $zipFiles | ForEach-Object { 
        $sizeMB = [math]::Round($_.Length / 1MB, 2)
        Write-Host "    [ARCHIVE] Found: $($_.Name) ($sizeMB MB)"
    }
} else {
    Write-Host "    [OK] No ZIP archives found"
}

Write-Host ""
Write-Host "PHASE 4: Verifying ACTIVE runtime folders (DO NOT MOVE)..." -ForegroundColor Cyan
$sites | ForEach-Object {
    $siteName = $_
    $siteRoot = "Sites\$siteName"
    Write-Host ""
    Write-Host "  === $siteName ===" -ForegroundColor Magenta
    
    $criticalItems = @('uploads', 'orders', 'tables', 'history', 'node_modules', 'venv', 'package.json', 'server.js')
    $criticalItems | ForEach-Object {
        $path = "$siteRoot\$_"
        $exists = Test-Path $path
        if ($exists) {
            Write-Host "    [PROTECT] $_ EXISTS - MUST NOT BE MOVED"
        }
    }
}

Write-Host ""
Write-Host "SUMMARY OF ACTIONS TO TAKE:" -ForegroundColor Cyan
Write-Host ""
Write-Host "✓ CREATE: dont_upload folder in each site (Trump, Greek, Imli, AlPescatore)"
Write-Host "✓ CREATE: Documentation files in each dont_upload folder:"
Write-Host "    - README.md"
Write-Host "    - PRIVATE_FILES_REPORT.md"
Write-Host "    - SAFE_DEPLOYMENT_GUIDE.md"
Write-Host "    - UPLOAD_WARNINGS.md"
Write-Host "    - ENV_TEMPLATE.txt"
Write-Host ""
Write-Host "✓ ARCHIVE (move to dont_upload/archive/): Old backup/log files identified above"
Write-Host "✓ PROTECT: .env files, uploads/, orders/, tables/, history/, node_modules/"
Write-Host "✓ SCAN: For any secrets in .env and other config files"
Write-Host ""
Write-Host "=== END DRY-RUN ANALYSIS ===" -ForegroundColor Cyan
