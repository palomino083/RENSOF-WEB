import os
from pathlib import Path
from typing import Final

BASE_DIR: Final = Path(__file__).resolve().parents[2]
TEMPLATES_DIR: Final = BASE_DIR / "templates"
ASSETS_DIR: Final = BASE_DIR / "assets"
ALVENT_FRONTEND_ORIGIN: Final = os.getenv("ALVENT_FRONTEND_ORIGIN", "https://alvent-frontend.onrender.com")
ALVENT_FRONTEND_LOCAL_ORIGIN: Final = os.getenv("ALVENT_FRONTEND_LOCAL_ORIGIN", "http://127.0.0.1:3001")
ALVENT_FRONTEND_BASE_PATH: Final = os.getenv("ALVENT_FRONTEND_BASE_PATH", "/alven/app")
ALVENT_BACKEND_ORIGIN: Final = os.getenv("ALVENT_BACKEND_ORIGIN", "https://alvent-backend.onrender.com")
ALVENT_BACKEND_LOCAL_ORIGIN: Final = os.getenv("ALVENT_BACKEND_LOCAL_ORIGIN", "http://127.0.0.1:8001")
ALVENT_APP_URL: Final = os.getenv("ALVENT_APP_URL", "/alven/app/login")

PAGES: Final = {
    "": "index.html",
    "index": "index.html",
    "nosotros": "nosotros.html",
    "servicios": "servicios.html",
    "proyectos": "proyectos.html",
    "publicaciones": "publicaciones.html",
    "contacto": "contacto.html",
}
