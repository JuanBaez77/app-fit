import json
from datetime import date
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.brain.summary import (
    Window,
    build_summary,
    exercise_status,
    lost_reps_two_sessions,
    session_score,
)
from app.metrics import SessionRow, SessionSets, SetRow
from app.models import AppUser, Exercise, UserProfile
from tests.factories import make_body_weight, make_session, make_set

WINDOW = Window(date(2026, 10, 20), date(2026, 11, 16), "desde el inicio de la rutina v1")
TODAY = date(2026, 11, 17)


# Estados (sección 5) --------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("scores", "expected"),
    [
        ([100, 101], "sin_datos"),
        ([100, 100, 101], "progresa"),
        # La mejor marca puede estar en la anteúltima
        ([100, 101, 100], "progresa"),
        # Igualar la mejor marca no es progresar
        ([100, 100, 100], "mantiene"),
        ([100, 100, 100, 100], "estancado"),
        ([100, 104, 100, 100, 100], "estancado"),
        ([100, 100, 97, 97], "retrocede"),
        # Las dos tienen que quedar más de 2 % abajo
        ([100, 100, 98.5, 97], "estancado"),
        ([100, 100, 98, 98], "estancado"),
        ([100, 102, 99, 101], "mantiene"),
    ],
)
def test_estado_del_ejercicio(scores: list[float], expected: str) -> None:
    assert exercise_status(scores) == expected


def group(*sets: tuple[float, int]) -> SessionSets:
    session = SessionRow(id="s", date=date(2026, 11, 2))
    return SessionSets(
        session,
        [
            SetRow(
                id=f"{n}",
                session_id="s",
                exercise_id="e",
                set_number=n,
                weight_kg=w,
                reps=r,
            )
            for n, (w, r) in enumerate(sets, start=1)
        ],
    )


def test_marca_de_la_sesion() -> None:
    assert session_score(group((80, 8), (80, 7)), True) == pytest.approx(101.333, abs=1e-3)
    # Todas las series pasan de 12 repeticiones: kg x repeticiones de la mejor
    assert session_score(group((20, 15), (22.5, 14)), True) == 315
    # Peso corporal sin lastre: las repeticiones
    assert session_score(group((0, 8), (0, 10)), False) == 10


def test_perdio_repeticiones_dos_sesiones_seguidas() -> None:
    falling = [group((80, 8), (80, 8)), group((80, 8), (80, 7)), group((80, 7), (80, 6))]
    assert lost_reps_two_sessions(falling)
    # Una sola caída no alcanza
    assert not lost_reps_two_sessions([falling[0], falling[0], falling[1]])
    # Con más peso, hacer menos repeticiones no es perder
    assert not lost_reps_two_sessions(
        [group((80, 8)), group((82.5, 7)), group((85, 6))],
    )


# Armado con datos reales ----------------------------------------------------------------------


@pytest.fixture
def data(client: TestClient, auth: dict[str, str], user: AppUser, db: Session) -> AppUser:
    """La rutina importada, 4 sesiones de press de banca y unos pesos."""
    client.post("/routines/import", headers=auth)
    bench = db.scalar(select(Exercise).where(Exercise.name == "Press de banca con barra"))
    assert bench is not None
    # (repeticiones, RIR) de cada serie, siempre con 80 kg
    sessions: list[tuple[date, list[tuple[int, int | None]]]] = [
        (date(2026, 10, 26), [(8, 2), (7, 1)]),
        (date(2026, 11, 2), [(8, None), (8, 2)]),
        (date(2026, 11, 9), [(9, 2), (8, 1)]),
        (date(2026, 11, 16), [(9, 2), (9, 1)]),
    ]
    for day, sets in sessions:
        session = make_session(db, user, day)
        session.sleep_hours = Decimal(7)
        for n, (reps, rir) in enumerate(sets, start=1):
            make_set(db, session, bench, "80", reps, rir, number=n)
    session.discomfort = "molestia en el hombro derecho al bajar"
    # Fuera de la ventana: no cuenta
    make_set(db, make_session(db, user, date(2026, 10, 10)), bench, "70", 8)
    make_body_weight(db, user, date(2026, 10, 27), "72.0")
    make_body_weight(db, user, date(2026, 10, 29), "72.4")
    make_body_weight(db, user, date(2026, 11, 3), "72.0")
    db.flush()
    return user


