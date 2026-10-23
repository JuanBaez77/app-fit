"""Aceptar o rechazar un cambio del brain (US-18).

El cambio apunta a filas de la versión que se analizó. Si después nacieron otras (otro cambio
aceptado, una edición a mano), el target se busca en la vigente siguiendo cloned_from_id, y
el valor from se compara con el actual: si no coincide, el cambio quedó desfasado y pasa a
obsoleto. Nada se modifica en la rutina hasta que se acepta.
"""

import uuid
from collections.abc import Iterable
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    AnalysisChange,
    AppUser,
    Exercise,
    ExerciseMuscle,
    Routine,
    RoutineDay,
    RoutineDayExercise,
    RoutineMuscleTarget,
)
from app.services.versions import ChangeError, Draft, new_version, usable_exercises

# Para los rangos ("8 a 12" con raya corta). Con chr: el formateador vuelve el escape literal
EN_DASH = chr(0x2013)


class Obsolete(Exception):
    """El cambio ya no aplica a la versión vigente: el mensaje dice por qué."""


def _text(value: Any) -> str:
    if value is None:
        return "sin definir"
    if isinstance(value, list):
        return EN_DASH.join(_text(v) for v in value)
    number = float(value)
    return str(int(number)) if number.is_integer() else str(number).replace(".", ",")


def _same(current: Any, expected: Any, what: str) -> None:
    """from se guardó con los valores de la versión analizada, en la misma forma."""
    if current != expected:
        raise Obsolete(f"{what}: al analizar era {_text(expected)} y ahora es {_text(current)}")


def _parents(db: Session, user_id: uuid.UUID) -> tuple[dict[Any, Any], dict[Any, Any]]:
    """cloned_from_id de cada ejercicio y de cada día, en todas las versiones del usuario."""
    days = db.execute(
        select(RoutineDay.id, RoutineDay.cloned_from_id)
        .join(Routine, Routine.id == RoutineDay.routine_id)
        .where(Routine.user_id == user_id)
    ).all()
    items = db.execute(
        select(RoutineDayExercise.id, RoutineDayExercise.cloned_from_id)
        .join(RoutineDay, RoutineDay.id == RoutineDayExercise.routine_day_id)
        .join(Routine, Routine.id == RoutineDay.routine_id)
        .where(Routine.user_id == user_id)
    ).all()
    return (
        {row.id: row.cloned_from_id for row in items},
        {row.id: row.cloned_from_id for row in days},
    )


def _descendant(
    current: Iterable[uuid.UUID], parents: dict[Any, Any], target: uuid.UUID
) -> uuid.UUID | None:
    """La fila de la vigente que es target o desciende de él."""
    for row in current:
        node: uuid.UUID | None = row
        while node is not None:
            if node == target:
                return row
            node = parents.get(node)
    return None


