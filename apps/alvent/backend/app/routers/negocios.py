from pathlib import Path
from typing import List
from uuid import uuid4
import json
import re
import hashlib
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from sqlalchemy import func
from pydantic import BaseModel, Field

from app.database.database import get_db

from app.models.auditoria import Auditoria
from app.models.negocio import Negocio
from app.models.sucursal import Sucursal
from app.models.configuracion_negocio import configuracionNegocio
from app.models.plan_pago import PlanPago
from app.models.producto import Producto
from app.models.soporte_ticket import SoporteTicket
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
    configuracionNegocioOut,
    configuracionNegocioUpdate,
    SunatConexionTestOut,
)
from app.services.sunat import probar_conexion_sunat, homologar_error_nubefact, NUBEFACT_DEFAULT_URL

from app.services.auditoria import registrar_auditoria
from app.utils.dependencies import get_current_user
from app.utils.planes import (
    normalizar_plan,
    obtener_dias_vigencia_plan,
    obtener_catalogo_planes,
    obtener_catalogo_planes_para_negocio,
    obtener_plan_config,
    resolver_plan_vigente,
    resolver_config_plan_negocio,
)

router = APIRouter(prefix="/negocios", tags=["Negocios"])

MIN_DURACION_DIAS_PLAN = 1
MAX_DURACION_DIAS_PLAN = 3650


def _vigencia_hasta_para_plan(plan_codigo: str) -> datetime | None:
    dias = obtener_dias_vigencia_plan(plan_codigo)
    if dias is None:
        return None
    return datetime.utcnow() + timedelta(days=int(dias))


def _resolver_duracion_dias(plan_codigo: str, duracion_solicitada: int | None = None) -> int | None:
    default_dias = obtener_dias_vigencia_plan(plan_codigo)
    if duracion_solicitada is None:
        return default_dias

    dias = int(duracion_solicitada)
    if dias < MIN_DURACION_DIAS_PLAN or dias > MAX_DURACION_DIAS_PLAN:
        raise HTTPException(
            status_code=400,
            detail=f"Duracion invalida. Usa entre {MIN_DURACION_DIAS_PLAN} y {MAX_DURACION_DIAS_PLAN} dias",
        )
    return dias


def _fecha_inicio_vigencia(negocio: Negocio, plan_objetivo: str) -> datetime:
    ahora = datetime.utcnow()
    plan_actual = _normalizar_plan(getattr(negocio, "plan", "GRATUITO"))
    vigente_hasta = getattr(negocio, "plan_vigente_hasta", None)

    if (
        plan_actual == plan_objetivo
        and isinstance(vigente_hasta, datetime)
        and vigente_hasta > ahora
    ):
        return vigente_hasta

    return ahora


def _calcular_rango_vigencia(inicio: datetime, duracion_dias: int | None) -> tuple[datetime | None, datetime | None]:
    if duracion_dias is None:
        return None, None
    return inicio, inicio + timedelta(days=int(duracion_dias))


def _token_idempotencia_pago(
    negocio_id: int,
    plan_solicitado: str,
    referencia: str,
    canal: str,
    duracion_dias: int | None,
) -> str:
    raw = f"{negocio_id}|{plan_solicitado}|{referencia.lower()}|{canal.lower()}|{duracion_dias or 'N'}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:64]


def _sincronizar_plan_vigente(negocio: Negocio, db: Session, *, persist: bool = True) -> str:
    plan_vigente, vencio = resolver_plan_vigente(negocio)
    if vencio and getattr(negocio, "plan", None) != "GRATUITO":
        plan_anterior = _normalizar_plan(getattr(negocio, "plan", "GRATUITO"))
        negocio.plan = "GRATUITO"
        negocio.plan_vigente_hasta = None
        registrar_auditoria(
            db=db,
            modulo="Planes",
            accion="Vencimiento automatico",
            descripcion=f"Negocio {negocio.id}: {plan_anterior} -> GRATUITO (vigencia vencida)",
            usuario="Sistema",
        )
        if persist:
            db.commit()
            db.refresh(negocio)
        return "GRATUITO"
    return plan_vigente


def _sincronizar_planes_lote(negocios: list[Negocio], db: Session) -> None:
    hubo_cambios = False
    for negocio in negocios:
        plan_inicial = _normalizar_plan(getattr(negocio, "plan", "GRATUITO"))
        plan_resultante = _sincronizar_plan_vigente(negocio, db, persist=False)
        if plan_resultante != plan_inicial:
            hubo_cambios = True

    if hubo_cambios:
        db.commit()


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


