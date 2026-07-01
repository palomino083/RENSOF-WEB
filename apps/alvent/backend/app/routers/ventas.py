# ==========================================
# VENTAS ROUTER - ALVENT ERP CLEAN
# ==========================================

from datetime import date, datetime, timedelta
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.database.database import get_db
from app.models.venta import Venta
from app.models.venta_detalle import VentaDetalle
from app.models.producto import Producto
from app.models.usuario import Usuario
from app.schemas.venta import VentaCreate
from app.services.auditoria import registrar_auditoria
from app.utils.dependencies import get_current_user_with_negocio

from app.services.caja import (
    obtener_caja_abierta,
    registrar_venta_en_caja,
)

router = APIRouter(prefix="/ventas", tags=["Ventas"])

ROLES_VENDEDOR = {"CAJERO", "VENDEDOR"}

# ==========================================
# CONVERTIR UTC -> PERÚ (UTC-5)
# ==========================================
def hora_peru(fecha):
    if not fecha:
        return None

    return fecha - timedelta(hours=5)


def _query_ventas_por_contexto(db: Session, current_user: dict):
    is_superadmin = bool(current_user.get("is_superadmin"))
    if is_superadmin:
        return db.query(Venta)

    negocio_id = int(current_user.get("negocio_id") or 0)
    rol = str(current_user.get("rol") or "").upper()
    usuario_id = int(current_user.get("usuario_id") or 0)

    query = db.query(Venta).join(Usuario, Usuario.id == Venta.usuario_id)

    if rol in ROLES_VENDEDOR:
        return query.filter(
            Usuario.negocio_id == negocio_id,
            Venta.usuario_id == usuario_id,
        )

    return query.filter(Usuario.negocio_id == negocio_id)


def _restaurar_stock_venta(db: Session, venta: Venta, referencia: str) -> None:
    from app.models.inventario_movimiento import InventarioMovimiento

    for detalle in venta.detalles:
        producto = db.query(Producto).filter(Producto.id == detalle.producto_id).first()
        if not producto:
            raise HTTPException(status_code=404, detail=f"Producto {detalle.producto_id} no existe")

        producto.stock = int(producto.stock or 0) + int(detalle.cantidad or 0)

        db.add(
            InventarioMovimiento(
                producto_id=producto.id,
                tipo="ENTRADA",
                cantidad=int(detalle.cantidad or 0),
                referencia=referencia,
            )
        )


@router.post("/comprobante/upload")
async def subir_comprobante_pdf(
    archivo: UploadFile = File(...),
    venta_id: int | None = None,
    current_user: dict = Depends(get_current_user_with_negocio),
):
    content_type = (archivo.content_type or "").lower()
    if content_type not in {"application/pdf", "application/x-pdf"}:
        raise HTTPException(status_code=400, detail="Solo se permiten archivos PDF")

    base_dir = Path(__file__).resolve().parent.parent
    carpeta = base_dir / "uploads" / "comprobantes"
    carpeta.mkdir(parents=True, exist_ok=True)

    nombre_base = f"venta_{venta_id}" if venta_id else "comprobante"
    nombre = f"{nombre_base}_{uuid4().hex}.pdf"
    ruta = carpeta / nombre

    contenido = await archivo.read()
    if not contenido:
        raise HTTPException(status_code=400, detail="Archivo vacío")

    ruta.write_bytes(contenido)

    return {
        "mensaje": "Comprobante subido",
        "url": f"/uploads/comprobantes/{nombre}",
        "venta_id": venta_id,
    }

# ==========================================
# LISTAR VENTAS
# ==========================================
@router.get("/")
def listar_ventas(
    fecha_inicio: date | None = None,
    fecha_fin: date | None = None,
    current_user: dict = Depends(get_current_user_with_negocio),
    db: Session = Depends(get_db),
):

    query = _query_ventas_por_contexto(db, current_user).options(
        joinedload(Venta.detalles).joinedload(VentaDetalle.producto)
    )

    if fecha_inicio:
        query = query.filter(func.date(Venta.fecha) >= fecha_inicio)
    if fecha_fin:
        query = query.filter(func.date(Venta.fecha) <= fecha_fin)

    ventas = query.order_by(Venta.fecha.desc()).all()

    return [
        {
            "id": v.id,
            "fecha": hora_peru(v.fecha),
            "subtotal": v.subtotal or 0,
            "descuento": v.descuento or 0,
            "total": v.total or 0,
            "metodo_pago": v.metodo_pago,
            "estado": str(v.estado or "pagada").lower(),
            "items": [
                {
                    "producto_id": d.producto_id,
                    "nombre": d.producto.nombre if d.producto else "",
                    "cantidad": d.cantidad,
                    "precio": d.precio_unitario,
                    "subtotal": d.subtotal,
                }
                for d in v.detalles
            ]
        }
        for v in ventas
    ]


