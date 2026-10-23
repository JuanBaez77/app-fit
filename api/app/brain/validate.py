"""Validación de la respuesta del brain (diseño, sección 5), después de que cumple el esquema.

- Las citas que no existen en el bundle se descartan; el cambio queda "sin respaldo verificable".
- basis y evidence_level tienen que ser coherentes.
- Los ids tienen que existir en la rutina vigente y el valor from coincidir con el actual.
- Los valores to pasan una cordura técnica (rangos posibles, no criterio de entrenamiento).

Un cambio que no pasa se descarta con el motivo; el resto del análisis se guarda igual.
"""

import uuid
from dataclasses import dataclass, field
from typing import Any

from app.brain.schema import AnalysisOut, Change, NewExercise
from app.brain.summary import Aliases
from app.models import AnalysisChange, Routine, RoutineDayExercise

# Cordura técnica de los valores to: lo que la app puede guardar, no lo que conviene entrenar
LIMITS = {
    "sets": (1, 20),
    "reps": (1, 100),
    "rir": (0, 5),
    "rest_s": (0, 900),
    "muscle_target": (0, 40),
}


class Invalid(ValueError):
    """El cambio no se puede aplicar: el mensaje es el motivo."""


@dataclass
class Checked:
    # La respuesta sin las citas inexistentes
    response: dict[str, Any]
    changes: list[AnalysisChange] = field(default_factory=list)
    # Los cambios descartados, con el motivo
    discarded: list[dict[str, Any]] = field(default_factory=list)


def _pair(value: Any, name: str, kind: str) -> list[int]:
    """Un rango [min, max] entero dentro de los límites de kind."""
    low, high = LIMITS[kind]
    if (
        not isinstance(value, list)
        or len(value) != 2
        or not all(float(v).is_integer() for v in value)
    ):
        raise Invalid(f"{name} tiene que ser un rango [min, max] de enteros")
    a, b = int(value[0]), int(value[1])
    if not (low <= a <= b <= high):
        raise Invalid(f"{name} {[a, b]} está fuera de lo posible ({low} a {high}, min <= max)")
    return [a, b]


def _optional_pair(value: Any, name: str, kind: str) -> list[int] | None:
    return None if value is None else _pair(value, name, kind)


def _int(value: Any, name: str, kind: str) -> int:
    low, high = LIMITS[kind]
    if not isinstance(value, int | float) or not float(value).is_integer():
        raise Invalid(f"{name} tiene que ser un entero")
    if not (low <= value <= high):
        raise Invalid(f"{name} {value} está fuera de lo posible ({low} a {high})")
    return int(value)


def _same(current: Any, sent: Any, what: str) -> None:
    """El from del brain tiene que ser el valor actual: si no, el cambio está desfasado."""
    normalized = [float(v) for v in sent] if isinstance(sent, list) else sent
    expected = [float(v) for v in current] if isinstance(current, list) else current
    if isinstance(normalized, int | float) and isinstance(expected, int | float):
        matches = float(normalized) == float(expected)
    else:
        matches = normalized == expected
    if not matches:
        raise Invalid(f"from de {what} es {sent}, pero el valor actual es {current}")


class _Routine:
    """La rutina vigente indexada por id real, para resolver los alias."""

    def __init__(self, routine: Routine, aliases: Aliases, muscles: set[str]) -> None:
        self.aliases = aliases
        self.muscles = muscles
        self.items = {i.id: i for d in routine.days for i in d.exercises}
        self.days = {d.id: d for d in routine.days}
        self.targets = {t.muscle_id: t for t in routine.muscle_targets}

    def item(self, alias: str | None) -> RoutineDayExercise:
        item_id = self.aliases.items.get(alias or "")
        if item_id is None or item_id not in self.items:
            raise Invalid(f"El ejercicio de la rutina {alias!r} no existe")
        return self.items[item_id]

    def exercise(self, alias: str | None) -> uuid.UUID:
        exercise_id = self.aliases.exercises.get(alias or "")
        if exercise_id is None:
            raise Invalid(f"El ejercicio {alias!r} no está en el catálogo")
        return exercise_id

    def new_exercise(self, exercise: NewExercise) -> dict[str, Any]:
        if not exercise.name.strip():
            raise Invalid("El ejercicio nuevo no tiene nombre")
        unknown = {m.muscle_id for m in exercise.muscles} - self.muscles
        if unknown:
            raise Invalid(f"Músculos desconocidos: {', '.join(sorted(unknown))}")
        if any(m.factor not in (0.5, 1) for m in exercise.muscles):
            raise Invalid("Los factores son 1 (directa) o 0,5 (indirecta)")
        if not any(m.factor == 1 for m in exercise.muscles):
            raise Invalid("El ejercicio nuevo necesita un músculo directo")
        return exercise.model_dump()

    def exercise_or_new(self, alias: str | None, new: NewExercise | None) -> dict[str, Any]:
        if (alias is None) == (new is None):
            raise Invalid("Va un ejercicio del catálogo o uno nuevo, no los dos ni ninguno")
        if new is not None:
            return {"exercise_id": None, "new_exercise": self.new_exercise(new)}
        return {"exercise_id": str(self.exercise(alias)), "new_exercise": None}


