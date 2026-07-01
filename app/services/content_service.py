from datetime import datetime
from typing import Any

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.db.models import (
    CaseStudyRecord,
    ContactMessageRecord,
    EmailAccountRecord,
    MetricRecord,
    ProductRecord,
    PublicationRecord,
)
from app.models.content import (
    CaseStudy,
    ContactMessage,
    EmailAccount,
    HomeContent,
    Insight,
    Metric,
    Pillar,
    Product,
    Publication,
    Sector,
)


def _hero_metrics(session: Session) -> list[Metric]:
    rows = session.scalars(
        select(MetricRecord).where(MetricRecord.metric_group == "hero").order_by(MetricRecord.id)
    ).all()
    return [Metric(label=row.label, value=row.value) for row in rows]


def _observatory_metrics(session: Session) -> list[Metric]:
    rows = session.scalars(
        select(MetricRecord).where(MetricRecord.metric_group == "observatory").order_by(MetricRecord.id)
    ).all()
    return [Metric(label=row.label, value=row.value) for row in rows]


def _products(session: Session) -> list[Product]:
    rows = session.scalars(select(ProductRecord).order_by(ProductRecord.id)).all()
    return [Product(name=row.name, subtitle=row.subtitle) for row in rows]


def _case_studies(session: Session) -> list[CaseStudy]:
    rows = session.scalars(select(CaseStudyRecord).order_by(CaseStudyRecord.id)).all()
    return [
        CaseStudy(
            title=row.title,
            description=row.description,
            media=row.media,
            overlay=row.overlay,
        )
        for row in rows
    ]


def _publications(session: Session) -> list[Publication]:
    rows = session.scalars(select(PublicationRecord).order_by(PublicationRecord.id.desc())).all()
    return [
        Publication(
            id=row.id,
            title=row.title,
            summary=row.summary,
            category=row.category,
            author_name=row.author_name,
            contact_email=row.contact_email,
            status=row.status,
            published_at=row.published_at,
            tags=_parse_tags(row.tags),
        )
        for row in rows
    ]


def _parse_tags(tags_raw: str) -> list[str]:
    return [item.strip() for item in tags_raw.split(",") if item.strip()]


def _normalize_status(status: str) -> str:
    value = status.strip().lower()
    if value not in {"draft", "published"}:
        return "draft"
    return value


def _parse_published_at(raw_value: str, normalized_status: str) -> datetime | None:
    value = raw_value.strip()
    if value:
        try:
            return datetime.fromisoformat(value)
        except ValueError:
            return None

    if normalized_status == "published":
        return datetime.utcnow()

    return None


def _email_accounts(session: Session) -> list[EmailAccount]:
    rows = session.scalars(select(EmailAccountRecord).order_by(EmailAccountRecord.id)).all()
    return [
        EmailAccount(
            id=row.id,
            display_name=row.display_name,
            email=row.email,
            area=row.area,
            is_primary=row.is_primary,
        )
        for row in rows
    ]


def _contact_messages(rows: list[ContactMessageRecord]) -> list[ContactMessage]:
    return [
        ContactMessage(
            id=row.id,
            full_name=row.full_name,
            email=row.email,
            organization=row.organization,
            topic=row.topic,
            area=row.area,
            assigned_email=row.assigned_email,
            message=row.message,
            source_page=row.source_page,
            status=row.status,
            created_at=row.created_at,
        )
        for row in rows
    ]


