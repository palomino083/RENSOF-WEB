# ==========================================
# VENTAS ROUTER - ALVENT ERP CLEAN
# ==========================================

from datetime import date, datetime, timedelta
from html import escape
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.graphics.barcode.qr import QrCodeWidget
from reportlab.graphics.shapes import Drawing
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.database.database import get_db
from app.models.venta import Venta
from app.models.venta_detalle import VentaDetalle
from app.models.producto import Producto
from app.models.negocio import Negocio
from app.models.usuario import Usuario
from app.models.configuracion_negocio import configuracionNegocio
from app.schemas.venta import VentaCreate
from app.services.auditoria import registrar_auditoria
from app.services.sunat import construir_payload_sunat, emitir_en_sunat, homologar_error_nubefact, NUBEFACT_DEFAULT_URL
from app.utils.dependencies import get_current_user_with_negocio
from app.utils.planes import normalizar_plan, resolver_config_plan_negocio

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


def _validar_habilitacion_sunat_plan(db: Session, negocio_id: int, tipo_comprobante: str) -> None:
    if str(tipo_comprobante or "NINGUNO").upper() == "NINGUNO":
        return

    negocio = db.query(Negocio).filter(Negocio.id == negocio_id).first()
    if not negocio:
        return

    try:
        plan = normalizar_plan(getattr(negocio, "plan", "BASICO"))
    except ValueError:
        plan = "BASICO"

    config_plan = resolver_config_plan_negocio(negocio, plan)
    if not config_plan.sunat_habilitado:
        raise HTTPException(
            status_code=402,
            detail=f"SUNAT no disponible en plan {plan}. Mejora tu plan para emitir comprobantes.",
        )


def _format_money(value: float | int | None) -> str:
    return f"S/ {float(value or 0):,.2f}"


def _text_or_dash(value: object) -> str:
    text = str(value or "").strip()
    return text or "-"


def _pdf_escape(value: object) -> str:
    return escape(_text_or_dash(value))


def _numero_entero_a_letras(numero: int) -> str:
    unidades = [
        "CERO", "UNO", "DOS", "TRES", "CUATRO", "CINCO", "SEIS", "SIETE", "OCHO", "NUEVE",
        "DIEZ", "ONCE", "DOCE", "TRECE", "CATORCE", "QUINCE", "DIECISEIS", "DIECISIETE", "DIECIOCHO", "DIECINUEVE",
    ]
    decenas = ["", "", "VEINTE", "TREINTA", "CUARENTA", "CINCUENTA", "SESENTA", "SETENTA", "OCHENTA", "NOVENTA"]
    centenas = ["", "CIENTO", "DOSCIENTOS", "TRESCIENTOS", "CUATROCIENTOS", "QUINIENTOS", "SEISCIENTOS", "SETECIENTOS", "OCHOCIENTOS", "NOVECIENTOS"]

    if numero < 20:
        return unidades[numero]
    if numero < 100:
        d, u = divmod(numero, 10)
        if numero == 20:
            return "VEINTE"
        if 21 <= numero <= 29:
            return "VEINTI" + unidades[u].lower().upper()
        return decenas[d] if u == 0 else f"{decenas[d]} Y {unidades[u]}"
    if numero == 100:
        return "CIEN"
    if numero < 1000:
        c, r = divmod(numero, 100)
        return centenas[c] if r == 0 else f"{centenas[c]} {_numero_entero_a_letras(r)}"
    if numero < 1000000:
        m, r = divmod(numero, 1000)
        prefijo = "MIL" if m == 1 else f"{_numero_entero_a_letras(m)} MIL"
        return prefijo if r == 0 else f"{prefijo} {_numero_entero_a_letras(r)}"
    return str(numero)


def _importe_en_letras(total: float | int | None) -> str:
    monto = round(float(total or 0), 2)
    entero = int(monto)
    centimos = int(round((monto - entero) * 100))
    return f"{_numero_entero_a_letras(entero)} CON {centimos:02d}/100 SOLES"


def _tipo_comprobante_sunat(tipo_comprobante: str) -> str:
    return "01" if str(tipo_comprobante or "").upper() == "FACTURA" else "03"


