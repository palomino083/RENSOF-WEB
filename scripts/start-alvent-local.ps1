Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Path $PSScriptRoot -Parent
$frontendDir = Join-Path $repoRoot "apps/alvent/frontend"
$pythonExe = Join-Path $repoRoot ".venv/Scripts/python.exe"
$pidsFile = Join-Path $repoRoot "scripts/.alvent-local.pids.json"

if (-not (Test-Path $pythonExe)) {
  throw "No se encontro el entorno Python en: $pythonExe"
}

if (-not (Test-Path $frontendDir)) {
  throw "No se encontro el frontend en: $frontendDir"
}

Write-Host "Iniciando backend ALVENT en 127.0.0.1:8000 ..." -ForegroundColor Cyan
$backend = Start-Process -FilePath $pythonExe `
  -ArgumentList "-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", "8000" `
  -WorkingDirectory $repoRoot `
  -PassThru

Write-Host "Iniciando frontend ALVENT en apps/alvent/frontend ..." -ForegroundColor Cyan
$frontend = Start-Process -FilePath "cmd.exe" `
  -ArgumentList "/c", "npm run dev -- -p 3001" `
  -WorkingDirectory $frontendDir `
  -PassThru

$pids = [ordered]@{
  startedAt = (Get-Date).ToString("s")
  backendPid = $backend.Id
  frontendPid = $frontend.Id
}

$pids | ConvertTo-Json | Set-Content -Path $pidsFile -Encoding UTF8

Write-Host "Listo." -ForegroundColor Green
Write-Host "Backend:  http://127.0.0.1:8000/alven/api" -ForegroundColor Yellow
Write-Host "Frontend: http://localhost:3001/alven/app/login" -ForegroundColor Yellow
Write-Host "Credenciales: Admin / 123456" -ForegroundColor Yellow
Write-Host "Para detener todo: .\scripts\stop-alvent-local.ps1" -ForegroundColor Yellow
