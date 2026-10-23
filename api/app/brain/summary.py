"""El JSON de entrada del análisis (diseño, sección 5): perfil, rutina y métricas ya calculadas.

El modelo nunca recibe el historial crudo ni datos personales: ni nombre, ni correo, ni ids
reales. Los ids van como alias cortos por llamada (rde-1, ex-press-banca-barra, d1) y Aliases
los traduce de vuelta al aplicar un cambio (PR-26, PR-28).
"""

import re
import unicodedata
import uuid
from dataclasses import dataclass, field
from datetime import date, timedelta
from itertools import pairwise
from statistics import mean
from typing import Any, Literal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.metrics import (
    ExerciseRow,
    SessionRow,
    SessionSets,
    SetRow,
    best_mark,
    estimate_one_rm,
    group_by_session,
    week_start,
    weekly_volume,
)
from app.models import (
    AppUser,
    BodyWeight,
    Exercise,
    Routine,
    SetLog,
    TrainingSession,
    UserProfile,
)

SCHEMA_VERSION = 1

Status = Literal["sin_datos", "progresa", "retrocede", "estancado", "mantiene"]

# Umbrales de la app (diseño, sección 5): arbitrarios, se ajustan con el uso
MIN_SESSIONS = 3
DROP = 0.02

_STOPWORDS = {"de", "del", "con", "en", "la", "el", "los", "las", "o", "y", "a", "al", "por"}


# Estados por ejercicio ------------------------------------------------------------------------


def session_score(group: SessionSets, eligible: bool) -> float:
    """La marca de una sesión: su mayor 1RM estimado. Si ninguna serie lo permite (más de 12
    repeticiones o peso corporal), kg x repeticiones de la mejor serie; con peso corporal y sin
    lastre, las repeticiones."""
    e1rms = [estimate_one_rm(s.weight_kg, s.reps, eligible) for s in group.sets]
    valid = [v for v in e1rms if v is not None]
    if valid:
        return max(valid)
    if any(s.weight_kg > 0 for s in group.sets):
        return max(s.weight_kg * s.reps for s in group.sets)
    return float(max(s.reps for s in group.sets))


def exercise_status(scores: list[float]) -> Status:
    """Las reglas de la sección 5, con las marcas de las sesiones de la ventana en orden."""
    if len(scores) < MIN_SESSIONS:
        return "sin_datos"
    *earlier, a, b = scores
    # Una mejor marca de la ventana en las últimas 2 sesiones
    if max(a, b) > max(earlier):
        return "progresa"
    average = mean(earlier)
    if a < average * (1 - DROP) and b < average * (1 - DROP):
        return "retrocede"
    # 3 sesiones seguidas sin superar la mejor marca anterior (y sin retroceso, ya descartado)
    if len(scores) > MIN_SESSIONS and max(scores[-3:]) <= max(scores[:-3]):
        return "estancado"
    return "mantiene"


def lost_reps(previous: SessionSets, current: SessionSets) -> bool:
    """Perdió repeticiones: con el mismo peso en las mismas series, hizo menos en total."""
    before = {s.set_number: s for s in previous.sets}
    pairs = [
        (before[s.set_number], s)
        for s in current.sets
        if s.set_number in before and before[s.set_number].weight_kg == s.weight_kg
    ]
    return bool(pairs) and sum(c.reps for _, c in pairs) < sum(p.reps for p, _ in pairs)


def lost_reps_two_sessions(history: list[SessionSets]) -> bool:
    """La señal de la rutina: "si perdés repeticiones 2 sesiones seguidas"."""
    return (
        len(history) >= MIN_SESSIONS
        and lost_reps(history[-3], history[-2])
        and lost_reps(history[-2], history[-1])
    )


# Alias ----------------------------------------------------------------------------------------


def _slug(name: str) -> str:
    plain = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().lower()
    words = [w for w in re.split(r"[^a-z0-9]+", plain) if w and w not in _STOPWORDS]
    return "-".join(words[:3]) or "ejercicio"


