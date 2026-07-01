from datetime import datetime
from sqlalchemy import (
    Column,
    Integer,
    String,
    ForeignKey,
    DateTime
)
from sqlalchemy.orm import relationship

from app.database.database import Base


class InventarioMovimiento(Base):
    __tablename__ = "inventario_movimientos"

    id = Column(Integer, primary_key=True, index=True)

    producto_id = Column(
        Integer,
        ForeignKey("productos.id"),
        nullable=False
    )

    tipo = Column(
        String(20),
        nullable=False
    )  # ENTRADA | SALIDA | AJUSTE

    cantidad = Column(
        Integer,
        nullable=False
    )

    referencia = Column(
        String(100),
        nullable=True
    )

    fecha = Column(
        DateTime,
        default=datetime.utcnow
    )

    producto = relationship(
        "Producto",
        lazy="joined"
    )