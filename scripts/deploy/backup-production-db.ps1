[CmdletBinding()]
param(
  [string]$DatabasePath = '',
  [string]$BackupDirectory = ''
)

$ErrorActionPreference = 'Stop'

if (-not $DatabasePath) { $DatabasePath = Join-Path $PSScriptRoot '..\..\backend\prisma\dev.db' }
if (-not $BackupDirectory) { $BackupDirectory = Join-Path $PSScriptRoot '..\..\backend\prisma\backups' }
$resolvedDatabase = [System.IO.Path]::GetFullPath($DatabasePath)
$resolvedBackupDirectory = [System.IO.Path]::GetFullPath($BackupDirectory)
if (-not (Test-Path -LiteralPath $resolvedDatabase -PathType Leaf)) {
  throw "Production database was not found at: $resolvedDatabase"
}

New-Item -ItemType Directory -Path $resolvedBackupDirectory -Force | Out-Null
$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backupPath = Join-Path $resolvedBackupDirectory "discogs-manager-$timestamp.db"
& node (Join-Path $PSScriptRoot 'backup-sqlite.mjs') $resolvedDatabase $backupPath
if ($LASTEXITCODE -ne 0) { throw 'SQLite online backup or integrity verification failed.' }
Write-Output "Created and verified production database backup: $backupPath"
