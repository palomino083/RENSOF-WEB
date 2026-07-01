from sqlalchemy.orm import Session

from app.models.movimiento_caja import MovimientoCaja


def registrar_movimiento(
    db: Session,
    caja_id: int,
    usuario_id: int,
    tipo: str,
    concepto: str,
    monto: float,
    venta_id: int | None = None,
):

    movimiento = MovimientoCaja(
        caja_id=caja_id,
        usuario_id=usuario_id,
        venta_id=venta_id,
        tipo=tipo,
        concepto=concepto,
        monto=monto,
    )

    db.add(movimiento)

    return movimiento