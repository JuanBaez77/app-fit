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
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class TrainingSession(Base):
    # La tabla se llama session como en el diseño; la clase no, para no confundirla con la de
    # SQLAlchemy.
    __tablename__ = "session"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("app_user.id"))
    routine_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("routine.id"))
    routine_day_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("routine_day.id"))
    date: Mapped[date] = mapped_column(Date)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    sleep_hours: Mapped[Decimal | None] = mapped_column(Numeric(3, 1))
    discomfort: Mapped[str | None] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    synced_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class SetLog(Base):
    __tablename__ = "set_log"
    __table_args__ = (
        CheckConstraint("weight_kg >= 0", name="weight_kg"),
        CheckConstraint("reps > 0", name="reps"),
        CheckConstraint("rir BETWEEN 0 AND 5", name="rir"),
        Index(
            "set_by_exercise",
            "exercise_id",
            "logged_at",
            postgresql_where=text("deleted_at IS NULL"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    session_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("session.id"))
    exercise_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("exercise.id"))
    # NULL = serie fuera de rutina
    routine_day_exercise_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("routine_day_exercise.id")
    )
    set_number: Mapped[int] = mapped_column(Integer)
    # En dominadas, el peso agregado
    weight_kg: Mapped[Decimal] = mapped_column(Numeric(6, 2))
    reps: Mapped[int] = mapped_column(SmallInteger)
    # NULL si no se anotó
    rir: Mapped[int | None] = mapped_column(SmallInteger)
    # Primer toque -> confirmar; mide la meta de 5 s
    interaction_ms: Mapped[int | None] = mapped_column(Integer)
    logged_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    synced_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class BodyWeight(Base):
    __tablename__ = "body_weight"
    __table_args__ = (
        CheckConstraint("kg > 0", name="kg"),
        Index(
            "one_weight_per_day",
            "user_id",
            "date",
            unique=True,
            postgresql_where=text("deleted_at IS NULL"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("app_user.id"))
    date: Mapped[date] = mapped_column(Date)
    kg: Mapped[Decimal] = mapped_column(Numeric(5, 2))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    synced_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
