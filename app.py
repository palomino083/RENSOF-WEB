"""
RENSOF Gateway - API Gateway simple para ALVENT ERP POS PRO
Redirecciona solicitudes a backend (8001) y frontend (3001)
"""

import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
import logging

logger = logging.getLogger(__name__)

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
# ROOT ENDPOINTS
# ==========================================

@app.get("/")
def root():
    """Redirect to app"""
    return {"message": "RENSOF Gateway is running"}

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

