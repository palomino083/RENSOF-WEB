from sqlalchemy import Column, Integer, Float, ForeignKey
from sqlalchemy.orm import relationship

from app.database.database import Base


class VentaDetalle(Base):
    __tablename__ = "venta_detalles"

    id = Column(Integer, primary_key=True, index=True)

    venta_id = Column(Integer, ForeignKey("ventas.id"))
    producto_id = Column(Integer, ForeignKey("productos.id"))

    cantidad = Column(Integer, nullable=False)

    precio_unitario = Column(Float, nullable=False)
    subtotal = Column(Float, default=0)
    costo_unitario = Column(Float, default=0)

    venta = relationship(
        "Venta",
        back_populates="detalles"
    )

    producto = relationship("Producto")