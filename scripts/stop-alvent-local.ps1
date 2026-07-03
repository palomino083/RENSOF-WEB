Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Path $PSScriptRoot -Parent
$pidsFile = Join-Path $repoRoot "scripts/.alvent-local.pids.json"

if (-not (Test-Path $pidsFile)) {
  Write-Host "No hay archivo de PIDs. Nada para detener." -ForegroundColor Yellow
  exit 0
}

$data = Get-Content -Path $pidsFile -Raw | ConvertFrom-Json
$pids = @($data.backendPid, $data.frontendPid) | Where-Object { $_ }

foreach ($procId in $pids) {
  try {
    Stop-Process -Id ([int]$procId) -Force -ErrorAction Stop
    Write-Host "Proceso detenido: $procId" -ForegroundColor Green
  } catch {
    Write-Host "No se pudo detener PID $procId (quizas ya no existe)." -ForegroundColor Yellow
  }
}

Remove-Item -Path $pidsFile -Force -ErrorAction SilentlyContinue
Write-Host "Servicios locales detenidos." -ForegroundColor Cyan
