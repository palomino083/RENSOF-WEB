"""
RENSOF Gateway - Servidor simplificado para RENSOF website + ALVENT
"""

from pathlib import Path
import os
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

BASE_DIR = Path(__file__).resolve().parent
TEMPLATES_DIR = BASE_DIR / "templates"
ALVENT_APP_URL = os.getenv("ALVENT_APP_URL", "/alven/")
ALVENT_APP_BASE_PATH = os.getenv("ALVENT_APP_BASE_PATH", "/alven/app").rstrip("/")
ALVENT_BACKEND_ORIGIN = os.getenv("ALVENT_BACKEND_ORIGIN", "").rstrip("/")
templates = Jinja2Templates(directory=str(TEMPLATES_DIR))

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
async def home():
    """Home page"""
    file_path = BASE_DIR / "index.html"
    if file_path.exists():
        with open(file_path, 'r', encoding='utf-8') as f:
            return HTMLResponse(content=f.read())
    return {"message": "RENSOF Gateway"}

@app.get("/index.html")
async def index():
    """Redirect to home"""
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


def _serve_alven_landing():
    """Serve local ALVENT landing page if available."""
    alven_file = BASE_DIR / "alven" / "index.html"
    if alven_file.exists():
        with open(alven_file, "r", encoding="utf-8") as f:
            return HTMLResponse(content=f.read())
    return None


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
def redirect_alven():
    """Serve ALVENT landing or fallback redirect."""
    landing = _serve_alven_landing()
    if landing is not None:
        return landing
    return RedirectResponse(url=ALVENT_APP_URL)

@app.get("/alven/app")
def redirect_alven_app():
    """Redirect to ALVENT app root"""
    if ALVENT_APP_URL.startswith("/alven/app") or ALVENT_APP_URL.startswith("/alven/"):
        landing = _serve_alven_landing()
        if landing is not None:
            return landing
        return RedirectResponse(url="/alven")
    return RedirectResponse(url=ALVENT_APP_URL)

@app.get("/alven/app/{path:path}")
def redirect_alven_app_path(path: str):
    """Redirect ALVENT app paths without exposing localhost."""
    if ALVENT_APP_URL.startswith("/alven/app") or ALVENT_APP_URL.startswith("/alven/"):
        landing = _serve_alven_landing()
        if landing is not None:
            return landing
        return RedirectResponse(url="/alven")
    base = ALVENT_APP_BASE_PATH
    target = f"{base}/{path}"
    if target == f"/alven/app/{path}":
        landing = _serve_alven_landing()
        if landing is not None:
            return landing
        return RedirectResponse(url="/alven")
    return RedirectResponse(url=target)

@app.api_route("/alven/api/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"])
def redirect_alven_api(path: str):
    """Redirect ALVENT backend API to configured origin only."""
    if not ALVENT_BACKEND_ORIGIN:
        return JSONResponse(status_code=503, content={"detail": "ALVENT backend unavailable"})
    return RedirectResponse(url=f"{ALVENT_BACKEND_ORIGIN}/{path}")

@app.get("/admin")
def admin_root():
    return RedirectResponse(url="/admin/login")


@app.get("/admin/login")
def admin_login(request: Request):
    """Serve RENSOF admin login page."""
    return _render_admin_login(request)

# ==========================================
# RUN
# ==========================================

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000, log_level="info")
