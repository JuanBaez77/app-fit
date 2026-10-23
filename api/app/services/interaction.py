"""Tiempo por serie (T4.1): del primer toque a confirmar, la meta del MVP es una mediana de 5 s."""

import uuid
from dataclasses import dataclass
from datetime import date

from sqlalchemy import Integer, cast, func, select
from sqlalchemy.orm import Session

from app.models import SetLog, TrainingSession

GOAL_MS = 5000


@dataclass
class Week:
    start: date
    sets: int
    median_ms: float
    p90_ms: float
    # Fracción de las series que se registraron en 5 s o menos
    within_goal: float


def weekly_interaction(db: Session, user_id: uuid.UUID) -> list[Week]:
    """Una fila por semana (lunes) con series medidas: las borradas y las sin medir no cuentan."""
    week = func.date_trunc("week", TrainingSession.date)
    rows = db.execute(
        select(
            week,
            func.count(),
            func.percentile_cont(0.5).within_group(SetLog.interaction_ms),
            func.percentile_cont(0.9).within_group(SetLog.interaction_ms),
            func.avg(cast(SetLog.interaction_ms <= GOAL_MS, Integer)),
        )
        .join(TrainingSession, TrainingSession.id == SetLog.session_id)
        .where(
            TrainingSession.user_id == user_id,
            TrainingSession.deleted_at.is_(None),
            SetLog.deleted_at.is_(None),
            SetLog.interaction_ms.is_not(None),
        )
        .group_by(week)
        .order_by(week)
    ).all()
    return [
        Week(
            start=start.date(),
            sets=count,
            median_ms=float(median),
            p90_ms=float(p90),
            within_goal=float(share),
        )
        for start, count, median, p90, share in rows
    ]


def report(weeks: list[Week]) -> str:
    """La tabla para la terminal."""
    if not weeks:
        return "Todavía no hay series con tiempo medido."
    lines = ["semana       series  mediana   p90   <= 5 s"]
    for w in weeks:
        mark = "ok" if w.median_ms <= GOAL_MS else "lento"
        lines.append(
            f"{w.start.isoformat()}  {w.sets:6}  {w.median_ms / 1000:5.1f} s"
            f"  {w.p90_ms / 1000:4.1f} s  {w.within_goal:5.0%}  {mark}"
        )
    return "\n".join(lines)
