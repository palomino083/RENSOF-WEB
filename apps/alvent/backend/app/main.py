# ==========================================
# ALVENT ERP POS PRO 3.0
# MAIN
# ==========================================

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import func
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from fastapi.responses import JSONResponse


from app.database.database import Base, SessionLocal, engine
from app.models.cliente import Cliente
from app.models.negocio import Negocio
from app.models.usuario import Usuario
from app.utils.jwt_utils import hash_password

# Registrar modelos SQLAlchemy
import app.models
# ==========================================
# ROUTERS
# ==========================================

from app.routers.auth import router as auth_router
from app.routers.cajas import router as cajas_router
from app.routers.clientes import router as clientes_router
from app.routers.dashboard import router as dashboard_router
from app.routers.inventario import router as inventario_router
from app.routers.productos import router as productos_router
from app.routers.reportes import router as reportes_router
from app.routers.system import router as system_router
from app.routers.usuarios import router as usuarios_router
from app.routers.ventas import router as ventas_router
from app.routers.negocios import router as negocios_router
from app.routers.finanzas import router as finanzas_router

# ==========================================
# PATHS
# ==========================================

BASE_DIR = Path(__file__).resolve().parent

UPLOADS_DIR = BASE_DIR / "uploads"
PRODUCTOS_DIR = UPLOADS_DIR / "productos"
CLIENTES_DIR = UPLOADS_DIR / "clientes"
USUARIOS_DIR = UPLOADS_DIR / "usuarios"
NEGOCIOS_DIR = UPLOADS_DIR / "negocios"
PLANES_DIR = UPLOADS_DIR / "planes"

STATIC_DIR = BASE_DIR / "statics"

for carpeta in [
    UPLOADS_DIR,
    PRODUCTOS_DIR,
    CLIENTES_DIR,
    USUARIOS_DIR,
    NEGOCIOS_DIR,
    PLANES_DIR,
    STATIC_DIR,
]:
    carpeta.mkdir(parents=True, exist_ok=True)

# ==========================================
# RATE LIMITER
# ==========================================

limiter = Limiter(key_func=get_remote_address)

SUPERADMIN_USERNAME = "Admin"
SUPERADMIN_PASSWORD = "123456"


def _normalizar_rol(valor: str | None) -> str:
    raw = str(valor or "").strip().upper()
    compact = "".join(ch for ch in raw if ch.isalnum())
    if compact in {"SUPERADMIN", "SUPERADMINISTRADOR"}:
        return "SUPERADMIN"
    if compact in {"ADMIN", "ADMINISTRADOR"}:
        return "ADMINISTRADOR"
    return raw


def _parse_roles_csv(valor: str | None) -> list[str]:
    return [
        _normalizar_rol(item)
        for item in str(valor or "").split(",")
        if str(item).strip()
    ]


def _ensure_unique_superadmin_account() -> None:
    db = SessionLocal()
    try:
        admin_user = (
            db.query(Usuario)
            .filter(func.lower(Usuario.usuario) == SUPERADMIN_USERNAME.lower())
            .order_by(Usuario.id.asc())
            .first()
        )

        if not admin_user:
            admin_user = Usuario(
                nombres="Super Administrador",
                usuario=SUPERADMIN_USERNAME,
                email=None,
                password=hash_password(SUPERADMIN_PASSWORD),
                rol="SUPERADMIN",
                roles="SUPERADMIN",
                activo=True,
                negocio_id=None,
            )
            db.add(admin_user)
            db.flush()
        else:
            admin_user.nombres = admin_user.nombres or "Super Administrador"
            admin_user.password = hash_password(SUPERADMIN_PASSWORD)
            admin_user.rol = "SUPERADMIN"
            admin_user.roles = "SUPERADMIN"
            admin_user.activo = True
            admin_user.negocio_id = None

        usuarios = db.query(Usuario).all()
        for usuario in usuarios:
            if usuario.id == admin_user.id:
                continue

            rol = _normalizar_rol(usuario.rol)
            roles = _parse_roles_csv(getattr(usuario, "roles", ""))

            if rol == "SUPERADMIN":
                usuario.rol = "ADMINISTRADOR"
            else:
                usuario.rol = rol

            if roles:
                roles_filtrados = [r for r in roles if r != "SUPERADMIN"]
                if "ADMINISTRADOR" in roles_filtrados:
                    roles_filtrados = ["ADMINISTRADOR"]
                usuario.roles = ",".join(roles_filtrados) if roles_filtrados else usuario.rol
            else:
                usuario.roles = usuario.rol

        db.commit()
    finally:
        db.close()


