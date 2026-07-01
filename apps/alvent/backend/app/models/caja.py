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


class Caja(Base):

    __tablename__ = "cajas"

    id = Column(Integer, primary_key=True, index=True)

    usuario_id = Column(
        Integer,
        ForeignKey("usuarios.id"),
        nullable=False
    )

    fecha_apertura = Column(
        DateTime,
        default=datetime.utcnow
    )

    fecha_cierre = Column(
        DateTime,
        nullable=True
    )

    monto_inicial = Column(
        Float,
        default=0
    )

    total_ventas = Column(
        Float,
        default=0
    )

    total_ingresos = Column(
        Float,
        default=0
    )

    total_egresos = Column(
        Float,
        default=0
    )

    monto_final = Column(
        Float,
        default=0
    )

    diferencia = Column(
        Float,
        default=0
    )

    observacion = Column(
        String(300),
        nullable=True
    )

    estado = Column(
        String(20),
        default="abierta"
    )

    usuario = relationship(
        "Usuario",
        lazy="joined"
    )

    movimientos = relationship(
        "MovimientoCaja",
        back_populates="caja",
        cascade="all, delete-orphan"
    )