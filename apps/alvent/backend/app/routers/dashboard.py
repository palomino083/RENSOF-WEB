from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database.database import get_db
from app.services.dashboard import obtener_overview
from app.utils.dependencies import get_current_user

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@router.get("/overview")
def overview(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    negocio_id = current_user.get("negocio_id")
    usuario_id = int(current_user.get("usuario_id") or 0)

    if usuario_id == 1:
        return obtener_overview(db=db, negocio_id=None)

    # Fallback para superadmin técnico sin negocio asociado.
    if not negocio_id:
        raise HTTPException(
            status_code=403,
            detail="Usuario debe estar asociado con un negocio"
        )

    return obtener_overview(
        db=db,
        negocio_id=int(negocio_id)
    )