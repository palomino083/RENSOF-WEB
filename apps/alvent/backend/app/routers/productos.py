from typing import List
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database.database import get_db
from app.models.producto import Producto
from app.schemas.producto import ProductoCreate, ProductoOut
from app.utils.dependencies import get_current_user_with_negocio

from pathlib import Path
from uuid import uuid4
import os

router = APIRouter(prefix="/productos", tags=["Productos"])

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

    producto = Producto(**data.model_dump(), negocio_id=negocio_id)
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

    for key, value in data.model_dump().items():
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
