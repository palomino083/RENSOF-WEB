from pydantic import BaseModel, field_validator
from typing import Optional


class UsuarioCreate(BaseModel):

    nombres: str
    usuario: str
    dni: Optional[str] = None
    email: Optional[str]
    password: str
    rol: str
    roles: Optional[list[str]] = None


class UsuarioOut(BaseModel):

    id: int
    nombres: str
    usuario: str
    dni: Optional[str]
    email: Optional[str]
    rol: str
    roles: Optional[list[str]] = None
    activo: bool

    @field_validator("roles", mode="before")
    @classmethod
    def _parse_roles(cls, value):
        if value is None:
            return None
        if isinstance(value, list):
            return value
        if isinstance(value, str):
            return [r.strip().upper() for r in value.split(",") if r.strip()]
        return None

    class Config:
        from_attributes = True