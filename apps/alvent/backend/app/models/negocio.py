from sqlalchemy import Boolean, Column, Float, Integer, String, Text
from sqlalchemy.orm import relationship
from app.database.database import Base
import enum


class TipoNegocio(str, enum.Enum):
    TIENDA = "tienda"
    RESTAURANTE = "restaurante"
    FARMACIA = "farmacia"
    SUPERMERCADO = "supermercado"
    BOUTIQUE = "boutique"
    KIOSKO = "kiosko"
    OTRO = "otro"


class Negocio(Base):
    __tablename__ = "negocios"

    id = Column(Integer, primary_key=True, index=True)

    nombre = Column(String(255), nullable=False, index=True)
    tipo = Column(String(50), nullable=False)
    plan = Column(String(20), nullable=False, default="BASICO")
    plan_gratuito_usuarios_limite = Column(Integer, nullable=True)
    plan_gratuito_reportes_habilitado = Column(Boolean, nullable=False, default=False)
    plan_gratuito_reportes_limite = Column(Integer, nullable=True)
    plan_gratuito_backups_habilitado = Column(Boolean, nullable=False, default=False)
    plan_gratuito_backups_limite = Column(Integer, nullable=True)
    plan_monto_gratuito = Column(Float, nullable=True)
    plan_monto_prueba = Column(Float, nullable=True)
    plan_monto_basico = Column(Float, nullable=True)
    plan_monto_lite = Column(Float, nullable=True)
    plan_monto_pro = Column(Float, nullable=True)
    plan_monto_premium = Column(Float, nullable=True)
    plan_simulador_escenarios = Column(Text, nullable=True)
    descripcion = Column(Text, nullable=True)
    logo_url = Column(String(500), nullable=True)

    sucursales = relationship(
        "Sucursal",
        back_populates="negocio",
        cascade="all, delete-orphan"
    )