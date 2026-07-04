from datetime import datetime
import os
import logging

from fastapi import APIRouter, Depends, HTTPException, Request, Body
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from sqlalchemy import func
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.database.database import get_db
from app.models.usuario import Usuario
from app.models.negocio import Negocio
from app.models.refresh_token import RefreshToken
from app.models.email_verification import EmailVerification, PasswordReset

from app.schemas.auth import (
    RegisterRequest,
    RegisterResponse,
    LoginRequest,
    LoginResponse,
    RefreshTokenRequest,
    VerifyEmailRequest,
    ForgotPasswordRequest,
    ResetPasswordRequest,
)

from app.services.email import email_service

from app.utils.jwt_utils import (
    create_access_token,
    create_refresh_token,
    verify_password,
    hash_password,
    get_token_data,
    verify_refresh_token,
    hash_refresh_token,
)

logger = logging.getLogger(__name__)

security = HTTPBearer()
limiter = Limiter(key_func=get_remote_address)

router = APIRouter(
    prefix="/auth",
    tags=["Auth"]
)

SUPERADMIN_USERNAME = (os.getenv("ALVENT_SUPERADMIN_USERNAME") or "admin").strip().lower()


def _normalizar_rol(rol: str | None) -> str:
    raw = str(rol or "").strip().upper()
    compacto = "".join(ch for ch in raw if ch.isalnum())
    if compacto in {"SUPERADMIN", "SUPERADMINISTRADOR"}:
        return "SUPERADMIN"
    if compacto in {"ADMIN", "ADMINISTRADOR"}:
        return "ADMINISTRADOR"
    return raw


def _roles_usuario(usuario: Usuario) -> list[str]:
    roles = [
        _normalizar_rol(r)
        for r in str(getattr(usuario, "roles", "") or "").split(",")
        if r.strip()
    ]
    if not roles and usuario.rol:
        roles = [_normalizar_rol(usuario.rol)]
    return roles


def _es_superadmin_fijo(usuario: Usuario | None) -> bool:
    if not usuario:
        return False
    return str(getattr(usuario, "usuario", "") or "").strip().lower() == SUPERADMIN_USERNAME


@router.post("/register", response_model=RegisterResponse)
@limiter.limit("3/minute")
def register(
    request: Request,
    data: RegisterRequest,
    db: Session = Depends(get_db)
):
    """Crear nuevo usuario en el sistema"""
    
    # Validar que el usuario no exista
    existe_usuario = db.query(Usuario).filter(
        Usuario.usuario == data.usuario
    ).first()
    
    if existe_usuario:
        raise HTTPException(400, "El usuario ya existe")
    
    # Validar que el email no exista
    existe_email = db.query(Usuario).filter(
        Usuario.email == data.email
    ).first()
    
    if existe_email:
        raise HTTPException(400, "El email ya está registrado")
    
    # Hash de contraseña
    try:
        hashed_password = hash_password(data.password)
        nuevo_usuario = Usuario(
            nombres=data.nombres,
            usuario=data.usuario,
            email=data.email,
            password=hashed_password,
            rol="ADMINISTRADOR",
            activo=True
        )
        db.add(nuevo_usuario)
        db.commit()
        db.refresh(nuevo_usuario)
        access_token = create_access_token(
            data={
                "sub": str(nuevo_usuario.id),
                "negocio_id": nuevo_usuario.negocio_id or 0,
                "rol": _normalizar_rol(nuevo_usuario.rol),
                "roles": _roles_usuario(nuevo_usuario),
            }
        )

        return {
            "id": nuevo_usuario.id,
            "usuario": nuevo_usuario.usuario,
            "email": nuevo_usuario.email,
            "token": access_token,
        }

    except Exception as e:
        logger.exception("Error registrando usuario")
        raise

  
