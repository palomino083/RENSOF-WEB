from datetime import date

from fastapi import APIRouter
from fastapi import Depends
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.database.database import get_db
from app.models.negocio import Negocio
from app.utils.planes import obtener_plan_config, normalizar_plan
from app.utils.dependencies import get_current_user_with_negocio

from app.services.reportes import (
    ventas_hoy,
    ventas_por_fechas,
    top_productos,
    stock_actual,
    stock_bajo,
    reporte_cajas,
    reporte_auditoria
)
from app.services.auditoria import registrar_auditoria

router = APIRouter(
    prefix="/reportes",
    tags=["Reportes"]
)


def _validar_plan_reportes(current_user: dict, db: Session) -> None:
    if bool(current_user.get("is_superadmin")):
        return

    negocio_id = int(current_user.get("negocio_id") or 0)
    negocio = db.query(Negocio).filter(Negocio.id == negocio_id).first()
    try:
        plan = normalizar_plan(getattr(negocio, "plan", "BASICO"))
    except ValueError:
        plan = "BASICO"
    config = obtener_plan_config(plan)

    if not config.reportes_habilitado:
        raise HTTPException(
            status_code=402,
            detail=f"Reportes avanzados no disponibles en plan {plan}",
        )


def _auditar_reporte(db: Session, current_user: dict, accion: str) -> None:
    registrar_auditoria(
        db=db,
        modulo="Reportes",
        accion=accion,
        descripcion=f"Consulta de {accion}",
        usuario=str(current_user.get("usuario_id") or "Sistema"),
    )


@router.get("/ventas-hoy")
def obtener_ventas_hoy(
    current_user: dict = Depends(get_current_user_with_negocio),
    db: Session = Depends(get_db)
):
    _validar_plan_reportes(current_user, db)
    _auditar_reporte(db, current_user, "ventas_hoy")
    return ventas_hoy(db, current_user)


@router.get("/ventas-fechas")
def obtener_ventas_fechas(
    fecha_inicio: date,
    fecha_fin: date,
    current_user: dict = Depends(get_current_user_with_negocio),
    db: Session = Depends(get_db)
):
    _validar_plan_reportes(current_user, db)
    _auditar_reporte(db, current_user, "ventas_fechas")
    return ventas_por_fechas(
        db,
        fecha_inicio,
        fecha_fin,
        current_user,
    )


@router.get("/top-productos")
def obtener_top_productos(
    current_user: dict = Depends(get_current_user_with_negocio),
    db: Session = Depends(get_db)
):
    _validar_plan_reportes(current_user, db)
    _auditar_reporte(db, current_user, "top_productos")
    return top_productos(db)


@router.get("/stock")
def obtener_stock(
    current_user: dict = Depends(get_current_user_with_negocio),
    db: Session = Depends(get_db)
):
    _validar_plan_reportes(current_user, db)
    _auditar_reporte(db, current_user, "stock")
    return stock_actual(db)


@router.get("/stock-bajo")
def obtener_stock_bajo(
    minimo: int = 5,
    current_user: dict = Depends(get_current_user_with_negocio),
    db: Session = Depends(get_db)
):
    _validar_plan_reportes(current_user, db)
    _auditar_reporte(db, current_user, "stock_bajo")
    return stock_bajo(db, minimo)


@router.get("/cajas")
def obtener_cajas(
    current_user: dict = Depends(get_current_user_with_negocio),
    db: Session = Depends(get_db)
):
    _validar_plan_reportes(current_user, db)
    _auditar_reporte(db, current_user, "cajas")
    return reporte_cajas(db)


@router.get("/auditoria")
def obtener_auditoria(
    limite: int = 100,
    current_user: dict = Depends(get_current_user_with_negocio),
    db: Session = Depends(get_db)
):
    _validar_plan_reportes(current_user, db)
    _auditar_reporte(db, current_user, "auditoria")
    return reporte_auditoria(
        db,
        limite
    )