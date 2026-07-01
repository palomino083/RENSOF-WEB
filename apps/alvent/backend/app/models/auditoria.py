from sqlalchemy import Column, Integer, String, DateTime
from datetime import datetime

from app.database.database import Base


class Auditoria(Base):

    __tablename__ = "auditoria"

    id = Column(Integer, primary_key=True, index=True)

    modulo = Column(String(50))

    accion = Column(String(100))

    descripcion = Column(String(255))

    usuario = Column(String(100))

    fecha = Column(
        DateTime,
        default=datetime.utcnow
    )