def _ensure_multitenant_columns() -> None:
    """Agrega columnas faltantes en tablas legacy de SQLite si no existen."""
    with engine.begin() as conn:
        for table_name in ("productos", "clientes"):
            columns = {
                row[1]
                for row in conn.exec_driver_sql(f"PRAGMA table_info({table_name})")
            }
            if "negocio_id" not in columns:
                conn.exec_driver_sql(
                    f"ALTER TABLE {table_name} ADD COLUMN negocio_id INTEGER"
                )

        producto_columns = {
            row[1]
            for row in conn.exec_driver_sql("PRAGMA table_info(productos)")
        }
        if "talla" not in producto_columns:
            conn.exec_driver_sql(
                "ALTER TABLE productos ADD COLUMN talla VARCHAR(50)"
            )
        if "color" not in producto_columns:
            conn.exec_driver_sql(
                "ALTER TABLE productos ADD COLUMN color VARCHAR(50)"
            )
        if "sexo" not in producto_columns:
            conn.exec_driver_sql(
                "ALTER TABLE productos ADD COLUMN sexo VARCHAR(20)"
            )
        if "atributos_extra" not in producto_columns:
            conn.exec_driver_sql(
                "ALTER TABLE productos ADD COLUMN atributos_extra JSON"
            )

        negocio_columns = {
            row[1]
            for row in conn.exec_driver_sql("PRAGMA table_info(negocios)")
        }
        if "logo_url" not in negocio_columns:
            conn.exec_driver_sql(
                "ALTER TABLE negocios ADD COLUMN logo_url VARCHAR(500)"
            )

        usuario_columns = {
            row[1]
            for row in conn.exec_driver_sql("PRAGMA table_info(usuarios)")
        }
        if "dni" not in usuario_columns:
            conn.exec_driver_sql(
                "ALTER TABLE usuarios ADD COLUMN dni VARCHAR(20)"
            )
        if "roles" not in usuario_columns:
            conn.exec_driver_sql(
                "ALTER TABLE usuarios ADD COLUMN roles VARCHAR(120)"
            )

        if "plan" not in negocio_columns:
            conn.exec_driver_sql(
                "ALTER TABLE negocios ADD COLUMN plan VARCHAR(20) DEFAULT 'GRATUITO'"
            )
        if "plan_gratuito_usuarios_limite" not in negocio_columns:
            conn.exec_driver_sql(
                "ALTER TABLE negocios ADD COLUMN plan_gratuito_usuarios_limite INTEGER"
            )
        if "plan_gratuito_reportes_habilitado" not in negocio_columns:
            conn.exec_driver_sql(
                "ALTER TABLE negocios ADD COLUMN plan_gratuito_reportes_habilitado BOOLEAN DEFAULT 0"
            )
        if "plan_gratuito_reportes_limite" not in negocio_columns:
            conn.exec_driver_sql(
                "ALTER TABLE negocios ADD COLUMN plan_gratuito_reportes_limite INTEGER"
            )
        if "plan_gratuito_backups_habilitado" not in negocio_columns:
            conn.exec_driver_sql(
                "ALTER TABLE negocios ADD COLUMN plan_gratuito_backups_habilitado BOOLEAN DEFAULT 0"
            )
        if "plan_gratuito_backups_limite" not in negocio_columns:
            conn.exec_driver_sql(
                "ALTER TABLE negocios ADD COLUMN plan_gratuito_backups_limite INTEGER"
            )
        if "plan_monto_gratuito" not in negocio_columns:
            conn.exec_driver_sql(
                "ALTER TABLE negocios ADD COLUMN plan_monto_gratuito REAL"
            )
        if "plan_monto_prueba" not in negocio_columns:
            conn.exec_driver_sql(
                "ALTER TABLE negocios ADD COLUMN plan_monto_prueba REAL"
            )
        if "plan_monto_basico" not in negocio_columns:
            conn.exec_driver_sql(
                "ALTER TABLE negocios ADD COLUMN plan_monto_basico REAL"
            )
        if "plan_monto_lite" not in negocio_columns:
            conn.exec_driver_sql(
                "ALTER TABLE negocios ADD COLUMN plan_monto_lite REAL"
            )
        if "plan_monto_pro" not in negocio_columns:
            conn.exec_driver_sql(
                "ALTER TABLE negocios ADD COLUMN plan_monto_pro REAL"
            )
        if "plan_monto_premium" not in negocio_columns:
            conn.exec_driver_sql(
                "ALTER TABLE negocios ADD COLUMN plan_monto_premium REAL"
            )
        if "plan_catalogo_custom" not in negocio_columns:
            conn.exec_driver_sql(
                "ALTER TABLE negocios ADD COLUMN plan_catalogo_custom TEXT"
            )
        if "plan_simulador_escenarios" not in negocio_columns:
            conn.exec_driver_sql(
                "ALTER TABLE negocios ADD COLUMN plan_simulador_escenarios TEXT"
            )

        configuracion_columns = {
            row[1]
            for row in conn.exec_driver_sql("PRAGMA table_info(configuracion_negocio)")
        }
        if "permisos_roles_json" not in configuracion_columns:
            conn.exec_driver_sql(
                "ALTER TABLE configuracion_negocio ADD COLUMN permisos_roles_json TEXT"
            )
        if "productos_columnas_json" not in configuracion_columns:
            conn.exec_driver_sql(
                "ALTER TABLE configuracion_negocio ADD COLUMN productos_columnas_json TEXT"
            )


