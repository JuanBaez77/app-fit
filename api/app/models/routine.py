import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    SmallInteger,
    Text,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class Routine(Base):
    """Una versión de la rutina. Cada cambio crea otra; la anterior pasa a 'historica'."""

    __tablename__ = "routine"
    __table_args__ = (
        CheckConstraint("status IN ('vigente','historica')", name="status"),
        CheckConstraint("source IN ('importada','manual','brain')", name="source"),
        Index("one_current", "user_id", unique=True, postgresql_where=text("status = 'vigente'")),
        Index("routine_version", "user_id", "version", unique=True),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("app_user.id"))
    version: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(Text)
    source: Mapped[str | None] = mapped_column(Text)
    parent_routine_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("routine.id"))
    # Si nació de un cambio del brain; la FK a analysis llega con esa tabla (PR-26)
    from_analysis_id: Mapped[uuid.UUID | None]
    start_on: Mapped[date | None] = mapped_column(Date)
    review_on: Mapped[date | None] = mapped_column(Date)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    synced_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    days: Mapped[list["RoutineDay"]] = relationship(
        order_by="RoutineDay.position", cascade="all, delete-orphan", lazy="selectin"
    )
    muscle_targets: Mapped[list["RoutineMuscleTarget"]] = relationship(
        cascade="all, delete-orphan", lazy="selectin"
    )


class RoutineDay(Base):
    __tablename__ = "routine_day"
    __table_args__ = (CheckConstraint("weekday BETWEEN 1 AND 7", name="weekday"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    routine_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("routine.id"))
    name: Mapped[str] = mapped_column(Text)
    # 1 = lunes; NULL si no tiene día fijo
    weekday: Mapped[int | None] = mapped_column(SmallInteger)
    position: Mapped[int] = mapped_column(Integer)
    # El día de la versión anterior del que salió este (linaje entre versiones)
    cloned_from_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("routine_day.id"))

    exercises: Mapped[list["RoutineDayExercise"]] = relationship(
        order_by="RoutineDayExercise.position", cascade="all, delete-orphan", lazy="selectin"
    )


class RoutineDayExercise(Base):
    __tablename__ = "routine_day_exercise"
    __table_args__ = (
        CheckConstraint("target_sets > 0", name="target_sets"),
        CheckConstraint("reps_min > 0 AND reps_max >= reps_min", name="reps"),
        CheckConstraint("rir_min IS NULL OR (rir_min >= 0 AND rir_max >= rir_min)", name="rir"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    routine_day_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("routine_day.id"))
    exercise_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("exercise.id"))
    position: Mapped[int] = mapped_column(Integer)
    target_sets: Mapped[int] = mapped_column(Integer)
    reps_min: Mapped[int] = mapped_column(Integer)
    reps_max: Mapped[int] = mapped_column(Integer)
    rir_min: Mapped[int | None] = mapped_column(Integer)
    rir_max: Mapped[int | None] = mapped_column(Integer)
    # El descanso es un rango (la rutina dice "2-3 min")
    rest_min_sec: Mapped[int | None] = mapped_column(Integer)
    rest_max_sec: Mapped[int | None] = mapped_column(Integer)
    # Series de las primeras semanas: la rutina sube el volumen de a poco
    ramp_sets: Mapped[int | None] = mapped_column(Integer)
    ramp_weeks: Mapped[int | None] = mapped_column(Integer)
    note: Mapped[str | None] = mapped_column(Text)
    cloned_from_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("routine_day_exercise.id"))


class RoutineMuscleTarget(Base):
    """La tabla "Volumen semanal por músculo" de la rutina."""

    __tablename__ = "routine_muscle_target"
    __table_args__ = (
        CheckConstraint("priority IN ('alta','media','mantenimiento')", name="priority"),
    )

    routine_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("routine.id"), primary_key=True)
    muscle_id: Mapped[str] = mapped_column(ForeignKey("muscle.id"), primary_key=True)
    target_sets: Mapped[Decimal] = mapped_column(Numeric(4, 1))
    range_min: Mapped[Decimal | None] = mapped_column(Numeric(4, 1))
    range_max: Mapped[Decimal | None] = mapped_column(Numeric(4, 1))
    priority: Mapped[str | None] = mapped_column(Text)