@router.post("/login", response_model=LoginResponse)
@limiter.limit("5/minute")
def login(
    request: Request,
    data: LoginRequest,
    db: Session = Depends(get_db)
):
    """Iniciar sesión de usuario con generación de refresh token"""
    usuario_login = data.usuario.strip()
    
    usuario = (
        db.query(Usuario)
        .filter(
            func.lower(Usuario.usuario) == usuario_login.lower()
        )
        .first()
    )

    if not usuario:
        raise HTTPException(
            status_code=401,
            detail="Usuario incorrecto"
        )

    # Verificar contraseña (hash y fallback para cuentas legacy en texto plano)
    password_es_valida = False
    password_legacy = False

    try:
        password_es_valida = verify_password(data.password, usuario.password)
    except Exception:
        password_legacy = (usuario.password == data.password)
        password_es_valida = password_legacy

    if not password_es_valida:
        raise HTTPException(
            status_code=401,
            detail="Contraseña incorrecta"
        )

    if not usuario.activo:
        raise HTTPException(
            status_code=403,
            detail="Usuario inactivo"
        )

    # Migrar credenciales legacy a hash seguro al primer login válido
    if password_legacy:
        usuario.password = hash_password(data.password)

    # Actualizar última conexión
    usuario.fecha_ultima_conexion = datetime.utcnow()
    db.commit()

    es_superadmin = _es_superadmin_fijo(usuario) or bool(usuario.id == 1)
    rol_respuesta = "SUPERADMIN" if es_superadmin else _normalizar_rol(usuario.rol)
    roles_respuesta = ["SUPERADMIN"] if es_superadmin else _roles_usuario(usuario)

    # Crear token de acceso (corta expiración)
    access_token = create_access_token(
        data={
            "sub": str(usuario.id),
            "negocio_id": None if es_superadmin else usuario.negocio_id,
            "rol": rol_respuesta,
            "roles": roles_respuesta,
        }
    )
    
    # Crear refresh token (larga expiración)
    refresh_token_jwt, expiration = create_refresh_token(
        usuario_id=usuario.id,
        negocio_id=usuario.negocio_id
    )
    
    # Guardar refresh token hasheado en BD
    token_hash = hash_refresh_token(refresh_token_jwt)
    nueva_familia = RefreshToken.generar_token_familia()
    
    db_refresh_token = RefreshToken(
        usuario_id=usuario.id,
        token_hash=token_hash,
        familia_token=nueva_familia,
        generacion=1,
        fecha_expiracion=expiration,
        activo=True
    )
    
    db.add(db_refresh_token)
    db.commit()

    return {
        "access_token": access_token,
        "refresh_token": refresh_token_jwt,
        "token_type": "bearer",
        "usuario_id": usuario.id,
        "negocio_id": None if es_superadmin else usuario.negocio_id,
        "nombres": usuario.nombres,
        "rol": rol_respuesta,
        "roles": roles_respuesta,
    }


@router.post("/refresh")
def refresh_access_token(
    data: RefreshTokenRequest,
    db: Session = Depends(get_db)
):
    """
    Usar refresh token para obtener nuevo access token.
    Esto permite que el access token expire rápido pero el usuario no tenga que re-loguear.
    """
    
    # Verificar refresh token
    token_data = verify_refresh_token(data.refresh_token)
    if not token_data:
        raise HTTPException(
            status_code=401,
            detail="Refresh token inválido o expirado"
        )
    
    usuario_id = token_data.get("usuario_id")
    
    # Obtener usuario
    usuario = db.query(Usuario).filter(Usuario.id == usuario_id).first()
    if not usuario:
        raise HTTPException(404, "Usuario no encontrado")
    
    if not usuario.activo:
        raise HTTPException(403, "Usuario inactivo")
    
    # Verificar que el refresh token existe en BD y es válido
    token_hash = hash_refresh_token(data.refresh_token)
    db_refresh_token = db.query(RefreshToken).filter(
        RefreshToken.token_hash == token_hash,
        RefreshToken.usuario_id == usuario_id
    ).first()
    
    if not db_refresh_token or not db_refresh_token.es_valido():
        raise HTTPException(
            status_code=401,
            detail="Refresh token revocado o inválido"
        )
    
    # Crear nuevo access token
    new_access_token = create_access_token(
        data={
            "sub": str(usuario.id),
            "negocio_id": usuario.negocio_id,
            "rol": _normalizar_rol(usuario.rol),
            "roles": _roles_usuario(usuario),
        }
    )
    
    # Opcionalmente: rotar refresh token (crear uno nuevo)
    # Esto es más seguro pero requiere más queries
    # Por ahora solo retornamos el nuevo access token
    
    return {
        "access_token": new_access_token,
        "token_type": "bearer",
        "usuario_id": usuario.id,
        "negocio_id": usuario.negocio_id,
    }