class PlanCatalogoEditableItem(BaseModel):
    codigo: str = Field(min_length=3, max_length=20)
    usuarios_limite: int | None = Field(default=None, ge=0)
    reportes_habilitado: bool = False
    reportes_limite: int | None = Field(default=None, ge=0)
    backups_habilitado: bool = False
    backups_limite: int | None = Field(default=None, ge=0)
    soporte_habilitado: bool = True
    reinicio_habilitado: bool = True
    productos_limite: int | None = Field(default=None, ge=0)
    sunat_habilitado: bool = False
    puntos_recuperacion_habilitado: bool = False


class PlanCatalogoEditableUpdate(BaseModel):
    planes: List[PlanCatalogoEditableItem] = Field(default_factory=list)


class SimuladorEscenarioItem(BaseModel):
    id: str = Field(min_length=3, max_length=80)
    nombre: str = Field(min_length=3, max_length=80)
    plancodigo: str = Field(min_length=3, max_length=20)
    override: dict
    fecha: str = Field(min_length=8, max_length=40)


class SimuladorEscenariosUpdate(BaseModel):
    escenarios: List[SimuladorEscenarioItem] = Field(default_factory=list)


class PlanPagoValidacionUpdate(BaseModel):
    accion: str = Field(min_length=7, max_length=10)


class CuentaCobroCanalUpdate(BaseModel):
    titulo: str = Field(min_length=3, max_length=120)
    detalle: List[str] = Field(default_factory=list, min_length=1, max_length=8)


class CuentasCobroUpdate(BaseModel):
    transferencia: CuentaCobroCanalUpdate
    tarjeta: CuentaCobroCanalUpdate
    yape: CuentaCobroCanalUpdate
    plin: CuentaCobroCanalUpdate


PLAN_MONTOS_DEFAULT = {
    "GRATUITO": 0.0,
    "PRUEBA": 15.0,
    "BASICO": 20.0,
    "LITE": 35.0,
    "PRO": 45.0,
    "PREMIUM": 65.0,
}


CUENTAS_COBRO_DEFAULT: dict[str, dict[str, object]] = {
    "transferencia": {
        "titulo": "Cuenta bancaria para transferencia",
        "detalle": [
            "Banco: BCP",
            "Titular: RENSOF S.A.C.",
            "Cuenta corriente: xxxxxxxxxxxxxxxxxxxxx",
            "CCI: yyyyyyyyyyyyyyyyy",
        ],
    },
    "tarjeta": {
        "titulo": "Pago con tarjeta (alineado a cuenta bancaria)",
        "detalle": [
            "Deposita el abono en la misma cuenta bancaria oficial de ALVENT ERP PRO.",
            "Banco: BCP - Cuenta corriente xxxxxxxxxxxxxxxxxxxxx",
            "CCI: yyyyyyyyyyyyyyyyy",
        ],
    },
    "yape": {
        "titulo": "Yape",
        "detalle": [
            "Numero de abono Yape: zzzzzzzzzzzz",
            "Titular: RENSOF S.A.C.",
        ],
    },
    "plin": {
        "titulo": "Plin",
        "detalle": [
            "Numero de abono Plin: zzzzzzzzzzzz",
            "Titular: RENSOF S.A.C.",
        ],
    },
}


def _leer_plan_catalogo_custom(negocio: Negocio) -> dict:
    raw_custom = str(getattr(negocio, "plan_catalogo_custom", "") or "").strip()
    try:
        custom_map = json.loads(raw_custom) if raw_custom else {}
    except json.JSONDecodeError:
        custom_map = {}
    if not isinstance(custom_map, dict):
        custom_map = {}
    return custom_map


def _normalizar_detalle_cuenta(value: object, fallback: list[str]) -> list[str]:
    if not isinstance(value, list):
        return list(fallback)
    salida = [str(item).strip() for item in value if str(item).strip()]
    if not salida:
        return list(fallback)
    return salida[:8]


def _resolver_cuentas_cobro(negocio: Negocio) -> dict[str, dict[str, object]]:
    custom_map = _leer_plan_catalogo_custom(negocio)
    raw = custom_map.get("__cuentas_cobro__", {})
    raw = raw if isinstance(raw, dict) else {}

    cuentas: dict[str, dict[str, object]] = {}
    for canal, base in CUENTAS_COBRO_DEFAULT.items():
        cfg = raw.get(canal, {})
        cfg = cfg if isinstance(cfg, dict) else {}

        titulo = str(cfg.get("titulo") or base["titulo"]).strip()
        if len(titulo) < 3:
            titulo = str(base["titulo"])

        detalle = _normalizar_detalle_cuenta(cfg.get("detalle"), list(base["detalle"]))
        cuentas[canal] = {
            "titulo": titulo,
            "detalle": detalle,
        }

    return cuentas


