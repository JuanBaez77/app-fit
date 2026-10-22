import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Numeric,
    SmallInteger,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class AppUser(Base):
    # "user" es palabra reservada en PostgreSQL
    __tablename__ = "app_user"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(Text, unique=True)
    password_hash: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class RefreshToken(Base):
    # Se guarda el hash, nunca el token. Cada refresh lo rota: el viejo queda revocado.
    __tablename__ = "refresh_token"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("app_user.id"))
    token_hash: Mapped[str] = mapped_column(Text, unique=True)
    __table_args__ = (Index("refresh_token_user", "user_id"),)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class UserProfile(Base):
    """Lo que se manda al brain, sin nombre ni correo. Una fila por usuario."""

    __tablename__ = "user_profile"
    __table_args__ = (
        CheckConstraint("phase IN ('definicion','volumen','mantenimiento')", name="phase"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("app_user.id"), primary_key=True)
    sex: Mapped[str | None] = mapped_column(Text)
    birth_year: Mapped[int | None] = mapped_column(SmallInteger)
    height_cm: Mapped[Decimal | None] = mapped_column(Numeric(4, 1))
    experience_years: Mapped[Decimal | None] = mapped_column(Numeric(3, 1))
    habitual_rir: Mapped[int | None] = mapped_column(SmallInteger)
    goal: Mapped[str | None] = mapped_column(Text)
    # ["pectoral", "deltoides_lateral"]
    priority_muscles: Mapped[list[str] | None] = mapped_column(JSONB)
    phase: Mapped[str | None] = mapped_column(Text)
    phase_start: Mapped[date | None] = mapped_column(Date)
    # Texto libre: la rutina dice "inicios de diciembre de 2026"
    phase_target: Mapped[str | None] = mapped_column(Text)
    equipment: Mapped[str | None] = mapped_column(Text)
    limitations: Mapped[str | None] = mapped_column(Text)
    weight_step_kg: Mapped[Decimal] = mapped_column(Numeric(3, 2), default=Decimal("2.5"))
    # Las molestias son texto libre de salud: viajan a la API solo si se activa
    send_discomfort_to_ai: Mapped[bool] = mapped_column(Boolean, default=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    synced_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
