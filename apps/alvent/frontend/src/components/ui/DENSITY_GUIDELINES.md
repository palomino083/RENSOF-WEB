# DataTable Density Guidelines

Guia oficial para mantener consistencia visual en ALVENT ERP.

## Regla de uso por contexto

- `compact`: vistas operativas de alta frecuencia y mucho volumen.
  - Modulos objetivo: `POS`, `kardex`, `movimientos en tiempo real`.
- `comfy`: gestion backoffice con foco en lectura + accion.
  - Modulos objetivo: `Clientes`, `Usuarios`, `Ventas`, `Caja`.
- `executive`: vistas analiticas y paneles de decision.
  - Modulos objetivo: `Dashboard`, `Reportes`, `Inventario`, `Productos`.

## Criterio de seleccion

- Si el usuario hace muchas operaciones por minuto, usar `compact`.
- Si el usuario mezcla lectura y mantenimiento CRUD, usar `comfy`.
- Si la prioridad es storytelling de negocio y lectura financiera, usar `executive`.

## Ejemplo rapido

```tsx
<DataTable headers={["Columna A", "Columna B"]} density="comfy" minWidth={760}>
  <tr>
    <td>Dato A</td>
    <td>Dato B</td>
  </tr>
</DataTable>
```

## Nota

Mantener esta regla evita que cada modulo invente su propia densidad y preserva la experiencia premium unificada.
