from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models.cliente import Cliente
from app.models.usuario import Usuario
from app.models.venta import Venta
from app.models.venta_detalle import VentaDetalle
from app.models.producto import Producto
from app.models.caja import Caja


# =====================================================
# OVERVIEW ERP (VERSIÓN ESTABLE)
# =====================================================
def obtener_overview(db: Session, negocio_id: int | None):

    scoped = negocio_id is not None

    # ================= KPIs =================
    q_productos = db.query(Producto)
    if scoped:
        q_productos = q_productos.filter(Producto.negocio_id == negocio_id)
    total_productos = q_productos.count()

    q_clientes = db.query(Cliente)
    if scoped:
        q_clientes = q_clientes.filter(Cliente.negocio_id == negocio_id)
    total_clientes = q_clientes.count()

    q_usuarios = db.query(Usuario)
    if scoped:
        q_usuarios = q_usuarios.filter(Usuario.negocio_id == negocio_id)
    total_usuarios = q_usuarios.count()

    q_ventas_count = db.query(Venta)
    if scoped:
        q_ventas_count = (
            q_ventas_count
            .join(Usuario, Usuario.id == Venta.usuario_id)
            .filter(Usuario.negocio_id == negocio_id)
        )
    total_ventas = q_ventas_count.count()

    q_monto = db.query(func.coalesce(func.sum(Venta.total), 0))
    if scoped:
        q_monto = (
            q_monto
            .join(Usuario, Usuario.id == Venta.usuario_id)
            .filter(Usuario.negocio_id == negocio_id)
        )
    monto_vendido = q_monto.scalar() or 0

    q_caja = db.query(Caja)
    if scoped:
        q_caja = (
            q_caja
            .join(Usuario, Usuario.id == Caja.usuario_id)
            .filter(Usuario.negocio_id == negocio_id)
        )
    caja = q_caja.order_by(Caja.id.desc()).first()
    caja_abierta = caja is not None and (caja.estado or "").lower() == "abierta"

    # ================= VENTAS =================
    q_ventas = db.query(
        func.strftime('%Y-%m-%d', Venta.fecha),
        func.coalesce(func.sum(Venta.total), 0)
    )
    if scoped:
        q_ventas = (
            q_ventas
            .join(Usuario, Usuario.id == Venta.usuario_id)
            .filter(Usuario.negocio_id == negocio_id)
        )
    ventas_raw = (
        q_ventas
        .group_by(func.strftime('%Y-%m-%d', Venta.fecha))
        .order_by(func.strftime('%Y-%m-%d', Venta.fecha))
        .all()
    )

    ventas = [
        {"fecha": v[0], "ventas": float(v[1] or 0)}
        for v in ventas_raw
    ]

    # ================= CAJA =================
    caja_data = {
        "estado": caja.estado if caja else "cerrada",
        "saldo_inicial": caja.monto_inicial if caja else 0,
        "ingresos": getattr(caja, "total_ingresos", 0) if caja else 0,
        "egresos": getattr(caja, "total_egresos", 0) if caja else 0,
        "saldo_actual": caja.monto_final if caja else 0,
    }

    # ================= INVENTARIO =================
    q_stock = db.query(Producto).filter(
        Producto.stock <= Producto.stock_minimo
    )
    if scoped:
        q_stock = q_stock.filter(Producto.negocio_id == negocio_id)
    stock_critico = q_stock.count()

    q_valor_inv = db.query(
        func.coalesce(func.sum(Producto.stock * Producto.precio), 0)
    )
    if scoped:
        q_valor_inv = q_valor_inv.filter(Producto.negocio_id == negocio_id)
    valor_inventario = q_valor_inv.scalar() or 0

    inventario = {
        "total_productos": total_productos,
        "stock_critico": stock_critico,
        "valor_inventario": float(valor_inventario)
    }

    # ================= TOP PRODUCTOS =================
    q_top = (
        db.query(
            Producto.id,
            Producto.codigo,
            Producto.nombre,
            func.coalesce(func.sum(VentaDetalle.cantidad), 0)
        )
        .outerjoin(VentaDetalle, Producto.id == VentaDetalle.producto_id)
    )
    if scoped:
        q_top = q_top.filter(Producto.negocio_id == negocio_id)
    top = (
        q_top
        .group_by(Producto.id, Producto.codigo, Producto.nombre)
        .order_by(func.coalesce(func.sum(VentaDetalle.cantidad), 0).desc())
        .limit(10)
        .all()
    )

    top_productos = [
        {
            "id": t[0],
            "codigo": t[1],
            "nombre": t[2],
            "cantidad": int(t[3] or 0)
        }
        for t in top
    ]

    # ================= ALERTAS =================
    alertas = []

    if stock_critico > 0:
        alertas.append({
            "tipo": "Stock",
            "mensaje": f"{stock_critico} productos con stock crítico"
        })

    if caja_abierta:
        alertas.append({
            "tipo": "Caja",
            "mensaje": "Caja abierta"
        })

    # ================= RETURN FINAL =================
    return {
        "contexto": {
            "modo_global": not scoped,
            "negocio_id": negocio_id,
        },
        "kpis": {
            "productos": total_productos,
            "clientes": total_clientes,
            "usuarios": total_usuarios,
            "ventas": total_ventas,
            "monto_vendido": float(monto_vendido),
            "caja_abierta": caja_abierta
        },
        "ventas": ventas,
        "caja": caja_data,
        "inventario": inventario,
        "top_productos": top_productos,
        "alertas": alertas
    }