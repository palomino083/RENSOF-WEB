from typing import Optional
from pydantic import BaseModel, EmailStr, Field, ConfigDict, field_validator

# ==========================
# REGISTER
# ==========================

class RegisterRequest(BaseModel):
    nombres: str = Field(..., min_length=2, max_length=150)
    usuario: str = Field(..., min_length=3, max_length=50)
    email: EmailStr
    password: str = Field(..., min_length=6, max_length=100)
    rol: str = Field(default="CAJERO", max_length=20)

    @field_validator("rol")
    @classmethod
    def normalize_rol(cls, v: str):
        return v.upper()

class RegisterResponse(BaseModel):
    id: int
    usuario: str
    email: EmailStr
    token: str

    model_config = ConfigDict(from_attributes=True)


# ==========================
# LOGIN
# ==========================
class LoginRequest(BaseModel):
    usuario: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=6, max_length=100)

class LoginResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    usuario_id: int
    negocio_id: Optional[int] = None
    nombres: str
    rol: str
    roles: list[str] = []

    model_config = ConfigDict(from_attributes=True)

# ==========================
# TOKEN
# ==========================
class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    usuario_id: int
    negocio_id: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)

# ==========================
# REFRESH TOKEN
# ==========================
class RefreshTokenRequest(BaseModel):
    refresh_token: str = Field(..., min_length=10)

# ==========================
# EMAIL
# ==========================

class VerifyEmailRequest(BaseModel):
    codigo: str = Field(..., min_length=4, max_length=10)


class ForgotPasswordRequest(BaseModel):
    email: EmailStr

class ResetPasswordRequest(BaseModel):
    password: str = Field(..., min_length=6, max_length=100)
    confirmPassword: str = Field(..., min_length=6, max_length=100)

    @field_validator("confirmPassword")
    @classmethod
    def validate_match(cls, v, info):
        # validación cruzada simple (Pydantic v2 compatible)
        password = info.data.get("password")
        if password and v != password:
            raise ValueError("Las contraseñas no coinciden")
        return v