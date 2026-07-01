from datetime import datetime, timedelta
from typing import Optional, Tuple
from jose import JWTError, jwt
from passlib.context import CryptContext
import secrets
import hashlib
import bcrypt

# Configuración
SECRET_KEY = "alvent-erp-pos-pro-secret-key-2026"  # En producción, usar variable de entorno
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 15  # 15 minutos (corta expiración)
REFRESH_TOKEN_EXPIRE_DAYS = 30  # 30 días

# Use PBKDF2 for new hashes to avoid passlib+bcrypt backend issues on Python 3.14.
pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")


def hash_password(password: str) -> str:
    """Hash de contraseña seguro"""
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verificar contraseña contra hash"""
    if not hashed_password:
        return False

    if hashed_password.startswith("$2"):
        try:
            return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))
        except ValueError:
            return False

    return pwd_context.verify(plain_password, hashed_password)


def hash_refresh_token(token: str) -> str:
    """Hash del refresh token para almacenarlo de forma segura"""
    return hashlib.sha256(token.encode()).hexdigest()


def create_access_token(
    data: dict,
    expires_delta: Optional[timedelta] = None,
    include_jti: bool = False
) -> str:
    """Crear token JWT de acceso"""
    to_encode = data.copy()
    
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode.update({"exp": expire})
    
    # Agregar JTI (JWT ID único) si se solicita (para revocación)
    if include_jti:
        to_encode.update({"jti": secrets.token_urlsafe(16)})
    
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def create_refresh_token(
    usuario_id: int,
    negocio_id: Optional[int] = None,
    familia_token: Optional[str] = None
) -> Tuple[str, datetime]:
    """
    Crear refresh token (larga expiración).
    
    Returns:
        Tupla (token_string, fecha_expiracion)
    """
    # Token aleatorio como plaintext (será hasheado antes de guardarse)
    token_random = secrets.token_urlsafe(64)
    
    # Fecha de expiración
    expire = datetime.utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    
    # Datos del token
    data = {
        "sub": usuario_id,
        "negocio_id": negocio_id,
        "type": "refresh",
        "familia": familia_token or secrets.token_urlsafe(32),
        "iat": datetime.utcnow(),
        "exp": expire,
        "token_string": token_random
    }
    
    # Crear JWT
    encoded_jwt = jwt.encode(data, SECRET_KEY, algorithm=ALGORITHM)
    
    return encoded_jwt, expire


def verify_token(token: str) -> dict:
    """Verificar y decodificar token JWT"""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        return None


def get_token_data(token: str) -> Optional[dict]:
    """Obtener datos del token de acceso"""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        usuario_id: int = payload.get("sub")
        negocio_id: int = payload.get("negocio_id")
        
        if usuario_id is None:
            return None
        
        return {
            "usuario_id": usuario_id,
            "negocio_id": negocio_id,
            "rol": payload.get("rol"),
            "roles": payload.get("roles"),
        }
    except JWTError:
        return None


def verify_refresh_token(token: str) -> Optional[dict]:
    """Verificar refresh token y retornar datos"""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        
        # Verificar que es refresh token
        if payload.get("type") != "refresh":
            return None
        
        usuario_id: int = payload.get("sub")
        negocio_id: int = payload.get("negocio_id")
        
        if usuario_id is None:
            return None
        
        return {
            "usuario_id": usuario_id,
            "negocio_id": negocio_id,
            "familia": payload.get("familia"),
            "token_string": payload.get("token_string")
        }
    except JWTError:
        return None
