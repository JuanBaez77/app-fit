"""Tiempo por serie: la mediana semanal que mide la meta de 5 s (T4.1)."""

from datetime import date

from sqlalchemy.orm import Session

from app.models import AppUser
from app.services.interaction import report, weekly_interaction
from tests.factories import make_exercise, make_session, make_set, make_user, now


def logged(db: Session, user: AppUser, day: date, *times: int | None) -> None:
    session = make_session(db, user, day)
    exercise = make_exercise(db, user)
    for number, ms in enumerate(times, start=1):
        set_log = make_set(db, session, exercise, number=number)
        set_log.interaction_ms = ms
    db.flush()


def test_mediana_por_semana(db: Session, user: AppUser) -> None:
    # Semana del lunes 19 de octubre: 3, 4 y 9 s, y una sin medir
    logged(db, user, date(2026, 10, 19), 3000, 9000)
    logged(db, user, date(2026, 10, 21), 4000, None)
    # Semana siguiente: 6 s
    logged(db, user, date(2026, 10, 26), 6000)
    # Una borrada no cuenta
    deleted = make_set(db, make_session(db, user, date(2026, 10, 26)), make_exercise(db, user))
    deleted.interaction_ms, deleted.deleted_at = 100, now()
    # Las de otro usuario tampoco
    logged(db, make_user(db), date(2026, 10, 19), 100)

    first, second = weekly_interaction(db, user.id)

    assert (first.start, first.sets, first.median_ms) == (date(2026, 10, 19), 3, 4000)
    assert round(first.within_goal, 2) == 0.67
    assert (second.start, second.sets, second.median_ms, second.within_goal) == (
        date(2026, 10, 26),
        1,
        6000,
        0,
    )
    table = report([first, second])
    assert "2026-10-19       3    4.0 s" in table
    assert table.splitlines()[1].endswith("ok")
    assert table.splitlines()[2].endswith("lento")


def test_sin_series_medidas(db: Session, user: AppUser) -> None:
    assert report(weekly_interaction(db, user.id)) == "Todavía no hay series con tiempo medido."