def _tipo_documento_cliente(documento: object) -> str:
    digits = "".join(ch for ch in str(documento or "") if ch.isdigit())
    if len(digits) == 11:
        return "6"
    if len(digits) == 8:
        return "1"
    return "0"


def _crear_qr_flowable(value: str, size_mm: int = 34) -> Drawing:
    qr_code = QrCodeWidget(value)
    bounds = qr_code.getBounds()
    width = bounds[2] - bounds[0]
    height = bounds[3] - bounds[1]
    size = size_mm * mm
    drawing = Drawing(size, size, transform=[size / width, 0, 0, size / height, 0, 0])
    drawing.add(qr_code)
    return drawing


def _generar_comprobante_pdf(venta: Venta, negocio: Negocio | None) -> str | None:
    tipo_comprobante = str(venta.tipo_comprobante or "NINGUNO").upper()
    if tipo_comprobante == "NINGUNO":
        return None

    base_dir = Path(__file__).resolve().parent.parent
    carpeta = base_dir / "uploads" / "comprobantes"
    carpeta.mkdir(parents=True, exist_ok=True)

    nombre = f"venta_{venta.id}_{uuid4().hex}.pdf"
    ruta = carpeta / nombre

    styles = getSampleStyleSheet()
    normal = styles["BodyText"]
    title = styles["Title"]
    empresa = str(getattr(negocio, "razon_social", "") or getattr(negocio, "nombre", "") or "ALVENT ERP").strip()
    nombre_comercial = str(getattr(negocio, "nombre", "") or "").strip()
    ruc_emisor = _text_or_dash(getattr(negocio, "ruc", ""))
    direccion = _text_or_dash(getattr(negocio, "direccion", ""))
    usuario = getattr(venta, "usuario", None)
    usuario_nombre = _text_or_dash(getattr(usuario, "nombres", "") or getattr(usuario, "usuario", ""))
    usuario_rol = _text_or_dash(getattr(usuario, "rol", ""))
    comprobante_titulo = "FACTURA ELECTRONICA" if tipo_comprobante == "FACTURA" else "BOLETA DE VENTA ELECTRONICA"
    serie_numero = "-".join(
        part
        for part in [
            str(venta.serie_comprobante or "").strip(),
            str(venta.numero_comprobante or venta.id).strip(),
        ]
        if part
    )

    doc = SimpleDocTemplate(
        str(ruta),
        pagesize=A4,
        rightMargin=16 * mm,
        leftMargin=16 * mm,
        topMargin=14 * mm,
        bottomMargin=14 * mm,
        title=f"{tipo_comprobante}_{venta.id}",
    )

    emisor = [
        Paragraph(f"<b>{_pdf_escape(empresa)}</b>", styles["Heading2"]),
        Paragraph(f"Nombre comercial: {_pdf_escape(nombre_comercial)}", normal),
        Paragraph(f"RUC: {_pdf_escape(ruc_emisor)}", normal),
        Paragraph(f"Direccion: {_pdf_escape(direccion)}", normal),
    ]
    comprobante_box = Table(
        [
            [Paragraph(f"<b>RUC {_pdf_escape(ruc_emisor)}</b>", normal)],
            [Paragraph(f"<b>{_pdf_escape(comprobante_titulo)}</b>", normal)],
            [Paragraph(f"<b>{_pdf_escape(serie_numero)}</b>", normal)],
        ],
        colWidths=[58 * mm],
    )
    comprobante_box.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 1, colors.HexColor("#0f172a")),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("PADDING", (0, 0), (-1, -1), 7),
        ("BACKGROUND", (0, 1), (0, 1), colors.HexColor("#e2e8f0")),
    ]))

    cabecera = Table([[emisor, comprobante_box]], colWidths=[112 * mm, 60 * mm])
    cabecera.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))

    fecha_emision = (venta.fecha or datetime.utcnow()).strftime("%d/%m/%Y %H:%M")
    meta = Table([
        ["Fecha de emision", fecha_emision, "Moneda", "Soles"],
        ["Operacion interna", f"#{venta.id}", "Metodo de pago", _text_or_dash(venta.metodo_pago)],
        ["Cajero/Vendedor", f"{usuario_nombre} ({usuario_rol})", "Estado SUNAT", _text_or_dash(venta.sunat_estado)],
    ], colWidths=[34 * mm, 58 * mm, 34 * mm, 46 * mm])
    meta.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#cbd5e1")),
        ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#f1f5f9")),
        ("BACKGROUND", (2, 0), (2, -1), colors.HexColor("#f1f5f9")),
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTNAME", (2, 0), (2, -1), "Helvetica-Bold"),
        ("PADDING", (0, 0), (-1, -1), 5),
    ]))

    cliente_doc_label = "RUC" if tipo_comprobante == "FACTURA" else "DNI/RUC"
    cliente = Table([
        ["Cliente", _text_or_dash(venta.cliente_nombre or "Consumidor Final")],
        [cliente_doc_label, _text_or_dash(venta.cliente_documento)],
        ["Correo", _text_or_dash(venta.cliente_email)],
    ], colWidths=[34 * mm, 138 * mm])
    cliente.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#cbd5e1")),
        ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#f1f5f9")),
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("PADDING", (0, 0), (-1, -1), 5),
    ]))

    elementos = [cabecera, Spacer(1, 8), meta, Spacer(1, 8), cliente, Spacer(1, 10)]

    data = [["Descripcion", "Cant.", "P. Unit.", "Importe"]]
    for detalle in venta.detalles:
        producto = detalle.producto
        data.append([
            str(producto.nombre if producto else f"Producto {detalle.producto_id}")[:48],
            str(detalle.cantidad or 0),
            _format_money(detalle.precio_unitario),
            _format_money(detalle.subtotal),
        ])

    tabla = Table(data, colWidths=[88 * mm, 18 * mm, 33 * mm, 33 * mm])
    tabla.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e2e8f0")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#0f172a")),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#cbd5e1")),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("ALIGN", (1, 1), (-1, -1), "RIGHT"),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("PADDING", (0, 0), (-1, -1), 6),
    ]))
    elementos.extend([tabla, Spacer(1, 10)])

    total = float(venta.total or 0)
    op_gravada = round(total / 1.18, 2) if total else 0
    igv = round(total - op_gravada, 2)
    fecha_qr = (venta.fecha or datetime.utcnow()).strftime("%Y-%m-%d")
    cliente_documento = "".join(ch for ch in str(venta.cliente_documento or "") if ch.isdigit())
    qr_payload = "|".join([
        ruc_emisor if ruc_emisor != "-" else "",
        _tipo_comprobante_sunat(tipo_comprobante),
        str(venta.serie_comprobante or ""),
        str(venta.numero_comprobante or venta.id),
        f"{igv:.2f}",
        f"{total:.2f}",
        fecha_qr,
        _tipo_documento_cliente(cliente_documento),
        cliente_documento,
        str(venta.sunat_hash or ""),
    ])
    qr_block = Table(
        [[
            _crear_qr_flowable(qr_payload),
            [
                Paragraph("Codigo QR del comprobante", styles["Heading4"]),
                Paragraph(f"Hash: {_pdf_escape(venta.sunat_hash)}", normal),
                Paragraph("Representacion impresa del comprobante electronico.", styles["Italic"]),
                Paragraph("Consulte la validez del comprobante en los canales autorizados de SUNAT.", styles["Italic"]),
            ],
        ]],
        colWidths=[40 * mm, 132 * mm],
    )
    qr_block.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BOX", (0, 0), (-1, -1), 0.35, colors.HexColor("#cbd5e1")),
        ("PADDING", (0, 0), (-1, -1), 7),
    ]))
    totales = Table([
        ["Op. gravada", _format_money(op_gravada)],
        ["IGV 18%", _format_money(igv)],
        ["Descuento", _format_money(venta.descuento)],
        ["Importe total", _format_money(total)],
    ], colWidths=[120 * mm, 52 * mm])
    totales.setStyle(TableStyle([
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        ("LINEABOVE", (0, -1), (-1, -1), 0.6, colors.HexColor("#94a3b8")),
        ("PADDING", (0, 0), (-1, -1), 5),
    ]))
    elementos.extend([
        Paragraph(f"SON: {_importe_en_letras(total)}", normal),
        Spacer(1, 8),
        totales,
        Spacer(1, 14),
        qr_block,
    ])

    doc.build(elementos)
    return f"/uploads/comprobantes/{nombre}"


