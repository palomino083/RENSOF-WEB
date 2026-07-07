import re

from pydantic import BaseModel, Field, EmailStr, ConfigDict, field_validator
from typing import Optional
from datetime import datetime


class NegocioBase(BaseModel):
    """Base para operaciones de negocio"""
    nombre: str = Field(..., min_length=3, max_length=255)
    tipo: str
    plan: str = "GRATUITO"
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

    @field_validator("ruc", mode="before")
    @classmethod
    def validar_ruc(cls, value: Optional[str]):
        if value is None:
            return None

        raw = str(value).strip()
        if raw == "":
            return None

        if not re.fullmatch(r"\d{11}", raw):
            raise ValueError("RUC debe tener exactamente 11 digitos numericos")

        return raw

    @field_validator("telefono", "whatsapp", mode="before")
    @classmethod
    def validar_celular(cls, value: Optional[str]):
        if value is None:
            return None

        raw = str(value).strip()
        if raw == "":
            return None

        if not re.fullmatch(r"\d{9}", raw):
            raise ValueError("Celular debe tener exactamente 9 digitos numericos")

        return raw


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

    @field_validator("ruc", mode="before")
    @classmethod
    def validar_ruc(cls, value: Optional[str]):
        if value is None:
            return None

        raw = str(value).strip()
        if raw == "":
            return None

        if not re.fullmatch(r"\d{11}", raw):
            raise ValueError("RUC debe tener exactamente 11 digitos numericos")

        return raw

    @field_validator("telefono", "whatsapp", mode="before")
    @classmethod
    def validar_celular(cls, value: Optional[str]):
        if value is None:
            return None

        raw = str(value).strip()
        if raw == "":
            return None

        if not re.fullmatch(r"\d{9}", raw):
            raise ValueError("Celular debe tener exactamente 9 digitos numericos")

        return raw


class NegocioOut(NegocioBase):
    """Respuesta de negocio"""
    id: int
    activo: bool = True
    verificado: bool = False
    plan_vigente_hasta: Optional[datetime] = None
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


class configuracionNegocioBase(BaseModel):
    """Base para configuracion"""
    impuesto_predeterminado: float = 18.0
    margen_minimo: float = 10.0
    
    permitir_venta_negativo: bool = False
    permitir_descuentos: bool = True
    descuento_maximo_porcentaje: float = 50.0
    
    numero_caja: int = 1
    requiere_lote: bool = False
    requiere_vencimiento: bool = False
    stock_minimo_alerta: bool = True
    integracion_sunat: bool = False
    sunat_proveedor: str = "NUBEFACT"
    sunat_api_url: Optional[str] = None
    sunat_usuario_sol: Optional[str] = None
    sunat_emisor_ruc: Optional[str] = None
    sunat_modo: str = "beta"
    sunat_serie_boleta: Optional[str] = None
    sunat_serie_factura: Optional[str] = None


class configuracionNegocioUpdate(BaseModel):
    """Para actualizar configuracion"""
    impuesto_predeterminado: Optional[float] = None
    margen_minimo: Optional[float] = None
    permitir_descuentos: Optional[bool] = None
    descuento_maximo_porcentaje: Optional[float] = None
    integracion_sunat: Optional[bool] = None
    sunat_proveedor: Optional[str] = None
    sunat_api_url: Optional[str] = None
    sunat_api_token: Optional[str] = None
    sunat_usuario_sol: Optional[str] = None
    sunat_clave_sol: Optional[str] = None
    sunat_emisor_ruc: Optional[str] = None
    sunat_modo: Optional[str] = None
    sunat_serie_boleta: Optional[str] = None
    sunat_serie_factura: Optional[str] = None


class configuracionNegocioOut(configuracionNegocioBase):
    """Respuesta de configuracion"""
    id: int
    negocio_id: int
    sunat_has_api_token: bool = False
    sunat_has_clave_sol: bool = False
    fecha_creacion: datetime
    fecha_actualizacion: datetime
    
    model_config = ConfigDict(from_attributes=True)


class SunatConexionTestOut(BaseModel):
    ok: bool
    status_code: int
    endpoint: str
    proveedor: str
    mensaje: str
    detalle: Optional[str] = None


class PlanSolicitudCreate(BaseModel):
    plan_objetivo: str = Field(..., min_length=3, max_length=20)
    referencia_pago: str = Field(..., min_length=3, max_length=80)
    duracion_dias: Optional[int] = Field(default=None, ge=1, le=3650)
    canal_pago: Optional[str] = Field(default="transferencia", max_length=30)
    validacion_modo: Optional[str] = Field(default="AUTO", max_length=20)
    declaracion_anti_fraude: bool = False
    observaciones: Optional[str] = Field(default=None, max_length=120)
    comprobante_url: Optional[str] = Field(default=None, max_length=500)


class PlanSolicitudOut(BaseModel):
    ok: bool
    mensaje: str
    plan_actual: str
    plan_solicitado: str
    duracion_dias_aplicada: Optional[int] = None
    plan_vigente_desde: Optional[datetime] = None
    plan_vigente_hasta: Optional[datetime] = None
    referencia_pago: str
    estado: str
    validacion_modo_solicitada: str
    validacion_modo_aplicada: str
    riesgo_score: int
    riesgo_nivel: str


class PlanPagoHistorialOut(BaseModel):
    id: int
    usuario_id: Optional[int] = None
    plan_actual: str
    plan_solicitado: str
    duracion_dias: Optional[int] = None
    plan_vigente_desde: Optional[datetime] = None
    plan_vigente_hasta: Optional[datetime] = None
    canal_pago: str
    referencia_pago: str
    observaciones: Optional[str] = None
    comprobante_url: Optional[str] = None
    estado: str
    fecha: datetime
