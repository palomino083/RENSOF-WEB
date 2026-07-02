from datetime import datetime

from sqlalchemy import Column, DateTime, Float, Integer, String, Text

from app.database.database import Base


class GastoOperativo(Base):
    __tablename__ = "gastos_operativos"

    id = Column(Integer, primary_key=True, index=True)
    categoria = Column(String(40), nullable=False, index=True)
    descripcion = Column(String(200), nullable=False)
    monto = Column(Float, nullable=False)
    proveedor = Column(String(120), nullable=True)
    comprobante_url = Column(String(500), nullable=True)
    fecha_gasto = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)
    creado_por = Column(Integer, nullable=True)
    fecha_creacion = Column(DateTime, nullable=False, default=datetime.utcnow)
    fecha_actualizacion = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class CierreMensualFinanzas(Base):
    __tablename__ = "finanzas_cierres_mensuales"

    id = Column(Integer, primary_key=True, index=True)
    periodo = Column(String(7), nullable=False, unique=True, index=True)  # YYYY-MM
    ingresos_total = Column(Float, nullable=False, default=0)
    gastos_total = Column(Float, nullable=False, default=0)
    utilidad_total = Column(Float, nullable=False, default=0)
    observaciones = Column(Text, nullable=True)
    cerrado_por = Column(Integer, nullable=True)
    fecha_cierre = Column(DateTime, nullable=False, default=datetime.utcnow)
