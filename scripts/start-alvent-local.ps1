Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Path $PSScriptRoot -Parent
$frontendDir = Join-Path $repoRoot "apps/alvent/frontend"
$alventBackendDir = Join-Path $repoRoot "apps/alvent/backend"
$pythonExe = Join-Path $repoRoot ".venv/Scripts/python.exe"
$pidsFile = Join-Path $repoRoot "scripts/.alvent-local.pids.json"

if (-not $env:ALVENT_FRONTEND_LOCAL_ORIGIN) {
  $env:ALVENT_FRONTEND_LOCAL_ORIGIN = "http://127.0.0.1:3001"
}

if (-not $env:ALVENT_BACKEND_LOCAL_ORIGIN) {
  $env:ALVENT_BACKEND_LOCAL_ORIGIN = "http://127.0.0.1:8001"
}

if (-not (Test-Path $pythonExe)) {
  throw "No se encontro el entorno Python en: $pythonExe"
}

if (-not (Test-Path $frontendDir)) {
  throw "No se encontro el frontend en: $frontendDir"
}

if (-not (Test-Path $alventBackendDir)) {
  throw "No se encontro el backend ALVENT en: $alventBackendDir"
}

Write-Host "Iniciando gateway RENSOF en 127.0.0.1:8000 ..." -ForegroundColor Cyan
$gateway = Start-Process -FilePath $pythonExe `
  -ArgumentList "-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", "8000" `
  -WorkingDirectory $repoRoot `
  -PassThru

Write-Host "Iniciando backend API ALVENT en 127.0.0.1:8001 ..." -ForegroundColor Cyan
$alventApi = Start-Process -FilePath $pythonExe `
  -ArgumentList "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8001" `
  -WorkingDirectory $alventBackendDir `
  -PassThru

Write-Host "Iniciando frontend ALVENT en apps/alvent/frontend ..." -ForegroundColor Cyan
$frontend = Start-Process -FilePath "cmd.exe" `
  -ArgumentList "/c", "npm run dev -- -p 3001" `
  -WorkingDirectory $frontendDir `
  -PassThru

$pids = [ordered]@{
  startedAt = (Get-Date).ToString("s")
  gatewayPid = $gateway.Id
  alventApiPid = $alventApi.Id
  # Compatibilidad con scripts previos
  backendPid = $gateway.Id
  frontendPid = $frontend.Id
}

$pids | ConvertTo-Json | Set-Content -Path $pidsFile -Encoding UTF8

Write-Host "Listo." -ForegroundColor Green
Write-Host "Gateway:  http://127.0.0.1:8000/alven/api (proxy)" -ForegroundColor Yellow
Write-Host "API real: http://127.0.0.1:8001" -ForegroundColor Yellow
Write-Host "Frontend: http://localhost:3001/alven/app/login" -ForegroundColor Yellow
Write-Host "Credenciales: Admin / 123456" -ForegroundColor Yellow
Write-Host "Para detener todo: .\scripts\stop-alvent-local.ps1" -ForegroundColor Yellow
