Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$localBackendBase = "http://127.0.0.1:8001"
$localGatewayBase = "http://127.0.0.1:8000"
$localFrontendBase = "http://127.0.0.1:3001"
$remoteBackendBase = if ($env:ALVENT_BACKEND_ORIGIN) { $env:ALVENT_BACKEND_ORIGIN.TrimEnd('/') } else { "https://alvent-backend.onrender.com" }
$remoteSiteBase = if ($env:RENSOF_PUBLIC_ORIGIN) { $env:RENSOF_PUBLIC_ORIGIN.TrimEnd('/') } else { "https://www.rensof.pe" }
$remoteAlventBase = if ($env:ALVENT_PUBLIC_ORIGIN) { $env:ALVENT_PUBLIC_ORIGIN.TrimEnd('/') } else { "https://alvent.rensof.pe" }

function Test-UrlAvailable {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Url
  )

  try {
    $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -Method Get -TimeoutSec 6
    return ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500)
  } catch {
    return $false
  }
}

$isLocalMode = Test-UrlAvailable -Url "$localBackendBase/health"

if ($isLocalMode) {
  Write-Host "[INFO] Health check en modo LOCAL (gateway/backend en 127.0.0.1)." -ForegroundColor Cyan
  $backendBase = $localBackendBase
  $frontendLoginUrl = "$localFrontendBase/login"
  $frontendDashboardUrl = "$localFrontendBase/dashboard"
} else {
  Write-Host "[INFO] Health check en modo REMOTO (Render/produccion)." -ForegroundColor Cyan
  $backendBase = $remoteBackendBase
  $frontendLoginUrl = "$remoteAlventBase/login"
  $frontendDashboardUrl = "$remoteAlventBase/dashboard"
}

# Direct backend API endpoints
$backendLoginUrl = "$backendBase/auth/login"
$backendOverviewUrl = "$backendBase/dashboard/overview"
$backendProductosUrl = "$backendBase/productos/"
$backendVentasUrl = "$backendBase/ventas/"
$backendVentasResumenUrl = "$backendBase/ventas/resumen"

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

function Assert-ContainsAny {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Content,
    [Parameter(Mandatory = $true)]
    [string[]]$Patterns,
    [Parameter(Mandatory = $true)]
    [string]$Message
  )

  foreach ($pattern in $Patterns) {
    if ($Content -match $pattern) {
      return
    }
  }

  throw $Message
}

function Invoke-WithRetry {
  param(
    [Parameter(Mandatory = $true)]
    [scriptblock]$Action,
    [int]$Attempts = 8,
    [string]$Message = "Operacion con reintento"
  )

  $lastError = $null
  for ($i = 1; $i -le $Attempts; $i++) {
    try {
      return & $Action
    } catch {
      $lastError = $_
      Write-Host "[WARN] $Message (intento $i/$Attempts)" -ForegroundColor Yellow
    }
  }

  if ($null -ne $lastError) {
    throw $lastError
  }

  throw "${Message}: fallo sin detalle"
}

Write-Host "[ALVENT Health Check] Iniciando verificacion..." -ForegroundColor Cyan
$htmlHeaders = @{ Accept = "text/html" }

# 1) Login backend
$payload = @{ usuario = "Admin"; password = "123456" } | ConvertTo-Json
$loginResponse = Invoke-WithRetry -Message "Backend login no disponible aun" -Action {
  Invoke-RestMethod -Method Post -Uri $backendLoginUrl -ContentType "application/json" -Body $payload
}

if (-not $loginResponse.access_token) {
  throw "Login backend sin access_token."
}

Write-Host "[OK] Backend login responde con token." -ForegroundColor Green

# 1b) Dashboard overview backend (API critica para home dashboard)
$overviewResponse = Invoke-WithRetry -Message "Dashboard overview no disponible aun" -Action {
  Invoke-RestMethod -Method Get -Uri $backendOverviewUrl -Headers @{ Authorization = "Bearer $($loginResponse.access_token)" }
}

if ($null -eq $overviewResponse.kpis) {
  throw "Dashboard overview responde sin estructura KPI esperada."
}

Write-Host "[OK] Backend dashboard/overview responde correctamente." -ForegroundColor Green

# 1c) Endpoints de lista usados por frontend (productos/ventas)
$authHeaders = @{ Authorization = "Bearer $($loginResponse.access_token)" }

$productosResponse = Invoke-WithRetry -Message "Endpoint /productos/ no disponible aun" -Action {
  Invoke-RestMethod -Method Get -Uri $backendProductosUrl -Headers $authHeaders
}
if (-not ($productosResponse -is [System.Array])) {
  throw "Endpoint /productos/ responde con tipo inesperado (se esperaba lista)."
}

