"""Filas mínimas para los tests."""

import uuid
from datetime import UTC, date, datetime
from decimal import Decimal

from sqlalchemy.orm import Session

from app.models import (
    AppUser,
    BodyWeight,
    Exercise,
    ExerciseMuscle,
    Routine,
    SetLog,
    TrainingSession,
)


def now() -> datetime:
    return datetime.now(UTC)


def make_user(db: Session, email: str | None = None) -> AppUser:
    user = AppUser(
        id=uuid.uuid4(), email=email or f"{uuid.uuid4().hex[:8]}@example.com", password_hash="x"
    )
    db.add(user)
    db.flush()
    return user


def make_exercise(
    db: Session, user: AppUser, name: str = "Press de banca", muscles: dict[str, str] | None = None
) -> Exercise:
    exercise = Exercise(id=uuid.uuid4(), user_id=user.id, name=name, updated_at=now())
    exercise.muscles = [
        ExerciseMuscle(muscle_id=muscle, factor=Decimal(factor))
        for muscle, factor in (muscles or {"pectoral": "1.0"}).items()
    ]
    db.add(exercise)
    db.flush()
    return exercise


def make_routine(db: Session, user: AppUser, version: int = 1, status: str = "vigente") -> Routine:
    routine = Routine(
        id=uuid.uuid4(), user_id=user.id, version=version, status=status, source="manual"
    )
    db.add(routine)
    db.flush()
    return routine


def make_session(db: Session, user: AppUser, day: date | None = None) -> TrainingSession:
    session = TrainingSession(
        id=uuid.uuid4(), user_id=user.id, date=day or date.today(), updated_at=now()
    )
    db.add(session)
    db.flush()
    return session


def make_set(
    db: Session,
    session: TrainingSession,
    exercise: Exercise,
    weight: str = "80",
    reps: int = 8,
    rir: int | None = 2,
    number: int = 1,
) -> SetLog:
    set_log = SetLog(
        id=uuid.uuid4(),
        session_id=session.id,
        exercise_id=exercise.id,
        set_number=number,
        weight_kg=Decimal(weight),
        reps=reps,
        rir=rir,
        logged_at=now(),
        updated_at=now(),
    )
    db.add(set_log)
    db.flush()
    return set_log


def make_body_weight(
    db: Session, user: AppUser, day: date, kg: str = "73", deleted: bool = False
) -> BodyWeight:
    weight = BodyWeight(
        id=uuid.uuid4(),
        user_id=user.id,
        date=day,
        kg=Decimal(kg),
        updated_at=now(),
        deleted_at=now() if deleted else None,
    )
    db.add(weight)
    db.flush()
    return weight