@router.patch("/{venta_id}/anular")
def anular_venta(
    venta_id: int,
    motivo: str | None = None,
    current_user: dict = Depends(get_current_user_with_negocio),
    db: Session = Depends(get_db),
):
    venta = (
        _query_ventas_por_contexto(db, current_user)
        .options(joinedload(Venta.detalles))
        .filter(Venta.id == venta_id)
        .first()
    )

    if not venta:
        raise HTTPException(status_code=404, detail="Venta no encontrada")

    estado = str(venta.estado or "pagada").lower()
    if estado in {"anulada", "devuelta"}:
        raise HTTPException(status_code=400, detail=f"La venta ya está {estado}")

    _restaurar_stock_venta(db, venta, f"ANULACION VENTA #{venta.id}")
    venta.estado = "anulada"

    db.commit()
    db.refresh(venta)

    actor = str(current_user.get("usuario_id") or "Sistema")
    registrar_auditoria(
        db=db,
        modulo="Ventas",
        accion="Anular",
        descripcion=f"Venta #{venta.id} anulada{f' - {motivo}' if motivo else ''}",
        usuario=actor,
    )

    return {
        "ok": True,
        "mensaje": "Venta anulada correctamente",
        "venta_id": venta.id,
        "estado": venta.estado,
    }


@router.patch("/{venta_id}/devolver")
def devolver_venta(
    venta_id: int,
    motivo: str | None = None,
    current_user: dict = Depends(get_current_user_with_negocio),
    db: Session = Depends(get_db),
):
    venta = (
        _query_ventas_por_contexto(db, current_user)
        .options(joinedload(Venta.detalles))
        .filter(Venta.id == venta_id)
        .first()
    )

    if not venta:
        raise HTTPException(status_code=404, detail="Venta no encontrada")

    estado = str(venta.estado or "pagada").lower()
    if estado in {"anulada", "devuelta"}:
        raise HTTPException(status_code=400, detail=f"La venta ya está {estado}")

    _restaurar_stock_venta(db, venta, f"DEVOLUCION VENTA #{venta.id}")
    venta.estado = "devuelta"

    db.commit()
    db.refresh(venta)

    actor = str(current_user.get("usuario_id") or "Sistema")
    registrar_auditoria(
        db=db,
        modulo="Ventas",
        accion="Devolucion",
        descripcion=f"Venta #{venta.id} devuelta{f' - {motivo}' if motivo else ''}",
        usuario=actor,
    )

    return {
        "ok": True,
        "mensaje": "Devolución aplicada correctamente",
        "venta_id": venta.id,
        "estado": venta.estado,
    }
# ==========================================
# CREAR VENTA (PROCESO COMPLETO)
# ==========================================
@router.post("/")
def crear_venta(
    data: VentaCreate,
    current_user: dict = Depends(get_current_user_with_negocio),
    db: Session = Depends(get_db),
):

    try:

    # ===============================
    # VALIDAR CAJA ABIERTA
    # ===============================

        actor_id = int(current_user.get("usuario_id") or 0)
        actor_rol = str(current_user.get("rol") or "").upper()
        actor_negocio_id = int(current_user.get("negocio_id") or 0)
        is_superadmin = bool(current_user.get("is_superadmin"))

        if not is_superadmin and actor_rol == "ALMACEN":
            raise HTTPException(status_code=403, detail="El rol ALMACEN no puede registrar ventas")

        if not is_superadmin and actor_rol in ROLES_VENDEDOR and data.usuario_id != actor_id:
            raise HTTPException(
                status_code=403,
                detail="Solo puedes registrar ventas con tu propio usuario",
            )

        usuario = db.query(Usuario).filter(Usuario.id == data.usuario_id).first()
        if not usuario:
            raise HTTPException(status_code=404, detail="Usuario no existe")

        if not is_superadmin and int(usuario.negocio_id or 0) != actor_negocio_id:
            raise HTTPException(
                status_code=403,
                detail="No puedes registrar ventas para usuarios de otro negocio",
            )

        negocio_id = usuario.negocio_id

        caja = obtener_caja_abierta(db, negocio_id)

        if caja is None:
            raise HTTPException(
                status_code=400,
                detail="Debe abrir una caja antes de vender."
            )

        venta = Venta(
            cliente_id=data.cliente_id,
            usuario_id=data.usuario_id,
            subtotal=data.subtotal or 0,
            descuento=data.descuento or 0,
            total=0,
            metodo_pago=data.metodo_pago,
            fecha=datetime.utcnow()
        )

        db.add(venta)
        db.flush()  # genera ID

        total = 0

        # ======================================
        # DETALLE + DESCUENTO + STOCK
        # ======================================
        for item in data.items:

            producto = db.query(Producto).filter(
                Producto.id == item.producto_id
            ).first()

            if not producto:
                raise HTTPException(status_code=404, detail="Producto no existe")

            if not is_superadmin and int(producto.negocio_id or 0) != actor_negocio_id:
                raise HTTPException(
                    status_code=403,
                    detail="Producto fuera de tu negocio",
                )

            if producto.stock < item.cantidad:
                raise HTTPException(status_code=400, detail="Stock insuficiente")

            # ==========================
            # DESCONTAR STOCK (CORRECTO)
            # ==========================
            producto.stock -= item.cantidad

            # IMPORT MOVIMIENTO INVENTARIO
            from app.models.inventario_movimiento import InventarioMovimiento

            subtotal_item = producto.precio * item.cantidad
            total += subtotal_item

            # ==========================
            # DETALLE DE VENTA
            # ==========================
            detalle = VentaDetalle(
                venta_id=venta.id,
                producto_id=producto.id,
                cantidad=item.cantidad,
                precio_unitario=producto.precio,
                subtotal=subtotal_item,
                costo_unitario=producto.costo or 0
            )

            db.add(detalle)

            # ==========================
            # MOVIMIENTO INVENTARIO
            # ==========================
            mov = InventarioMovimiento(
                producto_id=producto.id,
                tipo="SALIDA",
                cantidad=item.cantidad,
                referencia=f"VENTA #{venta.id}"
            )

            db.add(mov)

        # ======================================
        # TOTALES FINALES
        # ======================================
        venta.subtotal = total
        venta.total = max(0, total - (data.descuento or 0))
        # Registrar ingreso en caja
        registrar_venta_en_caja(
            db=db,
            caja=caja,
            usuario_id=data.usuario_id,
            venta_id=venta.id,
            total=venta.total,
        )

        db.commit()
        db.refresh(venta)

        registrar_auditoria(
            db=db,
            modulo="Ventas",
            accion="Crear",
            descripcion=f"Venta #{venta.id}"
        )

        return {
            "mensaje": "Venta registrada correctamente",
            "venta_id": venta.id,
            "total": venta.total
        }

    except HTTPException:
        db.rollback()
        raise

    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=str(e)
        )


