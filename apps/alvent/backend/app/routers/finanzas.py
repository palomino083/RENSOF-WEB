from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy.orm import Session

from app.database.database import get_db
from app.models.finanzas import CierreMensualFinanzas, GastoOperativo
from app.models.negocio import Negocio
from app.models.plan_pago import PlanPago
from app.schemas.finanzas import (
    CierreMensualCreate,
    CierreMensualOut,
    GastoOperativoCreate,
    GastoOperativoOut,
    GastoOperativoUpdate,
    IngresoPlanOut,
    ResumenFinanzasOut,
)
from app.utils.dependencies import get_current_user
from app.utils.planes import normalizar_plan

router = APIRouter(prefix="/finanzas", tags=["Finanzas"])

CATEGORIAS_GASTO = [
    "Operaciones",
    "Marketing",
    "Infraestructura",
    "Personal",
    "Servicios",
    "Impuestos",
    "Soporte",
    "Otros",
]

PLAN_MONTOS_FALLBACK = {
    "GRATUITO": 0.0,
    "PRUEBA": 15.0,
    "BASICO": 20.0,
    "LITE": 35.0,
    "PRO": 45.0,
    "PREMIUM": 65.0,
}


def _validar_superadmin(current_user: dict) -> None:
    if not bool(current_user.get("is_superadmin")):
        raise HTTPException(status_code=403, detail="Solo superadministrador")


def _resolver_periodo(periodo: str | None) -> tuple[str, datetime, datetime]:
    ahora = datetime.utcnow()
    if not periodo:
        etiqueta = ahora.strftime("%Y-%m")
    else:
        etiqueta = str(periodo).strip()

    try:
        inicio = datetime.strptime(f"{etiqueta}-01", "%Y-%m-%d")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Periodo invalido. Usa formato YYYY-MM") from exc

    if inicio.month == 12:
        fin = datetime(inicio.year + 1, 1, 1)
    else:
        fin = datetime(inicio.year, inicio.month + 1, 1)

    return etiqueta, inicio, fin


def _monto_plan(negocio: Negocio, plan: str) -> float:
    codigo = normalizar_plan(plan)
    if codigo == "GRATUITO":
        return float(getattr(negocio, "plan_monto_gratuito", None) or PLAN_MONTOS_FALLBACK["GRATUITO"])
    if codigo == "PRUEBA":
        return float(getattr(negocio, "plan_monto_prueba", None) or PLAN_MONTOS_FALLBACK["PRUEBA"])
    if codigo == "BASICO":
        return float(getattr(negocio, "plan_monto_basico", None) or PLAN_MONTOS_FALLBACK["BASICO"])
    if codigo == "LITE":
        return float(getattr(negocio, "plan_monto_lite", None) or PLAN_MONTOS_FALLBACK["LITE"])
    if codigo == "PRO":
        return float(getattr(negocio, "plan_monto_pro", None) or PLAN_MONTOS_FALLBACK["PRO"])
    return float(getattr(negocio, "plan_monto_premium", None) or PLAN_MONTOS_FALLBACK["PREMIUM"])


def _listar_ingresos(db: Session, inicio: datetime, fin: datetime) -> list[IngresoPlanOut]:
    pagos = (
        db.query(PlanPago)
        .filter(PlanPago.estado == "APLICADO")
        .filter(PlanPago.fecha >= inicio, PlanPago.fecha < fin)
        .order_by(PlanPago.fecha.desc())
        .all()
    )

    rows: list[IngresoPlanOut] = []
    for item in pagos:
        negocio = db.query(Negocio).filter(Negocio.id == item.negocio_id).first()
        if not negocio:
            continue

        monto = _monto_plan(negocio, item.plan_solicitado)
        rows.append(
            IngresoPlanOut(
                id=item.id,
                negocio_id=int(item.negocio_id),
                negocio_nombre=str(getattr(negocio, "nombre", f"Negocio {item.negocio_id}")),
                plan_solicitado=normalizar_plan(item.plan_solicitado),
                canal_pago=str(item.canal_pago or "-"),
                referencia_pago=str(item.referencia_pago or "-"),
                fecha=item.fecha,
                monto=float(monto),
            )
        )

    return rows


def _listar_gastos(db: Session, inicio: datetime, fin: datetime) -> list[GastoOperativoOut]:
    gastos = (
        db.query(GastoOperativo)
        .filter(GastoOperativo.fecha_gasto >= inicio, GastoOperativo.fecha_gasto < fin)
        .order_by(GastoOperativo.fecha_gasto.desc(), GastoOperativo.id.desc())
        .all()
    )
    return [GastoOperativoOut.model_validate(g) for g in gastos]


@router.get("/categorias")
def listar_categorias(
    current_user: dict = Depends(get_current_user),
):
    _validar_superadmin(current_user)
    return {"categorias": CATEGORIAS_GASTO}


