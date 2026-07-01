from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from fastapi.responses import StreamingResponse

from app.database.database import get_db


from app.models.venta import Venta
from app.models.venta_detalle import VentaDetalle
from app.models.producto import Producto
from app.services.tickets import generar_ticket
from app.services.auditoria import registrar_auditoria

router = APIRouter(prefix="/pos", tags=["POS"])


# ==========================================
# 🧾 VENTA PRINCIPAL (POS)
# ==========================================
@router.post("/vender")
def vender(data: dict, db: Session = Depends(get_db)):

    if not data.get("items"):
        raise HTTPException(status_code=400, detail="Carrito vacío")

    try:
        # ==========================
        # 1. Crear venta cabecera
        # ==========================
        venta = Venta(
            cliente_id=data.get("cliente_id"),
            usuario_id=data.get("usuario_id"),
            total=0
        )

        db.add(venta)
        db.flush()  # obtener ID sin commit

        total = 0

        # ==========================
        # 2. Procesar items
        # ==========================
        for item in data["items"]:

            producto = db.query(Producto).filter(
                Producto.id == item["producto_id"]
            ).first()

            if not producto:
                raise HTTPException(
                    status_code=404,
                    detail=f"Producto {item['producto_id']} no encontrado"
                )

            if producto.stock is None:
                producto.stock = 0

            if producto.stock < item["cantidad"]:
                raise HTTPException(
                    status_code=400,
                    detail=f"Sin stock: {producto.nombre}"
                )

            subtotal = producto.precio * item["cantidad"]

            # descontar stock
            producto.stock -= item["cantidad"]

            total += subtotal

            # detalle venta
            detalle = VentaDetalle(
                venta_id=venta.id,
                producto_id=producto.id,
                cantidad=item["cantidad"],
                precio_unitario=producto.precio,
                subtotal=subtotal
            )

            db.add(detalle)

        # ==========================
        # 3. actualizar total
        # ==========================
        venta.total = round(total, 2)

        db.commit()
        db.refresh(venta)

        # ==========================
        # 4. auditoría
        # ==========================
        registrar_auditoria(
            db=db,
            modulo="POS",
            accion="Venta",
            descripcion=f"Venta #{venta.id} por S/ {venta.total}"
        )

        return {
            "venta_id": venta.id,
            "total": venta.total,
            "mensaje": "Venta registrada correctamente"
        }

    except HTTPException:
        db.rollback()
        raise

    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Error en venta: {str(e)}"
        )


# ==========================================
# 🧾 TICKET (PDF / IMPRESIÓN)
# ==========================================
@router.get("/ticket/{venta_id}")
def ticket(venta_id: int, db: Session = Depends(get_db)):

    venta = db.query(Venta).filter(Venta.id == venta_id).first()

    if not venta:
        raise HTTPException(status_code=404, detail="Venta no encontrada")

    # relación lazy load
    detalles = venta.detalles

    return StreamingResponse(
        generar_ticket(venta, detalles),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"inline; filename=ticket_{venta.id}.pdf"
        }
    )