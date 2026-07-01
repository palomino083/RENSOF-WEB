from pydantic import BaseModel

class MovimientoStock(BaseModel):
    producto_id: int
    cantidad: int

class AjusteStock(BaseModel):
    producto_id: int
    nuevo_stock: int