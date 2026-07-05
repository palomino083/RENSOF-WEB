import os
import secrets
import httpx
from urllib.parse import urlparse
from datetime import datetime
from fastapi import APIRouter, Form, HTTPException, Query, Request
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, RedirectResponse, Response
from fastapi.templating import Jinja2Templates

from app.core.config import (
    BASE_DIR,
    ALVENT_APP_URL,
    ALVENT_BACKEND_LOCAL_ORIGIN,
    ALVENT_BACKEND_ORIGIN,
    ALVENT_FRONTEND_BASE_PATH,
    ALVENT_FRONTEND_LOCAL_ORIGIN,
    ALVENT_FRONTEND_ORIGIN,
    TEMPLATES_DIR,
)
from app.db.database import SessionLocal
from app.services.content_service import add_contact_message, get_email_accounts, get_home_content, get_primary_email_account, get_publications

router = APIRouter(tags=["pages"])
templates = Jinja2Templates(directory=str(TEMPLATES_DIR))

ALVENT_FALLBACK_USER = os.getenv("ALVENT_FALLBACK_USER", "Admin")
ALVENT_FALLBACK_PASSWORD = os.getenv("ALVENT_FALLBACK_PASSWORD", "123456")
ALVENT_FRONTEND_FAVICON_PATH = BASE_DIR / "apps" / "alvent" / "frontend" / "app" / "favicon.ico"
ALVENT_PLAN_PAYMENTS_FALLBACK: dict[int, list[dict[str, object]]] = {}


def _alvent_frontend_url(path: str = "") -> str:
    # Mantener navegacion dentro del mismo host (rensof.pe) para evitar saltos a Render.
    normalized_path = f"/{path.lstrip('/')}" if path else ""
    return normalized_path or "/alven/app/login"


def _alvent_direct_frontend_url(request: Request, full_path: str = "") -> str:
    base_origin = ALVENT_FRONTEND_ORIGIN.rstrip("/")
    base_path = ALVENT_FRONTEND_BASE_PATH.strip("/")
    normalized = full_path.strip("/")

    path = "/" + "/".join(part for part in (base_path, normalized) if part)
    target = f"{base_origin}{path}"

    if request.url.query:
        target = f"{target}?{request.url.query}"

    return target


def _redirect_to_real_alvent_frontend(request: Request, full_path: str = "") -> Response:
    target = _alvent_direct_frontend_url(request, full_path)
    target_host = (urlparse(target).hostname or "").lower()
    current_host = request.headers.get("host", "").split(":", 1)[0].lower()

    # Seguridad: nunca redirigir a localhost/loopback desde produccion.
    if target_host in {"127.0.0.1", "localhost"} and not _is_local_request(request):
        return _frontend_unavailable_response()

    # Evita bucles si el origen directo coincide con el host actual.
    if target_host and current_host and target_host == current_host:
        return _frontend_unavailable_response()

    return _disable_cache(RedirectResponse(target, status_code=307))


def _is_html_navigation_request(request: Request) -> bool:
    if request.method not in {"GET", "HEAD"}:
        return False

    sec_fetch_dest = request.headers.get("sec-fetch-dest", "").lower()
    if sec_fetch_dest and sec_fetch_dest != "document":
        return False

    accept = request.headers.get("accept", "").lower()
    if sec_fetch_dest == "document":
        return True

    return "text/html" in accept


def _frontend_unavailable_response() -> Response:
    return Response(
        content="ALVENT frontend unavailable",
        status_code=503,
        media_type="text/plain",
    )


def _disable_cache(response: Response) -> Response:
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response


def _looks_like_render_loading_page(response: Response) -> bool:
    content_type = response.headers.get("content-type", "").lower()
    if "text/html" not in content_type:
        return False

    try:
        body_preview = response.body[:8192].decode("utf-8", errors="ignore").lower()
    except Exception:
        return False

    return "render - application loading" in body_preview or "render application loading" in body_preview


def _build_proxy_target(origin: str, full_path: str, query: str) -> str:
    base = origin.rstrip("/")
    path = f"/{full_path.lstrip('/')}" if full_path else ""
    target = f"{base}{path}"
    if query:
        target = f"{target}?{query}"
    return target


def _is_next_asset_request_path(path: str) -> bool:
    normalized = path.strip("/").lower()
    return normalized.startswith("_next/") or "/_next/" in normalized


def _proxy_response_headers(
    response_headers: httpx.Headers,
    frontend_origins: list[str],
    backend_origin: str,
) -> dict[str, str]:
    excluded = {
        "content-encoding",
        "transfer-encoding",
        "connection",
        "keep-alive",
        "proxy-authenticate",
        "proxy-authorization",
        "te",
        "trailers",
        "upgrade",
    }
    headers: dict[str, str] = {}
    for key, value in response_headers.items():
        if key.lower() in excluded:
            continue
        if key.lower() == "location":
            location = value
            for frontend_origin in frontend_origins:
                if location.startswith(frontend_origin):
                    location = location.replace(frontend_origin, "/alven/app", 1)
                    break
            if location.startswith(backend_origin):
                location = location.replace(backend_origin, "/alven/api", 1)
            headers[key] = location
            continue
        headers[key] = value
    return headers


def _frontend_origins_for_request(request: Request) -> list[str]:
    origins: list[str] = []
    host = request.headers.get("host", "").lower()
    is_local_request = host.startswith("127.0.0.1") or host.startswith("localhost")

    if is_local_request and ALVENT_FRONTEND_LOCAL_ORIGIN:
        # En entorno local priorizamos solo el frontend local para validar cambios
        # recientes sin caer silenciosamente al origen remoto.
        return [ALVENT_FRONTEND_LOCAL_ORIGIN.rstrip("/")]

    remote_origin = ALVENT_FRONTEND_ORIGIN.rstrip("/")
    if remote_origin not in origins:
        origins.append(remote_origin)

    return origins


def _backend_origin_for_request(request: Request) -> str:
    host = request.headers.get("host", "").lower()
    is_local_request = host.startswith("127.0.0.1") or host.startswith("localhost")
    if is_local_request and ALVENT_BACKEND_LOCAL_ORIGIN:
        return ALVENT_BACKEND_LOCAL_ORIGIN.rstrip("/")
    return ALVENT_BACKEND_ORIGIN.rstrip("/")


def _is_local_request(request: Request) -> bool:
    host = request.headers.get("host", "").lower()
    return host.startswith("127.0.0.1") or host.startswith("localhost")


def _local_frontend_redirect(request: Request, full_path: str = "") -> Response | None:
    if not _is_local_request(request) or not ALVENT_FRONTEND_LOCAL_ORIGIN:
        return None

    # En local evitamos proxyear el frontend Next para no romper HMR/WebSocket
    # en /_next/webpack-hmr cuando se navega por el gateway 8000.
    if request.method not in {"GET", "HEAD"}:
        return None

    base_path = ALVENT_FRONTEND_BASE_PATH.strip("/")
    path = "/".join(part for part in (base_path, full_path.strip("/")) if part)
    target = _build_proxy_target(ALVENT_FRONTEND_LOCAL_ORIGIN, path, request.url.query)
    return RedirectResponse(target, status_code=307)


def _upstream_unavailable_response() -> Response:
    return JSONResponse({"detail": "ALVENT backend unavailable"}, status_code=503)