def get_home_content(session: Session) -> HomeContent:
    publications = get_publications(session, status="published")
    insights = [Insight(title=publication.title) for publication in publications[:3]]

    return HomeContent(
        slogan="Transformando datos en decisiones estrategicas.",
        mission=(
            "Impulsar organizaciones inteligentes mediante ciencia, tecnologia e innovacion, "
            "transformando informacion en decisiones estrategicas que generen desarrollo sostenible."
        ),
        vision=(
            "Ser la plataforma lider de inteligencia estrategica para Latinoamerica, integrando "
            "inteligencia artificial, analitica avanzada, economia, sostenibilidad y "
            "transformacion digital para resolver desafios complejos."
        ),
        metrics=_hero_metrics(session),
        pillars=[
            Pillar(title="Inteligencia", description="Modelos estrategicos y alertas tempranas."),
            Pillar(title="Analitica", description="Indicadores y escenarios accionables."),
            Pillar(title="IA", description="Prediccion, clasificacion y asistentes RENIA."),
            Pillar(title="GIS", description="Mapas dinamicos y capas territoriales."),
            Pillar(title="Economia", description="Evaluacion de impacto y eficiencia."),
            Pillar(title="Capital Natural", description="Agua, carbono y biodiversidad."),
            Pillar(title="Prospectiva", description="Rutas de futuro y gestion de incertidumbre."),
            Pillar(title="Tecnologia", description="Arquitectura cloud y seguridad empresarial."),
        ],
        products=_products(session),
        sectors=[
            Sector(
                title="Gobierno",
                description="Politicas publicas basadas en evidencia y monitoreo territorial en tiempo real.",
            ),
            Sector(
                title="Empresa",
                description="Rendimiento, riesgo e inversion con analitica de precision.",
            ),
            Sector(
                title="Academia",
                description="Investigacion aplicada con modelos predictivos y observatorios.",
            ),
        ],
        observatory=_observatory_metrics(session),
        insights=insights,
        case_studies=_case_studies(session),
        publications=publications,
    )


def get_admin_content(session: Session) -> dict[str, list[Any]]:
    return {
        "products": session.scalars(select(ProductRecord).order_by(ProductRecord.id)).all(),
        "metrics": session.scalars(select(MetricRecord).order_by(MetricRecord.metric_group, MetricRecord.id)).all(),
        "cases": session.scalars(select(CaseStudyRecord).order_by(CaseStudyRecord.id)).all(),
        "publications": session.scalars(select(PublicationRecord).order_by(PublicationRecord.id.desc())).all(),
        "email_accounts": session.scalars(select(EmailAccountRecord).order_by(EmailAccountRecord.id)).all(),
    }


def get_email_areas(session: Session) -> list[str]:
    rows = session.scalars(select(EmailAccountRecord.area).distinct().order_by(EmailAccountRecord.area)).all()
    return [row for row in rows if row]


def get_primary_email_account(session: Session) -> EmailAccount | None:
    row = session.scalar(select(EmailAccountRecord).where(EmailAccountRecord.is_primary.is_(True)).limit(1))
    if not row:
        fallback = session.scalar(select(EmailAccountRecord).order_by(EmailAccountRecord.id).limit(1))
        if not fallback:
            return None
        return EmailAccount(
            id=fallback.id,
            display_name=fallback.display_name,
            email=fallback.email,
            area=fallback.area,
            is_primary=fallback.is_primary,
        )

    return EmailAccount(
        id=row.id,
        display_name=row.display_name,
        email=row.email,
        area=row.area,
        is_primary=row.is_primary,
    )


def get_email_accounts(
    session: Session,
    query: str = "",
    area: str = "",
    principal_only: bool = False,
) -> list[EmailAccount]:
    statement = select(EmailAccountRecord)

    query_value = query.strip()
    if query_value:
        like_query = f"%{query_value}%"
        statement = statement.where(
            or_(
                EmailAccountRecord.display_name.ilike(like_query),
                EmailAccountRecord.email.ilike(like_query),
                EmailAccountRecord.area.ilike(like_query),
            )
        )

    area_value = area.strip()
    if area_value:
        statement = statement.where(EmailAccountRecord.area == area_value)

    if principal_only:
        statement = statement.where(EmailAccountRecord.is_primary.is_(True))

    rows = session.scalars(statement.order_by(EmailAccountRecord.is_primary.desc(), EmailAccountRecord.id)).all()
    return [
        EmailAccount(
            id=row.id,
            display_name=row.display_name,
            email=row.email,
            area=row.area,
            is_primary=row.is_primary,
        )
        for row in rows
    ]


def add_product(session: Session, name: str, subtitle: str) -> None:
    session.add(ProductRecord(name=name.strip(), subtitle=subtitle.strip()))
    session.commit()