def _target(change: Change, routine: _Routine) -> dict[str, Any]:
    """Resuelve los alias a ids reales, compara from y controla to. Tira Invalid."""
    t = change.target
    match change.type:
        case "set_sets":
            item = routine.item(t.routine_day_exercise_id)
            _same(item.target_sets, t.from_, "series")
            return {
                "routine_day_exercise_id": str(item.id),
                "from": item.target_sets,
                "to": _int(t.to, "to", "sets"),
            }
        case "set_rep_range":
            item = routine.item(t.routine_day_exercise_id)
            current = [item.reps_min, item.reps_max]
            _same(current, t.from_, "repeticiones")
            return {
                "routine_day_exercise_id": str(item.id),
                "from": current,
                "to": _pair(t.to, "to", "reps"),
            }
        case "set_rir":
            item = routine.item(t.routine_day_exercise_id)
            rir = None if item.rir_min is None else [item.rir_min, item.rir_max]
            _same(rir, t.from_, "RIR")
            return {
                "routine_day_exercise_id": str(item.id),
                "from": rir,
                "to": _pair(t.to, "to", "rir"),
            }
        case "set_rest":
            item = routine.item(t.routine_day_exercise_id)
            rest = None if item.rest_min_sec is None else [item.rest_min_sec, item.rest_max_sec]
            _same(rest, t.from_, "descanso")
            return {
                "routine_day_exercise_id": str(item.id),
                "from": rest,
                "to": _pair(t.to, "to", "rest_s"),
            }
        case "swap_exercise":
            item = routine.item(t.routine_day_exercise_id)
            chosen = routine.exercise_or_new(t.to_exercise_id, t.new_exercise)
            return {
                "routine_day_exercise_id": str(item.id),
                "from_exercise_id": str(item.exercise_id),
                "to_exercise_id": chosen["exercise_id"],
                "new_exercise": chosen["new_exercise"],
            }
        case "add_exercise":
            day_id = routine.aliases.days.get(t.routine_day_id or "")
            if day_id is None or day_id not in routine.days:
                raise Invalid(f"El día {t.routine_day_id!r} no existe")
            day = routine.days[day_id]
            if t.position is not None and not 1 <= t.position <= len(day.exercises) + 1:
                raise Invalid(f"La posición {t.position} no existe en {day.name}")
            return {
                "routine_day_id": str(day.id),
                **routine.exercise_or_new(t.exercise_id, t.new_exercise),
                "position": t.position,
                "sets": _int(t.sets, "sets", "sets"),
                "reps": _pair(t.reps, "reps", "reps"),
                "rir": _optional_pair(t.rir, "rir", "rir"),
                "rest_s": _optional_pair(t.rest_s, "rest_s", "rest_s"),
            }
        case "remove_exercise":
            item = routine.item(t.routine_day_exercise_id)
            return {
                "routine_day_exercise_id": str(item.id),
                "exercise_id": str(item.exercise_id),
            }
        case "set_muscle_target":
            muscle = t.muscle_id or ""
            if muscle not in routine.muscles:
                raise Invalid(f"El músculo {muscle!r} no existe")
            target = routine.targets.get(muscle)
            objective = float(target.target_sets) if target else None
            _same(objective, t.from_, f"el objetivo de {muscle}")
            return {
                "muscle_id": muscle,
                "from": objective,
                "to": _int(t.to, "to", "muscle_target"),
                "range": _optional_pair(t.range, "range", "muscle_target"),
            }
    raise Invalid(f"Tipo de cambio desconocido: {change.type}")


def check(
    analysis: AnalysisOut,
    pages: set[str],
    aliases: Aliases,
    routine: Routine,
    muscles: set[str],
) -> Checked:
    current = _Routine(routine, aliases, muscles)
    for exercise in analysis.exercise_assessments:
        exercise.evidence_links = [link for link in exercise.evidence_links if link in pages]
    for muscle in analysis.muscle_assessments:
        muscle.evidence_links = [link for link in muscle.evidence_links if link in pages]

    checked = Checked(response={})
    kept: list[Change] = []
    for position, change in enumerate(analysis.changes, start=1):
        valid = [link for link in change.evidence_links if link in pages]
        dropped = [link for link in change.evidence_links if link not in pages]
        try:
            target = _target(change, current)
        except Invalid as error:
            checked.discarded.append(
                {
                    "position": position,
                    "type": change.type,
                    "title": change.title,
                    "reason": str(error),
                }
            )
            continue
        change.evidence_links = valid
        # Sin un enlace que exista no hay evidencia verificable: pasa a práctica
        if change.basis == "evidencia" and not valid:
            change.basis = "practica"
        if change.basis == "practica":
            change.evidence_level = None
        kept.append(change)
        checked.changes.append(
            AnalysisChange(
                id=uuid.uuid4(),
                position=len(kept),
                type=change.type,
                target_json=target,
                title=change.title,
                rationale=change.rationale,
                expectation=change.expectation,
                basis=change.basis,
                evidence_level=change.evidence_level,
                evidence_links_json=valid,
                dropped_links_json=dropped or None,
            )
        )
    analysis.changes = kept
    checked.response = analysis.model_dump(mode="json", by_alias=True)
    return checked
