from pydantic import BaseModel, Field, ConfigDict
from typing import Optional

class ProductoCreate(BaseModel):
    codigo: str
    nombre: str
    costo: float = 0
    precio: float
    stock: int

    categoria: Optional[str] = None
    marca: Optional[str] = None
    foto: Optional[str] = None


class ProductoOut(BaseModel):
    id: int
    codigo: str
    nombre: str
    precio: float
    costo: float
    stock: int
    foto: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)