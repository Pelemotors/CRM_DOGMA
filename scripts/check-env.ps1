# #region agent log
function Write-DebugLog {
    param([string]$hypothesisId, [string]$location, [string]$message, [hashtable]$data)
    $entry = @{
        sessionId    = '307020'
        runId        = 'env-check'
        hypothesisId = $hypothesisId
        location     = $location
        message      = $message
        data         = $data
        timestamp    = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    } | ConvertTo-Json -Compress
    $logPath = Join-Path (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent) 'debug-307020.log'
    if (-not (Test-Path (Split-Path $logPath -Parent))) {
        $logPath = Join-Path $PSScriptRoot '..\debug-307020.log' | Resolve-Path -ErrorAction SilentlyContinue
        if (-not $logPath) { $logPath = 'C:\Users\DELL\lead-tracker\debug-307020.log' }
    }
    Add-Content -Path 'C:\Users\DELL\lead-tracker\debug-307020.log' -Value $entry -Encoding UTF8
}
# #endregion

$nodePath = 'C:\Program Files\nodejs\node.exe'
$npmPath  = 'C:\Program Files\nodejs\npm.cmd'

# H1: stale session PATH (terminal opened before Node install)
Write-DebugLog 'H1' 'check-env.ps1:session-path' 'PATH before refresh' @{
    pathHasNodejs = ($env:Path -match 'nodejs')
    nodeCmdFound  = [bool](Get-Command node -ErrorAction SilentlyContinue)
    npmCmdFound   = [bool](Get-Command npm -ErrorAction SilentlyContinue)
}

# H2: Node not in Machine/User PATH
$machinePath = [System.Environment]::GetEnvironmentVariable('Path', 'Machine')
$userPath    = [System.Environment]::GetEnvironmentVariable('Path', 'User')
Write-DebugLog 'H2' 'check-env.ps1:registry-path' 'Registry PATH entries' @{
    machineHasNodejs = ($machinePath -match 'nodejs')
    userHasNodejs    = ($userPath -match 'nodejs')
    nodeExeExists    = (Test-Path $nodePath)
    npmCmdExists     = (Test-Path $npmPath)
}

# H3: Node installed but executables missing/corrupt
$nodeVersion = $null
$npmVersion  = $null
if (Test-Path $nodePath) {
    try { $nodeVersion = & $nodePath --version 2>&1 | Out-String } catch { $nodeVersion = "ERROR: $_" }
}
if (Test-Path $npmPath) {
    try { $npmVersion = & $npmPath --version 2>&1 | Out-String } catch { $npmVersion = "ERROR: $_" }
}
Write-DebugLog 'H3' 'check-env.ps1:direct-exec' 'Direct executable test' @{
    nodeVersion = $nodeVersion.Trim()
    npmVersion  = $npmVersion.Trim()
}

# Refresh PATH (proposed fix for H1)
$env:Path = $machinePath + ';' + $userPath
$afterNode = $null
$afterNpm  = $null
if (Get-Command node -ErrorAction SilentlyContinue) { $afterNode = (& node --version 2>&1 | Out-String).Trim() }
if (Get-Command npm -ErrorAction SilentlyContinue)  { $afterNpm  = (& npm --version 2>&1 | Out-String).Trim() }
Write-DebugLog 'H1-fix' 'check-env.ps1:after-refresh' 'PATH after refresh' @{
    pathHasNodejs = ($env:Path -match 'nodejs')
    nodeCmdFound  = [bool](Get-Command node -ErrorAction SilentlyContinue)
    npmCmdFound   = [bool](Get-Command npm -ErrorAction SilentlyContinue)
    nodeVersion   = $afterNode
    npmVersion    = $afterNpm
}

Write-Host ""
Write-Host "=== Lead Tracker - Environment Check ==="
Write-Host "Node in Machine PATH: $(($machinePath -match 'nodejs'))"
Write-Host "node.exe exists:      $(Test-Path $nodePath)"
Write-Host "npm after PATH refresh: $(if (Get-Command npm -ErrorAction SilentlyContinue) { npm --version } else { 'NOT FOUND' })"
Write-Host ""
Write-Host "If npm shows a version above, run:"
Write-Host "  npm run login"
Write-Host ""
