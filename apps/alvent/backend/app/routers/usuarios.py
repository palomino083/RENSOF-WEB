import json
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field

from app.database.database import get_db
from app.models.configuracion_negocio import configuracionNegocio
from app.models.email_verification import EmailVerification, PasswordReset
from app.models.negocio import Negocio
from app.models.refresh_token import RefreshToken, TokenBlacklist
from app.models.usuario import Usuario
from app.schemas.usuario import UsuarioCreate, UsuarioOut
from app.utils.dependencies import get_current_user_with_negocio
from app.utils.jwt_utils import hash_password
from app.utils.planes import normalizar_plan, resolver_config_plan_negocio

#ROUTER
router = APIRouter(
    prefix="/usuarios",
    tags=["Usuarios"]
)

ROLES_VALIDOS = {"ADMINISTRADOR", "CAJERO", "ALMACEN", "VENDEDOR"}
ROLES_PRIORIDAD = ["ADMINISTRADOR", "VENDEDOR", "CAJERO", "ALMACEN"]
SUPERADMIN_USERNAME = "admin"
MODULOS_VALIDOS = [
    "Dashboard",
    "POS",
    "Ventas",
    "Productos",
    "Inventario",
    "Clientes",
    "Cajas",
    "Reportes",
    "Exportacion",
    "Usuarios",
    "Empresa",
    "Soporte",
    "configuracion",
    "Finanzas",
]
PERMISOS_POR_ROL_DEFAULT: dict[str, list[str]] = {
    "ADMINISTRADOR": [
        "Dashboard",
        "POS",
        "Ventas",
        "Productos",
        "Inventario",
        "Clientes",
        "Cajas",
        "Reportes",
        "Exportacion",
        "Usuarios",
        "Empresa",
        "Soporte",
        "configuracion",
        "Finanzas",
    ],
    "CAJERO": ["Dashboard", "POS", "Ventas", "Clientes", "Empresa", "Soporte", "configuracion"],
    "VENDEDOR": ["Dashboard", "POS", "Ventas", "Clientes", "Empresa", "Soporte", "configuracion"],
    "ALMACEN": ["Dashboard", "Productos", "Inventario", "Empresa", "Soporte", "configuracion"],
}


class PermisosMatrizUpdate(BaseModel):
    matriz: dict[str, list[str]] = Field(default_factory=dict)


def _normalizar_matriz_permisos(matriz: dict[str, list[str]] | None) -> dict[str, list[str]]:
    source = matriz or {}
    output: dict[str, list[str]] = {}

    for rol in sorted(ROLES_VALIDOS):
        raw_modulos = source.get(rol, PERMISOS_POR_ROL_DEFAULT.get(rol, []))
        normalizados: list[str] = []
        for modulo in raw_modulos or []:
            nombre = str(modulo or "").strip()
            if nombre in MODULOS_VALIDOS and nombre not in normalizados:
                normalizados.append(nombre)
        output[rol] = normalizados

    return output


def _obtener_config_negocio(db: Session, negocio_id: int) -> configuracionNegocio:
    config = db.query(configuracionNegocio).filter(configuracionNegocio.negocio_id == negocio_id).first()
    if config:
        return config

    config = configuracionNegocio(negocio_id=negocio_id)
    db.add(config)
    db.flush()
    return config


def _normalizar_roles(rol: str, roles: list[str] | None) -> tuple[str, str]:
    candidatos = [r for r in (roles or []) if r]
    if not candidatos:
        candidatos = [rol]

    normalizados = []
    for item in candidatos:
        upper = str(item).upper().strip()
        if upper in ROLES_VALIDOS and upper not in normalizados:
            normalizados.append(upper)

    if not normalizados:
        raise HTTPException(status_code=400, detail="Debe asignar al menos un rol válido")

    if "ADMINISTRADOR" in normalizados:
        normalizados = ["ADMINISTRADOR"]

    rol_principal = next((r for r in ROLES_PRIORIDAD if r in normalizados), normalizados[0])
    roles_csv = ",".join(normalizados)
    return rol_principal, roles_csv