@dataclass
class Aliases:
    """Alias de una llamada -> id real, para traducir los cambios que devuelve el brain."""

    exercises: dict[str, uuid.UUID] = field(default_factory=dict)
    items: dict[str, uuid.UUID] = field(default_factory=dict)
    days: dict[str, uuid.UUID] = field(default_factory=dict)
    _exercise_alias: dict[uuid.UUID, str] = field(default_factory=dict, repr=False)

    def exercise(self, exercise_id: uuid.UUID, name: str) -> str:
        if exercise_id not in self._exercise_alias:
            base = f"ex-{_slug(name)}"
            alias, n = base, 2
            while alias in self.exercises:
                alias, n = f"{base}-{n}", n + 1
            self.exercises[alias] = exercise_id
            self._exercise_alias[exercise_id] = alias
        return self._exercise_alias[exercise_id]

    def item(self, item_id: uuid.UUID) -> str:
        alias = f"rde-{len(self.items) + 1}"
        self.items[alias] = item_id
        return alias

    def day(self, day_id: uuid.UUID) -> str:
        alias = f"d{len(self.days) + 1}"
        self.days[alias] = day_id
        return alias


# Armado ---------------------------------------------------------------------------------------


def _num(value: float | None, digits: int = 1) -> float | int | None:
    """Números compactos: 80 en vez de 80.0. Ahorra tokens."""
    if value is None:
        return None
    rounded = round(value, digits)
    return int(rounded) if float(rounded).is_integer() else rounded


def _range(low: Any, high: Any) -> list[Any] | None:
    return None if low is None else [_num(float(low)), _num(float(high))]


