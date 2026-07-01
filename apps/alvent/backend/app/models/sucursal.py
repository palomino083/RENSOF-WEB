from datetime import datetime
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from app.database.database import Base


class Sucursal(Base):
    __tablename__ = "sucursales"

    id = Column(Integer, primary_key=True, index=True)
    negocio_id = Column(Integer, ForeignKey("negocios.id"), nullable=False, index=True)

    nombre = Column(String(255), nullable=False)
    descripcion = Column(Text, nullable=True)
    codigo = Column(String(50), unique=True, nullable=False, index=True)

    telefono = Column(String(20), nullable=True)
    email = Column(String(255), nullable=True)

    pais = Column(String(100), nullable=True)
    departamento = Column(String(100), nullable=True)
    provincia = Column(String(100), nullable=True)
    distrito = Column(String(100), nullable=True)
    direccion = Column(String(255), nullable=True)

    es_principal = Column(Boolean, default=False)
    activo = Column(Boolean, default=True, index=True)

    fecha_creacion = Column(DateTime, default=datetime.utcnow)
    fecha_actualizacion = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    negocio = relationship("Negocio", back_populates="sucursales")