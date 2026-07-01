from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class PlanConfig:
    usuarios_limite: int | None
    reportes_habilitado: bool
    reportes_limite: int | None
    backups_habilitado: bool
    backups_limite: int | None


PLANES: dict[str, PlanConfig] = {
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

PLAN_ORDEN = ["PRUEBA", "BASICO", "LITE", "PRO", "PREMIUM"]

PLAN_LABELS = {
    "PRUEBA": "Prueba",
    "BASICO": "Basico",
    "LITE": "Lite",
    "PRO": "Pro",
    "PREMIUM": "Premium",
}


LEGACY_PLAN_ALIAS = {
    "GRATUITO": "BASICO",
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
