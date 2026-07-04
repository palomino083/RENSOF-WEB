from datetime import datetime

from sqlalchemy import (
    Column,
    Integer,
    Float,
    String,
    DateTime,
    ForeignKey
)

from sqlalchemy.orm import relationship

from app.database.database import Base


class Venta(Base):
    __tablename__ = "ventas"

    id = Column(Integer, primary_key=True, index=True)

    # Relaciones opcionales
    cliente_id = Column(
        Integer,
        ForeignKey("clientes.id"),
        nullable=True
    )

    usuario_id = Column(
        Integer,
        ForeignKey("usuarios.id"),
        nullable=True
    )

    # Totales
    subtotal = Column(Float, default=0)
    descuento = Column(Float, default=0)
    total = Column(Float, default=0)

    # Control
    metodo_pago = Column(
        String(20),
        default="Efectivo"
    )

    tipo_comprobante = Column(
        String(20),
        default="NINGUNO"
    )

    cliente_nombre = Column(String(255), nullable=True)
    cliente_documento = Column(String(20), nullable=True)
    cliente_email = Column(String(120), nullable=True)

    serie_comprobante = Column(String(10), nullable=True)
    numero_comprobante = Column(String(20), nullable=True)

    sunat_estado = Column(String(30), nullable=True)
    sunat_codigo = Column(String(80), nullable=True)
    sunat_mensaje = Column(String(500), nullable=True)
    sunat_hash = Column(String(120), nullable=True)
    sunat_ticket = Column(String(120), nullable=True)
    sunat_cdr_url = Column(String(500), nullable=True)

    estado = Column(
        String(20),
        default="pagada"
    )

    fecha = Column(
        DateTime,
        default=datetime.utcnow
    )

    # Relaciones
    detalles = relationship(
        "VentaDetalle",
        back_populates="venta",
        cascade="all, delete-orphan"
    )

    cliente = relationship(
        "Cliente",
        lazy="joined"
    )

    usuario = relationship(
        "Usuario",
        lazy="joined"
    )