def _is_usable_upstream_response(status_code: int) -> bool:
    return status_code < 500 and status_code != 429


async def _proxy_request(
    request: Request,
    origin: str,
    full_path: str = "",
    frontend_origins: list[str] | None = None,
) -> Response:
    target_url = _build_proxy_target(origin, full_path, request.url.query)
    body = await request.body()
    excluded_request_headers = {"host", "content-length", "accept-encoding"}
    forwarded_headers = {
        key: value
        for key, value in request.headers.items()
        if key.lower() not in excluded_request_headers
    }
    forwarded_headers["x-forwarded-host"] = request.headers.get("host", "")
    forwarded_headers["x-forwarded-proto"] = request.url.scheme

    async with httpx.AsyncClient(follow_redirects=False, timeout=60.0) as client:
        proxied = await client.request(
            method=request.method,
            url=target_url,
            headers=forwarded_headers,
            content=body,
        )

    return Response(
        content=proxied.content,
        status_code=proxied.status_code,
        headers=_proxy_response_headers(
            proxied.headers,
            frontend_origins or [ALVENT_FRONTEND_ORIGIN.rstrip("/")],
            ALVENT_BACKEND_ORIGIN,
        ),
        media_type=proxied.headers.get("content-type"),
    )


async def _proxy_alvent_frontend_request(request: Request, full_path: str = "") -> Response:
    frontend_origins = _frontend_origins_for_request(request)
    requested_path = full_path.strip("/")
    base_path = ALVENT_FRONTEND_BASE_PATH.strip("/")

    candidates: list[str] = [requested_path] if requested_path else [""]
    prefixed_path = "/".join(part for part in (base_path, requested_path) if part)
    if prefixed_path and prefixed_path not in candidates:
        candidates.append(prefixed_path)

    is_asset_request = _is_next_asset_request_path(requested_path)
    if is_asset_request and prefixed_path and requested_path:
        # Para assets de Next priorizamos la variante con basePath para evitar
        # aceptar HTML de fallback en vez de JS/CSS.
        candidates = [prefixed_path, requested_path]

    last_response: Response | None = None
    last_request_error: httpx.RequestError | None = None

    for frontend_origin in frontend_origins:
        for candidate in candidates:
            try:
                response = await _proxy_request(
                    request,
                    frontend_origin,
                    candidate,
                    frontend_origins=frontend_origins,
                )
            except httpx.RequestError as exc:
                last_request_error = exc
                continue

            body_preview = response.body[:4096].decode("utf-8", errors="ignore").lower()
            looks_like_not_found = "this page could not be found" in body_preview
            is_server_error = response.status_code >= 500
            content_type = response.headers.get("content-type", "").lower()
            is_html_content = "text/html" in content_type

            if is_asset_request and (is_html_content or response.status_code == 404 or looks_like_not_found):
                last_response = response
                continue

            if not is_server_error and response.status_code != 404 and not looks_like_not_found:
                return response
            last_response = response

    if last_response is not None:
        return last_response
    if last_request_error is not None:
        raise last_request_error

    return await _proxy_request(
        request,
        ALVENT_FRONTEND_ORIGIN,
        requested_path,
        frontend_origins=frontend_origins,
    )


def _alvent_fallback_auth_payload(usuario: str) -> dict[str, object]:
    return {
        "access_token": f"fallback-{secrets.token_urlsafe(16)}",
        "refresh_token": f"fallback-{secrets.token_urlsafe(24)}",
        "token_type": "bearer",
        "usuario_id": 1,
        "negocio_id": 0,
        "nombres": "Super Administrador",
        "rol": "SUPERADMIN",
        "roles": ["SUPERADMIN"],
        "usuario": usuario,
    }


def _alvent_dashboard_overview_fallback_payload() -> dict[str, object]:
    return {
        "contexto": {
            "modo_global": False,
            "negocio_id": None,
        },
        "kpis": {
            "productos": 0,
            "clientes": 0,
            "usuarios": 0,
            "ventas": 0,
            "monto_vendido": 0.0,
            "caja_abierta": False,
        },
        "ventas": [],
        "caja": {
            "estado": "cerrada",
            "saldo_inicial": 0,
            "ingresos": 0,
            "egresos": 0,
            "saldo_actual": 0,
        },
        "inventario": {
            "total_productos": 0,
            "stock_critico": 0,
            "valor_inventario": 0.0,
        },
        "top_productos": [],
        "alertas": [
            {
                "tipo": "WARNING",
                "mensaje": "No se pudo conectar con el backend de ALVENT. Se muestra vista de contingencia.",
            }
        ],
    }


def _alvent_productos_fallback_payload() -> list[dict[str, object]]:
    return []


def _alvent_producto_created_fallback_payload(payload: dict[str, object]) -> dict[str, object]:
    codigo = str(payload.get("codigo") or "TEMP-0001").strip() or "TEMP-0001"
    nombre = str(payload.get("nombre") or "Producto contingencia").strip() or "Producto contingencia"

    def _num(name: str, default: float = 0.0) -> float:
        raw = payload.get(name)
        try:
            return float(raw) if raw is not None else float(default)
        except Exception:
            return float(default)

    return {
        "id": 0,
        "codigo": codigo,
        "nombre": nombre,
        "categoria": str(payload.get("categoria") or "").strip(),
        "marca": str(payload.get("marca") or "").strip(),
        "talla": str(payload.get("talla") or "").strip() or None,
        "color": str(payload.get("color") or "").strip() or None,
        "sexo": str(payload.get("sexo") or "").strip() or None,
        "costo": _num("costo", 0),
        "precio": _num("precio", 0),
        "stock": int(_num("stock", 0)),
        "stock_minimo": int(_num("stock_minimo", 0)),
        "foto": str(payload.get("foto") or "").strip(),
        "atributos_extra": payload.get("atributos_extra") if isinstance(payload.get("atributos_extra"), dict) else {},
    }


def _alvent_producto_upload_fallback_payload() -> dict[str, object]:
    return {
        "url": "/uploads/productos/contingencia.png",
    }


def _alvent_productos_tabla_config_fallback_payload(overrides: dict[str, object] | None = None) -> dict[str, object]:
    default_config: dict[str, object] = {
        "ok": True,
        "mensaje": "Configuracion de tabla en modo contingencia",
        "negocio_id": 0,
        "tipo_negocio": "",
        "columnas_custom": [],
        "tipos_custom": [],
        "columnas_visibles": [
            "codigo",
            "foto",
            "costo",
            "precio",
            "utilidad",
            "nombre",
            "margen",
            "stock",
            "estado",
            "acciones",
        ],
    }

    if not overrides:
        return default_config

    if "tipo_negocio" in overrides:
        default_config["tipo_negocio"] = str(overrides.get("tipo_negocio") or "").strip()

    columnas_custom = overrides.get("columnas_custom")
    if isinstance(columnas_custom, list):
        default_config["columnas_custom"] = [item for item in columnas_custom if isinstance(item, dict)]

    tipos_custom = overrides.get("tipos_custom")
    if isinstance(tipos_custom, list):
        default_config["tipos_custom"] = [str(item).strip() for item in tipos_custom if str(item).strip()]

    columnas_visibles = overrides.get("columnas_visibles")
    if isinstance(columnas_visibles, list):
        default_config["columnas_visibles"] = [str(item).strip() for item in columnas_visibles if str(item).strip()]

    return default_config


