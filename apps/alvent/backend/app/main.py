# ==========================================
# ALVENT ERP POS PRO 3.0
# MAIN
# ==========================================

from contextlib import asynccontextmanager
from pathlib import Path
import os
import logging
from time import perf_counter

from fastapi import FastAPI, Request
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
from app.services.runtime_guardian import runtime_guardian

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

logger = logging.getLogger(__name__)

SUPERADMIN_USERNAME = (os.getenv("ALVENT_SUPERADMIN_USERNAME") or "admin").strip()
SUPERADMIN_PASSWORD = os.getenv("ALVENT_SUPERADMIN_PASSWORD")


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
    """Asegura que exista una única cuenta superadmin con el rol correcto."""
    db = SessionLocal()
    try:
        # Buscar superadmin existente
        admin_user = (
            db.query(Usuario)
            .filter(func.lower(Usuario.usuario) == SUPERADMIN_USERNAME.lower())
            .order_by(Usuario.id.asc())
            .first()
        )

        # Crear o actualizar superadmin
        if not admin_user:
            if not SUPERADMIN_PASSWORD:
                logger.warning(
                    "ALVENT_SUPERADMIN_PASSWORD no definida; se omite inicialización de superadmin"
                )
                return
            
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
            logger.info(f"Cuenta superadmin creada: {SUPERADMIN_USERNAME}")
        else:
            # Actualizar propiedades críticas
            admin_user.nombres = admin_user.nombres or "Super Administrador"
            admin_user.rol = "SUPERADMIN"
            admin_user.roles = "SUPERADMIN"
            admin_user.activo = True
            admin_user.negocio_id = None

            # Actualizar contraseña si está configurada
            if SUPERADMIN_PASSWORD:
                admin_user.password = hash_password(SUPERADMIN_PASSWORD)
                logger.debug(f"Contraseña superadmin actualizada")

        # Degradar otros usuarios que tengan rol SUPERADMIN
        otros_superadmins = (
            db.query(Usuario)
            .filter(Usuario.id != admin_user.id, Usuario.rol == "SUPERADMIN")
            .all()
        )
        
        for usuario in otros_superadmins:
            usuario.rol = "ADMINISTRADOR"
            roles = _parse_roles_csv(getattr(usuario, "roles", ""))
            roles_filtrados = [r for r in roles if r != "SUPERADMIN"]
            usuario.roles = ",".join(roles_filtrados) if roles_filtrados else "ADMINISTRADOR"
            logger.debug(f"Usuario {usuario.usuario} degradado de SUPERADMIN")

        db.commit()
        logger.info("Cuenta superadmin verificada correctamente")
        
    except Exception as e:
        logger.error(f"Error al configurar superadmin: {e}")
        raise
    finally:
        db.close()