@router.post("/logout")
def logout(
    token: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
):
    """
    Logout del usuario.
    Revoca el refresh token para mayor seguridad.
    """
    
    token_data = get_token_data(token.credentials)
    if not token_data:
        raise HTTPException(
            status_code=401,
            detail="Token inválido"
        )
    
    usuario_id = token_data.get("usuario_id")
    
    # Obtener todos los refresh tokens del usuario
    refresh_tokens = db.query(RefreshToken).filter(
        RefreshToken.usuario_id == usuario_id,
        RefreshToken.activo == True
    ).all()
    
    # Revocar todos
    for rt in refresh_tokens:
        rt.revocar()
    
    db.commit()
    
    return {"mensaje": "Logout exitoso"}


@router.post("/asociar-negocio")
def asociar_usuario_negocio(
    negocio_id: int | None = None,
    payload: dict | None = Body(default=None),
    token: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
):
    """Asociar usuario registrado con un negocio nuevo (después de crear el negocio)"""

    if negocio_id is None and payload:
        negocio_id = payload.get("negocio_id")

    if negocio_id is None:
        raise HTTPException(status_code=422, detail="negocio_id es requerido")
    
    # Verificar token
    token_data = get_token_data(token.credentials)
    if not token_data:
        raise HTTPException(
            status_code=401,
            detail="Token inválido"
        )
    
    usuario_id = token_data.get("usuario_id")
    
    # Obtener usuario
    usuario = db.query(Usuario).filter(Usuario.id == usuario_id).first()
    if not usuario:
        raise HTTPException(404, "Usuario no encontrado")
    
    # Verificar negocio existe
    negocio = db.query(Negocio).filter(Negocio.id == int(negocio_id)).first()
    if not negocio:
        raise HTTPException(404, "Negocio no encontrado")
    
    # Asociar
    usuario.negocio_id = int(negocio_id)
    db.commit()
    db.refresh(usuario)
    
    # Crear nuevo token con negocio_id
    access_token = create_access_token(
        data={
            "sub": str(usuario.id),
            "negocio_id": int(negocio_id),
            "rol": str(usuario.rol or "").upper(),
            "roles": _roles_usuario(usuario),
        }
    )
    
    # Crear nuevo refresh token
    refresh_token_jwt, expiration = create_refresh_token(
        usuario_id=usuario.id,
        negocio_id=int(negocio_id)
    )
    
    # Guardar refresh token
    token_hash = hash_refresh_token(refresh_token_jwt)
    nueva_familia = RefreshToken.generar_token_familia()
    
    db_refresh_token = RefreshToken(
        usuario_id=usuario.id,
        token_hash=token_hash,
        familia_token=nueva_familia,
        generacion=1,
        fecha_expiracion=expiration,
        activo=True
    )
    
    db.add(db_refresh_token)
    db.commit()
    
    return {
        "access_token": access_token,
        "refresh_token": refresh_token_jwt,
        "token_type": "bearer",
        "negocio_id": int(negocio_id),
    }


@router.get("/me")
def obtener_usuario_actual(
    token: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
):
    """Obtener datos del usuario autenticado"""
    
    token_data = get_token_data(token.credentials)
    if not token_data:
        raise HTTPException(
            status_code=401,
            detail="Token inválido"
        )
    
    usuario_id = token_data.get("usuario_id")
    usuario = db.query(Usuario).filter(Usuario.id == usuario_id).first()
    
    if not usuario:
        raise HTTPException(404, "Usuario no encontrado")
    
    return {
        "id": usuario.id,
        "usuario": usuario.usuario,
        "email": usuario.email,
        "nombres": usuario.nombres,
        "rol": _normalizar_rol(usuario.rol),
        "roles": _roles_usuario(usuario),
        "negocio_id": usuario.negocio_id,
        "activo": usuario.activo,
    }


@router.post("/verify-email")
def verify_email(
    data: VerifyEmailRequest,
    token: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
):
    """
    Verificar email del usuario.
    Requiere el código enviado por email.
    """
    
    token_data = get_token_data(token.credentials)
    if not token_data:
        raise HTTPException(
            status_code=401,
            detail="Token inválido"
        )
    
    usuario_id = token_data.get("usuario_id")
    usuario = db.query(Usuario).filter(Usuario.id == usuario_id).first()
    
    if not usuario:
        raise HTTPException(404, "Usuario no encontrado")
    
    # Obtener el registro de verificación más reciente
    verification = db.query(EmailVerification).filter(
        EmailVerification.usuario_id == usuario_id,
        EmailVerification.verificado == False
    ).order_by(EmailVerification.fecha_creacion.desc()).first()
    
    if not verification:
        raise HTTPException(
            status_code=400,
            detail="No hay verificación pendiente"
        )
    
    # Verificar el código
    if not verification.verificar(data.codigo):
        db.commit()  # Guardar incremento de intentos
        
        if verification.intentos >= 5:
            raise HTTPException(
                status_code=400,
                detail="Demasiados intentos. Solicita un nuevo código."
            )
        
        raise HTTPException(
            status_code=400,
            detail="Código incorrecto"
        )
    
    # Marcar email como verificado
    usuario.email_verificado = True
    db.commit()
    
    return {
        "mensaje": "Email verificado correctamente",
        "email": usuario.email
    }


