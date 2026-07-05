"""
RENSOF Gateway - API Gateway simple para ALVENT ERP POS PRO
Redirecciona solicitudes a backend (8001) y frontend (3001)
Sirve archivos estáticos de rensof.pe en la raíz
"""

import os
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse, FileResponse
from fastapi.staticfiles import StaticFiles
import logging

logger = logging.getLogger(__name__)

# Path a archivos estáticos
BASE_DIR = Path(__file__).resolve().parent

app = FastAPI(
    title="RENSOF Gateway",
    description="Gateway para ALVENT ERP POS PRO",
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

# ==========================================
# STATIC FILES (RENSOF.PE WEBSITE)
# ==========================================

# Montar archivos estáticos HTML
app.mount("/assets", StaticFiles(directory=BASE_DIR / "assets"), name="assets")

# ==========================================
# ROOT ENDPOINTS
# ==========================================

@app.get("/")
async def root():
    """Servir index.html en raíz"""
    index_path = BASE_DIR / "index.html"
    if index_path.exists():
        return FileResponse(index_path)
    return {"message": "RENSOF Gateway is running"}

@app.get("/{filename}")
async def serve_html(filename: str):
    """Servir archivos HTML estáticos (contacto, servicios, etc)"""
    file_path = BASE_DIR / filename
    if file_path.exists() and file_path.suffix == ".html":
        return FileResponse(file_path)
    # Si no es HTML, pasar a las siguientes rutas
    raise HTTPException(status_code=404, detail="File not found")

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
# REDIRECT ENDPOINTS
# ==========================================

@app.get("/alven/app")
def redirect_app():
    """Redirect to frontend"""
    return RedirectResponse(url="http://127.0.0.1:3001/alven/app")

@app.get("/alven/app/{path_name:path}")
def redirect_app_path(path_name: str):
    """Redirect to frontend path"""
    return RedirectResponse(url=f"http://127.0.0.1:3001/alven/app/{path_name}")

@app.api_route("/alven/api/{path_name:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
def redirect_api(path_name: str):
    """Redirect to backend API"""
    return RedirectResponse(url=f"http://127.0.0.1:8001/{path_name}")

