param(
  [Parameter(Mandatory = $true)]
  [string]$CaPath
)

if (-not (Test-Path -LiteralPath $CaPath)) {
  Write-Host "ERROR: CA file not found: $CaPath"
  exit 1
}

$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = "certutil.exe"
$psi.Arguments = "-addstore -f Root `"$CaPath`""
$psi.Verb = "runas"
$psi.UseShellExecute = $true

try {
  $p = [System.Diagnostics.Process]::Start($psi)
  $p.WaitForExit()
  exit $p.ExitCode
} catch {
  Write-Host $_.Exception.Message
  exit 1
}