def _add_column_if_missing(conn, table: str, column: str, definition: str) -> None:
    """Agrega una columna a una tabla si no existe."""
    columns = {row[1] for row in conn.exec_driver_sql(f"PRAGMA table_info({table})")}
    if column not in columns:
        conn.exec_driver_sql(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")


def _ensure_multitenant_columns() -> None:
    """Agrega columnas faltantes en tablas legacy de SQLite si no existen."""
    with engine.begin() as conn:
        # ================ PRODUCTOS ================
        _add_column_if_missing(conn, "productos", "negocio_id", "INTEGER")
        _add_column_if_missing(conn, "productos", "talla", "VARCHAR(50)")
        _add_column_if_missing(conn, "productos", "color", "VARCHAR(50)")
        _add_column_if_missing(conn, "productos", "sexo", "VARCHAR(20)")
        _add_column_if_missing(conn, "productos", "atributos_extra", "JSON")
        
        # ================ CLIENTES ================
        _add_column_if_missing(conn, "clientes", "negocio_id", "INTEGER")
        
        # ================ NEGOCIOS ================
        _add_column_if_missing(conn, "negocios", "logo_url", "VARCHAR(500)")
        _add_column_if_missing(conn, "negocios", "plan", "VARCHAR(20) DEFAULT 'GRATUITO'")
        _add_column_if_missing(conn, "negocios", "plan_gratuito_usuarios_limite", "INTEGER")
        _add_column_if_missing(conn, "negocios", "plan_gratuito_reportes_habilitado", "BOOLEAN DEFAULT 0")
        _add_column_if_missing(conn, "negocios", "plan_gratuito_reportes_limite", "INTEGER")
        _add_column_if_missing(conn, "negocios", "plan_gratuito_backups_habilitado", "BOOLEAN DEFAULT 0")
        _add_column_if_missing(conn, "negocios", "plan_gratuito_backups_limite", "INTEGER")
        _add_column_if_missing(conn, "negocios", "plan_monto_gratuito", "REAL")
        _add_column_if_missing(conn, "negocios", "plan_monto_prueba", "REAL")
        _add_column_if_missing(conn, "negocios", "plan_monto_basico", "REAL")
        _add_column_if_missing(conn, "negocios", "plan_monto_lite", "REAL")
        _add_column_if_missing(conn, "negocios", "plan_monto_pro", "REAL")
        _add_column_if_missing(conn, "negocios", "plan_monto_premium", "REAL")
        _add_column_if_missing(conn, "negocios", "plan_vigente_hasta", "DATETIME")
        _add_column_if_missing(conn, "negocios", "plan_catalogo_custom", "TEXT")
        _add_column_if_missing(conn, "negocios", "plan_simulador_escenarios", "TEXT")
        
        # ================ USUARIOS ================
        _add_column_if_missing(conn, "usuarios", "dni", "VARCHAR(20)")
        _add_column_if_missing(conn, "usuarios", "roles", "VARCHAR(120)")
        
        # ================ configuracion ================
        _add_column_if_missing(conn, "configuracion_negocio", "permisos_roles_json", "TEXT")
        _add_column_if_missing(conn, "configuracion_negocio", "productos_columnas_json", "TEXT")
        _add_column_if_missing(conn, "configuracion_negocio", "sunat_api_url", "VARCHAR(500)")
        _add_column_if_missing(conn, "configuracion_negocio", "sunat_proveedor", "VARCHAR(30) DEFAULT 'NUBEFACT'")
        _add_column_if_missing(conn, "configuracion_negocio", "sunat_api_token", "VARCHAR(255)")
        _add_column_if_missing(conn, "configuracion_negocio", "sunat_usuario_sol", "VARCHAR(80)")
        _add_column_if_missing(conn, "configuracion_negocio", "sunat_clave_sol", "VARCHAR(120)")
        _add_column_if_missing(conn, "configuracion_negocio", "sunat_emisor_ruc", "VARCHAR(11)")
        _add_column_if_missing(conn, "configuracion_negocio", "sunat_modo", "VARCHAR(20) DEFAULT 'beta'")
        _add_column_if_missing(conn, "configuracion_negocio", "sunat_serie_boleta", "VARCHAR(10)")
        _add_column_if_missing(conn, "configuracion_negocio", "sunat_serie_factura", "VARCHAR(10)")
        
        # ================ VENTAS ================
        _add_column_if_missing(conn, "ventas", "tipo_comprobante", "VARCHAR(20) DEFAULT 'NINGUNO'")
        _add_column_if_missing(conn, "ventas", "cliente_nombre", "VARCHAR(255)")
        _add_column_if_missing(conn, "ventas", "cliente_documento", "VARCHAR(20)")
        _add_column_if_missing(conn, "ventas", "cliente_email", "VARCHAR(120)")
        _add_column_if_missing(conn, "ventas", "serie_comprobante", "VARCHAR(10)")
        _add_column_if_missing(conn, "ventas", "numero_comprobante", "VARCHAR(20)")
        _add_column_if_missing(conn, "ventas", "sunat_estado", "VARCHAR(30)")
        _add_column_if_missing(conn, "ventas", "sunat_codigo", "VARCHAR(80)")
        _add_column_if_missing(conn, "ventas", "sunat_mensaje", "VARCHAR(500)")
        _add_column_if_missing(conn, "ventas", "sunat_hash", "VARCHAR(120)")
        _add_column_if_missing(conn, "ventas", "sunat_ticket", "VARCHAR(120)")
        _add_column_if_missing(conn, "ventas", "sunat_cdr_url", "VARCHAR(500)")
        
        # ================ PLANES PAGOS ================
        _add_column_if_missing(conn, "planes_pagos", "duracion_dias", "INTEGER")
        _add_column_if_missing(conn, "planes_pagos", "plan_vigente_desde", "DATETIME")
        _add_column_if_missing(conn, "planes_pagos", "plan_vigente_hasta", "DATETIME")
        _add_column_if_missing(conn, "planes_pagos", "token_idempotencia", "VARCHAR(80)")
        conn.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_planes_pagos_token_idempotencia ON planes_pagos(token_idempotencia)"
        )
    
    logger.info("Migraciones de esquema completadas")


def _solo_digitos_exactos(value: str | None, largo: int) -> str | None:
    """
    Extrae exactamente `largo` dígitos de una cadena.
    
    Args:
        value: Valor a normalizar (puede ser None)
        largo: Cantidad exacta de dígitos esperados
        
    Returns:
        Cadena con exactamente `largo` dígitos, o None si no cumple
    """
    if not value:
        return None
    raw = "".join(ch for ch in str(value) if ch.isdigit())
    return raw if len(raw) == largo else None


