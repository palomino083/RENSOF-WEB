from datetime import datetime
from pydantic import BaseModel, Field, ConfigDict


class IngresoPlanOut(BaseModel):
    id: int
    negocio_id: int
    negocio_nombre: str
    plan_solicitado: str
    canal_pago: str
    referencia_pago: str
    fecha: datetime
    monto: float


class GastoOperativoBase(BaseModel):
    categoria: str = Field(..., min_length=3, max_length=40)
    descripcion: str = Field(..., min_length=3, max_length=200)
    monto: float = Field(..., gt=0)
    proveedor: str | None = Field(default=None, max_length=120)
    fecha_gasto: datetime | None = None


class GastoOperativoCreate(GastoOperativoBase):
    pass


class GastoOperativoUpdate(BaseModel):
    categoria: str | None = Field(default=None, min_length=3, max_length=40)
    descripcion: str | None = Field(default=None, min_length=3, max_length=200)
    monto: float | None = Field(default=None, gt=0)
    proveedor: str | None = Field(default=None, max_length=120)
    fecha_gasto: datetime | None = None


class GastoOperativoOut(BaseModel):
    id: int
    categoria: str
    descripcion: str
    monto: float
    proveedor: str | None = None
    comprobante_url: str | None = None
    fecha_gasto: datetime
    creado_por: int | None = None
    fecha_creacion: datetime
    fecha_actualizacion: datetime

    model_config = ConfigDict(from_attributes=True)


class ResumenFinanzasOut(BaseModel):
    periodo: str
    ingresos_total: float
    gastos_total: float
    utilidad_total: float
    ingresos: list[IngresoPlanOut]
    gastos: list[GastoOperativoOut]


class CierreMensualCreate(BaseModel):
    periodo: str = Field(..., pattern=r"^\d{4}-\d{2}$")
    observaciones: str | None = Field(default=None, max_length=500)


class CierreMensualOut(BaseModel):
    id: int
    periodo: str
    ingresos_total: float
    gastos_total: float
    utilidad_total: float
    observaciones: str | None = None
    cerrado_por: int | None = None
    fecha_cierre: datetime

    model_config = ConfigDict(from_attributes=True)
