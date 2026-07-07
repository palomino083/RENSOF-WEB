from datetime import datetime
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Float, Text
from app.database.database import Base


class configuracionNegocio(Base):
    """Modelo de configuracion del negocio - Seteos específicos por empresa"""
    __tablename__ = "configuracion_negocio"

    id = Column(Integer, primary_key=True, index=True)
    negocio_id = Column(Integer, ForeignKey("negocios.id"), nullable=False, unique=True, index=True)

    # Impuestos y márgenes
    impuesto_predeterminado = Column(Float, default=18.0)  # IGV
    margen_minimo = Column(Float, default=10.0)

    # Políticas de venta
    permitir_venta_negativo = Column(Boolean, default=False)
    permitir_descuentos = Column(Boolean, default=True)
    descuento_maximo_porcentaje = Column(Float, default=50.0)

    # Caja
    redondeo_venta = Column(Float, default=0.01)  # 0.01 = s/.0.01
    numero_caja = Column(Integer, default=1)

    # Reportes y formatos
    formato_factura = Column(String(50), default="comprobante")
    numero_comprobantes = Column(Integer, default=1000)
    formato_documento = Column(String(20), default="A4")

    # configuracion de producto
    requiere_lote = Column(Boolean, default=False)
    requiere_vencimiento = Column(Boolean, default=False)
    stock_minimo_alerta = Column(Boolean, default=True)

    # API y integraciones
    integracion_sunat = Column(Boolean, default=False)
    sunat_proveedor = Column(String(30), default="NUBEFACT")
    integracion_whatsapp = Column(Boolean, default=False)
    integracion_email = Column(Boolean, default=True)
    sunat_api_url = Column(String(500), nullable=True)
    sunat_api_token = Column(String(255), nullable=True)
    sunat_usuario_sol = Column(String(80), nullable=True)
    sunat_clave_sol = Column(String(120), nullable=True)
    sunat_emisor_ruc = Column(String(11), nullable=True)
    sunat_modo = Column(String(20), default="beta")
    sunat_serie_boleta = Column(String(10), nullable=True)
    sunat_serie_factura = Column(String(10), nullable=True)

    # Seguridad
    bloquear_caja_diferencia = Column(Boolean, default=True)
    requerir_autorizacion_cambios = Column(Boolean, default=True)
    historial_cambios = Column(Boolean, default=True)
    permisos_roles_json = Column(Text, nullable=True)
    productos_columnas_json = Column(Text, nullable=True)

    # Auditoría
    fecha_creacion = Column(DateTime, default=datetime.utcnow)
    fecha_actualizacion = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
