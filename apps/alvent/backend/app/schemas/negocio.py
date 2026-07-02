from pydantic import BaseModel, Field, EmailStr, ConfigDict
from typing import Optional
from datetime import datetime


class NegocioBase(BaseModel):
    """Base para operaciones de negocio"""
    nombre: str = Field(..., min_length=3, max_length=255)
    tipo: str
    plan: str = "BASICO"
    plan_gratuito_usuarios_limite: Optional[int] = None
    plan_gratuito_reportes_habilitado: bool = False
    plan_gratuito_reportes_limite: Optional[int] = None
    plan_gratuito_backups_habilitado: bool = False
    plan_gratuito_backups_limite: Optional[int] = None
    plan_monto_gratuito: Optional[float] = None
    plan_monto_prueba: Optional[float] = None
    plan_monto_basico: Optional[float] = None
    plan_monto_lite: Optional[float] = None
    plan_monto_pro: Optional[float] = None
    plan_monto_premium: Optional[float] = None
    descripcion: Optional[str] = None
    logo_url: Optional[str] = None
    
    ruc: Optional[str] = None
    razon_social: Optional[str] = None
    documento_propietario: Optional[str] = None
    
    email: Optional[EmailStr] = None
    telefono: Optional[str] = None
    whatsapp: Optional[str] = None
    
    pais: str = "Perú"
    departamento: Optional[str] = None
    provincia: Optional[str] = None
    distrito: Optional[str] = None
    direccion: Optional[str] = None
    codigo_postal: Optional[str] = None
    
    moneda: str = "PEN"
    zona_horaria: str = "America/Lima"
    idioma: str = "es"


class NegocioCreate(NegocioBase):
    """Para crear un nuevo negocio"""
    pass


class NegocioUpdate(BaseModel):
    """Para actualizar negocio"""
    nombre: Optional[str] = None
    tipo: Optional[str] = None
    plan: Optional[str] = None
    plan_gratuito_usuarios_limite: Optional[int] = None
    plan_gratuito_reportes_habilitado: Optional[bool] = None
    plan_gratuito_reportes_limite: Optional[int] = None
    plan_gratuito_backups_habilitado: Optional[bool] = None
    plan_gratuito_backups_limite: Optional[int] = None
    plan_monto_gratuito: Optional[float] = None
    plan_monto_prueba: Optional[float] = None
    plan_monto_basico: Optional[float] = None
    plan_monto_lite: Optional[float] = None
    plan_monto_pro: Optional[float] = None
    plan_monto_premium: Optional[float] = None
    descripcion: Optional[str] = None
    logo_url: Optional[str] = None
    ruc: Optional[str] = None
    razon_social: Optional[str] = None
    documento_propietario: Optional[str] = None
    email: Optional[EmailStr] = None
    telefono: Optional[str] = None
    whatsapp: Optional[str] = None
    pais: Optional[str] = None
    departamento: Optional[str] = None
    provincia: Optional[str] = None
    distrito: Optional[str] = None
    direccion: Optional[str] = None
    codigo_postal: Optional[str] = None
    moneda: Optional[str] = None
    zona_horaria: Optional[str] = None
    idioma: Optional[str] = None


class NegocioOut(NegocioBase):
    """Respuesta de negocio"""
    id: int
    activo: bool = True
    verificado: bool = False
    fecha_creacion: Optional[datetime] = None
    fecha_actualizacion: Optional[datetime] = None
    
    model_config = ConfigDict(from_attributes=True)


class SucursalBase(BaseModel):
    """Base para sucursal"""
    nombre: str = Field(..., min_length=3, max_length=255)
    codigo: str = Field(..., min_length=3, max_length=50)
    descripcion: Optional[str] = None
    telefono: Optional[str] = None
    email: Optional[str] = None
    
    pais: Optional[str] = None
    departamento: Optional[str] = None
    provincia: Optional[str] = None
    distrito: Optional[str] = None
    direccion: Optional[str] = None
    
    es_principal: bool = False


class SucursalCreate(SucursalBase):
    """Para crear sucursal"""
    pass


class SucursalOut(SucursalBase):
    """Respuesta de sucursal"""
    id: int
    negocio_id: int
    activo: bool
    fecha_creacion: datetime
    
    model_config = ConfigDict(from_attributes=True)


class ConfiguracionNegocioBase(BaseModel):
    """Base para configuración"""
    impuesto_predeterminado: float = 18.0
    margen_minimo: float = 10.0
    
    permitir_venta_negativo: bool = False
    permitir_descuentos: bool = True
    descuento_maximo_porcentaje: float = 50.0
    
    numero_caja: int = 1
    requiere_lote: bool = False
    requiere_vencimiento: bool = False
    stock_minimo_alerta: bool = True


class ConfiguracionNegocioUpdate(BaseModel):
    """Para actualizar configuración"""
    impuesto_predeterminado: Optional[float] = None
    margen_minimo: Optional[float] = None
    permitir_descuentos: Optional[bool] = None
    descuento_maximo_porcentaje: Optional[float] = None


class ConfiguracionNegocioOut(ConfiguracionNegocioBase):
    """Respuesta de configuración"""
    id: int
    negocio_id: int
    fecha_creacion: datetime
    fecha_actualizacion: datetime
    
    model_config = ConfigDict(from_attributes=True)


class PlanSolicitudCreate(BaseModel):
    plan_objetivo: str = Field(..., min_length=3, max_length=20)
    referencia_pago: str = Field(..., min_length=3, max_length=80)
    canal_pago: Optional[str] = Field(default="transferencia", max_length=30)
    observaciones: Optional[str] = Field(default=None, max_length=120)
    comprobante_url: Optional[str] = Field(default=None, max_length=500)


class PlanSolicitudOut(BaseModel):
    ok: bool
    mensaje: str
    plan_actual: str
    plan_solicitado: str
    referencia_pago: str


class PlanPagoHistorialOut(BaseModel):
    id: int
    plan_actual: str
    plan_solicitado: str
    canal_pago: str
    referencia_pago: str
    observaciones: Optional[str] = None
    comprobante_url: Optional[str] = None
    estado: str
    fecha: datetime