def _es_superadmin_fijo(usuario: Usuario | None) -> bool:
    if not usuario:
        return False
    return str(getattr(usuario, "usuario", "") or "").strip().lower() == SUPERADMIN_USERNAME


def _validar_limite_plan_usuarios(db: Session, current_user: dict) -> None:
    if bool(current_user.get("is_superadmin")):
        return

    negocio_id = int(current_user.get("negocio_id") or 0)
    negocio = db.query(Negocio).filter(Negocio.id == negocio_id).first()
    if not negocio:
        return

    try:
        plan = normalizar_plan(getattr(negocio, "plan", "BASICO"))
    except ValueError:
        plan = "BASICO"
    limite = resolver_config_plan_negocio(negocio, plan).usuarios_limite
    if limite is None:
        return

    total = (
        db.query(Usuario)
        .filter(Usuario.negocio_id == negocio_id)
        .count()
    )

    if total >= limite:
        raise HTTPException(
            status_code=402,
            detail=f"Plan {plan} permite hasta {limite} usuarios. Mejora tu plan para continuar.",
        )

def get_usuario_by_id(db: Session, usuario_id: int, negocio_id: int | None):
    if negocio_id is None:
        return db.query(Usuario).filter(Usuario.id == usuario_id).first()

    return (
        db.query(Usuario)
        .filter(
            Usuario.id == usuario_id,
            Usuario.negocio_id == negocio_id
        )
        .first()
    )


def get_usuario_by_username(db: Session, username: str):
    return db.query(Usuario).filter(Usuario.usuario == username).first()


def _asegurar_actor_admin(db: Session, current_user: dict) -> None:
    if bool(current_user.get("is_superadmin")):
        return

    actor_id = int(current_user.get("usuario_id") or 0)
    negocio_id = int(current_user.get("negocio_id") or 0)

    actor = (
        db.query(Usuario)
        .filter(
            Usuario.id == actor_id,
            Usuario.negocio_id == negocio_id,
            Usuario.activo.is_(True),
        )
        .first()
    )

    if not actor or (actor.rol or "").upper() != "ADMINISTRADOR":
        raise HTTPException(
            status_code=403,
            detail="Solo un administrador puede asignar usuarios de caja, vendedor o almacen",
        )


@router.get("/permisos-matriz")
def obtener_matriz_permisos(
    negocio_id: int | None = Query(default=None),
    current_user: dict = Depends(get_current_user_with_negocio),
    db: Session = Depends(get_db),
):
    _asegurar_actor_admin(db, current_user)

    is_superadmin = bool(current_user.get("is_superadmin"))
    negocio_objetivo = int(negocio_id or current_user.get("negocio_id") or 0)

    # El superadmin global puede consultar la matriz default aunque no tenga negocio fijo.
    if is_superadmin and not negocio_objetivo:
        return {
            "negocio_id": None,
            "matriz": _normalizar_matriz_permisos(PERMISOS_POR_ROL_DEFAULT),
        }

    if not negocio_objetivo:
        raise HTTPException(status_code=400, detail="Negocio no encontrado en sesion")

    config = _obtener_config_negocio(db, negocio_objetivo)
    raw = str(getattr(config, "permisos_roles_json", "") or "").strip()
    if not raw:
        matriz = PERMISOS_POR_ROL_DEFAULT
    else:
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            parsed = {}
        matriz = parsed if isinstance(parsed, dict) else {}

    return {
        "negocio_id": negocio_objetivo,
        "matriz": _normalizar_matriz_permisos(matriz),
    }


