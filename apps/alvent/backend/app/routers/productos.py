from typing import List
import json
import re
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database.database import get_db
from app.models.configuracion_negocio import ConfiguracionNegocio
from app.models.negocio import Negocio
from app.models.producto import Producto
from app.schemas.producto import ProductoCreate, ProductoOut
from app.utils.dependencies import get_current_user_with_negocio

from pathlib import Path
from uuid import uuid4
import os

router = APIRouter(prefix="/productos", tags=["Productos"])

TIPOS_NEGOCIO_BASE = {"tienda", "restaurante", "farmacia", "supermercado", "otro"}


def _obtener_negocio_id(current_user: dict) -> int:
    negocio_id = int(current_user.get("negocio_id") or 0)
    if not negocio_id:
        raise HTTPException(status_code=400, detail="Usuario sin negocio asociado")
    return negocio_id


def _normalizar_atributos_extra(payload: dict | None) -> dict[str, str]:
    data = payload if isinstance(payload, dict) else {}
    output: dict[str, str] = {}
    for key, value in data.items():
        slug = re.sub(r"[^a-z0-9_]", "", str(key or "").strip().lower().replace(" ", "_"))[:40]
        if not slug:
            continue
        output[slug] = str(value or "").strip()[:200]
    return output


def _normalizar_columnas_custom(payload: list | None) -> list[dict[str, str]]:
    cols = payload if isinstance(payload, list) else []
    output: list[dict[str, str]] = []
    keys_seen: set[str] = set()

    for item in cols:
        if not isinstance(item, dict):
            continue
        raw_key = str(item.get("key") or "")
        key = re.sub(r"[^a-z0-9_]", "", raw_key.strip().lower().replace(" ", "_"))[:40]
        label = str(item.get("label") or "").strip()[:60]
        if not key or not label or key in keys_seen:
            continue
        keys_seen.add(key)
        output.append({"key": key, "label": label})
        if len(output) >= 12:
            break

    return output


def _normalizar_tipo_negocio(value: str | None) -> str:
    raw = str(value or "").strip().lower().replace(" ", "_")
    normalizado = re.sub(r"[^a-z0-9_]", "", raw)[:40]
    return normalizado


def _normalizar_tipos_custom(payload: list | None) -> list[str]:
    items = payload if isinstance(payload, list) else []
    output: list[str] = []
    seen: set[str] = set()

    for item in items:
        tipo = _normalizar_tipo_negocio(str(item or ""))
        if not tipo or tipo in TIPOS_NEGOCIO_BASE or tipo in seen:
            continue
        seen.add(tipo)
        output.append(tipo)
        if len(output) >= 20:
            break

    return output


def _leer_config_tabla(raw: str) -> tuple[list[dict[str, str]], list[str]]:
    if not raw:
        return [], []

    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return [], []

    if isinstance(parsed, list):
        return _normalizar_columnas_custom(parsed), []

    if isinstance(parsed, dict):
        columnas = _normalizar_columnas_custom(parsed.get("columnas_custom"))
        tipos = _normalizar_tipos_custom(parsed.get("tipos_custom"))
        return columnas, tipos

    return [], []


def _obtener_o_crear_config(db: Session, negocio_id: int) -> ConfiguracionNegocio:
    config = db.query(ConfiguracionNegocio).filter(ConfiguracionNegocio.negocio_id == negocio_id).first()
    if config:
        return config

    config = ConfiguracionNegocio(negocio_id=negocio_id)
    db.add(config)
    db.flush()
    return config


@router.get("/tabla-config")
def get_tabla_productos_config(
    current_user: dict = Depends(get_current_user_with_negocio),
    db: Session = Depends(get_db)
):
    negocio_id = _obtener_negocio_id(current_user)
    negocio = db.query(Negocio).filter(Negocio.id == negocio_id).first()
    if not negocio:
        raise HTTPException(status_code=404, detail="Negocio no encontrado")

    config = _obtener_o_crear_config(db, negocio_id)
    raw = str(getattr(config, "productos_columnas_json", "") or "").strip()
    columnas_custom, tipos_custom = _leer_config_tabla(raw)

    tipo_negocio_actual = _normalizar_tipo_negocio(getattr(negocio, "tipo", ""))
    if tipo_negocio_actual and tipo_negocio_actual not in TIPOS_NEGOCIO_BASE and tipo_negocio_actual not in tipos_custom:
        tipos_custom.append(tipo_negocio_actual)

    return {
        "negocio_id": negocio_id,
        "tipo_negocio": tipo_negocio_actual,
        "columnas_custom": columnas_custom,
        "tipos_custom": tipos_custom,
    }


