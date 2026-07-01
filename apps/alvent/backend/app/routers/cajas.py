from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database.database import get_db

from app.models.caja import Caja
from app.models.movimiento_caja import MovimientoCaja
from app.models.usuario import Usuario

from app.schemas.caja import (
    CajaAbrir,
    CajaCerrar,
    CajaOut,
    MovimientoCajaCreate,
    MovimientoCajaOut,
)

from app.services.caja import obtener_caja_abierta
from app.services.movimientos_caja import registrar_movimiento
from app.utils.dependencies import get_current_user_with_negocio

router = APIRouter(
    prefix="/cajas",
    tags=["Cajas"],
)

# ======================================================
# LISTAR CAJAS
# ======================================================

@router.get("/", response_model=list[CajaOut])
def listar_cajas(
    current_user: dict = Depends(get_current_user_with_negocio),
    db: Session = Depends(get_db)
):
    if current_user.get("is_superadmin"):
        return db.query(Caja).order_by(Caja.id.desc()).all()

    negocio_id = int(current_user.get("negocio_id"))

    return (
        db.query(Caja)
        .join(Usuario, Usuario.id == Caja.usuario_id)
        .filter(Usuario.negocio_id == negocio_id)
        .order_by(Caja.id.desc())
        .all()
    )


# ======================================================
# CAJA ACTUAL
# ======================================================

@router.get("/actual", response_model=CajaOut)
def caja_actual(
    current_user: dict = Depends(get_current_user_with_negocio),
    db: Session = Depends(get_db)
):
    negocio_id = None if current_user.get("is_superadmin") else int(current_user.get("negocio_id"))

    caja = obtener_caja_abierta(db, negocio_id)

    if caja is None:
        raise HTTPException(
            status_code=404,
            detail="No existe caja abierta"
        )

    return caja


# ======================================================
# ABRIR CAJA
# ======================================================

@router.post("/abrir", response_model=CajaOut)
def abrir_caja(
    data: CajaAbrir,
    current_user: dict = Depends(get_current_user_with_negocio),
    db: Session = Depends(get_db)
):
    is_superadmin = bool(current_user.get("is_superadmin"))
    negocio_id = None if is_superadmin else int(current_user.get("negocio_id"))

    if obtener_caja_abierta(db, negocio_id):

        raise HTTPException(
            status_code=400,
            detail="Ya existe una caja abierta"
        )

    usuario = db.query(Usuario).filter(Usuario.id == data.usuario_id).first()
    if not usuario:
        raise HTTPException(status_code=403, detail="Usuario inválido para este negocio")

    if not is_superadmin and usuario.negocio_id != negocio_id:
        raise HTTPException(status_code=403, detail="Usuario inválido para este negocio")

    caja = Caja(
        usuario_id=data.usuario_id,
        monto_inicial=data.monto_inicial,
        total_ventas=0,
        total_ingresos=0,
        total_egresos=0,
        monto_final=0,
        diferencia=0,
        estado="abierta",
    )

    db.add(caja)
    db.commit()
    db.refresh(caja)

    registrar_movimiento(
        db=db,
        caja_id=caja.id,
        usuario_id=data.usuario_id,
        tipo="APERTURA",
        concepto="Apertura de caja",
        monto=data.monto_inicial,
    )

    return caja


# ======================================================
# INGRESO
# ======================================================

@router.post("/ingreso")
def ingreso_caja(
    data: MovimientoCajaCreate,
    current_user: dict = Depends(get_current_user_with_negocio),
    db: Session = Depends(get_db)
):
    negocio_id = None if current_user.get("is_superadmin") else int(current_user.get("negocio_id"))

    caja = obtener_caja_abierta(db, negocio_id)

    if caja is None:

        raise HTTPException(
            status_code=400,
            detail="No existe caja abierta"
        )

    registrar_movimiento(
        db=db,
        caja_id=caja.id,
        usuario_id=data.usuario_id,
        tipo="INGRESO",
        concepto=data.concepto,
        monto=data.monto,
    )

    caja.total_ingresos += data.monto

    db.commit()

    return {
        "mensaje": "Ingreso registrado correctamente"
    }


# ======================================================
# EGRESO
# ======================================================

@router.post("/egreso")
def egreso_caja(
    data: MovimientoCajaCreate,
    current_user: dict = Depends(get_current_user_with_negocio),
    db: Session = Depends(get_db)
):
    negocio_id = None if current_user.get("is_superadmin") else int(current_user.get("negocio_id"))

    caja = obtener_caja_abierta(db, negocio_id)

    if caja is None:

        raise HTTPException(
            status_code=400,
            detail="No existe caja abierta"
        )

    registrar_movimiento(
        db=db,
        caja_id=caja.id,
        usuario_id=data.usuario_id,
        tipo="EGRESO",
        concepto=data.concepto,
        monto=data.monto,
    )

    caja.total_egresos += data.monto

    db.commit()

    return {
        "mensaje": "Egreso registrado correctamente"
    }


# ======================================================
# MOVIMIENTOS
# ======================================================

@router.get(
    "/movimientos",
    response_model=list[MovimientoCajaOut]
)
def movimientos(
    current_user: dict = Depends(get_current_user_with_negocio),
    db: Session = Depends(get_db)
):
    negocio_id = None if current_user.get("is_superadmin") else int(current_user.get("negocio_id"))

    caja = obtener_caja_abierta(db, negocio_id)

    if caja is None:

        raise HTTPException(
            status_code=404,
            detail="No existe caja abierta"
        )

    return (
        db.query(MovimientoCaja)
        .filter(
            MovimientoCaja.caja_id == caja.id
        )
        .order_by(
            MovimientoCaja.fecha.desc()
        )
        .all()
    )


# ======================================================
# CERRAR CAJA
# ======================================================

@router.put("/cerrar/{caja_id}")
def cerrar_caja(
    caja_id: int,
    data: CajaCerrar,
    current_user: dict = Depends(get_current_user_with_negocio),
    db: Session = Depends(get_db)
):
    is_superadmin = bool(current_user.get("is_superadmin"))
    negocio_id = None if is_superadmin else int(current_user.get("negocio_id"))

    caja = (
        db.query(Caja)
        .filter(Caja.id == caja_id)
        .first()
    ) if is_superadmin else (
        db.query(Caja)
        .join(Usuario, Usuario.id == Caja.usuario_id)
        .filter(
            Caja.id == caja_id,
            Usuario.negocio_id == negocio_id
        )
        .first()
    )

    if caja is None:

        raise HTTPException(
            status_code=404,
            detail="Caja no encontrada"
        )

    if caja.estado == "cerrada":

        raise HTTPException(
            status_code=400,
            detail="La caja ya está cerrada"
        )

    saldo_esperado = (
        caja.monto_inicial
        + caja.total_ventas
        + caja.total_ingresos
        - caja.total_egresos
    )

    caja.monto_final = data.monto_final
    caja.diferencia = data.monto_final - saldo_esperado
    caja.observacion = data.observacion
    caja.estado = "cerrada"
    caja.fecha_cierre = datetime.utcnow()

    registrar_movimiento(
        db=db,
        caja_id=caja.id,
        usuario_id=caja.usuario_id,
        tipo="CIERRE",
        concepto="Cierre de caja",
        monto=data.monto_final,
    )

    db.commit()

    return {
        "mensaje": "Caja cerrada correctamente",
        "saldo_esperado": saldo_esperado,
        "monto_final": caja.monto_final,
        "diferencia": caja.diferencia,
    }