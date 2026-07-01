from datetime import datetime
from sqlalchemy import Column, Integer, Float, String, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from app.database.database import Base


class Venta(Base):
    __tablename__ = "ventas"

    id = Column(Integer, primary_key=True, index=True)

    cliente_id = Column(Integer, ForeignKey("clientes.id"), nullable=True)
    usuario_id = Column(Integer, ForeignKey("usuarios.id"), nullable=True)

    subtotal = Column(Float, default=0)
    descuento = Column(Float, default=0)
    total = Column(Float, default=0)

    metodo_pago = Column(String(20), default="Efectivo")
    estado = Column(String(20), default="pagada")

    fecha = Column(DateTime, default=datetime.utcnow)

    detalles = relationship(
        "VentaDetalle",
        back_populates="venta",
        cascade="all, delete-orphan"
    )

    cliente = relationship("Cliente")
    usuario = relationship("Usuario")