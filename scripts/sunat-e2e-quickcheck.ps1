param(
  [string]$ApiBaseUrl = "http://127.0.0.1:8000/alven/api",
  [string]$Usuario = "Admin",
  [System.Security.SecureString]$Password,
  [int]$NegocioId = 0,

  [string]$SunatProveedor = "NUBEFACT",
  [string]$SunatApiUrl = "https://api.nubefact.com/api/v1/",
  [string]$SunatApiToken,
  [string]$SunatUsuarioSol = "",
  [string]$SunatClaveSol = "",
  [string]$SunatEmisorRuc,
  [string]$SunatModo = "beta",
  [string]$SunatSerieBoleta = "B001",
  [string]$SunatSerieFactura = "F001",

  [int]$ProductoId = 0,
  [int]$Cantidad = 1,
  [double]$MontoInicialCaja = 100,

  [string]$BoletaClienteNombre = "Cliente Boleta Prueba",
  [string]$BoletaDni = "12345678",
  [string]$BoletaEmail = "",

  [string]$FacturaClienteNombre = "Cliente Factura Prueba SAC",
  [string]$FacturaRuc = "20123456789",
  [string]$FacturaEmail = "",

  [switch]$SkipCaja,
  [switch]$SkipBoleta,
  [switch]$SkipFactura
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-Step {
  param([string]$Text)
  Write-Host "[STEP] $Text" -ForegroundColor Cyan
}

function Write-Ok {
  param([string]$Text)
  Write-Host "[OK] $Text" -ForegroundColor Green
}

function Write-Warn {
  param([string]$Text)
  Write-Host "[WARN] $Text" -ForegroundColor Yellow
}

function Get-ErrorDetail {
  param($Exception)

  try {
    if ($Exception -and $Exception.Response -and $Exception.Response.GetResponseStream) {
      $stream = $Exception.Response.GetResponseStream()
      if ($stream) {
        $reader = New-Object System.IO.StreamReader($stream)
        $body = $reader.ReadToEnd()
        if ($body) { return $body }
      }
    }
  } catch {}

  return [string]$Exception.Message
}

function Invoke-Api {
  param(
    [Parameter(Mandatory = $true)][ValidateSet("GET", "POST", "PUT", "PATCH", "DELETE")][string]$Method,
    [Parameter(Mandatory = $true)][string]$Path,
    [object]$Body = $null,
    [hashtable]$Headers = @{}
  )

  $base = $ApiBaseUrl.TrimEnd("/")
  $url = "$base/$($Path.TrimStart('/'))"

  try {
    if ($null -eq $Body) {
      return Invoke-RestMethod -Method $Method -Uri $url -Headers $Headers
    }

    $json = $Body | ConvertTo-Json -Depth 20
    return Invoke-RestMethod -Method $Method -Uri $url -Headers $Headers -ContentType "application/json" -Body $json
  } catch {
    $detail = Get-ErrorDetail -Exception $_.Exception
    throw "API $Method $url fallo: $detail"
  }
}

function ConvertTo-DigitsOnly {
  param([string]$Value)
  return ([string]$Value -replace "\D", "")
}

function ConvertTo-PlainTextFromSecureString {
  param([Parameter(Mandatory = $true)][System.Security.SecureString]$Value)

  $bstr = [IntPtr]::Zero
  try {
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Value)
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  } finally {
    if ($bstr -ne [IntPtr]::Zero) {
      [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    }
  }
}

if (-not $Password) {
  $Password = Read-Host "Contrasena" -AsSecureString
}

if (-not $SunatApiToken) {
  throw "Falta -SunatApiToken."
}

$SunatEmisorRuc = ConvertTo-DigitsOnly $SunatEmisorRuc
if ($SunatEmisorRuc.Length -ne 11) {
  throw "-SunatEmisorRuc debe tener 11 digitos."
}

$BoletaDni = ConvertTo-DigitsOnly $BoletaDni
if ($BoletaDni.Length -ne 8) {
  throw "-BoletaDni debe tener 8 digitos."
}

$FacturaRuc = ConvertTo-DigitsOnly $FacturaRuc
if ($FacturaRuc.Length -ne 11) {
  throw "-FacturaRuc debe tener 11 digitos."
}

if ($Cantidad -lt 1) {
  throw "-Cantidad debe ser mayor o igual a 1."
}

Write-Host "=== ALVENT SUNAT E2E QUICKCHECK ===" -ForegroundColor Magenta

Write-Step "Login"
$passwordPlain = ConvertTo-PlainTextFromSecureString -Value $Password
$loginBody = @{ usuario = $Usuario; password = $passwordPlain }
$login = Invoke-Api -Method "POST" -Path "/auth/login" -Body $loginBody

if (-not $login.access_token) {
  throw "Login sin access_token."
}

$auth = @{ Authorization = "Bearer $($login.access_token)" }
$usuarioId = [int]$login.usuario_id
$negocioLogin = 0
if ($null -ne $login.negocio_id) {
  $negocioLogin = [int]$login.negocio_id
}
$negocioEf = if ($NegocioId -gt 0) { $NegocioId } else { $negocioLogin }

if ($negocioEf -le 0) {
  throw "No se pudo determinar negocio_id. Pasa -NegocioId explícitamente."
}

Write-Ok "Login OK. usuario_id=$usuarioId negocio_id=$negocioEf"

Write-Step "Configurar SUNAT (Nubefact)"
$configBody = @{
  integracion_sunat = $true
  sunat_proveedor = $SunatProveedor
  sunat_api_url = $SunatApiUrl
  sunat_api_token = $SunatApiToken
  sunat_usuario_sol = $SunatUsuarioSol
  sunat_clave_sol = $SunatClaveSol
  sunat_emisor_ruc = $SunatEmisorRuc
  sunat_modo = $SunatModo
  sunat_serie_boleta = $SunatSerieBoleta
  sunat_serie_factura = $SunatSerieFactura
}

$config = Invoke-Api -Method "PUT" -Path "/negocios/$negocioEf/configuracion" -Body $configBody -Headers $auth
Write-Ok "configuracion SUNAT actualizada. proveedor=$($config.sunat_proveedor) ruc=$($config.sunat_emisor_ruc)"

Write-Step "Probar conexion SUNAT"
$testSunat = Invoke-Api -Method "POST" -Path "/negocios/$negocioEf/configuracion/sunat/test" -Headers $auth
if (-not $testSunat.ok) {
  throw "Test SUNAT sin OK: $($testSunat | ConvertTo-Json -Depth 10)"
}
Write-Ok "Conexion SUNAT OK. status=$($testSunat.status_code) endpoint=$($testSunat.endpoint)"

if (-not $SkipCaja) {
  Write-Step "Verificar caja abierta"
  $hasCaja = $false
  try {
    $cajaActual = Invoke-Api -Method "GET" -Path "/cajas/actual" -Headers $auth
    if ($cajaActual -and $cajaActual.id) {
      $hasCaja = $true
      Write-Ok "Caja abierta detectada. caja_id=$($cajaActual.id)"
    }
  } catch {
    Write-Warn "No existe caja abierta, se intentara abrir una nueva."
  }

  if (-not $hasCaja) {
    $abrirCajaBody = @{ usuario_id = $usuarioId; monto_inicial = $MontoInicialCaja }
    $cajaNueva = Invoke-Api -Method "POST" -Path "/cajas/abrir" -Headers $auth -Body $abrirCajaBody
    Write-Ok "Caja abierta. caja_id=$($cajaNueva.id)"
  }
}

Write-Step "Resolver producto para ventas de prueba"
$productos = Invoke-Api -Method "GET" -Path "/productos/" -Headers $auth
if (-not ($productos -is [System.Array])) {
  throw "Respuesta inesperada en /productos/."
}

$producto = $null
if ($ProductoId -gt 0) {
  $producto = $productos | Where-Object { [int]$_.id -eq $ProductoId } | Select-Object -First 1
  if (-not $producto) {
    throw "No se encontro producto con id=$ProductoId."
  }
} else {
  $producto = $productos | Where-Object { [int]$_.stock -ge $Cantidad } | Select-Object -First 1
  if (-not $producto) {
    throw "No hay productos con stock suficiente para la prueba."
  }
}

$precio = [double]$producto.precio
$subtotal = [Math]::Round($precio * $Cantidad, 2)
Write-Ok "Producto seleccionado id=$($producto.id) nombre=$($producto.nombre) subtotal=$subtotal"

$results = @()

if (-not $SkipBoleta) {
  Write-Step "Emitir BOLETA de prueba"
  $ventaBoletaBody = @{
    cliente_id = $null
    usuario_id = $usuarioId
    subtotal = $subtotal
    descuento = 0
    metodo_pago = "Efectivo"
    comprobante = @{
      tipo_comprobante = "BOLETA"
      cliente_nombre = $BoletaClienteNombre
      cliente_documento = $BoletaDni
      cliente_email = $BoletaEmail
    }
    items = @(
      @{
        producto_id = [int]$producto.id
        cantidad = $Cantidad
      }
    )
  }

  $ventaBoleta = Invoke-Api -Method "POST" -Path "/ventas/" -Headers $auth -Body $ventaBoletaBody
  $results += [pscustomobject]@{
    Tipo = "BOLETA"
    VentaId = $ventaBoleta.venta_id
    Serie = $ventaBoleta.sunat.serie
    Numero = $ventaBoleta.sunat.numero
    EstadoSUNAT = $ventaBoleta.sunat.estado
    codigoSUNAT = $ventaBoleta.sunat.codigo
    MensajeSUNAT = $ventaBoleta.sunat.mensaje
  }
  Write-Ok "Boleta emitida. venta_id=$($ventaBoleta.venta_id) estado_sunat=$($ventaBoleta.sunat.estado)"
}

if (-not $SkipFactura) {
  Write-Step "Emitir FACTURA de prueba"
  $ventaFacturaBody = @{
    cliente_id = $null
    usuario_id = $usuarioId
    subtotal = $subtotal
    descuento = 0
    metodo_pago = "Efectivo"
    comprobante = @{
      tipo_comprobante = "FACTURA"
      cliente_nombre = $FacturaClienteNombre
      cliente_documento = $FacturaRuc
      cliente_email = $FacturaEmail
    }
    items = @(
      @{
        producto_id = [int]$producto.id
        cantidad = $Cantidad
      }
    )
  }

  $ventaFactura = Invoke-Api -Method "POST" -Path "/ventas/" -Headers $auth -Body $ventaFacturaBody
  $results += [pscustomobject]@{
    Tipo = "FACTURA"
    VentaId = $ventaFactura.venta_id
    Serie = $ventaFactura.sunat.serie
    Numero = $ventaFactura.sunat.numero
    EstadoSUNAT = $ventaFactura.sunat.estado
    codigoSUNAT = $ventaFactura.sunat.codigo
    MensajeSUNAT = $ventaFactura.sunat.mensaje
  }
  Write-Ok "Factura emitida. venta_id=$($ventaFactura.venta_id) estado_sunat=$($ventaFactura.sunat.estado)"
}

Write-Host ""
Write-Host "=== RESUMEN E2E SUNAT ===" -ForegroundColor Magenta
if ($results.Count -gt 0) {
  $results | Format-Table -AutoSize
} else {
  Write-Warn "No se ejecutaron emisiones (SkipBoleta/SkipFactura activos)."
}

Write-Host ""
Write-Ok "Flujo E2E completado."
