import os
import hashlib
import hmac
import secrets
from typing import Final

from fastapi import HTTPException, Request, status

SECURITY_HEADERS: Final = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "SAMEORIGIN",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
}

ADMIN_SESSION_KEY: Final = "rensof_admin_user"
CSRF_SESSION_KEY: Final = "rensof_csrf_token"
PBKDF2_PREFIX: Final = "pbkdf2_sha256$"


def _admin_credentials() -> tuple[str, str]:
    expected_username = os.getenv("RENSOF_ADMIN_USER", "admin")
    expected_password = os.getenv("RENSOF_ADMIN_PASSWORD", "admin123")
    return expected_username, expected_password


def _verify_password_hash(expected_password: str, provided_password: str) -> bool:
    if not expected_password.startswith(PBKDF2_PREFIX):
        return secrets.compare_digest(expected_password, provided_password)

    try:
        _, iterations_raw, salt_hex, hash_hex = expected_password.split("$", 3)
        iterations = int(iterations_raw)
        salt = bytes.fromhex(salt_hex)
        expected_hash = bytes.fromhex(hash_hex)
    except (ValueError, TypeError):
        return False

    derived_hash = hashlib.pbkdf2_hmac("sha256", provided_password.encode("utf-8"), salt, iterations)
    return hmac.compare_digest(derived_hash, expected_hash)


def authenticate_admin_credentials(username: str, password: str) -> bool:
    expected_username, expected_password = _admin_credentials()

    valid_user = secrets.compare_digest(username, expected_username)
    valid_password = _verify_password_hash(expected_password, password)
    return valid_user and valid_password


def set_admin_session(request: Request, username: str) -> None:
    request.session[ADMIN_SESSION_KEY] = username


def clear_admin_session(request: Request) -> None:
    request.session.pop(ADMIN_SESSION_KEY, None)


def is_admin_authenticated(request: Request) -> bool:
    return bool(request.session.get(ADMIN_SESSION_KEY))


def get_or_create_csrf_token(request: Request) -> str:
    token = request.session.get(CSRF_SESSION_KEY)
    if not token:
        token = secrets.token_urlsafe(32)
        request.session[CSRF_SESSION_KEY] = token
    return str(token)


def verify_csrf_token(request: Request, submitted_token: str) -> bool:
    token = request.session.get(CSRF_SESSION_KEY)
    if not token:
        return False
    return secrets.compare_digest(str(token), submitted_token)


def require_admin_session(request: Request) -> str:
    username = request.session.get(ADMIN_SESSION_KEY)
    if not username:
        raise HTTPException(
            status_code=status.HTTP_303_SEE_OTHER,
            detail="Sesion de admin requerida.",
            headers={"Location": "/admin/login"},
        )

    return str(username)


async def security_headers_middleware(request: Request, call_next):
    response = await call_next(request)
    for header, value in SECURITY_HEADERS.items():
        response.headers.setdefault(header, value)
    return response
