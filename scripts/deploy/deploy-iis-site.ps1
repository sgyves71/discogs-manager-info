[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$IisContentPath,
  [Parameter(Mandatory = $true)]
  [string]$BackendServiceName,
  [switch]$SkipDatabaseBackup
)

$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$frontendDist = Join-Path $projectRoot 'frontend\dist'
$iisTemplate = Join-Path $projectRoot 'deploy\iis\web.config'
$resolvedIisContentPath = [System.IO.Path]::GetFullPath($IisContentPath)

if (-not (Test-Path -LiteralPath $frontendDist -PathType Container)) {
  throw "No frontend build was found at $frontendDist. Run 'npm run build' first."
}
if (-not (Test-Path -LiteralPath $iisTemplate -PathType Leaf)) {
  throw "IIS web.config template was not found at $iisTemplate."
}
if (-not $SkipDatabaseBackup) {
  & (Join-Path $PSScriptRoot 'backup-production-db.ps1')
  if ($LASTEXITCODE -ne 0) { throw 'Production database backup failed. Deployment was not started.' }
}

New-Item -ItemType Directory -Path $resolvedIisContentPath -Force | Out-Null
Copy-Item -Path (Join-Path $frontendDist '*') -Destination $resolvedIisContentPath -Recurse -Force
Copy-Item -LiteralPath $iisTemplate -Destination (Join-Path $resolvedIisContentPath 'web.config') -Force

$service = Get-Service -Name $BackendServiceName -ErrorAction Stop
Restart-Service -InputObject $service -ErrorAction Stop
Write-Output "Deployed frontend files to $resolvedIisContentPath and restarted $BackendServiceName."
