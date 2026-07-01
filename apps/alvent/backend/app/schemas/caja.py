from datetime import datetime
from typing import Optional

from pydantic import BaseModel


# ==========================
# Apertura
# ==========================

class CajaAbrir(BaseModel):

    usuario_id: int
    monto_inicial: float


# ==========================
# Cierre
# ==========================

class CajaCerrar(BaseModel):

    monto_final: float
    observacion: Optional[str] = None


# ==========================
# Movimiento manual
# ==========================

class MovimientoCajaCreate(BaseModel):

    usuario_id: int

    tipo: str
    # INGRESO
    # EGRESO

    concepto: str

    monto: float


# ==========================
# Movimiento salida
# ==========================

class MovimientoCajaOut(BaseModel):

    id: int

    caja_id: int

    usuario_id: int

    venta_id: Optional[int]

    fecha: datetime

    tipo: str

    concepto: str

    monto: float

    class Config:
        from_attributes = True


# ==========================
# Caja salida
# ==========================

class CajaOut(BaseModel):

    id: int

    usuario_id: int

    fecha_apertura: datetime

    fecha_cierre: Optional[datetime]

    monto_inicial: float

    total_ventas: float

    total_ingresos: float

    total_egresos: float

    monto_final: float

    diferencia: float

    observacion: Optional[str]

    estado: str

    class Config:
        from_attributes = True