def _alvent_negocios_fallback_payload() -> list[dict[str, object]]:
    return [
        {
            "id": 0,
            "nombre": "Negocio en contingencia",
            "tipo": "otro",
            "plan": "GRATUITO",
            "descripcion": "Modo contingencia ALVENT",
            "logo_url": None,
        }
    ]


def _alvent_planes_catalogo_fallback_payload() -> dict[str, object]:
    return {
        "planes": [
            {
                "codigo": "GRATUITO",
                "nombre": "Gratuito",
                "usuarios_limite": 1,
                "reportes_habilitado": False,
                "reportes_limite": 0,
                "backups_habilitado": False,
                "backups_limite": 0,
            },
            {
                "codigo": "BASICO",
                "nombre": "Basico",
                "usuarios_limite": 3,
                "reportes_habilitado": True,
                "reportes_limite": 10,
                "backups_habilitado": False,
                "backups_limite": 0,
            },
            {
                "codigo": "LITE",
                "nombre": "Lite",
                "usuarios_limite": 6,
                "reportes_habilitado": True,
                "reportes_limite": 30,
                "backups_habilitado": True,
                "backups_limite": 10,
            },
            {
                "codigo": "PRO",
                "nombre": "Pro",
                "usuarios_limite": 15,
                "reportes_habilitado": True,
                "reportes_limite": 120,
                "backups_habilitado": True,
                "backups_limite": 60,
            },
            {
                "codigo": "PREMIUM",
                "nombre": "Premium",
                "usuarios_limite": None,
                "reportes_habilitado": True,
                "reportes_limite": None,
                "backups_habilitado": True,
                "backups_limite": None,
            },
        ]
    }


def _alvent_negocio_detail_fallback_payload(negocio_id: int) -> dict[str, object]:
    return {
        "id": int(negocio_id),
        "nombre": "Empresa Demo ALVENT",
        "tipo": "tienda",
        "plan": "GRATUITO",
        "descripcion": "Modo contingencia ALVENT",
        "logo_url": None,
        "ruc": None,
        "razon_social": None,
        "documento_propietario": None,
        "email": None,
        "telefono": None,
        "whatsapp": None,
        "pais": "Peru",
        "departamento": None,
        "provincia": None,
        "distrito": None,
        "direccion": None,
        "codigo_postal": None,
        "moneda": "PEN",
        "zona_horaria": "America/Lima",
        "idioma": "es",
    }


def _alvent_plan_limites_fallback_payload(negocio_id: int) -> dict[str, object]:
    return {
        "negocio_id": int(negocio_id),
        "plan": "GRATUITO",
        "usuarios": {"consumidos": 1, "limite": 1, "disponibles": 0, "habilitado": True},
        "reportes": {"consumidos": 0, "limite": 0, "disponibles": 0, "habilitado": False},
        "backups": {"consumidos": 0, "limite": 0, "disponibles": 0, "habilitado": False},
    }


def _alvent_plan_montos_fallback_payload(negocio_id: int) -> dict[str, object]:
    return {
        "negocio_id": int(negocio_id),
        "montos": {
            "gratuito": 0,
            "prueba": 15,
            "basico": 20,
            "lite": 35,
            "pro": 45,
            "premium": 65,
        },
    }


def _alvent_plan_gratuito_bondades_fallback_payload() -> dict[str, object]:
    return {
        "usuarios_limite": 1,
        "reportes_habilitado": False,
        "reportes_limite": 0,
        "backups_habilitado": False,
        "backups_limite": 0,
        "custom": {
            "usuarios_limite": 1,
            "reportes_habilitado": False,
            "reportes_limite": 0,
            "backups_habilitado": False,
            "backups_limite": 0,
        },
    }


def _alvent_cuentas_cobro_fallback_payload(negocio_id: int) -> dict[str, object]:
    return {
        "negocio_id": int(negocio_id),
        "cuentas": {
            "transferencia": {
                "titulo": "Cuenta bancaria para transferencia",
                "detalle": [
                    "Banco: BCP",
                    "Titular: RENSOF S.A.C.",
                    "Cuenta corriente: 191-2587456-0-21",
                    "CCI: 00219100258745602137",
                ],
            },
            "tarjeta": {
                "titulo": "Pago con tarjeta (alineado a cuenta bancaria)",
                "detalle": [
                    "Deposita el abono en la misma cuenta bancaria oficial de ALVENT ERP PRO.",
                    "Banco: BCP - Cuenta corriente 191-2587456-0-21",
                    "CCI: 00219100258745602137",
                ],
            },
            "yape": {
                "titulo": "Yape",
                "detalle": [
                    "Numero de abono Yape: 987 654 321",
                    "Titular: RENSOF S.A.C.",
                ],
            },
            "plin": {
                "titulo": "Plin",
                "detalle": [
                    "Numero de abono Plin: 987 654 321",
                    "Titular: RENSOF S.A.C.",
                ],
            },
        },
    }


def _alvent_planes_historial_fallback_payload(negocio_id: int) -> list[dict[str, object]]:
    return list(ALVENT_PLAN_PAYMENTS_FALLBACK.get(int(negocio_id), []))


def _alvent_planes_historial_add_fallback(
    negocio_id: int,
    plan_objetivo: str,
    referencia_pago: str,
    canal_pago: str,
    comprobante_url: str | None,
) -> dict[str, object]:
    negocio_key = int(negocio_id)
    historial = ALVENT_PLAN_PAYMENTS_FALLBACK.setdefault(negocio_key, [])
    nuevo_id = int(historial[0]["id"]) + 1 if historial else 1
    item = {
        "id": nuevo_id,
        "usuario_id": 2,
        "plan_actual": "GRATUITO",
        "plan_solicitado": str(plan_objetivo or "PRO").upper(),
        "canal_pago": str(canal_pago or "transferencia").lower(),
        "referencia_pago": str(referencia_pago or f"REF-{nuevo_id:04d}").upper(),
        "observaciones": "Solicitud en modo contingencia",
        "comprobante_url": comprobante_url or "/uploads/planes/contingencia.png",
        "estado": "PENDIENTE_VALIDACION",
        "fecha": datetime.utcnow().isoformat(),
    }
    historial.insert(0, item)
    return item


def _alvent_planes_historial_validar_fallback(
    negocio_id: int,
    plan_pago_id: int,
    accion: str,
) -> dict[str, object]:
    historial = ALVENT_PLAN_PAYMENTS_FALLBACK.get(int(negocio_id), [])
    target = next((item for item in historial if int(item.get("id", 0)) == int(plan_pago_id)), None)
    if not target:
        return {
            "ok": False,
            "mensaje": "Pago no encontrado",
            "plan_pago_id": int(plan_pago_id),
            "estado": "NO_ENCONTRADO",
            "plan_solicitado": "-",
        }

    acc = str(accion or "").upper()
    target["estado"] = "APLICADO" if acc == "APROBAR" else "RECHAZADO"
    return {
        "ok": True,
        "mensaje": "Pago aprobado y plan activado" if acc == "APROBAR" else "Pago rechazado",
        "plan_pago_id": int(plan_pago_id),
        "estado": target["estado"],
        "plan_solicitado": str(target.get("plan_solicitado") or "-"),
    }


