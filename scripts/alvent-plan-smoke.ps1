param(
  [string]$BaseUrl = "http://127.0.0.1:8001",
  [string]$AdminUser = "admin",
  [string]$AdminPassword = "123456",
  [switch]$JsonOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Path $PSScriptRoot -Parent
$backendDbPath = Join-Path $repoRoot "apps/alvent/backend/app/database/alvent.db"
$pythonExe = Join-Path $repoRoot ".venv/Scripts/python.exe"
if (-not (Test-Path $pythonExe)) {
  $pythonExe = "python"
}

function Invoke-Api {
  param(
    [Parameter(Mandatory = $true)][string]$Method,
    [Parameter(Mandatory = $true)][string]$Url,
    [object]$Body = $null,
    [hashtable]$Headers = @{}
  )

  try {
    if ($null -ne $Body) {
      $response = Invoke-RestMethod -Method $Method -Uri $Url -Headers $Headers -ContentType "application/json" -Body ($Body | ConvertTo-Json -Depth 20)
    } else {
      $response = Invoke-RestMethod -Method $Method -Uri $Url -Headers $Headers
    }
    return [pscustomobject]@{ ok = $true; status = 200; data = $response; error = $null }
  } catch {
    $status = -1
    if ($_.Exception.Response -and $_.Exception.Response.StatusCode) {
      $status = [int]$_.Exception.Response.StatusCode
    }
    $errMsg = if ($_.ErrorDetails.Message) { $_.ErrorDetails.Message } else { $_.Exception.Message }
    return [pscustomobject]@{ ok = $false; status = $status; data = $null; error = $errMsg }
  }
}

function Parse-DateOrMin {
  param([object]$Value)
  if ($null -eq $Value) { return [datetime]::MinValue }
  $raw = [string]$Value
  if ([string]::IsNullOrWhiteSpace($raw)) { return [datetime]::MinValue }
  try { return [datetime]$raw } catch { return [datetime]::MinValue }
}

function Add-CaseResult {
  param(
    [Parameter(Mandatory = $true)]$Results,
    [Parameter(Mandatory = $true)][string]$Case,
    [Parameter(Mandatory = $true)][bool]$Pass,
    [Parameter(Mandatory = $true)][string]$Detail,
    [Parameter(Mandatory = $true)]$Meta
  )

  $Results.Add([pscustomobject]@{
    case = $Case
    pass = $Pass
    detail = $Detail
    meta = $Meta
  }) | Out-Null
}

$runId = [DateTime]::UtcNow.ToString("yyyyMMddHHmmss")
$results = New-Object System.Collections.Generic.List[object]

if (-not $JsonOnly) {
  Write-Host "[ALVENT Plan Smoke] Starting run_id=$runId on $BaseUrl" -ForegroundColor Cyan
}

# 0) Login superadmin
$login = Invoke-Api -Method "POST" -Url "$BaseUrl/auth/login" -Body @{ usuario = $AdminUser; password = $AdminPassword }
if (-not $login.ok) {
  throw "No se pudo autenticar superadmin en $BaseUrl/auth/login -> $($login.status) $($login.error)"
}
$headers = @{ Authorization = "Bearer $($login.data.access_token)" }

# 0b) Crear negocio aislado para la corrida
$negocio = Invoke-Api -Method "POST" -Url "$BaseUrl/negocios/" -Headers $headers -Body @{
  nombre = "NEG-SMOKE-$runId"
  tipo = "tienda"
  plan = "GRATUITO"
  descripcion = "Smoke test planes"
}
if (-not $negocio.ok) {
  throw "No se pudo crear negocio de smoke -> $($negocio.status) $($negocio.error)"
}
$negocioId = [int]$negocio.data.id

# 1) Alta
$ref1 = "ALTA-$runId"
$c1 = Invoke-Api -Method "POST" -Url "$BaseUrl/negocios/$negocioId/solicitar-plan" -Headers $headers -Body @{
  plan_objetivo = "BASICO"
  referencia_pago = $ref1
  duracion_dias = 30
  canal_pago = "transferencia"
  validacion_modo = "AUTO"
  declaracion_anti_fraude = $true
  observaciones = "alta smoke"
  comprobante_url = "/uploads/planes/smoke-alta.pdf"
}
$pass1 = $c1.ok -and ($c1.data.estado -eq "APLICADO") -and ($c1.data.plan_solicitado -eq "BASICO") -and ([int]$c1.data.duracion_dias_aplicada -eq 30)
Add-CaseResult -Results $results -Case "1_alta" -Pass $pass1 -Detail ("status={0} estado={1} plan={2} dias={3}" -f $c1.status, $c1.data.estado, $c1.data.plan_solicitado, $c1.data.duracion_dias_aplicada) -Meta $c1

# 2) Cambio
$ref2 = "CAMBIO-$runId"
$c2 = Invoke-Api -Method "POST" -Url "$BaseUrl/negocios/$negocioId/solicitar-plan" -Headers $headers -Body @{
  plan_objetivo = "PRO"
  referencia_pago = $ref2
  duracion_dias = 20
  canal_pago = "transferencia"
  validacion_modo = "AUTO"
  declaracion_anti_fraude = $true
  observaciones = "cambio smoke"
  comprobante_url = "/uploads/planes/smoke-cambio.pdf"
}
$pass2 = $c2.ok -and ($c2.data.estado -eq "APLICADO") -and ($c2.data.plan_solicitado -eq "PRO") -and ([int]$c2.data.duracion_dias_aplicada -eq 20)
Add-CaseResult -Results $results -Case "2_cambio" -Pass $pass2 -Detail ("status={0} estado={1} plan={2} dias={3}" -f $c2.status, $c2.data.estado, $c2.data.plan_solicitado, $c2.data.duracion_dias_aplicada) -Meta $c2

# 3) Renovacion antes de vencer
$n3Before = Invoke-Api -Method "GET" -Url "$BaseUrl/negocios/$negocioId" -Headers $headers
$beforeDate = Parse-DateOrMin $n3Before.data.plan_vigente_hasta
$ref3 = "RENOVA-A-$runId"
$c3 = Invoke-Api -Method "POST" -Url "$BaseUrl/negocios/$negocioId/solicitar-plan" -Headers $headers -Body @{
  plan_objetivo = "PRO"
  referencia_pago = $ref3
  duracion_dias = 15
  canal_pago = "transferencia"
  validacion_modo = "AUTO"
  declaracion_anti_fraude = $true
  observaciones = "renovacion activa smoke"
  comprobante_url = "/uploads/planes/smoke-renova-a.pdf"
}
$n3After = Invoke-Api -Method "GET" -Url "$BaseUrl/negocios/$negocioId" -Headers $headers
$afterDate = Parse-DateOrMin $n3After.data.plan_vigente_hasta
$pass3 = $c3.ok -and ($c3.data.estado -eq "APLICADO") -and ($afterDate -gt $beforeDate)
Add-CaseResult -Results $results -Case "3_renovacion_antes_vencer" -Pass $pass3 -Detail ("status={0} estado={1} before={2:o} after={3:o}" -f $c3.status, $c3.data.estado, $beforeDate, $afterDate) -Meta @{ request = $c3; before = $n3Before.data; after = $n3After.data }

# 4) Renovacion despues de vencer (mismo plan)
$pyPath = Join-Path $PSScriptRoot "tmp_expire_plan_smoke.py"
$backendDbPathForPy = $backendDbPath.Replace("\\", "/")
$pySource = @"
import sqlite3

conn = sqlite3.connect(r'$backendDbPathForPy')
cur = conn.cursor()
cur.execute(
  "update negocios set plan=?, plan_vigente_hasta=? where id=?",
    ('PRO', '2000-01-01 00:00:00', $negocioId),
)
conn.commit()
conn.close()
print('EXPIRE_OK')
"@
Set-Content -Path $pyPath -Value $pySource -Encoding UTF8
try {
  $expireOut = & $pythonExe $pyPath 2>&1
} finally {
  if (Test-Path $pyPath) { Remove-Item $pyPath -Force }
}

$ref4 = "RENOVA-V-$runId"
$c4 = Invoke-Api -Method "POST" -Url "$BaseUrl/negocios/$negocioId/solicitar-plan" -Headers $headers -Body @{
  plan_objetivo = "PRO"
  referencia_pago = $ref4
  duracion_dias = 10
  canal_pago = "transferencia"
  validacion_modo = "AUTO"
  declaracion_anti_fraude = $true
  observaciones = "renovacion vencida smoke"
  comprobante_url = "/uploads/planes/smoke-renova-v.pdf"
}
$n4After = Invoke-Api -Method "GET" -Url "$BaseUrl/negocios/$negocioId" -Headers $headers
$after4 = Parse-DateOrMin $n4After.data.plan_vigente_hasta
$pass4 = $c4.ok -and ($c4.data.estado -eq "APLICADO") -and ($n4After.data.plan -eq "PRO") -and ($after4 -gt [datetime]::UtcNow)
Add-CaseResult -Results $results -Case "4_renovacion_vencido" -Pass $pass4 -Detail ("status={0} estado={1} planFinal={2} vigenteHasta={3:o} expire={4}" -f $c4.status, $c4.data.estado, $n4After.data.plan, $after4, ($expireOut -join ' ')) -Meta @{ request = $c4; after = $n4After.data }

# 5) Idempotencia de duplicado
$ref5 = "IDEMP-$runId"
$body5 = @{
  plan_objetivo = "LITE"
  referencia_pago = $ref5
  duracion_dias = 12
  canal_pago = "transferencia"
  validacion_modo = "AUTO"
  declaracion_anti_fraude = $true
  observaciones = "idempotencia smoke"
  comprobante_url = "/uploads/planes/smoke-idem.pdf"
}
$c5a = Invoke-Api -Method "POST" -Url "$BaseUrl/negocios/$negocioId/solicitar-plan" -Headers $headers -Body $body5
$c5b = Invoke-Api -Method "POST" -Url "$BaseUrl/negocios/$negocioId/solicitar-plan" -Headers $headers -Body $body5
$msg2 = [string]$c5b.data.mensaje
$pass5 = $c5a.ok -and $c5b.ok -and ($c5a.data.estado -eq $c5b.data.estado) -and ($msg2 -like "Solicitud ya registrada*")
Add-CaseResult -Results $results -Case "5_idempotencia_duplicado" -Pass $pass5 -Detail ("first={0}/{1} second={2}/{3} msg2={4}" -f $c5a.status, $c5a.data.estado, $c5b.status, $c5b.data.estado, $msg2) -Meta @{ first = $c5a; second = $c5b }

# 6) Aprobacion manual
$ref6 = "MANUAL-$runId"
$c6req = Invoke-Api -Method "POST" -Url "$BaseUrl/negocios/$negocioId/solicitar-plan" -Headers $headers -Body @{
  plan_objetivo = "PREMIUM"
  referencia_pago = $ref6
  duracion_dias = 25
  canal_pago = "transferencia"
  validacion_modo = "MANUAL"
  declaracion_anti_fraude = $true
  observaciones = "manual smoke"
  comprobante_url = "/uploads/planes/smoke-manual.pdf"
}
$hist = Invoke-Api -Method "GET" -Url "$BaseUrl/negocios/$negocioId/planes/historial" -Headers $headers
$target = $null
if ($hist.ok) {
  $target = $hist.data | Where-Object { $_.referencia_pago -eq $ref6 } | Select-Object -First 1
}
$c6approve = $null
if ($target) {
  $c6approve = Invoke-Api -Method "PATCH" -Url "$BaseUrl/negocios/$negocioId/planes/historial/$($target.id)/validar" -Headers $headers -Body @{ accion = "APROBAR" }
}
$pass6 = $c6req.ok -and ($c6req.data.estado -eq "PENDIENTE_VALIDACION") -and ($null -ne $c6approve) -and $c6approve.ok -and ($c6approve.data.estado -eq "APLICADO")
Add-CaseResult -Results $results -Case "6_aprobacion_manual" -Pass $pass6 -Detail ("sol={0}/{1} apr={2}/{3}" -f $c6req.status, $c6req.data.estado, $c6approve.status, $c6approve.data.estado) -Meta @{ request = $c6req; approve = $c6approve }

$summary = [pscustomobject]@{
  run_id = $runId
  base_url = $BaseUrl
  negocio_id = $negocioId
  total = $results.Count
  aprobados = @($results | Where-Object { $_.pass }).Count
  fallidos = @($results | Where-Object { -not $_.pass }).Count
  resultados = $results
}

$json = $summary | ConvertTo-Json -Depth 30
if ($JsonOnly) {
  $json
} else {
  Write-Host "[ALVENT Plan Smoke] run_id=$runId negocio_id=$negocioId total=$($summary.total) pass=$($summary.aprobados) fail=$($summary.fallidos)" -ForegroundColor Cyan
  $summary.resultados | ForEach-Object {
    if ($_.pass) {
      Write-Host "  [PASS] $($_.case) -> $($_.detail)" -ForegroundColor Green
    } else {
      Write-Host "  [FAIL] $($_.case) -> $($_.detail)" -ForegroundColor Red
    }
  }
  Write-Host "`nJSON:" -ForegroundColor DarkGray
  $json
}

if ($summary.fallidos -gt 0) {
  exit 1
}

exit 0
