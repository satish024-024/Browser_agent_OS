# start_services.ps1
# PowerShell script to start all ServiceNow AI Agent services in the correct sequence.
# Usage: .\start_services.ps1

$ErrorActionPreference = "Stop"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "   ServiceNow AI Agent Service Stack Orchestrator v1.0   " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Start Ollama Service
Write-Host "`n[1/4] Checking Ollama Service (port 11434)..." -ForegroundColor Yellow
$ollamaProc = Get-Process -Name "ollama" -ErrorAction SilentlyContinue
if (-not $ollamaProc) {
    Write-Host "Ollama process not found. Starting Ollama serve..." -ForegroundColor Gray
    Start-Process "ollama" -ArgumentList "serve" -WindowStyle Hidden
    Start-Sleep -Seconds 5
}

# Verify Ollama responsiveness
try {
    $tags = Invoke-RestMethod -Uri "http://127.0.0.1:11434/api/tags" -TimeoutSec 10
    Write-Host "Ollama service is ONLINE." -ForegroundColor Green
    $models = $tags.models | ForEach-Object { $_.name }
    Write-Host "Loaded models: $($models -join ', ')" -ForegroundColor Gray
} catch {
    Write-Warning "Could not connect to Ollama. Ensure Ollama is installed and running."
}

# 2. Start RAG Server
Write-Host "`n[2/4] Checking Local RAG Server (port 8000)..." -ForegroundColor Yellow
try {
    $ragHealth = Invoke-RestMethod -Uri "http://127.0.0.1:8000/health" -TimeoutSec 5
    Write-Host "RAG server is already ONLINE." -ForegroundColor Green
} catch {
    Write-Host "RAG server is offline. Starting RAG server..." -ForegroundColor Gray
    $ragDir = "D:\knowledge_base"
    $pythonVenv = "D:\knowledge_base\.venv\Scripts\python.exe"
    
    if (Test-Path $pythonVenv) {
        Start-Process -FilePath $pythonVenv -ArgumentList "-m uvicorn local_rag_server:app --host 127.0.0.1 --port 8000" -WorkingDirectory $ragDir -WindowStyle Hidden
        Start-Sleep -Seconds 5
        try {
            $ragHealth = Invoke-RestMethod -Uri "http://127.0.0.1:8000/health" -TimeoutSec 5
            Write-Host "RAG server started successfully (ONLINE)." -ForegroundColor Green
        } catch {
            Write-Error "Failed to start RAG server. Verify python environment at $pythonVenv."
        }
    } else {
        Write-Error "Python virtual environment not found at $pythonVenv."
    }
}

# 3. Start Chromium with Remote Debugging (port 9100)
Write-Host "`n[3/4] Checking Chromium CDP Connection (port 9100)..." -ForegroundColor Yellow
try {
    $cdp = Invoke-RestMethod -Uri "http://127.0.0.1:9100/json/version" -TimeoutSec 5
    Write-Host "Chromium CDP is already ONLINE." -ForegroundColor Green
} catch {
    Write-Host "Chromium CDP is offline. Terminating any stray chrome processes..." -ForegroundColor Gray
    Get-Process -Name "chrome" -ErrorAction SilentlyContinue | Stop-Process -Force
    Start-Sleep -Seconds 2
    
    Write-Host "Starting Chromium in debugging mode..." -ForegroundColor Gray
    $chromePath = "C:\Users\Satis\AppData\Local\Chromium\Application\chrome.exe"
    $userData = "C:\Users\Satis\AppData\Local\Chromium\User_Data_Clean_Fresh"
    
    if (Test-Path $chromePath) {
        # Using cmd /c redirect to prevent instant process exit on Windows console
        Start-Process -FilePath "cmd.exe" -ArgumentList "/c `"$chromePath`" --remote-debugging-port=9100 --no-sandbox --no-first-run --disable-gpu --disable-background-mode --user-data-dir=`"$userData`" > `"$env:TEMP\chrome_cdp.log`" 2>&1" -WindowStyle Hidden
        Start-Sleep -Seconds 5
        try {
            $cdp = Invoke-RestMethod -Uri "http://127.0.0.1:9100/json/version" -TimeoutSec 5
            Write-Host "Chromium CDP started successfully (ONLINE)." -ForegroundColor Green
        } catch {
            Write-Error "Failed to start Chromium CDP. Check log at $env:TEMP\chrome_cdp.log."
        }
    } else {
        Write-Error "Chromium binary not found at $chromePath."
    }
}