def _alvent_usuarios_fallback_payload() -> list[dict[str, object]]:
    return [
        {
            "id": 1,
            "nombres": "Administrador contingencia",
            "usuario": "admin",
            "dni": None,
            "email": "admin@rensof.pe",
            "rol": "ADMINISTRADOR",
            "roles": ["ADMINISTRADOR"],
            "activo": True,
        }
    ]


def _alvent_usuario_created_fallback_payload(payload: dict[str, object]) -> dict[str, object]:
    nombres = str(payload.get("nombres") or "Usuario contingencia").strip() or "Usuario contingencia"
    usuario = str(payload.get("usuario") or "usuario.contingencia").strip() or "usuario.contingencia"
    email = str(payload.get("email") or "usuario@rensof.pe").strip() or "usuario@rensof.pe"
    roles_raw = payload.get("roles")
    roles = [str(item).upper().strip() for item in roles_raw] if isinstance(roles_raw, list) else []
    if not roles:
        rol = str(payload.get("rol") or "CAJERO").upper().strip() or "CAJERO"
        roles = [rol]

    return {
        "id": 0,
        "nombres": nombres,
        "usuario": usuario,
        "dni": str(payload.get("dni") or "").strip() or None,
        "email": email,
        "rol": roles[0],
        "roles": roles,
        "activo": True,
    }


def _alvent_usuario_updated_fallback_payload(usuario_id: int, payload: dict[str, object]) -> dict[str, object]:
    nombres = str(payload.get("nombres") or "Usuario actualizado").strip() or "Usuario actualizado"
    usuario = str(payload.get("usuario") or f"usuario.{usuario_id}").strip() or f"usuario.{usuario_id}"
    email = str(payload.get("email") or "usuario@rensof.pe").strip() or "usuario@rensof.pe"
    roles_raw = payload.get("roles")
    roles = [str(item).upper().strip() for item in roles_raw] if isinstance(roles_raw, list) else []
    if not roles:
        rol = str(payload.get("rol") or "CAJERO").upper().strip() or "CAJERO"
        roles = [rol]

    return {
        "id": int(usuario_id),
        "nombres": nombres,
        "usuario": usuario,
        "dni": str(payload.get("dni") or "").strip() or None,
        "email": email,
        "rol": roles[0],
        "roles": roles,
        "activo": bool(payload.get("activo", True)),
    }


def _alvent_usuario_toggle_estado_fallback_payload(usuario_id: int) -> dict[str, object]:
    return {
        "ok": True,
        "mensaje": "Estado actualizado en modo contingencia",
        "usuario_id": int(usuario_id),
    }


def _alvent_usuario_delete_fallback_payload(usuario_id: int) -> dict[str, object]:
    return {
        "ok": True,
        "mensaje": "Usuario eliminado en modo contingencia",
        "usuario_id": int(usuario_id),
    }


def _alvent_usuarios_permisos_fallback_payload() -> dict[str, object]:
    return {
        "negocio_id": 0,
        "matriz": {
            "ADMINISTRADOR": [
                "Dashboard",
                "POS",
                "Ventas",
                "Productos",
                "Inventario",
                "Clientes",
                "Cajas",
                "Reportes",
                "Usuarios",
                "Configuracion",
            ],
            "CAJERO": ["Dashboard", "POS", "Ventas", "Clientes"],
            "VENDEDOR": ["Dashboard", "POS", "Ventas", "Clientes"],
            "ALMACEN": ["Dashboard", "Productos", "Inventario"],
        },
    }


def _alvent_ventas_fallback_payload() -> list[dict[str, object]]:
    return []


def _alvent_clientes_fallback_payload() -> list[dict[str, object]]:
    return [
        {
            "id": 1,
            "nombre": "Cliente contingencia",
            "dni": "00000000",
            "telefono": "",
            "email": "cliente@rensof.pe",
        }
    ]


def _alvent_cliente_created_fallback_payload(payload: dict[str, object]) -> dict[str, object]:
    return {
        "id": 100000 + secrets.randbelow(900000),
        "nombre": str(payload.get("nombre") or "Cliente contingencia").strip() or "Cliente contingencia",
        "dni": str(payload.get("dni") or "").strip(),
        "telefono": str(payload.get("telefono") or "").strip(),
        "email": str(payload.get("email") or "").strip(),
    }


def _alvent_cliente_updated_fallback_payload(cliente_id: int, payload: dict[str, object]) -> dict[str, object]:
    return {
        "id": int(cliente_id),
        "nombre": str(payload.get("nombre") or f"Cliente {cliente_id}").strip() or f"Cliente {cliente_id}",
        "dni": str(payload.get("dni") or "").strip(),
        "telefono": str(payload.get("telefono") or "").strip(),
        "email": str(payload.get("email") or "").strip(),
    }


def _alvent_cliente_delete_fallback_payload(cliente_id: int) -> dict[str, object]:
    return {
        "ok": True,
        "mensaje": "Cliente eliminado en modo contingencia",
        "cliente_id": int(cliente_id),
    }


def _alvent_ventas_resumen_fallback_payload() -> dict[str, object]:
    return {
        "hoy": {"ventas": 0, "monto": 0.0},
        "semana": {"ventas": 0, "monto": 0.0},
        "mes": {"ventas": 0, "monto": 0.0},
        "anio": {"ventas": 0, "monto": 0.0},
    }


def _alvent_ventas_reporte_fallback_payload() -> dict[str, object]:
    return {
        "total_ventas": 0.0,
        "total_costos": 0.0,
        "ganancia_total": 0.0,
        "detalle": [],
    }


def _fallback_headers(reason: str) -> dict[str, str]:
    return {"x-alvent-fallback-reason": reason[:120]}


def _render_alvent_dashboard_fallback(request: Request, reason: str = "unknown") -> Response:
    return templates.TemplateResponse(
        request,
        "alvent_dashboard_fallback.html",
        {
            "active_page": "servicios",
            "page_title": "Dashboard ALVENT ERP PRO | RENSOF",
            "page_description": "Panel de contingencia de ALVENT ERP PRO cuando el frontend dedicado no esta disponible.",
            "alvent_login_url": _alvent_frontend_url("alven/app/login"),
            "alvent_dashboard_url": _alvent_frontend_url("alven/app/dashboard"),
        },
        headers=_fallback_headers(reason),
    )

@router.get("/", response_class=HTMLResponse)
def home(request: Request, sent: int = Query(default=0)):
    with SessionLocal() as session:
        content = get_home_content(session)
        primary_email = get_primary_email_account(session)
    base_url = str(request.base_url).rstrip("/")
    return templates.TemplateResponse(
        request,
        "home.html",
        {
            "content": content,
            "primary_email": primary_email,
            "message_sent": bool(sent),
            "active_page": "inicio",
            "page_title": "RENSOF | Plataforma de Inteligencia Estrategica",
            "page_description": (
                "RENSOF es una plataforma de inteligencia estrategica que transforma datos "
                "en decisiones estrategicas para organizaciones de Latinoamerica."
            ),
            "page_og_title": "RENSOF | Plataforma de Inteligencia Estrategica",
            "page_og_description": "Tecnologia, analitica y aplicaciones especializadas para transformar informacion en decisiones con impacto real.",
            "page_og_url": f"{base_url}/",
            "page_og_image": f"{base_url}/assets/img/og-rensof-social.svg?v=20260702b",
        },
    )


