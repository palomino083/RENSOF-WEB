import os
import secrets
import httpx
from fastapi import APIRouter, Form, HTTPException, Query, Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse, Response
from fastapi.templating import Jinja2Templates

from app.core.config import (
    ALVENT_APP_URL,
    ALVENT_BACKEND_ORIGIN,
    ALVENT_FRONTEND_BASE_PATH,
    ALVENT_FRONTEND_ORIGIN,
    TEMPLATES_DIR,
)
from app.db.database import SessionLocal
from app.services.content_service import add_contact_message, get_email_accounts, get_home_content, get_primary_email_account, get_publications

router = APIRouter(tags=["pages"])
templates = Jinja2Templates(directory=str(TEMPLATES_DIR))

ALVENT_FALLBACK_USER = os.getenv("ALVENT_FALLBACK_USER", "Admin")
ALVENT_FALLBACK_PASSWORD = os.getenv("ALVENT_FALLBACK_PASSWORD", "123456")


def _build_proxy_target(origin: str, full_path: str, query: str) -> str:
    base = origin.rstrip("/")
    path = f"/{full_path.lstrip('/')}" if full_path else ""
    target = f"{base}{path}"
    if query:
        target = f"{target}?{query}"
    return target


def _proxy_response_headers(response_headers: httpx.Headers, frontend_origin: str, backend_origin: str) -> dict[str, str]:
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
            if location.startswith(frontend_origin):
                location = location.replace(frontend_origin, "/alven/app", 1)
            if location.startswith(backend_origin):
                location = location.replace(backend_origin, "/alven/api", 1)
            headers[key] = location
            continue
        headers[key] = value
    return headers


async def _proxy_request(request: Request, origin: str, full_path: str = "") -> Response:
    target_url = _build_proxy_target(origin, full_path, request.url.query)
    body = await request.body()
    excluded_request_headers = {"host", "content-length"}
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
        headers=_proxy_response_headers(proxied.headers, ALVENT_FRONTEND_ORIGIN, ALVENT_BACKEND_ORIGIN),
        media_type=proxied.headers.get("content-type"),
    )


async def _proxy_alvent_frontend_request(request: Request, full_path: str = "") -> Response:
    requested_path = full_path.strip("/")
    base_path = ALVENT_FRONTEND_BASE_PATH.strip("/")

    candidates: list[str] = [requested_path] if requested_path else [""]
    prefixed_path = "/".join(part for part in (base_path, requested_path) if part)
    if prefixed_path and prefixed_path not in candidates:
        candidates.append(prefixed_path)

    last_response: Response | None = None
    for candidate in candidates:
        response = await _proxy_request(request, ALVENT_FRONTEND_ORIGIN, candidate)
        body_preview = response.body[:4096].decode("utf-8", errors="ignore").lower()
        looks_like_not_found = "this page could not be found" in body_preview

        if response.status_code != 404 and not looks_like_not_found:
            return response
        last_response = response

    return last_response if last_response is not None else await _proxy_request(request, ALVENT_FRONTEND_ORIGIN, requested_path)


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


def _render_alvent_dashboard_fallback(request: Request) -> Response:
    return templates.TemplateResponse(
        request,
        "alvent_dashboard_fallback.html",
        {
            "active_page": "servicios",
            "page_title": "Dashboard ALVENT ERP PRO | RENSOF",
            "page_description": "Panel de contingencia de ALVENT ERP PRO cuando el frontend dedicado no esta disponible.",
        },
    )

@router.get("/", response_class=HTMLResponse)
def home(request: Request, sent: int = Query(default=0)):
    with SessionLocal() as session:
        content = get_home_content(session)
        primary_email = get_primary_email_account(session)
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
        },
    )


@router.get("/servicios", response_class=HTMLResponse)
def servicios(request: Request):
    with SessionLocal() as session:
        content = get_home_content(session)
    return templates.TemplateResponse(
        request,
        "servicios.html",
        {
            "products": content.products,
            "active_page": "servicios",
            "page_title": "Plataforma | RENSOF",
            "page_description": "Productos y modulos de RENSOF para decisiones estrategicas.",
        },
    )


@router.get("/alven", response_class=HTMLResponse)
def alven(request: Request):
    return templates.TemplateResponse(
        request,
        "alvent.html",
        {
            "active_page": "servicios",
            "page_title": "ALVENT ERP PRO | RENSOF",
            "page_description": "Acceso y vista previa de ALVENT ERP PRO dentro del ecosistema RENSOF.",
            "alvent_app_url": ALVENT_APP_URL,
        },
    )


@router.get("/alven/app/login", response_class=HTMLResponse, response_model=None)
async def alven_app_login(request: Request) -> Response:
    try:
        return await _proxy_alvent_frontend_request(request, "login")
    except httpx.RequestError:
        return templates.TemplateResponse(
            request,
            "alvent_login_fallback.html",
            {
                "active_page": "servicios",
                "page_title": "Login ALVENT ERP PRO | RENSOF",
                "page_description": "Acceso de contingencia a ALVENT ERP PRO cuando el frontend dedicado no esta disponible.",
            },
        )


@router.get("/alvent", response_model=None)
def alvent_legacy_redirect() -> Response:
    return RedirectResponse("/alven", status_code=308)


@router.api_route(
    "/alven/app",
    methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
    response_model=None,
)
async def alven_app_root_proxy(request: Request) -> Response:
    try:
        return await _proxy_alvent_frontend_request(request)
    except httpx.RequestError:
        return RedirectResponse("/alven/app/dashboard", status_code=307)


@router.api_route(
    "/alven/app/{full_path:path}",
    methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
    response_model=None,
)
async def alven_app_proxy(full_path: str, request: Request) -> Response:
    try:
        return await _proxy_alvent_frontend_request(request, full_path)
    except httpx.RequestError:
        if request.method == "GET" and full_path.strip("/") == "dashboard":
            return _render_alvent_dashboard_fallback(request)
        return RedirectResponse("/alven/app/login", status_code=307)


@router.api_route(
    "/alven/api/auth/login",
    methods=["POST"],
    response_model=None,
)
async def alven_api_login_proxy_or_fallback(request: Request) -> Response:
    try:
        return await _proxy_request(request, ALVENT_BACKEND_ORIGIN, "auth/login")
    except httpx.RequestError:
        payload = await request.json()
        usuario = str(payload.get("usuario") or "").strip()
        password = str(payload.get("password") or "")

        if not secrets.compare_digest(usuario.lower(), ALVENT_FALLBACK_USER.lower()):
            return JSONResponse({"detail": "Usuario incorrecto"}, status_code=401)

        if not secrets.compare_digest(password, ALVENT_FALLBACK_PASSWORD):
            return JSONResponse({"detail": "Contrasena incorrecta"}, status_code=401)

        return JSONResponse(_alvent_fallback_auth_payload(usuario))


@router.api_route(
    "/alven/api/{full_path:path}",
    methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
    response_model=None,
)
async def alven_api_proxy(full_path: str, request: Request) -> Response:
    return await _proxy_request(request, ALVENT_BACKEND_ORIGIN, full_path)


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