class _Apply:
    """Aplica un cambio a la copia de la vigente. Tira Obsolete si quedó desfasado."""

    def __init__(self, db: Session, user: AppUser, change: AnalysisChange) -> None:
        self.db = db
        self.user = user
        self.change = change
        self.target = change.target_json
        self.item_parents, self.day_parents = _parents(db, user.id)

    def name(self, exercise_id: uuid.UUID | str) -> str:
        exercise = self.db.get(Exercise, uuid.UUID(str(exercise_id)))
        return exercise.name if exercise else "el ejercicio"

    def item(self, draft: Draft) -> RoutineDayExercise:
        target = uuid.UUID(self.target["routine_day_exercise_id"])
        current = _descendant(draft.exercises, self.item_parents, target)
        if current is None:
            raise Obsolete("El ejercicio ya no está en la rutina")
        return draft.exercises[current]

    def day(self, draft: Draft) -> RoutineDay:
        target = uuid.UUID(self.target["routine_day_id"])
        current = _descendant(draft.days, self.day_parents, target)
        if current is None:
            raise Obsolete("El día ya no está en la rutina")
        return draft.days[current]

    def exercise(self) -> uuid.UUID:
        """El del catálogo que eligió el brain, o uno nuevo con sus músculos."""
        new = self.target.get("new_exercise")
        if new is None:
            # swap_exercise lo trae en to_exercise_id; add_exercise, en exercise_id
            chosen = self.target.get("to_exercise_id") or self.target["exercise_id"]
            exercise_id = uuid.UUID(chosen)
            if exercise_id not in usable_exercises(self.db, self.user.id):
                raise Obsolete(f"{self.name(exercise_id)} ya no está en el catálogo")
            return exercise_id
        exercise = Exercise(
            id=uuid.uuid4(),
            user_id=self.user.id,
            name=new["name"],
            kind=new["kind"],
            updated_at=datetime.now(UTC),
            muscles=[
                ExerciseMuscle(muscle_id=m["muscle_id"], factor=Decimal(str(m["factor"])))
                for m in new["muscles"]
            ],
        )
        self.db.add(exercise)
        return exercise.id

    def __call__(self, draft: Draft) -> None:
        t = self.target
        match self.change.type:
            case "set_sets":
                item = self.item(draft)
                _same(item.target_sets, t["from"], f"Series de {self.name(item.exercise_id)}")
                item.target_sets = t["to"]
            case "set_rep_range":
                item = self.item(draft)
                current = [item.reps_min, item.reps_max]
                _same(current, t["from"], f"Repeticiones de {self.name(item.exercise_id)}")
                item.reps_min, item.reps_max = t["to"]
            case "set_rir":
                item = self.item(draft)
                rir = None if item.rir_min is None else [item.rir_min, item.rir_max]
                _same(rir, t["from"], f"RIR de {self.name(item.exercise_id)}")
                item.rir_min, item.rir_max = t["to"]
            case "set_rest":
                item = self.item(draft)
                rest = None if item.rest_min_sec is None else [item.rest_min_sec, item.rest_max_sec]
                _same(rest, t["from"], f"Descanso de {self.name(item.exercise_id)}")
                item.rest_min_sec, item.rest_max_sec = t["to"]
            case "swap_exercise":
                item = self.item(draft)
                if str(item.exercise_id) != t["from_exercise_id"]:
                    raise Obsolete(
                        f"En ese lugar ya no está {self.name(t['from_exercise_id'])}: "
                        f"ahora está {self.name(item.exercise_id)}"
                    )
                # Conserva series, rangos y descanso
                item.exercise_id = self.exercise()
            case "add_exercise":
                day = self.day(draft)
                position = t["position"] or len(day.exercises) + 1
                rir, rest = t["rir"] or [None, None], t["rest_s"] or [None, None]
                added = RoutineDayExercise(
                    id=uuid.uuid4(),
                    exercise_id=self.exercise(),
                    target_sets=t["sets"],
                    reps_min=t["reps"][0],
                    reps_max=t["reps"][1],
                    rir_min=rir[0],
                    rir_max=rir[1],
                    rest_min_sec=rest[0],
                    rest_max_sec=rest[1],
                )
                items = list(day.exercises)
                items.insert(min(position, len(items) + 1) - 1, added)
                day.exercises = _numbered(items)
            case "remove_exercise":
                item = self.item(draft)
                if str(item.exercise_id) != t["exercise_id"]:
                    raise Obsolete(f"En ese lugar ya no está {self.name(t['exercise_id'])}")
                day = next(d for d in draft.days.values() if item in d.exercises)
                if len(day.exercises) == 1:
                    raise ChangeError(f"Quitarlo dejaría {day.name} sin ejercicios")
                day.exercises = _numbered([i for i in day.exercises if i is not item])
            case "set_muscle_target":
                self.muscle_target(draft.routine)
            case other:
                raise ChangeError(f"Tipo de cambio desconocido: {other}")
        draft.routine.from_analysis_id = self.change.analysis_id

    def muscle_target(self, routine: Routine) -> None:
        t = self.target
        row = next((m for m in routine.muscle_targets if m.muscle_id == t["muscle_id"]), None)
        current = float(row.target_sets) if row else None
        _same(current, t["from"], f"Objetivo de {t['muscle_id'].replace('_', ' ')}")
        low, high = t["range"] or [None, None]
        if row is None:
            routine.muscle_targets.append(
                RoutineMuscleTarget(
                    muscle_id=t["muscle_id"],
                    target_sets=Decimal(t["to"]),
                    range_min=low,
                    range_max=high,
                )
            )
            return
        # El objetivo fraccional suma las indirectas: se corre lo mismo que las directas
        if row.fractional_target is not None:
            row.fractional_target = max(
                row.fractional_target + Decimal(t["to"]) - row.target_sets, Decimal(0)
            )
        row.target_sets = Decimal(t["to"])
        if t["range"]:
            row.range_min, row.range_max = Decimal(low), Decimal(high)


def _numbered(items: list[RoutineDayExercise]) -> list[RoutineDayExercise]:
    for position, item in enumerate(items, start=1):
        item.position = position
    return items


def accept(db: Session, user: AppUser, change: AnalysisChange) -> Routine:
    """Crea la versión siguiente con el cambio (source brain, from_analysis_id) y lo marca
    aceptado. Tira Obsolete si ya no aplica, y ChangeError si no se puede aplicar."""
    base = db.scalar(
        select(Routine)
        .where(Routine.user_id == user.id, Routine.status == "vigente")
        .with_for_update()
    )
    if base is None:
        raise Obsolete("Ya no hay rutina vigente")

    def mark(routine: Routine) -> None:
        change.status = "aceptado"
        change.decided_at = datetime.now(UTC)
        change.applied_routine_id = routine.id

    return new_version(db, base, "brain", _Apply(db, user, change), then=mark)
