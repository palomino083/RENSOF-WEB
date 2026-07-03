from datetime import datetime
from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, ForeignKey, JSON
from sqlalchemy.ext.mutable import MutableDict
from app.database.database import Base


class Producto(Base):
    __tablename__ = "productos"

    id = Column(Integer, primary_key=True, index=True)

    negocio_id = Column(Integer, ForeignKey("negocios.id"), nullable=True, index=True)

    codigo = Column(String(50), unique=True, index=True, nullable=False)
    codigo_barras = Column(String(100), unique=True, index=True, nullable=True)

    nombre = Column(String(255), index=True, nullable=False)
    categoria = Column(String(100), nullable=True)
    marca = Column(String(100), nullable=True)
    talla = Column(String(50), nullable=True)
    color = Column(String(50), nullable=True)
    sexo = Column(String(20), nullable=True)

    precio = Column(Float, nullable=False)
    costo = Column(Float, default=0)

    stock = Column(Integer, default=0)
    stock_minimo = Column(Integer, default=5)

    foto = Column(String(255), nullable=True)
    atributos_extra = Column(MutableDict.as_mutable(JSON), nullable=True, default=dict)

    activo = Column(Boolean, default=True)

    fecha_creacion = Column(DateTime, default=datetime.utcnow)
    fecha_actualizacion = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)