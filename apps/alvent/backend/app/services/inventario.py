from sqlalchemy.orm import Session

from app.models.producto import Producto
from app.models.inventario_movimiento import InventarioMovimiento


# ==========================================
# INGRESAR STOCK
# ==========================================

def ingresar_stock(
    db: Session,
    producto_id: int,
    cantidad: int
):

    producto = (
        db.query(Producto)
        .filter(Producto.id == producto_id)
        .first()
    )

    if not producto:
        raise ValueError("Producto no encontrado")

    producto.stock += cantidad

    movimiento = InventarioMovimiento(
        producto_id=producto.id,
        tipo="ENTRADA",
        cantidad=cantidad,
        referencia="INGRESO MANUAL"
    )

    db.add(movimiento)

    db.commit()

    return producto

# ==========================================
# DESCONTAR STOCK
# ==========================================
def descontar_stock(
    db: Session,
    producto_id: int,
    cantidad: int
):

    producto = (
        db.query(Producto)
        .filter(Producto.id == producto_id)
        .first()
    )

    if not producto:
        raise ValueError("Producto no encontrado")

    if producto.stock < cantidad:
        raise ValueError("Stock insuficiente")

    producto.stock -= cantidad

    movimiento = InventarioMovimiento(
        producto_id=producto.id,
        tipo="SALIDA",
        cantidad=cantidad,
        referencia="SALIDA MANUAL"
    )

    db.add(movimiento)

    db.commit()

    return producto

# ==========================================
# AJUSTAR STOCK
# ==========================================

def ajustar_stock(
    db: Session,
    producto_id: int,
    nuevo_stock: int
):

    producto = (
        db.query(Producto)
        .filter(Producto.id == producto_id)
        .first()
    )

    if not producto:
        raise ValueError("Producto no encontrado")

    diferencia = nuevo_stock - producto.stock

    producto.stock = nuevo_stock

    movimiento = InventarioMovimiento(
        producto_id=producto.id,
        tipo="AJUSTE",
        cantidad=diferencia,
        referencia="AJUSTE MANUAL"
    )

    db.add(movimiento)

    db.commit()

    return producto