def update_product(session: Session, product_id: int, name: str, subtitle: str) -> None:
    row = session.get(ProductRecord, product_id)
    if not row:
        return
    row.name = name.strip()
    row.subtitle = subtitle.strip()
    session.commit()


def delete_product(session: Session, product_id: int) -> None:
    row = session.get(ProductRecord, product_id)
    if not row:
        return
    session.delete(row)
    session.commit()


def add_metric(session: Session, metric_group: str, label: str, value: str) -> None:
    session.add(
        MetricRecord(
            metric_group=metric_group.strip(),
            label=label.strip(),
            value=value.strip(),
        )
    )
    session.commit()


def update_metric(session: Session, metric_id: int, metric_group: str, label: str, value: str) -> None:
    row = session.get(MetricRecord, metric_id)
    if not row:
        return
    row.metric_group = metric_group.strip()
    row.label = label.strip()
    row.value = value.strip()
    session.commit()


def delete_metric(session: Session, metric_id: int) -> None:
    row = session.get(MetricRecord, metric_id)
    if not row:
        return
    session.delete(row)
    session.commit()


def add_case_study(session: Session, title: str, description: str, media: str, overlay: str) -> None:
    session.add(
        CaseStudyRecord(
            title=title.strip(),
            description=description.strip(),
            media=media.strip(),
            overlay=overlay.strip(),
        )
    )
    session.commit()


def update_case_study(
    session: Session,
    case_id: int,
    title: str,
    description: str,
    media: str,
    overlay: str,
) -> None:
    row = session.get(CaseStudyRecord, case_id)
    if not row:
        return
    row.title = title.strip()
    row.description = description.strip()
    row.media = media.strip()
    row.overlay = overlay.strip()
    session.commit()


def delete_case_study(session: Session, case_id: int) -> None:
    row = session.get(CaseStudyRecord, case_id)
    if not row:
        return
    session.delete(row)
    session.commit()


def add_publication(
    session: Session,
    title: str,
    summary: str,
    category: str,
    author_name: str,
    contact_email: str,
    status: str,
    published_at: str,
    tags: str,
) -> None:
    normalized_status = _normalize_status(status)
    session.add(
        PublicationRecord(
            title=title.strip(),
            summary=summary.strip(),
            category=category.strip(),
            author_name=author_name.strip(),
            contact_email=contact_email.strip(),
            status=normalized_status,
            published_at=_parse_published_at(published_at, normalized_status),
            tags=", ".join(_parse_tags(tags)),
        )
    )
    session.commit()


def update_publication(
    session: Session,
    publication_id: int,
    title: str,
    summary: str,
    category: str,
    author_name: str,
    contact_email: str,
    status: str,
    published_at: str,
    tags: str,
) -> None:
    row = session.get(PublicationRecord, publication_id)
    if not row:
        return
    normalized_status = _normalize_status(status)
    row.title = title.strip()
    row.summary = summary.strip()
    row.category = category.strip()
    row.author_name = author_name.strip()
    row.contact_email = contact_email.strip()
    row.status = normalized_status
    row.published_at = _parse_published_at(published_at, normalized_status)
    row.tags = ", ".join(_parse_tags(tags))
    session.commit()


def delete_publication(session: Session, publication_id: int) -> None:
    row = session.get(PublicationRecord, publication_id)
    if not row:
        return
    session.delete(row)
    session.commit()


def add_email_account(session: Session, display_name: str, email: str, area: str) -> None:
    has_primary = session.scalar(select(EmailAccountRecord.id).where(EmailAccountRecord.is_primary.is_(True)).limit(1))
    session.add(
        EmailAccountRecord(
            display_name=display_name.strip(),
            email=email.strip(),
            area=area.strip(),
            is_primary=not bool(has_primary),
        )
    )
    session.commit()


def update_email_account(session: Session, email_id: int, display_name: str, email: str, area: str) -> None:
    row = session.get(EmailAccountRecord, email_id)
    if not row:
        return
    row.display_name = display_name.strip()
    row.email = email.strip()
    row.area = area.strip()
    session.commit()


