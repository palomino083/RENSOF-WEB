from pydantic import BaseModel, Field, EmailStr, ConfigDict, field_validator
from typing import Optional
import re


class ClienteBase(BaseModel):
    nombre: str = Field(..., min_length=2, max_length=150)
    dni: str = Field(..., min_length=8, max_length=15)
    telefono: Optional[str] = Field(None, max_length=20)
    email: Optional[EmailStr] = None
    activo: bool = True

    @field_validator("dni")
    @classmethod
    def validar_dni(cls, v: str):
        if not re.match(r"^[0-9]{8,15}$", v):
            raise ValueError("DNI inválido: debe contener solo números (8-15 dígitos)")
        return v

    @field_validator("telefono")
    @classmethod
    def validar_telefono(cls, v: Optional[str]):
        if v is None:
            return v
        if not re.match(r"^[0-9+\-\s]{6,20}$", v):
            raise ValueError("Teléfono inválido")
        return v


class ClienteCreate(ClienteBase):
    pass


class ClienteUpdate(BaseModel):
    nombre: Optional[str] = Field(None, min_length=2, max_length=150)
    dni: Optional[str] = Field(None, min_length=8, max_length=15)
    telefono: Optional[str] = Field(None, max_length=20)
    email: Optional[EmailStr] = None
    activo: Optional[bool] = None

    model_config = ConfigDict(extra="forbid")


class ClienteResponse(ClienteBase):
    id: int

    model_config = ConfigDict(from_attributes=True)