def _guardar_cuentas_cobro(negocio: Negocio, cuentas: dict[str, dict[str, object]]):
    custom_map = _leer_plan_catalogo_custom(negocio)
    custom_map["__cuentas_cobro__"] = cuentas
    negocio.plan_catalogo_custom = json.dumps(custom_map, ensure_ascii=False)


def _resolver_montos_planes(negocio: Negocio) -> dict[str, float]:
    return {
        "GRATUITO": float(negocio.plan_monto_gratuito if negocio.plan_monto_gratuito is not None else PLAN_MONTOS_DEFAULT["GRATUITO"]),
        "PRUEBA": float(negocio.plan_monto_prueba if negocio.plan_monto_prueba is not None else PLAN_MONTOS_DEFAULT["PRUEBA"]),
        "BASICO": float(negocio.plan_monto_basico if negocio.plan_monto_basico is not None else PLAN_MONTOS_DEFAULT["BASICO"]),
        "LITE": float(negocio.plan_monto_lite if negocio.plan_monto_lite is not None else PLAN_MONTOS_DEFAULT["LITE"]),
        "PRO": float(negocio.plan_monto_pro if negocio.plan_monto_pro is not None else PLAN_MONTOS_DEFAULT["PRO"]),
        "PREMIUM": float(negocio.plan_monto_premium if negocio.plan_monto_premium is not None else PLAN_MONTOS_DEFAULT["PREMIUM"]),
    }


def _leer_escenarios_simulador(negocio: Negocio) -> list[dict]:
    raw = str(getattr(negocio, "plan_simulador_escenarios", "") or "").strip()
    if not raw:
        return []
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, list):
            return parsed
    except json.JSONDecodeError:
        return []
    return []


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
    cfg = resolver_config_plan_negocio(negocio, plan)
    return {
        "usuarios_limite": cfg.usuarios_limite,
        "reportes_habilitado": cfg.reportes_habilitado,
        "reportes_limite": cfg.reportes_limite,
        "backups_habilitado": cfg.backups_habilitado,
        "backups_limite": cfg.backups_limite,
        "soporte_habilitado": cfg.soporte_habilitado,
        "reinicio_habilitado": cfg.reinicio_habilitado,
        "productos_limite": cfg.productos_limite,
        "sunat_habilitado": cfg.sunat_habilitado,
        "puntos_recuperacion_habilitado": cfg.puntos_recuperacion_habilitado,
    }


def _normalizar_plan(plan: str | None) -> str:
    try:
        return normalizar_plan(plan)
    except ValueError:
        raise HTTPException(status_code=400, detail="Plan no valido")


def _configuracion_out_payload(config: configuracionNegocio) -> dict:
    return {
        "id": config.id,
        "negocio_id": config.negocio_id,
        "impuesto_predeterminado": config.impuesto_predeterminado,
        "margen_minimo": config.margen_minimo,
        "permitir_venta_negativo": config.permitir_venta_negativo,
        "permitir_descuentos": config.permitir_descuentos,
        "descuento_maximo_porcentaje": config.descuento_maximo_porcentaje,
        "numero_caja": config.numero_caja,
        "requiere_lote": config.requiere_lote,
        "requiere_vencimiento": config.requiere_vencimiento,
        "stock_minimo_alerta": config.stock_minimo_alerta,
        "integracion_sunat": bool(getattr(config, "integracion_sunat", False)),
        "sunat_proveedor": str(getattr(config, "sunat_proveedor", "NUBEFACT") or "NUBEFACT").upper(),
        "sunat_api_url": getattr(config, "sunat_api_url", None) or NUBEFACT_DEFAULT_URL,
        "sunat_usuario_sol": getattr(config, "sunat_usuario_sol", None),
        "sunat_emisor_ruc": getattr(config, "sunat_emisor_ruc", None),
        "sunat_modo": getattr(config, "sunat_modo", "beta"),
        "sunat_serie_boleta": getattr(config, "sunat_serie_boleta", None),
        "sunat_serie_factura": getattr(config, "sunat_serie_factura", None),
        "sunat_has_api_token": bool(str(getattr(config, "sunat_api_token", "") or "").strip()),
        "sunat_has_clave_sol": bool(str(getattr(config, "sunat_clave_sol", "") or "").strip()),
        "fecha_creacion": config.fecha_creacion,
        "fecha_actualizacion": config.fecha_actualizacion,
    }


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
    plan_solicitado = _normalizar_plan(payload.get("plan"))

    # Regla de onboarding: en el primer negocio del usuario registrado
    # el plan siempre inicia en GRATUITO. El cambio de plan se gestiona luego.
    usuario_actual = (
        db.query(Usuario)
        .filter(Usuario.id == int(current_user.get("usuario_id") or 0))
        .first()
    )
    es_creacion_inicial = bool(usuario_actual and not usuario_actual.negocio_id)
    forzar_plan_gratuito = bool(not current_user.get("is_superadmin") and es_creacion_inicial)

    plan_inicial = "GRATUITO" if forzar_plan_gratuito else plan_solicitado

    negocio = Negocio(
        nombre=payload.get("nombre"),
        tipo=payload.get("tipo"),
        plan=plan_inicial,
        plan_vigente_hasta=_vigencia_hasta_para_plan(plan_inicial),
        descripcion=payload.get("descripcion"),
    )
    db.add(negocio)
    db.flush()  # obtiene ID sin commit aún

    # configuracion por defecto
    config = configuracionNegocio(negocio_id=negocio.id)
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
        negocios = db.query(Negocio).order_by(Negocio.id.asc()).all()
        _sincronizar_planes_lote(negocios, db)
        return negocios

    negocio_id = int(current_user.get("negocio_id") or 0)
    if not negocio_id:
        return []
    negocios = db.query(Negocio).filter(Negocio.id == negocio_id).all()
    _sincronizar_planes_lote(negocios, db)
    return negocios


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

    _sincronizar_plan_vigente(negocio, db)

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
        negocio.plan_vigente_hasta = _vigencia_hasta_para_plan(plan_actual)
        db.commit()
        db.refresh(negocio)
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


