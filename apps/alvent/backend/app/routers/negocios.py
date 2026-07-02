from pathlib import Path
from typing import List
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from sqlalchemy import func
from pydantic import BaseModel, Field

from app.database.database import get_db

from app.models.auditoria import Auditoria
from app.models.negocio import Negocio
from app.models.sucursal import Sucursal
from app.models.configuracion_negocio import ConfiguracionNegocio
from app.models.plan_pago import PlanPago
from app.models.usuario import Usuario

from app.schemas.negocio import (
    NegocioCreate,
    NegocioOut,
    NegocioUpdate,
    PlanPagoHistorialOut,
    PlanSolicitudCreate,
    PlanSolicitudOut,
    SucursalCreate,
    SucursalOut,
    ConfiguracionNegocioOut,
    ConfiguracionNegocioUpdate,
)

from app.services.auditoria import registrar_auditoria
from app.utils.dependencies import get_current_user
from app.utils.planes import obtener_catalogo_planes, obtener_plan_config, normalizar_plan

router = APIRouter(prefix="/negocios", tags=["Negocios"])


class PlanGratuitoBondadesUpdate(BaseModel):
    usuarios_source_plan: str = Field(default="GRATUITO", min_length=3, max_length=20)
    habilitar_reportes: bool = False
    reportes_source_plan: str = Field(default="LITE", min_length=3, max_length=20)
    habilitar_backups: bool = False
    backups_source_plan: str = Field(default="PRO", min_length=3, max_length=20)


class PlanMontosUpdate(BaseModel):
    gratuito: float = Field(ge=0)
    prueba: float = Field(ge=0)
    basico: float = Field(ge=0)
    lite: float = Field(ge=0)
    pro: float = Field(ge=0)
    premium: float = Field(ge=0)


PLAN_MONTOS_DEFAULT = {
    "GRATUITO": 0.0,
    "PRUEBA": 15.0,
    "BASICO": 20.0,
    "LITE": 35.0,
    "PRO": 45.0,
    "PREMIUM": 65.0,
}


def _resolver_montos_planes(negocio: Negocio) -> dict[str, float]:
    return {
        "GRATUITO": float(negocio.plan_monto_gratuito if negocio.plan_monto_gratuito is not None else PLAN_MONTOS_DEFAULT["GRATUITO"]),
        "PRUEBA": float(negocio.plan_monto_prueba if negocio.plan_monto_prueba is not None else PLAN_MONTOS_DEFAULT["PRUEBA"]),
        "BASICO": float(negocio.plan_monto_basico if negocio.plan_monto_basico is not None else PLAN_MONTOS_DEFAULT["BASICO"]),
        "LITE": float(negocio.plan_monto_lite if negocio.plan_monto_lite is not None else PLAN_MONTOS_DEFAULT["LITE"]),
        "PRO": float(negocio.plan_monto_pro if negocio.plan_monto_pro is not None else PLAN_MONTOS_DEFAULT["PRO"]),
        "PREMIUM": float(negocio.plan_monto_premium if negocio.plan_monto_premium is not None else PLAN_MONTOS_DEFAULT["PREMIUM"]),
    }


def _normalizar_source_plan(plan: str, fallback: str) -> str:
    valor = str(plan or fallback).upper().strip()
    if valor == "FREE":
        valor = "GRATUITO"
    if valor not in {"GRATUITO", "PRUEBA", "BASICO", "LITE", "PRO", "PREMIUM"}:
        raise HTTPException(status_code=400, detail="Plan fuente no valido")
    return valor


def _aplicar_bondades_gratuito(negocio: Negocio, base_config):
    usuarios_limite = (
        negocio.plan_gratuito_usuarios_limite
        if negocio.plan_gratuito_usuarios_limite is not None
        else base_config.usuarios_limite
    )

    reportes_habilitado = bool(
        negocio.plan_gratuito_reportes_habilitado or base_config.reportes_habilitado
    )
    reportes_limite = (
        negocio.plan_gratuito_reportes_limite
        if reportes_habilitado
        else 0
    )
    if reportes_habilitado and reportes_limite is None:
        reportes_limite = base_config.reportes_limite

    backups_habilitado = bool(
        negocio.plan_gratuito_backups_habilitado or base_config.backups_habilitado
    )
    backups_limite = (
        negocio.plan_gratuito_backups_limite
        if backups_habilitado
        else 0
    )
    if backups_habilitado and backups_limite is None:
        backups_limite = base_config.backups_limite

    return {
        "usuarios_limite": usuarios_limite,
        "reportes_habilitado": reportes_habilitado,
        "reportes_limite": reportes_limite,
        "backups_habilitado": backups_habilitado,
        "backups_limite": backups_limite,
    }