$ventasResponse = Invoke-WithRetry -Message "Endpoint /ventas/ no disponible aun" -Action {
  Invoke-RestMethod -Method Get -Uri $backendVentasUrl -Headers $authHeaders
}
if (-not ($ventasResponse -is [System.Array])) {
  throw "Endpoint /ventas/ responde con tipo inesperado (se esperaba lista)."
}

$ventasResumenResponse = Invoke-WithRetry -Message "Endpoint /ventas/resumen no disponible aun" -Action {
  Invoke-RestMethod -Method Get -Uri $backendVentasResumenUrl -Headers $authHeaders
}
if ($null -eq $ventasResumenResponse.hoy -or $null -eq $ventasResumenResponse.mes) {
  throw "Endpoint /ventas/resumen responde sin estructura esperada."
}

Write-Host "[OK] Endpoints /productos/ y /ventas/ responden correctamente." -ForegroundColor Green

# 2) Frontend shell/login page
$loginPage = Invoke-WithRetry -Message "Frontend login no disponible aun" -Action {
  Invoke-WebRequest -Uri $frontendLoginUrl -Headers $htmlHeaders -UseBasicParsing
}

Assert-StatusCode -Actual ([int]$loginPage.StatusCode) -Expected 200 -Message "Frontend login no disponible"

Assert-ContainsAny -Content $loginPage.Content -Patterns @("Iniciar sesi[oó]n", "ALVENT ERP", "Dashboard", "Premium POS") -Message "Frontend shell no contiene el contenido esperado."

$assetPattern = '/_next/static/[^"<> ]+|/app/alvent/_next/static/[^"<> ]+|/alvent/app/_next/static/[^"<> ]+'
$assetMatches = [regex]::Matches($loginPage.Content, $assetPattern)
if ($assetMatches.Count -eq 0) {
  if ($loginPage.Content -match "Acceso de contingencia") {
    Write-Host "[WARN] Login en modo contingencia detectado (sin assets _next)." -ForegroundColor Yellow
  } else {
    if ($isLocalMode) {
      Restart-LocalServices
    } else {
      throw "Frontend login remoto sin referencias a assets _next."
    }
    $loginPage = Invoke-WithRetry -Message "Frontend login sin assets _next tras reinicio" -Action {
      Invoke-WebRequest -Uri $frontendLoginUrl -Headers $htmlHeaders -UseBasicParsing
    }
    $assetMatches = [regex]::Matches($loginPage.Content, $assetPattern)
    if ($assetMatches.Count -eq 0) {
      throw "Frontend login no contiene referencias a assets _next."
    }
  }
}

if ($assetMatches.Count -gt 0) {
  $firstAssetPath = $assetMatches[0].Value
  if ($firstAssetPath.StartsWith('/app/alvent/')) {
    $firstAssetPath = $firstAssetPath -replace '^/app/alvent/', '/'
  }
  if ($firstAssetPath.StartsWith('/alvent/app/')) {
    $firstAssetPath = $firstAssetPath -replace '^/alvent/app/', '/'
  }
  if ($firstAssetPath.StartsWith('/alvent/app/')) {
    $firstAssetPath = $firstAssetPath -replace '^/alvent/app/', '/'
  }
  $frontendBaseUri = [System.Uri]$frontendLoginUrl
  $firstAssetUrl = "$($frontendBaseUri.Scheme)://$($frontendBaseUri.Authority)$firstAssetPath"
  $firstAsset = Invoke-WithRetry -Message "Asset estatico _next no disponible aun" -Action {
    Invoke-WebRequest -Uri $firstAssetUrl -UseBasicParsing
  }
  Assert-StatusCode -Actual ([int]$firstAsset.StatusCode) -Expected 200 -Message "Asset estatico _next no disponible"
}

Write-Host "[OK] Frontend shell/login disponible." -ForegroundColor Green

# 3) Dashboard route frontend
$dashboardPage = Invoke-WithRetry -Message "Frontend dashboard no disponible aun" -Action {
  Invoke-WebRequest -Uri $frontendDashboardUrl -Headers $htmlHeaders -UseBasicParsing
}

Assert-StatusCode -Actual ([int]$dashboardPage.StatusCode) -Expected 200 -Message "Frontend dashboard no disponible"

Assert-ContainsAny -Content $dashboardPage.Content -Patterns @("ALVENT ERP", "Dashboard", "Iniciar sesi[oó]n") -Message "Frontend dashboard no contiene el contenido esperado."

Write-Host "[OK] Frontend dashboard disponible." -ForegroundColor Green
Write-Host "[ALVENT Health Check] Verificacion completada con exito." -ForegroundColor Green