@router.get("/{negocio_id}/planes/catalogo-editable")
def obtener_catalogo_planes_editable(
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

    return {
        "negocio_id": negocio_id,
        "planes": obtener_catalogo_planes_para_negocio(negocio),
    }


@router.put("/{negocio_id}/planes/catalogo-editable")
def actualizar_catalogo_planes_editable(
    negocio_id: int,
    data: PlanCatalogoEditableUpdate,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    is_superadmin = bool(current_user.get("is_superadmin"))
    if not is_superadmin:
        raise HTTPException(status_code=403, detail="Solo superadministrador")

    negocio = db.query(Negocio).filter(Negocio.id == negocio_id).first()
    if not negocio:
        raise HTTPException(status_code=404, detail="Negocio no encontrado")

    custom_map = _leer_plan_catalogo_custom(negocio)

    for item in data.planes:
        codigo = _normalizar_plan(item.codigo)
        usuarios_limite = item.usuarios_limite
        reportes_habilitado = bool(item.reportes_habilitado)
        reportes_limite = item.reportes_limite if reportes_habilitado else 0
        backups_habilitado = bool(item.backups_habilitado)
        backups_limite = item.backups_limite if backups_habilitado else 0
        soporte_habilitado = bool(item.soporte_habilitado)
        reinicio_habilitado = bool(item.reinicio_habilitado)
        productos_limite = item.productos_limite
        sunat_habilitado = bool(item.sunat_habilitado)
        puntos_recuperacion_habilitado = bool(item.puntos_recuperacion_habilitado)

        if codigo == "GRATUITO":
            negocio.plan_gratuito_usuarios_limite = usuarios_limite
            negocio.plan_gratuito_reportes_habilitado = reportes_habilitado
            negocio.plan_gratuito_reportes_limite = reportes_limite
            negocio.plan_gratuito_backups_habilitado = backups_habilitado
            negocio.plan_gratuito_backups_limite = backups_limite
            current = custom_map.get(codigo, {})
            current = current if isinstance(current, dict) else {}
            current.update({
                "soporte_habilitado": soporte_habilitado,
                "reinicio_habilitado": reinicio_habilitado,
                "productos_limite": productos_limite,
                "sunat_habilitado": sunat_habilitado,
                "puntos_recuperacion_habilitado": puntos_recuperacion_habilitado,
            })
            custom_map[codigo] = current
            continue

        current = custom_map.get(codigo, {})
        current = current if isinstance(current, dict) else {}
        current.update({
            "usuarios_limite": usuarios_limite,
            "reportes_habilitado": reportes_habilitado,
            "reportes_limite": reportes_limite,
            "backups_habilitado": backups_habilitado,
            "backups_limite": backups_limite,
            "soporte_habilitado": soporte_habilitado,
            "reinicio_habilitado": reinicio_habilitado,
            "productos_limite": productos_limite,
            "sunat_habilitado": sunat_habilitado,
            "puntos_recuperacion_habilitado": puntos_recuperacion_habilitado,
        })
        custom_map[codigo] = current

    negocio.plan_catalogo_custom = json.dumps(custom_map, ensure_ascii=False)
    db.commit()
    db.refresh(negocio)

    return {
        "ok": True,
        "mensaje": "Capacidades de planes actualizadas",
        "planes": obtener_catalogo_planes_para_negocio(negocio),
    }


@router.get("/{negocio_id}/planes/cuentas-cobro")
def obtener_cuentas_cobro_planes(
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

    return {
        "negocio_id": negocio_id,
        "cuentas": _resolver_cuentas_cobro(negocio),
    }


@router.put("/{negocio_id}/planes/cuentas-cobro")
def actualizar_cuentas_cobro_planes(
    negocio_id: int,
    data: CuentasCobroUpdate,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    is_superadmin = bool(current_user.get("is_superadmin"))
    if not is_superadmin:
        raise HTTPException(status_code=403, detail="Solo superadministrador")

    negocio = db.query(Negocio).filter(Negocio.id == negocio_id).first()
    if not negocio:
        raise HTTPException(status_code=404, detail="Negocio no encontrado")

    payload = data.model_dump()
    cuentas: dict[str, dict[str, object]] = {}
    for canal, base in CUENTAS_COBRO_DEFAULT.items():
        item = payload.get(canal, {})
        item = item if isinstance(item, dict) else {}

        titulo = str(item.get("titulo") or "").strip()
        if len(titulo) < 3:
            raise HTTPException(status_code=400, detail=f"Titulo invalido para canal {canal}")

        detalle = _normalizar_detalle_cuenta(item.get("detalle"), list(base["detalle"]))
        cuentas[canal] = {
            "titulo": titulo,
            "detalle": detalle,
        }

    _guardar_cuentas_cobro(negocio, cuentas)
    db.commit()
    db.refresh(negocio)

    return {
        "ok": True,
        "mensaje": "Cuentas para pago actualizadas",
        "negocio_id": negocio_id,
        "cuentas": _resolver_cuentas_cobro(negocio),
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


@router.get("/{negocio_id}/simulador/escenarios")
def obtener_escenarios_simulador(
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

    return {
        "negocio_id": negocio_id,
        "escenarios": _leer_escenarios_simulador(negocio),
    }


@router.put("/{negocio_id}/simulador/escenarios")
def actualizar_escenarios_simulador(
    negocio_id: int,
    data: SimuladorEscenariosUpdate,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    is_superadmin = bool(current_user.get("is_superadmin"))
    if not is_superadmin:
        raise HTTPException(status_code=403, detail="Solo superadministrador")

    negocio = db.query(Negocio).filter(Negocio.id == negocio_id).first()
    if not negocio:
        raise HTTPException(status_code=404, detail="Negocio no encontrado")

    escenarios = [item.model_dump() for item in data.escenarios][:20]
    negocio.plan_simulador_escenarios = json.dumps(escenarios, ensure_ascii=False)
    db.commit()

    return {
        "ok": True,
        "mensaje": "Escenarios del simulador actualizados",
        "escenarios": escenarios,
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

    plan = _sincronizar_plan_vigente(negocio, db)
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
    productos_consumidos = (
        db.query(Producto)
        .filter(Producto.negocio_id == negocio_id)
        .count()
    )
    soporte_consumidos = (
        db.query(SoporteTicket)
        .filter(SoporteTicket.negocio_id == negocio_id)
        .count()
    )

    usuarios_limite = config["usuarios_limite"]
    reportes_limite = config["reportes_limite"]
    backups_limite = config["backups_limite"]
    productos_limite = config["productos_limite"]
    soporte_limite = None
    sunat_limite = None

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
        "reinicio": {
            "consumidos": 0,
            "limite": None,
            "disponibles": None,
            "habilitado": config["reinicio_habilitado"],
        },
        "backups": {
            "consumidos": backups_consumidos,
            "limite": backups_limite,
            "disponibles": _disponibles(backups_limite, backups_consumidos),
            "habilitado": config["backups_habilitado"],
        },
        "productos": {
            "consumidos": productos_consumidos,
            "limite": productos_limite,
            "disponibles": _disponibles(productos_limite, productos_consumidos),
            "habilitado": True,
        },
        "soporte": {
            "consumidos": int(soporte_consumidos),
            "limite": soporte_limite,
            "disponibles": _disponibles(soporte_limite, int(soporte_consumidos)),
            "habilitado": config["soporte_habilitado"],
        },
        "sunat": {
            "consumidos": 0,
            "limite": sunat_limite,
            "disponibles": _disponibles(sunat_limite, 0),
            "habilitado": config["sunat_habilitado"],
        },
        "puntos_recuperacion": {
            "consumidos": backups_consumidos,
            "limite": backups_limite,
            "disponibles": _disponibles(backups_limite, backups_consumidos),
            "habilitado": config["puntos_recuperacion_habilitado"],
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

    plan_actual = _sincronizar_plan_vigente(negocio, db)
    plan_solicitado = _normalizar_plan(data.plan_objetivo)
    es_renovacion = plan_actual == plan_solicitado

    referencia = str(data.referencia_pago).strip().upper()
    if len(referencia) < 6 or not re.fullmatch(r"[A-Z0-9\-_/]+", referencia):
        raise HTTPException(status_code=400, detail="Referencia de pago invalida. Usa al menos 6 caracteres alfanumericos")

    canal = str(data.canal_pago or "transferencia").strip().lower()
    canales_permitidos = {"transferencia", "yape", "plin", "tarjeta", "efectivo"}
    if canal not in canales_permitidos:
        raise HTTPException(status_code=400, detail="Canal de pago no permitido")

    duracion_dias = _resolver_duracion_dias(plan_solicitado, data.duracion_dias)
    token_idempotencia = _token_idempotencia_pago(
        negocio_id=negocio_id,
        plan_solicitado=plan_solicitado,
        referencia=referencia,
        canal=canal,
        duracion_dias=duracion_dias,
    )

    pago_existente = (
        db.query(PlanPago)
        .filter(
            PlanPago.negocio_id == negocio_id,
            PlanPago.token_idempotencia == token_idempotencia,
            PlanPago.estado.in_(["PENDIENTE_VALIDACION", "APLICADO"]),
        )
        .order_by(PlanPago.id.desc())
        .first()
    )
    if pago_existente:
        mensaje_existente = (
            "Solicitud ya registrada y aplicada previamente."
            if str(pago_existente.estado).upper() == "APLICADO"
            else "Solicitud ya registrada y en revision manual."
        )
        return {
            "ok": True,
            "mensaje": mensaje_existente,
            "plan_actual": plan_actual,
            "plan_solicitado": plan_solicitado,
            "duracion_dias_aplicada": getattr(pago_existente, "duracion_dias", duracion_dias),
            "plan_vigente_desde": getattr(pago_existente, "plan_vigente_desde", None),
            "plan_vigente_hasta": getattr(pago_existente, "plan_vigente_hasta", None),
            "referencia_pago": referencia,
            "estado": pago_existente.estado,
            "validacion_modo_solicitada": "AUTO",
            "validacion_modo_aplicada": "AUTO" if str(pago_existente.estado).upper() == "APLICADO" else "MANUAL",
            "riesgo_score": 0,
            "riesgo_nivel": "BAJO",
        }

    validacion_modo = str(data.validacion_modo or "AUTO").strip().upper()
    if validacion_modo not in {"AUTO", "MANUAL"}:
        raise HTTPException(status_code=400, detail="Modo de validacion no valido")

    if not bool(data.declaracion_anti_fraude):
        raise HTTPException(status_code=400, detail="Debes aceptar la declaracion antifraude para continuar")

    observaciones = str(data.observaciones or "").strip()
    comprobante_url = str(data.comprobante_url or "").strip() or None
    if canal != "efectivo" and not comprobante_url:
        raise HTTPException(status_code=400, detail="Adjunta comprobante para validar el pago")

    riesgo_score = 0
    if canal == "efectivo":
        riesgo_score += 4
    if validacion_modo == "AUTO":
        riesgo_score += 2
    if not comprobante_url:
        riesgo_score += 3
    if len(observaciones) < 8:
        riesgo_score += 1

    referencia_lower = referencia.lower()
    referencia_en_negocio = (
        db.query(PlanPago.id)
        .filter(PlanPago.negocio_id == negocio_id)
        .filter(func.lower(PlanPago.referencia_pago) == referencia_lower)
        .first()
    )
    if referencia_en_negocio:
        riesgo_score += 8

    referencia_en_otro_negocio = (
        db.query(PlanPago.id)
        .filter(PlanPago.negocio_id != negocio_id)
        .filter(func.lower(PlanPago.referencia_pago) == referencia_lower)
        .first()
    )
    if referencia_en_otro_negocio:
        riesgo_score += 6

    riesgo_nivel = "BAJO"
    if riesgo_score >= 9:
        riesgo_nivel = "ALTO"
    elif riesgo_score >= 5:
        riesgo_nivel = "MEDIO"

    validacion_modo_aplicada = validacion_modo
    if validacion_modo == "AUTO" and riesgo_score >= 5:
        validacion_modo_aplicada = "MANUAL"

    estado_pago = "APLICADO" if validacion_modo_aplicada == "AUTO" else "PENDIENTE_VALIDACION"

    descripcion = (
        f"solicitud_plan negocio={negocio_id} actual={plan_actual} "
        f"solicitado={plan_solicitado} tipo={'RENOVACION' if es_renovacion else 'CAMBIO'} "
        f"dias={duracion_dias if duracion_dias is not None else 'SIN_LIMITE'} "
        f"ref={referencia[:40]} canal={canal[:20]} "
        f"validacion={validacion_modo}->{validacion_modo_aplicada} estado={estado_pago} "
        f"riesgo={riesgo_nivel}:{riesgo_score} obs={observaciones[:60]}"
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
        duracion_dias=duracion_dias,
        token_idempotencia=token_idempotencia,
        estado=estado_pago,
    )
    db.add(pago)

    plan_vigente_desde = None
    plan_vigente_hasta = None
    if estado_pago == "APLICADO":
        inicio_vigencia = _fecha_inicio_vigencia(negocio, plan_solicitado)
        plan_vigente_desde, plan_vigente_hasta = _calcular_rango_vigencia(inicio_vigencia, duracion_dias)
        negocio.plan = plan_solicitado
        negocio.plan_vigente_hasta = plan_vigente_hasta
        pago.plan_vigente_desde = plan_vigente_desde
        pago.plan_vigente_hasta = plan_vigente_hasta
    db.commit()
    db.refresh(negocio)

    if estado_pago == "APLICADO":
        registrar_auditoria(
            db=db,
            modulo="Planes",
            accion="Activacion automatica por pago",
            descripcion=(
                f"Negocio {negocio_id}: {plan_actual} -> {plan_solicitado} "
                f"dias={duracion_dias if duracion_dias is not None else 'SIN_LIMITE'} "
                f"ref={referencia[:40]}"
            ),
            usuario=str(current_user.get("usuario_id") or "Sistema"),
        )

    mensaje = (
        "Pago registrado. Tu nuevo plan fue activado automaticamente."
        if estado_pago == "APLICADO"
        else "Pago registrado en revision manual. El plan se activara tras la validacion antifraude."
    )

    if validacion_modo == "AUTO" and validacion_modo_aplicada == "MANUAL":
        mensaje += " Se detecto riesgo y se forzo validacion manual de seguridad."

    return {
        "ok": True,
        "mensaje": mensaje,
        "plan_actual": plan_actual,
        "plan_solicitado": plan_solicitado,
        "duracion_dias_aplicada": duracion_dias,
        "plan_vigente_desde": plan_vigente_desde,
        "plan_vigente_hasta": plan_vigente_hasta,
        "referencia_pago": referencia,
        "estado": estado_pago,
        "validacion_modo_solicitada": validacion_modo,
        "validacion_modo_aplicada": validacion_modo_aplicada,
        "riesgo_score": riesgo_score,
        "riesgo_nivel": riesgo_nivel,
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


@router.patch("/{negocio_id}/planes/historial/{plan_pago_id}/validar")
def validar_pago_plan(
    negocio_id: int,
    plan_pago_id: int,
    data: PlanPagoValidacionUpdate,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    is_superadmin = bool(current_user.get("is_superadmin"))
    if not is_superadmin:
        raise HTTPException(status_code=403, detail="Solo superadministrador")

    pago = (
        db.query(PlanPago)
        .filter(PlanPago.id == plan_pago_id, PlanPago.negocio_id == negocio_id)
        .first()
    )
    if not pago:
        raise HTTPException(status_code=404, detail="Pago no encontrado")

    accion = str(data.accion or "").strip().upper()
    if accion not in {"APROBAR", "RECHAZAR"}:
        raise HTTPException(status_code=400, detail="accion invalida")

    if str(pago.estado or "").upper() != "PENDIENTE_VALIDACION":
        raise HTTPException(status_code=400, detail="El pago ya fue procesado")

    if accion == "APROBAR":
        canal = str(getattr(pago, "canal_pago", "")).lower().strip()
        comprobante = str(getattr(pago, "comprobante_url", "") or "").strip()
        if canal != "efectivo" and not comprobante:
            raise HTTPException(status_code=400, detail="No se puede aprobar sin comprobante adjunto")

    if accion == "APROBAR":
        negocio = db.query(Negocio).filter(Negocio.id == negocio_id).first()
        if not negocio:
            raise HTTPException(status_code=404, detail="Negocio no encontrado")

        plan_anterior = _sincronizar_plan_vigente(negocio, db)
        plan_nuevo = _normalizar_plan(getattr(pago, "plan_solicitado", plan_anterior))
        duracion_dias = _resolver_duracion_dias(plan_nuevo, getattr(pago, "duracion_dias", None))
        inicio_vigencia = _fecha_inicio_vigencia(negocio, plan_nuevo)
        plan_vigente_desde, plan_vigente_hasta = _calcular_rango_vigencia(inicio_vigencia, duracion_dias)
        negocio.plan = plan_nuevo
        negocio.plan_vigente_hasta = plan_vigente_hasta
        pago.duracion_dias = duracion_dias
        pago.plan_vigente_desde = plan_vigente_desde
        pago.plan_vigente_hasta = plan_vigente_hasta
        pago.estado = "APLICADO"

        registrar_auditoria(
            db=db,
            modulo="Planes",
            accion="Validacion manual de pago",
            descripcion=(
                f"Pago {pago.id} aprobado para negocio {negocio_id}: "
                f"{plan_anterior} -> {plan_nuevo} dias={duracion_dias if duracion_dias is not None else 'SIN_LIMITE'} "
                f"ref={str(pago.referencia_pago)[:40]}"
            ),
            usuario=str(current_user.get("usuario_id") or "Sistema"),
        )
        mensaje = "Pago aprobado y plan activado"
    else:
        pago.estado = "RECHAZADO"
        registrar_auditoria(
            db=db,
            modulo="Planes",
            accion="Validacion manual de pago",
            descripcion=(
                f"Pago {pago.id} rechazado para negocio {negocio_id} "
                f"ref={str(pago.referencia_pago)[:40]}"
            ),
            usuario=str(current_user.get("usuario_id") or "Sistema"),
        )
        mensaje = "Pago rechazado"

    db.commit()
    db.refresh(pago)

    return {
        "ok": True,
        "mensaje": mensaje,
        "plan_pago_id": pago.id,
        "estado": pago.estado,
        "plan_solicitado": pago.plan_solicitado,
    }


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
        raise HTTPException(status_code=400, detail="codigo de sucursal ya existe")

    sucursal = Sucursal(negocio_id=negocio_id, **data.model_dump())
    db.add(sucursal)
    db.commit()
    db.refresh(sucursal)

    return sucursal


# =====================================================
# configuracion
# =====================================================
@router.get("/{negocio_id}/configuracion", response_model=configuracionNegocioOut)
def obtener_configuracion(
    negocio_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    is_superadmin = bool(current_user.get("is_superadmin"))
    if not is_superadmin and current_user.get("negocio_id") != negocio_id:
        raise HTTPException(status_code=403, detail="Sin acceso")

    config = db.query(configuracionNegocio).filter(
        configuracionNegocio.negocio_id == negocio_id
    ).first()

    if not config:
        raise HTTPException(status_code=404, detail="configuracion no encontrada")

    return _configuracion_out_payload(config)


# =====================================================
# ACTUALIZAR configuracion
# =====================================================
@router.put("/{negocio_id}/configuracion", response_model=configuracionNegocioOut)
def actualizar_configuracion(
    negocio_id: int,
    data: configuracionNegocioUpdate,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    is_superadmin = bool(current_user.get("is_superadmin"))
    if not is_superadmin and current_user.get("negocio_id") != negocio_id:
        raise HTTPException(status_code=403, detail="Sin acceso")

    config = db.query(configuracionNegocio).filter(
        configuracionNegocio.negocio_id == negocio_id
    ).first()

    if not config:
        raise HTTPException(status_code=404, detail="configuracion no encontrada")

    payload = data.model_dump(exclude_unset=True)
    for key, value in payload.items():
        if key == "sunat_proveedor":
            proveedor = str(value or "NUBEFACT").strip().upper()
            setattr(config, key, "NUBEFACT" if proveedor != "NUBEFACT" else proveedor)
            continue
        if key in {"sunat_api_token", "sunat_clave_sol"}:
            # Si llega vacío, limpiamos; si llega con valor, actualizamos.
            setattr(config, key, (str(value or "").strip() or None))
            continue
        setattr(config, key, value)

    if not str(getattr(config, "sunat_api_url", "") or "").strip():
        config.sunat_api_url = NUBEFACT_DEFAULT_URL

    db.commit()
    db.refresh(config)

    return _configuracion_out_payload(config)


@router.post("/{negocio_id}/configuracion/sunat/test", response_model=SunatConexionTestOut)
def probar_conexion_config_sunat(
    negocio_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    is_superadmin = bool(current_user.get("is_superadmin"))
    if not is_superadmin and current_user.get("negocio_id") != negocio_id:
        raise HTTPException(status_code=403, detail="Sin acceso")

    config = db.query(configuracionNegocio).filter(
        configuracionNegocio.negocio_id == negocio_id
    ).first()

    if not config:
        raise HTTPException(status_code=404, detail="configuracion no encontrada")

    proveedor = str(getattr(config, "sunat_proveedor", "NUBEFACT") or "NUBEFACT").upper()
    if proveedor != "NUBEFACT":
        raise HTTPException(status_code=400, detail="Proveedor SUNAT no soportado")

    endpoint = str(getattr(config, "sunat_api_url", "") or "").strip() or NUBEFACT_DEFAULT_URL
    token = str(getattr(config, "sunat_api_token", "") or "").strip() or None

    try:
        return probar_conexion_sunat(
            endpoint_url=endpoint,
            api_token=token,
        )
    except Exception as exc:
        mapped = homologar_error_nubefact(exc)
        raise HTTPException(
            status_code=502,
            detail={
                "codigo": mapped.get("codigo"),
                "mensaje": mapped.get("mensaje"),
                "detalle": mapped.get("detalle"),
            },
        )
