from datetime import datetime

from sqlalchemy import Column, DateTime, Integer, String, Text

from app.database.database import Base


class SoporteTicket(Base):
    __tablename__ = "soporte_tickets"

    id = Column(Integer, primary_key=True, index=True)
    negocio_id = Column(Integer, index=True, nullable=True)
    usuario_id = Column(Integer, index=True, nullable=False)

    asunto = Column(String(140), nullable=False)
    consulta = Column(Text, nullable=False)
    prioridad = Column(String(20), nullable=False, default="MEDIA")
    estado = Column(String(20), nullable=False, default="ABIERTO")

    recomendación_ia = Column(Text, nullable=True)
    respuesta_superadmin = Column(Text, nullable=True)

    atendido_por_usuario_id = Column(Integer, nullable=True)
    fecha_creacion = Column(DateTime, default=datetime.utcnow, nullable=False)
    fecha_actualizacion = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
