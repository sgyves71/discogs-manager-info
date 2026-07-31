[CmdletBinding()]
param(
  [string]$ProjectRoot = '',
  [string]$SiteName = 'DiscogsManager',
  [string]$IisContentPath = 'C:\inetpub\DiscogsManager',
  [string]$LanAddress = '192.168.68.50',
  [string]$BackendServiceName = 'DiscogsManagerBackend',
  [string]$PfxPassword = 'changeit'
)

$ErrorActionPreference = 'Stop'
if (-not $ProjectRoot) { $ProjectRoot = Join-Path $PSScriptRoot '..\..' }
$resolvedProjectRoot = [System.IO.Path]::GetFullPath($ProjectRoot)
$frontendDist = Join-Path $resolvedProjectRoot 'frontend\dist'
$webConfig = Join-Path $resolvedProjectRoot 'deploy\iis\web.config'
$pfxPath = Join-Path $resolvedProjectRoot 'frontend\certs\discogs-manager-iis.pfx'
$backendDirectory = Join-Path $resolvedProjectRoot 'backend'
$backendEntry = Join-Path $backendDirectory 'dist\index.js'
$nodePath = (Get-Command node.exe -ErrorAction Stop).Source

foreach ($requiredPath in @($frontendDist, $webConfig, $pfxPath, $backendEntry)) {
  if (-not (Test-Path -LiteralPath $requiredPath)) { throw "Required deployment file was not found: $requiredPath" }
}

Import-Module WebAdministration
Set-WebConfigurationProperty -PSPath 'MACHINE/WEBROOT/APPHOST' -Filter 'system.webServer/proxy' -Name 'enabled' -Value 'True'

New-Item -ItemType Directory -Force -Path $IisContentPath | Out-Null
Copy-Item -Path (Join-Path $frontendDist '*') -Destination $IisContentPath -Recurse -Force
Copy-Item -LiteralPath $webConfig -Destination (Join-Path $IisContentPath 'web.config') -Force

$securePassword = ConvertTo-SecureString -String $PfxPassword -AsPlainText -Force
$certificate = Import-PfxCertificate -FilePath $pfxPath -CertStoreLocation 'Cert:\LocalMachine\My' -Password $securePassword

if (-not (Get-Website -Name $SiteName -ErrorAction SilentlyContinue)) {
  New-Website -Name $SiteName -PhysicalPath $IisContentPath -Port 443 -IPAddress $LanAddress -Ssl | Out-Null
} else {
  Set-ItemProperty "IIS:\Sites\$SiteName" -Name physicalPath -Value $IisContentPath
}

$httpBinding = Get-WebBinding -Name $SiteName -Protocol 'http' -ErrorAction SilentlyContinue | Where-Object { $_.bindingInformation -eq "$LanAddress`:80:" } | Select-Object -First 1
if (-not $httpBinding) {
  New-WebBinding -Name $SiteName -Protocol 'http' -Port 80 -IPAddress $LanAddress | Out-Null
}

$httpsBinding = Get-WebBinding -Name $SiteName -Protocol 'https' -ErrorAction SilentlyContinue | Where-Object { $_.bindingInformation -eq "$LanAddress`:443:" } | Select-Object -First 1
if (-not $httpsBinding) {
  $httpsBinding = New-WebBinding -Name $SiteName -Protocol 'https' -Port 443 -IPAddress $LanAddress
}
$httpsBinding.AddSslCertificate($certificate.Thumbprint, 'My')

if (-not (Get-NetFirewallRule -DisplayName 'Discogs Manager HTTPS' -ErrorAction SilentlyContinue)) {
  New-NetFirewallRule -DisplayName 'Discogs Manager HTTPS' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 443 -Profile Private | Out-Null
}

$toolDirectory = 'C:\ProgramData\DiscogsManager\tools'
$nssmPath = Join-Path $toolDirectory 'nssm.exe'
if (-not (Test-Path -LiteralPath $nssmPath)) {
  $zipPath = Join-Path $env:TEMP 'nssm-2.24.zip'
  Invoke-WebRequest 'https://nssm.cc/release/nssm-2.24.zip' -OutFile $zipPath
  $extractPath = Join-Path $env:TEMP 'nssm-2.24'
  Remove-Item -LiteralPath $extractPath -Recurse -Force -ErrorAction SilentlyContinue
  Expand-Archive -LiteralPath $zipPath -DestinationPath $extractPath -Force
  New-Item -ItemType Directory -Force -Path $toolDirectory | Out-Null
  Copy-Item -LiteralPath (Join-Path $extractPath 'nssm-2.24\win64\nssm.exe') -Destination $nssmPath -Force
}

if (-not (Get-Service -Name $BackendServiceName -ErrorAction SilentlyContinue)) {
  & $nssmPath install $BackendServiceName $nodePath $backendEntry
}
& $nssmPath set $BackendServiceName AppDirectory $backendDirectory
& $nssmPath set $BackendServiceName AppEnvironmentExtra 'NODE_ENV=production' 'HOST=127.0.0.1' 'PORT=3100'
& $nssmPath set $BackendServiceName Start SERVICE_AUTO_START
& $nssmPath set $BackendServiceName AppExit Default Restart

$logDirectory = 'C:\ProgramData\DiscogsManager\logs'
New-Item -ItemType Directory -Force -Path $logDirectory | Out-Null
& $nssmPath set $BackendServiceName AppStdout (Join-Path $logDirectory 'backend.out.log')
& $nssmPath set $BackendServiceName AppStderr (Join-Path $logDirectory 'backend.err.log')

Restart-Service -Name $BackendServiceName -ErrorAction SilentlyContinue
Start-Service -Name $BackendServiceName
Start-Website -Name $SiteName

Write-Output "Configured IIS site '$SiteName' at https://$LanAddress/ and backend service '$BackendServiceName'."