@router.get("/servicios", response_class=HTMLResponse)
def servicios(request: Request):
    return RedirectResponse(url="/alven", status_code=307)


@router.get("/alven", response_class=HTMLResponse)
def alven(request: Request):
    base_url = str(request.base_url).rstrip("/")
    return templates.TemplateResponse(
        request,
        "alvent.html",
        {
            "active_page": "servicios",
            "page_title": "ALVENT ERP PRO | RENSOF",
            "page_description": "Acceso y vista previa de ALVENT ERP PRO dentro del ecosistema RENSOF.",
            "page_og_title": "ALVENT ERP PRO | Producto principal de RENSOF",
            "page_og_description": "Opera ventas, inventario, caja y reportes desde una misma plataforma con velocidad, control y escalabilidad.",
            "page_og_url": f"{base_url}/alven",
            "page_og_image": f"{base_url}/assets/img/og-alvent-social.svg?v=20260702b",
            "alvent_app_url": ALVENT_APP_URL,
        },
    )


@router.get("/alven/app/login", response_class=HTMLResponse, response_model=None)
async def alven_app_login(request: Request) -> Response:
    redirect = _local_frontend_redirect(request, "login")
    if redirect is not None:
        return redirect

    fallback_reason = "unknown"
    try:
        proxied_response = await _proxy_alvent_frontend_request(request, "login")
        if _is_usable_upstream_response(proxied_response.status_code) and not _looks_like_render_loading_page(proxied_response):
            return proxied_response
        fallback_reason = (
            "render_loading" if _looks_like_render_loading_page(proxied_response)
            else f"upstream_status_{proxied_response.status_code}"
        )
    except httpx.RequestError:
        fallback_reason = "request_error"

    if not _is_html_navigation_request(request):
        return _frontend_unavailable_response()
    response = _redirect_to_real_alvent_frontend(request, "login")
    response.headers.update(_fallback_headers(fallback_reason))
    return response


@router.get("/alvent", response_model=None)
def alvent_legacy_redirect() -> Response:
    return RedirectResponse("/alven", status_code=308)


@router.get("/favicon.ico", response_model=None)
def root_favicon_redirect() -> Response:
    return RedirectResponse("/alven/app/favicon.ico", status_code=308)


@router.get("/alven/app/favicon.ico", response_model=None)
def alven_app_favicon() -> Response:
    if ALVENT_FRONTEND_FAVICON_PATH.is_file():
        return FileResponse(
            path=ALVENT_FRONTEND_FAVICON_PATH,
            media_type="image/x-icon",
            filename="favicon.ico",
        )
    return Response(status_code=404)


@router.api_route(
    "/alven/app",
    methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
    response_model=None,
)
async def alven_app_root_proxy(request: Request) -> Response:
    redirect = _local_frontend_redirect(request)
    if redirect is not None:
        return redirect

    fallback_reason = "unknown"
    try:
        proxied_response = await _proxy_alvent_frontend_request(request)
        if _is_usable_upstream_response(proxied_response.status_code) and not _looks_like_render_loading_page(proxied_response):
            if _is_html_navigation_request(request):
                return _disable_cache(proxied_response)
            return proxied_response
        if proxied_response.status_code == 429 and _is_html_navigation_request(request):
            return _disable_cache(_render_alvent_dashboard_fallback(request, reason="upstream_status_429"))
        fallback_reason = (
            "render_loading" if _looks_like_render_loading_page(proxied_response)
            else f"upstream_status_{proxied_response.status_code}"
        )
    except httpx.RequestError:
        fallback_reason = "request_error"

    if not _is_html_navigation_request(request):
        return _frontend_unavailable_response()
    response = _redirect_to_real_alvent_frontend(request)
    response.headers.update(_fallback_headers(fallback_reason))
    return response


@router.api_route(
    "/alven/app/alven/app",
    methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
    response_model=None,
)
@router.api_route(
    "/alven/app/alven/app/{full_path:path}",
    methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
    response_model=None,
)
async def alven_app_double_prefix_redirect(request: Request, full_path: str = "") -> Response:
    canonical = "/alven/app"
    if full_path:
        canonical = f"{canonical}/{full_path.lstrip('/')}"
    if request.url.query:
        canonical = f"{canonical}?{request.url.query}"
    return _disable_cache(RedirectResponse(canonical, status_code=308))


@router.api_route(
    "/alven/app/{full_path:path}",
    methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
    response_model=None,
)
async def alven_app_proxy(full_path: str, request: Request) -> Response:
    redirect = _local_frontend_redirect(request, full_path)
    if redirect is not None:
        return redirect

    fallback_reason = "unknown"
    try:
        proxied_response = await _proxy_alvent_frontend_request(request, full_path)
        full_path_normalized = full_path.strip("/").lower()
        if full_path_normalized == "dashboard" and proxied_response.status_code == 429:
            return _disable_cache(_render_alvent_dashboard_fallback(request, reason="upstream_status_429"))
        if _is_usable_upstream_response(proxied_response.status_code) and not _looks_like_render_loading_page(proxied_response):
            if _is_html_navigation_request(request):
                return _disable_cache(proxied_response)
            return proxied_response
        fallback_reason = (
            "render_loading" if _looks_like_render_loading_page(proxied_response)
            else f"upstream_status_{proxied_response.status_code}"
        )
    except httpx.RequestError:
        fallback_reason = "request_error"

    if not _is_html_navigation_request(request):
        return _frontend_unavailable_response()

    response = _redirect_to_real_alvent_frontend(request, full_path)
    response.headers.update(_fallback_headers(fallback_reason))
    return response


@router.api_route(
    "/alven/api/auth/login",
    methods=["POST"],
    response_model=None,
)
async def alven_api_login_proxy_or_fallback(request: Request) -> Response:
    backend_origin = _backend_origin_for_request(request)
    is_local = _is_local_request(request)
    try:
        proxied = await _proxy_request(request, backend_origin, "auth/login")
        if _is_usable_upstream_response(proxied.status_code):
            return proxied
        if not is_local:
            return proxied
    except httpx.RequestError:
        if not is_local:
            return _upstream_unavailable_response()

    payload = await request.json()
    usuario = str(payload.get("usuario") or "").strip()
    password = str(payload.get("password") or "")

    if not secrets.compare_digest(usuario.lower(), ALVENT_FALLBACK_USER.lower()):
        return JSONResponse({"detail": "Usuario incorrecto"}, status_code=401)

    if not secrets.compare_digest(password, ALVENT_FALLBACK_PASSWORD):
        return JSONResponse({"detail": "Contrasena incorrecta"}, status_code=401)

    return JSONResponse(_alvent_fallback_auth_payload(usuario))


@router.api_route(
    "/alven/api/dashboard/overview",
    methods=["GET"],
    response_model=None,
)
async def alven_api_dashboard_overview_proxy_or_fallback(request: Request) -> Response:
    backend_origin = _backend_origin_for_request(request)
    try:
        proxied = await _proxy_request(request, backend_origin, "dashboard/overview")
        if _is_usable_upstream_response(proxied.status_code):
            return proxied
    except httpx.RequestError:
        pass

    return JSONResponse(_alvent_dashboard_overview_fallback_payload(), status_code=200)


