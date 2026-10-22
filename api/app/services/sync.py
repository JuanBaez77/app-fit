"""Sincronización offline-first (US-10).

push: el cliente manda filas completas y se escriben por id, así que repetir un envío no
duplica nada. Gana la fila con el updated_at más nuevo. Cada escritura marca synced_at con la
hora del servidor.

pull: devuelve lo que cambió (synced_at) desde el cursor. El cursor es la hora del servidor
menos un margen, para no perder filas de transacciones que confirmaron un poco más tarde.
Repetir filas no hace daño: el cliente también escribe por id.
"""

import uuid
from collections.abc import Callable
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import (
    AppUser,
    BodyWeight,
    Exercise,
    ExerciseMuscle,
    Muscle,
    Routine,
    RoutineDay,
    RoutineDayExercise,
    SetLog,
    TrainingSession,
    UserProfile,
)
from app.schemas import RoutineOut
from app.schemas_sync import (
    BodyWeightRow,
    ExerciseRow,
    MuscleOut,
    ProfileOut,
    PullOut,
    PushIn,
    PushOut,
    Rejected,
    SessionRow,
    SetLogRow,
)

PULL_OVERLAP = timedelta(seconds=30)


def _decimal(value: float | None) -> Decimal | None:
    return None if value is None else Decimal(str(value))


class _Push:
    def __init__(self, db: Session, user: AppUser) -> None:
        self.db = db
        self.user = user
        self.now: datetime = db.scalar(select(func.now()))  # type: ignore[assignment]
        self.result = PushOut(applied=0, skipped=0, rejected=[])
        self.muscles = set(db.scalars(select(Muscle.id)))

    def reject(self, table: str, row_id: uuid.UUID, reason: str) -> None:
        self.result.rejected.append(Rejected(table=table, id=row_id, reason=reason))

    def upsert(
        self,
        model: type[Any],
        table: str,
        row_id: uuid.UUID,
        owned: Callable[[Any], bool],
        values: dict[str, Any],
    ) -> Any | None:
        """Inserta o actualiza por id. Devuelve la fila escrita, o None si no se escribió."""
        existing = self.db.get(model, row_id)
        if existing is None:
            row = model(id=row_id, synced_at=self.now, **values)
            self.db.add(row)
            self.result.applied += 1
            return row
        if not owned(existing):
            self.reject(table, row_id, "La fila es de otro usuario")
            return None
        if existing.updated_at >= values["updated_at"]:
            self.result.skipped += 1
            return None
        for key, value in values.items():
            setattr(existing, key, value)
        existing.synced_at = self.now
        self.result.applied += 1
        return existing

    def owns_session(self, session_id: uuid.UUID) -> bool:
        session = self.db.get(TrainingSession, session_id)
        return session is not None and session.user_id == self.user.id

    def owns_exercise(self, exercise_id: uuid.UUID) -> bool:
        exercise = self.db.get(Exercise, exercise_id)
        return exercise is not None and exercise.user_id == self.user.id

    def owns_routine(self, routine_id: uuid.UUID | None) -> bool:
        if routine_id is None:
            return True
        routine = self.db.get(Routine, routine_id)
        return routine is not None and routine.user_id == self.user.id

    def owns_routine_day(self, day_id: uuid.UUID | None) -> bool:
        if day_id is None:
            return True
        day = self.db.get(RoutineDay, day_id)
        return day is not None and self.owns_routine(day.routine_id)

    def owns_routine_day_exercise(self, item_id: uuid.UUID | None) -> bool:
        if item_id is None:
            return True
        item = self.db.get(RoutineDayExercise, item_id)
        return item is not None and self.owns_routine_day(item.routine_day_id)

    def exercise(self, row: ExerciseRow) -> None:
        unknown = {m.muscle_id for m in row.muscles} - self.muscles
        if unknown:
            self.reject("exercises", row.id, f"Músculos desconocidos: {', '.join(sorted(unknown))}")
            return
        written = self.upsert(
            Exercise,
            "exercises",
            row.id,
            lambda e: e.user_id == self.user.id,
            {
                "user_id": self.user.id,
                "name": row.name,
                "brain_page": row.brain_page,
                "kind": row.kind,
                "e1rm_eligible": row.e1rm_eligible,
                "updated_at": row.updated_at,
                "deleted_at": row.deleted_at,
            },
        )
        if written is not None:
            written.muscles = [
                ExerciseMuscle(muscle_id=m.muscle_id, factor=_decimal(m.factor))
                for m in row.muscles
            ]

    def session(self, row: SessionRow) -> None:
        if not (self.owns_routine(row.routine_id) and self.owns_routine_day(row.routine_day_id)):
            self.reject("sessions", row.id, "La rutina o el día no son del usuario")
            return
        self.upsert(
            TrainingSession,
            "sessions",
            row.id,
            lambda s: s.user_id == self.user.id,
            {
                "user_id": self.user.id,
                "routine_id": row.routine_id,
                "routine_day_id": row.routine_day_id,
                "date": row.date,
                "started_at": row.started_at,
                "ended_at": row.ended_at,
                "sleep_hours": _decimal(row.sleep_hours),
                "discomfort": row.discomfort,
                "updated_at": row.updated_at,
                "deleted_at": row.deleted_at,
            },
        )

    def set_log(self, row: SetLogRow) -> None:
        if not self.owns_session(row.session_id):
            self.reject("set_logs", row.id, "La sesión no existe o es de otro usuario")
            return
        if not self.owns_exercise(row.exercise_id):
            self.reject("set_logs", row.id, "El ejercicio no existe o es de otro usuario")
            return
        if not self.owns_routine_day_exercise(row.routine_day_exercise_id):
            self.reject("set_logs", row.id, "El ejercicio de la rutina no es del usuario")
            return
        self.upsert(
            SetLog,
            "set_logs",
            row.id,
            lambda s: self.owns_session(s.session_id),
            {
                "session_id": row.session_id,
                "exercise_id": row.exercise_id,
                "routine_day_exercise_id": row.routine_day_exercise_id,
                "set_number": row.set_number,
                "weight_kg": _decimal(row.weight_kg),
                "reps": row.reps,
                "rir": row.rir,
                "interaction_ms": row.interaction_ms,
                "logged_at": row.logged_at,
                "updated_at": row.updated_at,
                "deleted_at": row.deleted_at,
            },
        )

    def body_weight(self, row: BodyWeightRow) -> None:
        deleted_at = row.deleted_at
        if deleted_at is None:
            # Un peso por día: si otro dispositivo cargó otro, gana el más nuevo
            others = self.db.scalars(
                select(BodyWeight).where(
                    BodyWeight.user_id == self.user.id,
                    BodyWeight.date == row.date,
                    BodyWeight.deleted_at.is_(None),
                    BodyWeight.id != row.id,
                )
            ).all()
            if any(other.updated_at > row.updated_at for other in others):
                deleted_at = self.now
            else:
                for other in others:
                    other.deleted_at = other.updated_at = other.synced_at = self.now
                self.db.flush()
        self.upsert(
            BodyWeight,
            "body_weights",
            row.id,
            lambda w: w.user_id == self.user.id,
            {
                "user_id": self.user.id,
                "date": row.date,
                "kg": _decimal(row.kg),
                "updated_at": row.updated_at,
                "deleted_at": deleted_at,
            },
        )
        self.db.flush()


