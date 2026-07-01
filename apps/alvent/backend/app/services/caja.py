from sqlalchemy.orm import Session

from app.models.caja import Caja
from app.models.usuario import Usuario
from app.services.movimientos_caja import registrar_movimiento


def obtener_caja_abierta(db: Session, negocio_id: int | None = None):

    if negocio_id is None:
        return (
            db.query(Caja)
            .filter(Caja.estado == "abierta")
            .first()
        )

    return (
        db.query(Caja)
        .join(Usuario, Usuario.id == Caja.usuario_id)
        .filter(
            Caja.estado == "abierta",
            Usuario.negocio_id == negocio_id
        )
        .first()
    )


def registrar_venta_en_caja(
    db: Session,
    caja: Caja,
    usuario_id: int,
    venta_id: int,
    total: float,
):

    if caja.total_ventas is None:
        caja.total_ventas = 0

    caja.total_ventas += total

    registrar_movimiento(
        db=db,
        caja_id=caja.id,
        usuario_id=usuario_id,
        venta_id=venta_id,
        tipo="VENTA",
        concepto=f"Venta #{venta_id}",
        monto=total,
    )