# ==========================================
# REPORTE DE GANANCIAS
# ==========================================
@router.get("/reporte/ganancias")
def reporte_ganancias(
    current_user: dict = Depends(get_current_user_with_negocio),
    db: Session = Depends(get_db),
):

    ventas = _query_ventas_por_contexto(db, current_user).options(
        joinedload(Venta.detalles)
    ).all()

    total_ventas = 0
    total_costos = 0

    detalle = []

    for v in ventas:

        venta_total = v.total or 0

        costo_total = sum(
            (d.costo_unitario or 0) * d.cantidad
            for d in v.detalles
        )

        ganancia = venta_total - costo_total

        total_ventas += venta_total
        total_costos += costo_total

        detalle.append({
            "venta_id": v.id,
            "fecha": hora_peru(v.fecha),
            "venta": venta_total,
            "costo": costo_total,
            "ganancia": ganancia
        })

    return {
        "total_ventas": round(total_ventas, 2),
        "total_costos": round(total_costos, 2),
        "ganancia_total": round(total_ventas - total_costos, 2),
        "detalle": detalle
    }

# ==========================================
# RESUMEN DE VENTAS (ERP PRO)
# ==========================================
@router.get("/resumen")
def resumen_ventas(
    current_user: dict = Depends(get_current_user_with_negocio),
    db: Session = Depends(get_db),
):

    ventas = _query_ventas_por_contexto(db, current_user).all()

    def fecha_local(v):
        if not v.fecha:
            return None
        return hora_peru(v.fecha).date()

    hoy = datetime.utcnow().date()
    hoy_local = hora_peru(datetime.utcnow()).date()

    inicio_semana = hoy_local - timedelta(days=7)
    inicio_mes = hoy_local.replace(day=1)
    inicio_anio = hoy_local.replace(month=1, day=1)

    def filtrar(fecha_inicio):
        return [
            v for v in ventas
            if fecha_local(v) and fecha_local(v) >= fecha_inicio
        ]

    ventas_hoy = [
        v for v in ventas
        if fecha_local(v) == hoy_local
    ]

    ventas_semana = filtrar(inicio_semana)
    ventas_mes = filtrar(inicio_mes)
    ventas_anio = filtrar(inicio_anio)

    def calcular(data):
        total = sum(v.total or 0 for v in data)
        cantidad = len(data)
        return total, cantidad

    hoy_total, hoy_cant = calcular(ventas_hoy)
    sem_total, sem_cant = calcular(ventas_semana)
    mes_total, mes_cant = calcular(ventas_mes)
    anio_total, anio_cant = calcular(ventas_anio)

    return {
        "hoy": {
            "ventas": hoy_cant,
            "monto": round(hoy_total, 2)
        },
        "semana": {
            "ventas": sem_cant,
            "monto": round(sem_total, 2)
        },
        "mes": {
            "ventas": mes_cant,
            "monto": round(mes_total, 2)
        },
        "anio": {
            "ventas": anio_cant,
            "monto": round(anio_total, 2)
        }
    }