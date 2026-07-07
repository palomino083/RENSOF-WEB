from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
import json


@dataclass(frozen=True)
class PlanConfig:
    usuarios_limite: int | None
    reportes_habilitado: bool
    reportes_limite: int | None
    backups_habilitado: bool
    backups_limite: int | None
    soporte_habilitado: bool
    reinicio_habilitado: bool
    productos_limite: int | None
    sunat_habilitado: bool
    puntos_recuperacion_habilitado: bool


PLANES: dict[str, PlanConfig] = {
    "GRATUITO": PlanConfig(
        usuarios_limite=1,
        reportes_habilitado=False,
        reportes_limite=0,
        backups_habilitado=False,
        backups_limite=0,
        soporte_habilitado=True,
        reinicio_habilitado=True,
        productos_limite=100,
        sunat_habilitado=False,
        puntos_recuperacion_habilitado=False,
    ),
    "PRUEBA": PlanConfig(
        usuarios_limite=1,
        reportes_habilitado=True,
        reportes_limite=25,
        backups_habilitado=False,
        backups_limite=0,
        soporte_habilitado=True,
        reinicio_habilitado=True,
        productos_limite=300,
        sunat_habilitado=False,
        puntos_recuperacion_habilitado=False,
    ),
    "BASICO": PlanConfig(
        usuarios_limite=2,
        reportes_habilitado=False,
        reportes_limite=0,
        backups_habilitado=False,
        backups_limite=0,
        soporte_habilitado=True,
        reinicio_habilitado=True,
        productos_limite=500,
        sunat_habilitado=False,
        puntos_recuperacion_habilitado=True,
    ),
    "LITE": PlanConfig(
        usuarios_limite=4,
        reportes_habilitado=True,
        reportes_limite=250,
        backups_habilitado=False,
        backups_limite=0,
        soporte_habilitado=True,
        reinicio_habilitado=True,
        productos_limite=1500,
        sunat_habilitado=True,
        puntos_recuperacion_habilitado=True,
    ),
    "PRO": PlanConfig(
        usuarios_limite=10,
        reportes_habilitado=True,
        reportes_limite=2000,
        backups_habilitado=True,
        backups_limite=25,
        soporte_habilitado=True,
        reinicio_habilitado=True,
        productos_limite=5000,
        sunat_habilitado=True,
        puntos_recuperacion_habilitado=True,
    ),
    "PREMIUM": PlanConfig(
        usuarios_limite=None,
        reportes_habilitado=True,
        reportes_limite=None,
        backups_habilitado=True,
        backups_limite=None,
        soporte_habilitado=True,
        reinicio_habilitado=True,
        productos_limite=None,
        sunat_habilitado=True,
        puntos_recuperacion_habilitado=True,
    ),
}

PLAN_ORDEN = ["GRATUITO", "PRUEBA", "BASICO", "LITE", "PRO", "PREMIUM"]

PLAN_LABELS = {
    "GRATUITO": "Gratuito",
    "PRUEBA": "Prueba",
    "BASICO": "Basico",
    "LITE": "Lite",
    "PRO": "Pro",
    "PREMIUM": "Premium",
}

PLAN_VIGENCIA_DIAS = {
    "GRATUITO": None,
    "PRUEBA": 7,
    "BASICO": 30,
    "LITE": 30,
    "PRO": 30,
    "PREMIUM": 30,
}


LEGACY_PLAN_ALIAS = {
    "FREE": "GRATUITO",
}


def normalizar_plan(plan: str | None, default: str = "GRATUITO") -> str:
    valor = str(plan or default).upper().strip()
    valor = LEGACY_PLAN_ALIAS.get(valor, valor)
    if valor not in PLANES:
        raise ValueError("Plan no válido")
    return valor


def obtener_plan_config(plan: str | None) -> PlanConfig:
    return PLANES[normalizar_plan(plan)]


def obtener_dias_vigencia_plan(plan: str | None) -> int | None:
    codigo = normalizar_plan(plan)
    return PLAN_VIGENCIA_DIAS.get(codigo)


def plan_habilita_reportes(plan: str | None) -> bool:
    return obtener_plan_config(plan).reportes_habilitado


def plan_habilita_backups(plan: str | None) -> bool:
    return obtener_plan_config(plan).backups_habilitado


