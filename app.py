"""
RENSOF Gateway - Servidor simplificado para RENSOF website + ALVENT
"""

from pathlib import Path
import os
from datetime import datetime, timezone
from urllib.parse import urlsplit
from fastapi import FastAPI, Request, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
import logging

from db.database import SessionLocal
from services.content_service import (
    add_email_account,
    add_publication,
    delete_email_account,
    delete_publication,
    get_admin_content,
    get_contact_inbox,
    get_contact_inbox_summary,
    get_email_accounts,
    get_email_areas,
    set_primary_email_account,
    update_contact_message_status,
    update_email_account,
    update_publication,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

BASE_DIR = Path(__file__).resolve().parent
TEMPLATES_DIR = BASE_DIR / "templates"
ALVENT_APP_URL = os.getenv("ALVENT_APP_URL", "/alven/")
ALVENT_APP_BASE_PATH = os.getenv("ALVENT_APP_BASE_PATH", "/alven/app").rstrip("/")
ALVENT_BACKEND_ORIGIN = os.getenv("ALVENT_BACKEND_ORIGIN", "").rstrip("/")
ALVENT_APP_EXTERNAL_BASE_URL = os.getenv(
    "ALVENT_APP_EXTERNAL_BASE_URL", "https://alvent-frontend.onrender.com/alven/app"
).rstrip("/")
templates = Jinja2Templates(directory=str(TEMPLATES_DIR))
PUBLIC_ALVENT_LOGIN_PATH = "/app/alven/login"

# FastAPI app
app = FastAPI(
    title="RENSOF Gateway",
    description="Gateway para ALVENT y RENSOF Website",
    version="1.0.0",
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount assets
try:
    app.mount("/assets", StaticFiles(directory=str(BASE_DIR / "assets")), name="assets")
except Exception as e:
    logger.warning(f"No se pudo montar /assets: {e}")

# ==========================================
# HTML PAGES (from public/ folder)
# ==========================================

@app.get("/")
async def home(request: Request):
    """Serve canonical homepage matching institutional visual baseline."""
    file_path = BASE_DIR / "index.html"
    if file_path.exists():
        with open(file_path, "r", encoding="utf-8") as f:
            return HTMLResponse(content=f.read())
    return {"message": "RENSOF Gateway"}

@app.get("/index.html")
async def index():
    """Canonical alias to home."""
    return RedirectResponse(url="/")

@app.get("/{page}.html")
async def serve_page(page: str):
    """Serve HTML pages"""
    file_path = BASE_DIR / f"{page}.html"
    if file_path.exists():
        with open(file_path, 'r', encoding='utf-8') as f:
            return HTMLResponse(content=f.read())
    return JSONResponse(status_code=404, content={"detail": "Not Found"})


def _serve_named_page(page_name: str):
    file_path = BASE_DIR / f"{page_name}.html"
    if file_path.exists():
        with open(file_path, "r", encoding="utf-8") as f:
            return HTMLResponse(content=f.read())
    return JSONResponse(status_code=404, content={"detail": "Not Found"})


def _serve_alven_landing(request: Request):
    """Render ALVENT landing page template with runtime context."""
    template_file = TEMPLATES_DIR / "alvent.html"
    if template_file.exists():
        return templates.TemplateResponse(
            request=request,
            name="alvent.html",
            context={
                "active_page": "servicios",
                "page_title": "ALVENT ERP PRO | RENSOF",
                "page_description": "Plataforma comercial para ventas, inventario, caja y reportes en tiempo real.",
                "alvent_app_url": PUBLIC_ALVENT_LOGIN_PATH,
            },
        )

    alven_file = BASE_DIR / "alven" / "index.html"
    if alven_file.exists():
        with open(alven_file, "r", encoding="utf-8") as f:
            return HTMLResponse(content=f.read())
    return None


def _internalize_url(raw_url: str, fallback: str) -> str:
    """Keep redirects on the same host/channel by returning path-only targets."""
    if not raw_url:
        return fallback

    if raw_url.startswith("/"):
        return raw_url

    parsed = urlsplit(raw_url)
    if parsed.scheme and parsed.netloc:
        path = parsed.path or fallback
        if parsed.query:
            path = f"{path}?{parsed.query}"
        if parsed.fragment:
            path = f"{path}#{parsed.fragment}"
        return path

    return fallback


def _external_alvent_app_url(path: str = "") -> str:
    """Build ALVENT app URLs that must resolve on the dedicated frontend service."""
    if not ALVENT_APP_EXTERNAL_BASE_URL:
        fallback = _internalize_url(ALVENT_APP_URL, "/alven/app/login")
        if path:
            return f"{ALVENT_APP_BASE_PATH}/{path.lstrip('/')}"
        return fallback

    if path:
        return f"{ALVENT_APP_EXTERNAL_BASE_URL}/{path.lstrip('/')}"

    return f"{ALVENT_APP_EXTERNAL_BASE_URL}/login"


def _render_admin_login(request: Request):
    template_file = TEMPLATES_DIR / "admin_login.html"
    if not template_file.exists():
        return JSONResponse(status_code=404, content={"detail": "Admin login template not found"})
    return templates.TemplateResponse(
        request=request,
        name="admin_login.html",
        context={
            "active_page": "admin",
            "page_title": "Admin | RENSOF",
            "page_description": "Acceso a la plataforma de administracion de RENSOF.",
            "csrf_token": "",
            "error_message": None,
        },
    )


def _render_admin_dashboard(request: Request):
    template_file = TEMPLATES_DIR / "admin.html"
    if not template_file.exists():
        return JSONResponse(status_code=404, content={"detail": "Admin dashboard template not found"})
    ops_context = _build_admin_ops_context(request, [])
    return templates.TemplateResponse(
        request=request,
        name="admin.html",
        context={
            "active_page": "admin",
            "page_title": "Centro de Control | RENSOF Admin",
            "page_description": "Centro de control operativo de la plataforma RENSOF.",
            "csrf_token": "",
            "products": [],
            "metrics": [],
            "cases": [],
            **ops_context,
            "admin_section": "dashboard",
        },
    )


def _render_admin_publications(request: Request, publications: list, email_accounts: list):
    template_file = TEMPLATES_DIR / "admin_publications.html"
    if not template_file.exists():
        return JSONResponse(status_code=404, content={"detail": "Admin publications template not found"})
    ops_context = _build_admin_ops_context(request, [])
    publication_metrics = [
        {
            "label": "Piezas activas",
            "value": "06",
            "detail": "Home, ALVENT, servicios, nosotros, contacto y publicaciones.",
        },
        {
            "label": "Narrativas clave",
            "value": "04",
            "detail": "Posicionamiento, producto, captacion y soporte institucional.",
        },
        {
            "label": "Backlog editorial",
            "value": "03",
            "detail": "Recursos por consolidar en investigaciones, casos y guias funcionales.",
        },
    ]
    editorial_tracks = [
        {
            "title": "Linea institucional",
            "detail": "Mantener consistencia entre vision de RENSOF, propuesta de valor y llamadas a accion publicas.",
            "href": "/publicaciones",
            "cta": "Ver modulo publico",
        },
        {
            "title": "ALVENT y producto",
            "detail": "Sincronizar fichas, beneficios, accesos y contenido comercial con el flujo real del aplicativo.",
            "href": "/app/alven/login",
            "cta": "Abrir acceso ALVENT",
        },
        {
            "title": "Captacion y contacto",
            "detail": "Alinear publicaciones con formularios, demo ejecutiva y bandeja de leads para conversion real.",
            "href": "/admin/correos/bandeja",
            "cta": "Abrir bandeja",
        },
    ]
    publication_queue = [
        {
            "name": "Caso de uso ALVENT",
            "status": "Prioridad alta",
            "detail": "Documento comercial corto para ventas, inventario, caja y dashboard ejecutivo.",
        },
        {
            "name": "Marco de inteligencia RENSOF",
            "status": "En desarrollo",
            "detail": "Pieza madre para explicar plataforma, verticales y arquitectura de marca.",
        },
        {
            "name": "Guia de despliegue institucional",
            "status": "Vigilancia",
            "detail": "Bitacora de cambios criticos para evitar drift entre codigo, deploy y experiencia publica.",
        },
    ]
    publication_playbooks = [
        {
            "title": "Priorizar contenido de negocio",
            "detail": "Publicar primero piezas que soportan captacion, demo y lectura de valor del producto.",
        },
        {
            "title": "Validar coherencia de rutas",
            "detail": "Cada CTA editorial debe resolver a una ruta activa del sitio o del aplicativo.",
        },
        {
            "title": "Sincronizar con operaciones",
            "detail": "Toda actualizacion editorial debe reflejar acceso ALVENT, admin y formularios sin contradicciones.",
        },
    ]
    return templates.TemplateResponse(
        request=request,
        name="admin_publications.html",
        context={
            "active_page": "admin",
            "page_title": "Publicaciones | RENSOF Admin",
            "page_description": "Control editorial y desarrollo de contenidos de RENSOF.",
            "csrf_token": "",
            "publications": publications,
            "email_accounts": email_accounts,
            "publication_metrics": publication_metrics,
            "editorial_tracks": editorial_tracks,
            "publication_queue": publication_queue,
            "publication_playbooks": publication_playbooks,
            **ops_context,
            "admin_section": "publications",
        },
    )


def _render_admin_emails(
    request: Request,
    email_accounts: list,
    area_options: list[str],
    search_query: str,
    selected_area: str,
    principal_only: bool,
    inbox_summary: dict,
):
    template_file = TEMPLATES_DIR / "admin_emails.html"
    if not template_file.exists():
        return JSONResponse(status_code=404, content={"detail": "Admin emails template not found"})
    ops_context = _build_admin_ops_context(request, [])
    email_metrics = [
        {
            "label": "Canales activos",
            "value": "04",
            "detail": "Comercial, publicaciones, soporte y direccion institucional.",
        },
        {
            "label": "Prioridad de respuesta",
            "value": "24h",
            "detail": "Ventana objetivo para primer contacto de leads e incidencias.",
        },
        {
            "label": "Rutas conectadas",
            "value": "03",
            "detail": "Formulario publico, bandeja operativa y modulo editorial.",
        },
    ]
    email_channels = [
        {
            "title": "Comercial y demos",
            "detail": "Centraliza consultas de producto, demos ejecutivas y conversion desde ALVENT y contacto.",
            "href": "/contacto#contactForm",
            "cta": "Ver origen publico",
        },
        {
            "title": "Editorial y recursos",
            "detail": "Conecta publicaciones, piezas de conocimiento y solicitudes de contenido institucional.",
            "href": "/admin/publicaciones",
            "cta": "Ir a publicaciones",
        },
        {
            "title": "Soporte y plataforma",
            "detail": "Escala incidentes, monitoreo y observaciones operativas hacia el equipo de control.",
            "href": "/admin/correos/bandeja",
            "cta": "Abrir bandeja",
        },
    ]
    email_queue = [
        {
            "name": "Correo principal institucional",
            "status": "Vigilar",
            "detail": "Debe mantenerse como destino canonical para formularios y respuestas maestras.",
        },
        {
            "name": "Reglas por area",
            "status": "En desarrollo",
            "detail": "Separar comercial, editorial y soporte evita mezcla de leads con incidencias.",
        },
        {
            "name": "Escalamiento de incidencias",
            "status": "Prioridad alta",
            "detail": "Toda alerta de acceso, deploy o rutas debe poder subir a control operativo sin friccion.",
        },
    ]
    email_playbooks = [
        {
            "title": "Responder primero, clasificar despues",
            "detail": "No dejar leads en espera por falta de taxonomia; capturar y ordenar en segundo paso.",
        },
        {
            "title": "Separar negocio de soporte",
            "detail": "Las consultas comerciales y las incidencias de plataforma requieren dueños y SLA distintos.",
        },
        {
            "title": "Usar la bandeja como centro de triage",
            "detail": "La bandeja consolida estado, prioridad y seguimiento antes de cerrar o derivar.",
        },
    ]
    return templates.TemplateResponse(
        request=request,
        name="admin_emails.html",
        context={
            "active_page": "admin",
            "page_title": "Correos | RENSOF Admin",
            "page_description": "Gobierno de canales de correo y flujo de contacto de RENSOF.",
            "csrf_token": "",
            "email_accounts": email_accounts,
            "search_query": search_query,
            "selected_area": selected_area,
            "principal_only": principal_only,
            "area_options": area_options,
            **inbox_summary,
            "email_metrics": email_metrics,
            "email_channels": email_channels,
            "email_queue": email_queue,
            "email_playbooks": email_playbooks,
            **ops_context,
            "admin_section": "emails",
        },
    )


def _build_admin_ops_context(request: Request, messages: list[dict] | list) -> dict:
    total_messages = len(messages)
    status_counts = {
        "new": sum(1 for message in messages if getattr(message, "status", "") == "new"),
        "read": sum(1 for message in messages if getattr(message, "status", "") == "read"),
        "archived": sum(1 for message in messages if getattr(message, "status", "") == "archived"),
    }
    unresolved_messages = status_counts["new"] + status_counts["read"]
    refreshed_at = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    host_name = request.url.hostname or "www.rensof.pe"

    metrics = [
        {
            "label": "Mensajes activos",
            "value": str(unresolved_messages),
            "detail": "Consultas que requieren lectura, respuesta o clasificacion.",
            "tone": "primary",
        },
        {
            "label": "Superficies vigiladas",
            "value": "6",
            "detail": "Publico, contacto, ALVENT, admin, publicaciones y gateway.",
            "tone": "neutral",
        },
        {
            "label": "Cobertura de control",
            "value": "5/5",
            "detail": "Rutas criticas, contenido, leads, acceso y operacion.",
            "tone": "success",
        },
        {
            "label": "Ultimo refresh",
            "value": refreshed_at,
            "detail": f"Host maestro {host_name}.",
            "tone": "neutral",
        },
    ]

    control_surfaces = [
        {
            "name": "Sitio institucional",
            "status": "Operativo",
            "detail": "Home, navegacion, formularios y rutas publicas.",
            "href": "/",
        },
        {
            "name": "Acceso ALVENT",
            "status": "Vigilado",
            "detail": "Ingreso publico bajo /app/alven/login y acceso al dashboard.",
            "href": PUBLIC_ALVENT_LOGIN_PATH,
        },
        {
            "name": "Backoffice RENSOF",
            "status": "Operativo",
            "detail": "Control editorial, correos y seguimiento administrativo.",
            "href": "/admin",
        },
        {
            "name": "Pipeline de contacto",
            "status": "Listo",
            "detail": "Entrada, clasificacion, SLA y asignacion comercial.",
            "href": "/admin/correos/bandeja",
        },
    ]

    alerts = [
        {
            "level": "Alta prioridad",
            "title": "Convergencia de accesos ALVENT",
            "detail": "Toda la navegacion publica ya apunta a /app/alven/login; revisar produccion tras cada deploy para evitar 404 transitorios.",
        },
        {
            "level": "Monitoreo",
            "title": "Bandeja sin backlog critico",
            "detail": "No hay mensajes nuevos en cola. Mantener trazabilidad y captacion con seguimiento a formularios.",
        },
        {
            "level": "Infraestructura",
            "title": "Backend ALVENT enlazado",
            "detail": "El gateway conserva enlace a backend dedicado para API y autenticacion controlada.",
        },
    ]

    playbooks = [
        {
            "title": "Validar acceso principal",
            "detail": "Comprobar home, /app/alven/login y /admin/login despues de cada publicacion.",
            "href": PUBLIC_ALVENT_LOGIN_PATH,
            "cta": "Abrir acceso ALVENT",
        },
        {
            "title": "Triage de leads",
            "detail": "Aplicar filtros, priorizar estado new y derivar a responsable comercial o editorial.",
            "href": "/admin/correos/bandeja",
            "cta": "Abrir bandeja",
        },
        {
            "title": "Control editorial",
            "detail": "Revisar publicaciones, contenido vigente y narrativa de producto antes de anunciar cambios.",
            "href": "/admin/publicaciones",
            "cta": "Ver publicaciones",
        },
    ]

    watch_routes = [
        {"path": "/", "purpose": "Captura de demanda y posicionamiento"},
        {"path": PUBLIC_ALVENT_LOGIN_PATH, "purpose": "Ingreso comercial y operativo"},
        {"path": "/admin/login", "purpose": "Gobierno de plataforma"},
        {"path": "/contacto#contactForm", "purpose": "Pipeline de adquisicion"},
    ]

    return {
        "admin_section": "inbox",
        "ops_metrics": metrics,
        "ops_surfaces": control_surfaces,
        "ops_alerts": alerts,
        "ops_playbooks": playbooks,
        "ops_watch_routes": watch_routes,
        "ops_total_messages": total_messages,
        "ops_unresolved_messages": unresolved_messages,
        "ops_status_counts": status_counts,
        "ops_refreshed_at": refreshed_at,
        "superagent_name": "RENSOF Platform Ops Superagent",
        "superagent_scope": "mantenimiento, despliegues, vigilancia, alertas e incidencias",
    }


def _render_admin_inbox(request: Request):
    return _render_admin_inbox_page(
        request=request,
        messages=[],
        area_options=[],
        search_query="",
        selected_area="",
        selected_status="",
    )


def _render_admin_inbox_page(
    request: Request,
    messages: list,
    area_options: list[str],
    search_query: str,
    selected_area: str,
    selected_status: str,
):
    template_file = TEMPLATES_DIR / "admin_inbox.html"
    if not template_file.exists():
        return JSONResponse(status_code=404, content={"detail": "Admin inbox template not found"})
    ops_context = _build_admin_ops_context(request, messages)
    return templates.TemplateResponse(
        request=request,
        name="admin_inbox.html",
        context={
            "active_page": "admin",
            "page_title": "Bandeja de Contacto | RENSOF Admin",
            "page_description": "Bandeja de mensajes de la plataforma de administracion RENSOF.",
            "csrf_token": "",
            "messages": messages,
            "area_options": area_options,
            "search_query": search_query,
            "selected_area": selected_area,
            "selected_status": selected_status,
            **ops_context,
        },
    )


@app.get("/nosotros")
async def nosotros():
    return _serve_named_page("nosotros")


@app.get("/publicaciones")
async def publicaciones():
    return _serve_named_page("publicaciones")


@app.get("/contacto")
async def contacto():
    return _serve_named_page("contacto")


@app.get("/proyectos")
async def proyectos():
    return _serve_named_page("proyectos")


@app.get("/servicios")
async def servicios():
    return _serve_named_page("servicios")

# ==========================================
# HEALTH CHECKS
# ==========================================

@app.get("/health")
def health():
    """Health check"""
    return {"status": "ok", "service": "RENSOF Gateway"}

@app.get("/info")
def info():
    """Gateway info"""
    return {
        "nombre": "RENSOF Gateway",
        "version": "1.0.0",
        "backends": {
            "api": "http://127.0.0.1:8001",
            "frontend": "http://127.0.0.1:3001"
        }
    }

# ==========================================
# REDIRECTS
# ==========================================

@app.get("/alven")
def redirect_alven(request: Request):
    """Serve ALVENT landing or fallback redirect."""
    landing = _serve_alven_landing(request)
    if landing is not None:
        return landing
    return RedirectResponse(url=_internalize_url(ALVENT_APP_URL, "/alven/app/login"))

@app.get("/alven/login")
def redirect_alven_login(request: Request):
    """Legacy ALVENT login alias preserved for compatibility."""
    _ = request
    return RedirectResponse(url=PUBLIC_ALVENT_LOGIN_PATH)


@app.get("/app/alven/login")
def redirect_public_alvent_login(request: Request):
    """Public ALVENT login alias from RENSOF marketing pages."""
    _ = request
    return RedirectResponse(url=_external_alvent_app_url())

@app.get("/alven/app")
def redirect_alven_app(request: Request):
    """Redirect to ALVENT app root"""
    _ = request
    return RedirectResponse(url=_external_alvent_app_url())

@app.get("/alven/app/{path:path}")
def redirect_alven_app_path(request: Request, path: str):
    """Redirect ALVENT app paths without exposing localhost."""
    _ = request
    return RedirectResponse(url=_external_alvent_app_url(path))

@app.api_route("/alven/api/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"])
def redirect_alven_api(path: str):
    """Redirect ALVENT backend API to configured origin only."""
    if not ALVENT_BACKEND_ORIGIN:
        return JSONResponse(status_code=503, content={"detail": "ALVENT backend unavailable"})
    return RedirectResponse(url=f"{ALVENT_BACKEND_ORIGIN}/{path}")

@app.get("/admin")
def admin_root(request: Request):
    return _render_admin_dashboard(request)


@app.get("/admin/login")
def admin_login(request: Request):
    """Serve RENSOF admin login page."""
    return _render_admin_login(request)


@app.post("/admin/login")
def admin_login_submit(
    request: Request,
    username: str = Form(""),
    password: str = Form(""),
):
    """Temporary admin login flow to open inbox view from login button."""
    _ = (request, username, password)
    return RedirectResponse(url="/admin", status_code=303)


@app.get("/admin/publicaciones")
def admin_publications(request: Request):
    """Serve RENSOF admin publications control module."""
    with SessionLocal() as session:
        content = get_admin_content(session)
    return _render_admin_publications(request, content["publications"], content["email_accounts"])


@app.get("/admin/correos")
def admin_emails(
    request: Request,
    q: str = "",
    area: str = "",
    principal_only: bool = False,
):
    """Serve RENSOF admin email governance module."""
    with SessionLocal() as session:
        email_accounts = get_email_accounts(session, query=q, area=area, principal_only=principal_only)
        inbox_summary = get_contact_inbox_summary(session)
        area_options = get_email_areas(session)
    return _render_admin_emails(request, email_accounts, area_options, q, area, principal_only, inbox_summary)


@app.get("/admin/correos/bandeja")
def admin_inbox(
    request: Request,
    q: str = "",
    area: str = "",
    status: str = "",
):
    """Serve RENSOF admin inbox page."""
    with SessionLocal() as session:
        messages = get_contact_inbox(session, query=q, area=area, status=status)
        area_options = get_email_areas(session)
    return _render_admin_inbox_page(request, messages, area_options, q, area, status)


@app.post("/admin/bandeja/{message_id}/status")
def admin_update_inbox_message_status(
    request: Request,
    message_id: int,
    status: str = Form("new"),
    csrf_token: str = Form(""),
):
    _ = (request, csrf_token)
    with SessionLocal() as session:
        update_contact_message_status(session, message_id, status)
    return RedirectResponse(url="/admin/correos/bandeja", status_code=303)


@app.post("/admin/publications/add")
def admin_add_publication(
    request: Request,
    title: str = Form(...),
    summary: str = Form(...),
    category: str = Form(...),
    author_name: str = Form(...),
    contact_email: str = Form(...),
    status: str = Form("draft"),
    published_at: str = Form(""),
    tags: str = Form(""),
    csrf_token: str = Form(""),
):
    _ = (request, csrf_token)
    with SessionLocal() as session:
        add_publication(session, title, summary, category, author_name, contact_email, status, published_at, tags)
    return RedirectResponse(url="/admin/publicaciones", status_code=303)


@app.post("/admin/publications/{publication_id}/update")
def admin_update_publication_route(
    request: Request,
    publication_id: int,
    title: str = Form(...),
    summary: str = Form(...),
    category: str = Form(...),
    author_name: str = Form(...),
    contact_email: str = Form(...),
    status: str = Form("draft"),
    published_at: str = Form(""),
    tags: str = Form(""),
    csrf_token: str = Form(""),
):
    _ = (request, csrf_token)
    with SessionLocal() as session:
        update_publication(session, publication_id, title, summary, category, author_name, contact_email, status, published_at, tags)
    return RedirectResponse(url="/admin/publicaciones", status_code=303)


@app.post("/admin/publications/{publication_id}/delete")
def admin_delete_publication_route(
    request: Request,
    publication_id: int,
    csrf_token: str = Form(""),
):
    _ = (request, csrf_token)
    with SessionLocal() as session:
        delete_publication(session, publication_id)
    return RedirectResponse(url="/admin/publicaciones", status_code=303)


@app.post("/admin/emails/add")
def admin_add_email(
    request: Request,
    display_name: str = Form(...),
    email: str = Form(...),
    area: str = Form(...),
    csrf_token: str = Form(""),
):
    _ = (request, csrf_token)
    with SessionLocal() as session:
        add_email_account(session, display_name, email, area)
    return RedirectResponse(url="/admin/correos", status_code=303)


@app.post("/admin/emails/{email_id}/update")
def admin_update_email_route(
    request: Request,
    email_id: int,
    display_name: str = Form(...),
    email: str = Form(...),
    area: str = Form(...),
    csrf_token: str = Form(""),
):
    _ = (request, csrf_token)
    with SessionLocal() as session:
        update_email_account(session, email_id, display_name, email, area)
    return RedirectResponse(url="/admin/correos", status_code=303)


@app.post("/admin/emails/{email_id}/delete")
def admin_delete_email_route(
    request: Request,
    email_id: int,
    csrf_token: str = Form(""),
):
    _ = (request, csrf_token)
    with SessionLocal() as session:
        delete_email_account(session, email_id)
    return RedirectResponse(url="/admin/correos", status_code=303)


@app.post("/admin/correos/{email_id}/principal")
def admin_set_primary_email(
    request: Request,
    email_id: int,
    csrf_token: str = Form(""),
):
    _ = (request, csrf_token)
    with SessionLocal() as session:
        set_primary_email_account(session, email_id)
    return RedirectResponse(url="/admin/correos", status_code=303)

# ==========================================
# RUN
# ==========================================

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000, log_level="info")