# 4. Configure & Start BrowserOS Proxy Server (port 9200)
Write-Host "`n[4/4] Checking BrowserOS Proxy Server (port 9200)..." -ForegroundColor Yellow

# Ensure server_config.json is up-to-date and matches CDP port 9100 (BOM-free write)
$configPath = "C:\Users\Satis\AppData\Local\Chromium\User Data\.browseros\server_config.json"
$configDir = Split-Path $configPath
if (-not (Test-Path $configDir)) {
    New-Item -ItemType Directory -Path $configDir -Force | Out-Null
}
$configJson = '{"directories":{"execution":"C:\\Users\\Satis\\AppData\\Local\\Chromium\\User Data\\.browseros","resources":"C:\\Users\\Satis\\AppData\\Local\\Chromium\\Application\\146.0.7821.31\\BrowserOSServer\\default\\resources"},"flags":{"allow_remote_in_mcp":false},"instance":{"browseros_version":"0.44.0.1","chromium_version":"146.0.7821.31","install_id":"0c720041-d787-46dd-9948-3110ea98c91a"},"ports":{"cdp":9100,"extension":9300,"server":9200}}'
[System.IO.File]::WriteAllText($configPath, $configJson, [System.Text.UTF8Encoding]($false))

# Write config to alternative profile path too
$configAltPath = "C:\Users\Satis\AppData\Local\Chromium\User\.browseros\server_config.json"
$configAltDir = Split-Path $configAltPath
if (-not (Test-Path $configAltDir)) {
    New-Item -ItemType Directory -Path $configAltDir -Force | Out-Null
}
$configAltJson = '{"directories":{"execution":"C:\\Users\\Satis\\AppData\\Local\\Chromium\\User\\.browseros","resources":"C:\\Users\\Satis\\AppData\\Local\\Chromium\\Application\\146.0.7821.31\\BrowserOSServer\\default\\resources"},"flags":{"allow_remote_in_mcp":false},"instance":{"browseros_version":"0.44.0.1","chromium_version":"146.0.7821.31","install_id":"3986808a-0327-42d1-8d1e-1f32a0fbc9f9"},"ports":{"cdp":9100,"extension":9300,"server":9200}}'
[System.IO.File]::WriteAllText($configAltPath, $configAltJson, [System.Text.UTF8Encoding]($false))

try {
    $proxyHealth = Invoke-RestMethod -Uri "http://127.0.0.1:9200/health" -TimeoutSec 5
    Write-Host "Proxy server is already ONLINE." -ForegroundColor Green
} catch {
    Write-Host "Proxy server is offline. Starting Proxy server..." -ForegroundColor Gray
    Get-Process -Name "browseros_server*" -ErrorAction SilentlyContinue | Stop-Process -Force
    Start-Sleep -Seconds 2
    
    $proxyBin = "C:\Users\Satis\AppData\Local\Chromium\User Data\.browseros\versions\0.0.82\resources\bin\browseros_server.exe"
    if (-not (Test-Path $proxyBin)) {
        $proxyBin = "C:\Users\Satis\AppData\Local\Chromium\Application\146.0.7821.31\BrowserOSServer\default\resources\bin\browseros_server.exe"
    }
    
    if (Test-Path $proxyBin) {
        $env:BROWSEROS_ENV = "development"
        Start-Process -FilePath $proxyBin -ArgumentList "--config=`"$configPath`"", "--cdp-port=9100", "--server-port=9200" -WindowStyle Hidden
        Start-Sleep -Seconds 5
        try {
            $proxyHealth = Invoke-RestMethod -Uri "http://127.0.0.1:9200/health" -TimeoutSec 5
            Write-Host "Proxy server started successfully (ONLINE)." -ForegroundColor Green
        } catch {
            Write-Error "Failed to start Proxy server."
        }
    } else {
        Write-Error "Proxy binary not found at $proxyBin."
    }
}

# 5. Output Stack Status
Write-Host "`n==========================================================" -ForegroundColor Cyan
Write-Host "   SYSTEM STATUS OVERVIEW" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
try {
    $systemStatus = Invoke-RestMethod -Uri "http://127.0.0.1:9200/system_status" -TimeoutSec 5
    $systemStatus | Format-List
} catch {
    Write-Warning "Could not retrieve system status."
}
Write-Host "==========================================================" -ForegroundColor Cyan
