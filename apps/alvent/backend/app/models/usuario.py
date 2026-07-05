from datetime import datetime

from sqlalchemy import String, Integer, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.database.database import Base


class Usuario(Base):
    __tablename__ = "usuarios"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)

    negocio_id: Mapped[int | None] = mapped_column(
        ForeignKey("negocios.id"),
        nullable=True,
        index=True,
    )

    nombres: Mapped[str] = mapped_column(String(150))
    usuario: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    dni: Mapped[str | None] = mapped_column(String(20), nullable=True, index=True)
    email: Mapped[str | None] = mapped_column(
        String(120),
        nullable=True,
        unique=True,
        index=True,
    )

    password: Mapped[str] = mapped_column(String(255))

    email_verificado: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        index=True,
    )

    rol: Mapped[str] = mapped_column(
        String(20),
        default="CAJERO",
    )

    roles: Mapped[str | None] = mapped_column(
        String(120),
        nullable=True,
    )

    activo: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        index=True,
    )

    fecha_creacion: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
    )

    fecha_ultima_conexion: Mapped[datetime | None] = mapped_column(
        DateTime,
        nullable=True,
    )