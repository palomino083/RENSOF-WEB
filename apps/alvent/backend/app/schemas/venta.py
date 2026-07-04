from typing import List, Optional

from pydantic import BaseModel, field_validator


class VentaItemCreate(BaseModel):
    producto_id: int
    cantidad: int


class VentaComprobanteCreate(BaseModel):
    tipo_comprobante: str = "NINGUNO"
    cliente_nombre: Optional[str] = None
    cliente_documento: Optional[str] = None
    cliente_email: Optional[str] = None

    @field_validator("tipo_comprobante", mode="before")
    @classmethod
    def normalizar_tipo_comprobante(cls, value: Optional[str]) -> str:
        raw = str(value or "NINGUNO").strip().upper()
        return raw if raw in {"NINGUNO", "BOLETA", "FACTURA"} else "NINGUNO"

    @field_validator("cliente_documento", mode="before")
    @classmethod
    def limpiar_documento(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        digits = "".join(ch for ch in str(value) if ch.isdigit())
        return digits or None

    @field_validator("cliente_email", mode="before")
    @classmethod
    def limpiar_email(cls, value: Optional[str]) -> Optional[str]:
        email = str(value or "").strip()
        return email or None

    @field_validator("cliente_nombre", mode="before")
    @classmethod
    def limpiar_nombre(cls, value: Optional[str]) -> Optional[str]:
        nombre = str(value or "").strip()
        return nombre or None


class VentaCreate(BaseModel):
    cliente_id: Optional[int] = None
    usuario_id: int

    subtotal: float = 0
    descuento: float = 0
    metodo_pago: str = "Efectivo"
    comprobante: Optional[VentaComprobanteCreate] = None

    items: List[VentaItemCreate]