@router.api_route(
    "/alven/api/productos/",
    methods=["GET", "POST", "OPTIONS"],
    response_model=None,
)
async def alven_api_productos_proxy_or_fallback(request: Request) -> Response:
    backend_origin = _backend_origin_for_request(request)
    try:
        proxied = await _proxy_request(request, backend_origin, "productos/")
        if _is_usable_upstream_response(proxied.status_code):
            return proxied
    except httpx.RequestError:
        pass

    if request.method == "OPTIONS":
        return Response(status_code=204)

    if request.method == "POST":
        payload: dict[str, object] = {}
        try:
            payload = await request.json()
        except Exception:
            payload = {}
        return JSONResponse(_alvent_producto_created_fallback_payload(payload), status_code=200)

    return JSONResponse(_alvent_productos_fallback_payload(), status_code=200)


@router.api_route(
    "/alven/api/productos/upload",
    methods=["POST", "OPTIONS"],
    response_model=None,
)
async def alven_api_productos_upload_proxy_or_fallback(request: Request) -> Response:
    backend_origin = _backend_origin_for_request(request)
    try:
        proxied = await _proxy_request(request, backend_origin, "productos/upload")
        if _is_usable_upstream_response(proxied.status_code):
            return proxied
    except httpx.RequestError:
        pass

    if request.method == "OPTIONS":
        return Response(status_code=204)

    return JSONResponse(_alvent_producto_upload_fallback_payload(), status_code=200)


@router.api_route(
    "/alven/api/productos/tabla-config",
    methods=["GET", "PUT", "OPTIONS"],
    response_model=None,
)
async def alven_api_productos_tabla_config_proxy_or_fallback(request: Request) -> Response:
    backend_origin = _backend_origin_for_request(request)
    try:
        proxied = await _proxy_request(request, backend_origin, "productos/tabla-config")
        if _is_usable_upstream_response(proxied.status_code):
            return proxied
    except httpx.RequestError:
        pass

    if request.method == "OPTIONS":
        return Response(status_code=204)

    if request.method == "GET":
        return JSONResponse(_alvent_productos_tabla_config_fallback_payload(), status_code=200)

    payload: dict[str, object] = {}
    try:
        payload = await request.json()
    except Exception:
        payload = {}

    fallback = _alvent_productos_tabla_config_fallback_payload(payload)
    fallback["ok"] = True
    fallback["mensaje"] = "Configuracion guardada en modo contingencia"
    return JSONResponse(fallback, status_code=200)


@router.api_route(
    "/alven/api/ventas/",
    methods=["GET"],
    response_model=None,
)
async def alven_api_ventas_proxy_or_fallback(request: Request) -> Response:
    backend_origin = _backend_origin_for_request(request)
    try:
        proxied = await _proxy_request(request, backend_origin, "ventas/")
        if _is_usable_upstream_response(proxied.status_code):
            return proxied
    except httpx.RequestError:
        pass

    return JSONResponse(_alvent_ventas_fallback_payload(), status_code=200)


@router.api_route(
    "/alven/api/clientes/",
    methods=["GET", "POST", "OPTIONS"],
    response_model=None,
)
async def alven_api_clientes_proxy_or_fallback(request: Request) -> Response:
    return await _alven_api_clientes_collection_fallback_only(request)


@router.api_route(
    "/alven/api/clientes",
    methods=["GET", "POST", "OPTIONS"],
    response_model=None,
)
async def alven_api_clientes_no_slash_proxy_or_fallback(request: Request) -> Response:
    return await _alven_api_clientes_collection_fallback_only(request)


async def _alven_api_clientes_collection_fallback_only(request: Request) -> Response:

    if request.method == "OPTIONS":
        return Response(status_code=204)

    if request.method == "POST":
        payload: dict[str, object] = {}
        try:
            payload = await request.json()
        except Exception:
            payload = {}
        return JSONResponse(_alvent_cliente_created_fallback_payload(payload), status_code=200)

    clientes = _alvent_clientes_fallback_payload()
    buscar = str(request.query_params.get("buscar") or "").strip().lower()
    if buscar:
        clientes = [
            item
            for item in clientes
            if buscar in str(item.get("nombre") or "").lower()
            or buscar in str(item.get("dni") or "").lower()
            or buscar in str(item.get("email") or "").lower()
        ]

    return JSONResponse(clientes, status_code=200)


@router.api_route(
    "/alven/api/clientes/{cliente_id}",
    methods=["PUT", "DELETE", "OPTIONS"],
    response_model=None,
)
async def alven_api_cliente_item_proxy_or_fallback(cliente_id: int, request: Request) -> Response:
    # Mantener operativa la pantalla de clientes aun cuando el backend dedicado falle.

    if request.method == "OPTIONS":
        return Response(status_code=204)

    if request.method == "DELETE":
        return JSONResponse(_alvent_cliente_delete_fallback_payload(cliente_id), status_code=200)

    payload: dict[str, object] = {}
    try:
        payload = await request.json()
    except Exception:
        payload = {}

    return JSONResponse(_alvent_cliente_updated_fallback_payload(cliente_id, payload), status_code=200)


@router.api_route(
    "/alven/api/negocios/",
    methods=["GET"],
    response_model=None,
)
async def alven_api_negocios_proxy_or_fallback(request: Request) -> Response:
    backend_origin = _backend_origin_for_request(request)
    try:
        proxied = await _proxy_request(request, backend_origin, "negocios/")
        if _is_usable_upstream_response(proxied.status_code):
            return proxied
    except httpx.RequestError:
        pass

    return JSONResponse(_alvent_negocios_fallback_payload(), status_code=200)


@router.api_route(
    "/alven/api/negocios/{negocio_id}",
    methods=["GET", "PUT", "OPTIONS"],
    response_model=None,
)
async def alven_api_negocio_detail_proxy_or_fallback(negocio_id: int, request: Request) -> Response:
    backend_origin = _backend_origin_for_request(request)
    try:
        proxied = await _proxy_request(request, backend_origin, f"negocios/{negocio_id}")
        if _is_usable_upstream_response(proxied.status_code):
            return proxied
    except httpx.RequestError:
        pass

    if request.method == "OPTIONS":
        return Response(status_code=204)

    if request.method == "PUT":
        payload: dict[str, object] = {}
        try:
            payload = await request.json()
        except Exception:
            payload = {}
        base = _alvent_negocio_detail_fallback_payload(negocio_id)
        for key, value in payload.items():
            base[str(key)] = value
        return JSONResponse(base, status_code=200)

    return JSONResponse(_alvent_negocio_detail_fallback_payload(negocio_id), status_code=200)


