Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$backendLoginUrl = "http://127.0.0.1:8000/alven/api/auth/login"
$frontendLoginUrl = "http://localhost:3001/alven/app/login"
$frontendDashboardUrl = "http://localhost:3001/alven/app/dashboard"
$repoRoot = Split-Path -Path $PSScriptRoot -Parent

function Restart-LocalServices {
  Write-Host "[WARN] Reiniciando servicios locales para recuperar entorno..." -ForegroundColor Yellow
  & (Join-Path $repoRoot "scripts/stop-alvent-local.ps1")
  & (Join-Path $repoRoot "scripts/start-alvent-local.ps1")
}

function Assert-StatusCode {
  param(
    [Parameter(Mandatory = $true)]
    [int]$Actual,
    [Parameter(Mandatory = $true)]
    [int]$Expected,
    [Parameter(Mandatory = $true)]
    [string]$Message
  )

  if ($Actual -ne $Expected) {
    throw "$Message (esperado: $Expected, obtenido: $Actual)"
  }
}

Write-Host "[ALVENT Health Check] Iniciando verificacion..." -ForegroundColor Cyan

# 1) Login backend
$payload = @{ usuario = "Admin"; password = "123456" } | ConvertTo-Json
$loginResponse = Invoke-RestMethod -Method Post -Uri $backendLoginUrl -ContentType "application/json" -Body $payload

if (-not $loginResponse.access_token) {
  throw "Login backend sin access_token."
}

Write-Host "[OK] Backend login responde con token." -ForegroundColor Green

# 2) Login page frontend
try {
  $loginPage = Invoke-WebRequest -Uri $frontendLoginUrl -UseBasicParsing
} catch {
  Restart-LocalServices
  $loginPage = Invoke-WebRequest -Uri $frontendLoginUrl -UseBasicParsing
}

Assert-StatusCode -Actual ([int]$loginPage.StatusCode) -Expected 200 -Message "Frontend login no disponible"

if ($loginPage.Content -notmatch "Iniciar sesion") {
  throw "Frontend login no contiene el contenido esperado."
}

Write-Host "[OK] Frontend login disponible." -ForegroundColor Green

# 3) Dashboard route frontend
try {
  $dashboardPage = Invoke-WebRequest -Uri $frontendDashboardUrl -UseBasicParsing
} catch {
  Restart-LocalServices
  $dashboardPage = Invoke-WebRequest -Uri $frontendDashboardUrl -UseBasicParsing
}

Assert-StatusCode -Actual ([int]$dashboardPage.StatusCode) -Expected 200 -Message "Frontend dashboard no disponible"

if ($dashboardPage.Content -notmatch "ALVENT ERP") {
  throw "Frontend dashboard no contiene el contenido esperado."
}

Write-Host "[OK] Frontend dashboard disponible." -ForegroundColor Green
Write-Host "[ALVENT Health Check] Verificacion completada con exito." -ForegroundColor Green
