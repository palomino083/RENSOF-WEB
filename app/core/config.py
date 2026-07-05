from dotenv import load_dotenv
import os
from pathlib import Path
from typing import Final

# =========================
# 📍 ROOT DEL PROYECTO
# =========================
BASE_DIR: Final = Path(__file__).resolve().parents[2]

# =========================
# 🔥 CARGA ROBUSTA DE .ENV
# =========================
ENV_PATH = BASE_DIR / "apps" / "alvent" / "backend" / ".env"
load_dotenv(dotenv_path=ENV_PATH)

# =========================
# 📁 RUTAS INTERNAS
# =========================
TEMPLATES_DIR: Final = BASE_DIR / "templates"
ASSETS_DIR: Final = BASE_DIR / "assets"

# =========================
# 🔐 HELPER DE VALIDACIÓN
# =========================
def require_env(key: str) -> str:
    value = os.getenv(key)
    if not value:
        raise ValueError(f"{key} no configurada en .env")
    return value

# =========================
# 🌐 FRONTEND CONFIG
# =========================
ALVENT_FRONTEND_ORIGIN: Final = require_env("ALVENT_FRONTEND_ORIGIN")

ALVENT_FRONTEND_LOCAL_ORIGIN: Final = os.getenv(
    "ALVENT_FRONTEND_LOCAL_ORIGIN",
    "http://127.0.0.1:3001"
)

ALVENT_FRONTEND_BASE_PATH: Final = os.getenv(
    "ALVENT_FRONTEND_BASE_PATH",
    "/alven/app"
)

# =========================
# 🔙 BACKEND CONFIG
# =========================
ALVENT_BACKEND_ORIGIN: Final = os.getenv(
    "ALVENT_BACKEND_ORIGIN",
    "https://alvent-backend.onrender.com"
)

ALVENT_BACKEND_LOCAL_ORIGIN: Final = os.getenv(
    "ALVENT_BACKEND_LOCAL_ORIGIN",
    "http://127.0.0.1:8001"
)

ALVENT_APP_URL: Final = os.getenv(
    "ALVENT_APP_URL",
    "/alven/app/login"
)

# =========================
# 📄 PÁGINAS FRONTEND
# =========================
PAGES: Final = {
    "": "index.html",
    "index": "index.html",
    "nosotros": "nosotros.html",
    "servicios": "servicios.html",
    "proyectos": "proyectos.html",
    "publicaciones": "publicaciones.html",
    "contacto": "contacto.html",
}