@router.put("/permisos-matriz")
def actualizar_matriz_permisos(
    data: PermisosMatrizUpdate,
    negocio_id: int | None = Query(default=None),
    current_user: dict = Depends(get_current_user_with_negocio),
    db: Session = Depends(get_db),
):
    _asegurar_actor_admin(db, current_user)

    negocio_objetivo = int(negocio_id or current_user.get("negocio_id") or 0)
    if not negocio_objetivo:
        raise HTTPException(status_code=400, detail="Negocio no encontrado en sesion")

    config = _obtener_config_negocio(db, negocio_objetivo)
    matriz = _normalizar_matriz_permisos(data.matriz)
    config.permisos_roles_json = json.dumps(matriz, ensure_ascii=False)

    db.commit()

    return {
        "ok": True,
        "mensaje": "Matriz de permisos actualizada",
        "negocio_id": negocio_objetivo,
        "matriz": matriz,
    }

# ==========================================
# CREAR USUARIO
# ==========================================
@router.post("/", response_model=UsuarioOut)
def crear_usuario(
    data: UsuarioCreate,
    current_user: dict = Depends(get_current_user_with_negocio),
    db: Session = Depends(get_db)
):
    _asegurar_actor_admin(db, current_user)
    _validar_limite_plan_usuarios(db, current_user)

    is_superadmin = bool(current_user.get("is_superadmin"))
    if is_superadmin:
        negocio_id = int(data.negocio_id or 0)
        if not negocio_id:
            raise HTTPException(status_code=400, detail="Superadministrador debe indicar negocio_id")
    else:
        negocio_id = int(current_user.get("negocio_id") or 0)
        if not negocio_id:
            raise HTTPException(status_code=400, detail="Negocio no encontrado en sesion")

    negocio = db.query(Negocio).filter(Negocio.id == negocio_id).first()
    if not negocio:
        raise HTTPException(status_code=404, detail="Negocio no encontrado")

    rol, roles_csv = _normalizar_roles(data.rol, data.roles)

    if str(data.usuario or "").strip().lower() == SUPERADMIN_USERNAME:
        raise HTTPException(status_code=400, detail="El usuario Admin esta reservado para el superadministrador")

    duplicado = get_usuario_by_username(db, data.usuario) if is_superadmin else (
        db.query(Usuario)
        .filter(
            Usuario.usuario == data.usuario,
            Usuario.negocio_id == negocio_id
        )
        .first()
    )
    if duplicado:
        raise HTTPException(status_code=400, detail="Usuario ya existe")

    usuario = Usuario(
        nombres=data.nombres,
        usuario=data.usuario,
        dni=(data.dni or "").strip() or None,
        email=data.email,
        password=hash_password(data.password),
        rol=rol,
        roles=roles_csv,
        negocio_id=negocio_id,
        activo=True
    )

    db.add(usuario)
    db.commit()
    db.refresh(usuario)

    return usuario
# ==========================================
# LISTAR USUARIOS
# ==========================================
@router.get("/", response_model=List[UsuarioOut])
def listar_usuarios(
    current_user: dict = Depends(get_current_user_with_negocio),
    db: Session = Depends(get_db)
):
    _asegurar_actor_admin(db, current_user)

    if current_user.get("is_superadmin"):
        return db.query(Usuario).order_by(Usuario.id.desc()).all()

    negocio_id = int(current_user.get("negocio_id"))

    return (
        db.query(Usuario)
        .filter(Usuario.negocio_id == negocio_id)
        .order_by(Usuario.id.desc())
        .all()
    )
# ==========================================
# OBTENER USUARIO
# ==========================================
@router.get("/{usuario_id}", response_model=UsuarioOut)
def obtener_usuario(
    usuario_id: int,
    current_user: dict = Depends(get_current_user_with_negocio),
    db: Session = Depends(get_db)
):
    _asegurar_actor_admin(db, current_user)

    negocio_id = None if current_user.get("is_superadmin") else int(current_user.get("negocio_id"))

    usuario = get_usuario_by_id(db, usuario_id, negocio_id)

    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    return usuario