def obtener_catalogo_planes() -> list[dict]:
    catalogo: list[dict] = []
    for key in PLAN_ORDEN:
        cfg = PLANES[key]
        catalogo.append(
            {
                "codigo": key,
                "nombre": PLAN_LABELS.get(key, key),
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
        )
    return catalogo


def _parse_catalogo_custom(raw_value: str | None) -> dict[str, dict]:
    raw = str(raw_value or "").strip()
    if not raw:
        return {}
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return {}
    if not isinstance(parsed, dict):
        return {}

    output: dict[str, dict] = {}
    for key, value in parsed.items():
        codigo = str(key or "").upper().strip()
        if codigo not in PLANES or not isinstance(value, dict):
            continue
        output[codigo] = value
    return output


def resolver_config_plan_negocio(negocio: object | None, plan: str | None = None) -> PlanConfig:
    if plan is None:
        codigo, _ = resolver_plan_vigente(negocio)
    else:
        codigo = normalizar_plan(plan)
    base = PLANES[codigo]

    if codigo == "GRATUITO":
        custom_map = _parse_catalogo_custom(getattr(negocio, "plan_catalogo_custom", ""))
        override = custom_map.get(codigo, {})

        usuarios_limite = (
            getattr(negocio, "plan_gratuito_usuarios_limite", None)
            if getattr(negocio, "plan_gratuito_usuarios_limite", None) is not None
            else base.usuarios_limite
        )

        reportes_habilitado = bool(
            getattr(negocio, "plan_gratuito_reportes_habilitado", False) or base.reportes_habilitado
        )
        reportes_limite = (
            getattr(negocio, "plan_gratuito_reportes_limite", None)
            if reportes_habilitado
            else 0
        )
        if reportes_habilitado and reportes_limite is None:
            reportes_limite = base.reportes_limite

        backups_habilitado = bool(
            getattr(negocio, "plan_gratuito_backups_habilitado", False) or base.backups_habilitado
        )
        backups_limite = (
            getattr(negocio, "plan_gratuito_backups_limite", None)
            if backups_habilitado
            else 0
        )
        if backups_habilitado and backups_limite is None:
            backups_limite = base.backups_limite

        soporte_habilitado = bool(override.get("soporte_habilitado", base.soporte_habilitado))
        reinicio_habilitado = bool(override.get("reinicio_habilitado", base.reinicio_habilitado))
        productos_limite = override.get("productos_limite", base.productos_limite)
        sunat_habilitado = bool(override.get("sunat_habilitado", base.sunat_habilitado))
        puntos_recuperacion_habilitado = bool(
            override.get("puntos_recuperacion_habilitado", base.puntos_recuperacion_habilitado)
        )

        return PlanConfig(
            usuarios_limite=usuarios_limite,
            reportes_habilitado=reportes_habilitado,
            reportes_limite=reportes_limite,
            backups_habilitado=backups_habilitado,
            backups_limite=backups_limite,
            soporte_habilitado=soporte_habilitado,
            reinicio_habilitado=reinicio_habilitado,
            productos_limite=productos_limite,
            sunat_habilitado=sunat_habilitado,
            puntos_recuperacion_habilitado=puntos_recuperacion_habilitado,
        )

    custom_map = _parse_catalogo_custom(getattr(negocio, "plan_catalogo_custom", ""))
    override = custom_map.get(codigo, {})

    usuarios_limite = override.get("usuarios_limite", base.usuarios_limite)
    reportes_habilitado = bool(override.get("reportes_habilitado", base.reportes_habilitado))
    reportes_limite = override.get("reportes_limite", base.reportes_limite)
    backups_habilitado = bool(override.get("backups_habilitado", base.backups_habilitado))
    backups_limite = override.get("backups_limite", base.backups_limite)
    soporte_habilitado = bool(override.get("soporte_habilitado", base.soporte_habilitado))
    reinicio_habilitado = bool(override.get("reinicio_habilitado", base.reinicio_habilitado))
    productos_limite = override.get("productos_limite", base.productos_limite)
    sunat_habilitado = bool(override.get("sunat_habilitado", base.sunat_habilitado))
    puntos_recuperacion_habilitado = bool(
        override.get("puntos_recuperacion_habilitado", base.puntos_recuperacion_habilitado)
    )

    if not reportes_habilitado:
        reportes_limite = 0
    if not backups_habilitado:
        backups_limite = 0

    return PlanConfig(
        usuarios_limite=usuarios_limite,
        reportes_habilitado=reportes_habilitado,
        reportes_limite=reportes_limite,
        backups_habilitado=backups_habilitado,
        backups_limite=backups_limite,
        soporte_habilitado=soporte_habilitado,
        reinicio_habilitado=reinicio_habilitado,
        productos_limite=productos_limite,
        sunat_habilitado=sunat_habilitado,
        puntos_recuperacion_habilitado=puntos_recuperacion_habilitado,
    )


def resolver_plan_vigente(negocio: object | None) -> tuple[str, bool]:
    """
    Retorna (plan_vigente, vencio).
    - Si el plan es GRATUITO, nunca se considera vencido.
    - Si hay plan de pago y su vigencia terminó, cae automáticamente a GRATUITO.
    """
    plan_actual = normalizar_plan(getattr(negocio, "plan", "GRATUITO"))
    if plan_actual == "GRATUITO":
        return "GRATUITO", False

    vigente_hasta = getattr(negocio, "plan_vigente_hasta", None)
    if not vigente_hasta:
        return plan_actual, False

    if isinstance(vigente_hasta, datetime) and vigente_hasta <= datetime.utcnow():
        return "GRATUITO", True

    return plan_actual, False


def obtener_catalogo_planes_para_negocio(negocio: object | None) -> list[dict]:
    catalogo = obtener_catalogo_planes()
    salida: list[dict] = []
    for item in catalogo:
        codigo = item["codigo"]
        cfg = resolver_config_plan_negocio(negocio, codigo)
        salida.append(
            {
                "codigo": codigo,
                "nombre": item["nombre"],
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
        )
    return salida
