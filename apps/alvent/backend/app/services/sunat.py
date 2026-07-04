from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any

import httpx

NUBEFACT_DEFAULT_URL = "https://api.nubefact.com/api/v1/"


def _to_decimal(value: Any) -> Decimal:
    try:
        return Decimal(str(value or 0))
    except Exception:
        return Decimal("0")


def _tipo_doc_by_comprobante(tipo_comprobante: str, documento: str | None) -> str:
    doc = "".join(ch for ch in str(documento or "") if ch.isdigit())
    if tipo_comprobante == "FACTURA":
        return "6"  # RUC
    if len(doc) == 11:
        return "6"  # RUC
    return "1"  # DNI


def _tipo_comprobante_nubefact(tipo_comprobante: str) -> str:
    if str(tipo_comprobante or "").upper() == "FACTURA":
        return "1"
    return "2"  # BOLETA


def _to_iso_date(value: datetime) -> str:
    return value.strftime("%Y-%m-%d")


def homologar_error_nubefact(exc: Exception) -> dict[str, str]:
    raw = str(exc or "Error desconocido").strip()
    upper = raw.upper()

    if "401" in upper or "403" in upper or "TOKEN" in upper or "UNAUTHORIZED" in upper:
        return {
            "codigo": "SUNAT_AUTH_ERROR",
            "mensaje": "Credenciales SUNAT/Nubefact inválidas o expiradas",
            "detalle": raw,
        }
    if "TIMEOUT" in upper or "TIMED OUT" in upper:
        return {
            "codigo": "SUNAT_TIMEOUT",
            "mensaje": "Tiempo de espera agotado al conectar con SUNAT/Nubefact",
            "detalle": raw,
        }
    if "422" in upper or "400" in upper or "VALID" in upper:
        return {
            "codigo": "SUNAT_VALIDATION_ERROR",
            "mensaje": "El comprobante fue rechazado por validación",
            "detalle": raw,
        }
    if "500" in upper or "502" in upper or "503" in upper or "504" in upper:
        return {
            "codigo": "SUNAT_PROVIDER_ERROR",
            "mensaje": "Proveedor SUNAT temporalmente no disponible",
            "detalle": raw,
        }
    return {
        "codigo": "SUNAT_UNKNOWN_ERROR",
        "mensaje": "No se pudo procesar la emisión electrónica",
        "detalle": raw,
    }


def construir_payload_sunat(
    *,
    emisor_ruc: str,
    tipo_comprobante: str,
    serie: str,
    correlativo: str,
    fecha_emision: datetime,
    cliente_nombre: str | None,
    cliente_documento: str | None,
    cliente_email: str | None,
    moneda: str,
    subtotal: float,
    descuento: float,
    total: float,
    items: list[dict[str, Any]],
) -> dict[str, Any]:
    tipo_doc = _tipo_doc_by_comprobante(tipo_comprobante, cliente_documento)
    tipo_comprobante_nubefact = _tipo_comprobante_nubefact(tipo_comprobante)

    total_decimal = _to_decimal(total).quantize(Decimal("0.01"))
    subtotal_decimal = _to_decimal(subtotal).quantize(Decimal("0.01"))
    descuento_decimal = _to_decimal(descuento).quantize(Decimal("0.01"))

    base_igv = max(Decimal("0"), subtotal_decimal - descuento_decimal)
    total_igv = (base_igv * Decimal("0.18")).quantize(Decimal("0.01"))
    total_gravada = (base_igv - total_igv).quantize(Decimal("0.01")) if base_igv > 0 else Decimal("0.00")

    payload_items: list[dict[str, Any]] = []
    for idx, item in enumerate(items, start=1):
        cantidad = _to_decimal(item.get("cantidad")).quantize(Decimal("0.01"))
        precio_unitario = _to_decimal(item.get("precio_unitario")).quantize(Decimal("0.01"))
        valor_unitario = (precio_unitario / Decimal("1.18")).quantize(Decimal("0.01")) if precio_unitario > 0 else Decimal("0.00")
        valor_total = (valor_unitario * cantidad).quantize(Decimal("0.01"))
        igv_item = ((precio_unitario - valor_unitario) * cantidad).quantize(Decimal("0.01"))

        payload_items.append(
            {
                "unidad_de_medida": "NIU",
                "codigo": str(item.get("codigo") or f"ITEM-{idx}"),
                "descripcion": str(item.get("descripcion") or "ITEM"),
                "cantidad": float(cantidad),
                "valor_unitario": float(valor_unitario),
                "precio_unitario": float(precio_unitario),
                "descuento": "",
                "subtotal": float(valor_total),
                "tipo_de_igv": 1,
                "igv": float(igv_item),
                "total": float((valor_total + igv_item).quantize(Decimal("0.01"))),
                "anticipo_regularizacion": False,
            }
        )

    return {
        "operacion": "generar_comprobante",
        "tipo_de_comprobante": tipo_comprobante_nubefact,
        "serie": serie,
        "numero": int(correlativo),
        "sunat_transaction": 1,
        "cliente_tipo_de_documento": tipo_doc,
        "cliente_numero_de_documento": str(cliente_documento or ""),
        "cliente_denominacion": str(cliente_nombre or "CLIENTE VARIOS"),
        "cliente_direccion": "",
        "cliente_email": str(cliente_email or ""),
        "fecha_de_emision": _to_iso_date(fecha_emision),
        "fecha_de_vencimiento": "",
        "moneda": 1 if str(moneda or "PEN").upper() == "PEN" else 2,
        "porcentaje_de_igv": 18.00,
        "descuento_global": float(descuento_decimal),
        "total_descuento": float(descuento_decimal),
        "total_anticipo": "",
        "total_gravada": float(max(total_gravada, Decimal("0.00"))),
        "total_inafecta": 0.00,
        "total_exonerada": 0.00,
        "total_igv": float(max(total_igv, Decimal("0.00"))),
        "total_gratuita": 0.00,
        "total_otros_cargos": 0.00,
        "total": float(total_decimal),
        "detraccion": False,
        "observaciones": "",
        "enviar_automaticamente_a_la_sunat": True,
        "enviar_automaticamente_al_cliente": False,
        "codigo_unico": "",
        "condiciones_de_pago": "CONTADO",
        "medio_de_pago": "EFECTIVO",
        "placa_vehiculo": "",
        "orden_compra_servicio": "",
        "tabla_personalizada_codigo": "",
        "formato_de_pdf": "A4",
        "items": payload_items,
        "emisor": {"ruc": emisor_ruc},
    }