@router.api_route(
    "/alven/api/negocios/{negocio_id}/{subpath:path}",
    methods=["GET", "POST", "PUT", "PATCH", "OPTIONS"],
    response_model=None,
)
async def alven_api_negocios_subpath_proxy_or_fallback(
    negocio_id: int,
    subpath: str,
    request: Request,
) -> Response:
    backend_origin = _backend_origin_for_request(request)
    target_path = f"negocios/{negocio_id}/{subpath.strip('/')}"
    try:
        proxied = await _proxy_request(request, backend_origin, target_path)
        if _is_usable_upstream_response(proxied.status_code):
            return proxied
    except httpx.RequestError:
        pass

    if request.method == "OPTIONS":
        return Response(status_code=204)

    normalized = subpath.strip("/").lower()

    if normalized == "plan-limites":
        return JSONResponse(_alvent_plan_limites_fallback_payload(negocio_id), status_code=200)

    if normalized == "planes/catalogo-editable":
        catalogo = _alvent_planes_catalogo_fallback_payload()
        return JSONResponse({"negocio_id": int(negocio_id), "planes": catalogo["planes"]}, status_code=200)

    if normalized == "plan-gratuito-bondades":
        if request.method == "PUT":
            return JSONResponse({"ok": True, "mensaje": "Bondades actualizadas", **_alvent_plan_gratuito_bondades_fallback_payload()}, status_code=200)
        return JSONResponse(_alvent_plan_gratuito_bondades_fallback_payload(), status_code=200)

    if normalized == "planes/montos":
        if request.method == "PUT":
            payload: dict[str, object] = {}
            try:
                payload = await request.json()
            except Exception:
                payload = {}
            base = _alvent_plan_montos_fallback_payload(negocio_id)
            if isinstance(payload, dict):
                for key, value in payload.items():
                    if key in base["montos"]:
                        base["montos"][key] = value
            return JSONResponse({"ok": True, "mensaje": "Montos de planes actualizados", "montos": base["montos"]}, status_code=200)
        return JSONResponse(_alvent_plan_montos_fallback_payload(negocio_id), status_code=200)

    if normalized == "planes/cuentas-cobro":
        if request.method == "PUT":
            payload: dict[str, object] = {}
            try:
                payload = await request.json()
            except Exception:
                payload = {}
            fallback = _alvent_cuentas_cobro_fallback_payload(negocio_id)
            cuentas = payload if isinstance(payload, dict) else {}
            return JSONResponse({"ok": True, "mensaje": "Cuentas para pago actualizadas", "negocio_id": int(negocio_id), "cuentas": cuentas or fallback["cuentas"]}, status_code=200)
        return JSONResponse(_alvent_cuentas_cobro_fallback_payload(negocio_id), status_code=200)

    if normalized == "planes/historial":
        return JSONResponse(_alvent_planes_historial_fallback_payload(negocio_id), status_code=200)

    if normalized == "planes/comprobante" and request.method == "POST":
        return JSONResponse({"url": f"/uploads/planes/plan_pago_{int(negocio_id)}_contingencia.png"}, status_code=200)

    if normalized == "solicitar-plan" and request.method == "POST":
        payload: dict[str, object] = {}
        try:
            payload = await request.json()
        except Exception:
            payload = {}
        nuevo = _alvent_planes_historial_add_fallback(
            negocio_id=negocio_id,
            plan_objetivo=str(payload.get("plan_objetivo") or "PRO"),
            referencia_pago=str(payload.get("referencia_pago") or "REF-0001"),
            canal_pago=str(payload.get("canal_pago") or "transferencia"),
            comprobante_url=str(payload.get("comprobante_url") or "").strip() or None,
        )
        return JSONResponse(
            {
                "ok": True,
                "mensaje": "Pago registrado en revision manual. El plan se activara tras la validacion antifraude.",
                "plan_actual": str(nuevo["plan_actual"]),
                "plan_solicitado": str(nuevo["plan_solicitado"]),
                "referencia_pago": str(nuevo["referencia_pago"]),
                "estado": str(nuevo["estado"]),
                "validacion_modo_solicitada": "MANUAL",
                "validacion_modo_aplicada": "MANUAL",
                "riesgo_score": 2,
                "riesgo_nivel": "BAJO",
            },
            status_code=200,
        )

    if normalized.startswith("planes/historial/") and normalized.endswith("/validar") and request.method == "PATCH":
        plan_pago_id_raw = normalized.replace("planes/historial/", "").replace("/validar", "")
        try:
            plan_pago_id = int(plan_pago_id_raw)
        except Exception:
            plan_pago_id = 0
        payload: dict[str, object] = {}
        try:
            payload = await request.json()
        except Exception:
            payload = {}
        accion = str(payload.get("accion") or "RECHAZAR")
        data = _alvent_planes_historial_validar_fallback(negocio_id, plan_pago_id, accion)
        status = 200 if bool(data.get("ok")) else 404
        return JSONResponse(data, status_code=status)

    if normalized == "simulador/escenarios":
        if request.method == "PUT":
            payload: dict[str, object] = {}
            try:
                payload = await request.json()
            except Exception:
                payload = {}
            escenarios = payload.get("escenarios") if isinstance(payload, dict) else []
            if not isinstance(escenarios, list):
                escenarios = []
            return JSONResponse({"ok": True, "mensaje": "Escenarios del simulador actualizados", "escenarios": escenarios}, status_code=200)
        return JSONResponse({"negocio_id": int(negocio_id), "escenarios": []}, status_code=200)

    return JSONResponse({"detail": f"Fallback no implementado para /negocios/{negocio_id}/{subpath}"}, status_code=404)


@router.api_route(
    "/alven/api/negocios/planes/catalogo",
    methods=["GET"],
    response_model=None,
)
async def alven_api_negocios_planes_catalogo_proxy_or_fallback(request: Request) -> Response:
    backend_origin = _backend_origin_for_request(request)
    try:
        proxied = await _proxy_request(request, backend_origin, "negocios/planes/catalogo")
        if _is_usable_upstream_response(proxied.status_code):
            return proxied
    except httpx.RequestError:
        pass

    return JSONResponse(_alvent_planes_catalogo_fallback_payload(), status_code=200)


@router.api_route(
    "/alven/api/usuarios/",
    methods=["GET", "POST", "OPTIONS"],
    response_model=None,
)
async def alven_api_usuarios_proxy_or_fallback(request: Request) -> Response:
    backend_origin = _backend_origin_for_request(request)
    is_local = _is_local_request(request)
    try:
        proxied = await _proxy_request(request, backend_origin, "usuarios/")
        if _is_usable_upstream_response(proxied.status_code):
            return proxied
        if not is_local:
            return proxied
    except httpx.RequestError:
        if not is_local:
            return _upstream_unavailable_response()

    if request.method == "OPTIONS":
        return Response(status_code=204)

    if request.method == "POST":
        payload: dict[str, object] = {}
        try:
            payload = await request.json()
        except Exception:
            payload = {}
        return JSONResponse(_alvent_usuario_created_fallback_payload(payload), status_code=200)

    return JSONResponse(_alvent_usuarios_fallback_payload(), status_code=200)


@router.api_route(
    "/alven/api/usuarios/permisos-matriz",
    methods=["GET", "PUT", "OPTIONS"],
    response_model=None,
)
async def alven_api_usuarios_permisos_proxy_or_fallback(request: Request) -> Response:
    backend_origin = _backend_origin_for_request(request)
    is_local = _is_local_request(request)
    try:
        proxied = await _proxy_request(request, backend_origin, "usuarios/permisos-matriz")
        if _is_usable_upstream_response(proxied.status_code):
            return proxied
        if not is_local:
            return proxied
    except httpx.RequestError:
        if not is_local:
            return _upstream_unavailable_response()

    if request.method == "OPTIONS":
        return Response(status_code=204)

    fallback = _alvent_usuarios_permisos_fallback_payload()
    if request.method == "PUT":
        payload: dict[str, object] = {}
        try:
            payload = await request.json()
        except Exception:
            payload = {}
        matriz = payload.get("matriz")
        if isinstance(matriz, dict):
            fallback["matriz"] = {
                str(k): [str(item) for item in v] if isinstance(v, list) else []
                for k, v in matriz.items()
            }
        response_payload = {
            "ok": True,
            "mensaje": "Matriz de permisos guardada en modo contingencia",
            "negocio_id": fallback["negocio_id"],
            "matriz": fallback["matriz"],
        }
        return JSONResponse(response_payload, status_code=200)

    return JSONResponse(fallback, status_code=200)


