# Refresh PATH and run npm run login (fixes stale terminal after Node install)
$machinePath = [System.Environment]::GetEnvironmentVariable('Path', 'Machine')
$userPath    = [System.Environment]::GetEnvironmentVariable('Path', 'User')
$env:Path    = $machinePath + ';' + $userPath

Set-Location $PSScriptRoot

$npmFound = [bool](Get-Command npm -ErrorAction SilentlyContinue)

# #region agent log
$logEntry = @{
    sessionId    = '307020'
    runId        = 'post-fix'
    hypothesisId = 'H1-fix'
    location     = 'login.ps1:after-refresh'
    message      = 'login.ps1 PATH refresh result'
    data         = @{
        pathHasNodejs = ($env:Path -match 'nodejs')
        npmFound      = $npmFound
        npmVersion    = if ($npmFound) { (& npm --version 2>&1 | Out-String).Trim() } else { 'NOT FOUND' }
    }
    timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
} | ConvertTo-Json -Compress
Add-Content -Path (Join-Path $PSScriptRoot 'debug-307020.log') -Value $logEntry -Encoding UTF8
# #endregion

if (-not $npmFound) {
    Write-Error "npm not found. Install Node.js from https://nodejs.org/ then close and reopen the terminal."
    exit 1
}

npm run login