@router.get("/resumen", response_model=ResumenFinanzasOut)
def obtener_resumen_finanzas(
    periodo: str | None = Query(default=None, description="Formato YYYY-MM"),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _validar_superadmin(current_user)
    etiqueta, inicio, fin = _resolver_periodo(periodo)

    ingresos = _listar_ingresos(db, inicio, fin)
    gastos = _listar_gastos(db, inicio, fin)

    ingresos_total = float(sum(x.monto for x in ingresos))
    gastos_total = float(sum(x.monto for x in gastos))

    return ResumenFinanzasOut(
        periodo=etiqueta,
        ingresos_total=ingresos_total,
        gastos_total=gastos_total,
        utilidad_total=ingresos_total - gastos_total,
        ingresos=ingresos,
        gastos=gastos,
    )


@router.get("/gastos", response_model=list[GastoOperativoOut])
def listar_gastos(
    periodo: str | None = Query(default=None, description="Formato YYYY-MM"),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _validar_superadmin(current_user)
    _, inicio, fin = _resolver_periodo(periodo)
    return _listar_gastos(db, inicio, fin)


@router.post("/gastos", response_model=GastoOperativoOut)
def crear_gasto(
    data: GastoOperativoCreate,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _validar_superadmin(current_user)

    categoria = str(data.categoria or "").strip()
    if categoria not in CATEGORIAS_GASTO:
        raise HTTPException(status_code=400, detail="Categoria no permitida")

    gasto = GastoOperativo(
        categoria=categoria,
        descripcion=str(data.descripcion).strip(),
        monto=float(data.monto),
        proveedor=str(data.proveedor or "").strip() or None,
        fecha_gasto=data.fecha_gasto or datetime.utcnow(),
        creado_por=int(current_user.get("usuario_id") or 0) or None,
    )
    db.add(gasto)
    db.commit()
    db.refresh(gasto)
    return GastoOperativoOut.model_validate(gasto)


@router.put("/gastos/{gasto_id}", response_model=GastoOperativoOut)
def editar_gasto(
    gasto_id: int,
    data: GastoOperativoUpdate,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _validar_superadmin(current_user)

    gasto = db.query(GastoOperativo).filter(GastoOperativo.id == gasto_id).first()
    if not gasto:
        raise HTTPException(status_code=404, detail="Gasto no encontrado")

    payload = data.model_dump(exclude_unset=True)
    if "categoria" in payload:
        categoria = str(payload["categoria"] or "").strip()
        if categoria not in CATEGORIAS_GASTO:
            raise HTTPException(status_code=400, detail="Categoria no permitida")
        gasto.categoria = categoria
    if "descripcion" in payload:
        gasto.descripcion = str(payload["descripcion"] or "").strip()
    if "monto" in payload:
        gasto.monto = float(payload["monto"])
    if "proveedor" in payload:
        gasto.proveedor = str(payload["proveedor"] or "").strip() or None
    if "fecha_gasto" in payload:
        gasto.fecha_gasto = payload["fecha_gasto"] or gasto.fecha_gasto

    db.commit()
    db.refresh(gasto)
    return GastoOperativoOut.model_validate(gasto)


@router.delete("/gastos/{gasto_id}")
def eliminar_gasto(
    gasto_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _validar_superadmin(current_user)

    gasto = db.query(GastoOperativo).filter(GastoOperativo.id == gasto_id).first()
    if not gasto:
        raise HTTPException(status_code=404, detail="Gasto no encontrado")

    db.delete(gasto)
    db.commit()
    return {"ok": True, "mensaje": "Gasto eliminado"}


@router.post("/gastos/{gasto_id}/comprobante", response_model=GastoOperativoOut)
async def subir_comprobante_gasto(
    gasto_id: int,
    archivo: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _validar_superadmin(current_user)

    gasto = db.query(GastoOperativo).filter(GastoOperativo.id == gasto_id).first()
    if not gasto:
        raise HTTPException(status_code=404, detail="Gasto no encontrado")

    content_type = str(archivo.content_type or "").lower()
    permitidos = {
        "image/png",
        "image/jpeg",
        "image/jpg",
        "image/webp",
        "application/pdf",
    }
    if content_type not in permitidos:
        raise HTTPException(status_code=400, detail="Formato no permitido. Usa PNG, JPG, WEBP o PDF")

    extension = Path(archivo.filename or "comprobante").suffix or ".bin"
    base_dir = Path(__file__).resolve().parent.parent
    carpeta = base_dir / "uploads" / "finanzas"
    carpeta.mkdir(parents=True, exist_ok=True)

    nombre = f"gasto_{gasto_id}_{uuid4().hex}{extension}"
    ruta = carpeta / nombre

    contenido = await archivo.read()
    if not contenido:
        raise HTTPException(status_code=400, detail="Archivo vacio")

    ruta.write_bytes(contenido)
    gasto.comprobante_url = f"/uploads/finanzas/{nombre}"

    db.commit()
    db.refresh(gasto)
    return GastoOperativoOut.model_validate(gasto)


@router.post("/cierre-mensual", response_model=CierreMensualOut)
def cerrar_mes(
    data: CierreMensualCreate,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _validar_superadmin(current_user)

    etiqueta, inicio, fin = _resolver_periodo(data.periodo)
    existe = db.query(CierreMensualFinanzas).filter(CierreMensualFinanzas.periodo == etiqueta).first()
    if existe:
        raise HTTPException(status_code=400, detail="El periodo ya se encuentra cerrado")

    ingresos = _listar_ingresos(db, inicio, fin)
    gastos = _listar_gastos(db, inicio, fin)

    ingresos_total = float(sum(x.monto for x in ingresos))
    gastos_total = float(sum(x.monto for x in gastos))

    cierre = CierreMensualFinanzas(
        periodo=etiqueta,
        ingresos_total=ingresos_total,
        gastos_total=gastos_total,
        utilidad_total=ingresos_total - gastos_total,
        observaciones=str(data.observaciones or "").strip() or None,
        cerrado_por=int(current_user.get("usuario_id") or 0) or None,
        fecha_cierre=datetime.now(timezone.utc).replace(tzinfo=None),
    )
    db.add(cierre)
    db.commit()
    db.refresh(cierre)
    return CierreMensualOut.model_validate(cierre)


@router.get("/cierres", response_model=list[CierreMensualOut])
def listar_cierres(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _validar_superadmin(current_user)
    cierres = (
        db.query(CierreMensualFinanzas)
        .order_by(CierreMensualFinanzas.periodo.desc())
        .limit(24)
        .all()
    )
    return [CierreMensualOut.model_validate(c) for c in cierres]
