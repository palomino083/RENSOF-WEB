param(
  [string]$BaseUrl = "",
  [string]$User = "Admin",
  [string]$Password = "123456",
  [string]$OutputPath = "",
  [int]$Retries = 1,
  [bool]$StrictConsole = $true
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Path $PSScriptRoot -Parent
$frontendDir = Join-Path $repoRoot "apps/alvent/frontend"
$runner = Join-Path $frontendDir "scripts/ui-smoke.mjs"
$reportDir = Join-Path $repoRoot "scripts/reports"

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

if ([string]::IsNullOrWhiteSpace($BaseUrl)) {
  $localBaseUrl = "http://127.0.0.1:3001"
  $localProbe = "$localBaseUrl/alven/app/login"
  $remoteBaseUrl = if ($env:RENSOF_PUBLIC_ORIGIN) { $env:RENSOF_PUBLIC_ORIGIN.TrimEnd('/') } else { "https://www.rensof.pe" }

  if (Test-UrlAvailable -Url $localProbe) {
    $BaseUrl = $localBaseUrl
    Write-Host "[INFO] UI smoke en modo LOCAL." -ForegroundColor Cyan
  } else {
    $BaseUrl = $remoteBaseUrl
    Write-Host "[INFO] UI smoke en modo REMOTO." -ForegroundColor Cyan
  }
}

if (-not (Test-Path $runner)) {
  throw "No se encontro runner UI smoke en $runner"
}

if (-not (Test-Path $reportDir)) {
  New-Item -ItemType Directory -Path $reportDir -Force | Out-Null
}

if ([string]::IsNullOrWhiteSpace($OutputPath)) {
  $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $OutputPath = Join-Path $reportDir "alvent-ui-smoke-$stamp.json"
}

$OutputPath = [System.IO.Path]::GetFullPath($OutputPath)

Write-Host "[ALVENT UI Smoke] Ejecutando recorrido UI..." -ForegroundColor Cyan
Write-Host "  base: $BaseUrl" -ForegroundColor DarkGray
Write-Host "  output: $OutputPath" -ForegroundColor DarkGray
Write-Host "  retries: $Retries" -ForegroundColor DarkGray
Write-Host "  strict_console: $StrictConsole" -ForegroundColor DarkGray

$attempt = 0
$exitCode = 1
do {
  $attempt += 1
  Write-Host "[ALVENT UI Smoke] Intento $attempt de $($Retries + 1)" -ForegroundColor Cyan

  Push-Location $frontendDir
  try {
    node "$runner" --baseUrl "$BaseUrl" --username "$User" --password "$Password" --output "$OutputPath" --strictConsole "$($StrictConsole.ToString().ToLowerInvariant())"
    $exitCode = $LASTEXITCODE
  } finally {
    Pop-Location
  }

  if ($exitCode -eq 0) {
    break
  }

  if ($attempt -le $Retries) {
    Write-Host "[ALVENT UI Smoke] Reintentando por salida no limpia..." -ForegroundColor Yellow
    Start-Sleep -Seconds 2
  }
} while ($attempt -le $Retries)

if (-not (Test-Path $OutputPath)) {
  throw "No se genero el reporte esperado: $OutputPath"
}

try {
  $json = Get-Content -Raw -Path $OutputPath | ConvertFrom-Json
  foreach ($item in $json.summary) {
    if ($item.clean) {
      Write-Host ("  [CLEAN] {0} | 422/403/404={1} ORB/WS={2}" -f $item.module, $item.status422_403_404_count, $item.orb_or_ws_count) -ForegroundColor Green
    } else {
      Write-Host ("  [ISSUE] {0} | 422/403/404={1} ORB/WS={2}" -f $item.module, $item.status422_403_404_count, $item.orb_or_ws_count) -ForegroundColor Yellow
    }
  }

  Write-Host "[ALVENT UI Smoke] Reporte: $OutputPath" -ForegroundColor Cyan
  if (-not $json.all_clean) {
    Write-Host "[ALVENT UI Smoke] Hallazgos detectados (ver JSON)." -ForegroundColor Yellow
  } else {
    Write-Host "[ALVENT UI Smoke] 100% limpio en criterios objetivo." -ForegroundColor Green
  }
} catch {
  Write-Host "[ALVENT UI Smoke] No se pudo resumir JSON, pero el archivo fue generado." -ForegroundColor Yellow
}

if ($exitCode -ne 0) {
  exit $exitCode
}

exit 0