def delete_email_account(session: Session, email_id: int) -> None:
    row = session.get(EmailAccountRecord, email_id)
    if not row:
        return
    was_primary = row.is_primary
    session.delete(row)
    session.commit()

    if was_primary:
        replacement = session.scalar(select(EmailAccountRecord).order_by(EmailAccountRecord.id).limit(1))
        if replacement:
            replacement.is_primary = True
            session.commit()


def set_primary_email_account(session: Session, email_id: int) -> None:
    row = session.get(EmailAccountRecord, email_id)
    if not row:
        return

    session.query(EmailAccountRecord).update({EmailAccountRecord.is_primary: False})
    row.is_primary = True
    session.commit()


def add_contact_message(
    session: Session,
    full_name: str,
    email: str,
    organization: str,
    topic: str,
    area: str,
    assigned_email: str,
    message: str,
    source_page: str,
) -> None:
    assigned_value = assigned_email.strip()
    if not assigned_value:
        primary = get_primary_email_account(session)
        assigned_value = primary.email if primary else "contacto@rensof.pe"

    session.add(
        ContactMessageRecord(
            full_name=full_name.strip(),
            email=email.strip(),
            organization=organization.strip(),
            topic=topic.strip(),
            area=area.strip(),
            assigned_email=assigned_value,
            message=message.strip(),
            source_page=source_page.strip() or "contacto",
            status="new",
        )
    )
    session.commit()


def get_contact_inbox(
    session: Session,
    query: str = "",
    area: str = "",
    status: str = "",
) -> list[ContactMessage]:
    statement = select(ContactMessageRecord)

    query_value = query.strip()
    if query_value:
        like_query = f"%{query_value}%"
        statement = statement.where(
            or_(
                ContactMessageRecord.full_name.ilike(like_query),
                ContactMessageRecord.email.ilike(like_query),
                ContactMessageRecord.organization.ilike(like_query),
                ContactMessageRecord.topic.ilike(like_query),
                ContactMessageRecord.assigned_email.ilike(like_query),
                ContactMessageRecord.message.ilike(like_query),
            )
        )

    area_value = area.strip()
    if area_value:
        statement = statement.where(ContactMessageRecord.area == area_value)

    status_value = status.strip()
    if status_value:
        statement = statement.where(ContactMessageRecord.status == status_value)

    rows = session.scalars(statement.order_by(ContactMessageRecord.created_at.desc(), ContactMessageRecord.id.desc())).all()
    return _contact_messages(rows)


def update_contact_message_status(session: Session, message_id: int, status: str) -> None:
    row = session.get(ContactMessageRecord, message_id)
    if not row:
        return

    normalized = status.strip().lower()
    if normalized not in {"new", "read", "archived"}:
        normalized = "new"
    row.status = normalized
    session.commit()


def get_contact_inbox_summary(session: Session) -> dict[str, Any]:
    total = session.scalar(select(func.count(ContactMessageRecord.id))) or 0
    new_count = session.scalar(
        select(func.count(ContactMessageRecord.id)).where(ContactMessageRecord.status == "new")
    ) or 0
    return {
        "total_messages": total,
        "new_messages": new_count,
    }


def get_publications(
    session: Session,
    query: str = "",
    status: str | None = "published",
) -> list[Publication]:
    statement = select(PublicationRecord)

    if status:
        statement = statement.where(PublicationRecord.status == status)

    query_value = query.strip()
    if query_value:
        like_query = f"%{query_value}%"
        statement = statement.where(
            or_(
                PublicationRecord.title.ilike(like_query),
                PublicationRecord.summary.ilike(like_query),
                PublicationRecord.category.ilike(like_query),
                PublicationRecord.author_name.ilike(like_query),
                PublicationRecord.tags.ilike(like_query),
            )
        )

    rows = session.scalars(
        statement.order_by(PublicationRecord.published_at.desc(), PublicationRecord.id.desc())
    ).all()
    return [
        Publication(
            id=row.id,
            title=row.title,
            summary=row.summary,
            category=row.category,
            author_name=row.author_name,
            contact_email=row.contact_email,
            status=row.status,
            published_at=row.published_at,
            tags=_parse_tags(row.tags),
        )
        for row in rows
    ]


