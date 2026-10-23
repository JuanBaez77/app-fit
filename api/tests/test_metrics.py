"""Las métricas en Python contra los fixtures dorados que también corre la web.

Si este test y web/src/metrics/fixtures.test.ts pasan con los mismos archivos, las dos
implementaciones no divergen.
"""

import json
from datetime import date
from pathlib import Path
from typing import Any

import pytest
import yaml

from app.metrics import (
    ExerciseRow,
    SessionRow,
    SetRow,
    best_mark,
    compare_sets,
    estimate_one_rm,
    group_by_session,
    routine_week,
    target_sets,
    week_start,
    weekly_volume,
)

# En el contenedor el repo no está entero: docker-compose monta fixtures/ en /fixtures,
# que es la misma ruta relativa que desde api/tests en el repo
FIXTURES = Path(__file__).resolve().parents[2] / "fixtures" / "metrics"
SEEDS = Path(__file__).resolve().parents[1] / "seeds"


def load(name: str) -> dict[str, Any]:
    data: dict[str, Any] = json.loads((FIXTURES / f"{name}.json").read_text(encoding="utf-8"))
    return data


def rows(
    fixture: dict[str, Any],
) -> tuple[list[SetRow], dict[str, SessionRow], dict[str, ExerciseRow]]:
    sets = [
        SetRow(
            id=s["id"],
            session_id=s["session_id"],
            exercise_id=s["exercise_id"],
            set_number=s["set_number"],
            weight_kg=s["weight_kg"],
            reps=s["reps"],
            deleted_at=s["deleted_at"],
        )
        for s in fixture["sets"]
    ]
    sessions = {
        s["id"]: SessionRow(
            id=s["id"], date=date.fromisoformat(s["date"]), deleted_at=s["deleted_at"]
        )
        for s in fixture["sessions"]
    }
    exercises = {
        e["id"]: ExerciseRow(
            id=e["id"],
            e1rm_eligible=e["e1rm_eligible"],
            muscles=tuple((m["muscle_id"], m["factor"]) for m in e["muscles"]),
        )
        for e in fixture["exercises"]
    }
    return sets, sessions, exercises


@pytest.mark.parametrize("name", ["rutina-semana-3", "bordes-semana"])
def test_volumen_semanal(name: str) -> None:
    fixture = load(name)

    weeks = weekly_volume(*rows(fixture))

    assert {
        week.isoformat(): {
            m: {"direct": v.direct, "fractional": v.fractional} for m, v in muscles.items()
        }
        for week, muscles in weeks.items()
    } == {w["week_start"]: w["muscles"] for w in fixture["expected"]["weekly_volume"]}


def test_1rm_por_serie() -> None:
    fixture = load("1rm-estimado")
    sets, _, exercises = rows(fixture)

    for row in sets:
        expected = fixture["expected"]["e1rm_by_set"][row.id]
        value = estimate_one_rm(row.weight_kg, row.reps, exercises[row.exercise_id].e1rm_eligible)
        assert value == (None if expected is None else pytest.approx(expected, abs=1e-3)), row.id


def test_mejor_marca_por_ejercicio() -> None:
    fixture = load("1rm-estimado")
    sets, sessions, exercises = rows(fixture)

    for exercise_id, expected in fixture["expected"]["best_e1rm"].items():
        history = group_by_session([s for s in sets if s.exercise_id == exercise_id], sessions)
        best = best_mark(history, exercises[exercise_id].e1rm_eligible)
        value = best.e1rm if best else None
        assert value == (None if expected is None else pytest.approx(expected, abs=1e-3))


def test_el_catalogo_de_los_fixtures_es_el_de_las_semillas() -> None:
    """Los fixtures copian el catálogo de api/seeds/: si cambia un factor, hay que regenerarlos
    (py fixtures/metrics/make_fixtures.py)."""
    seed = yaml.safe_load((SEEDS / "catalogo.yaml").read_text(encoding="utf-8"))["ejercicios"]
    fixture = load("rutina-semana-3")

    for exercise in fixture["exercises"]:
        assert exercise["id"] in seed, exercise["id"]
        expected = seed[exercise["id"]]
        assert {m["muscle_id"]: m["factor"] for m in exercise["muscles"]} == expected["musculos"]
        assert exercise["e1rm_eligible"] == expected.get("e1rm", True)


def test_comparar_series() -> None:
    def row(weight: float, reps: int) -> SetRow:
        return SetRow(
            id="x", session_id="s", exercise_id="e", set_number=1, weight_kg=weight, reps=reps
        )

    assert compare_sets(row(80, 9), row(80, 8), True) == "up"
    assert compare_sets(row(82.5, 6), row(80, 8), True) == "down"  # 99 contra 101,3
    # Con más de 12 repeticiones o sin 1RM: peso y después repeticiones
    assert compare_sets(row(20, 15), row(20, 14), True) == "up"
    assert compare_sets(row(10, 6), row(10, 6), False) == "same"


def test_semanas_y_rampa() -> None:
    assert week_start(date(2026, 11, 8)) == date(2026, 11, 2)
    assert week_start(date(2027, 1, 1)) == date(2026, 12, 28)
    start = date(2026, 10, 20)
    assert routine_week(start, date(2026, 10, 26)) == 1
    assert routine_week(start, date(2026, 11, 3)) == 3
    assert target_sets(3, 2, 2, routine_week(start, date(2026, 10, 27))) == 2
    assert target_sets(3, 2, 2, routine_week(start, date(2026, 11, 3))) == 3
