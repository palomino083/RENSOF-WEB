from __future__ import annotations

from dataclasses import dataclass
import json


@dataclass(frozen=True)
class PlanConfig:
    usuarios_limite: int | None
    reportes_habilitado: bool
    reportes_limite: int | None
    backups_habilitado: bool
    backups_limite: int | None


PLANES: dict[str, PlanConfig] = {
    "GRATUITO": PlanConfig(
        usuarios_limite=1,
        reportes_habilitado=False,
        reportes_limite=0,
        backups_habilitado=False,
        backups_limite=0,
    ),
    "PRUEBA": PlanConfig(
        usuarios_limite=1,
        reportes_habilitado=True,
        reportes_limite=25,
        backups_habilitado=False,
        backups_limite=0,
    ),
    "BASICO": PlanConfig(
        usuarios_limite=2,
        reportes_habilitado=False,
        reportes_limite=0,
        backups_habilitado=False,
        backups_limite=0,
    ),
    "LITE": PlanConfig(
        usuarios_limite=4,
        reportes_habilitado=True,
        reportes_limite=250,
        backups_habilitado=False,
        backups_limite=0,
    ),
    "PRO": PlanConfig(
        usuarios_limite=10,
        reportes_habilitado=True,
        reportes_limite=2000,
        backups_habilitado=True,
        backups_limite=25,
    ),
    "PREMIUM": PlanConfig(
        usuarios_limite=None,
        reportes_habilitado=True,
        reportes_limite=None,
        backups_habilitado=True,
        backups_limite=None,
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


LEGACY_PLAN_ALIAS = {
    "FREE": "BASICO",
}


def normalizar_plan(plan: str | None, default: str = "BASICO") -> str:
    valor = str(plan or default).upper().strip()
    valor = LEGACY_PLAN_ALIAS.get(valor, valor)
    if valor not in PLANES:
        raise ValueError("Plan no válido")
    return valor


def obtener_plan_config(plan: str | None) -> PlanConfig:
    return PLANES[normalizar_plan(plan)]


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
    codigo = normalizar_plan(plan or getattr(negocio, "plan", "BASICO"))
    base = PLANES[codigo]

    if codigo == "GRATUITO":
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

        return PlanConfig(
            usuarios_limite=usuarios_limite,
            reportes_habilitado=reportes_habilitado,
            reportes_limite=reportes_limite,
            backups_habilitado=backups_habilitado,
            backups_limite=backups_limite,
        )

    custom_map = _parse_catalogo_custom(getattr(negocio, "plan_catalogo_custom", ""))
    override = custom_map.get(codigo, {})

    usuarios_limite = override.get("usuarios_limite", base.usuarios_limite)
    reportes_habilitado = bool(override.get("reportes_habilitado", base.reportes_habilitado))
    reportes_limite = override.get("reportes_limite", base.reportes_limite)
    backups_habilitado = bool(override.get("backups_habilitado", base.backups_habilitado))
    backups_limite = override.get("backups_limite", base.backups_limite)

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
    )


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
            }
        )
    return salida
