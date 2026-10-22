import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Numeric, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class Muscle(Base):
    __tablename__ = "muscle"

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    name: Mapped[str] = mapped_column(Text)
    # recto_femoral -> cuadriceps; las regiones se reportan aparte
    parent_id: Mapped[str | None] = mapped_column(Text, ForeignKey("muscle.id"))


class Exercise(Base):
    __tablename__ = "exercise"
    __table_args__ = (CheckConstraint("kind IN ('multiarticular','aislamiento')", name="kind"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("app_user.id"))
    name: Mapped[str] = mapped_column(Text)
    # Página de wiki/ejercicios del brain, si existe (ej. 'press-de-banca')
    brain_page: Mapped[str | None] = mapped_column(Text)
    kind: Mapped[str | None] = mapped_column(Text)
    # FALSE en dominadas y otros con peso corporal: no se estima 1RM
    e1rm_eligible: Mapped[bool] = mapped_column(Boolean, default=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    synced_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    muscles: Mapped[list["ExerciseMuscle"]] = relationship(
        cascade="all, delete-orphan", lazy="selectin"
    )


class ExerciseMuscle(Base):
    """Ausencia de fila = el ejercicio no cuenta para ese músculo."""

    __tablename__ = "exercise_muscle"
    __table_args__ = (CheckConstraint("factor IN (0.5, 1.0)", name="factor"),)

    exercise_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("exercise.id"), primary_key=True)
    muscle_id: Mapped[str] = mapped_column(ForeignKey("muscle.id"), primary_key=True)
    # 1 directa, 0,5 indirecta
    factor: Mapped[Decimal] = mapped_column(Numeric(2, 1))
