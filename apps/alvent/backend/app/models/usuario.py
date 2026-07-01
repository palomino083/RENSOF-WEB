from datetime import datetime
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey
from app.database.database import Base


class Usuario(Base):
    __tablename__ = "usuarios"

    id = Column(Integer, primary_key=True, index=True)
    
    # Relación con negocio
    negocio_id = Column(Integer, ForeignKey("negocios.id"), nullable=True, index=True)

    # Información personal
    nombres = Column(String(150), nullable=False)
    usuario = Column(String(50), unique=True, index=True, nullable=False)
    dni = Column(String(20), nullable=True, index=True)
    email = Column(String(120), nullable=True, unique=True, index=True)

    # Autenticación
    password = Column(String(255), nullable=False)
    
    # Verificación de email
    email_verificado = Column(Boolean, default=False, index=True)
    
    # Permisos
    rol = Column(String(20), nullable=False, default="CAJERO")
    roles = Column(String(120), nullable=True)
    activo = Column(Boolean, default=True, nullable=False, index=True)
    
    # Auditoría
    fecha_creacion = Column(DateTime, default=datetime.utcnow)
    fecha_ultima_conexion = Column(DateTime, nullable=True)