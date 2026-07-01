from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database.database import get_db
from app.models.producto import Producto
from app.services.inventario import (
    ingresar_stock,
    descontar_stock,
    ajustar_stock
)

from app.services.auditoria import registrar_auditoria

from app.models.inventario_movimiento import InventarioMovimiento  # ✔ FALTABA

router = APIRouter(prefix="/inventario", tags=["Inventario"])

from app.schemas.inventario import (
    MovimientoStock,
    AjusteStock
)


# ==========================================
# INGRESO STOCK
# ==========================================
@router.post("/ingresar")
def ingreso_stock(
    data: MovimientoStock,
    db: Session = Depends(get_db)
):
    try:

        producto = ingresar_stock(
            db=db,
            producto_id=data.producto_id,
            cantidad=data.cantidad
        )

        registrar_auditoria(
            db=db,
            modulo="Inventario",
            accion="Ingreso stock",
            descripcion=f"{producto.nombre} +{data.cantidad}"
        )

        return {
            "mensaje": "Stock ingresado",
            "producto": producto.nombre,
            "stock": producto.stock
        }

    except ValueError as e:
        raise HTTPException(
            status_code=400,
            detail=str(e)
        )

    
# ==========================================
# SALIDA STOCK
# ==========================================
@router.post("/descontar")
def salida_stock(
    data: MovimientoStock,
    db: Session = Depends(get_db)
):
    try:

        producto = descontar_stock(
            db=db,
            producto_id=data.producto_id,
            cantidad=data.cantidad
        )

        registrar_auditoria(
            db=db,
            modulo="Inventario",
            accion="Salida stock",
            descripcion=f"{producto.nombre} -{data.cantidad}"
        )

        return {
            "mensaje": "Stock descontado",
            "producto": producto.nombre,
            "stock": producto.stock
        }

    except ValueError as e:
        raise HTTPException(
            status_code=400,
            detail=str(e)
        )

    
# ==========================================
# AJUSTE STOCK
# ==========================================
@router.post("/ajustar")
def ajuste_stock_manual(
    data: AjusteStock,
    db: Session = Depends(get_db)
):
    try:

        producto = ajustar_stock(
            db=db,
            producto_id=data.producto_id,
            nuevo_stock=data.nuevo_stock
        )

        registrar_auditoria(
            db=db,
            modulo="Inventario",
            accion="Ajuste stock",
            descripcion=f"{producto.nombre} → {data.nuevo_stock}"
        )

        return {
            "mensaje": "Stock ajustado",
            "producto": producto.nombre,
            "stock": producto.stock
        }

    except ValueError as e:
        raise HTTPException(
            status_code=400,
            detail=str(e)
        )

# ==========================================
# KARDEX (CORRECTO)
# ==========================================
@router.get("/kardex/{producto_id}")
def kardex(producto_id: int, db: Session = Depends(get_db)):

    movimientos = db.query(InventarioMovimiento).filter(
        InventarioMovimiento.producto_id == producto_id
    ).order_by(InventarioMovimiento.fecha.desc()).all()


    return movimientos

# ==========================================
# RESUMEN INVENTARIO ERP PRO
# ==========================================
@router.get("/resumen/{producto_id}")
def resumen_producto(
    producto_id: int,
    db: Session = Depends(get_db)
):

    producto = db.query(Producto).filter(
        Producto.id == producto_id
    ).first()

    if not producto:
        raise HTTPException(
            status_code=404,
            detail="Producto no encontrado"
        )

    entradas = db.query(
        InventarioMovimiento
    ).filter(
        InventarioMovimiento.producto_id == producto_id,
        InventarioMovimiento.tipo == "ENTRADA"
    ).all()

    salidas = db.query(
        InventarioMovimiento
    ).filter(
        InventarioMovimiento.producto_id == producto_id,
        InventarioMovimiento.tipo == "SALIDA"
    ).all()

    total_entradas = sum(
        mov.cantidad for mov in entradas
    )

    total_salidas = sum(
        mov.cantidad for mov in salidas
    )

    movimiento_neto = (
        total_entradas - total_salidas
    )

    return {
        "producto": producto.nombre,
        "entradas": total_entradas,
        "salidas": total_salidas,
        "movimiento_neto": movimiento_neto,
        "stock_actual": producto.stock
    }