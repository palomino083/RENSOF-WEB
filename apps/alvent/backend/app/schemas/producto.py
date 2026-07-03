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
    talla: Optional[str] = None
    color: Optional[str] = None
    sexo: Optional[str] = None
    foto: Optional[str] = None
    atributos_extra: Optional[dict[str, str]] = Field(default_factory=dict)


class ProductoOut(BaseModel):
    id: int
    codigo: str
    nombre: str
    categoria: Optional[str] = None
    marca: Optional[str] = None
    talla: Optional[str] = None
    color: Optional[str] = None
    sexo: Optional[str] = None
    precio: float
    costo: float
    stock: int
    foto: Optional[str] = None
    atributos_extra: Optional[dict[str, str]] = Field(default_factory=dict)

    model_config = ConfigDict(from_attributes=True)