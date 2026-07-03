from pydantic import BaseModel, Field, EmailStr, ConfigDict, field_validator
from typing import Optional
import re


class ClienteBase(BaseModel):
    nombre: str = Field(..., min_length=2, max_length=150)
    dni: str = Field(..., min_length=8, max_length=8)
    telefono: Optional[str] = Field(None, max_length=9)
    email: Optional[EmailStr] = None
    activo: bool = True

    @field_validator("dni")
    @classmethod
    def validar_dni(cls, v: str):
        if not re.fullmatch(r"\d{8}", str(v or "").strip()):
            raise ValueError("DNI invalido: debe contener exactamente 8 digitos numericos")
        return v

    @field_validator("telefono")
    @classmethod
    def validar_telefono(cls, v: Optional[str]):
        if v is None:
            return v
        raw = str(v).strip()
        if raw == "":
            return None
        if not re.fullmatch(r"\d{9}", raw):
            raise ValueError("Celular invalido: debe contener exactamente 9 digitos numericos")
        return raw


class ClienteCreate(ClienteBase):
    pass


class ClienteUpdate(BaseModel):
    nombre: Optional[str] = Field(None, min_length=2, max_length=150)
    dni: Optional[str] = Field(None, min_length=8, max_length=8)
    telefono: Optional[str] = Field(None, max_length=9)
    email: Optional[EmailStr] = None
    activo: Optional[bool] = None

    @field_validator("dni")
    @classmethod
    def validar_dni(cls, v: Optional[str]):
        if v is None:
            return v
        raw = str(v).strip()
        if raw == "":
            return None
        if not re.fullmatch(r"\d{8}", raw):
            raise ValueError("DNI invalido: debe contener exactamente 8 digitos numericos")
        return raw

    @field_validator("telefono")
    @classmethod
    def validar_telefono(cls, v: Optional[str]):
        if v is None:
            return v
        raw = str(v).strip()
        if raw == "":
            return None
        if not re.fullmatch(r"\d{9}", raw):
            raise ValueError("Celular invalido: debe contener exactamente 9 digitos numericos")
        return raw

    model_config = ConfigDict(extra="forbid")


class ClienteResponse(BaseModel):
    id: int
    nombre: str
    dni: str
    telefono: Optional[str] = None
    email: Optional[EmailStr] = None
    activo: bool = True

    model_config = ConfigDict(from_attributes=True)