@router.api_route(
    "/alven/api/usuarios/{usuario_id}",
    methods=["PATCH", "DELETE", "OPTIONS"],
    response_model=None,
)
async def alven_api_usuario_patch_proxy_or_fallback(usuario_id: int, request: Request) -> Response:
    backend_origin = _backend_origin_for_request(request)
    is_local = _is_local_request(request)
    try:
        proxied = await _proxy_request(request, backend_origin, f"usuarios/{usuario_id}")
        if _is_usable_upstream_response(proxied.status_code):
            return proxied
        if not is_local:
            return proxied
    except httpx.RequestError:
        if not is_local:
            return _upstream_unavailable_response()

    if request.method == "OPTIONS":
        return Response(status_code=204)

    if request.method == "DELETE":
        return JSONResponse(_alvent_usuario_delete_fallback_payload(usuario_id), status_code=200)

    payload: dict[str, object] = {}
    try:
        payload = await request.json()
    except Exception:
        payload = {}

    return JSONResponse(_alvent_usuario_updated_fallback_payload(usuario_id, payload), status_code=200)


@router.api_route(
    "/alven/api/usuarios/{usuario_id}/estado",
    methods=["PATCH", "OPTIONS"],
    response_model=None,
)
async def alven_api_usuario_estado_patch_proxy_or_fallback(usuario_id: int, request: Request) -> Response:
    backend_origin = _backend_origin_for_request(request)
    is_local = _is_local_request(request)
    try:
        proxied = await _proxy_request(request, backend_origin, f"usuarios/{usuario_id}/estado")
        if _is_usable_upstream_response(proxied.status_code):
            return proxied
        if not is_local:
            return proxied
    except httpx.RequestError:
        if not is_local:
            return _upstream_unavailable_response()

    if request.method == "OPTIONS":
        return Response(status_code=204)

    return JSONResponse(_alvent_usuario_toggle_estado_fallback_payload(usuario_id), status_code=200)


@router.api_route(
    "/alven/api/ventas/resumen",
    methods=["GET"],
    response_model=None,
)
async def alven_api_ventas_resumen_proxy_or_fallback(request: Request) -> Response:
    backend_origin = _backend_origin_for_request(request)
    try:
        proxied = await _proxy_request(request, backend_origin, "ventas/resumen")
        if _is_usable_upstream_response(proxied.status_code):
            return proxied
    except httpx.RequestError:
        pass

    return JSONResponse(_alvent_ventas_resumen_fallback_payload(), status_code=200)


@router.api_route(
    "/alven/api/ventas/reporte/ganancias",
    methods=["GET"],
    response_model=None,
)
async def alven_api_ventas_reporte_proxy_or_fallback(request: Request) -> Response:
    backend_origin = _backend_origin_for_request(request)
    try:
        proxied = await _proxy_request(request, backend_origin, "ventas/reporte/ganancias")
        if _is_usable_upstream_response(proxied.status_code):
            return proxied
    except httpx.RequestError:
        pass

    return JSONResponse(_alvent_ventas_reporte_fallback_payload(), status_code=200)


@router.api_route(
    "/alven/api/{full_path:path}",
    methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
    response_model=None,
)
async def alven_api_proxy(full_path: str, request: Request) -> Response:
    backend_origin = _backend_origin_for_request(request)
    return await _proxy_request(request, backend_origin, full_path)


@router.get("/proyectos", response_class=HTMLResponse)
def proyectos(request: Request):
    with SessionLocal() as session:
        content = get_home_content(session)
    return templates.TemplateResponse(
        request,
        "proyectos.html",
        {
            "sectors": content.sectors,
            "cases": content.case_studies,
            "active_page": "proyectos",
            "page_title": "Sectores | RENSOF",
            "page_description": "Implementaciones de inteligencia estrategica por sector.",
        },
    )


@router.get("/nosotros", response_class=HTMLResponse)
def nosotros(request: Request):
    return templates.TemplateResponse(
        request,
        "nosotros.html",
        {
            "active_page": "nosotros",
            "page_title": "Vision 2030 | RENSOF",
            "page_description": "Mision, vision y posicionamiento de RENSOF Intelligence Platform.",
        },
    )


@router.get("/publicaciones", response_class=HTMLResponse)
def publicaciones(request: Request, q: str = Query(default="")):
    with SessionLocal() as session:
        publications = get_publications(session, query=q, status="published")
    return templates.TemplateResponse(
        request,
        "publicaciones.html",
        {
            "publications": publications,
            "search_query": q,
            "total_results": len(publications),
            "active_page": "publicaciones",
            "page_title": "Publicaciones | RENSOF",
            "page_description": "Centro de conocimiento y observatorio de inteligencia estrategica.",
        },
    )


@router.get("/contacto", response_class=HTMLResponse)
def contacto(request: Request, sent: int = Query(default=0)):
    with SessionLocal() as session:
        content = get_home_content(session)
        email_accounts = get_email_accounts(session)
        primary_email = get_primary_email_account(session)
    return templates.TemplateResponse(
        request,
        "contacto.html",
        {
            "products": content.products,
            "email_accounts": email_accounts,
            "primary_email": primary_email,
            "message_sent": bool(sent),
            "active_page": "contacto",
            "page_title": "Contacto | RENSOF",
            "page_description": "Solicita una demo de RENSOF Intelligence Platform.",
        },
    )


@router.post("/contacto/enviar")
def enviar_contacto(
    full_name: str = Form(..., alias="nombre"),
    email: str = Form(...),
    message: str = Form(..., alias="mensaje"),
    redirect_to: str = Form("/contacto"),
    topic: str = Form("", alias="servicio"),
    organization: str = Form("", alias="organizacion"),
    area: str = Form("", alias="sector"),
    assigned_email: str = Form("", alias="canal_correo"),
    source_page: str = Form("contacto"),
):
    with SessionLocal() as session:
        add_contact_message(
            session,
            full_name=full_name,
            email=email,
            organization=organization,
            topic=topic,
            area=area,
            assigned_email=assigned_email,
            message=message,
            source_page=source_page,
        )

    base_redirect, fragment = (redirect_to.split("#", 1) + [""])[:2] if "#" in redirect_to else (redirect_to, "")
    separator = "&" if "?" in base_redirect else "?"
    final_redirect = f"{base_redirect}{separator}sent=1"
    if fragment:
        final_redirect = f"{final_redirect}#{fragment}"
    return RedirectResponse(final_redirect, status_code=303)


@router.get("/{page_name}", response_class=HTMLResponse, response_model=None)
def clean_page(page_name: str) -> Response:
    if page_name.endswith(".html"):
        clean_name = page_name[:-5]
        clean_path = "/" if clean_name == "index" else f"/{clean_name}"
        return RedirectResponse(clean_path, status_code=308)
    raise HTTPException(status_code=404)


