from datetime import datetime

from sqlalchemy import Boolean, DateTime, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


class ProductRecord(Base):
    __tablename__ = "products"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    subtitle: Mapped[str] = mapped_column(String(180), nullable=False)


class MetricRecord(Base):
    __tablename__ = "metrics"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    metric_group: Mapped[str] = mapped_column(String(32), nullable=False)
    label: Mapped[str] = mapped_column(String(120), nullable=False)
    value: Mapped[str] = mapped_column(String(120), nullable=False)


class CaseStudyRecord(Base):
    __tablename__ = "case_studies"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    media: Mapped[str] = mapped_column(String(240), nullable=False)
    overlay: Mapped[str] = mapped_column(String(40), nullable=False)


class EmailAccountRecord(Base):
    __tablename__ = "email_accounts"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    display_name: Mapped[str] = mapped_column(String(120), nullable=False)
    email: Mapped[str] = mapped_column(String(180), nullable=False, unique=True)
    area: Mapped[str] = mapped_column(String(80), nullable=False)
    is_primary: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)


class ContactMessageRecord(Base):
    __tablename__ = "contact_messages"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    full_name: Mapped[str] = mapped_column(String(140), nullable=False)
    email: Mapped[str] = mapped_column(String(180), nullable=False)
    organization: Mapped[str] = mapped_column(String(140), nullable=False, default="")
    topic: Mapped[str] = mapped_column(String(180), nullable=False, default="")
    area: Mapped[str] = mapped_column(String(80), nullable=False, default="")
    assigned_email: Mapped[str] = mapped_column(String(180), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    source_page: Mapped[str] = mapped_column(String(40), nullable=False, default="contacto")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="new")
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)


class PublicationRecord(Base):
    __tablename__ = "publications"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String(180), nullable=False)
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    category: Mapped[str] = mapped_column(String(80), nullable=False)
    author_name: Mapped[str] = mapped_column(String(120), nullable=False)
    contact_email: Mapped[str] = mapped_column(String(180), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="draft")
    published_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    tags: Mapped[str] = mapped_column(String(240), nullable=False, default="")
