from datetime import datetime

from sqlalchemy import (
    Column,
    Integer,
    Float,
    DateTime,
    String,
    ForeignKey
)

from sqlalchemy.orm import relationship

from app.database.database import Base


class MovimientoCaja(Base):

    __tablename__ = "movimientos_caja"

    id = Column(Integer, primary_key=True, index=True)

    caja_id = Column(
        Integer,
        ForeignKey("cajas.id"),
        nullable=False
    )

    usuario_id = Column(
        Integer,
        ForeignKey("usuarios.id"),
        nullable=False
    )

    venta_id = Column(
        Integer,
        ForeignKey("ventas.id"),
        nullable=True
    )

    fecha = Column(
        DateTime,
        default=datetime.utcnow
    )

    tipo = Column(
        String(20)
    )
    # APERTURA
    # VENTA
    # INGRESO
    # EGRESO
    # AJUSTE
    # CIERRE

    concepto = Column(
        String(300)
    )

    monto = Column(
        Float
    )

    caja = relationship(
        "Caja",
        back_populates="movimientos"
    )

    usuario = relationship(
        "Usuario"
    )

    venta = relationship(
        "Venta"
    )