@router.post("/comprobante/upload")
async def subir_comprobante_pdf(
    archivo: UploadFile = File(...),
    venta_id: int | None = None,
    current_user: dict = Depends(get_current_user_with_negocio),
):
    content_type = (archivo.content_type or "").lower()
    extension = Path(archivo.filename or "").suffix.lower()
    if extension == ".htm":
        extension = ".html"

    extension_por_tipo = {
        "application/pdf": ".pdf",
        "application/x-pdf": ".pdf",
        "text/html": ".html",
    }

    if content_type in extension_por_tipo:
        extension = extension_por_tipo[content_type]
    elif extension not in {".pdf", ".html"}:
        raise HTTPException(status_code=400, detail="Solo se permiten comprobantes PDF o HTML")

    base_dir = Path(__file__).resolve().parent.parent
    carpeta = base_dir / "uploads" / "comprobantes"
    carpeta.mkdir(parents=True, exist_ok=True)

    nombre_base = f"venta_{venta_id}" if venta_id else "comprobante"
    nombre = f"{nombre_base}_{uuid4().hex}{extension}"
    ruta = carpeta / nombre

    contenido = await archivo.read()
    if not contenido:
        raise HTTPException(status_code=400, detail="Archivo vacio")

    ruta.write_bytes(contenido)

    return {
        "mensaje": "Comprobante subido",
        "url": f"/uploads/comprobantes/{nombre}",
        "venta_id": venta_id,
        "tipo": "application/pdf" if extension == ".pdf" else "text/html",
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
            "tipo_comprobante": v.tipo_comprobante or "NINGUNO",
            "cliente_nombre": v.cliente_nombre,
            "cliente_documento": v.cliente_documento,
            "serie_comprobante": v.serie_comprobante,
            "numero_comprobante": v.numero_comprobante,
            "sunat_estado": v.sunat_estado,
            "sunat_mensaje": v.sunat_mensaje,
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
            tipo_comprobante=(data.comprobante.tipo_comprobante if data.comprobante else "NINGUNO"),
            cliente_nombre=(data.comprobante.cliente_nombre if data.comprobante else None),
            cliente_documento=(data.comprobante.cliente_documento if data.comprobante else None),
            cliente_email=(data.comprobante.cliente_email if data.comprobante else None),
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

        tipo_comprobante = str(venta.tipo_comprobante or "NINGUNO").upper()
        if tipo_comprobante not in {"NINGUNO", "BOLETA", "FACTURA"}:
            tipo_comprobante = "NINGUNO"
            venta.tipo_comprobante = "NINGUNO"

        if tipo_comprobante != "NINGUNO":
            _validar_habilitacion_sunat_plan(db, int(negocio_id or 0), tipo_comprobante)

            documento = "".join(ch for ch in str(venta.cliente_documento or "") if ch.isdigit())
            nombre_cliente = str(venta.cliente_nombre or "").strip()
            if not nombre_cliente:
                raise HTTPException(status_code=400, detail="Nombre del cliente requerido para comprobante")

            if tipo_comprobante == "FACTURA" and len(documento) != 11:
                raise HTTPException(status_code=400, detail="Factura requiere RUC de 11 dígitos")
            if tipo_comprobante == "BOLETA" and len(documento) not in {8, 11}:
                raise HTTPException(status_code=400, detail="Boleta requiere DNI de 8 dígitos o RUC de 11 dígitos")

            config = db.query(configuracionNegocio).filter(configuracionNegocio.negocio_id == negocio_id).first()
            venta.serie_comprobante = (
                str(getattr(config, "sunat_serie_factura", "F001") or "F001").strip().upper()
                if tipo_comprobante == "FACTURA"
                else str(getattr(config, "sunat_serie_boleta", "B001") or "B001").strip().upper()
            )
            venta.numero_comprobante = str(venta.id)

            integracion_habilitada = bool(getattr(config, "integracion_sunat", False)) if config else False
            if integracion_habilitada:
                proveedor = str(getattr(config, "sunat_proveedor", "NUBEFACT") or "NUBEFACT").upper()
                if proveedor != "NUBEFACT":
                    raise HTTPException(status_code=400, detail="Proveedor SUNAT no soportado")

                endpoint = str(getattr(config, "sunat_api_url", "") or "").strip() or NUBEFACT_DEFAULT_URL
                emisor_ruc = "".join(ch for ch in str(getattr(config, "sunat_emisor_ruc", "") or "") if ch.isdigit())
                if len(emisor_ruc) != 11:
                    raise HTTPException(status_code=400, detail="Configura un RUC emisor SUNAT válido en configuracion")

                token = str(getattr(config, "sunat_api_token", "") or "").strip()
                if not token:
                    raise HTTPException(status_code=400, detail="Configura el token API de Nubefact para emitir")

                payload_sunat = construir_payload_sunat(
                    emisor_ruc=emisor_ruc,
                    tipo_comprobante=tipo_comprobante,
                    serie=venta.serie_comprobante or ("F001" if tipo_comprobante == "FACTURA" else "B001"),
                    correlativo=venta.numero_comprobante or str(venta.id),
                    fecha_emision=venta.fecha or datetime.utcnow(),
                    cliente_nombre=venta.cliente_nombre,
                    cliente_documento=documento,
                    cliente_email=venta.cliente_email,
                    moneda="PEN",
                    subtotal=float(venta.subtotal or 0),
                    descuento=float(venta.descuento or 0),
                    total=float(venta.total or 0),
                    items=[
                        {
                            "descripcion": str(d.producto.nombre if d.producto else f"Producto {d.producto_id}"),
                            "cantidad": d.cantidad,
                            "precio_unitario": d.precio_unitario,
                        }
                        for d in venta.detalles
                    ],
                )

                try:
                    result = emitir_en_sunat(
                        endpoint_url=endpoint,
                        api_token=token,
                        payload=payload_sunat,
                        usuario_sol=str(getattr(config, "sunat_usuario_sol", "") or "") or None,
                        clave_sol=str(getattr(config, "sunat_clave_sol", "") or "") or None,
                    )
                    venta.sunat_estado = str(result.get("estado") or "ENVIADO")
                    venta.sunat_codigo = str(result.get("codigo") or "") or None
                    venta.sunat_mensaje = str(result.get("mensaje") or "Comprobante enviado a SUNAT")
                    venta.sunat_hash = str(result.get("hash") or "") or None
                    venta.sunat_ticket = str(result.get("ticket") or "") or None
                    venta.sunat_cdr_url = str(result.get("enlace_cdr") or result.get("cdr_url") or "") or None
                except Exception as sunat_err:
                    mapped = homologar_error_nubefact(sunat_err)
                    raise HTTPException(
                        status_code=502,
                        detail={
                            "codigo": mapped.get("codigo"),
                            "mensaje": mapped.get("mensaje"),
                            "detalle": mapped.get("detalle"),
                        },
                    )
            else:
                venta.sunat_estado = "PENDIENTE_configuracion"
                venta.sunat_mensaje = "Integración SUNAT no habilitada"

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

        comprobante_pdf_url = None
        try:
            negocio = db.query(Negocio).filter(Negocio.id == negocio_id).first()
            comprobante_pdf_url = _generar_comprobante_pdf(venta, negocio)
        except Exception:
            comprobante_pdf_url = None

        registrar_auditoria(
            db=db,
            modulo="Ventas",
            accion="Crear",
            descripcion=f"Venta #{venta.id}"
        )

        return {
            "mensaje": "Venta registrada correctamente",
            "venta_id": venta.id,
            "total": venta.total,
            "comprobante_pdf_url": comprobante_pdf_url,
            "sunat": {
                "tipo_comprobante": venta.tipo_comprobante,
                "serie": venta.serie_comprobante,
                "numero": venta.numero_comprobante,
                "estado": venta.sunat_estado,
                "mensaje": venta.sunat_mensaje,
                "codigo": venta.sunat_codigo,
                "hash": venta.sunat_hash,
                "ticket": venta.sunat_ticket,
                "cdr_url": venta.sunat_cdr_url,
            },
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
