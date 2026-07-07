from datetime import datetime, timedelta, UTC
from typing import Optional, Tuple
import os
import logging
import secrets
import hashlib
import bcrypt

from jose import JWTError, jwt
from passlib.context import CryptContext

# ==========================================================
# configuracion
# ==========================================================

logger = logging.getLogger(__name__)

SECRET_KEY = os.getenv("ALVENT_SECRET_KEY") or os.getenv("SECRET_KEY")

if not SECRET_KEY:
    # Solo para desarrollo local.
    SECRET_KEY = secrets.token_urlsafe(64)
    logger.warning(
        "ALVENT_SECRET_KEY no configurada; se generó una clave temporal para esta ejecución."
    )

ALGORITHM = "HS256"

ACCESS_TOKEN_EXPIRE_MINUTES = 15
REFRESH_TOKEN_EXPIRE_DAYS = 30

# Hash por defecto para nuevas contraseñas
pwd_context = CryptContext(
    schemes=["pbkdf2_sha256"],
    deprecated="auto",
)

# ==========================================================
# Contraseñas
# ==========================================================

def hash_password(password: str) -> str:
    """Genera hash seguro de contraseña."""
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verifica contraseña contra hash."""

    if not hashed_password:
        return False

    # Compatibilidad con hashes antiguos bcrypt
    if hashed_password.startswith("$2"):
        try:
            return bcrypt.checkpw(
                plain_password.encode("utf-8"),
                hashed_password.encode("utf-8"),
            )
        except ValueError:
            return False

    return pwd_context.verify(plain_password, hashed_password)


# ==========================================================
# Refresh Token
# ==========================================================

def hash_refresh_token(token: str) -> str:
    """Hash SHA256 del refresh token."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


# ==========================================================
# Access Token
# ==========================================================

def create_access_token(
    data: dict,
    expires_delta: Optional[timedelta] = None,
    include_jti: bool = False,
) -> str:
    """Crear JWT de acceso."""

    to_encode = data.copy()

    expire = (
        datetime.now(UTC) + expires_delta
        if expires_delta
        else datetime.now(UTC)
        + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )

    to_encode.update({"exp": expire})

    if include_jti:
        to_encode["jti"] = secrets.token_urlsafe(16)

    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


# ==========================================================
# Refresh Token
# ==========================================================

def create_refresh_token(
    usuario_id: int,
    negocio_id: Optional[int] = None,
    familia_token: Optional[str] = None,
) -> Tuple[str, datetime]:
    """Crear Refresh Token."""

    token_random = secrets.token_urlsafe(64)

    expire = datetime.now(UTC) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)

    data = {
        "sub": str(usuario_id),
        "negocio_id": negocio_id,
        "type": "refresh",
        "familia": familia_token or secrets.token_urlsafe(32),
        "iat": datetime.now(UTC),
        "exp": expire,
        "token_string": token_random,
    }

    encoded_jwt = jwt.encode(
        data,
        SECRET_KEY,
        algorithm=ALGORITHM,
    )

    return encoded_jwt, expire


# ==========================================================
# Verificación de Tokens
# ==========================================================

def verify_token(token: str) -> Optional[dict]:
    """Verifica un JWT."""

    try:
        return jwt.decode(
            token,
            SECRET_KEY,
            algorithms=[ALGORITHM],
        )
    except JWTError:
        return None


def get_token_data(token: str) -> Optional[dict]:
    """Obtiene información del Access Token."""

    try:
        payload = jwt.decode(
            token,
            SECRET_KEY,
            algorithms=[ALGORITHM],
        )

        usuario_id = payload.get("sub")

        if usuario_id is None:
            return None

        return {
            "usuario_id": int(usuario_id),
            "negocio_id": payload.get("negocio_id"),
            "rol": payload.get("rol"),
            "roles": payload.get("roles"),
        }

    except (JWTError, ValueError, TypeError):
        return None


def verify_refresh_token(token: str) -> Optional[dict]:
    """Verifica un Refresh Token."""

    try:
        payload = jwt.decode(
            token,
            SECRET_KEY,
            algorithms=[ALGORITHM],
        )

        if payload.get("type") != "refresh":
            return None

        usuario_id = payload.get("sub")

        if usuario_id is None:
            return None

        return {
            "usuario_id": int(usuario_id),
            "negocio_id": payload.get("negocio_id"),
            "familia": payload.get("familia"),
            "token_string": payload.get("token_string"),
        }

    except (JWTError, ValueError, TypeError):
        return None