"""Versiones de la rutina: cada cambio clona la vigente, lo aplica y archiva la anterior.

El editor (PR-24) y los cambios aceptados del brain (PR-28) pasan por new_version.
"""

import uuid
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Exercise, Routine, RoutineDay, RoutineDayExercise, RoutineMuscleTarget

_ITEM_FIELDS = (
    "exercise_id",
    "position",
    "target_sets",
    "reps_min",
    "reps_max",
    "rir_min",
    "rir_max",
    "rest_min_sec",
    "rest_max_sec",
    "ramp_sets",
    "ramp_weeks",
    "note",
)


class ChangeError(ValueError):
    """El cambio no se puede aplicar a la versión vigente (se responde 422)."""


class StaleRoutine(Exception):
    """La versión que se editaba ya no es la vigente (se responde 409)."""


@dataclass
class Draft:
    """La versión nueva antes de guardarse, con el linaje para encontrar cada fila."""

    routine: Routine
    # id en la versión base -> su copia
    days: dict[uuid.UUID, RoutineDay]
    exercises: dict[uuid.UUID, RoutineDayExercise]


def _clone(base: Routine, source: str) -> Draft:
    days: dict[uuid.UUID, RoutineDay] = {}
    exercises: dict[uuid.UUID, RoutineDayExercise] = {}
    for day in base.days:
        items = []
        for item in day.exercises:
            copy = RoutineDayExercise(
                id=uuid.uuid4(),
                cloned_from_id=item.id,
                **{field: getattr(item, field) for field in _ITEM_FIELDS},
            )
            exercises[item.id] = copy
            items.append(copy)
        days[day.id] = RoutineDay(
            id=uuid.uuid4(),
            cloned_from_id=day.id,
            name=day.name,
            weekday=day.weekday,
            position=day.position,
            exercises=items,
        )
    routine = Routine(
        id=uuid.uuid4(),
        user_id=base.user_id,
        version=base.version + 1,
        status="vigente",
        source=source,
        parent_routine_id=base.id,
        # Es el mismo programa: la rampa y la revisión siguen contando desde el inicio
        start_on=base.start_on,
        review_on=base.review_on,
        days=list(days.values()),
        muscle_targets=[
            RoutineMuscleTarget(
                muscle_id=t.muscle_id,
                target_sets=t.target_sets,
                fractional_target=t.fractional_target,
                range_min=t.range_min,
                range_max=t.range_max,
                priority=t.priority,
            )
            for t in base.muscle_targets
        ],
    )
    return Draft(routine=routine, days=days, exercises=exercises)


def new_version(db: Session, base: Routine, source: str, apply: Callable[[Draft], None]) -> Routine:
    """Crea la versión siguiente de base en una sola transacción.

    base tiene que venir bloqueada (SELECT ... FOR UPDATE): dos ediciones a la vez no pueden
    dejar dos vigentes. apply recibe la copia y le aplica los cambios; si tira ChangeError,
    no se guarda nada.
    """
    if base.status != "vigente":
        raise StaleRoutine
    draft = _clone(base, source)
    apply(draft)

    now: datetime = db.scalar(select(func.now()))  # type: ignore[assignment]
    # El pull manda las dos: el celular tiene que enterarse de que la anterior ya no es vigente
    base.status = "historica"
    base.updated_at = base.synced_at = now
    # Primero la anterior: el índice único admite una sola vigente por usuario
    db.flush()
    draft.routine.created_at = draft.routine.updated_at = draft.routine.synced_at = now
    db.add(draft.routine)
    db.commit()
    return draft.routine


# Edición manual (US-02) ---------------------------------------------------------------------


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ItemIn(_Strict):
    """Un ejercicio del día. Sin routine_day_exercise_id es uno nuevo."""

    routine_day_exercise_id: uuid.UUID | None = None
    exercise_id: uuid.UUID
    target_sets: int = Field(ge=1, le=20)
    reps_min: int = Field(ge=1, le=100)
    reps_max: int = Field(ge=1, le=100)
    rir_min: int | None = Field(default=None, ge=0, le=5)
    rir_max: int | None = Field(default=None, ge=0, le=5)
    rest_min_sec: int | None = Field(default=None, ge=0, le=900)
    rest_max_sec: int | None = Field(default=None, ge=0, le=900)
    note: str | None = Field(default=None, max_length=500)

    @model_validator(mode="after")
    def _ranges(self) -> "ItemIn":
        if self.reps_max < self.reps_min:
            raise ValueError("El máximo de repeticiones es menor que el mínimo")
        for low, high, name in (
            (self.rir_min, self.rir_max, "RIR"),
            (self.rest_min_sec, self.rest_max_sec, "descanso"),
        ):
            if (low is None) != (high is None):
                raise ValueError(f"El rango de {name} va completo o vacío")
            if low is not None and high is not None and high < low:
                raise ValueError(f"El máximo de {name} es menor que el mínimo")
        return self


class DayEdit(_Strict):
    """La lista final de un día, en orden: lo que falta se quita, lo nuevo se agrega."""

    routine_day_id: uuid.UUID
    exercises: list[ItemIn] = Field(min_length=1, max_length=30)


class NewVersionIn(_Strict):
    days: list[DayEdit] = Field(min_length=1)


def usable_exercises(db: Session, user_id: uuid.UUID) -> set[uuid.UUID]:
    """Los ejercicios que se pueden poner en la rutina: del usuario, no borrados y con al
    menos un músculo directo (US-03: sin músculos no se puede contar el volumen)."""
    exercises = db.scalars(
        select(Exercise).where(Exercise.user_id == user_id, Exercise.deleted_at.is_(None))
    )
    return {e.id for e in exercises if any(m.factor == 1 for m in e.muscles)}


def apply_day_edits(edits: list[DayEdit], usable: set[uuid.UUID]) -> Callable[[Draft], None]:
    def apply(draft: Draft) -> None:
        if len({e.routine_day_id for e in edits}) != len(edits):
            raise ChangeError("Un día viene dos veces")
        for edit in edits:
            day = draft.days.get(edit.routine_day_id)
            if day is None:
                raise ChangeError("El día no es de la versión vigente")
            own = {item.cloned_from_id for item in day.exercises}
            seen: set[uuid.UUID] = set()
            items = []
            for position, row in enumerate(edit.exercises, start=1):
                if row.exercise_id not in usable:
                    raise ChangeError(
                        "Un ejercicio no existe o no tiene músculos: elegí sus músculos antes"
                    )
                if row.routine_day_exercise_id is None:
                    item = RoutineDayExercise(id=uuid.uuid4())
                else:
                    if row.routine_day_exercise_id not in own:
                        raise ChangeError(f"Un ejercicio no es del día {day.name}")
                    if row.routine_day_exercise_id in seen:
                        raise ChangeError(f"Un ejercicio aparece dos veces en {day.name}")
                    seen.add(row.routine_day_exercise_id)
                    item = draft.exercises[row.routine_day_exercise_id]
                values = row.model_dump(exclude={"routine_day_exercise_id"})
                for field, value in values.items():
                    setattr(item, field, value)
                item.position = position
                items.append(item)
            day.exercises = items

    return apply
