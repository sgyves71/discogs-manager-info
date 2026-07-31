[CmdletBinding()]
param(
  [string]$DatabasePath = (Join-Path $PSScriptRoot '..\..\backend\prisma\dev.db'),
  [string]$BackupDirectory = (Join-Path $PSScriptRoot '..\..\backend\prisma\backups')
)

$resolvedDatabase = [System.IO.Path]::GetFullPath($DatabasePath)
$resolvedBackupDirectory = [System.IO.Path]::GetFullPath($BackupDirectory)
if (-not (Test-Path -LiteralPath $resolvedDatabase -PathType Leaf)) {
  throw "Production database was not found at: $resolvedDatabase"
}

New-Item -ItemType Directory -Path $resolvedBackupDirectory -Force | Out-Null
$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backupPath = Join-Path $resolvedBackupDirectory "discogs-manager-$timestamp.db"
Copy-Item -LiteralPath $resolvedDatabase -Destination $backupPath -ErrorAction Stop
Write-Output "Created production database backup: $backupPath"
