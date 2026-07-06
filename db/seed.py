from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from db.models import (
    CaseStudyRecord,
    EmailAccountRecord,
    MetricRecord,
    ProductRecord,
    PublicationRecord,
)


def seed_database(session: Session) -> None:
    has_products = session.scalar(select(ProductRecord.id).limit(1))
    has_metrics = session.scalar(select(MetricRecord.id).limit(1))
    has_cases = session.scalar(select(CaseStudyRecord.id).limit(1))
    has_emails = session.scalar(select(EmailAccountRecord.id).limit(1))
    has_publications = session.scalar(select(PublicationRecord.id).limit(1))

    if not has_products:
        session.add_all(
            [
                ProductRecord(name="RENIA", subtitle="Artificial Intelligence"),
                ProductRecord(name="RENFIN", subtitle="Financial Intelligence"),
                ProductRecord(name="RENPROJECT", subtitle="Project Intelligence"),
                ProductRecord(name="RENPLAN", subtitle="Future Intelligence"),
                ProductRecord(name="RENNATURE", subtitle="Natural Capital Intelligence"),
                ProductRecord(name="RENMAP", subtitle="Spatial Intelligence"),
                ProductRecord(name="ALVENT", subtitle="Digital Business Platform"),
                ProductRecord(name="RENSCIENCE", subtitle="Scientific Intelligence"),
            ]
        )

    if not has_metrics:
        session.add_all(
            [
                MetricRecord(metric_group="hero", label="Precision IA", value="94.8%"),
                MetricRecord(metric_group="hero", label="Alertas activas", value="1,264"),
                MetricRecord(metric_group="hero", label="Cobertura territorial", value="23 regiones"),
                MetricRecord(metric_group="observatory", label="Indice estrategico", value="+18.4%"),
                MetricRecord(metric_group="observatory", label="Riesgo territorial", value="-11.2%"),
                MetricRecord(metric_group="observatory", label="Valor generado", value="S/ 54M"),
                MetricRecord(metric_group="observatory", label="Proyectos activos", value="126"),
            ]
        )

    if not has_cases:
        session.add_all(
            [
                CaseStudyRecord(
                    title="Inteligencia financiera",
                    description="Mejora de rentabilidad en portafolios con analitica predictiva.",
                    media="/assets/img/figure-finance.svg",
                    overlay="rgba(57,202,127,0.30)",
                ),
                CaseStudyRecord(
                    title="Agro inteligente",
                    description="Optimizacion de rendimiento por lote con sensores, drones e IA.",
                    media="/assets/img/figure-agro5.svg",
                    overlay="rgba(0,182,200,0.32)",
                ),
                CaseStudyRecord(
                    title="Capital natural",
                    description="Valoracion ecosistemica para decisiones de inversion sostenible.",
                    media="/assets/img/figure-ecosystem.svg",
                    overlay="rgba(240,179,74,0.25)",
                ),
            ]
        )

    if not has_emails:
        session.add_all(
            [
                EmailAccountRecord(
                    display_name="Equipo Editorial",
                    email="editorial@rensof.pe",
                    area="Publicaciones",
                    is_primary=True,
                ),
                EmailAccountRecord(
                    display_name="Relacion Institucional",
                    email="alianzas@rensof.pe",
                    area="Alianzas",
                    is_primary=False,
                ),
                EmailAccountRecord(
                    display_name="Soporte Plataforma",
                    email="soporte@rensof.pe",
                    area="Soporte",
                    is_primary=False,
                ),
            ]
        )

    if not has_publications:
        session.add_all(
            [
                PublicationRecord(
                    title="Prospectiva para cadenas productivas 2030",
                    summary="Marco de escenarios para decisiones de competitividad regional.",
                    category="Prospectiva",
                    author_name="RENSOF Lab",
                    contact_email="editorial@rensof.pe",
                    status="published",
                    published_at=datetime.utcnow(),
                    tags="prospectiva, competitividad, cadenas productivas",
                ),
                PublicationRecord(
                    title="IA aplicada a desarrollo agricola territorial",
                    summary="Integracion de sensores, satelites y analitica para productividad.",
                    category="IA + Agro",
                    author_name="Unidad de Innovacion",
                    contact_email="editorial@rensof.pe",
                    status="published",
                    published_at=datetime.utcnow(),
                    tags="ia, agro, sensores, satelites",
                ),
                PublicationRecord(
                    title="Capital natural y competitividad regional",
                    summary="Valoracion ecosistemica para proyectos de inversion sostenible.",
                    category="Sostenibilidad",
                    author_name="Equipo de Economia Ambiental",
                    contact_email="alianzas@rensof.pe",
                    status="published",
                    published_at=datetime.utcnow(),
                    tags="capital natural, sostenibilidad, inversion",
                ),
            ]
        )

    session.commit()