@dataclass(frozen=True)
class Window:
    start: date
    end: date
    label: str

    @property
    def week_starts(self) -> list[date]:
        """Los lunes de las semanas que toca la ventana: a cada uno le corresponde un valor de
        e1rm_by_week y de weekly_avg_kg."""
        first, last = week_start(self.start), week_start(self.end)
        return [first + timedelta(weeks=i) for i in range((last - first).days // 7 + 1)]


def build_summary(
    db: Session, user: AppUser, window: Window, today: date
) -> tuple[dict[str, Any], Aliases]:
    """El JSON de entrada del análisis y la tabla de alias para traducir la respuesta."""
    aliases = Aliases()
    profile = db.get(UserProfile, user.id)
    routine = db.scalar(
        select(Routine).where(Routine.user_id == user.id, Routine.status == "vigente")
    )
    catalog = {
        e.id: e
        for e in db.scalars(
            select(Exercise).where(Exercise.user_id == user.id, Exercise.deleted_at.is_(None))
        )
    }
    sessions = list(
        db.scalars(
            select(TrainingSession).where(
                TrainingSession.user_id == user.id,
                TrainingSession.deleted_at.is_(None),
                TrainingSession.date.between(window.start, window.end),
            )
        )
    )
    session_rows = {
        str(s.id): SessionRow(id=str(s.id), date=s.date, started_at=s.started_at) for s in sessions
    }
    set_rows = [
        SetRow(
            id=str(s.id),
            session_id=str(s.session_id),
            exercise_id=str(s.exercise_id),
            set_number=s.set_number,
            weight_kg=float(s.weight_kg),
            reps=s.reps,
            rir=s.rir,
        )
        for s in db.scalars(
            select(SetLog).where(
                SetLog.session_id.in_([s.id for s in sessions]), SetLog.deleted_at.is_(None)
            )
        )
    ]
    exercise_rows = {
        str(e.id): ExerciseRow(
            id=str(e.id),
            e1rm_eligible=e.e1rm_eligible,
            muscles=tuple((m.muscle_id, float(m.factor)) for m in e.muscles),
        )
        for e in catalog.values()
    }
    weights = list(
        db.scalars(
            select(BodyWeight).where(
                BodyWeight.user_id == user.id,
                BodyWeight.deleted_at.is_(None),
                BodyWeight.date.between(window.start, window.end),
            )
        )
    )

    routine_json = _routine(routine, catalog, aliases) if routine else None
    body = _body_weight(weights, window)
    summary: dict[str, Any] = {
        "schema_version": SCHEMA_VERSION,
        "today": today.isoformat(),
        "window": {
            "from": window.start.isoformat(),
            "to": window.end.isoformat(),
            "weeks": round(((window.end - window.start).days + 1) / 7),
            "week_starts": [w.isoformat() for w in window.week_starts],
            "label": window.label,
        },
        "profile": _profile(profile, today, body["weekly_avg_kg"]),
        "routine": routine_json,
        "catalog": [
            {
                "id": aliases.exercise(e.id, e.name),
                "name": e.name,
                "muscles": {m.muscle_id: _num(float(m.factor)) for m in e.muscles},
            }
            for e in sorted(catalog.values(), key=lambda e: e.name)
        ],
        "metrics": {
            "adherence": _adherence(routine, sessions, set_rows, window, today),
            "weekly_volume": [
                {
                    "week_start": week.isoformat(),
                    "muscles": {
                        m: {"direct": v.direct, "fractional": _num(v.fractional)}
                        for m, v in sorted(volume.items())
                    },
                }
                for week, volume in sorted(
                    weekly_volume(set_rows, session_rows, exercise_rows).items()
                )
            ],
            "exercises": _exercises(
                routine, catalog, set_rows, session_rows, exercise_rows, window, aliases
            ),
            "body_weight": body,
            "recovery": _recovery(sessions, profile),
            "data_quality": {
                "sets_total": len(set_rows),
                "rir_logged_pct": (
                    round(sum(s.rir is not None for s in set_rows) / len(set_rows), 2)
                    if set_rows
                    else None
                ),
            },
        },
        "request": {"type": "analisis"},
    }
    return summary, aliases


def _profile(
    profile: UserProfile | None, today: date, weekly_avg: list[float | None]
) -> dict[str, Any] | None:
    if profile is None:
        return None
    latest = next((w for w in reversed(weekly_avg) if w is not None), None)
    return {
        "sex": profile.sex,
        # Aproximada: sin la fecha de nacimiento completa
        "age": today.year - profile.birth_year if profile.birth_year else None,
        "height_cm": _num(float(profile.height_cm)) if profile.height_cm else None,
        "weight_kg": latest,
        "experience_years": (
            _num(float(profile.experience_years)) if profile.experience_years else None
        ),
        "habitual_rir": profile.habitual_rir,
        "goal": profile.goal,
        "priority_muscles": profile.priority_muscles,
        "phase": {
            "name": profile.phase,
            "start": profile.phase_start.isoformat() if profile.phase_start else None,
            "target": profile.phase_target,
        },
        "equipment": profile.equipment,
        "limitations": profile.limitations,
    }


def _routine(routine: Routine, catalog: dict[uuid.UUID, Exercise], aliases: Aliases) -> Any:
    return {
        "version": routine.version,
        "start_on": routine.start_on.isoformat() if routine.start_on else None,
        "review_on": routine.review_on.isoformat() if routine.review_on else None,
        "muscle_targets": [
            {
                "muscle_id": t.muscle_id,
                "target": _num(float(t.target_sets)),
                "range": _range(t.range_min, t.range_max),
                "fractional_target": (
                    _num(float(t.fractional_target)) if t.fractional_target is not None else None
                ),
                "priority": t.priority,
            }
            for t in routine.muscle_targets
        ],
        "days": [
            {
                "id": aliases.day(day.id),
                "name": day.name,
                "weekday": day.weekday,
                "exercises": [
                    {
                        "id": aliases.item(item.id),
                        "exercise_id": aliases.exercise(
                            item.exercise_id, catalog[item.exercise_id].name
                        ),
                        "name": catalog[item.exercise_id].name,
                        "brain_page": catalog[item.exercise_id].brain_page,
                        "sets": item.target_sets,
                        "ramp": (
                            {"sets": item.ramp_sets, "weeks": item.ramp_weeks}
                            if item.ramp_sets
                            else None
                        ),
                        "reps": [item.reps_min, item.reps_max],
                        "rir": _range(item.rir_min, item.rir_max),
                        "rest_s": _range(item.rest_min_sec, item.rest_max_sec),
                    }
                    for item in day.exercises
                ],
            }
            for day in routine.days
        ],
    }


def _adherence(
    routine: Routine | None,
    sessions: list[TrainingSession],
    sets: list[SetRow],
    window: Window,
    today: date,
) -> dict[str, int]:
    """Planificadas: los días con día fijo de la rutina dentro de la ventana (desde que
    empezó y hasta hoy). Hechas: las sesiones con al menos una serie."""
    weekdays = {d.weekday for d in routine.days if d.weekday} if routine else set()
    start = max(window.start, routine.start_on or window.start) if routine else window.start
    end = min(window.end, today)
    planned = sum(
        (start + timedelta(days=i)).isoweekday() in weekdays
        for i in range(max((end - start).days + 1, 0))
    )
    trained = {s.session_id for s in sets}
    return {"planned": planned, "done": sum(str(s.id) in trained for s in sessions)}


def _exercises(
    routine: Routine | None,
    catalog: dict[uuid.UUID, Exercise],
    sets: list[SetRow],
    sessions: dict[str, SessionRow],
    rows: dict[str, ExerciseRow],
    window: Window,
    aliases: Aliases,
) -> list[dict[str, Any]]:
    """Los de la rutina vigente, en su orden, y después los que tuvieron series fuera de ella."""
    order: list[uuid.UUID] = []
    for day in routine.days if routine else []:
        order += [i.exercise_id for i in day.exercises if i.exercise_id not in order]
    order += sorted(
        {uuid.UUID(s.exercise_id) for s in sets} - set(order),
        key=lambda e: catalog[e].name if e in catalog else "",
    )

    result = []
    for exercise_id in order:
        exercise = catalog.get(exercise_id)
        if exercise is None:
            continue
        eligible = exercise.e1rm_eligible
        history = group_by_session([s for s in sets if s.exercise_id == str(exercise_id)], sessions)
        best = best_mark(history, eligible) if eligible else None
        best_date = next(g.session.date for g in history if best.set in g.sets) if best else None
        by_week: dict[date, float] = {}
        for group in history:
            values = [estimate_one_rm(s.weight_kg, s.reps, eligible) for s in group.sets]
            valid = [v for v in values if v is not None]
            if valid:
                week = week_start(group.session.date)
                by_week[week] = max(by_week.get(week, 0.0), *valid)
        result.append(
            {
                "exercise_id": aliases.exercise(exercise_id, exercise.name),
                "name": exercise.name,
                "sessions_in_window": len(history),
                "status_app": exercise_status([session_score(g, eligible) for g in history]),
                "lost_reps_2_sessions": lost_reps_two_sessions(history),
                "best_e1rm_kg": (
                    {"value": _num(best.e1rm), "date": best_date.isoformat()}
                    if best and best.e1rm and best_date
                    else None
                ),
                "e1rm_by_week": [_num(by_week.get(w)) for w in window.week_starts],
                # Las últimas 3, de la más nueva a la más vieja; cada serie es [kg, reps, RIR]
                "last_sessions": [
                    {
                        "date": g.session.date.isoformat(),
                        "sets": [[_num(s.weight_kg, 2), s.reps, s.rir] for s in g.sets],
                    }
                    for g in reversed(history[-3:])
                ],
            }
        )
    return result


def _body_weight(weights: list[BodyWeight], window: Window) -> dict[str, list[Any]]:
    averages: list[float | None] = []
    for week in window.week_starts:
        kgs = [float(w.kg) for w in weights if week_start(w.date) == week]
        averages.append(round(mean(kgs), 1) if kgs else None)
    changes: list[float | None] = [
        round((b - a) / a * 100, 1) if a is not None and b is not None else None
        for a, b in pairwise(averages)
    ]
    return {"weekly_avg_kg": averages, "change_pct_per_week": changes}


def _recovery(sessions: list[TrainingSession], profile: UserProfile | None) -> dict[str, Any]:
    sleep = [float(s.sleep_hours) for s in sessions if s.sleep_hours is not None]
    shared = profile is not None and profile.send_discomfort_to_ai
    return {
        "avg_sleep_h": round(mean(sleep), 1) if sleep else None,
        # Texto libre de salud: solo viaja si se activó en Ajustes. null es "no se comparte",
        # distinto de [] ("no anotó molestias")
        "discomfort": (
            [
                {"date": s.date.isoformat(), "text": s.discomfort}
                for s in sorted(sessions, key=lambda s: s.date)
                if s.discomfort
            ]
            if shared
            else None
        ),
    }


def weeks_window(today: date, weeks: int, label: str) -> Window:
    """Las últimas N semanas completas hasta ayer."""
    end = today - timedelta(days=1)
    return Window(start=end - timedelta(weeks=weeks) + timedelta(days=1), end=end, label=label)
