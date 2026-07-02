from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from app.database.database import get_db
from app.models.negocio import Negocio
from app.models.usuario import Usuario
from app.utils.jwt_utils import get_token_data
from app.utils.planes import normalizar_plan

security = HTTPBearer()

SUPERADMIN_USERNAME = "admin"


def _normalizar_rol(rol: str | None) -> str:
    raw = str(rol or "").strip().upper()
    compacto = "".join(ch for ch in raw if ch.isalnum())
    if compacto in {"SUPERADMIN", "SUPERADMINISTRADOR"}:
        return "SUPERADMIN"
    if compacto in {"ADMIN", "ADMINISTRADOR"}:
        return "ADMINISTRADOR"
    return raw

async def get_current_user(
    token: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
) -> dict:
    """
    Dependencia para proteger endpoints
    Verifica que el token sea válido y retorna los datos del usuario
    """
    
    token_data = get_token_data(token.credentials)
    
    if not token_data:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido o expirado",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    usuario_id = int(token_data.get("usuario_id") or 0)
    usuario = db.query(Usuario).filter(Usuario.id == usuario_id).first()
    if not usuario:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuario no encontrado",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token_data["rol"] = _normalizar_rol(usuario.rol)
    token_data["roles"] = [
        _normalizar_rol(r)
        for r in str(getattr(usuario, "roles", "") or "").split(",")
        if r.strip()
    ]
    if not token_data["roles"] and token_data["rol"]:
        token_data["roles"] = [token_data["rol"]]

    if not token_data.get("negocio_id") and usuario.negocio_id:
        token_data["negocio_id"] = int(usuario.negocio_id)

    es_superadmin_fijo = str(getattr(usuario, "usuario", "") or "").strip().lower() == SUPERADMIN_USERNAME

    token_data["is_superadmin"] = (
        es_superadmin_fijo
        or
        usuario_id == 1
        or token_data["rol"] == "SUPERADMIN"
        or "SUPERADMIN" in token_data["roles"]
    )

    if token_data["is_superadmin"]:
        token_data["rol"] = "SUPERADMIN"
        token_data["roles"] = ["SUPERADMIN"]
        token_data["negocio_id"] = None

    negocio_id = int(token_data.get("negocio_id") or 0)
    if negocio_id:
        negocio = db.query(Negocio).filter(Negocio.id == negocio_id).first()
        try:
            token_data["plan"] = normalizar_plan(getattr(negocio, "plan", "BASICO"))
        except ValueError:
            token_data["plan"] = "BASICO"
    else:
        token_data["plan"] = "PREMIUM" if token_data["is_superadmin"] else "BASICO"

    return token_data


async def get_current_user_with_negocio(
    token_data: dict = Depends(get_current_user)
) -> dict:
    """
    Dependencia para proteger endpoints que requieren negocio_id
    """
    
    if token_data.get("is_superadmin"):
        return token_data

    if not token_data.get("negocio_id"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Usuario debe estar asociado con un negocio",
        )
    
    return token_data
