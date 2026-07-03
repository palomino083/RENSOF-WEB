import os
import secrets
import httpx
from fastapi import APIRouter, Form, HTTPException, Query, Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse, Response
from fastapi.templating import Jinja2Templates

from app.core.config import (
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


def _alvent_frontend_url(path: str = "") -> str:
    # Mantener navegacion dentro del mismo host (rensof.pe) para evitar saltos a Render.
    normalized_path = f"/{path.lstrip('/')}" if path else ""
    return normalized_path or "/alven/app/login"


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


def _alvent_ventas_fallback_payload() -> list[dict[str, object]]:
    return []


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


def _render_alvent_dashboard_fallback(request: Request) -> Response:
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
    try:
        proxied_response = await _proxy_alvent_frontend_request(request, "login")
        if proxied_response.status_code < 500 and not _looks_like_render_loading_page(proxied_response):
            return proxied_response
    except httpx.RequestError:
        pass

    if not _is_html_navigation_request(request):
        return _frontend_unavailable_response()

    return templates.TemplateResponse(
        request,
        "alvent_login_fallback.html",
        {
            "active_page": "servicios",
            "page_title": "Login ALVENT ERP PRO | RENSOF",
            "page_description": "Acceso de contingencia a ALVENT ERP PRO cuando el frontend dedicado no esta disponible.",
            "alvent_login_url": _alvent_frontend_url("alven/app/login"),
            "alvent_dashboard_url": _alvent_frontend_url("alven/app/dashboard"),
        },
    )


@router.get("/alvent", response_model=None)
def alvent_legacy_redirect() -> Response:
    return RedirectResponse("/alven", status_code=308)


@router.get("/favicon.ico", response_model=None)
def root_favicon_redirect() -> Response:
    return RedirectResponse("/alven/app/favicon.ico", status_code=308)


@router.api_route(
    "/alven/app",
    methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
    response_model=None,
)
async def alven_app_root_proxy(request: Request) -> Response:
    try:
        return await _proxy_alvent_frontend_request(request)
    except httpx.RequestError:
        if not _is_html_navigation_request(request):
            return _frontend_unavailable_response()
        return RedirectResponse("/alven/app/dashboard", status_code=307)


@router.api_route(
    "/alven/app/{full_path:path}",
    methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
    response_model=None,
)
async def alven_app_proxy(full_path: str, request: Request) -> Response:
    try:
        proxied_response = await _proxy_alvent_frontend_request(request, full_path)
        if proxied_response.status_code < 500 and not _looks_like_render_loading_page(proxied_response):
            return proxied_response
    except httpx.RequestError:
        pass

    if not _is_html_navigation_request(request):
        return _frontend_unavailable_response()

    if full_path.strip("/") == "dashboard":
        return _render_alvent_dashboard_fallback(request)
    return RedirectResponse("/alven/app/login", status_code=307)


@router.api_route(
    "/alven/api/auth/login",
    methods=["POST"],
    response_model=None,
)
async def alven_api_login_proxy_or_fallback(request: Request) -> Response:
    backend_origin = _backend_origin_for_request(request)
    try:
        proxied = await _proxy_request(request, backend_origin, "auth/login")
        if proxied.status_code < 500:
            return proxied
    except httpx.RequestError:
        pass

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
        if proxied.status_code < 500:
            return proxied
    except httpx.RequestError:
        pass

    return JSONResponse(_alvent_dashboard_overview_fallback_payload(), status_code=200)


@router.api_route(
    "/alven/api/productos/",
    methods=["GET"],
    response_model=None,
)
async def alven_api_productos_proxy_or_fallback(request: Request) -> Response:
    backend_origin = _backend_origin_for_request(request)
    try:
        proxied = await _proxy_request(request, backend_origin, "productos/")
        if proxied.status_code < 500:
            return proxied
    except httpx.RequestError:
        pass

    return JSONResponse(_alvent_productos_fallback_payload(), status_code=200)


@router.api_route(
    "/alven/api/productos/tabla-config",
    methods=["GET", "PUT", "OPTIONS"],
    response_model=None,
)
async def alven_api_productos_tabla_config_proxy_or_fallback(request: Request) -> Response:
    backend_origin = _backend_origin_for_request(request)
    try:
        proxied = await _proxy_request(request, backend_origin, "productos/tabla-config")
        if proxied.status_code < 500:
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
        if proxied.status_code < 500:
            return proxied
    except httpx.RequestError:
        pass

    return JSONResponse(_alvent_ventas_fallback_payload(), status_code=200)


@router.api_route(
    "/alven/api/negocios/",
    methods=["GET"],
    response_model=None,
)
async def alven_api_negocios_proxy_or_fallback(request: Request) -> Response:
    backend_origin = _backend_origin_for_request(request)
    try:
        proxied = await _proxy_request(request, backend_origin, "negocios/")
        if proxied.status_code < 500:
            return proxied
    except httpx.RequestError:
        pass

    return JSONResponse(_alvent_negocios_fallback_payload(), status_code=200)


@router.api_route(
    "/alven/api/negocios/planes/catalogo",
    methods=["GET"],
    response_model=None,
)
async def alven_api_negocios_planes_catalogo_proxy_or_fallback(request: Request) -> Response:
    backend_origin = _backend_origin_for_request(request)
    try:
        proxied = await _proxy_request(request, backend_origin, "negocios/planes/catalogo")
        if proxied.status_code < 500:
            return proxied
    except httpx.RequestError:
        pass

    return JSONResponse(_alvent_planes_catalogo_fallback_payload(), status_code=200)


@router.api_route(
    "/alven/api/ventas/resumen",
    methods=["GET"],
    response_model=None,
)
async def alven_api_ventas_resumen_proxy_or_fallback(request: Request) -> Response:
    backend_origin = _backend_origin_for_request(request)
    try:
        proxied = await _proxy_request(request, backend_origin, "ventas/resumen")
        if proxied.status_code < 500:
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
        if proxied.status_code < 500:
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