def push(db: Session, user: AppUser, data: PushIn) -> PushOut:
    state = _Push(db, user)
    # Primero lo que las series referencian
    for exercise in data.exercises:
        state.exercise(exercise)
    db.flush()
    for session in data.sessions:
        state.session(session)
    db.flush()
    for set_log in data.set_logs:
        state.set_log(set_log)
    for weight in data.body_weights:
        state.body_weight(weight)
    db.commit()
    return state.result


def pull(db: Session, user: AppUser, since: datetime | None) -> PullOut:
    now: datetime = db.scalar(select(func.now()))  # type: ignore[assignment]

    def changed(model: type[Any], *where: Any) -> list[Any]:
        query = select(model).where(*where)
        if since is not None:
            query = query.where(model.synced_at > since)
        return list(db.scalars(query))

    profile = db.get(UserProfile, user.id)
    if profile is not None and since is not None and profile.synced_at <= since:
        profile = None

    return PullOut(
        cursor=now - PULL_OVERLAP,
        sessions=[
            SessionRow.model_validate(s)
            for s in changed(TrainingSession, TrainingSession.user_id == user.id)
        ],
        set_logs=[
            SetLogRow.model_validate(s)
            for s in changed(
                SetLog,
                SetLog.session_id.in_(
                    select(TrainingSession.id).where(TrainingSession.user_id == user.id)
                ),
            )
        ],
        body_weights=[
            BodyWeightRow.model_validate(w)
            for w in changed(BodyWeight, BodyWeight.user_id == user.id)
        ],
        exercises=[
            ExerciseRow.model_validate(e) for e in changed(Exercise, Exercise.user_id == user.id)
        ],
        routines=[
            RoutineOut.model_validate(r) for r in changed(Routine, Routine.user_id == user.id)
        ],
        profile=ProfileOut.model_validate(profile) if profile else None,
        muscles=[MuscleOut.model_validate(m) for m in db.scalars(select(Muscle))],
    )
