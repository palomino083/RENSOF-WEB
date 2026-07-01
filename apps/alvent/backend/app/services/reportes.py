from datetime import timedelta
from datetime import date
from sqlalchemy import func

from app.models.venta import Venta
from app.models.venta_detalle import VentaDetalle
from app.models.producto import Producto
from app.models.caja import Caja
from app.models.auditoria import Auditoria
from app.models.usuario import Usuario

ROLES_VENDEDOR = {"CAJERO", "VENDEDOR"}


# ==========================================
# CONVERTIR UTC -> PERÚ (UTC-5)
# ==========================================
def hora_peru(fecha):
    if not fecha:
        return None
    return fecha - timedelta(hours=5)


def _ventas_query_por_contexto(db, current_user):
    is_superadmin = bool(current_user.get("is_superadmin"))
    if is_superadmin:
        return db.query(Venta)

    negocio_id = int(current_user.get("negocio_id") or 0)
    rol = str(current_user.get("rol") or "").upper()
    usuario_id = int(current_user.get("usuario_id") or 0)

    query = db.query(Venta).join(Usuario, Usuario.id == Venta.usuario_id)
    query = query.filter(Usuario.negocio_id == negocio_id)

    if rol in ROLES_VENDEDOR:
        query = query.filter(Venta.usuario_id == usuario_id)

    return query
# ==========================================
# VENTAS DEL DÍA
# ==========================================

def ventas_hoy(db, current_user):

    hoy = date.today()
    query = _ventas_query_por_contexto(db, current_user)

    total = query.with_entities(func.sum(Venta.total)).filter(func.date(Venta.fecha) == hoy).scalar()

    cantidad = query.filter(func.date(Venta.fecha) == hoy).count()

    return {
        "fecha": str(hoy),
        "cantidad_ventas": cantidad,
        "total_vendido": round(total or 0, 2)
    }


# ==========================================
# VENTAS POR FECHAS
# ==========================================

def ventas_por_fechas(db, fecha_inicio, fecha_fin, current_user):

    ventas = _ventas_query_por_contexto(db, current_user).filter(
        func.date(Venta.fecha) >= fecha_inicio,
        func.date(Venta.fecha) <= fecha_fin
    ).all()

    return {
        "fecha_inicio": str(fecha_inicio),
        "fecha_fin": str(fecha_fin),
        "cantidad_ventas": len(ventas),
        "total_vendido": round(
            sum(v.total for v in ventas),
            2
        ),
        "ventas": [
            {
                "id": v.id,
                "fecha": hora_peru(v.fecha),
                "total": v.total
            }
            for v in ventas
        ]
    }

# ==========================================
# TOP PRODUCTOS
# ==========================================

def top_productos(
    db,
    limite=10
):

    datos = (
        db.query(
            Producto.id,
            Producto.codigo,
            Producto.nombre,
            func.sum(
                VentaDetalle.cantidad
            ).label("cantidad")
        )
        .join(
            VentaDetalle,
            Producto.id == VentaDetalle.producto_id
        )
        .group_by(
            Producto.id,
            Producto.codigo,
            Producto.nombre
        )
        .order_by(
            func.sum(
                VentaDetalle.cantidad
            ).desc()
        )
        .limit(limite)
        .all()
    )

    return [
        {
            "id": d.id,
            "codigo": d.codigo,
            "producto": d.nombre,
            "cantidad_vendida": d.cantidad
        }
        for d in datos
    ]


# ==========================================
# STOCK ACTUAL
# ==========================================

def stock_actual(db):

    productos = (
        db.query(Producto)
        .order_by(Producto.nombre)
        .all()
    )

    return [
        {
            "id": p.id,
            "codigo": p.codigo,
            "producto": p.nombre,
            "precio": p.precio,
            "stock": p.stock
        }
        for p in productos
    ]


# ==========================================
# STOCK BAJO
# ==========================================

def stock_bajo(
    db,
    minimo=5
):

    productos = (
        db.query(Producto)
        .filter(Producto.stock <= minimo)
        .order_by(Producto.stock)
        .all()
    )

    return [
        {
            "codigo": p.codigo,
            "producto": p.nombre,
            "stock": p.stock
        }
        for p in productos
    ]


# ==========================================
# CAJAS
# ==========================================

def reporte_cajas(db):

    cajas = (
        db.query(Caja)
        .order_by(Caja.id.desc())
        .all()
    )

    return [
        {
            "id": c.id,
            "fecha_apertura": c.fecha_apertura,
            "fecha_cierre": c.fecha_cierre,
            "monto_inicial": c.monto_inicial,
            "monto_final": c.monto_final,
            "estado": c.estado
        }
        for c in cajas
    ]


# ==========================================
# AUDITORÍA
# ==========================================

def reporte_auditoria(
    db,
    limite=100
):

    registros = (
        db.query(Auditoria)
        .order_by(Auditoria.id.desc())
        .limit(limite)
        .all()
    )

    return [
        {
            "fecha": a.fecha,
            "modulo": a.modulo,
            "accion": a.accion,
            "usuario": a.usuario,
            "descripcion": a.descripcion
        }
        for a in registros
    ]