def _resolver_config_plan_para_negocio(negocio: Negocio, plan: str):
    base = obtener_plan_config(plan)
    if plan != "GRATUITO":
        return {
            "usuarios_limite": base.usuarios_limite,
            "reportes_habilitado": base.reportes_habilitado,
            "reportes_limite": base.reportes_limite,
            "backups_habilitado": base.backups_habilitado,
            "backups_limite": base.backups_limite,
        }
    return _aplicar_bondades_gratuito(negocio, base)


def _normalizar_plan(plan: str | None) -> str:
    try:
        return normalizar_plan(plan)
    except ValueError:
        raise HTTPException(status_code=400, detail="Plan no valido")


# =====================================================
# CREAR NEGOCIO (ONBOARDING)
# =====================================================
@router.post("/", response_model=NegocioOut)
def crear_negocio(
    data: NegocioCreate,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if hasattr(Negocio, "ruc") and data.ruc:
        existe = db.query(Negocio).filter(Negocio.ruc == data.ruc).first()
        if existe:
            raise HTTPException(status_code=400, detail="RUC ya registrado")

    payload = data.model_dump()
    negocio = Negocio(
        nombre=payload.get("nombre"),
        tipo=payload.get("tipo"),
        plan=_normalizar_plan(payload.get("plan")),
        descripcion=payload.get("descripcion"),
    )
    db.add(negocio)
    db.flush()  # obtiene ID sin commit aún

    # configuración por defecto
    config = ConfiguracionNegocio(negocio_id=negocio.id)
    db.add(config)

    # sucursal principal
    codigo_principal = f"PRINCIPAL-{negocio.id}"
    sucursal = Sucursal(
        negocio_id=negocio.id,
        nombre=f"{negocio.nombre} - Principal",
        codigo=codigo_principal,
        es_principal=True
    )
    db.add(sucursal)

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Error de integridad al crear el negocio")

    db.refresh(negocio)

    return negocio


# =====================================================
# LISTAR NEGOCIOS
# =====================================================
@router.get("/", response_model=List[NegocioOut])
def listar_negocios(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    is_superadmin = bool(current_user.get("is_superadmin"))
    if is_superadmin:
        return db.query(Negocio).order_by(Negocio.id.asc()).all()

    negocio_id = int(current_user.get("negocio_id") or 0)
    if not negocio_id:
        return []
    return db.query(Negocio).filter(Negocio.id == negocio_id).all()


# =====================================================
# OBTENER NEGOCIO
# =====================================================
@router.get("/{negocio_id}", response_model=NegocioOut)
def obtener_negocio(
    negocio_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    negocio = db.query(Negocio).filter(Negocio.id == negocio_id).first()

    if not negocio:
        raise HTTPException(status_code=404, detail="Negocio no encontrado")

    return negocio


# =====================================================
# ACTUALIZAR NEGOCIO
# =====================================================
@router.put("/{negocio_id}", response_model=NegocioOut)
def actualizar_negocio(
    negocio_id: int,
    data: NegocioUpdate,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    is_superadmin = bool(current_user.get("is_superadmin"))
    if not is_superadmin and current_user.get("negocio_id") != negocio_id:
        raise HTTPException(status_code=403, detail="Sin permiso")

    negocio = db.query(Negocio).filter(Negocio.id == negocio_id).first()

    if not negocio:
        raise HTTPException(status_code=404, detail="Negocio no encontrado")

    plan_anterior = _normalizar_plan(getattr(negocio, "plan", "BASICO"))

    payload = data.model_dump(exclude_unset=True)
    if "plan" in payload and not is_superadmin:
        raise HTTPException(status_code=403, detail="Solo superadministrador puede cambiar el plan")

    campos_permitidos = {
        "nombre",
        "tipo",
        "descripcion",
        "logo_url",
        "ruc",
        "razon_social",
        "documento_propietario",
        "email",
        "telefono",
        "whatsapp",
        "pais",
        "departamento",
        "provincia",
        "distrito",
        "direccion",
        "codigo_postal",
        "moneda",
        "zona_horaria",
        "idioma",
    }
    if is_superadmin:
        campos_permitidos.add("plan")

    for key, value in payload.items():
        if key in campos_permitidos:
            if key == "plan":
                value = _normalizar_plan(value)
            setattr(negocio, key, value)

    db.commit()
    db.refresh(negocio)

    plan_actual = _normalizar_plan(getattr(negocio, "plan", "BASICO"))
    if plan_anterior != plan_actual:
        actor = str(current_user.get("usuario_id") or "Sistema")
        registrar_auditoria(
            db=db,
            modulo="Planes",
            accion="Cambio de plan",
            descripcion=f"Negocio {negocio.id}: {plan_anterior} -> {plan_actual}",
            usuario=actor,
        )

    return negocio


@router.get("/planes/catalogo")
def obtener_catalogo_planes_endpoint(
    current_user: dict = Depends(get_current_user),
):
    return {
        "planes": obtener_catalogo_planes(),
    }


@router.get("/{negocio_id}/plan-gratuito-bondades")
def obtener_bondades_plan_gratuito(
    negocio_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    is_superadmin = bool(current_user.get("is_superadmin"))
    if not is_superadmin:
        raise HTTPException(status_code=403, detail="Solo superadministrador")

    negocio = db.query(Negocio).filter(Negocio.id == negocio_id).first()
    if not negocio:
        raise HTTPException(status_code=404, detail="Negocio no encontrado")

    base = obtener_plan_config("GRATUITO")
    config = _aplicar_bondades_gratuito(negocio, base)

    return {
        "usuarios_limite": config["usuarios_limite"],
        "reportes_habilitado": config["reportes_habilitado"],
        "reportes_limite": config["reportes_limite"],
        "backups_habilitado": config["backups_habilitado"],
        "backups_limite": config["backups_limite"],
        "custom": {
            "usuarios_limite": negocio.plan_gratuito_usuarios_limite,
            "reportes_habilitado": bool(negocio.plan_gratuito_reportes_habilitado),
            "reportes_limite": negocio.plan_gratuito_reportes_limite,
            "backups_habilitado": bool(negocio.plan_gratuito_backups_habilitado),
            "backups_limite": negocio.plan_gratuito_backups_limite,
        },
    }


@router.put("/{negocio_id}/plan-gratuito-bondades")
def actualizar_bondades_plan_gratuito(
    negocio_id: int,
    data: PlanGratuitoBondadesUpdate,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    is_superadmin = bool(current_user.get("is_superadmin"))
    if not is_superadmin:
        raise HTTPException(status_code=403, detail="Solo superadministrador")

    negocio = db.query(Negocio).filter(Negocio.id == negocio_id).first()
    if not negocio:
        raise HTTPException(status_code=404, detail="Negocio no encontrado")

    usuarios_source = _normalizar_source_plan(data.usuarios_source_plan, "GRATUITO")
    reportes_source = _normalizar_source_plan(data.reportes_source_plan, "LITE")
    backups_source = _normalizar_source_plan(data.backups_source_plan, "PRO")

    usuarios_cfg = obtener_plan_config(usuarios_source)
    reportes_cfg = obtener_plan_config(reportes_source)
    backups_cfg = obtener_plan_config(backups_source)

    negocio.plan_gratuito_usuarios_limite = usuarios_cfg.usuarios_limite
    negocio.plan_gratuito_reportes_habilitado = bool(data.habilitar_reportes and reportes_cfg.reportes_habilitado)
    negocio.plan_gratuito_reportes_limite = (
        reportes_cfg.reportes_limite if negocio.plan_gratuito_reportes_habilitado else 0
    )
    negocio.plan_gratuito_backups_habilitado = bool(data.habilitar_backups and backups_cfg.backups_habilitado)
    negocio.plan_gratuito_backups_limite = (
        backups_cfg.backups_limite if negocio.plan_gratuito_backups_habilitado else 0
    )

    db.commit()
    db.refresh(negocio)

    config = _resolver_config_plan_para_negocio(negocio, "GRATUITO")
    return {
        "ok": True,
        "mensaje": "Bondades del plan gratuito actualizadas",
        "usuarios_limite": config["usuarios_limite"],
        "reportes_habilitado": config["reportes_habilitado"],
        "reportes_limite": config["reportes_limite"],
        "backups_habilitado": config["backups_habilitado"],
        "backups_limite": config["backups_limite"],
    }


@router.get("/{negocio_id}/planes/montos")
def obtener_montos_planes(
    negocio_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    is_superadmin = bool(current_user.get("is_superadmin"))
    if not is_superadmin and current_user.get("negocio_id") != negocio_id:
        raise HTTPException(status_code=403, detail="Sin permiso")

    negocio = db.query(Negocio).filter(Negocio.id == negocio_id).first()
    if not negocio:
        raise HTTPException(status_code=404, detail="Negocio no encontrado")

    montos = _resolver_montos_planes(negocio)
    return {
        "negocio_id": negocio_id,
        "montos": {
            "gratuito": montos["GRATUITO"],
            "prueba": montos["PRUEBA"],
            "basico": montos["BASICO"],
            "lite": montos["LITE"],
            "pro": montos["PRO"],
            "premium": montos["PREMIUM"],
        },
    }


@router.put("/{negocio_id}/planes/montos")
def actualizar_montos_planes(
    negocio_id: int,
    data: PlanMontosUpdate,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    is_superadmin = bool(current_user.get("is_superadmin"))
    if not is_superadmin:
        raise HTTPException(status_code=403, detail="Solo superadministrador")

    negocio = db.query(Negocio).filter(Negocio.id == negocio_id).first()
    if not negocio:
        raise HTTPException(status_code=404, detail="Negocio no encontrado")

    negocio.plan_monto_gratuito = float(data.gratuito)
    negocio.plan_monto_prueba = float(data.prueba)
    negocio.plan_monto_basico = float(data.basico)
    negocio.plan_monto_lite = float(data.lite)
    negocio.plan_monto_pro = float(data.pro)
    negocio.plan_monto_premium = float(data.premium)

    db.commit()
    db.refresh(negocio)

    montos = _resolver_montos_planes(negocio)
    return {
        "ok": True,
        "mensaje": "Montos de planes actualizados",
        "montos": {
            "gratuito": montos["GRATUITO"],
            "prueba": montos["PRUEBA"],
            "basico": montos["BASICO"],
            "lite": montos["LITE"],
            "pro": montos["PRO"],
            "premium": montos["PREMIUM"],
        },
    }


@router.get("/{negocio_id}/plan-limites")
def obtener_resumen_plan(
    negocio_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    is_superadmin = bool(current_user.get("is_superadmin"))
    if not is_superadmin and current_user.get("negocio_id") != negocio_id:
        raise HTTPException(status_code=403, detail="Sin permiso")

    negocio = db.query(Negocio).filter(Negocio.id == negocio_id).first()
    if not negocio:
        raise HTTPException(status_code=404, detail="Negocio no encontrado")

    plan = _normalizar_plan(getattr(negocio, "plan", "BASICO"))
    config = _resolver_config_plan_para_negocio(negocio, plan)

    usuarios_consumidos = (
        db.query(Usuario)
        .filter(Usuario.negocio_id == negocio_id)
        .count()
    )

    reportes_consumidos = (
        db.query(func.count(Auditoria.id))
        .filter(Auditoria.modulo == "Reportes")
        .scalar()
        or 0
    )

    backup_dir = Path(__file__).resolve().parent.parent / "uploads" / "backups"
    backup_dir.mkdir(parents=True, exist_ok=True)
    backups_consumidos = len(list(backup_dir.glob(f"backup_negocio_{negocio_id}_*.db")))

    usuarios_limite = config["usuarios_limite"]
    reportes_limite = config["reportes_limite"]
    backups_limite = config["backups_limite"]

    def _disponibles(limite: int | None, consumidos: int) -> int | None:
        if limite is None:
            return None
        return max(0, limite - consumidos)

    return {
        "negocio_id": negocio_id,
        "plan": plan,
        "usuarios": {
            "consumidos": usuarios_consumidos,
            "limite": usuarios_limite,
            "disponibles": _disponibles(usuarios_limite, usuarios_consumidos),
            "habilitado": True,
        },
        "reportes": {
            "consumidos": int(reportes_consumidos),
            "limite": reportes_limite,
            "disponibles": _disponibles(reportes_limite, int(reportes_consumidos)),
            "habilitado": config["reportes_habilitado"],
        },
        "backups": {
            "consumidos": backups_consumidos,
            "limite": backups_limite,
            "disponibles": _disponibles(backups_limite, backups_consumidos),
            "habilitado": config["backups_habilitado"],
        },
    }


@router.post("/{negocio_id}/solicitar-plan", response_model=PlanSolicitudOut)
def solicitar_cambio_plan(
    negocio_id: int,
    data: PlanSolicitudCreate,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    is_superadmin = bool(current_user.get("is_superadmin"))
    if not is_superadmin and current_user.get("negocio_id") != negocio_id:
        raise HTTPException(status_code=403, detail="Sin permiso")

    negocio = db.query(Negocio).filter(Negocio.id == negocio_id).first()
    if not negocio:
        raise HTTPException(status_code=404, detail="Negocio no encontrado")

    plan_actual = _normalizar_plan(getattr(negocio, "plan", "BASICO"))
    plan_solicitado = _normalizar_plan(data.plan_objetivo)
    if plan_actual == plan_solicitado:
        raise HTTPException(status_code=400, detail="El negocio ya tiene ese plan")

    referencia = str(data.referencia_pago).strip()
    if len(referencia) < 3:
        raise HTTPException(status_code=400, detail="Referencia de pago invalida")

    canal = str(data.canal_pago or "transferencia").strip().lower()
    observaciones = str(data.observaciones or "").strip()
    comprobante_url = str(data.comprobante_url or "").strip() or None

    descripcion = (
        f"solicitud_plan negocio={negocio_id} actual={plan_actual} "
        f"solicitado={plan_solicitado} ref={referencia[:40]} canal={canal[:20]} obs={observaciones[:60]}"
    )

    registrar_auditoria(
        db=db,
        modulo="Planes",
        accion="Solicitud de plan",
        descripcion=descripcion[:250],
        usuario=str(current_user.get("usuario_id") or "Sistema"),
    )

    pago = PlanPago(
        negocio_id=negocio_id,
        usuario_id=int(current_user.get("usuario_id") or 0) or None,
        plan_actual=plan_actual,
        plan_solicitado=plan_solicitado,
        canal_pago=canal,
        referencia_pago=referencia,
        observaciones=observaciones[:120] or None,
        comprobante_url=comprobante_url,
        estado="APLICADO",
    )
    db.add(pago)

    negocio.plan = plan_solicitado
    db.commit()
    db.refresh(negocio)

    registrar_auditoria(
        db=db,
        modulo="Planes",
        accion="Activacion automatica por pago",
        descripcion=f"Negocio {negocio_id}: {plan_actual} -> {plan_solicitado} ref={referencia[:40]}",
        usuario=str(current_user.get("usuario_id") or "Sistema"),
    )

    return {
        "ok": True,
        "mensaje": "Pago registrado. Tu nuevo plan fue activado automaticamente.",
        "plan_actual": plan_actual,
        "plan_solicitado": plan_solicitado,
        "referencia_pago": referencia,
    }


@router.get("/{negocio_id}/planes/historial", response_model=List[PlanPagoHistorialOut])
def obtener_historial_planes(
    negocio_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    is_superadmin = bool(current_user.get("is_superadmin"))
    if not is_superadmin and current_user.get("negocio_id") != negocio_id:
        raise HTTPException(status_code=403, detail="Sin permiso")

    return (
        db.query(PlanPago)
        .filter(PlanPago.negocio_id == negocio_id)
        .order_by(PlanPago.id.desc())
        .limit(30)
        .all()
    )


@router.post("/{negocio_id}/planes/comprobante")
async def subir_comprobante_plan(
    negocio_id: int,
    archivo: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    is_superadmin = bool(current_user.get("is_superadmin"))
    if not is_superadmin and current_user.get("negocio_id") != negocio_id:
        raise HTTPException(status_code=403, detail="Sin permiso")

    content_type = (archivo.content_type or "").lower()
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
    carpeta = base_dir / "uploads" / "planes"
    carpeta.mkdir(parents=True, exist_ok=True)

    nombre = f"plan_pago_{negocio_id}_{uuid4().hex}{extension}"
    ruta = carpeta / nombre

    contenido = await archivo.read()
    if not contenido:
        raise HTTPException(status_code=400, detail="Archivo vacio")

    ruta.write_bytes(contenido)

    return {
        "url": f"/uploads/planes/{nombre}",
    }


@router.post("/{negocio_id}/logo", response_model=NegocioOut)
async def subir_logo_negocio(
    negocio_id: int,
    archivo: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    is_superadmin = bool(current_user.get("is_superadmin"))
    user_negocio_id = current_user.get("negocio_id")

    if not is_superadmin and user_negocio_id != negocio_id:
        raise HTTPException(status_code=403, detail="Sin permiso")

    negocio = db.query(Negocio).filter(Negocio.id == negocio_id).first()
    if not negocio:
        raise HTTPException(status_code=404, detail="Negocio no encontrado")

    content_type = (archivo.content_type or "").lower()
    if content_type not in {"image/png", "image/jpeg", "image/jpg", "image/webp"}:
        raise HTTPException(status_code=400, detail="Formato no permitido. Usa PNG, JPG o WEBP")

    base_dir = Path(__file__).resolve().parent.parent
    carpeta = base_dir / "uploads" / "negocios"
    carpeta.mkdir(parents=True, exist_ok=True)

    extension = Path(archivo.filename or "logo.png").suffix or ".png"
    nombre = f"logo_{negocio_id}_{uuid4().hex}{extension}"
    ruta = carpeta / nombre

    contenido = await archivo.read()
    if not contenido:
        raise HTTPException(status_code=400, detail="Archivo vacío")

    ruta.write_bytes(contenido)

    negocio.logo_url = f"/uploads/negocios/{nombre}"
    db.commit()
    db.refresh(negocio)

    return negocio


# =====================================================
# LISTAR SUCURSALES
# =====================================================
@router.get("/{negocio_id}/sucursales", response_model=List[SucursalOut])
def listar_sucursales(
    negocio_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.get("negocio_id") != negocio_id:
        raise HTTPException(status_code=403, detail="Sin acceso")

    return db.query(Sucursal).filter(Sucursal.negocio_id == negocio_id).all()


# =====================================================
# CREAR SUCURSAL
# =====================================================
@router.post("/{negocio_id}/sucursales", response_model=SucursalOut)
def crear_sucursal(
    negocio_id: int,
    data: SucursalCreate,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.get("negocio_id") != negocio_id:
        raise HTTPException(status_code=403, detail="Sin acceso")

    negocio = db.query(Negocio).filter(Negocio.id == negocio_id).first()
    if not negocio:
        raise HTTPException(status_code=404, detail="Negocio no encontrado")

    existe = db.query(Sucursal).filter(
        Sucursal.codigo == data.codigo
    ).first()

    if existe:
        raise HTTPException(status_code=400, detail="Código de sucursal ya existe")

    sucursal = Sucursal(negocio_id=negocio_id, **data.model_dump())
    db.add(sucursal)
    db.commit()
    db.refresh(sucursal)

    return sucursal


# =====================================================
# CONFIGURACIÓN
# =====================================================
@router.get("/{negocio_id}/configuracion", response_model=ConfiguracionNegocioOut)
def obtener_configuracion(
    negocio_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.get("negocio_id") != negocio_id:
        raise HTTPException(status_code=403, detail="Sin acceso")

    config = db.query(ConfiguracionNegocio).filter(
        ConfiguracionNegocio.negocio_id == negocio_id
    ).first()

    if not config:
        raise HTTPException(status_code=404, detail="Configuración no encontrada")

    return config


# =====================================================
# ACTUALIZAR CONFIGURACIÓN
# =====================================================
@router.put("/{negocio_id}/configuracion", response_model=ConfiguracionNegocioOut)
def actualizar_configuracion(
    negocio_id: int,
    data: ConfiguracionNegocioUpdate,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.get("negocio_id") != negocio_id:
        raise HTTPException(status_code=403, detail="Sin acceso")

    config = db.query(ConfiguracionNegocio).filter(
        ConfiguracionNegocio.negocio_id == negocio_id
    ).first()

    if not config:
        raise HTTPException(status_code=404, detail="Configuración no encontrada")

    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(config, key, value)

    db.commit()
    db.refresh(config)

    return config