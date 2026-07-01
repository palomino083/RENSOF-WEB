from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from app.database.database import get_db
from app.models.cliente import Cliente
from app.schemas.cliente import ClienteCreate, ClienteUpdate, ClienteResponse
from app.utils.dependencies import get_current_user_with_negocio

router = APIRouter(prefix="/clientes", tags=["Clientes"])

# =========================
# LISTAR
# =========================
@router.get("/", response_model=List[ClienteResponse])
def get_clientes(
    current_user: dict = Depends(get_current_user_with_negocio),
    db: Session = Depends(get_db)
):
    if current_user.get("is_superadmin"):
        return db.query(Cliente).all()

    negocio_id = int(current_user.get("negocio_id"))
    return db.query(Cliente).filter(Cliente.negocio_id == negocio_id).all()


# =========================
# CREAR
# =========================
@router.post("/", response_model=ClienteResponse)
def create_cliente(
    cliente: ClienteCreate,
    current_user: dict = Depends(get_current_user_with_negocio),
    db: Session = Depends(get_db)
):
    is_superadmin = bool(current_user.get("is_superadmin"))
    negocio_id = None if is_superadmin else int(current_user.get("negocio_id"))

    existente = (
        db.query(Cliente)
        .filter(Cliente.dni == cliente.dni)
        .first()
    ) if is_superadmin else (
        db.query(Cliente)
        .filter(
            Cliente.dni == cliente.dni,
            Cliente.negocio_id == negocio_id
        )
        .first()
    )
    if existente:
        raise HTTPException(status_code=400, detail="Cliente ya existe")

    nuevo = Cliente(**cliente.model_dump(), negocio_id=negocio_id)

    db.add(nuevo)
    db.commit()
    db.refresh(nuevo)

    return nuevo


# =========================
# ACTUALIZAR
# =========================
@router.put("/{cliente_id}", response_model=ClienteResponse)
def update_cliente(
    cliente_id: int,
    data: ClienteUpdate,
    current_user: dict = Depends(get_current_user_with_negocio),
    db: Session = Depends(get_db)
):
    is_superadmin = bool(current_user.get("is_superadmin"))
    negocio_id = None if is_superadmin else int(current_user.get("negocio_id"))

    cliente = (
        db.query(Cliente)
        .filter(Cliente.id == cliente_id)
        .first()
    ) if is_superadmin else (
        db.query(Cliente)
        .filter(
            Cliente.id == cliente_id,
            Cliente.negocio_id == negocio_id
        )
        .first()
    )

    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(cliente, key, value)

    db.commit()
    db.refresh(cliente)

    return cliente


# =========================
# ELIMINAR
# =========================
@router.delete("/{cliente_id}")
def delete_cliente(
    cliente_id: int,
    current_user: dict = Depends(get_current_user_with_negocio),
    db: Session = Depends(get_db)
):
    is_superadmin = bool(current_user.get("is_superadmin"))
    negocio_id = None if is_superadmin else int(current_user.get("negocio_id"))

    cliente = (
        db.query(Cliente)
        .filter(Cliente.id == cliente_id)
        .first()
    ) if is_superadmin else (
        db.query(Cliente)
        .filter(
            Cliente.id == cliente_id,
            Cliente.negocio_id == negocio_id
        )
        .first()
    )

    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    db.delete(cliente)
    db.commit()

    return {"message": "Cliente eliminado"}