# ==========================================
# ACTUALIZAR USUARIO
# ==========================================
@router.patch("/{usuario_id}", response_model=UsuarioOut)
def actualizar_usuario(
    usuario_id: int,
    data: UsuarioCreate,
    current_user: dict = Depends(get_current_user_with_negocio),
    db: Session = Depends(get_db)
):
    _asegurar_actor_admin(db, current_user)

    is_superadmin = bool(current_user.get("is_superadmin"))
    negocio_id = None if is_superadmin else int(current_user.get("negocio_id") or 0)

    rol, roles_csv = _normalizar_roles(data.rol, data.roles)

    usuario = get_usuario_by_id(db, usuario_id, negocio_id)

    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    if _es_superadmin_fijo(usuario):
        raise HTTPException(status_code=403, detail="La cuenta superadministrador unica no puede editarse desde este modulo")

    negocio_destino = int(data.negocio_id or usuario.negocio_id or 0)
    if not negocio_destino:
        raise HTTPException(status_code=400, detail="Debes asignar un negocio valido")

    negocio = db.query(Negocio).filter(Negocio.id == negocio_destino).first()
    if not negocio:
        raise HTTPException(status_code=404, detail="Negocio no encontrado")

    duplicado = (
        db.query(Usuario)
        .filter(
            Usuario.usuario == data.usuario,
            Usuario.id != usuario_id
        )
        .first()
    ) if is_superadmin else (
        db.query(Usuario)
        .filter(
            Usuario.usuario == data.usuario,
            Usuario.negocio_id == negocio_destino,
            Usuario.id != usuario_id
        )
        .first()
    )

    if duplicado:
        raise HTTPException(status_code=400, detail="Ya existe otro usuario con ese nombre")

    usuario.nombres = data.nombres
    usuario.usuario = data.usuario
    usuario.dni = (data.dni or "").strip() or None
    usuario.email = data.email
    if str(data.password or "").strip():
        usuario.password = hash_password(data.password)
    usuario.rol = rol
    usuario.roles = roles_csv
    usuario.negocio_id = negocio_destino

    db.commit()
    db.refresh(usuario)

    return usuario
# ==========================================
# ACTIVAR / DESACTIVAR USUARIO
# ==========================================
@router.patch("/{usuario_id}/estado")
def cambiar_estado_usuario(
    usuario_id: int,
    current_user: dict = Depends(get_current_user_with_negocio),
    db: Session = Depends(get_db)
):
    _asegurar_actor_admin(db, current_user)

    negocio_id = None if current_user.get("is_superadmin") else int(current_user.get("negocio_id"))

    usuario = get_usuario_by_id(db, usuario_id, negocio_id)

    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    if _es_superadmin_fijo(usuario):
        raise HTTPException(status_code=403, detail="La cuenta superadministrador unica no puede desactivarse")

    usuario.activo = not usuario.activo

    db.commit()

    return {
        "ok": True,
        "activo": usuario.activo
    }
# ==========================================
# ELIMINAR USUARIO
# ==========================================
@router.delete("/{usuario_id}")
def eliminar_usuario(
    usuario_id: int,
    current_user: dict = Depends(get_current_user_with_negocio),
    db: Session = Depends(get_db)
):
    _asegurar_actor_admin(db, current_user)

    negocio_id = None if current_user.get("is_superadmin") else int(current_user.get("negocio_id"))

    usuario = get_usuario_by_id(db, usuario_id, negocio_id)

    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    if _es_superadmin_fijo(usuario):
        raise HTTPException(status_code=403, detail="La cuenta superadministrador unica no puede eliminarse")

    # Limpiar tokens/codigos asociados para evitar violaciones de integridad.
    db.query(RefreshToken).filter(RefreshToken.usuario_id == usuario_id).delete(synchronize_session=False)
    db.query(TokenBlacklist).filter(TokenBlacklist.usuario_id == usuario_id).delete(synchronize_session=False)
    db.query(EmailVerification).filter(EmailVerification.usuario_id == usuario_id).delete(synchronize_session=False)
    db.query(PasswordReset).filter(PasswordReset.usuario_id == usuario_id).delete(synchronize_session=False)

    try:
        db.delete(usuario)
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="No se puede eliminar el usuario porque tiene registros relacionados"
        )

    return {
        "ok": True,
        "mensaje": "Usuario eliminado"
    }