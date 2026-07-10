from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database.database import get_db
from app.services.dashboard import obtener_overview
from app.utils.dependencies import get_current_user


router = APIRouter(
    prefix="/dashboard",
    tags=["Dashboard"],
)


@router.get("/overview")
def overview(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Retorna la información consolidada del dashboard.

    - Superadministrador técnico: información global.
    - Usuario normal: información correspondiente a su negocio.
    """

    usuario_id_raw = (
        current_user.get("usuario_id")
        or current_user.get("id")
        or current_user.get("sub")
        or 0
    )

    negocio_id_raw = (
        current_user.get("negocio_id")
        or current_user.get("empresa_id")
    )

    rol = str(current_user.get("rol") or "").strip().upper()

    try:
        usuario_id = int(usuario_id_raw)
    except (TypeError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Identificador de usuario inválido",
        )

    negocio_id = None

    if negocio_id_raw not in (None, "", 0, "0"):
        try:
            negocio_id = int(negocio_id_raw)
        except (TypeError, ValueError):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Identificador de negocio inválido",
            )

    es_superadmin = (
        usuario_id == 1
        or rol in {"SUPERADMIN", "SUPER_ADMIN", "SUPERADMINISTRADOR"}
    )

    # El superadministrador puede consultar información global.
    if es_superadmin:
        return obtener_overview(
            db=db,
            negocio_id=None,
        )

    if negocio_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Usuario debe estar asociado con un negocio",
        )

    return obtener_overview(
        db=db,
        negocio_id=negocio_id,
    )