"""Cálculos de la app, en Python para el análisis del brain.

Son los mismos que web/src/metrics/index.ts (que anda sin red en el celular). Las dos versiones
corren los fixtures dorados de fixtures/metrics/: si divergen, falla el test.
"""

from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from typing import Literal

# Con más repeticiones, la fórmula de Epley pierde precisión: esas series no estiman 1RM
E1RM_MAX_REPS = 12


@dataclass(frozen=True)
class SetRow:
    id: str
    session_id: str
    exercise_id: str
    set_number: int
    weight_kg: float
    reps: int
    rir: int | None = None
    deleted_at: datetime | str | None = None


@dataclass(frozen=True)
class SessionRow:
    id: str
    date: date
    started_at: datetime | None = None
    deleted_at: datetime | str | None = None


@dataclass(frozen=True)
class ExerciseRow:
    id: str
    e1rm_eligible: bool
    # (muscle_id, factor): 1 directa, 0,5 indirecta
    muscles: tuple[tuple[str, float], ...] = ()


@dataclass
class SessionSets:
    session: SessionRow
    sets: list[SetRow] = field(default_factory=list)


@dataclass(frozen=True)
class BestMark:
    set: SetRow
    # None en ejercicios sin 1RM estimado (dominadas y otros con peso corporal)
    e1rm: float | None


@dataclass(frozen=True)
class MuscleVolume:
    # Series con factor 1
    direct: int
    # Suma de factores: la indirecta vale 0,5
    fractional: float


Trend = Literal["up", "same", "down"]


def estimate_one_rm(weight_kg: float, reps: int, eligible: bool) -> float | None:
    """1RM estimado (Epley): peso * (1 + reps / 30). None si el ejercicio o la serie no sirven."""
    if not eligible or reps <= 0 or reps > E1RM_MAX_REPS:
        return None
    return weight_kg * (1 + reps / 30)


def group_by_session(sets: list[SetRow], sessions: dict[str, SessionRow]) -> list[SessionSets]:
    """Las series de un ejercicio por sesión, de la más vieja a la más nueva, sin lo borrado."""
    groups: dict[str, SessionSets] = {}
    for row in sets:
        session = sessions.get(row.session_id)
        if row.deleted_at or session is None or session.deleted_at:
            continue
        groups.setdefault(session.id, SessionSets(session)).sets.append(row)
    for group in groups.values():
        group.sets.sort(key=lambda s: s.set_number)
    return sorted(
        groups.values(),
        key=lambda g: (g.session.date, g.session.started_at or datetime.min),
    )


def compare_sets(current: SetRow, previous: SetRow, eligible: bool) -> Trend:
    """Con 1RM estimado compara eso; si no (más de 12 repeticiones o peso corporal), compara
    peso y después repeticiones."""
    a = estimate_one_rm(current.weight_kg, current.reps, eligible)
    b = estimate_one_rm(previous.weight_kg, previous.reps, eligible)
    if a is not None and b is not None:
        diff = a - b
    else:
        diff = (current.weight_kg - previous.weight_kg) or (current.reps - previous.reps)
    if abs(diff) < 1e-9:
        return "same"
    return "up" if diff > 0 else "down"


def best_mark(history: list[SessionSets], eligible: bool) -> BestMark | None:
    """La serie con el mayor 1RM estimado. Sin 1RM estimado, la de más peso y, a igual peso,
    la de más repeticiones."""
    best: BestMark | None = None
    for group in history:
        for row in group.sets:
            if not eligible:
                if best is None or compare_sets(row, best.set, False) == "up":
                    best = BestMark(row, None)
                continue
            e1rm = estimate_one_rm(row.weight_kg, row.reps, eligible)
            if e1rm is not None and (best is None or not best.e1rm or e1rm > best.e1rm):
                best = BestMark(row, e1rm)
    return best


def week_start(day: date) -> date:
    """El lunes de la semana."""
    return day - timedelta(days=day.weekday())


def routine_week(start_on: date | None, today: date) -> float:
    """Semana de la rutina (1 = la semana en que empezó). Sin inicio, infinito."""
    if start_on is None:
        return float("inf")
    return (today - start_on).days // 7 + 1


def target_sets(target: int, ramp_sets: int | None, ramp_weeks: int | None, week: float) -> int:
    """Las series de rampa mientras dura, y después las de la rutina."""
    if ramp_sets and ramp_weeks and week <= ramp_weeks:
        return ramp_sets
    return target


def weekly_volume(
    sets: list[SetRow],
    sessions: dict[str, SessionRow],
    exercises: dict[str, ExerciseRow],
) -> dict[date, dict[str, MuscleVolume]]:
    """Volumen por músculo y por semana (lunes a domingo, según la fecha de la sesión), con el
    mapa de factores de cada ejercicio. Un músculo sin series en la semana no aparece."""
    direct: dict[date, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    fractional: dict[date, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    for row in sets:
        session = sessions.get(row.session_id)
        exercise = exercises.get(row.exercise_id)
        if row.deleted_at or session is None or session.deleted_at or exercise is None:
            continue
        week = week_start(session.date)
        for muscle_id, factor in exercise.muscles:
            direct[week][muscle_id] += 1 if factor == 1 else 0
            fractional[week][muscle_id] += factor
    return {
        week: {m: MuscleVolume(direct[week][m], fractional[week][m]) for m in muscles}
        for week, muscles in fractional.items()
    }