def _normalize_field(obj, field_name: str, expected_length: int) -> bool:
    """
    Normaliza un campo de un objeto si es necesario.
    
    Args:
        obj: Objeto con el campo a normalizar
        field_name: Nombre del campo
        expected_length: Cantidad exacta de dígitos esperados
        
    Returns:
        True si hubo cambio, False si no
    """
    current_value = getattr(obj, field_name, None)
    normalized = _solo_digitos_exactos(current_value, expected_length)
    
    if current_value != normalized:
        setattr(obj, field_name, normalized)
        return True
    return False


def _normalize_legacy_identifiers() -> None:
    """Normaliza identificadores legacy para reglas actuales (RUC 11, celular 9, DNI 8)."""
    db = SessionLocal()
    cambios = 0
    try:
        # Normalizar negocios (RUC 11, telefono/WhatsApp 9 dígitos)
        negocios = db.query(Negocio).all()
        for negocio in negocios:
            cambios += _normalize_field(negocio, "ruc", 11)
            cambios += _normalize_field(negocio, "telefono", 9)
            cambios += _normalize_field(negocio, "whatsapp", 9)
        
        if negocios:
            logger.debug(f"Negocios verificados: {len(negocios)}")

        # Normalizar clientes (telefono 9 dígitos)
        clientes = db.query(Cliente).all()
        for cliente in clientes:
            cambios += _normalize_field(cliente, "telefono", 9)
        
        if clientes:
            logger.debug(f"Clientes verificados: {len(clientes)}")

        # Normalizar usuarios (DNI 8 dígitos)
        usuarios = db.query(Usuario).all()
        for usuario in usuarios:
            cambios += _normalize_field(usuario, "dni", 8)
        
        if usuarios:
            logger.debug(f"Usuarios verificados: {len(usuarios)}")

        if cambios:
            db.commit()
            logger.info(f"Identificadores normalizados: {cambios} cambios")
    except Exception as e:
        logger.error(f"Error en normalización de identificadores: {e}")
        raise
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

    try:
        # ======================================
        # 1. BASE DE DATOS (CRÍTICO)
        # ======================================
        Base.metadata.create_all(bind=engine)

        # ======================================
        # 2. MIGRACIONES LIGERAS (LEGACY SAFE)
        # ======================================
        _ensure_multitenant_columns()
        _normalize_legacy_identifiers()

        # ======================================
        # 3. USUARIO SISTEMA (SUPERADMIN)
        # ======================================
        _ensure_unique_superadmin_account()

        # ======================================
        # 4. RUNTIME GUARDIAN
        # ======================================
        runtime_guardian.mark_startup(
            True,
            "Bootstrap completo exitoso"
        )

        print("Base de datos inicializada")
        print("Migraciones verificadas")
        print("Seguridad inicializada")
        print("API disponible")
        print("=" * 60)

    except Exception as e:
        logger.exception("Error crítico en startup")
        runtime_guardian.mark_startup(False, str(e))

        # 🔴 IMPORTANTE: no tumbar el servidor
        print("WARNING: Startup incompleto, modo degradado")

    yield

    # ======================================
    # SHUTDOWN CONTROLADO
    # ======================================
    print("=" * 60)
    print("CERRANDO ALVENT ERP POS PRO")
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
• configuracion
""",
    version="3.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
)


@app.middleware("http")
async def runtime_guardian_middleware(request: Request, call_next):
    if not runtime_guardian.enabled:
        return await call_next(request)

    start = perf_counter()
    try:
        response = await call_next(request)
    except Exception as exc:
        runtime_guardian.record_exception(
            path=request.url.path,
            method=request.method,
            duration_ms=(perf_counter() - start) * 1000,
            error=exc,
        )
        raise

    runtime_guardian.record_request(
        path=request.url.path,
        method=request.method,
        status_code=response.status_code,
        duration_ms=(perf_counter() - start) * 1000,
    )

    if runtime_guardian.safe_mode_enabled:
        response.headers["X-ALVENT-Safe-Mode"] = "1"

    return response

# Agregar limiter a la app
app.state.limiter = limiter
app.add_exception_handler(
    RateLimitExceeded,
    lambda request, exc: JSONResponse(
        status_code=429,
        content={"detail": "Demasiadas solicitudes. Intente más tarde."},
    ),
)

# ==========================================
# CORS
# ==========================================

def _cors_origins() -> list[str]:
    raw = os.getenv(
        "ALVENT_CORS_ORIGINS",
        "https://www.rensof.pe,https://rensof.pe,http://127.0.0.1:3001,http://localhost:3001",
    )
    return [origin.strip().rstrip("/") for origin in raw.split(",") if origin.strip()]


app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins(),
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