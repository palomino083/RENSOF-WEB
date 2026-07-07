# Matriz E2E - Enforcement de Planes

## Objetivo
Validar restricciones reales de backend para estos atributos de plan:
- `productos_limite`
- `soporte_habilitado`
- `sunat_habilitado`

## Convenciones
- API base: `http://127.0.0.1:8000/alven/api`
- Usuario de prueba: usar credenciales internas no publicadas.
- Todas las validaciones deben ejecutarse contra endpoints backend (no solo UI).
- `402` indica bloqueo por plan.

## Casos de prueba

| ID | Atributo | Escenario | Paso principal | Resultado esperado |
|---|---|---|---|---|
| P-01 | productos_limite | Plan con limite 1 y ya 1 producto creado | POST `/productos/` | `402` con mensaje de upgrade |
| P-02 | productos_limite | Plan con limite 1 y 0 productos | POST `/productos/` | `200`/`201`, producto creado |
| P-03 | productos_limite | Plan sin limite (`null`) | POST `/productos/` repetido | siempre permitido |
| S-01 | soporte_habilitado | Plan con soporte deshabilitado | POST `/system/soporte/tickets` | `402` bloqueo por plan |
| S-02 | soporte_habilitado | Plan con soporte deshabilitado | POST `/system/soporte/ia/sugerencia` | `402` bloqueo por plan |
| S-03 | soporte_habilitado | Plan con soporte habilitado | POST `/system/soporte/tickets` | `200` ticket creado |
| U-01 | sunat_habilitado | Plan sin SUNAT habilitado y venta con BOLETA/FACTURA | POST `/ventas/` | `402` bloqueo por plan |
| U-02 | sunat_habilitado | Plan con SUNAT habilitado, configuracion incompleta | POST `/ventas/` | `400` por configuracion (no por plan) |
| U-03 | sunat_habilitado | Plan con SUNAT habilitado y configuracion correcta | POST `/ventas/` | `200` venta registrada |

## Script base (PowerShell)

```powershell
$base='http://127.0.0.1:8000/alven/api'
$usuario=$env:ALVENT_TEST_USER
$password=$env:ALVENT_TEST_PASSWORD
$login=Invoke-RestMethod -Method Post -Uri "$base/auth/login" -ContentType 'application/json' -Body (@{usuario=$usuario; password=$password} | ConvertTo-Json)
$h=@{Authorization="Bearer $($login.access_token)"; 'Content-Type'='application/json'}
```

## Validaciones rápidas

### P-01: bloqueo por limite de productos
```powershell
# Repetir creación hasta exceder el limite configurado
Invoke-RestMethod -Method Post -Uri "$base/productos/" -Headers $h -Body '{"codigo":"TEST-PROD-01","nombre":"Prod 1","precio":10,"costo":5,"stock":1}'
Invoke-RestMethod -Method Post -Uri "$base/productos/" -Headers $h -Body '{"codigo":"TEST-PROD-02","nombre":"Prod 2","precio":10,"costo":5,"stock":1}'
```
Esperado en la segunda llamada: `402`.

### S-01: bloqueo de soporte por plan
```powershell
Invoke-RestMethod -Method Post -Uri "$base/system/soporte/tickets" -Headers $h -Body '{"asunto":"Prueba soporte","consulta":"Incidencia de prueba con plan sin soporte","prioridad":"MEDIA"}'
```
Esperado: `402`.

### S-02: bloqueo de sugerencia IA por plan
```powershell
Invoke-RestMethod -Method Post -Uri "$base/system/soporte/ia/sugerencia" -Headers $h -Body '{"asunto":"Prueba IA","consulta":"Necesito ayuda para una incidencia"}'
```
Esperado: `402`.

### U-01: bloqueo SUNAT por plan
```powershell
$venta = @{
  cliente_id = $null
  usuario_id = $login.usuario_id
  subtotal = 10
  descuento = 0
  metodo_pago = 'Efectivo'
  comprobante = @{ tipo_comprobante='BOLETA'; cliente_nombre='Cliente Test'; cliente_documento='12345678' }
  items = @(@{ producto_id = 1; cantidad = 1 })
} | ConvertTo-Json -Depth 10

Invoke-RestMethod -Method Post -Uri "$base/ventas/" -Headers $h -Body $venta
```
Esperado: `402` cuando `sunat_habilitado=false` para el plan activo.

## Criterio de aceptación
- Todos los casos `P-*`, `S-*` y `U-*` cumplen el resultado esperado.
- No se debe poder saltar la restricción desde llamadas directas al backend.
- La UI puede mostrar/ocultar opciones, pero la seguridad final la impone la API.