def test_resumen_de_datos_reales(data: AppUser, db: Session) -> None:
    summary, aliases = build_summary(db, data, WINDOW, TODAY)

    assert summary["window"]["weeks"] == 4
    assert summary["window"]["week_starts"] == [
        "2026-10-19",
        "2026-10-26",
        "2026-11-02",
        "2026-11-09",
        "2026-11-16",
    ]
    assert summary["metrics"]["adherence"] == {"planned": 20, "done": 4}

    bench = summary["metrics"]["exercises"][0]
    assert bench["exercise_id"] == "ex-press-banca-barra"
    assert bench["sessions_in_window"] == 4
    assert bench["status_app"] == "progresa"
    assert bench["lost_reps_2_sessions"] is False
    assert bench["best_e1rm_kg"] == {"value": 104, "date": "2026-11-09"}
    assert bench["e1rm_by_week"] == [None, 101.3, 101.3, 104, 104]
    assert bench["last_sessions"][0] == {"date": "2026-11-16", "sets": [[80, 9, 2], [80, 9, 1]]}
    assert [s["date"] for s in bench["last_sessions"]] == ["2026-11-16", "2026-11-09", "2026-11-02"]
    # Los de la rutina sin series quedan sin_datos
    assert {e["status_app"] for e in summary["metrics"]["exercises"][1:]} == {"sin_datos"}

    week = next(w for w in summary["metrics"]["weekly_volume"] if w["week_start"] == "2026-11-02")
    assert week["muscles"]["pectoral"] == {"direct": 2, "fractional": 2}
    assert week["muscles"]["triceps"] == {"direct": 0, "fractional": 1}

    assert summary["metrics"]["body_weight"] == {
        "weekly_avg_kg": [None, 72.2, 72.0, None, None],
        "change_pct_per_week": [None, -0.3, None, None],
    }
    assert summary["profile"]["weight_kg"] == 72.0
    assert summary["metrics"]["data_quality"] == {"sets_total": 8, "rir_logged_pct": 0.88}
    assert summary["metrics"]["recovery"]["avg_sleep_h"] == 7

    # Los alias vuelven a los ids reales
    first_day = summary["routine"]["days"][0]
    assert first_day["id"] == "d1"
    assert first_day["exercises"][0]["id"] == "rde-1"
    assert aliases.exercises["ex-press-banca-barra"] == db.scalar(
        select(Exercise.id).where(Exercise.name == "Press de banca con barra")
    )
    catalog_ids = [e["id"] for e in summary["catalog"]]
    assert len(catalog_ids) == len(set(catalog_ids)) == len(aliases.exercises)


def test_no_lleva_datos_personales(data: AppUser, db: Session) -> None:
    summary, _ = build_summary(db, data, WINDOW, TODAY)
    text = json.dumps(summary, ensure_ascii=False)

    assert data.email not in text
    assert str(data.id) not in text
    assert "name" not in summary["profile"]
    assert summary["profile"]["age"] is not None
    assert "birth_year" not in summary["profile"]
    # Ningún UUID: todos los ids son alias
    assert not any(
        str(e.id) in text for e in db.scalars(select(Exercise).where(Exercise.user_id == data.id))
    )


def test_las_molestias_viajan_solo_si_se_activo(data: AppUser, db: Session) -> None:
    summary, _ = build_summary(db, data, WINDOW, TODAY)
    assert summary["metrics"]["recovery"]["discomfort"] is None
    assert "hombro derecho al bajar" not in json.dumps(summary, ensure_ascii=False)

    profile = db.get(UserProfile, data.id)
    assert profile is not None
    profile.send_discomfort_to_ai = True
    summary, _ = build_summary(db, data, WINDOW, TODAY)

    assert summary["metrics"]["recovery"]["discomfort"] == [
        {"date": "2026-11-16", "text": "molestia en el hombro derecho al bajar"}
    ]
