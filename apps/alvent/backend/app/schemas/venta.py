from pydantic import BaseModel
from typing import Optional, List


class VentaItemCreate(BaseModel):
    producto_id: int
    cantidad: int


class VentaCreate(BaseModel):
    cliente_id: Optional[int] = None
    usuario_id: int

    subtotal: float = 0
    descuento: float = 0
    metodo_pago: str = "Efectivo"

    items: List[VentaItemCreate]