def _solo_digitos_exactos(value: str | None, largo: int) -> str | None:
    raw = "".join(ch for ch in str(value or "") if ch.isdigit())
    if len(raw) == largo:
        return raw
    return None


def _normalize_legacy_identifiers() -> None:
    """Normaliza identificadores legacy para reglas actuales (RUC 11, celular 9, DNI 8)."""
    db = SessionLocal()
    cambios = 0
    try:
        negocios = db.query(Negocio).all()
        for negocio in negocios:
            ruc_norm = _solo_digitos_exactos(getattr(negocio, "ruc", None), 11)
            telefono_norm = _solo_digitos_exactos(getattr(negocio, "telefono", None), 9)
            whatsapp_norm = _solo_digitos_exactos(getattr(negocio, "whatsapp", None), 9)

            if getattr(negocio, "ruc", None) != ruc_norm:
                negocio.ruc = ruc_norm
                cambios += 1
            if getattr(negocio, "telefono", None) != telefono_norm:
                negocio.telefono = telefono_norm
                cambios += 1
            if getattr(negocio, "whatsapp", None) != whatsapp_norm:
                negocio.whatsapp = whatsapp_norm
                cambios += 1

        clientes = db.query(Cliente).all()
        for cliente in clientes:
            telefono_norm = _solo_digitos_exactos(getattr(cliente, "telefono", None), 9)
            if getattr(cliente, "telefono", None) != telefono_norm:
                cliente.telefono = telefono_norm
                cambios += 1

        usuarios = db.query(Usuario).all()
        for usuario in usuarios:
            dni_norm = _solo_digitos_exactos(getattr(usuario, "dni", None), 8)
            if getattr(usuario, "dni", None) != dni_norm:
                usuario.dni = dni_norm
                cambios += 1

        if cambios:
            db.commit()
    finally:
        db.close()

# ==========================================
# LIFESPAN
# ==========================================

@asynccontextmanager
async def lifespan(app: FastAPI):

    print("=" * 60)
    print("INICIANDO ALVENT ERP POS PRO")
    print("=" * 60)

    Base.metadata.create_all(bind=engine)
    _ensure_multitenant_columns()
    _normalize_legacy_identifiers()
    _ensure_unique_superadmin_account()

    print("Base de datos inicializada")
    print("Directorios verificados")
    print("Rate limiting habilitado")
    print("API disponible")
    print("=" * 60)

    yield

    print("=" * 60)
    print("Cerrando ALVENT ERP POS PRO")
    print("=" * 60)

# ==========================================
# APP
# ==========================================

app = FastAPI(
    title="ALVENT ERP POS PRO",
    description="""
Sistema ERP POS Profesional

Módulos disponibles

• Dashboard
• POS
• Ventas
• Productos
• Inventario
• Clientes
• Caja
• Reportes
• Usuarios
• Configuración
""",
    version="3.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
)

# Agregar limiter a la app
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, lambda request, exc: JSONResponse(
    status_code=429,
    content={"detail": "Demasiadas solicitudes. Intente más tarde."},
))

# ==========================================
# CORS
# ==========================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==========================================
# STATIC FILES
# ==========================================

app.mount(
    "/statics",
    StaticFiles(directory=STATIC_DIR),
    name="statics",
)

app.mount(
    "/uploads",
    StaticFiles(directory=UPLOADS_DIR),
    name="uploads",
)

# ==========================================
# API ROUTERS
# ==========================================

# Si en el futuro deseas versionar la API,
# solo agrega prefix="/api/v1"

app.include_router(auth_router)
app.include_router(clientes_router)
app.include_router(inventario_router)
app.include_router(cajas_router)
app.include_router(reportes_router)
app.include_router(usuarios_router)
app.include_router(productos_router)
app.include_router(ventas_router)
app.include_router(dashboard_router)
app.include_router(system_router)
app.include_router(negocios_router)
app.include_router(finanzas_router)

# ==========================================
# ROOT
# ==========================================

@app.get("/")
def home():

    return {
        "sistema": "ALVENT ERP POS PRO",
        "version": "3.0.0",
        "estado": "ONLINE",
        "swagger": "/docs",
        "redoc": "/redoc",
    }

# ==========================================
# HEALTH
# ==========================================

@app.get("/health")
def health():

    return {
        "status": "ok",
        "database": "connected",
        "api": "running",
    }

# ==========================================
# PING
# ==========================================

@app.get("/ping")
def ping():

    return {
        "message": "pong"
    }

# ==========================================
# VERSION
# ==========================================

@app.get("/version")
def version():

    return {
        "erp": "ALVENT ERP POS PRO",
        "version": "3.0.0",
    }

# ==========================================
# INFO
# ==========================================

@app.get("/info")
def info():

    return {
        "empresa": "ALVENT",
        "producto": "ERP POS PRO",
        "backend": "FastAPI",
        "frontend": "Next.js",
        "database": "SQLite",
    }