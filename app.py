"""
RENSOF Gateway - Servidor simplificado para RENSOF website + ALVENT
"""

from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

BASE_DIR = Path(__file__).resolve().parent

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
    file_path = BASE_DIR / "public" / "index.html"
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
    file_path = BASE_DIR / "public" / f"{page}.html"
    if file_path.exists():
        with open(file_path, 'r', encoding='utf-8') as f:
            return HTMLResponse(content=f.read())
    return {"error": "Page not found"}

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
    """Redirect to ALVENT"""
    return RedirectResponse(url="/alven/app/login")

@app.get("/alven/app")
def redirect_alven_app():
    """Redirect to ALVENT frontend"""
    return RedirectResponse(url="http://127.0.0.1:3001/alven/app")

@app.get("/alven/app/{path:path}")
def redirect_alven_app_path(path: str):
    """Redirect ALVENT frontend path"""
    return RedirectResponse(url=f"http://127.0.0.1:3001/alven/app/{path}")

@app.api_route("/alven/api/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"])
def redirect_alven_api(path: str):
    """Redirect ALVENT backend API"""
    return RedirectResponse(url=f"http://127.0.0.1:8001/{path}")

@app.get("/admin/login")
def redirect_admin():
    """Redirect admin"""
    return RedirectResponse(url="/alven/app/login")

# ==========================================
# RUN
# ==========================================

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000, log_level="info")
