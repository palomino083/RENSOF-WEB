from datetime import datetime

from sqlalchemy import Column, DateTime, Integer, String

from app.database.database import Base


class PlanPago(Base):
    __tablename__ = "planes_pagos"

    id = Column(Integer, primary_key=True, index=True)
    negocio_id = Column(Integer, index=True, nullable=False)
    usuario_id = Column(Integer, nullable=True)

    plan_actual = Column(String(20), nullable=False)
    plan_solicitado = Column(String(20), nullable=False)

    canal_pago = Column(String(30), nullable=False, default="transferencia")
    referencia_pago = Column(String(80), nullable=False)
    observaciones = Column(String(120), nullable=True)
    comprobante_url = Column(String(500), nullable=True)

    estado = Column(String(20), nullable=False, default="APLICADO")
    fecha = Column(DateTime, default=datetime.utcnow)