def emitir_en_sunat(
    *,
    endpoint_url: str,
    api_token: str | None,
    payload: dict[str, Any],
    usuario_sol: str | None = None,
    clave_sol: str | None = None,
    timeout_seconds: float = 25.0,
) -> dict[str, Any]:
    safe_url = str(endpoint_url or "").strip() or NUBEFACT_DEFAULT_URL
    headers = {"Content-Type": "application/json"}
    if api_token:
        headers["Authorization"] = f"Token token={api_token}"

    body = dict(payload)
    if usuario_sol:
        body["credenciales"] = {
            "usuario_sol": usuario_sol,
            "clave_sol": clave_sol or "",
        }

    with httpx.Client(timeout=timeout_seconds) as client:
        response = client.post(safe_url, json=body, headers=headers)

    if response.status_code >= 400:
        detail = response.text[:400] or "Error de integración SUNAT"
        raise RuntimeError(f"SUNAT respondió {response.status_code}: {detail}")

    data = response.json() if response.content else {}
    aceptada = bool(data.get("aceptada_por_sunat"))
    estado = "ACEPTADO" if aceptada else str(data.get("estado_de_sunat") or data.get("sunat_responsecode") or "PENDIENTE").upper()
    mensaje = str(
        data.get("sunat_description")
        or data.get("errors")
        or data.get("mensaje")
        or data.get("message")
        or ("Comprobante aceptado por SUNAT" if aceptada else "Envío realizado")
    )

    return {
        "estado": estado,
        "codigo": str(data.get("sunat_responsecode") or data.get("codigo") or data.get("code") or ""),
        "mensaje": mensaje,
        "hash": str(data.get("cadena_para_codigo_qr") or data.get("hash") or data.get("resumen") or ""),
        "ticket": str(data.get("enlace_del_pdf") or data.get("ticket") or ""),
        "cdr_url": str(data.get("enlace_del_xml") or data.get("cdr_url") or data.get("cdr") or ""),
        "enlace_pdf": str(data.get("enlace_del_pdf") or ""),
        "enlace_xml": str(data.get("enlace_del_xml") or ""),
        "enlace_cdr": str(data.get("enlace_del_cdr") or ""),
        "raw": data,
    }


def probar_conexion_sunat(
    *,
    endpoint_url: str,
    api_token: str | None,
    timeout_seconds: float = 12.0,
) -> dict[str, Any]:
    safe_url = str(endpoint_url or "").strip() or NUBEFACT_DEFAULT_URL
    headers = {"Content-Type": "application/json"}
    if api_token:
        headers["Authorization"] = f"Token token={api_token}"

    payload = {
        "operacion": "consultar_documento",
        "tipo_de_comprobante": "1",
        "serie": "F001",
        "numero": 1,
    }

    with httpx.Client(timeout=timeout_seconds) as client:
        response = client.post(safe_url, json=payload, headers=headers)

    if response.status_code in {401, 403}:
        raise RuntimeError("Credenciales inválidas para Nubefact")
    if response.status_code >= 500:
        raise RuntimeError(f"Proveedor no disponible: {response.status_code}")

    ok = response.status_code in {200, 201, 202, 400, 404, 422}
    data = response.json() if response.content else {}

    return {
        "ok": ok,
        "status_code": response.status_code,
        "endpoint": safe_url,
        "proveedor": "NUBEFACT",
        "mensaje": "Conexión establecida" if ok else "No se pudo validar conexión",
        "detalle": str(data.get("message") or data.get("errors") or ""),
    }