@router.put("/tabla-config")
def update_tabla_productos_config(
    payload: dict,
    current_user: dict = Depends(get_current_user_with_negocio),
    db: Session = Depends(get_db)
):
    negocio_id = _obtener_negocio_id(current_user)
    negocio = db.query(Negocio).filter(Negocio.id == negocio_id).first()
    if not negocio:
        raise HTTPException(status_code=404, detail="Negocio no encontrado")

    config = _obtener_o_crear_config(db, negocio_id)
    raw = str(getattr(config, "productos_columnas_json", "") or "").strip()
    _, tipos_existentes = _leer_config_tabla(raw)

    tipo_negocio = _normalizar_tipo_negocio(payload.get("tipo_negocio"))
    tipos_custom = _normalizar_tipos_custom(payload.get("tipos_custom"))
    if not tipos_custom:
        tipos_custom = tipos_existentes

    if tipo_negocio:
        if not tipo_negocio:
            raise HTTPException(status_code=400, detail="Tipo de negocio no valido")
        if tipo_negocio not in TIPOS_NEGOCIO_BASE and tipo_negocio not in tipos_custom:
            tipos_custom.append(tipo_negocio)
        negocio.tipo = tipo_negocio

    columnas_custom = _normalizar_columnas_custom(payload.get("columnas_custom"))
    config.productos_columnas_json = json.dumps(
        {
            "columnas_custom": columnas_custom,
            "tipos_custom": tipos_custom,
        },
        ensure_ascii=False,
    )

    db.commit()

    return {
        "ok": True,
        "mensaje": "Configuracion de tabla guardada",
        "negocio_id": negocio_id,
        "tipo_negocio": _normalizar_tipo_negocio(getattr(negocio, "tipo", "")),
        "columnas_custom": columnas_custom,
        "tipos_custom": tipos_custom,
    }

# ======================
# CREATE
# ======================
@router.post("/")
def create_producto(
    data: ProductoCreate,
    current_user: dict = Depends(get_current_user_with_negocio),
    db: Session = Depends(get_db)
):
    is_superadmin = bool(current_user.get("is_superadmin"))
    negocio_id = None if is_superadmin else int(current_user.get("negocio_id"))
    print("RECIBIDO:", data.model_dump())
    existe = (
        db.query(Producto)
        .filter(Producto.codigo == data.codigo)
        .first()
    ) if is_superadmin else (
        db.query(Producto)
        .filter(
            Producto.codigo == data.codigo,
            Producto.negocio_id == negocio_id
        )
        .first()
    )

    if existe:
        raise HTTPException(400, "Producto ya existe")

    payload = data.model_dump()
    payload["atributos_extra"] = _normalizar_atributos_extra(payload.get("atributos_extra"))
    producto = Producto(**payload, negocio_id=negocio_id)
    db.add(producto)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(400, "Producto ya existe")
    db.refresh(producto)

    return producto


# ======================
# READ ALL
# ======================
@router.get("/", response_model=List[ProductoOut])
def get_productos(
    current_user: dict = Depends(get_current_user_with_negocio),
    db: Session = Depends(get_db)
):
    if current_user.get("is_superadmin"):
        return db.query(Producto).all()

    negocio_id = int(current_user.get("negocio_id"))
    return db.query(Producto).filter(Producto.negocio_id == negocio_id).all()


# ======================
# UPDATE (PUT)
# ======================
@router.put("/{codigo}")
def update_producto(
    codigo: str,
    data: ProductoCreate,
    current_user: dict = Depends(get_current_user_with_negocio),
    db: Session = Depends(get_db)
):
    is_superadmin = bool(current_user.get("is_superadmin"))
    negocio_id = None if is_superadmin else int(current_user.get("negocio_id"))

    producto = (
        db.query(Producto)
        .filter(Producto.codigo == codigo)
        .first()
    ) if is_superadmin else (
        db.query(Producto)
        .filter(
            Producto.codigo == codigo,
            Producto.negocio_id == negocio_id
        )
        .first()
    )

    if not producto:
        raise HTTPException(404, "No existe")

    payload = data.model_dump()
    payload["atributos_extra"] = _normalizar_atributos_extra(payload.get("atributos_extra"))
    for key, value in payload.items():
        setattr(producto, key, value)

    db.commit()
    db.refresh(producto)

    return producto


# ======================
# DELETE
# ======================
@router.delete("/{codigo}")
def delete_producto(
    codigo: str,
    current_user: dict = Depends(get_current_user_with_negocio),
    db: Session = Depends(get_db)
):
    is_superadmin = bool(current_user.get("is_superadmin"))
    negocio_id = None if is_superadmin else int(current_user.get("negocio_id"))

    producto = (
        db.query(Producto)
        .filter(Producto.codigo == codigo)
        .first()
    ) if is_superadmin else (
        db.query(Producto)
        .filter(
            Producto.codigo == codigo,
            Producto.negocio_id == negocio_id
        )
        .first()
    )

    if not producto:
        raise HTTPException(404, "No existe")

    db.delete(producto)
    db.commit()

    return {"ok": True}


# ======================
# UPLOAD IMAGEN
# ======================
@router.post("/upload")
async def upload_producto_foto(
    archivo: UploadFile = File(...)
):
    # Usar la ruta del backend app para uploads
    BASE_DIR = Path(__file__).resolve().parent.parent
    carpeta = BASE_DIR / "uploads" / "productos"
    carpeta.mkdir(parents=True, exist_ok=True)

    extension = Path(archivo.filename).suffix
    nombre = f"{uuid4()}{extension}"
    ruta = carpeta / nombre

    contenido = await archivo.read()

    with open(ruta, "wb") as f:
        f.write(contenido)

    return {
        "url": f"/uploads/productos/{nombre}"
    }
