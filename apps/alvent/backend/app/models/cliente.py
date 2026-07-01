from sqlalchemy import Column, Integer, String, Boolean, ForeignKey
from app.database.database import Base

class Cliente(Base):
    __tablename__ = "clientes"

    id = Column(Integer, primary_key=True, index=True)

    negocio_id = Column(Integer, ForeignKey("negocios.id"), nullable=True, index=True)

    nombre = Column(String, nullable=False)
    dni = Column(String, unique=True, nullable=False)

    telefono = Column(String, nullable=True)
    email = Column(String, nullable=True)

    activo = Column(Boolean, default=True)