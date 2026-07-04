Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Path $PSScriptRoot -Parent
$pidsFile = Join-Path $repoRoot "scripts/.alvent-local.pids.json"

if (-not (Test-Path $pidsFile)) {
  Write-Host "No hay archivo de PIDs. Nada para detener." -ForegroundColor Yellow
  exit 0
}

$data = Get-Content -Path $pidsFile -Raw | ConvertFrom-Json

function Get-OptionalPid {
  param(
    [Parameter(Mandatory = $true)]
    [object]$Source,
    [Parameter(Mandatory = $true)]
    [string]$Name
  )

  $prop = $Source.PSObject.Properties[$Name]
  if ($null -eq $prop) {
    return $null
  }

  return $prop.Value
}

$pidCandidates = @(
  (Get-OptionalPid -Source $data -Name "gatewayPid"),
  (Get-OptionalPid -Source $data -Name "alventApiPid"),
  (Get-OptionalPid -Source $data -Name "backendPid"),
  (Get-OptionalPid -Source $data -Name "frontendPid")
)

$pids = $pidCandidates |
  Where-Object { $_ } |
  ForEach-Object { [int]$_ } |
  Select-Object -Unique

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