@router.post("/send-verification-email")
@limiter.limit("3/minute")
def send_verification_email(
    request: Request,
    token: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
):
    """
    Enviar código de verificación por email.
    Limitar a 3 intentos por minuto.
    """
    
    token_data = get_token_data(token.credentials)
    if not token_data:
        raise HTTPException(
            status_code=401,
            detail="Token inválido"
        )
    
    usuario_id = token_data.get("usuario_id")
    usuario = db.query(Usuario).filter(Usuario.id == usuario_id).first()
    
    if not usuario:
        raise HTTPException(404, "Usuario no encontrado")
    
    # Crear código de verificación
    codigo = EmailVerification.generar_codigo()
    verificacion = EmailVerification(
        usuario_id=usuario_id,
        email=usuario.email,
        codigo=codigo,
        fecha_expiracion=EmailVerification.generar_expiracion()
    )
    
    db.add(verificacion)
    db.commit()
    
    # Enviar email
    email_service.enviar_verificacion_email(
        email=usuario.email,
        codigo=codigo,
        usuario=usuario.nombres or usuario.usuario
    )
    
    return {
        "mensaje": "Código de verificación enviado a tu email",
        "email": usuario.email
    }


@router.post("/forgot-password")
@limiter.limit("3/minute")
def forgot_password(
    request: Request,
    data: ForgotPasswordRequest,
    db: Session = Depends(get_db)
):
    """
    Solicitar recuperación de contraseña.
    Envía un email con un link para resetear.
    """
    
    usuario = db.query(Usuario).filter(
        Usuario.email == data.email
    ).first()
    
    if not usuario:
        # No revelar si existe o no (seguridad)
        return {
            "mensaje": "Si existe una cuenta con ese email, recibirás un enlace para recuperar tu contraseña"
        }
    
    # Generar token de reset
    token = PasswordReset.generar_token()
    password_reset = PasswordReset(
        usuario_id=usuario.id,
        email=usuario.email,
        token=token,
        fecha_expiracion=PasswordReset.generar_expiracion()
    )
    
    db.add(password_reset)
    db.commit()
    
    # Generar link de reset
    link_reset = f"{os.getenv('FRONTEND_URL', 'http://localhost:3000')}/recuperar-contrasena/{token}"
    
    # Enviar email
    email_service.enviar_reset_password(
        email=usuario.email,
        usuario=usuario.nombres or usuario.usuario,
        token=token,
        link_reset=link_reset
    )
    
    return {
        "mensaje": "Si existe una cuenta con ese email, recibirás un enlace para recuperar tu contraseña"
    }


@router.post("/reset-password/{token}")
def reset_password(
    token: str,
    data: ResetPasswordRequest,
    db: Session = Depends(get_db)
):
    """
    Resetear contraseña usando el token enviado por email.
    """
    
    if data.password != data.confirmPassword:
        raise HTTPException(
            status_code=400,
            detail="Las contraseñas no coinciden"
        )
    
    if len(data.password) < 6:
        raise HTTPException(
            status_code=400,
            detail="La contraseña debe tener al menos 6 caracteres"
        )
    
    # Buscar el token de reset
    password_reset = db.query(PasswordReset).filter(
        PasswordReset.token == token
    ).first()
    
    if not password_reset or not password_reset.es_valido():
        raise HTTPException(
            status_code=400,
            detail="Token inválido o expirado"
        )
    
    # Actualizar contraseña
    usuario = password_reset.usuario
    usuario.password = hash_password(data.password)
    
    # Marcar token como usado
    password_reset.usar()
    
    db.commit()
    
    return {
        "mensaje": "Contraseña actualizada correctamente"
    }


import os

