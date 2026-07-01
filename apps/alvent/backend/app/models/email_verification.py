from sqlalchemy import Column, Integer, String, DateTime, Boolean, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime, timedelta
import secrets
from app.database.database import Base


class EmailVerification(Base):
    """
    Modelo para verificación de emails.
    Almacena códigos de verificación con expiración.
    """
    __tablename__ = "email_verifications"

    id = Column(Integer, primary_key=True, index=True)
    usuario_id = Column(Integer, ForeignKey("usuarios.id", ondelete="CASCADE"), nullable=False, index=True)
    
    # Email a verificar
    email = Column(String(255), nullable=False, index=True)
    
    # Código de verificación (6 dígitos)
    codigo = Column(String(6), nullable=False, unique=True, index=True)
    
    # Fechas
    fecha_creacion = Column(DateTime, default=datetime.utcnow, nullable=False)
    fecha_expiracion = Column(DateTime, nullable=False)  # 30 minutos de validez
    fecha_verificacion = Column(DateTime, nullable=True)  # Cuando se verificó
    
    # Estado
    verificado = Column(Boolean, default=False, index=True)
    intentos = Column(Integer, default=0)  # Contador de intentos fallidos
    
    # Relación
    usuario = relationship("Usuario", backref="email_verifications")
    
    def es_valido(self) -> bool:
        """Verificar si el código está vigente y no verificado"""
        return (
            not self.verificado and
            datetime.utcnow() < self.fecha_expiracion and
            self.intentos < 5  # Max 5 intentos
        )
    
    @staticmethod
    def generar_codigo() -> str:
        """Generar código de verificación de 6 dígitos"""
        import random
        return str(random.randint(100000, 999999))
    
    @staticmethod
    def generar_expiracion(minutos: int = 30) -> datetime:
        """Generar fecha de expiración"""
        return datetime.utcnow() + timedelta(minutes=minutos)
    
    def verificar(self, codigo_ingresado: str) -> bool:
        """Verificar si el código es correcto"""
        if not self.es_valido():
            return False
        
        if codigo_ingresado == self.codigo:
            self.verificado = True
            self.fecha_verificacion = datetime.utcnow()
            return True
        
        # Incrementar intentos fallidos
        self.intentos += 1
        return False


class PasswordReset(Base):
    """
    Modelo para recuperación de contraseña.
    Almacena tokens de reset con expiración.
    """
    __tablename__ = "password_resets"

    id = Column(Integer, primary_key=True, index=True)
    usuario_id = Column(Integer, ForeignKey("usuarios.id", ondelete="CASCADE"), nullable=False, index=True)
    
    # Token único para reset
    token = Column(String(255), unique=True, index=True, nullable=False)
    
    # Email para validación
    email = Column(String(255), nullable=False)
    
    # Fechas
    fecha_creacion = Column(DateTime, default=datetime.utcnow, nullable=False)
    fecha_expiracion = Column(DateTime, nullable=False)  # 30 minutos de validez
    fecha_uso = Column(DateTime, nullable=True)  # Cuando se usó
    
    # Estado
    usado = Column(Boolean, default=False, index=True)
    
    # Relación
    usuario = relationship("Usuario", backref="password_resets")
    
    def es_valido(self) -> bool:
        """Verificar si el token es válido"""
        return (
            not self.usado and
            datetime.utcnow() < self.fecha_expiracion
        )
    
    @staticmethod
    def generar_token() -> str:
        """Generar token único para reset"""
        return secrets.token_urlsafe(32)
    
    @staticmethod
    def generar_expiracion(minutos: int = 30) -> datetime:
        """Generar fecha de expiración"""
        return datetime.utcnow() + timedelta(minutes=minutos)
    
    def usar(self):
        """Marcar token como usado"""
        self.usado = True
        self.fecha_uso = datetime.utcnow()
