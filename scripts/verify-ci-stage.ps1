$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$ports = 3101, 5174
$servers = @()
Push-Location $root
try {
  foreach ($privatePath in @('.env', 'backend/.env', 'backend/.env.stage', 'frontend/.env', 'frontend/certs', 'backend/prisma/dev.db')) {
    if (Test-Path -LiteralPath $privatePath) {
      throw "CI Stage requires a clean source copy. Found $privatePath."
    }
  }
  if (Get-NetTCPConnection -State Listen -LocalPort $ports -ErrorAction SilentlyContinue) {
    throw 'CI Stage ports 3101 and 5174 must be free before startup.'
  }

  $logs = Join-Path $root 'ci-stage-logs'
  New-Item -ItemType Directory -Path $logs -Force | Out-Null
  npm.cmd run stage:reset *> (Join-Path $logs 'seed.log')
  if ($LASTEXITCODE -ne 0) { throw 'Stage seed failed. See seed.log.' }

  foreach ($component in @('backend', 'frontend')) {
    $servers += Start-Process node.exe -ArgumentList "scripts/start-stage-$component.mjs" `
      -WorkingDirectory $root -WindowStyle Hidden -PassThru `
      -RedirectStandardOutput (Join-Path $logs "$component.out.log") `
      -RedirectStandardError (Join-Path $logs "$component.err.log")
  }

  $deadline = [DateTime]::UtcNow.AddSeconds(30)
  $ready = $false
  do {
    foreach ($server in $servers) {
      if ($server.HasExited) { throw 'A Stage launcher exited during startup. See the server logs.' }
    }
    try {
      $direct = Invoke-RestMethod 'http://127.0.0.1:3101/api/stage/identity' -TimeoutSec 2 -MaximumRedirection 0
      $proxied = Invoke-RestMethod 'http://127.0.0.1:5174/api/stage/identity' -TimeoutSec 2 -MaximumRedirection 0
    } catch {
      Start-Sleep -Milliseconds 250
      continue
    }
    if ($direct.environment -ne 'stage' -or $proxied.environment -ne 'stage' -or
        $direct.fixture -ne 'synthetic-catalog-v1' -or $proxied.fixture -ne 'synthetic-catalog-v1' -or
        !$direct.instance -or $direct.instance -ne $proxied.instance) {
      throw 'The direct API and frontend proxy did not identify the same synthetic Stage instance.'
    }
    $ready = $true
  } until ($ready -or [DateTime]::UtcNow -ge $deadline)
  if (!$ready) { throw 'Stage readiness timed out. See the server logs.' }
  Write-Output 'Verified direct and proxied synthetic Stage identity.'

  npm.cmd run test:e2e:stage -- --demo-one
  if ($LASTEXITCODE -ne 0) { throw "Demo 1 failed with exit code $LASTEXITCODE." }
} finally {
  try {
    foreach ($server in $servers) {
      if (!$server.HasExited) {
        taskkill.exe /PID $server.Id /T /F
        if (!$server.WaitForExit(5000)) { Write-Warning "Stage launcher $($server.Id) did not exit." }
      }
    }
    if ($servers.Count -gt 0 -and
        (Get-NetTCPConnection -State Listen -LocalPort $ports -ErrorAction SilentlyContinue)) {
      throw 'A Stage port is still listening after teardown.'
    }
  } finally {
    Pop-Location
  }
}
