from sqlalchemy import Column, Integer, String, DateTime, Boolean, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime, timedelta
import secrets
from app.database.database import Base


class RefreshToken(Base):
    """
    Modelo para almacenar refresh tokens seguros.
    Permite token rotation y revocación de tokens.
    """
    __tablename__ = "refresh_tokens"

    id = Column(Integer, primary_key=True, index=True)
    usuario_id = Column(Integer, ForeignKey("usuarios.id", ondelete="CASCADE"), nullable=False, index=True)
    
    # Token hash (no guardamos plaintext)
    token_hash = Column(String(255), unique=True, index=True, nullable=False)
    
    # Información del token
    familia_token = Column(String(255), nullable=True, index=True)  # Para detectar revocación en cadena
    generacion = Column(Integer, default=0)  # Versión del token (para rotation)
    
    # Fechas
    fecha_creacion = Column(DateTime, default=datetime.utcnow, nullable=False)
    fecha_expiracion = Column(DateTime, nullable=False)
    fecha_revocacion = Column(DateTime, nullable=True)  # NULL = activo, !NULL = revocado
    
    # Estado
    activo = Column(Boolean, default=True, index=True)
    
    # IP y User Agent (auditoría)
    ip_address = Column(String(45), nullable=True)  # IPv4 o IPv6
    user_agent = Column(String(255), nullable=True)
    
    # Relación
    usuario = relationship("Usuario", backref="refresh_tokens")
    
    def es_valido(self) -> bool:
        """Verificar si el token es válido y no expirado"""
        return (
            self.activo and
            self.fecha_revocacion is None and
            datetime.utcnow() < self.fecha_expiracion
        )
    
    def revocar(self):
        """Revocar el token"""
        self.activo = False
        self.fecha_revocacion = datetime.utcnow()
    
    @staticmethod
    def generar_expiracion(dias: int = 30) -> datetime:
        """Generar fecha de expiración"""
        return datetime.utcnow() + timedelta(days=dias)
    
    @staticmethod
    def generar_token_familia() -> str:
        """Generar ID único de familia de tokens (para detección de rotación maliciosa)"""
        return secrets.token_urlsafe(32)


class TokenBlacklist(Base):
    """
    Modelo para tokens revocados explícitamente (por logout o compromiso).
    Opcional pero recomendado para aplicaciones con logout importante.
    """
    __tablename__ = "token_blacklist"
    
    id = Column(Integer, primary_key=True, index=True)
    usuario_id = Column(Integer, ForeignKey("usuarios.id", ondelete="CASCADE"), nullable=False, index=True)
    token_jti = Column(String(255), unique=True, index=True, nullable=False)  # JWT ID único
    fecha_revocacion = Column(DateTime, default=datetime.utcnow, nullable=False)
    fecha_expiracion = Column(DateTime, nullable=False)  # Cuando expirar este registro
    razon = Column(String(50), nullable=True)  # "logout", "compromised", "admin_revoke"
    
    usuario = relationship("Usuario", backref="token_blacklist")
